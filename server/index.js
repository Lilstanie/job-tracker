import app from './app.js'
const PORT = process.env.PORT ?? 3001
const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:5174'

app.listen(PORT, () => {
  console.log(`\n  ✓ API server  http://localhost:${PORT}`)
  console.log(`  ✓ Frontend    ${FRONTEND}\n`)
})
