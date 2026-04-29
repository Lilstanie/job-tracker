import { Router } from 'express'
import { google } from 'googleapis'
import crypto from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { fetchJobEmails } from '../services/gmail.js'
import { classifyEmails } from '../services/classifier.js'

const router = Router()
const __dir = dirname(fileURLToPath(import.meta.url))
const SESSION_FILE = join(__dir, '../../secrets/session.json')

// ── Token store (in-memory, backed by file) ──────────────────────────────────
const tokenStore = new Map()
let cachedProfile = null

function loadSession() {
  try {
    if (existsSync(SESSION_FILE)) {
      const { syncToken, tokens, profile } = JSON.parse(readFileSync(SESSION_FILE, 'utf8'))
      if (syncToken && tokens) {
        tokenStore.set(syncToken, tokens)
        cachedProfile = profile ?? null
        console.log(`[gmail] Restored session for ${profile?.email ?? 'unknown'}`)
        return syncToken
      }
    }
  } catch (e) {
    console.error('[gmail] Could not load session:', e.message)
  }
  return null
}

function saveSession(syncToken, tokens, profile) {
  try {
    mkdirSync(join(__dir, '../../secrets'), { recursive: true })
    writeFileSync(SESSION_FILE, JSON.stringify({ syncToken, tokens, profile }, null, 2))
  } catch (e) {
    console.error('[gmail] Could not save session:', e.message)
  }
}

// Load on startup so server restarts don't require re-auth
loadSession()

function makeOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3001/api/gmail/callback'
  )
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/gmail/auth
router.get('/auth', (_req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set in .env' })
  }
  const url = makeOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  })
  res.redirect(url)
})

// GET /api/gmail/callback
router.get('/callback', async (req, res) => {
  const { code, error } = req.query
  const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5174'
  if (error || !code) return res.redirect(`${frontend}/?gmailError=${error ?? 'access_denied'}`)

  try {
    const oauth2Client = makeOAuthClient()
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    // Fetch Google profile (name, email, picture)
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: profile } = await oauth2.userinfo.get()
    cachedProfile = { name: profile.name, email: profile.email, picture: profile.picture }

    const syncToken = crypto.randomBytes(20).toString('hex')
    tokenStore.set(syncToken, tokens)
    saveSession(syncToken, tokens, cachedProfile)

    // Auto-refresh: save new tokens when access token is refreshed
    oauth2Client.on('tokens', updated => {
      const current = tokenStore.get(syncToken) ?? {}
      const merged = { ...current, ...updated }
      tokenStore.set(syncToken, merged)
      saveSession(syncToken, merged, cachedProfile)
    })

    res.redirect(`${frontend}/?syncToken=${syncToken}&gmailConnected=true`)
  } catch (err) {
    console.error('[gmail/callback]', err.message)
    res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:5174'}/?gmailError=token_exchange_failed`)
  }
})

// GET /api/gmail/profile
router.get('/profile', (req, res) => {
  const syncToken = req.headers['x-sync-token']
  const connected = !!(syncToken && tokenStore.has(syncToken))
  res.json({ connected, profile: connected ? cachedProfile : null })
})

// GET /api/gmail/status
router.get('/status', (req, res) => {
  const syncToken = req.headers['x-sync-token']
  res.json({ connected: !!(syncToken && tokenStore.has(syncToken)) })
})

// POST /api/gmail/sync
router.post('/sync', async (req, res) => {
  const syncToken = req.headers['x-sync-token']
  if (!syncToken || !tokenStore.has(syncToken)) {
    return res.status(401).json({ error: 'Not connected — please reconnect Gmail.' })
  }

  const { applications = [], days = 30, knownIds = [], userTimeZone = 'UTC' } = req.body
  const oauth2Client = makeOAuthClient()
  oauth2Client.setCredentials(tokenStore.get(syncToken))

  // Keep tokens fresh
  oauth2Client.on('tokens', updated => {
    const merged = { ...tokenStore.get(syncToken), ...updated }
    tokenStore.set(syncToken, merged)
    saveSession(syncToken, merged, cachedProfile)
  })

  try {
    const { emails, rawCount } = await fetchJobEmails(oauth2Client, Math.min(Math.max(parseInt(days) || 30, 1), 180))
    if (!emails.length) {
      return res.json({ results: [], emailCount: 0, rawCount: 0, skippedKnown: 0 })
    }
    const { results, skippedKnown } = await classifyEmails(emails, applications, knownIds, userTimeZone)
    res.json({ results, emailCount: emails.length, rawCount, skippedKnown })
  } catch (err) {
    console.error('[gmail/sync]', err.message)
    if (err.message?.includes('invalid_grant') || err.status === 401) {
      tokenStore.delete(syncToken)
      saveSession(null, null, null)
      return res.status(401).json({ error: 'Gmail session expired — please reconnect.' })
    }
    res.status(500).json({ error: err.message })
  }
})

export default router
