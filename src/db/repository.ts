/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable brace-style */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable camelcase */

import * as bcrypt from "bcryptjs"
import { default as pgPromise } from "pg-promise"

import {
	Obj, Tuple, Filter, FilterSimple, FilterGroup, FilterGroupSimple,
	toSnakeCase, toCamelCase,
	objectFromTuples, entries,
	hasValue, stringify
} from "@agyemanjp/standard"
import { generateRepoGroupClass } from "@agyemanjp/storage"
import { schema, EntityModel } from "./schema"
// import { , uid } from "./utils"
import { User } from "./types"

export const PostgresRepository = generateRepoGroupClass(
	schema,

	(config: { dbUrl: string, maxRows?: number }) => {
		const db: pgPromise.IDatabase<unknown> = pgPromise({})({
			ssl: { rejectUnauthorized: false },
			query_timeout: 10000, connectionString: config.dbUrl,
			connectionTimeoutMillis: 10000
		})
		db.$config.pgp.pg.types.setTypeParser(20, parseInt)

		const pgErrorsCode = {
			UNIQUE_VIOLATION: "23505",
			NOT_NULL_VIOLATION: "23502"
		}

		const prErrorClasses = {
			"23": "Integrity Constraint Violation",
			"XX": "Internal Error",
			"58": "System Error",
			"54": "Program Limit Exceeded",
			"53": "Insufficient Resources",
		}

		/** Turn the input value into a string that can be directly interpolated into an sql string */
		function interpolatableValue(value: Exclude<DbPrimitive, null>): string {
			return typeof value === "number" ? `${value}` : `'${String(value)}'`
		}
		/** Turn the input column name into a string that can be directly interpolated into an sql string */
		function interpolatableColumnName(columnName: string): string {
			return toSnakeCase(columnName).toLowerCase()
		}
		/** Turn the input rowset (table, view, tablevalued UDF, etc) name into a string that can be directly interpolated into an sql string */
		function interpolatableRowsetName(rowsetName: string, operation: "select" | "insert" | "update" | "delete" = "select"): string {
			return `${operation}_${toSnakeCase(rowsetName).toLowerCase()}`
		}

		function predicateTemplates(): Obj<undefined | ((column: string, value?: any) => string), Required<Filter>["operator"]> {
			return {
				equals: (col, val) => val !== undefined && val !== null
					? `${col} = ${interpolatableValue(val)}`
					: `${col} is NULL`,
				not_equal_to: (col, val) => val !== undefined && val !== null
					? `${col} <> ${interpolatableValue(val)}`
					: `${col} IS NOT NULL`,
				greater_than: (col, val) => val !== undefined && val !== null
					? `${col} > ${interpolatableValue(val)}`
					: `(false)`,
				less_than: (col, val) => val !== undefined && val !== null
					? `${col} < ${interpolatableValue(val)}`
					: `(false)`,
				greater_than_or_equals: (col, val) => val !== undefined && val !== null
					? `${col} >= ${interpolatableValue(val)}`
					: `(false)`,
				less_than_or_equals: (col, val) => val !== undefined && val !== null
					? `${col} <= ${interpolatableValue(val)}`
					: `(false)`,
				contains: (col, val) => val !== undefined && val !== null
					? `POSITION(${val} in ${col}) > 0`
					: `(false)`,
				ends_with: (col, val) => val !== undefined && val !== null
					? `${col} like ${interpolatableValue('%' + String(val))}`
					: `${col} like ${interpolatableValue('')}`,
				starts_with: (col, val) => val !== undefined && val !== null
					? `${col} like ${interpolatableValue(String(val))}`
					: `${col} like ${interpolatableValue('')}`,
				is_outlier_by: undefined,
				is_blank: (col) => `${col} IS NULL`,
				// is_contained_in: `POSITION(${} in ${x}) `,
				is_contained_in: (col, val) => val !== undefined && val !== null
					? `POSITION(${col} in ${val}) > 0`
					: `(false)`,
				in: (col, val) => Array.isArray(val) && val.length > 0
					? `${col} IN (${val.join(", ")})`
					: `(false)`
			}
		}
		function getWhereClause(filter?: FilterSimple | FilterGroupSimple): string {
			const filterGroup = filter
				? "fieldName" in filter
					? { filters: [filter] }
					: filter
				: undefined


			return !filterGroup || filterGroup.filters.length == 0
				? `1=1` // placeholder tautology
				: filterGroup.filters
					.map(f => {
						if ('fieldName' in f) { // this is a Filter object, not a FilterGroup
							const exprTemplate = predicateTemplates()[f.operator]
							if (exprTemplate === undefined)
								throw (`SQL Filtering operator "${f.operator}"`)
							const effColumnName = interpolatableColumnName(f.fieldName)
							const predicate = exprTemplate(effColumnName, f.value)
							return `${f.negated ? "NOT " : ""}${predicate}`
						}
						else {
							// console.log(`Recursive call to getWhereClause on ${JSON.stringify(f)}`)
							return `(${getWhereClause(f)})`
						}
					})
					.join(` ${(filterGroup.combinator as string ?? "and")} `)
		}
		function appObject<T extends Obj>(entity: string, dbObject: T) {
			const newObj = objectFromTuples(entries(dbObject)
				// exclude keys that begin with underscore, 
				// since their conversion to camel case is not reversible
				// such keys represent db-internal-only properties anyway 
				.filter(keyVal => !keyVal[0].startsWith("_"))
				.map(keyVal => {
					const key = keyVal[0]
					const val = keyVal[1]

					const newVal = val === null
						// Postgres always stores undefined values as 'null'; convert to undefined
						? undefined
						: Array.isArray(val)
							// NULL in postgres arrays should not appear in app
							// And arrays should be converted into CSV
							? val.filter((el) => el !== "NULL").join(",")
							: val
					return new Tuple(toCamelCase(key), newVal)
				})) as T

			return { ...newObj/*, objectType: entity */ }
		}

		return {
			findAsync: async function (args) {
				const rowsetName = interpolatableRowsetName(args.entity)
				const whereClause = getWhereClause({
					fieldName: schema[args.entity].idField,
					operator: "equals",
					value: args.id
				})

				return db
					.one({ text: `SELECT * FROM ${rowsetName}() WHERE ${whereClause}`, })
					.then(entity => appObject(args.entity, entity))
					.catch(err => { throw (`Postgres repository findAsync of ${args.entity}\n${err.message}`) })
			},

			getAsync: async function (args) {
				const rowSetFn = interpolatableRowsetName(args.entity)
				const whereClause = args.filter ? getWhereClause(args.filter) : `1=1`
				const sql = `SELECT * FROM ${rowSetFn}() WHERE ${whereClause} LIMIT ${config.maxRows ?? 1000}`
				console.log(`Postgres running sql "${sql}"`)
				return db
					.any({ text: sql })
					.then(entities => {
						const data = entities.map(obj => ({ ...appObject(args.entity, obj) }))
						// if (args.entity === "categoryFields") {
						// 	logWarning(`PG getAsync returing ${stringify(data)} for ${args.entity}`)
						// }
						return data
					})
					.catch(err => {
						// console.log(stringify(err))
						throw `Postgres repository getAsync of ${args.entity}\n${err.message}`
					})
			},

			insertAsync: async function (args) {
				if (!args.obj)
					throw `Postgres repository insertAsync(): Object to update is missing`

				return db
					.query({
						text: `SELECT * from ${interpolatableRowsetName(args.entity, "insert")}($1) as result`,
						values: [JSON.stringify([args.obj])]
					})
					.then(x => { console.log(`Response from pG insert of ${stringify(args)}: ${stringify(x)}`) })
					.catch(err => {
						if (err.code == pgErrorsCode.UNIQUE_VIOLATION)
							throw `Data duplication`
						else
							throw `Could not insert ${args.entity}: ${err.message}`
					})

			},

			updateAsync: async function (args) {
				if (!args.obj)
					throw new Error(`updateAsync(): Object to update is missing`)
				const rowsetName = interpolatableRowsetName(args.entity, "update")

				return db
					.query({
						text: `SELECT * from ${rowsetName}($1) as result`,
						values: [JSON.stringify([args.obj])]
					})
					.catch(err => {
						if (err.code == pgErrorsCode.UNIQUE_VIOLATION)
							throw new Error(`Data duplication`, {})
						else
							throw new Error(`Could not insert ${args.entity}: ${err.message}`)
					})
			},

			deleteAsync: async function (args) {
				// console.log(`Deleting ${new Date().getTime()}`)
				const stmt = `delete from ${args.entity} where id=$1`
				// console.log(`pg repository: delete sql to be executed: "${stmt}"`)
				await db.none(stmt, [args.id])
			},

			runAsync: async function (operation, args) {
				if (!hasValue(operation))
					throw new Error(`runAsync(): operation argument is missing`)
				if (!args)
					throw new Error(`runAsync(): args argument is missing`)

				return db
					.query({
						text: `SELECT * from ${operation}($1) as result`,
						values: args
					})
					.catch(err => {
						if (err.code == pgErrorsCode.UNIQUE_VIOLATION)
							throw new Error(`Data duplication`, {})
						else
							throw new Error(`Error invoking function ${operation}: ${err.message}`)
					})
			}
		}
	},

	(io) => ({
		auth: {
			authenticateAsync: async (credentials: { email: string, pwd: string }, appName: string): Promise<EntityModel["usersReadonly"] | undefined> => {
				// log(`Authenticating user '${credentials.email}'`)
				const dbUser = (await io.getAsync({
					entity: "users" as const,
					filter: {
						filters: [
							{ fieldName: "emailAddress", operator: "equals", value: credentials.email },
							{ fieldName: "app", operator: "equals", value: appName },
							{ fieldName: "whenVerified", operator: "is_blank", value: undefined, negated: true }
						],
						combinator: "AND"
					}
				}))[0]
				if (!dbUser)
					return undefined

				const { pwdHash, pwdSalt, ...readonlyUser } = dbUser
				return new Promise((resolve, reject) => {
					bcrypt.compare(credentials.pwd, pwdHash as any, (err: Error, result: boolean) => {
						if (result === true) {
							resolve(readonlyUser as User)
						}
						else {
							// error(String(err))
							reject(err)
						}
					})
				})
			},
			registerAsync: async (args: EntityModel["usersReadonly"] & { password?: string, verificationCode: string }): Promise<void> => {
				try {
					const { password, ...user } = args
					if (!password)
						throw new Error(`Cannot register user without password`)
					const pwdSalt = bcrypt.genSaltSync()
					const pwdHash = bcrypt.hashSync(password, pwdSalt)
					const verificationCode = args.verificationCode
					const userToBeRegistered = { ...user, pwdHash, pwdSalt, verificationCode, whenVerified: null }
					await io.insertAsync({ entity: "users", obj: userToBeRegistered })

					console.log(`User registered, sending verification email`)
				}
				catch (err) {
					console.error(String(err))
					throw err
				}
			},
			verifyAsync: async (args: { emailAddress: string, verificationCode: string, accessLevel?: number }, appName: string): Promise<EntityModel["usersReadonly"] | undefined> => {
				const { emailAddress, verificationCode, accessLevel } = args
				const users = await io.getAsync({
					entity: "users",
					filter: {
						filters: [
							{ fieldName: "emailAdress", operator: "equals", value: emailAddress },
							{ fieldName: "app", operator: "equals", value: appName },
							{ fieldName: "verificationCode", operator: "equals", value: verificationCode }
						]
					}
				})
				console.log(`Users matching verification found: ${stringify(users)}`)

				if (users.length > 0) {
					await io.updateAsync({
						entity: "users",
						obj: {
							...users[0],
							whenVerified: Date.now(),
							...(accessLevel
								? { accessLevel }
								: {}
							)
						}
					})

					return users[0] as User
				}
				else
					return undefined

			},
			updatePwdAsync: async (id: string, newPassword: string): Promise<void> => {
				const pwdSalt = bcrypt.genSaltSync()
				const pwdHash = bcrypt.hashSync(newPassword, pwdSalt)

				// log(`Calling findAsync from extensions.updatePwdAsync...`)
				const user = await io.findAsync({ entity: "users", id })
				return await io.updateAsync({ entity: "users", obj: { ...user, pwdHash, pwdSalt } })
			},
			unregisterAsync: async (id: string) => io.deleteAsync({ entity: "users", id }),
		},
		users: {
			findAsync: async (userid: string) => {
				// log(`Calling findAsync from extensions.users.findAsync...`)
				return io.findAsync({ entity: "usersReadonly", id: userid })
			},
			updateAsync: async (obj: EntityModel["users"]) => io.updateAsync({ entity: "users", obj }),
		},
		logAccessAsync: async (obj: Omit<EntityModel["resourceAccessCounts"], "count">): Promise<EntityModel["resourceAccessCounts"]> => {
			console.log(`Logging resource access '${stringify(obj)}'`)
			try {
				return await io.runAsync("log_resource_access", obj)
			}
			catch (err) {
				console.error(String(err))
				throw err
			}
		}
	})
)

type DbPrimitive = string | number | boolean | null


// repoFn({}).categories.insertAsync([])
// new PostgresRepoitory({ dbUrl: "" }).extensions.auth.authenticateAsync({ email: "", pwd: "" })
// new PostgresRepoitory({ dbUrl: "" }).getAsync("categories", undefined, true).then(cats => cats[0].parsingEndpoint)

// const repo = PGRepository({ dbUrl: "" })
// const e = repo.extensions






