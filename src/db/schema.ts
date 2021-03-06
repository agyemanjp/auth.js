
import { EntityType } from "@agyemanjp/storage"

export const schema = {
	users: {
		fields: {
			id: "string",
			displayName: "string",
			emailAddress: "string",
			companyName: "string",
			accessLevel: "number",
			pwdHash: "string",
			pwdSalt: "string",
			verificationCode: "string",
			whenVerified: { nullable: true, type: "number" },
			app: "string"
		},
		idField: "id",
		readonly: false
	},

	usersReadonly: {
		fields: {
			id: "string",
			displayName: "string",
			emailAddress: "string",
			companyName: "string",
			accessLevel: "number",
			whenVerified: { nullable: true, type: "number" },
			app: "string"
			// pwdHash: "string",
			// pwdSalt: "string"
		},
		idField: "id",
		readonly: true
	},

	resourceAccessCounts: {
		fields: {
			app: "string",
			userId: "string",
			resourceCode: "string",
			resourceType: { type: "string", nullable: true },
			count: "number",
		},
		idField: "",
		readonly: true
	}
} as const

export type T<E extends keyof typeof schema> = EntityType<(typeof schema)[E]>

export type EntityModel = {
	users: T<"users">,
	usersReadonly: T<"usersReadonly">
	resourceAccessCounts: T<"resourceAccessCounts">
}