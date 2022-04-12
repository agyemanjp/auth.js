/* eslint-disable fp/no-mutation */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-shadow */
/* eslint-disable brace-style */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
// require('source-map-support').install({ environment: 'node' })
// eslint-disable-next-line @typescript-eslint/no-var-requires

import * as srcMapSupport from 'source-map-support'
srcMapSupport.install({ environment: 'node' })
import { config as configureEnvironment } from "dotenv"

import * as Net from 'net'

import * as express from 'express'
import { default as session } from "express-session"
import { default as createMemoryStore } from 'memorystore'
import { default as morgan } from "morgan"
import sslRedirect from "heroku-ssl-redirect"
const MemoryStore = createMemoryStore(session)

import { Obj, HTTP_STATUS_CODES as httpStatusCodes, stringify } from "@agyemanjp/standard"

import { PostgresRepository } from "./repository"
import { uid, logNotice, logWarning, logError } from "./utils"
// import { DbUser } from "./types"


(() => { // start server 
	configureEnvironment()
	const APP_NAME = "auth"
	const PORT = process?.env?.PORT || "49722"

	const sockets: Obj<Net.Socket> = {}

	// logNotice(`process.env.DATABASE_URL: ${process.env.DATABASE_URL} `)
	const dbRepo = new PostgresRepository({ dbUrl: process.env.DATABASE_URL! })

	const app = createApp(dbRepo)

	logNotice(`\n${APP_NAME} server starting...`)
	const server = app.listen(PORT, () => {
		logNotice(`${APP_NAME} server started on port ${PORT} at ${new Date().toLocaleString()} \n`, true)
	})
	server.on('connection', socket => {
		const socketId = uid()
		// eslint-disable-next-line fp/no-delete
		socket.on('close', () => delete sockets[socketId])
		sockets[socketId] = socket
	})

	const cleanShutdown = (reason: unknown, error?: unknown) => {
		if (error)
			logError(`\n${APP_NAME} server shutting down due to: ${reason}\n${error instanceof Error ? error.stack : error}`)
		else
			logWarning(`\n${APP_NAME} server shutting down due to: ${reason}`)

		server.close(() => {
			logNotice(`${APP_NAME} server closed\n`)
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


/** Create and return the server app with middleware and routes applied to it */
function createApp(dbRepository: InstanceType<typeof PostgresRepository>) {
	// logNotice(`Creating app...`)
	const app = express.default()

	// middlware 
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	app.use(morgan('tiny', { skip: (req: any) => req.baseUrl === "/static" })) // set up request logging
	app.use(express.urlencoded({ extended: true })) //Parse URL-encoded bodies
	app.use(express.json({ limit: "20mb" }))
	app.use(session({
		resave: false,
		rolling: true,
		store: new MemoryStore({
			checkPeriod: 86400000 // prune expired entries every 24h
		}),
		// store: new SessionFileStorage({ path: './sessions/', /* secret: "" */ }),
		secret: process.env.SESSION_SECRET || "nthsfweqweioyfqw",
		cookie: { secure: false/*, maxAge: 1000 , httpOnly: false*/ },
		saveUninitialized: false,
	}))
	app.use(sslRedirect())

	// api routes
	app.get("/:app/users", (req, res) => {
		// logNotice(`Handling API repo Get with entity = ${entity} and body ${stringify(req.body)}`)
		const filters = req.query.filter ? JSON.parse(req.query.filter as string) : undefined
		return dbRepository
			.getAsync("usersReadonly", filters)
			.then(res.json.bind(res))
			.catch(err => {
				logError(err)
				res.status(httpStatusCodes.INTERNAL_SERVER_ERROR).send()
			})
	})
	app.get("/:app/users/:id", (req, res) => {
		// logNotice(`Handling API repo Find with body ${stringify(req.body)}`)
		return dbRepository
			.findAsync("usersReadonly", req.params["id"])
			.then(res.json.bind(res))
			.catch(err => {
				logError(err)
				res.status(httpStatusCodes.INTERNAL_SERVER_ERROR).send()
			})
	})

	app.post("/:app/users/:id", (req, res) => {
		// logNotice(`Handling API repo POST with body ${stringify(req.body)}`)
		return dbRepository
			.insertAsync("users", req.body)
			.then(() => res.send())
			.catch(err => {
				logError(err)
				res.status(httpStatusCodes.INTERNAL_SERVER_ERROR).send()
			})
	})
	app.post("/:app/verifications", async (req, res) => {
		const { emailAddress, verificationCode, accessLevel } = req.body
		const users = await dbRepository.getAsync("users", {
			filters: [
				{ fieldName: "emailAdress", operator: "equals", value: emailAddress },
				{ fieldName: "verificationCode", operator: "equals", value: verificationCode }
			]
		})
		logNotice(`Users matching verification found: ${stringify(users)}`)

		if (users.length > 0) {
			const updatedUser = {
				...users[0],
				whenVerified: Date.now(),
				...(accessLevel ? { accessLevel } : {}
				)
			}
			await dbRepository.updateAsync("users", updatedUser)

			const sanitizedUser = {
				...updatedUser,
				pwdHash: undefined,
				pwdSalt: undefined,
				verificationCode: undefined
			}
			res.status(httpStatusCodes.OK).json(sanitizedUser)
		}
		else {
			res.status(httpStatusCodes.FORBIDDEN).send()
		}
	})

	app.put("/:app/users/:id", (req, res) => {
		// logNotice(`Handling API repo PUT with body ${stringify(req.body)}`)
		return dbRepository
			.updateAsync("users", req.body)
			.then(() => res.send())
			.catch(err => {
				logError(err)
				res.status(httpStatusCodes.INTERNAL_SERVER_ERROR).send()
			})
	})

	app.delete("/:app/users/:id", (req, res) => {
		// logNotice(`Handling API repo DELETE with entity = ${entity} and id = ${stringify(req.params.id)}`)
		return dbRepository
			.deleteAsync("users", req.params.id)
			.then(() => res.send())
			.catch(err => {
				logError(err)
				res.status(httpStatusCodes.INTERNAL_SERVER_ERROR).send()
			})
	})

	app.get("/:app/authenticate", async (req, res) => {
		// logNotice(`Handling API repo Find with body ${stringify()}`)
		const user = await dbRepository.extensions.auth.authenticateAsync(
			{
				email: String(req.headers["email"]),
				pwd: String(req.headers["pwd"])
			},
			req.params.app
		)

		if (user)
			res.status(httpStatusCodes.OK).json(user)
		else
			res.status(httpStatusCodes.FORBIDDEN).send()
	})
	app.post("/:app/register", async (req, res) => {
		// logNotice(`Handling API repo Find with body ${stringify()}`)
		try {
			await dbRepository.extensions.auth.registerAsync(req.body)
			res.status(httpStatusCodes.OK).send()
		}
		catch (err) {
			res.status(httpStatusCodes.FORBIDDEN).send(err)
		}
	})

	// default route
	app.get('/*', (req, res) => {
		logWarning(`Handling unknown API route ${req.url}`)
		res.status(httpStatusCodes.NOT_FOUND).send()
	})

	return app
}



