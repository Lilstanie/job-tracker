import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import gmailRoutes from './routes/gmail.js'

const app = express()
const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:5174'

app.use(cors({ origin: FRONTEND, credentials: true }))
app.use(express.json())

app.use('/api/gmail', gmailRoutes)
app.get('/health', (_req, res) => res.json({ ok: true }))

export default app
