import { Router } from 'express'
import { google } from 'googleapis'
import crypto from 'crypto'
import { fetchJobEmails } from '../services/gmail.js'
import { classifyEmails } from '../services/classifier.js'
import {
  deleteSession,
  getSession,
  setSession,
  usingRedisStore,
} from '../services/sessionStore.js'

const router = Router()

console.log(`[gmail] Session store: ${usingRedisStore() ? 'Upstash Redis' : 'in-memory fallback'}`)

function makeOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3001/api/gmail/callback'
  )
}

function resolveFrontendUrl(req) {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL
  const host = req.headers['x-forwarded-host'] || req.headers.host
  if (!host) return 'http://localhost:5174'
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
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
  const frontend = resolveFrontendUrl(req)
  if (error || !code) return res.redirect(`${frontend}/?gmailError=${error ?? 'access_denied'}`)

  try {
    const oauth2Client = makeOAuthClient()
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    // Fetch Google profile (name, email, picture)
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: profile } = await oauth2.userinfo.get()
    const profileData = { name: profile.name, email: profile.email, picture: profile.picture }

    const syncToken = crypto.randomBytes(20).toString('hex')
    await setSession(syncToken, { tokens, profile: profileData })

    // Auto-refresh: save new tokens when access token is refreshed
    oauth2Client.on('tokens', updated => {
      getSession(syncToken)
        .then(currentSession => {
          const currentTokens = currentSession?.tokens ?? {}
          const merged = { ...currentTokens, ...updated }
          return setSession(syncToken, { tokens: merged, profile: currentSession?.profile ?? profileData })
        })
        .catch(err => console.error('[gmail] Token refresh persistence failed:', err.message))
    })

    res.redirect(`${frontend}/?syncToken=${syncToken}&gmailConnected=true`)
  } catch (err) {
    console.error('[gmail/callback]', err.message)
    res.redirect(`${resolveFrontendUrl(req)}/?gmailError=token_exchange_failed`)
  }
})

// GET /api/gmail/profile
router.get('/profile', async (req, res) => {
  const syncToken = req.headers['x-sync-token']
  const session = syncToken ? await getSession(syncToken) : null
  const connected = Boolean(session?.tokens)
  res.json({ connected, profile: connected ? (session?.profile ?? null) : null })
})

// GET /api/gmail/status
router.get('/status', async (req, res) => {
  const syncToken = req.headers['x-sync-token']
  const session = syncToken ? await getSession(syncToken) : null
  res.json({ connected: Boolean(session?.tokens) })
})

// POST /api/gmail/sync
router.post('/sync', async (req, res) => {
  const syncToken = req.headers['x-sync-token']
  const session = syncToken ? await getSession(syncToken) : null
  if (!syncToken || !session?.tokens) {
    return res.status(401).json({ error: 'Not connected — please reconnect Gmail.' })
  }

  const { applications = [], days = 30, knownIds = [], userTimeZone = 'UTC', debug = false } = req.body
  const oauth2Client = makeOAuthClient()
  oauth2Client.setCredentials(session.tokens)

  // Keep tokens fresh
  oauth2Client.on('tokens', updated => {
    const merged = { ...(session.tokens ?? {}), ...updated }
    setSession(syncToken, { tokens: merged, profile: session.profile ?? null })
      .catch(err => console.error('[gmail] Token refresh persistence failed:', err.message))
  })

  try {
    const { emails, rawCount } = await fetchJobEmails(oauth2Client, Math.min(Math.max(parseInt(days) || 30, 1), 180))
    if (!emails.length) {
      return res.json({
        results: [],
        emailCount: 0,
        rawCount: 0,
        skippedKnown: 0,
        ...(debug ? { debugPayload: { fetchedEmails: [] } } : {}),
      })
    }
    const { results, skippedKnown } = await classifyEmails(emails, applications, knownIds, userTimeZone)
    res.json({
      results,
      emailCount: emails.length,
      rawCount,
      skippedKnown,
      ...(debug ? { debugPayload: { fetchedEmails: emails, classifiedResults: results } } : {}),
    })
  } catch (err) {
    console.error('[gmail/sync]', err.message)
    if (err.message?.includes('invalid_grant') || err.status === 401) {
      await deleteSession(syncToken)
      return res.status(401).json({ error: 'Gmail session expired — please reconnect.' })
    }
    res.status(500).json({ error: err.message })
  }
})

export default router
