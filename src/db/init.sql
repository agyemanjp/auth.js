
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

	-- Application to which this user applies
	app SHORT_TEXT
);
CREATE VIEW users_simple AS (
	SELECT
		id,
		email_address,
		display_name,
		company_name,
		access_level,
		when_verified,
		app
	FROM
		users
);

CREATE OR REPLACE FUNCTION select_users_readonly () RETURNS SETOF users_simple AS $$
	BEGIN
		RETURN QUERY
		SELECT
			*      
		FROM
			users_simple;
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
		rec RECORD;
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
		rec RECORD;
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
					when_verified
				) = (
					entity ->> 'id', 
					entity ->> 'emailAddress', 
					entity ->> 'displayName', 
					entity ->> 'companyName',
					(entity ->> 'accessLevel')::USER_ACCESS_LEVEL, 
					entity ->> 'pwdSalt', 
					entity ->> 'pwdHash', 
					entity ->> 'verificationCode', 
					(entity ->> 'whenVerified')::BIGINT
				)
				WHERE
					id = entity ->> 'id';
			END LOOP;
	END;
$$;