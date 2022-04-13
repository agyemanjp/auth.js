
CREATE DOMAIN EXTERNAL_ID AS varchar(31);
CREATE DOMAIN EMAIL_ADDR AS varchar(254);
CREATE DOMAIN OBJECT_LABEL AS varchar(255);
CREATE DOMAIN PHONE_NUMBER AS varchar(31);
CREATE DOMAIN SHORT_TEXT AS varchar(31);
CREATE DOMAIN LONG_TEXT AS varchar(4095);
CREATE TYPE USER_ACCESS_LEVEL AS ENUM ('dev', 'admin', 'regular');


CREATE TABLE users (
    _id serial PRIMARY KEY,
    id EXTERNAL_ID UNIQUE NOT NULL,
    email_address EMAIL_ADDR UNIQUE NOT NULL,
    display_name SHORT_TEXT,
	company_name OBJECT_LABEL,
	access_level USER_ACCESS_LEVEL DEFAULT 'regular' ::USER_ACCESS_LEVEL NOT NULL,
	pwd_salt varchar(255) NOT NULL,
    pwd_hash varchar(60) NOT NULL,
	verification_code varchar(255) NOT NULL,

	-- Timestamp (milliseconds since epoch) when user was verified by email
    when_verified bigint,

	-- No. of times user has accessed an app-defined resource (useful for conditionally limiting access)
	resource_access_count INTEGER,

	-- Application to which this user applies
	app SHORT_TEXT
);
CREATE VIEW users_readonly AS (
	SELECT
		id,
		email_address,
		display_name,
		company_name,
		access_level,
		when_verified,
		resource_access_count,
		app
	FROM
		users
);

CREATE TABLE resource_access_counts (
	_id serial PRIMARY KEY,
	app SHORT_TEXT NOT NULL,
	user_id EXTERNAL_ID NOT NULL REFERENCES users (id) on DELETE CASCADE,
    resource_code SHORT_TEXT NOT NULL,
    resource_type SHORT_TEXT,
	count INTEGER,
	UNIQUE (app, resource_code)
);


CREATE OR REPLACE FUNCTION select_users_readonly () RETURNS SETOF users_readonly AS $$
	BEGIN
		RETURN QUERY
		SELECT
			*      
		FROM
			users_readonly;
	END;
	$$
	LANGUAGE plpgsql
;
CREATE OR REPLACE FUNCTION select_users () RETURNS SETOF users AS $$
	BEGIN
		RETURN QUERY
		SELECT
			*      
		FROM
			users;
	END;
	$$
	LANGUAGE plpgsql
;
CREATE OR REPLACE FUNCTION insert_users (entities json) RETURNS void 
	LANGUAGE plpgsql VOLATILE AS $$
	DECLARE
		-- rec RECORD;
		DECLARE entity json;
	BEGIN
		FOR entity IN
		SELECT
			*
		FROM
			json_array_elements(entities)
			LOOP
				INSERT INTO users (
					id, 
					email_address, 
					display_name, 
					company_name, 
					access_level, 
					pwd_salt, 
					pwd_hash, 
					verification_code,
					app
				)
				VALUES (
					entity ->> 'id', 
					entity ->> 'emailAddress', 
					entity ->> 'displayName', 
					entity ->> 'companyName',
					(entity ->> 'accessLevel')::USER_ACCESS_LEVEL, 
					entity ->> 'pwdSalt', 
					entity ->> 'pwdHash', 
					entity ->> 'verificationCode', 
					entity ->> 'app'
				);
			END LOOP;
	END;
$$;
CREATE OR REPLACE FUNCTION update_users (entities json) RETURNS void 
	LANGUAGE plpgsql VOLATILE AS $$
	DECLARE
		DECLARE entity json;
	BEGIN
		FOR entity IN
		SELECT
			*
		FROM
			json_array_elements(entities)
			LOOP
				UPDATE
					users
				SET (
					id, 
					email_address, 
					display_name, 
					company_name, 
					access_level, 
					pwd_salt, 
					pwd_hash, 
					verification_code,
					when_verified,
					resource_access_count
				) = (
					entity ->> 'id', 
					entity ->> 'emailAddress', 
					entity ->> 'displayName', 
					entity ->> 'companyName',
					(entity ->> 'accessLevel')::USER_ACCESS_LEVEL, 
					entity ->> 'pwdSalt', 
					entity ->> 'pwdHash', 
					entity ->> 'verificationCode', 
					(entity ->> 'whenVerified')::BIGINT,
					entity ->> 'resourceAccessCount'
				)
				WHERE
					id = entity ->> 'id';
			END LOOP;
	END;
$$;

CREATE OR REPLACE FUNCTION log_resource_access (obj json) RETURNS resource_access_counts 
	LANGUAGE plpgsql VOLATILE AS $$
	DECLARE
		DECLARE entity json;
	BEGIN
		INSERT INTO
			resource_access_counts 
			(
				app, 
				user_id, 
				resource_code, 
				resource_type, 
				count
			)
		VALUES 
			(
				obj ->> 'app', 
				obj ->> 'userId', 
				obj ->> 'resourceCode', 
				obj ->> 'resourceType',
				1
			) 
		ON CONFLICT 
			(app, resource_code) 
		DO 
		UPDATE SET 
			count = COALESCE(EXCLUDED.count, 0) + 1
  		RETURNING *;
	END;
$$;

