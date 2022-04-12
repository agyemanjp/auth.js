/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable camelcase */
/* eslint-disable brace-style */

import { default as cuid } from "cuid"
import { default as chalk } from "chalk"
import { Obj, stringify } from "@agyemanjp/standard"
import { ClientEnv } from "./types"

export const uid = () => "_" + cuid().substring(1)

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
