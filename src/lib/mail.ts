/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Transporter, createTransport } from "nodemailer"

export function sendMail(msg: MailMessage) {
	const transporter = createTransport({
		host: process.env.SMTP_HOST,
		port: Number.parseInt(process.env.SMTP_PORT!),
		auth: {
			user: process.env.SMTP_USERNAME,
			pass: process.env.SMTP_PASSWORD
		}
	})

	/*const message = {
		from: "from-example@email.com",
		to: "to-example@email.com",
		subject: "Subject",
		text: "Hello SMTP Email"
	}
	const messageHTML = {
		from: "from@email.com",
		to: "to@email.com",
		subject: "Subject",
		html: "<h1>Hello SMTP Email</h1>"
	}*/

	transporter.sendMail(msg, (err, info) => {
		if (err) {
			console.error(err.message)
		}
		else {
			console.log(info.response)
		}
	})
}

type MailMessage = {
	from: string,
	to: string,
	subject: string
} & ({ text: string } | { html: string })
