import { google } from 'googleapis'

// Known ATS / recruitment platform sender domains
const ATS_DOMAINS = [
  // Core ATS platforms
  'jobadder.com',
  'greenhouse.io',
  'workday.com',
  'myworkday.com',
  'myworkdayjobs.com',
  'lever.co',
  'smartrecruiters.com',
  'taleo.net',
  'successfactors.com',
  'icims.com',
  'bamboohr.com',
  'recruitee.com',
  'jobvite.com',
  'applytojob.com',
  'recruitcrm.io',
  // Assessment & psychometric platforms
  'weareamberjack.com',
  'weareamberjack.com.au',  // common OA platform
  'gradweb.co.uk',
  'gradweb1.co.uk',         // GradWeb feedback reports (UK/AU grads)
  'fusiongc.com.au',        // Fusion Graduate Centre
  'hirevue.com',
  'pymetrics.com',
  'pymetrics.ai',
  'hackerrankforwork.com',
  'shl.com',
  'cut-e.com',
  'aon.com',
  'korn-ferry.com',
  'kornferry.com',
  'assessments.korn-ferry.com',
  'criteriacorp.com',
  'hiredscore.com',
  'vervoe.com',
  'codility.com',
  'hackerrank.com',
  // Job boards that send application confirmation emails
  // seek.com.au: confirmation emails come from seek.com.au; job alerts come from s.seek.com.au
  // which is caught by BLOCKED_SENDER_PATTERNS before ATS_DOMAINS is checked.
  'seek.com.au',
  'linkedin.com',
  'indeed.com',
  'careers.google.com',
  'talent.com',
]

// Subject words reliable enough after BLOCKED_SENDER_PATTERNS strips digests.
// Removed: 'offer' (sales emails), 'congratulations' (birthday etc), 'hiring' (marketing)
const SUBJECT_SIGNALS = [
  'application', 'interview', 'assessment', 'internship', 'intern',
  'graduate', 'shortlist', 'shortlisted', 'unsuccessful',
  'application acknowledgement',
  'application acknowledgment',
  'feedback report',  // post-OA feedback emails → OA completed
  'engagement agreement',
  'employment agreement',
  'next steps', 'next round',
]

// Phrases in the body/snippet that confirm a job email (looser than before)
const SNIPPET_SIGNALS = [
  'received your application',
  "we've received",
  'thank you for applying',
  'thank you for your application',
  'thank you for your interest',
  'thanks for taking the time to complete your application',
  'excited to review your application',
  'application closing date',
  'your application has been',
  'your application for',
  'applied for',
  'online assessment',
  'video interview',
  'assessment centre',
  'assessment center',
  'phone interview',
  'interview invitation',
  'invited to interview',
  'next round',
  'move forward',
  'graduate program',
  'graduate programme',
  'we regret to inform',
  'not.*successful',
  'unsuccessful',
  'pleased to offer',
  'verbal offer',
  'offer of employment',
  'delighted to offer',
  'delighted to extend',
  'hiring team',
  'recruiting team',
  'talent team',
  'sorry to inform',
  'regret to inform',
  // Post-assessment completion signals
  'thank you for completing',
  'completed our online',
  'completed the assessment',
  'feedback report',
  'your performance',
  'assessment results',
  // Offer-adjacent onboarding/contract signals
  'tutor position',
  'onboarding process',
  'review, sign, and return',
  'review and sign',
  'engagement agreement',
]

// Job-board alert / digest senders — marketing, NOT application responses
const BLOCKED_SENDER_PATTERNS = [
  /seek\s*alerts?/i,
  /seek\s*recommendations?/i,
  /jobmail@.*seek/i,        // SEEK <jobmail@s.seek.com.au> — job alert digest
  /@s\.seek\.com\.au/i,     // SEEK marketing subdomain
  /linkedin\s*alerts?/i,
  /linkedin\s*jobs?/i,
  /indeed\b(?!.*application)/i,
  /job\s*alerts?/i,
  /jobs?\s*digest/i,
  /career\s*alerts?/i,
  /noreply@linkedin\.com/i,
  /jobs-noreply@linkedin\.com/i,
  /linkedin@em\.linkedin\.com/i, // LinkedIn Premium / marketing blasts
  /trip\.com/i,
]

const SENDER_HINT_PATTERNS = [
  /careers?/i,
  /recruit(ing|ment)?/i,
  /talent/i,
  /\bhr\b/i,
  /hiring/i,
]

const SCORE_THRESHOLD = 3

// Pre-filter: multi-signal scoring (robust to unseen domains).
function isLikelyJobEmail(email, verbose = false) {
  const log = verbose ? (...a) => console.log(...a) : () => {}
  const fromLower = email.from.toLowerCase()
  const subjectLower = email.subject.toLowerCase()

  if (fromLower.includes('linkedin@em.linkedin.com') && /premium|offer|months?\b|discount/i.test(subjectLower)) {
    log(`  ✗ LINKEDIN_MARKETING: [${email.from}] "${email.subject}"`)
    return false
  }

  if (BLOCKED_SENDER_PATTERNS.some(p => p.test(email.from))) {
    log(`  ✗ BLOCKED_SENDER: [${email.from}] "${email.subject}"`)
    return false
  }

  let score = 0
  const reasons = []
  const matchedDomain = ATS_DOMAINS.find(d => fromLower.includes(d))
  if (matchedDomain) {
    score += 3
    reasons.push(`ATS_DOMAIN(${matchedDomain}) +3`)
  }

  const subject = subjectLower
  const snippet = email.snippet.toLowerCase()

  const matchedSubject = SUBJECT_SIGNALS.find(s => subject.includes(s))
  if (matchedSubject) {
    score += 2
    reasons.push(`SUBJECT_SIGNAL(${matchedSubject}) +2`)
  }

  const matchedSnippet = SNIPPET_SIGNALS.find(kw => {
    try { return new RegExp(kw, 'i').test(snippet) } catch { return snippet.includes(kw) }
  })
  if (matchedSnippet) {
    score += 2
    reasons.push(`SNIPPET_SIGNAL(${matchedSnippet}) +2`)
  }

  const matchedSenderHint = SENDER_HINT_PATTERNS.find(p => p.test(email.from))
  if (matchedSenderHint) {
    score += 1
    reasons.push(`SENDER_HINT(${matchedSenderHint}) +1`)
  }

  const accepted = score >= SCORE_THRESHOLD
  if (accepted) {
    log(`  ✓ SCORE(${score}) ${reasons.join(', ')}: [${email.from}] "${email.subject}"`)
  } else {
    log(`  ✗ SCORE(${score}) below ${SCORE_THRESHOLD}: [${email.from}] "${email.subject}" | snippet: ${snippet.slice(0, 80)}`)
  }
  return accepted
}

function decodeBodyData(data) {
  if (!data) return ''
  try {
    return Buffer.from(data, 'base64url').toString('utf-8')
  } catch {
    return ''
  }
}

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// Recursively extract readable text from MIME payload (for classification/deadlines)
function extractTextFromPayload(payload, maxLen = 2000) {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBodyData(payload.body.data).slice(0, maxLen)
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return htmlToText(decodeBodyData(payload.body.data)).slice(0, maxLen)
  }
  if (payload.parts) {
    const plainPart = payload.parts.find((p) => p.mimeType === 'text/plain' && p.body?.data)
    if (plainPart) return decodeBodyData(plainPart.body.data).slice(0, maxLen)

    const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html' && p.body?.data)
    if (htmlPart) return htmlToText(decodeBodyData(htmlPart.body.data)).slice(0, maxLen)

    for (const part of payload.parts) {
      const text = extractTextFromPayload(part, maxLen)
      if (text) return text
    }
  }
  return ''
}

// Test-only exports for deterministic unit tests.
export const __test__ = {
  isLikelyJobEmail,
  extractTextFromPayload,
}

export async function fetchJobEmails(auth, days = 30) {
  const gmail = google.gmail({ version: 'v1', auth })

  const query = [
    '(',
    // ATS / recruitment platform senders
    ...ATS_DOMAINS.map((d, i) => `${i === 0 ? '' : 'OR '}from:${d}`),
    // Subject keywords — kept tight to avoid false positives.
    // Removed: subject:application (bank/loan emails), subject:assessment (risk/perf evals),
    //          subject:intern (matches "internal"/"international"), subject:offer (sales).
    'OR subject:applying',
    'OR subject:interview',
    'OR subject:graduate',
    'OR subject:internship',
    'OR subject:"application acknowledgement"',
    'OR subject:"application acknowledgment"',
    'OR subject:unsuccessful',
    'OR subject:shortlisted',
    // Body phrases — specific enough to only match job emails
    'OR "thank you for applying"',
    'OR "thank you for your application"',
    'OR "thank you for your interest"',
    'OR "thanks for taking the time to complete your application"',
    'OR "excited to review your application"',
    'OR "application closing date"',
    'OR "received your application"',
    'OR "your application for"',
    'OR "online assessment"',
    'OR "assessment centre"',
    'OR "video interview"',
    'OR "we regret to inform"',
    'OR "sorry to inform"',
    'OR "next round"',
    'OR "hiring team"',
    'OR "recruiting team"',
    'OR "feedback report"',
    'OR "thank you for completing"',
    'OR "completed the assessment"',
    // Contract/onboarding offer flows (for cases where "offer" is not in subject/snippet)
    'OR "engagement agreement"',
    'OR "employment agreement"',
    'OR "onboarding process"',
    'OR "review and sign"',
    'OR "please review, sign, and return"',
    'OR "tutor position"',
    // Offer — body phrases only (subject:offer triggers too many sales emails)
    'OR "offer of employment"',
    'OR "pleased to offer"',
    'OR "verbal offer"',
    'OR "we are delighted to offer"',
    'OR "we\'re delighted to offer"',
    'OR "delighted to extend"',
    ')',
    `newer_than:${days}d`,
  ].join(' ')

  const MAX_RAW_RESULTS = 500
  const PAGE_SIZE = 100
  const messages = []
  let pageToken = undefined

  do {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: PAGE_SIZE,
      pageToken,
    })
    const page = listRes.data.messages || []
    messages.push(...page)
    pageToken = listRes.data.nextPageToken
  } while (pageToken && messages.length < MAX_RAW_RESULTS)

  const slicedMessages = messages.slice(0, MAX_RAW_RESULTS)
  if (!messages.length) {
    console.log('[gmail] No emails matched the search query')
    return { emails: [], rawCount: 0 }
  }

  console.log(`[gmail] Gmail returned ${slicedMessages.length} raw results, fetching details...`)
  console.log(`[gmail] Query sent:\n${query}\n`)

  const emails = await Promise.all(
    slicedMessages.map(async ({ id }) => {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'],
      })
      const headers = msg.data.payload.headers
      return {
        id,
        subject: headers.find(h => h.name === 'Subject')?.value ?? '(no subject)',
        from: headers.find(h => h.name === 'From')?.value ?? '',
        date: headers.find(h => h.name === 'Date')?.value ?? '',
        snippet: msg.data.snippet ?? '',
      }
    })
  )

  console.log(`[gmail] All ${emails.length} emails returned by Gmail API:`)
  emails.forEach(e => console.log(`  • [${e.date}] [${e.from}] "${e.subject}"`))

  // Stage 2: keyword / sender pre-filter before hitting AI
  console.log(`[gmail] Pre-filter analysis:`)
  const filtered = emails.filter(e => isLikelyJobEmail(e, true))

  console.log(`[gmail] Pre-filter: ${emails.length} → ${filtered.length} job-related emails`)

  // Fetch full body text for filtered emails so deadline extraction can find
  // phrases buried in the body (e.g. "You'll have 72 hours to complete")
  const enriched = await Promise.all(
    filtered.map(async (email) => {
      try {
        const full = await gmail.users.messages.get({ userId: 'me', id: email.id, format: 'full' })
        const bodyText = extractTextFromPayload(full.data.payload, 2000)
        return { ...email, bodyText }
      } catch {
        return email
      }
    })
  )

  return { emails: enriched, rawCount: messages.length }
}
