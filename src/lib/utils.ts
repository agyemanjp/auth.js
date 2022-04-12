/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable camelcase */
/* eslint-disable brace-style */

import { default as cuid } from "cuid"
import { default as chalk } from "chalk"
import { Obj, TypeAssert, Primitive, isSymbol } from "@agyemanjp/standard"
import { ClientEnv } from "./types"

export const uid = () => "_" + cuid().substring(1)

export const stringify = (x: unknown) => JSON.stringify(x, (_, val) => typeof val === "function" ? `[Function ${val.name}]` : val, 2)

const CLIENT_ENV_GLOBAL_PROPERTY = uid()
export function getClientEnv() { return (window as unknown as Obj)[CLIENT_ENV_GLOBAL_PROPERTY] as ClientEnv | undefined }
export function setClientEnv(env: ClientEnv) { (window as unknown as Obj)[CLIENT_ENV_GLOBAL_PROPERTY] = env }

const AppLogLevels = { ERRORS: 1, WARNINGS: 2, NOTICES: 3 }
const LOG_LEVEL_DEFAULT = AppLogLevels.WARNINGS
export function logNotice(str: string, empasized = false) {
	if (getLogLevel() >= AppLogLevels.NOTICES) {
		// console.log(`logNotice starting with argument "${str}"`)
		if (empasized === true)
			console.log(chalk.greenBright(str))
		else
			console.log(str)
	}
}
export function logWarning(str: string) {
	if (getLogLevel() >= AppLogLevels.WARNINGS) {
		console.warn(chalk.keyword("yellow")(str))
	}
}
export function logError(str: string) {
	if (getLogLevel() >= AppLogLevels.ERRORS)
		console.error(chalk.red(str))
}

function getLogLevel() {
	const logLevelEnv = typeof process === "undefined"
		? getClientEnv()?.LOG_LEVEL
		: process.env.LOG_LEVEL
	const logLevel = logLevelEnv ? Number.parseInt(logLevelEnv) : LOG_LEVEL_DEFAULT
	return (Number.isNaN(logLevel))
		? LOG_LEVEL_DEFAULT
		: logLevel
}

// eslint-disable-next-line no-useless-escape
export const encodeHTMLEntities = (s: string) => s.replace(/[\u00A0-\u9999<>\&]/g, i => '&#' + i.charCodeAt(0) + ';')
export const decodeHTMLEntities = (str: string) => {
	if (str && typeof str === 'string') {
		str = str.replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, '')
		str = str.replace(/<\/?\w(?:[^"'>]|"[^"]*"|'[^']*')*>/gmi, '')
	}
	return str
}

type MailMessage = {
	from: string,
	to: string,
	subject: string,
} & ({ text: string } | { html: string })
export function sendMail(msg: MailMessage) {
	// const transporter = nodemailer.createTransport({
	// 	host: process.env.SMTP_HOST,
	// 	port: Number.parseInt(process.env.SMTP_PORT!),
	// 	auth: {
	// 		user: process.env.SMTP_USERNAME,
	// 		pass: process.env.SMTP_PASSWORD
	// 	}
	// })

	// /*const message = {
	// 	from: "from-example@email.com",
	// 	to: "to-example@email.com",
	// 	subject: "Subject",
	// 	text: "Hello SMTP Email"
	// }
	// const messageHTML = {
	// 	from: "from@email.com",
	// 	to: "to@email.com",
	// 	subject: "Subject",
	// 	html: "<h1>Hello SMTP Email</h1>"
	// }*/

	// transporter.sendMail(msg, (err, info) => {
	// 	if (err) {
	// 		logError(err.message)
	// 	}
	// 	else {
	// 		logNotice(info.response)
	// 	}
	// })
}

export function dateToYMD(date: Date) {
	const d = date.getDate()
	const m = date.getMonth() + 1 //Month from 0 to 11
	const y = date.getFullYear()
	return '' + y + '-' + (m <= 9 ? '0' + m : m) + '-' + (d <= 9 ? '0' + d : d)
}

export const mergeDeep = (options?: { mergeArrays: boolean, undefinedOverwrites: boolean }) => <T extends IObject[]>(...objects: T) => objects.reduce((result, current) => {
	const isObject = (obj: unknown) => {
		if (typeof obj === "object" && obj !== null) {
			if (typeof Object.getPrototypeOf === "function") {
				const prototype = Object.getPrototypeOf(obj)
				return prototype === Object.prototype || prototype === null
			}

			return Object.prototype.toString.call(obj) === "[object Object]"
		}
		return false
	}

	Object.keys(current).forEach((key) => {
		if (Array.isArray(result[key]) && Array.isArray(current[key])) {
			result[key] = (options?.mergeArrays ?? false)
				? Array.from(new Set((result[key] as unknown[]).concat(current[key])))
				: current[key]
		}
		else if (isObject(result[key]) && isObject(current[key])) {
			result[key] = mergeDeep(options)(result[key] as IObject, current[key] as IObject)
		}
		else {
			if ((options?.undefinedOverwrites ?? false) || typeof current[key] !== "undefined")
				result[key] = current[key]
		}
	})

	return result
}, {}) as TUnionToIntersection<T[number]>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface IObject { [key: string]: any; length?: never; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TUnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

