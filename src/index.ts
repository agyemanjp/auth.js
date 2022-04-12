import { default as crossFetch } from "cross-fetch"
import * as express from 'express'
import { default as passport } from 'passport'
import { default as passportLocal } from "passport-local"
import { hasValue, request, HTTP_STATUS_CODES as httpStatusCodes } from "@agyemanjp/standard"

import { EntityModel } from "./schema"
import { uid, logNotice } from "./utils"

export const getRoutes = (authURL: string, appName: string) => {
	configurePassport(authURL, appName)
	return [
		["use", "", passport.initialize()],
		["use", "", passport.session()], // initialize & set up passport session (e.g., req.user)

		["post", "/signup", async (req, res, next) => {
			// console.log(`Request body sent to signup post: ${stringify(req.body)}`)

			passport.authenticate('local-signup', (errAuth, user, info) => {
				if (errAuth || !user) {
					const msg = `Signup failed for ${req.body.email_addr}\n${errAuth ?? info.message}`
					res.status(httpStatusCodes.BAD_REQUEST).send(msg)
				}
				else {
					// log(`About to req.logIn(user...`)
					req.logIn(user, async (errLogin) => {
						if (errLogin) {
							res.status(httpStatusCodes.UNAUTHORIZED).send(`Login failed for user ${user}: ${errLogin}`)
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
					const msg = `Login failed for '${req.body.email_addr}'\n${errAuth ?? info.message}`
					res.status(httpStatusCodes.BAD_REQUEST).send(msg)
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
		}],

		["post", "/verify", async (req, res, next) => {
			try {
				const user = await request({
					url: `${authURL}/${appName}/verifications`,
					body: req.body,
					customFetch: crossFetch
				}).post({ responseType: "json" })
				res.status(httpStatusCodes.OK).json(user)
			}
			catch (err) {
				res.status(httpStatusCodes.FORBIDDEN).send(err)
			}
		}],

		["get", "/logout", (req, res) => {
			// console.log(`Logging out via GET`)
			req.logOut()
			res.redirect('/')
		}]
	] as ["use" | "post", string, express.Handler][]
}

export function configurePassport(authURL: string, appName: string) {
	// construct & configure passport instance
	/** Configure and return passport with db authentication middleware */

	passport.serializeUser<string>((user, done) => { done(null, (user as User).id) })
	passport.deserializeUser<string>(async (id, done) => {
		try {
			const user = await request({
				url: `${authURL}/${appName}/users/${id}`,
				customFetch: crossFetch
			}).get({ responseType: "json" })

			// log(`Deserialized user '${JSON.stringify(user)}'`)
			return done(null, user)
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
				const user = await request(
					{
						url: `${authURL}/${appName}/authenticate/`,
						body: JSON.stringify({ email, pwd }),
						customFetch: crossFetch

					})
					.get({ responseType: "json" })

				return done(null, user)
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
					accessLevel: "regular" as const,
					emailAddress: email,
					displayName: req.body['display_name'],
					companyName: "", //req.body['company_name'],
					whenVerified: null,
					password: pwd,
					app: appName
				}
				// log(`New user to be signed up: ${stringify(user)}`)
				const verificationCode = uid()
				const verificationURL = `https://${req.get('host')}/verify?email=${email}&code=${verificationCode}`
				logNotice(`New user verification url: ${verificationURL}`)

				await request(
					{
						url: `${authURL}/${appName}/register/`,
						body: JSON.stringify({
							...user,
							verification: {
								code: verificationCode,
								url: verificationURL
							}
						}),
						customFetch: crossFetch
					})
					.post({ responseType: "json" })

				return done(null, user)
			}
			catch (err) {
				// return done(err, false)
				return done(err, false, { message: `Could not signup user "${email}"` })
			}
		})
	)

	return passport
}

export type User = EntityModel["usersReadonly"]