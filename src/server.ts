/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable camelcase */
/* eslint-disable fp/no-mutation */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-shadow */
/* eslint-disable brace-style */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
// require('source-map-support').install({ environment: 'node' })
// eslint-disable-next-line @typescript-eslint/no-var-requires

import * as srcMapSupport from 'source-map-support'
srcMapSupport.install({ environment: 'node' })

import * as express from 'express'

import { default as session } from "express-session"
import { default as createMemoryStore } from 'memorystore'
import { default as morgan } from "morgan"
import sslRedirect from "heroku-ssl-redirect"

import { hasValue, Obj, stringify } from "@agyemanjp/standard"
import { startServer, route } from "@agyemanjp/http/server"
import { statusCodes } from "@agyemanjp/http/common"

import { UserAccessLevel, User, ResourceAccessCount } from "./types"
import { sanitizeUser } from "./utils"
import { PostgresRepository } from "./repository"
import { sendMail } from './lib/mail'

const envKeys = ["DATABASE_URL", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_HOST", "SMTP_PORT", "NODE_ENV"] as const
envKeys.forEach(key => { if (!hasValue(process.env[key])) throw `${key} env variable not found` })
const env = process.env as Obj<string, typeof envKeys[number]>

const db = new PostgresRepository({ dbUrl: env.DATABASE_URL })

export const serverRoutes = ({
	findUser: route
		.get
		.url("/:app/users/:id")
		.queryType<{}>()
		.returnType<User>()
		.handler(async (args) => {
			const users = await db
				.getAsync("usersReadonly", {
					filters: [
						{
							fieldName: "userId",
							operator: "equals",
							value: args.id
						},
						{
							fieldName: "app",
							operator: "equals",
							value: args.app
						}
					]
				})
			if (users.length > 0)
				return users[0] as User
			else
				throw `The requested resource could not be found but may be available in the future.`
			// statusCodes.NOT_FOUND
		}),

	verify: route
		.post
		.url("/:app/verify")
		.bodyType<{ emailAddress: string, verificationCode: string, accessLevel: UserAccessLevel }>()
		.returnType<User>()
		.handler(async (args) => {
			const { emailAddress, verificationCode, accessLevel } = args
			const users = await db.getAsync("users", {
				filters: [
					{ fieldName: "emailAdress", operator: "equals", value: emailAddress },
					{ fieldName: "verificationCode", operator: "equals", value: verificationCode }
				]
			})
			console.log(`Users matching verification found: ${stringify(users)}`)

			if (users.length > 0) {
				const updatedUser = {
					...users[0],
					whenVerified: Date.now(),
					...(accessLevel ? { accessLevel: accessLevel } : {}
					)
				} as User
				await db.updateAsync("usersReadonly", updatedUser)
				return sanitizeUser(updatedUser)
			}
			else {
				throw (statusCodes.NOT_FOUND.toString())
			}
		}),

	register: route
		.post
		.url("/:app/register")
		.bodyType<User & { password?: string | undefined; verificationCode: string }>()
		.returnType<User>()
		.handler(async (args) => {
			console.log(`Starting user registration for ${stringify(args)} in auth service`)
			try {
				await db.extensions.auth.registerAsync(args)
				console.log(`User ${stringify(args)} registered by auth service}`)
				sendMail({
					from: "noreply@nxthaus.com",
					to: args.emailAddress,
					subject: "Email Verification",
					text: `Hello ${args.displayName},`
						+ `\nPlease click this link (or copy and paste it in your browser address bar and enter) `
						+ `to verify your new account:\n${args.app}/verify`
				})
				return (sanitizeUser(args))
			}
			catch (err) {
				throw (statusCodes.FORBIDDEN)
			}
		}),

	authenticate: route
		.get
		.url("/:app/authenticate")
		.headersType<{ email: string, pwd: string }>()
		.returnType<User>()
		.handler(async (args) => {
			// console.log(`Handling API repo Find with body ${stringify()}`)
			const user = await db.extensions.auth.authenticateAsync(
				{ email: String(args["email"]), pwd: String(args["pwd"]) },
				args.app
			)

			if (user)
				return (user as User)
			else
				throw (statusCodes.FORBIDDEN)
		}),

	deactivate: route
		.delete
		.url("/:app/deactivate/:id")
		.queryType<Obj<never>>()
		.returnType<null>()
		.handler(async (args) => {
			// console.log(`Handling API repo DELETE with entity = ${entity} and id = ${stringify(req.params.id)}`)
			return db
				.deleteAsync("users", args.id)
				.then(() => null)
				.catch(err => {
					console.error(err)
					throw (statusCodes.INTERNAL_SERVER_ERROR)
				})
		}),

	logResourceAccess: route
		.post
		.url("/:app/res_access_counts")
		.bodyType<{ userId: string, resourceCode: string, resourceType: string }>()
		.returnType<ResourceAccessCount>()
		.handler(async (args) => {
			console.log(`Starting access logging for ${stringify(args)}`)
			try {
				const ret = await db.extensions.logAccessAsync({
					userId: String(args.userId),
					resourceCode: String(args.resourceCode),
					resourceType: String(args.resourceType),
					app: args.app
				})
				console.log(`Access logged for ${stringify(args)}`)
				return (ret)
			}
			catch (err) {
				throw statusCodes.FORBIDDEN
			}
		}),

	getResourceAccess: route
		.get
		.url("/:app/res_access_counts")
		.queryType<{ user_id: string, resource_code: string }>()
		.returnType<ResourceAccessCount[]>()
		.handler(async (args) => {
			// console.log(`Starting access logging for ${stringify(req.body)}`)
			try {
				const counts = await db.getAsync("resourceAccessCounts", {
					filters: [
						{
							fieldName: "userId",
							operator: "equals",
							value: String(args.user_id)
						},
						{
							fieldName: "resourceCode",
							operator: "equals",
							value: String(args.resource_code)
						},
						{
							fieldName: "app",
							operator: "equals",
							value: args.app
						}
					]
				})
				return counts
			}
			catch (err) {
				throw statusCodes.FORBIDDEN
			}
		}),

	default: route
		.get
		.url('/*')
		.queryType<Obj<never>>()
		.returnType<null>()
		.handler((args) => {
			console.warn(`Handling unknown API route ${args.url}`)
			throw statusCodes.NOT_FOUND
		})
}) as const

startServer({
	name: "auth",
	routes: [
		// Middleware
		morgan('tiny', { skip: (req: any) => req.baseUrl === "/static" }), // Set up request logging
		express.urlencoded({ extended: true }), // Parse URL-encoded bodies
		express.json({ limit: "20mb" }),
		session({
			resave: false,
			rolling: true,
			store: new (createMemoryStore(session))({
				checkPeriod: 86400000 // prune expired entries every 24h
			}),
			// store: new SessionFileStorage({ path: './sessions/', /* secret: "" */ }),
			secret: process.env.SESSION_SECRET || "nthsfweqweioyfqw",
			cookie: { secure: false/*, maxAge: 1000 , httpOnly: false*/ },
			saveUninitialized: false,
		}),
		sslRedirect(),

		// API
		serverRoutes.register,
		serverRoutes.verify,
		serverRoutes.authenticate,
		serverRoutes.deactivate,
		serverRoutes.logResourceAccess,
	],
	port: 49722
})

// start server 
/*(() => {
	configureEnvironment()
	const APP_NAME = "auth"
	const PORT = process?.env?.PORT || "49722"

	const sockets: Obj<Net.Socket> = {}

	// console.log(`process.env.DATABASE_URL: ${process.env.DATABASE_URL} `)
	const dbRepo = new PostgresRepository({ dbUrl: process.env.DATABASE_URL! })
	const app = appFactory(dbRepo)

	console.log(`\n${APP_NAME} server starting...`)
	const server = app.listen(PORT, () => {
		console.log(`${APP_NAME} server started on port ${PORT} at ${new Date().toLocaleString()} \n`, true)
	})
	server.on('connection', socket => {
		const socketId = cuid()
		// eslint-disable-next-line fp/no-delete
		socket.on('close', () => delete sockets[socketId])
		sockets[socketId] = socket
	})

	const cleanShutdown = (reason: unknown, error?: unknown) => {
		if (error)
			console.error(`\n${APP_NAME} server shutting down due to: ${reason}\n${error instanceof Error ? error.stack : error}`)
		else
			console.warn(`\n${APP_NAME} server shutting down due to: ${reason}`)

		server.close(() => {
			console.log(`${APP_NAME} server closed\n`)
			process.exit(error === undefined ? 0 : 1)
		})

		Object.keys(sockets).forEach(socketId => {
			sockets[socketId].destroy()
			//console.log('socket', socketId, 'destroyed')
		})
	}

	process.on('unhandledRejection', (reason: unknown) => cleanShutdown(`Unhandled rejection`, reason))
	process.on('uncaughtException', (err: Error) => cleanShutdown(`Uncaught exception`, err))
	process.on('SIGTERM', (signal) => cleanShutdown(signal))
	process.on('SIGINT', (signal) => cleanShutdown(signal))
})()
*/

/*const prx = routes.verify[3]
const x = prx("auth.com/:cat/api")({
	emailAddress: "",
	verificationCode: "",
	accessLevel: userAccessLevels.ADMIN,
	app: "bexthaus",
	cat: ""
})*/


/*
app.get("/:app/users", (req, res) => {
	// console.log(`Handling API repo Get with entity = ${entity} and body ${stringify(req.body)}`)
	const filters = req.query.filter ? JSON.parse(req.query.filter as string) : undefined
	return dbRepository
		.getAsync("usersReadonly", filters)
		.then(res.json.bind(res))
		.catch(err => {
			console.error(err)
			res.status(httpStatusCodes.INTERNAL_SERVER_ERROR).send()
		})
})
app.get("/:app/users/:id", (req, res) => {
	// console.log(`Handling API repo Find with body ${stringify(req.body)}`)
	return dbRepository
		.findAsync("usersReadonly", req.params["id"])
		.then(res.json.bind(res))
		.catch(err => {
			console.error(err)
			res.status(httpStatusCodes.INTERNAL_SERVER_ERROR).send()
		})
})
app.post("/:app/users/:id", (req, res) => {
	// console.log(`Handling API repo POST with body ${stringify(req.body)}`)
	return dbRepository
		.insertAsync("users", req.body)
		.then(() => res.send())
		.catch(err => {
			console.error(err)
			res.status(httpStatusCodes.INTERNAL_SERVER_ERROR).send()
		})
})
app.put("/:app/users/:id", (req, res) => {
	// console.log(`Handling API repo PUT with body ${stringify(req.body)}`)
	return dbRepository
		.updateAsync("users", req.body)
		.then(() => res.send())
		.catch(err => {
			console.error(err)
			res.status(httpStatusCodes.INTERNAL_SERVER_ERROR).send()
		})
})
*/