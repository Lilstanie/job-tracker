import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import gmailRoutes from './routes/gmail.js'

const app = express()
const PORT = process.env.PORT ?? 3001
const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:5174'

app.use(cors({ origin: FRONTEND, credentials: true }))
app.use(express.json())

app.use('/api/gmail', gmailRoutes)

app.get('/health', (_req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`\n  ✓ API server  http://localhost:${PORT}`)
  console.log(`  ✓ Frontend    ${FRONTEND}\n`)
})
