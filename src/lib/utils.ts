/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable camelcase */
/* eslint-disable brace-style */

import { User } from "./types"


export const sanitizeUser = <U extends User>(user: U) => ({
	...user,
	pwdHash: undefined,
	pwdSalt: undefined,
	verificationCode: undefined
}) as User
