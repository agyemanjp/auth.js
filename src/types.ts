
// export const userAccessLevels = {
// 	NONE: 0,
// 	REGULAR: 1,
// 	ADMIN: 2,
// 	DEV: 4
// } as const

// export interface User /*extends Express.User*/ {
// 	id: string
// 	emailAddress: string,
// 	displayName: string,
// 	accessLevel: typeof userAccessLevels[keyof typeof userAccessLevels]
// }

// export type DbUser = User & {
// 	password?: string
// } & Express.User


export type ClientEnv = {
	LOG_LEVEL: string
}