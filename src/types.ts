import { EntityModel, } from "./schema"

export const userAccessLevels = {
	NONE: 0,
	REGULAR: 1,
	ADMIN: 2,
	DEV: 4
} as const

export type UserAccessLevel = typeof userAccessLevels[keyof typeof userAccessLevels]

export type User = EntityModel["usersReadonly"] & { accessLevel: UserAccessLevel }
export type ResourceAccessCount = EntityModel["resourceAccessCounts"]

