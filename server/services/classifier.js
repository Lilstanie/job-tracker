// Pure keyword-based classifier with date extraction and deduplication.
// No AI needed — regex rules handle stage detection reliably.

// ── Stage detection rules ────────────────────────────────────────────────────

const STAGE_RULES = [
  {
    stage: 'Offer',
    patterns: [
      /pleased to offer/i, /offer of employment/i, /verbal offer/i,
      /we would like to offer you/i, /we are delighted to offer/i,
      /we(?:'|’)re delighted to offer/i, /delighted to offer you/i,
      /congratulations.*offer/i, /offer.*congratulations/i,
    ],
  },
  {
    stage: 'Rejected',
    patterns: [
      /regret to inform/i, /not.*successful/i, /unsuccessful.*application/i,
      /deemed unsuccessful/i, /application.*deemed.*unsuccessful/i,
      /will not be moving forward/i, /not.*progressing/i, /not been selected/i,
      /unfortunately.*application/i, /application.*unsuccessful/i,
      /not.*proceed/i, /decided not to/i, /no longer.*consider/i,
    ],
  },
  {
    stage: 'Assessment Centre',
    patterns: [
      /assessment cent(re|er)/i, /group exercise/i, /ac day/i,
      /in.person assessment/i, /virtual assessment day/i,
      /invited.*assessment day/i,
    ],
  },
  {
    stage: 'Video Interview',
    patterns: [
      /video interview/i, /phone interview/i, /telephone interview/i,
      /interview invitation/i, /invited.*interview/i, /interview.*invited/i,
      /schedule.*interview/i, /interview.*schedule/i,
      /we.*like to interview/i, /next stage.*interview/i,
    ],
  },
  {
    stage: 'Online Assessment',
    patterns: [
      /online assessment/i, /complete.*assessment/i, /psychometric/i,
      /cognitive.*test/i, /aptitude test/i, /numerical reasoning/i,
      /verbal reasoning/i, /coding challenge/i, /technical test/i,
      /hackerrank/i, /codility/i, /pymetrics/i, /hirevue/i,
      /korn ferry/i, /sova/i, /criteria.*test/i,
      // Post-completion / feedback signals — still OA stage, just done
      /feedback report/i, /assessment.*feedback/i,
      /thank you for completing/i, /completed.*assessment/i,
      /assessment.*results?/i,
    ],
  },
  {
    stage: 'Applied',
    patterns: [
      /thank you for applying/i, /thank you for your application/i,
      /thanks for taking the time to complete your application/i,
      /application acknowledg(e)?ment/i,
      /excited to review your application/i,
      /we.*received your application/i, /application.*received/i,
      /received.*application/i, /application.*submitted/i,
      /application.*under.*review/i, /viewing your application/i,
      /successfully submitted to/i,   // SEEK confirmation emails
    ],
  },
]

const STAGE_ORDER = {
  'Applied': 0,
  'Online Assessment': 1,
  'Video Interview': 2,
  'Assessment Centre': 3,
  'Offer': 4,
  'Rejected': 99, // always wins if detected — never downgrade from Rejected
}

function detectStage(subject, snippet) {
  const text = `${subject} ${snippet}`
  for (const { stage, patterns } of STAGE_RULES) {
    if (patterns.some(p => p.test(text))) return { stage, confidence: 'high' }
  }
  if (/\binterview\b/i.test(text)) return { stage: 'Video Interview', confidence: 'medium' }
  if (/\bassessment\b/i.test(text)) return { stage: 'Online Assessment', confidence: 'medium' }
  if (/\boffer\b/i.test(text)) return { stage: 'Offer', confidence: 'medium' }
  if (/\bapplication\b/i.test(text)) return { stage: 'Applied', confidence: 'medium' }
  return { stage: 'Applied', confidence: 'low' }
}

// ── Due date extraction ──────────────────────────────────────────────────────

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}

function parseRawDate(raw) {
  if (!raw) return null
  const s = raw.trim().replace(/[,]/g, '')

  // DD/MM/YYYY or DD-MM-YYYY
  const slashMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/)
  if (slashMatch) {
    const day = parseInt(slashMatch[1])
    const month = parseInt(slashMatch[2])
    const year = slashMatch[3] ? parseInt(slashMatch[3]) : new Date().getFullYear()
    const y = year < 100 ? 2000 + year : year
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31)
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // "3 May 2026", "3rd May 2026", "3 May"
  const dmy = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?$/i)
  if (dmy) {
    const day = parseInt(dmy[1])
    const month = MONTHS[dmy[2].toLowerCase()]
    const year = dmy[3] ? parseInt(dmy[3]) : new Date().getFullYear()
    if (month && day >= 1 && day <= 31)
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // "May 3 2026", "May 3rd"
  const mdy = s.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?$/i)
  if (mdy) {
    const month = MONTHS[mdy[1].toLowerCase()]
    const day = parseInt(mdy[2])
    const year = mdy[3] ? parseInt(mdy[3]) : new Date().getFullYear()
    if (month && day >= 1 && day <= 31)
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // "Monday 5th May 2026"
  const weekday = s.match(/(?:mon|tue|wed|thu|fri|sat|sun)\w*\s+(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?/i)
  if (weekday) {
    const day = parseInt(weekday[1])
    const month = MONTHS[weekday[2].toLowerCase()]
    const year = weekday[3] ? parseInt(weekday[3]) : new Date().getFullYear()
    if (month && day >= 1 && day <= 31)
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return null
}

// Grab a date string that follows a deadline trigger word
const DATE_CHUNK = String.raw`((?:(?:mon|tue|wed|thu|fri|sat|sun)\w*\s+)?(?:\d{1,2}(?:st|nd|rd|th)?\s+\w+|\w+\s+\d{1,2}(?:st|nd|rd|th)?)(?:\s+\d{4})?|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)`

const DUE_TRIGGERS = [
  new RegExp(`(?:due|by|before|deadline[:\\s]+|complete\\s+by|submit\\s+by|close[sd]?\\s+(?:on\\s+)?|expires?\\s+(?:on\\s+)?|respond\\s+by|assessment\\s+(?:due|close[sd]?)\\s+(?:on\\s+)?)${DATE_CHUNK}`, 'i'),
  new RegExp(`(?:interview|assessment|meeting)\\s+(?:is\\s+)?(?:on|scheduled\\s+for|at)\\s+${DATE_CHUNK}`, 'i'),
  new RegExp(`\\bby\\s+${DATE_CHUNK}`, 'i'),
]

function parseRelativeDeadline(text, emailDate) {
  if (!emailDate) return null
  const base = new Date(emailDate)
  if (isNaN(base.getTime())) return null

  const patterns = [
    /\byou(?:'ll)?\s+have\s+(\d+)\s*(hours?|days?)/i,               // "you'll have 72 hours"
    /\b(\d+)\s*(hours?|days?)\s+to\s+(?:complete|respond|access|finish|submit)/i, // "72 hours to complete"
    /(?:complete|submit|respond|access).{0,25}within\s+(\d+)\s*(hours?|days?)/i,  // "complete within 48 hours"
    /within\s+(\d+)\s*(hours?|days?)/i,                              // "within 3 days"
    /(\d+)[- ](hour|day)\s+(?:window|deadline|limit)/i,              // "72-hour window"
    /(?:expire|expires|expiring)\s+in\s+(\d+)\s*(hours?|days?)/i,    // "expires in 10 days"
  ]

  for (const p of patterns) {
    const m = text.match(p)
    if (!m) continue
    const amount = parseInt(m[1])
    const unit = m[2].toLowerCase()
    const d = new Date(base)
    if (unit.startsWith('hour')) d.setHours(d.getHours() + amount)
    else d.setDate(d.getDate() + amount)
    return d.toISOString().split('T')[0]
  }
  return null
}

const TZ_ABBR_OFFSETS = {
  UTC: 0, GMT: 0,
  AEST: 10 * 60, AEDT: 11 * 60,
  CST: -6 * 60, CDT: -5 * 60,
  EST: -5 * 60, EDT: -4 * 60,
  MST: -7 * 60, MDT: -6 * 60,
  PST: -8 * 60, PDT: -7 * 60,
}

function parseIanaHint(text) {
  const m = text.match(/\(([^)]+)\)/)
  if (!m) return null
  const raw = m[1].trim()
  if (/america\s*-\s*chicago/i.test(raw)) return 'America/Chicago'
  if (/america\/chicago/i.test(raw)) return 'America/Chicago'
  if (/australia\s*-\s*sydney/i.test(raw)) return 'Australia/Sydney'
  if (/australia\/sydney/i.test(raw)) return 'Australia/Sydney'
  return null
}

function toTimeZoneDateString(date, timeZone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const parts = fmt.formatToParts(date)
    const year = parts.find(p => p.type === 'year')?.value
    const month = parts.find(p => p.type === 'month')?.value
    const day = parts.find(p => p.type === 'day')?.value
    if (year && month && day) return `${year}-${month}-${day}`
  } catch {}
  return date.toISOString().split('T')[0]
}

function parseAbsoluteDeadline(text, userTimeZone = 'UTC') {
  const line = text.match(/(?:End\s+Login\s+Date\/Time|test\s+expiry\s+date(?:\/time)?|assessment\s+expires?\s*(?:on|at)?|deadline)\s*[:\-]?\s*([^\n\r]+)/i)
  if (!line) return null

  const raw = line[1].trim()
  const dt = raw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s*([A-Za-z]{2,5})?/i)
  if (!dt) return null

  const day = parseInt(dt[1])
  const month = MONTHS[dt[2].toLowerCase()]
  const year = parseInt(dt[3])
  let hour = parseInt(dt[4]) % 12
  const minute = parseInt(dt[5])
  const meridiem = dt[6].toUpperCase()
  const abbr = (dt[7] || '').toUpperCase()
  if (meridiem === 'PM') hour += 12
  if (!month) return null

  // Prefer explicit GMT offset from known abbreviation.
  const offsetMin = TZ_ABBR_OFFSETS[abbr]
  if (offsetMin !== undefined) {
    const utcMs = Date.UTC(year, month - 1, day, hour, minute) - offsetMin * 60000
    return toTimeZoneDateString(new Date(utcMs), userTimeZone)
  }

  // Fallback: if a known IANA zone hint appears in parentheses.
  const iana = parseIanaHint(raw)
  if (iana) {
    // Approximation path: interpret the parsed date as local wall-clock in iana via locale roundtrip.
    // If conversion fails, we still return the source calendar date.
    try {
      const naiveUtc = new Date(Date.UTC(year, month - 1, day, hour, minute))
      return toTimeZoneDateString(naiveUtc, userTimeZone || iana)
    } catch {}
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function extractDueDate(subject, snippet, emailDate = null, userTimeZone = 'UTC') {
  const text = `${subject} ${snippet}`
  const absolute = parseAbsoluteDeadline(text, userTimeZone)
  if (absolute) return absolute
  for (const pattern of DUE_TRIGGERS) {
    const match = text.match(pattern)
    if (match) {
      const parsed = parseRawDate(match[1])
      if (parsed) return parsed
    }
  }
  return parseRelativeDeadline(text, emailDate)
}

// ── Company extraction ───────────────────────────────────────────────────────

// Domain parts that belong to ATS/assessment platforms — never the actual employer
const ATS_DOMAIN_PARTS = new Set([
  'jobadder', 'greenhouse', 'workday', 'lever', 'smartrecruiters', 'taleo', 'icims',
  'gradweb', 'gradweb1', 'weareamberjack', 'hirevue', 'pymetrics', 'shl', 'fusiongc',
  'hackerrank', 'codility', 'cut', 'aon', 'korn', 'kornferry', 'criteriacorp',
  'hiredscore', 'vervoe', 'bamboohr', 'recruitee', 'jobvite', 'successfactors',
  'applytojob', 'recruitcrm', 'seek', 'linkedin', 'indeed', 'talent', 'myworkdayjobs',
])

const GENERIC_COMPANY_NAMES = new Set([
  'your', 'you', 'team', 'talent team', 'hiring team', 'recruitment team',
  'careers', 'notifications', 'no-reply', 'noreply', 'info',
])

const COMPANY_ALIAS_RULES = [
  { pattern: /\b(cba|commbank|commonwealth\s*bank(?:\s*group)?)\b/i, canonical: 'Commonwealth Bank' },
  { pattern: /\bnab\b|national\s*australia\s*bank/i, canonical: 'NAB' },
  { pattern: /\banz\b|australia\s*and\s*new\s*zealand\s*bank/i, canonical: 'ANZ' },
  { pattern: /\bseek\b/i, canonical: 'SEEK' },
]

function canonicalizeCompany(name) {
  if (!name) return name
  for (const { pattern, canonical } of COMPANY_ALIAS_RULES) {
    if (pattern.test(name)) return canonical
  }
  return name
}

function sanitiseCompanyName(raw) {
  if (!raw) return null
  let name = raw
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/<.*?>/g, '')
    .replace(/\b(no[\s.-]?reply|noreply|notifications?)\b/gi, '')
    .replace(/\s+@\s*(?:icims|workday|greenhouse|lever|smartrecruiters)\b.*$/i, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  if (!name) return null
  const low = name.toLowerCase()
  if (GENERIC_COMPANY_NAMES.has(low)) return null
  if (/^[^@\s]+@[^@\s]+$/.test(name)) return null
  if (name.length < 2) return null
  return canonicalizeCompany(name)
}

function extractSubjectCompany(subject) {
  if (!subject) return null
  const s = subject.replace(/^\d{4}\s+/, '') // strip leading year

  // "NEXTDC - Your Feedback Report", "Company: Application update"
  const prefixMatch = s.match(/^(.{2,40}?)\s*[-|:]\s*(?:your|application|feedback|online|video|interview|assessment|graduate|campus)/i)
  if (prefixMatch) return sanitiseCompanyName(prefixMatch[1])

  // "Citadel's Campus 27 - Australia Software Engineering | Intern role"
  const possessiveProgram = s.match(/^([A-Za-z][A-Za-z0-9&.\s]{1,30})'?s\s+(?:campus|graduate|internship|intern)/i)
  if (possessiveProgram) return sanitiseCompanyName(possessiveProgram[1])

  // "COMPANY Graduate Program", "COMPANY Internship Program"
  const programMatch = s.match(/^(.{3,40}?)\s+(?:graduate\s+program|internship\s+program|graduate\s+scheme|early\s+career\s+program)/i)
  if (programMatch) return sanitiseCompanyName(programMatch[1])

  // "Interview with Telstra", "Assessment with ANZ"
  const withMatch = subject.match(/(?:interview|assessment|offer)\s+with\s+([A-Za-z][A-Za-z\s&.]{1,25}?)(?:\s*[-–,]|\s*$)/i)
  if (withMatch) return sanitiseCompanyName(withMatch[1])

  // "NAB Feedback Report", "ANZ Online Assessment" — short acronym/name before action word
  const headMatch = s.match(/^([A-Z]{2,10})\s+(?:feedback|online|video|interview|assessment|offer|application|early)/i)
  if (headMatch) return sanitiseCompanyName(headMatch[1])

  return null
}

function extractCompany(from, subject = '', bodyText = '') {
  // SEEK-style confirmation body: "successfully submitted to COMPANY."
  // More reliable than from-address parsing for SEEK-routed emails
  const seekBodyMatch = bodyText.match(/successfully submitted to ([^\.\n\r]{2,80})/i)
  if (seekBodyMatch) {
    const co = sanitiseCompanyName(seekBodyMatch[1].trim().replace(/\s+/g, ' '))
    if (co) return co
  }

  // 1. Display name (most reliable when present)
  let displayName = null
  const displayMatch = from.match(/^"?([^"<]+)"?\s*</i)
  if (displayMatch) {
    let name = displayMatch[1].trim()
      .replace(/\b(recruitment|recruiter|careers|career|talent|hr|hiring|team|noreply|no.reply|jobs?|apply|notifications?|early)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    const clean = sanitiseCompanyName(name)
    if (clean && !ATS_DOMAIN_PARTS.has(clean.toLowerCase())) displayName = clean
  }

  // Subject extraction (used as override for short acronym display names like "HRD", "TAL")
  const subjectName = extractSubjectCompany(subject)

  if (displayName) {
    // If display name is a short all-caps acronym (≤4 chars) and subject gives something richer, prefer subject
    if (displayName.length <= 4 && subjectName && subjectName.length > displayName.length) return subjectName
    return displayName
  }
  if (subjectName) return subjectName

  // 3. Email local-part hint: "nabearlycareertalent@..." → extract leading word before "early/careers/talent/jobs"
  const localMatch = from.match(/^[^@]*?([a-z]{2,8})(?:early|careers?|talent|jobs?|grads?|recruit)\b/i)
  if (localMatch) return sanitiseCompanyName(localMatch[1].toUpperCase())

  // 4. Email domain — skip ATS platform parts and generic TLDs
  const emailMatch = from.match(/@([\w.-]+)/)
  if (emailMatch) {
    const parts = emailMatch[1].split('.')
    const name = parts.find(p =>
      !ATS_DOMAIN_PARTS.has(p.toLowerCase()) &&
      !['com', 'au', 'co', 'uk', 'gov', 'edu', 'org', 'net'].includes(p.toLowerCase()) &&
      p.length > 2
    )
    if (name) return sanitiseCompanyName(name.charAt(0).toUpperCase() + name.slice(1))
  }

  return null
}

// ── Role extraction ───────────────────────────────────────────────────────────

// Returns { role, roleSource } where roleSource is:
//   'explicit' — extracted from a labelled field or body pattern (high confidence)
//   'subject'  — best-effort strip of the email subject line (medium confidence)
//   'none'     — nothing useful extracted
function extractRole(subject, company, bodyText = '') {
  const fullText = `${subject} ${bodyText}`

  // SEEK confirmation body: "Your application for ROLE was successfully submitted to COMPANY"
  // This is the most reliable signal — SEEK's format is highly consistent
  const seekConfirm = bodyText.match(/your application for ([^\n\r]{3,100}) was successfully submitted/i)
  if (seekConfirm) {
    return { role: seekConfirm[1].trim().replace(/\s+/g, ' ').slice(0, 100), roleSource: 'explicit' }
  }

  // Explicit "ROLE : ..." label (HireVue and similar platforms)
  const roleLabel = fullText.match(/\bROLE\s*[:\-]\s*([^\n\r]{5,120})/i)
  if (roleLabel) {
    return { role: roleLabel[1].trim().replace(/\s+/g, ' ').slice(0, 100), roleSource: 'explicit' }
  }

  // "applying to the 2027 Telstra Graduate Program" style
  const applyMatch = fullText.match(/(?:applying\s+to\s+(?:the\s+)?|applied\s+for\s+(?:the\s+)?|your\s+application\s+(?:for|to)\s+(?:the\s+)?)(\d{0,5}\s*[A-Z][^.]{4,80}?(?:program|programme|pathway|stream|position|role|internship))/i)
  if (applyMatch) {
    return { role: applyMatch[1].trim().replace(/\s+/g, ' ').slice(0, 100), roleSource: 'explicit' }
  }

  // Subject-based: strip everything after common stage separators
  let role = subject
    .split(/\s*[–—]\s*(?:progress(?:ing)?\s+to|online\s+assessment|video\s+interview|assessment\s+cent|phone\s+interview|next\s+stage|we\s+regret|congratul|offer|application\s+(?:status|update)|invited?\s+to|update\s+on)/i)[0]
    .trim()

  // Strip leading year
  role = role.replace(/^\d{4}\s+/, '')

  // Strip trailing application ID codes like "0192_02/26"
  role = role.replace(/\s+\d[\d_/\-]{3,}\s*$/, '').trim()

  // Strip trailing stage noise words that survive the split
  role = role
    .replace(/\s*[-–—:]\s*(?:online\s+assessment|video\s+interview|assessment\s+cent(?:re|er)?|phone\s+interview|interview\s+invitation|application\s+(?:update|status)|next\s+steps?|offer|congratulations?|unsuccessful|rejected?)\s*$/i, '')
    .trim()

  // Remove company name prefix to leave just the program/role name
  if (company) {
    const compLow = company.toLowerCase()
    if (role.toLowerCase().startsWith(compLow)) {
      role = role.slice(company.length).replace(/^[\s,:\-]+/, '').trim()
    }
  }

  // Truncate at a word boundary to keep it readable
  if (role.length > 60) {
    const cut = role.slice(0, 60)
    const sp = cut.lastIndexOf(' ')
    role = sp > 40 ? cut.slice(0, sp) : cut
  }

  if (!role) return { role: '', roleSource: 'none' }
  return { role, roleSource: 'subject' }
}

// ── Application matching ─────────────────────────────────────────────────────

function normaliseStr(s) {
  return canonicalizeCompany(s).toLowerCase().replace(/[^a-z0-9]/g, '')
}

function significantTokens(s) {
  return (s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter(t => t.length >= 3)
    .filter(t => !['group', 'team', 'program', 'programme', 'role', 'intern', 'internship', 'graduate'].includes(t))
}

function matchToApplication(company, applications, role = '') {
  if (!company || !applications.length) return null
  const c = normaliseStr(company)
  const r = normaliseStr(role)

  // 1. Exact company + role match (same company, multiple roles)
  if (r) {
    for (const app of applications) {
      const a = normaliseStr(app.company)
      const ar = normaliseStr(app.role || '')
      if ((a.includes(c) || c.includes(a)) && ar && (ar.includes(r) || r.includes(ar))) return app.id
    }
  }

  // 2. Company-only match (includes substring — handles "Telstra Early" ↔ "Telstra")
  for (const app of applications) {
    const a = normaliseStr(app.company)
    if (a.includes(c) || c.includes(a)) return app.id
  }

  // 3. Token-overlap fallback for noisy ATS-derived company names
  const companyTokens = significantTokens(company)
  const roleTokens = significantTokens(role)
  for (const app of applications) {
    const appCompanyTokens = significantTokens(app.company)
    const appRoleTokens = significantTokens(app.role || '')
    const companyOverlap = companyTokens.filter(t => appCompanyTokens.includes(t)).length
    const roleOverlap = roleTokens.filter(t => appRoleTokens.includes(t)).length
    if (companyOverlap >= 1 && (roleTokens.length === 0 || roleOverlap >= 1)) return app.id
  }
  return null
}

// ── Deduplication ────────────────────────────────────────────────────────────
// Multiple emails about the same job → one result, most-advanced stage wins.

function groupKey(appId, company, role) {
  if (appId) return appId
  const cn = normaliseStr(company ?? 'unknown')
  const rn = normaliseStr(role ?? '')
  return rn ? `${cn}:${rn}` : `company:${cn}`
}

function mergeIntoGroup(existing, incoming) {
  // More advanced stage wins (Rejected always wins)
  const existOrder = STAGE_ORDER[existing.detectedStage] ?? 0
  const incomOrder = STAGE_ORDER[incoming.detectedStage] ?? 0
  if (incomOrder > existOrder) {
    existing.detectedStage = incoming.detectedStage
    existing.confidence = incoming.confidence
    existing.summary = incoming.summary
  }
  // Earlier due date wins
  if (incoming.dueDate && (!existing.dueDate || incoming.dueDate < existing.dueDate)) {
    existing.dueDate = incoming.dueDate
  }
  // completed beats pending (any evidence of completion overrides)
  if (incoming.assessmentStatus === 'completed') existing.assessmentStatus = 'completed'
  else if (incoming.assessmentStatus === 'pending' && !existing.assessmentStatus) existing.assessmentStatus = 'pending'
  // Accumulate source emails
  existing.sourceEmails.push(incoming.sourceEmails[0])
}

// ── Assessment / interview status ────────────────────────────────────────────

const COMPLETED_PATTERNS = [
  /feedback report/i,                          // post-OA feedback = definitely done
  /assessment.*feedback/i,
  /thank you for (completing|attending|sitting)/i,
  /completed.{0,20}(assessment|interview|test)/i,
  /(assessment|interview|test).{0,20}(completed|submitted|received)/i,
  /you have completed/i,
  /your performance/i,                         // "your performance across our key areas"
  /following (up on |your )?(recent )?interview/i,
  /after your (interview|assessment)/i,
  /your (interview|assessment) (with us )?on/i,
  /we (spoke|met|chatted) (earlier|recently|today)/i,
]

const PENDING_PATTERNS = [
  /invited?.{0,20}(complete|take|sit).{0,20}(assessment|test)/i,
  /please (complete|take|access).{0,20}(assessment|test)/i,
  /you have.{0,30}(days?|hours?).{0,20}(complete|finish)/i,
  /reminder.{0,40}(assessment|interview)/i,  // OA reminder = still pending
  /(assessment|interview).{0,40}reminder/i,
  /if you have not (already|yet)/i,           // "if you have not already completed"
  /invited?.{0,20}interview/i,
  /schedule.{0,20}interview/i,
  /book.{0,20}interview/i,
  /interview.{0,20}(scheduled|confirmed|booked)/i,
]

function detectAssessmentStatus(subject, snippet) {
  const text = `${subject} ${snippet}`
  if (COMPLETED_PATTERNS.some(p => p.test(text))) return 'completed'
  if (PENDING_PATTERNS.some(p => p.test(text))) return 'pending'
  // Default: if stage is OA/VI from an invite, assume pending
  return 'pending'
}

// ── Main export ──────────────────────────────────────────────────────────────

const STAGE_SUMMARIES = {
  'Applied': 'Application received confirmation',
  'Online Assessment': 'Invited to complete an online assessment',
  'Video Interview': 'Interview invitation received',
  'Assessment Centre': 'Invited to assessment centre',
  'Offer': 'Job offer received',
  'Rejected': 'Application unsuccessful',
}

export async function classifyEmails(emails, applications, knownIds = [], userTimeZone = 'UTC') {
  const knownSet = new Set(knownIds)
  const skippedKnown = knownSet.size ? emails.filter(e => knownSet.has(e.id)).length : 0
  if (skippedKnown > 0)
    console.log(`[classifier] Found ${skippedKnown} already-synced emails (used for context only)`)

  const groups = new Map()

  for (const email of emails) {
    const isKnown = knownSet.has(email.id)
    const bodyOrSnippet = email.bodyText ?? email.snippet
    const { stage, confidence } = detectStage(email.subject, bodyOrSnippet)
    const company = extractCompany(email.from, email.subject, bodyOrSnippet)
    const { role, roleSource } = extractRole(email.subject, company, bodyOrSnippet)
    const appId = matchToApplication(company, applications, role)
    const dueDate = extractDueDate(email.subject, bodyOrSnippet, email.date, userTimeZone)

    const isAssessmentStage = stage === 'Online Assessment' || stage === 'Video Interview'
    const assessmentStatus = isAssessmentStage ? detectAssessmentStatus(email.subject, bodyOrSnippet) : null

    const result = {
      appId,
      company: company ?? email.from,
      role,
      roleSource,
      detectedStage: stage,
      confidence,
      summary: STAGE_SUMMARIES[stage],
      dueDate,
      assessmentStatus,
      sourceEmails: [{
        id: email.id,
        subject: email.subject,
        from: email.from,
        date: email.date,
        snippet: email.snippet,
      }],
    }

    const key = groupKey(appId, company, role)

    if (groups.has(key)) {
      const existing = groups.get(key)
      mergeIntoGroup(existing, result)
      if (!isKnown) existing.hasFresh = true
    } else {
      groups.set(key, { ...result, hasFresh: !isKnown })
    }

    console.log(`[classifier] ${company ?? '?'} → ${stage} (${confidence})${dueDate ? ` due:${dueDate}` : ''} | "${email.subject}"`)
  }

  const results = Array.from(groups.values())
    .filter(r => r.hasFresh)
    .map(({ hasFresh, ...rest }) => rest)

  return { results, skippedKnown }
}
