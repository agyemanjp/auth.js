/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/ban-types */
import * as express from 'express'
import { default as passport } from 'passport'
import { default as passportLocal } from "passport-local"
import { Obj, hasValue, ArgsType } from "@agyemanjp/standard"
import { Method, statusCodes, proxy, route, request, clientRoute, Route, RouteFinal } from "@agyemanjp/http"
import { default as cuid } from "cuid"


import { User, UserAccessLevel, userAccessLevels } from "./types"
import { EntityModel } from "./schema"
import * as server from "./server"
import { } from "./utils"

export const uid = () => "_" + cuid().substring(1)


// export default (authURL: string, appName: string) => {

export const middleware: express.Handler[] = [
	passport.initialize(),
	// // initialize & set up passport session (e.g., req.user)
	passport.session(),
]

export const endpointsFactory = (authURL: string, appName: string) => ({
	signup: {
		method: "post",
		url: "/register",
		handler: (async (req, res, next) => {
			// console.log(`Request body sent to signup post: ${stringify(req.body)}`)
			passport.authenticate('local-signup', (errAuth, user, info) => {
				if (errAuth || !user) {
					const msg = `Signup failed for ${req.body.email_addr}`
					console.error(errAuth ?? info.message)
					res.status(statusCodes.BAD_REQUEST).send(msg)
				}
				else {
					// log(`About to req.logIn(user...`)
					req.logIn(user, async (errLogin) => {
						if (errLogin) {
							res.status(statusCodes.UNAUTHORIZED).send(`Login failed for user ${user}: ${errLogin}`)
						}
						else {
							// log(`User logged in after signup`)

							if (req.session) req.session.cookie.maxAge = 5184000000
							if (req.headers["accept"] === "application/json") {
								return (user)
							}
							else {
								res.redirect(String(req.query.return_url) ?? "/")
							}
						}
					})
				}
			})(req, res, next)
		}) as express.Handler,
		proxy: server.routes.register.proxyFactory("", {})
	},

	login: {
		method: "post",
		url: "/login",
		handler: ((req, res, next) => {
			// console.log(`Request body sent to login post: ${stringify(req.body)}`)
			passport.authenticate('local-login', (errAuth, user, info) => {
				if (errAuth || !user) {
					const msg = `Login failed for '${req.body.email_addr}'`
					console.error(errAuth ?? info.message)
					res.status(statusCodes.BAD_REQUEST).send(msg)
				}
				else {
					// eslint-disable-next-line no-shadow
					req.logIn(user, async (err) => {
						if (err) {
							res.status(400).send(`Login failed: ${err}`)
						}
						else {
							if (req.session) {
								// eslint-disable-next-line fp/no-mutation
								req.session.cookie.maxAge = req.body.remember === "true"
									? 5184000000 /* 2 months */
									: 900000 /* 15 minutes */
							}
							res.redirect(req.query && hasValue(req.query.return_url)
								? String(req.query.return_url)
								: "/"
							)
						}
					})
				}
			})(req, res, next)
		}) as express.Handler,
		proxy: server.routes.authenticate.proxyFactory(authURL, { app: appName })
	},

	logout: {
		method: "get",
		url: "/logout",
		handler: ((req, res, next) => {
			// console.log(`Logging out via GET`)
			req.logOut()
			res.redirect('/')
		}) as express.Handler,
		proxy: undefined as any
	},

	verify: clientRoute(server.routes.verify, authURL, { app: appName }),
	deactivate: clientRoute(server.routes.deactivate, authURL, { app: appName }),
	logResourceAccess: clientRoute(server.routes.logResourceAccess, authURL, { app: appName }),
	getResourceAccess: clientRoute(server.routes.getResourceAccess, authURL, { app: appName })
}) as const

const _endpoints: Obj<RouteFinal> = endpointsFactory("", "")

// endpoints("", "").login.proxy({})
/*const proxies = () => ({
	verify: proxy.post
		.route("/:app/verify")
		.bodyType<{ emailAddress: string, verificationCode: string, accessLevel: UserAccessLevel }>()
		.returnType<User>(),

	authenticate: proxy.get
		.route("/:app/authenticate")
		.headersType<{ email: string, pwd: string }>()
		.returnType<User>(),

	deactivate: proxy.delete
		.route("/:app/deactivate/:id")
		.queryType<{}>()
		.returnType<{}>(),

	logResourceAccess: proxy.post
		.route("/:app/res_access_counts")
		.bodyType<{ userId: string, resourceCode: string, resourceType: string }>()
		.returnType<EntityModel["resourceAccessCounts"]>()
})*/

export function configurePassport(authBaseUrl: string, app: string) {
	// construct & configure passport instance
	/** Configure and return passport with db authentication middleware */

	passport.serializeUser<string>((user, done) => { done(null, (user as User).id) })
	passport.deserializeUser<string>(async (id, done) => {
		try {
			const userPromise = server.routes.findUser.proxyFactory(authBaseUrl, { app })({ id })
			const userInfo = await userPromise
			if ("data" in userInfo) {
				// log(`Deserialized user '${JSON.stringify(user)}'`)
				return done(null, userInfo.data)
			}
			else {
				return done(`Error deserializing user ${id} from Db:\n${userInfo.error}`, undefined)
			}
		}
		catch (err) {
			return done(`Error deserializing user ${id} from Db:\n${err}`, undefined)
			// return done(err, false)
		}
	})

	passport.use('local-login', new passportLocal.Strategy(
		{ usernameField: 'email_addr', passwordField: 'password', passReqToCallback: true },
		async (req, email, pwd, done) => {
			if (!email) throw ("email not supplied to local-login strategy")
			if (!pwd) throw ("password not supplied to local-login strategy")
			try {
				const userInfo = await server.routes.authenticate.proxyFactory(authBaseUrl, { app })({ email, pwd })
				if ("data" in userInfo) {
					return done(null, userInfo.data)
				}
				else {
					return done(userInfo.error, false, { message: 'Incorrect password or email' })
				}
			}
			catch (err) {
				// return done(err, false)
				return done(err, false, { message: 'Incorrect password or email' })
			}
		})
	)
	passport.use('local-signup', new passportLocal.Strategy(
		{ usernameField: 'email_addr', passwordField: 'password', passReqToCallback: true },
		async (req, email, pwd, done) => {
			try {
				const user = {
					id: uid(),
					accessLevel: userAccessLevels.REGULAR,
					emailAddress: email,
					displayName: req.body['display_name'],
					companyName: "", //req.body['company_name'],
					whenVerified: null,
					password: pwd,
					app: app
				}
				// log(`New user to be signed up: ${stringify(user)}`)
				const verificationCode = uid()
				const verificationURL = `https://${req.get('host')}/verify?email=${email}&code=${verificationCode}`
				console.log(`New user verification url: ${verificationURL}`)

				const result = await server.routes.register.proxyFactory(authBaseUrl, { app })({
					...user,
					verificationCode,
					// url: verificationURL			
				})

				if ("error" in result) {
					return done(result.error, null)
				}
				else {
					return done(null, result.data)
				}
			}
			catch (err) {
				// return done(err, false)
				return done(err, false, { message: `Could not signup user "${email}"` })
			}
		})
	)

	return passport
}
// }


/*export const appAuthRoutesFactory = (authURL: string, appName: string): [Lowercase<Method> | "use", string, express.Handler][] => {
	configurePassport(authURL, appName)
	return [
		["use", "", passport.initialize()],
		["use", "", passport.session()], // initialize & set up passport session (e.g., req.user)

		["post", "/signup", async (req, res, next) => {
			// console.log(`Request body sent to signup post: ${stringify(req.body)}`)
			passport.authenticate('local-signup', (errAuth, user, info) => {
				if (errAuth || !user) {
					const msg = `Signup failed for ${req.body.email_addr}`
					console.error(errAuth ?? info.message)
					res.status(statusCodes.BAD_REQUEST).send(msg)
				}
				else {
					// log(`About to req.logIn(user...`)
					req.logIn(user, async (errLogin) => {
						if (errLogin) {
							res.status(statusCodes.UNAUTHORIZED).send(`Login failed for user ${user}: ${errLogin}`)
						}
						else {
							// log(`User logged in after signup`)

							if (req.session) req.session.cookie.maxAge = 5184000000
							if (req.headers["accept"] === "application/json") {
								res.json(user)
							}
							else {
								res.redirect(String(req.query.return_url) ?? "/")
							}
						}
					})
				}
			})(req, res, next)
		}],

		["post", "/login", (req, res, next) => {
			// console.log(`Request body sent to login post: ${stringify(req.body)}`)
			passport.authenticate('local-login', (errAuth, user, info) => {
				if (errAuth || !user) {
					const msg = `Login failed for '${req.body.email_addr}'`
					console.error(errAuth ?? info.message)
					res.status(statusCodes.BAD_REQUEST).send(msg)
				}
				else {
					// eslint-disable-next-line no-shadow
					req.logIn(user, async (err) => {
						if (err) {
							res.status(400).send(`Login failed: ${err}`)
						}
						else {
							if (req.session) {
								// eslint-disable-next-line fp/no-mutation
								req.session.cookie.maxAge = req.body.remember === "true"
									? 5184000000 // 2 months
									: 900000 // 15 minutes
							}
							res.redirect(req.query && hasValue(req.query.return_url)
								? String(req.query.return_url)
								: "/"
							)
						}
					})
				}
			})(req, res, next)
		}],

		["post", "/verify", async (req, res) => {
			try {
				const user = await request.post({
					url: `${authURL}/${appName}/verifications`,
					body: req.body,
					accept: "Json"
				})
				res.status(statusCodes.OK).json(user)
			}
			catch (err) {
				res.status(statusCodes.FORBIDDEN).send(err)
			}
		}],

		["get", "/logout", (req, res) => {
			// console.log(`Logging out via GET`)
			req.logOut()
			res.redirect('/')
		}],

		["post", "/:app/res_access_counts", async (req, res) => {
			// console.log(`Starting access logging for ${stringify(req.body)}`)
			try {
				const counts = await request.post({
					url: `${authURL}/${appName}/res_access_counts`,
					body: req.body,
					accept: "Json"
				})
				res.status(statusCodes.OK).json(counts)
			}
			catch (err) {
				res.status(statusCodes.FORBIDDEN).send(err)
			}
		}],

		["get", "/res_access_counts", async (req, res) => {
			try {
				const counts = await request.get({
					url: `${authURL}/${appName}/res_access_counts`,
					query: typeof req.query === "object"
						? req.query as Obj<string>
						: {},
					accept: "Json"
				})
				res.status(statusCodes.OK).json(counts)
			}
			catch (err) {
				res.status(statusCodes.FORBIDDEN).send(err)
			}
		}],
	]
}*/