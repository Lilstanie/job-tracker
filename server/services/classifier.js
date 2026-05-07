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
      /not a match for what we(?:'|’)re looking for/i,
      /not a match for what we are looking for/i,
      /won(?:'|’)t be progressing your application/i,
      // Polite HR templates: thanks in subject/body but decline in body (iCIMS, Workday, etc.)
      /not to progress your application/i,
      /not to progress.{0,80}next stage/i,
      /decided on this occasion not to/i,
      /pursue other candidates/i,
      /decided to pursue other candidates/i,
      /other candidates who more closely match/i,
      // High-volume "no individual feedback" boilerplate — almost exclusively rejection.
      // The combined pattern below requires the explicit "unable to provide" follow-up
      // because the standalone "due to high volume of applications" phrase also appears
      // in legitimate Applied confirmations (e.g. Mastercard: "due to the high volume of
      // applications we receive, we may not reach out — check Workday for status").
      /unable to (?:provide|offer|give)\s+(?:individual|personal|specific|detailed)\s+feedback/i,
      /(?:high\s+)?volume\s+of\s+applications.{0,40}(?:unable|cannot|can(?:'|’)t)\s+(?:to\s+)?(?:provide|offer|give)/i,
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
  const likelyMarketingOffer = /\boffer\b/i.test(text) && /(linkedin premium|discount|% off|save\s+\d+%|months?\s+of\s+premium|newsletter)/i.test(text)
  if (likelyMarketingOffer) return { stage: 'Applied', confidence: 'low' }

  // Many rejections open with "Thank you for applying" / "Thanks for your interest"
  // but then decline — run explicit decline phrases before Applied heuristics.
  const politeRejectionPatterns = [
    /not to progress your application/i,
    /not to progress.{0,80}next stage/i,
    /decided on this occasion not to/i,
    /pursue other candidates/i,
    /decided to pursue other candidates/i,
    /other candidates who more closely match/i,
    /unable to (?:provide|offer|give)\s+(?:individual|personal|specific|detailed)\s+feedback/i,
    /(?:high\s+)?volume\s+of\s+applications.{0,40}(?:unable|cannot|can(?:'|’)t)\s+(?:to\s+)?(?:provide|offer|give)/i,
  ]
  if (politeRejectionPatterns.some(p => p.test(text))) {
    return { stage: 'Rejected', confidence: 'high' }
  }

  const hasAssessmentSignal = /online assessment|online assessments|assessment invitation|complete your online assessments|complete.*assessment|hackerrank|codility|pymetrics|hirevue|korn ferry/i.test(text)
  const hasInterviewSignal = /video interview|phone interview|telephone interview|interview invitation|invited.*interview|schedule.*interview|interview.*schedule/i.test(text)
  const isAssessmentLead = /assessment invitation|next steps:\s*complete your online assessments|complete your online assessments|round\s*\d+/i.test(text)

  // Avoid prematurely upgrading OA invitation emails to interview stage.
  if (hasAssessmentSignal && (!hasInterviewSignal || isAssessmentLead)) {
    return { stage: 'Online Assessment', confidence: 'high' }
  }

  for (const { stage, patterns } of STAGE_RULES) {
    if (patterns.some(p => p.test(text))) return { stage, confidence: 'high' }
  }
  if (/\binterview\b/i.test(text)) return { stage: 'Video Interview', confidence: 'medium' }
  if (/\bassessment\b/i.test(text)) return { stage: 'Online Assessment', confidence: 'medium' }
  if (/\boffer\b/i.test(text)) return { stage: 'Offer', confidence: 'medium' }
  if (/\bapplication\b/i.test(text)) return { stage: 'Applied', confidence: 'medium' }
  return { stage: 'Applied', confidence: 'low' }
}

function cleanRoleText(rawRole = '') {
  let role = rawRole
    .replace(/^reminder[:\s-]*/i, '')
    .replace(/^interview\s+complete\s*[-–—:]?.*$/i, '')
    .replace(/\bJR[-_\s]?\d+\b/gi, '') // remove req IDs like JR-10164745
    .replace(/\([^)]*\)/g, '') // drop bracketed qualifiers for stable grouping
    .replace(/\binterview\s+with\s+[A-Za-z][A-Za-z0-9&.\- ]{1,30}$/i, '')
    .replace(/\s+at\s+[A-Za-z][A-Za-z0-9&.\- ]{1,30}$/i, '')
    .replace(/^application\s+outcome\s*[-–—:]?\s*/i, '')
    .replace(/^(our|the)\s+/i, '')
    .replace(/\b(application\s+(?:received|outcome|update|status)|thanks?\s+for\s+(?:your\s+)?application)\b/gi, '')
    .replace(/\b(role|position)\b$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return role
}

function cleanCompanyText(raw = '') {
  return String(raw || '')
    .replace(/^@+/, '')
    .replace(/\b(no[\s.-]?reply|noreply|notification|notifications|unsubscribe)\b/gi, '')
    .replace(/\b(application\s+outcome|application\s+update|application\s+received)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// True for umbrella program labels that could refer to many specific positions
// at the same company, e.g. "Graduate Academy", "Internship Programme", "2027
// Graduate Pathway". Treated as noisy so a concrete sibling absorbs them.
const UMBRELLA_ROLE_RE = /^(?:\d{4}\s+)?(?:graduate|internship|intern|early\s+career|cadetship|trainee|campus)\s+(?:program|programme|scheme|academy|pathway|pool|recruitment|cadetship)\s*$/i

function isUmbrellaRole(role = '') {
  const r = cleanRoleText(role).toLowerCase().trim()
  if (!r) return false
  return UMBRELLA_ROLE_RE.test(r)
}

function isNoisyRole(role = '') {
  const r = cleanRoleText(role).toLowerCase()
  if (!r) return true
  if (r.length < 6) return true
  if (/^(application|application outcome|application update|thank you|thanks|job|email|mail|reminder)$/i.test(r)) return true
  // Sentence-like fillers that are not a real role label
  if (/^(?:thanks?\s+(?:you\s+)?for|thank\s+you|you\s+are\s+invited|invited\s+to|update\s+on|reminder|next\s+steps?|application\s+(?:outcome|received|update|status))\b/i.test(r)) return true
  if (UMBRELLA_ROLE_RE.test(r)) return true
  return false
}

function isNoisyCompanyLabel(name = '') {
  const n = String(name || '').toLowerCase()
  if (!n) return true
  if (GENERIC_COMPANY_NAMES.has(n)) return true
  return /(outcome of your application|your application for|application outcome|application received|thank you for your application)/i.test(n)
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
    // "you only / will / 'll / may / might have 72 hours"
    /\byou(?:'ll|\s+(?:only|will|may|might))?\s+have\s+(\d+)\s*(hours?|days?)/i,
    // "48 hour(s) to submit" — accepts the literal "(s)" plural suffix HireVue uses
    /\b(\d+)\s*(hours?|days?)(?:\(s\))?\s+to\s+(?:complete|respond|access|finish|submit)/i,
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

// ── Job-alert / aggregator filter ────────────────────────────────────────────

// Domains that exclusively send broadcast "applications open / closing soon /
// apply now" reminders rather than per-applicant status updates. Any email
// from these senders is treated as marketing noise and dropped before
// classification runs — it must not pollute timelines, hijack due-date
// extraction, or attach itself to an existing application.
const JOB_ALERT_DOMAINS = new Set([
  'gradconnection.com', 'gradconnection.com.au',
  'prosple.com',
  'gradaustralia.com', 'gradaustralia.com.au',
  'seekgrad.com.au',
  'studentedge.org',
  'mygradcareer.com',
])

// Specific from-addresses on otherwise-mixed domains (LinkedIn, Indeed,
// Glassdoor send both real notifications and job alerts — the local-part is
// the discriminator). These are the alert/digest aliases — a real LinkedIn
// Easy-Apply confirmation from a company would not use these addresses.
const JOB_ALERT_FROM_PATTERNS = [
  // LinkedIn job-alert / digest aliases
  /^jobs?-listings@linkedin\.com$/i,
  /^jobalerts-noreply@linkedin\.com$/i,
  /^jobs-noreply@linkedin\.com$/i,
  /^job-alerts@linkedin\.com$/i,
  /^linkedinjobs@linkedin\.com$/i,
  /^recruiternotifications@linkedin\.com$/i,
  // Indeed job alerts
  /^alert@indeed\.com$/i,
  /^jobalerts@indeed\.com$/i,
  /^noreply@indeed\.com$/i,
  /^donotreply@my\.indeed\.com$/i,
  // Glassdoor job alerts
  /^jobalerts@glassdoor\.com$/i,
  /^noreply@glassdoor\.com$/i,
]

// Subject phrases that mark an email as recruitment-marketing about an open
// round rather than a per-applicant status update. Conservative on purpose:
// must occur at the very start of the subject so legitimate "Reminder: …" or
// "Last chance to complete your interview" subjects are not swept up.
const JOB_ALERT_SUBJECT_RE = /^\s*(?:closing soon|applications? clos[ei]|apply now|last chance to apply|don['']?t miss out|now hiring|we['']re hiring|join (?:us|our team))\b[\s:!]/i

function getEmailAddress(from) {
  if (!from) return null
  const angle = String(from).match(/<([^>]+)>/)
  const addr = angle ? angle[1] : String(from).match(/([^\s<>]+@[^\s<>]+)/)?.[1]
  return addr ? addr.toLowerCase() : null
}

function getEmailDomain(from) {
  const addr = getEmailAddress(from)
  if (!addr) return null
  const at = addr.indexOf('@')
  if (at < 0) return null
  return addr.slice(at + 1)
}

function isJobAlertEmail(email) {
  const addr = getEmailAddress(email?.from)
  if (addr && JOB_ALERT_FROM_PATTERNS.some((re) => re.test(addr))) return true
  const domain = getEmailDomain(email?.from)
  if (domain) {
    if (JOB_ALERT_DOMAINS.has(domain)) return true
    for (const d of JOB_ALERT_DOMAINS) {
      if (domain.endsWith('.' + d)) return true
    }
  }
  return JOB_ALERT_SUBJECT_RE.test(String(email?.subject ?? ''))
}

// ── Company extraction ───────────────────────────────────────────────────────

// Domain parts that belong to ATS/assessment platforms — never the actual employer
const ATS_DOMAIN_PARTS = new Set([
  'jobadder', 'greenhouse', 'workday', 'lever', 'smartrecruiters', 'taleo', 'icims',
  'gradweb', 'gradweb1', 'weareamberjack', 'hirevue', 'hirevue-app', 'pymetrics', 'shl', 'fusiongc',
  'hackerrank', 'codility', 'cut', 'aon', 'korn', 'kornferry', 'criteriacorp',
  'hiredscore', 'vervoe', 'bamboohr', 'recruitee', 'jobvite', 'successfactors',
  'applytojob', 'recruitcrm', 'seek', 'linkedin', 'indeed', 'talent', 'myworkdayjobs', 'myworkday',
  'pageuppeople', 'pageup', 'avature', 'breezy', 'workable',
])

const GENERIC_COMPANY_NAMES = new Set([
  'your', 'you', 'team', 'talent team', 'hiring team', 'recruitment team',
  'careers', 'notifications', 'no-reply', 'noreply', 'info', 'online', 'reminder',
  'mail', 'email', 'job', 'application', 'application outcome', 'workday', 'name', 'graduate', 'system',
  // Generic role-modifier words that should never be returned as company names
  'student', 'students', 'senior', 'junior', 'associate', 'principal', 'lead',
  'intern', 'interns', 'internship', 'engineer', 'analyst', 'developer',
  'hire', 'hired', 'apply', 'recruit', 'recruiter', 'recruiting',
])

const COMPANY_ALIAS_RULES = [
  { pattern: /\b(cba|commbank|commonwealth\s*bank(?:\s*group)?)\b/i, canonical: 'Commonwealth Bank' },
  { pattern: /\bexamplebanka\b|example bank a/i, canonical: 'Example Bank A' },
  { pattern: /\bexamplebankb\b|example bank b/i, canonical: 'Example Bank B' },
  { pattern: /\bconsultingfirm\b/i, canonical: 'Consulting Firm' },
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
  let name = cleanCompanyText(raw)
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/<.*?>/g, '')
    .replace(/\b(no[\s.-]?reply|noreply|notifications?)\b/gi, '')
    .replace(/\s+@\s*(?:icims|workday|greenhouse|lever|smartrecruiters)\b.*$/i, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    // Strip trailing program/program-stage suffixes that get baked into ATS
    // display names. e.g. "Quantium Graduate Academy" → "Quantium".
    .replace(/\s+(?:graduate|early\s+career|internship|cadetship|talent|recruitment|recruiting)\s+(?:program|programme|scheme|academy|pathway|pool|pipeline)\s*$/i, '')
    .replace(/\s+(?:recruitment|recruiting|hiring|talent|careers?)\s+team\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  if (!name) return null
  const low = name.toLowerCase()
  if (isNoisyCompanyLabel(low)) return null
  if (/^[^@\s]+@[^@\s]+$/.test(name)) return null
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(name)) return null // raw domain-like label
  if (name.length < 2) return null
  return canonicalizeCompany(name)
}

function inferCompanyFromSubject(subject = '') {
  const s = subject.trim()
  const hiring = s.match(/^([A-Za-z][A-Za-z0-9&.\- ]{2,50}?)\s+is\s+hiring\b/i)
  if (hiring) return sanitiseCompanyName(hiring[1])
  const roleAt = s.match(/\b(?:for|with|at)\s+([A-Za-z][A-Za-z0-9&.\- ]{2,40})(?:\s*[-|:,(]|\s*$)/i)
  if (roleAt) return sanitiseCompanyName(roleAt[1])
  return null
}

function extractSubjectCompany(subject) {
  if (!subject) return null
  const s = subject.replace(/^\d{4}\s+/, '') // strip leading year
  if (/^outcome of your application/i.test(s)) return null

  // "<Company> - Your Feedback Report", "<Company>: Application update"
  const prefixMatch = s.match(/^(.{2,40}?)\s*[-|:]\s*(?:your|application|feedback|online|video|interview|assessment|graduate|campus)/i)
  if (prefixMatch) {
    const c = sanitiseCompanyName(prefixMatch[1])
    if (c) return c
  }

  // "Citadel's Campus 27 - Australia Software Engineering | Intern role"
  const possessiveProgram = s.match(/^([A-Za-z][A-Za-z0-9&.\s]{1,30})'?s\s+(?:campus|graduate|internship|intern)/i)
  if (possessiveProgram) {
    const c = sanitiseCompanyName(possessiveProgram[1])
    if (c) return c
  }

  // "COMPANY Graduate Program/Programme/Scheme/Academy/Pathway/Pool"
  // Includes "Graduate Academy" (Quantium), "Graduate Pathway" (some banks), etc.
  const programMatch = s.match(/^(.{3,40}?)\s+(?:graduate\s+(?:program|programme|scheme|academy|pathway|pool|cadetship)|internship\s+(?:program|programme)|early\s+career\s+program)/i)
  if (programMatch) {
    const c = sanitiseCompanyName(programMatch[1])
    if (c) return c
  }

  // "Interview with <Company>", "Assessment with <Company>"
  const withMatch = subject.match(/(?:interview|assessment|offer)\s+with\s+([A-Za-z][A-Za-z\s&.]{1,25}?)(?:\s*[-–,]|\s*$)/i)
  if (withMatch) {
    const c = sanitiseCompanyName(withMatch[1])
    if (c) return c
  }

  // "Thanks/Thank you for your interest in <Company>!"
  // Recruiter-routed emails (Lever / Greenhouse) often only mention the real
  // employer in the subject; the from-domain is the ATS.
  const interestInMatch = s.match(/(?:thanks?\s+(?:you\s+)?for\s+(?:your\s+)?interest\s+in|interested\s+in)\s+([A-Za-z][A-Za-z0-9&.\- ]{1,40}?)\s*[!.?]?\s*$/i)
  if (interestInMatch) {
    const c = sanitiseCompanyName(interestInMatch[1])
    if (c) return c
  }

  // "Application Outcome - 2026 Graduate ... at <Company>"
  const atMatch = s.match(/\bat\s+([A-Za-z][A-Za-z0-9&.\- ]{1,35}?)(?:\s*[-|:,(]|\s*$)/i)
  if (atMatch) {
    const c = sanitiseCompanyName(atMatch[1])
    if (c) return c
  }

  // "<Company> for <Role>" — e.g. "ResMed for Student Intern - Software Engineer".
  // Capture only when the leading token clearly looks like a brand (TitleCase /
  // ALLCAPS with no spaces, optional CamelCase). This avoids dragging in
  // generic prefixes like "Application for ...".
  const xForRoleMatch = s.match(/^([A-Z][A-Za-z0-9&.]{2,30})\s+for\s+/)
  if (xForRoleMatch) {
    const c = sanitiseCompanyName(xForRoleMatch[1])
    if (c) return c
  }

  // "Next Steps ... for the NBN Graduate Program".
  // We rely on isNoisyCompanyLabel (via sanitiseCompanyName) to reject generic
  // role-modifier captures like "student" / "senior".
  const forProgramMatch = s.match(/\bfor\s+(?:the\s+)?([A-Za-z][A-Za-z0-9&.\- ]{1,28}?)\s+(?:graduate|intern|program|programme|role|position)\b/i)
  if (forProgramMatch) {
    const c = sanitiseCompanyName(forProgramMatch[1])
    if (c) return c
  }

  // "<ABC> Feedback Report", "<ABC> Online Assessment" — short acronym/name before action word
  const headMatch = s.match(/^([A-Z]{2,10})\s+(?:feedback|online|video|interview|assessment|offer|application|early)/i)
  if (headMatch) {
    const c = sanitiseCompanyName(headMatch[1])
    if (c) return c
  }

  return null
}

// Words that strongly imply "this is a company name, not a person".
const COMPANY_INDICATOR_WORDS = new Set([
  'company', 'companies', 'corp', 'corporation', 'inc', 'incorporated',
  'ltd', 'limited', 'llc', 'plc', 'gmbh', 'pty',
  'group', 'holdings', 'holding', 'bank', 'banking',
  'tech', 'technologies', 'technology', 'solutions', 'industries', 'industry',
  'systems', 'system', 'labs', 'lab', 'software', 'hardware',
  'services', 'service', 'consulting', 'consultancy', 'agency',
  'partners', 'associates', 'capital', 'ventures', 'fund', 'asset', 'assets',
  'networks', 'network', 'media', 'digital', 'global', 'international',
  'insurance', 'financial', 'finance', 'securities', 'investments', 'investment',
  'advisors', 'advisor', 'enterprises', 'enterprise',
  'telecom', 'telecoms', 'telecommunications', 'recruitment', 'recruiting',
  'hiring', 'talent', 'careers', 'career', 'jobs', 'graduates', 'graduate',
  'department', 'team', 'firm', 'studio', 'works', 'power', 'energy',
  'health', 'healthcare', 'pharma', 'pharmaceutical', 'biotech',
  'automotive', 'aerospace', 'defence', 'defense', 'retail', 'education',
  'university', 'institute', 'foundation', 'commonwealth', 'mutual',
  'radar', 'finance', 'mining', 'resources', 'materials',
  // Geographies often baked into corporate names — "Airservices Australia",
  // "ANZ New Zealand", "BMW USA", "Toyota Japan". A two-word display name with
  // a country/region word is a brand, not a person.
  'australia', 'australian', 'usa', 'us', 'america', 'american',
  'uk', 'britain', 'british', 'england', 'european',
  'canada', 'canadian', 'nz', 'zealand',
  'asia', 'pacific', 'apac', 'emea', 'anz',
  'singapore', 'india', 'indian', 'china', 'chinese',
  'japan', 'japanese', 'korea', 'korean',
  'germany', 'german', 'france', 'french', 'spain', 'spanish', 'italy', 'italian',
])

function looksLikePersonName(name) {
  if (!name) return false
  const cleaned = name.replace(/[^A-Za-z\s'-]/g, ' ').replace(/\s+/g, ' ').trim()
  const parts = cleaned.split(' ').filter(Boolean)
  if (parts.length < 2 || parts.length > 3) return false
  const allTitleCase = parts.every(p => /^[A-Z][a-z'-]+$/.test(p))
  if (!allTitleCase) return false
  // If any word reads as a company indicator, this is a brand, not a person.
  return !parts.some(p => COMPANY_INDICATOR_WORDS.has(p.toLowerCase()))
}

function looksLikeNonCompanyLabel(name) {
  if (!name) return false
  const n = name.toLowerCase()
  if (/\b(application|outcome|role|position|internship|graduate|engineer|software)\b/.test(n)) return true
  if (/\b(our|your)\b/.test(n)) return true
  if (n.length > 40) return true
  return false
}

// Heuristics for ATS tenant slugs that should NOT be returned as a company.
// Examples seen in the wild:
//   wd5-impl-services1.myworkday.com → "wd5-impl-services1" → tenant code
//   productsdc66pr1.workday.com      → "productsdc66pr1"    → tenant code
//   anz.greenhouse.io                → "anz"                → could be tenant
//   hire.lever.co                    → "hire"               → ATS subdomain
function looksLikeAtsTenantSlug(part) {
  const p = String(part || '').toLowerCase()
  if (!p) return true
  // Mixed letters+digits with digits in the middle/end → almost certainly a tenant code.
  if (/^[a-z]{2,}\d+[a-z0-9-]*$/.test(p)) return true
  if (/^[a-z]+-\w*\d+\w*$/.test(p)) return true
  if (/\bdc\d+/.test(p) || /\bwd\d+/.test(p)) return true
  // Generic ATS subdomain prefixes
  if (['hire', 'jobs', 'careers', 'apply', 'recruit', 'recruiting', 'talent', 'ats', 'taleo', 'mail', 'email', 'noreply', 'no-reply'].includes(p)) return true
  return false
}

function extractCompanyFromDomain(from) {
  const emailMatch = from.match(/@([\w.-]+)/)
  if (!emailMatch) return null
  const fullDomain = emailMatch[1].toLowerCase()
  const parts = fullDomain.split('.')
  const TLDS = ['com', 'au', 'co', 'uk', 'gov', 'edu', 'org', 'net', 'io', 'ai', 'us', 'nz', 'sg', 'in']
  // If the right-most labels match a known ATS (e.g. greenhouse.io, lever.co,
  // workday.com, myworkday.com), the left-most label is a tenant slug, not the
  // employer. Returning null forces the caller to fall back to subject parsing.
  for (let i = 0; i < parts.length - 1; i++) {
    if (ATS_DOMAIN_PARTS.has(parts[i])) {
      // Everything before the ATS label is a tenant slug — don't trust it.
      return null
    }
  }
  const name = parts.find(p =>
    !ATS_DOMAIN_PARTS.has(p) &&
    !TLDS.includes(p) &&
    !looksLikeAtsTenantSlug(p) &&
    p.length > 2
  )
  if (!name) return null
  return sanitiseCompanyName(name.charAt(0).toUpperCase() + name.slice(1))
}

function extractCompany(from, subject = '', bodyText = '') {
  // SEEK-style confirmation body: "successfully submitted to COMPANY."
  // More reliable than from-address parsing for SEEK-routed emails
  const seekBodyMatch = bodyText.match(/successfully submitted to ([^\.\n\r]{2,80})/i)
  if (seekBodyMatch) {
    const co = sanitiseCompanyName(seekBodyMatch[1].trim().replace(/\s+/g, ' '))
    if (co) return co
  }

  const subjectName = extractSubjectCompany(subject)

  // 1. Display name (most reliable when present)
  let displayName = null
  const displayMatch = from.match(/^"?([^"<]+)"?\s*</i)
  if (displayMatch) {
    let name = displayMatch[1].trim()
      // Strip noisy role/program/contact suffix words that ATS tools tack on to the
      // company name. e.g. "Quantium Graduate Recruitment" / "Quantium Submittals".
      .replace(/\b(recruitment|recruiter|careers|career|talent|hr|hiring|team|noreply|no.reply|jobs?|apply|notifications?|early|graduates?|submittals?|submission|programmes?|programs?|academy|academies|internship|intern|scheme|pathway|pool|trainee|cadetship|onboarding|admin)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    const clean = sanitiseCompanyName(name)
    if (clean && !ATS_DOMAIN_PARTS.has(clean.toLowerCase())) displayName = clean
  }

  if (displayName) {
    // Recruiter personal names are not company names. If we cannot find a
    // better source, fall through to subject inference / "Unknown" — never
    // return the recruiter's name as the company.
    if (looksLikePersonName(displayName)) {
      if (subjectName && !isNoisyCompanyLabel(subjectName)) return subjectName
      const domainName = extractCompanyFromDomain(from)
      if (domainName) return domainName
      return null
    }
    // Prefer domain company when display name is noisy.
    if (looksLikeNonCompanyLabel(displayName)) {
      const domainName = extractCompanyFromDomain(from)
      if (domainName) return domainName
    }
    return displayName
  }

  // Use subject-derived company only when we don't have a better sender label.
  if (subjectName && !isNoisyCompanyLabel(subjectName)) return subjectName

  // 3. Email local-part hint: "nabearlycareertalent@..." → extract leading word before "early/careers/talent/jobs"
  const localMatch = from.match(/^[^@]*?([a-z]{2,8})(?:early|careers?|talent|jobs?|grads?|recruit)\b/i)
  if (localMatch) return sanitiseCompanyName(localMatch[1].toUpperCase())

  // 4. Email domain — skip ATS platform parts and generic TLDs
  const domainName = extractCompanyFromDomain(from)
  if (domainName) return domainName

  return null
}

// ── Role extraction ───────────────────────────────────────────────────────────

// Returns { role, roleSource } where roleSource is:
//   'explicit' — extracted from a labelled field or body pattern (high confidence)
//   'subject'  — best-effort strip of the email subject line (medium confidence)
//   'none'     — nothing useful extracted
function extractRole(subject, company, bodyText = '') {
  const fullText = `${subject} ${bodyText}`

  // Outcome format: "Outcome of your application for the Graduate Program | X | Y"
  const outcomeRoleInSubject = subject.match(/outcome of your application for (?:the\s+)?([^\n\r]{8,140})/i)
  if (outcomeRoleInSubject) {
    const cleaned = cleanRoleText(outcomeRoleInSubject[1].trim().replace(/\s+/g, ' '))
    if (cleaned) return { role: cleaned.slice(0, 100), roleSource: 'explicit' }
  }

  // Body format: "... application for Graduate Program | X | Y."
  const outcomeRoleInBody = bodyText.match(/application for\s+([^\n\r.]{8,140}\|[^\n\r.]{3,140})/i)
  if (outcomeRoleInBody) {
    const cleaned = cleanRoleText(outcomeRoleInBody[1].trim().replace(/\s+/g, ' '))
    if (cleaned) return { role: cleaned.slice(0, 100), roleSource: 'explicit' }
  }

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

  // "applying to the 2027 <Company> Graduate Program" style
  const applyMatch = fullText.match(/(?:applying\s+to\s+(?:the\s+)?|applied\s+for\s+(?:the\s+)?|your\s+application\s+(?:for|to)\s+(?:the\s+)?)(\d{0,5}\s*[A-Z][^.]{4,80}?(?:program|programme|pathway|stream|position|role|internship))/i)
  if (applyMatch) {
    const cleaned = cleanRoleText(applyMatch[1].trim().replace(/\s+/g, ' '))
    return { role: cleaned.slice(0, 100), roleSource: 'explicit' }
  }

  // "apply for the JR-10164745 2027 Graduate Program - Software Engineering role"
  const applyForRoleMatch = fullText.match(/apply(?:ing)?\s+for\s+(?:the\s+)?([A-Za-z0-9\- ]{4,140}?(?:program|programme|pathway|stream|position|role|internship))/i)
  if (applyForRoleMatch) {
    const cleaned = cleanRoleText(applyForRoleMatch[1].trim().replace(/\s+/g, ' '))
    if (cleaned) return { role: cleaned.slice(0, 100), roleSource: 'explicit' }
  }

  // "received your application for our 2026 Graduate Software Engineer role"
  const receivedForOurMatch = fullText.match(/(?:received|review(?:ed|ing)?).{0,40}application\s+for\s+(?:our|the)\s+([A-Za-z0-9][^.]{4,90}?(?:program|programme|pathway|stream|position|role|internship))/i)
  if (receivedForOurMatch) {
    const cleaned = cleanRoleText(receivedForOurMatch[1].trim().replace(/\s+/g, ' '))
    return { role: cleaned.slice(0, 100), roleSource: 'explicit' }
  }

  // SuccessFactors/HR template: "interest in the position of <Role>."
  const interestInPositionMatch = bodyText.match(/interest in the position of\s+([^\n\r.]{6,140})/i)
  if (interestInPositionMatch) {
    const cleaned = cleanRoleText(interestInPositionMatch[1].trim().replace(/\s+/g, ' '))
    if (cleaned) return { role: cleaned.slice(0, 100), roleSource: 'explicit' }
  }

  // "interest in [the] <Role> position at <Company>" — HireVue/Workday templates
  // e.g. "Thank you for your interest in the Graduate Software Engineer - 2027 position at Quantium."
  const positionAtMatch = bodyText.match(/interest\s+in\s+(?:the\s+)?([A-Za-z0-9][^.\n\r]{2,90}?)\s+position\s+(?:at|with)\s+/i)
  if (positionAtMatch) {
    const candidate = cleanRoleText(positionAtMatch[1].trim().replace(/\s+/g, ' '))
    if (candidate && !/^(our|the|this|a|an)\b/i.test(candidate) && candidate.length >= 4) {
      return { role: candidate.slice(0, 100), roleSource: 'explicit' }
    }
  }

  // Generic "interest in <Role> at <Company>" / "interest in <Role> with <Company>"
  // Used by Citadel-style rejections that don't include the role in the subject.
  // Captures e.g. "FPGA Engineering" out of "Thank you for your interest in
  // FPGA Engineering at Citadel | Citadel Securities."
  const interestInAtMatch = bodyText.match(/(?:thanks?\s+(?:you\s+)?for\s+your\s+)?interest\s+in\s+([A-Z][^.\n\r]{3,80}?)\s+(?:at|with)\s+/i)
  if (interestInAtMatch) {
    const candidate = cleanRoleText(interestInAtMatch[1].trim().replace(/\s+/g, ' '))
    // Skip generic phrases like "our company" / "the position".
    if (candidate && !/^(our|the|this|a|an)\b/i.test(candidate) && candidate.length >= 4) {
      return { role: candidate.slice(0, 100), roleSource: 'explicit' }
    }
  }

  // Citadel-style decision body: "moving forward with your candidacy for <Role> at <Company>"
  const candidacyForMatch = bodyText.match(/(?:candidacy|application)\s+for\s+([A-Z][^.\n\r]{3,80}?)\s+at\s+/i)
  if (candidacyForMatch) {
    const candidate = cleanRoleText(candidacyForMatch[1].trim().replace(/\s+/g, ' '))
    if (candidate && candidate.length >= 4) {
      return { role: candidate.slice(0, 100), roleSource: 'explicit' }
    }
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
  role = cleanRoleText(role)

  // Remove company name prefix to leave just the program/role name
  if (company) {
    const compLow = company.toLowerCase()
    if (role.toLowerCase().startsWith(compLow)) {
      role = role.slice(company.length).replace(/^[\s,:\-]+/, '').trim()
    }
  }

  // Strip leading conjunctive words that survive the company-prefix removal,
  // e.g. "for Student Intern - Software Engineer" → "Student Intern - Software Engineer".
  role = role.replace(/^(?:for|to|the|a|an)\s+/i, '').trim()

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

// ── Role taxonomy (role bank) ────────────────────────────────────────────────
// Canonical role categories with aliases. Used to decide whether two roles at
// the same company describe the same position (merge) or different positions
// (keep separate, e.g. Citadel "Software Engineering" vs "FPGA Engineering").
//
// Add to this list when a new alias appears in the wild — it's intentionally
// data-driven so we don't have to touch the matching code for new variants.
const ROLE_CATEGORIES = [
  {
    canonical: 'Software Engineer',
    aliases: [
      'software engineer', 'software engineering', 'swe', 'sde',
      'software developer', 'software development engineer', 'sw engineer',
      'application engineer', 'application developer',
      'backend engineer', 'back-end engineer', 'back end engineer',
      'frontend engineer', 'front-end engineer', 'front end engineer',
      'full stack engineer', 'full-stack engineer', 'fullstack engineer',
      'mobile engineer', 'ios engineer', 'android engineer',
      'systems engineer', 'systems software',
    ],
  },
  {
    canonical: 'FPGA / Hardware Engineer',
    aliases: [
      'fpga engineer', 'fpga engineering', 'fpga developer', 'fpga design',
      'firmware engineer', 'embedded engineer', 'embedded software',
      'hardware engineer', 'hardware design', 'asic engineer', 'rtl engineer',
      'chip design', 'silicon engineer',
    ],
  },
  {
    canonical: 'Data Scientist / ML Engineer',
    aliases: [
      'data scientist', 'data science',
      'machine learning engineer', 'ml engineer', 'ml researcher',
      'ai engineer', 'ai/ml engineer', 'ai researcher',
      'applied scientist', 'research scientist',
    ],
  },
  {
    canonical: 'Data Analyst',
    aliases: [
      'data analyst', 'data analytics',
      'analytics analyst', 'reporting analyst',
    ],
  },
  {
    canonical: 'Business Analyst',
    aliases: [
      'business analyst', 'business intelligence', 'bi analyst',
      'business systems analyst', 'process analyst',
    ],
  },
  {
    canonical: 'Data Engineer',
    aliases: [
      'data engineer', 'data engineering', 'analytics engineer',
      'etl engineer', 'pipeline engineer',
    ],
  },
  {
    canonical: 'Test Analyst',
    aliases: [
      // Manual / process-focused QA — usually distinct from automation-heavy
      // SDET / QA Engineer roles in AU/NZ recruiting.
      'test analyst', 'qa analyst',
    ],
  },
  {
    canonical: 'QA / Test Engineer',
    aliases: [
      'qa engineer', 'quality assurance engineer', 'qa automation',
      'test engineer', 'software test engineer',
      'sdet', 'software development engineer in test',
      'automation tester', 'automation engineer in test',
    ],
  },
  {
    canonical: 'DevOps / SRE',
    aliases: [
      'devops', 'devops engineer', 'site reliability', 'site reliability engineer',
      'sre', 'platform engineer', 'platform engineering',
      'infrastructure engineer', 'cloud engineer',
    ],
  },
  {
    canonical: 'Security Engineer',
    aliases: [
      'security engineer', 'cyber security', 'cybersecurity',
      'cyber engineer', 'cyber analyst', 'infosec', 'application security',
      'soc analyst', 'penetration tester', 'pen tester',
    ],
  },
  {
    canonical: 'Quantitative Researcher',
    aliases: [
      'quantitative researcher', 'quant researcher',
      'quantitative research', 'quant research',
      'quantitative analyst', 'quant analyst',
      'quantitative trader', 'quant trader',
      'quantitative developer', 'quant developer', 'quant dev',
    ],
  },
  {
    canonical: 'Trader',
    aliases: [
      'trader', 'trading analyst', 'execution trader',
      'sales and trading', 'sales & trading',
    ],
  },
  {
    canonical: 'Investment Banking',
    aliases: [
      'investment banking', 'investment banker', 'ib analyst',
      'corporate finance', 'm&a', 'mergers and acquisitions',
      'leveraged finance', 'capital markets',
    ],
  },
  {
    canonical: 'Consultant',
    aliases: [
      'consultant', 'consulting', 'management consultant',
      'strategy consultant', 'business consultant', 'technology consultant',
    ],
  },
  {
    canonical: 'Audit',
    aliases: [
      'audit', 'auditor', 'external audit', 'internal audit',
      'risk assurance', 'assurance services',
    ],
  },
  {
    canonical: 'Tax',
    aliases: ['tax', 'tax associate', 'tax consultant', 'tax accountant'],
  },
  {
    canonical: 'Risk',
    aliases: ['risk analyst', 'risk management', 'credit risk', 'market risk', 'operational risk'],
  },
  {
    canonical: 'Forensic',
    aliases: ['forensic', 'forensic technology', 'forensic tech', 'forensic services', 'forensic accounting'],
  },
  {
    canonical: 'Actuarial',
    aliases: ['actuarial', 'actuary', 'actuarial analyst', 'actuarial consultant'],
  },
  {
    canonical: 'Product Manager',
    aliases: [
      'product manager', 'product management', 'product owner',
      'associate product manager', 'apm', 'technical product manager', 'tpm',
    ],
  },
  {
    canonical: 'Designer',
    aliases: [
      'ux designer', 'ui designer', 'ux/ui designer', 'product designer',
      'visual designer', 'interaction designer', 'graphic designer',
    ],
  },
  {
    canonical: 'Tutor',
    aliases: ['tutor', 'teaching assistant', 'instructor', 'educator'],
  },
  {
    canonical: 'Marketing',
    aliases: ['marketing analyst', 'marketing associate', 'digital marketing', 'brand manager'],
  },
  {
    canonical: 'Sales',
    aliases: ['sales associate', 'account executive', 'business development', 'bdr', 'sdr'],
  },
  {
    canonical: 'Operations',
    aliases: ['operations analyst', 'operations associate', 'operations manager', 'supply chain'],
  },
  {
    canonical: 'Mechanical Engineer',
    aliases: ['mechanical engineer', 'mechanical engineering', 'mechatronics engineer'],
  },
  {
    canonical: 'Electrical Engineer',
    aliases: ['electrical engineer', 'electrical engineering', 'power engineer'],
  },
  {
    canonical: 'Civil Engineer',
    aliases: ['civil engineer', 'civil engineering', 'structural engineer'],
  },
  {
    canonical: 'Chemical Engineer',
    aliases: ['chemical engineer', 'chemical engineering', 'process engineer'],
  },
]

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Pre-compile alias matchers once. Each alias becomes a word-boundary regex so
// "swe" doesn't match "answer" and "ai" doesn't match "trainee".
const COMPILED_ROLE_CATEGORIES = ROLE_CATEGORIES.map((cat) => ({
  canonical: cat.canonical,
  matchers: cat.aliases.map((alias) => new RegExp(`(?:^|[^a-z0-9])${escapeRegex(alias)}(?=$|[^a-z0-9])`, 'i')),
}))

// Map a free-text role label to its canonical category, or null if unknown.
function categorizeRole(role) {
  if (!role) return null
  const text = String(role).toLowerCase().replace(/\s{2,}/g, ' ').trim()
  if (!text) return null
  for (const { canonical, matchers } of COMPILED_ROLE_CATEGORIES) {
    if (matchers.some((re) => re.test(text))) return canonical
  }
  return null
}

// Strong differentiator tokens — when one role has one of these and the other
// has a *different* one (e.g. FPGA vs Software), they describe different jobs
// at the same company and should NOT be merged. Used as a fallback when at
// least one side does not map to a canonical role category.
const ROLE_DIFFERENTIATORS = new Set([
  'software', 'hardware', 'fpga', 'firmware', 'embedded',
  'frontend', 'backend', 'fullstack', 'mobile', 'ios', 'android', 'web',
  'cloud', 'devops', 'sre', 'platform', 'infrastructure',
  'data', 'analytics', 'analyst', 'ml', 'ai', 'machine', 'learning',
  'research', 'scientist', 'security', 'cyber',
  'quant', 'trader', 'trading', 'finance', 'risk', 'audit', 'tax',
  'forensic', 'actuarial', 'consulting', 'consult',
  'product', 'design', 'designer', 'marketing', 'sales', 'operations',
  'tutor', 'corporate', 'investment', 'legal', 'mechanical', 'electrical',
  'civil', 'chemical', 'aerospace', 'biomedical', 'algorithm', 'algorithms',
])

function hasConcreteRoleSignal(role = '') {
  const r = String(role || '').toLowerCase()
  if (!r || isNoisyRole(r)) return false
  if (categorizeRole(r)) return true
  for (const tok of significantTokens(r)) {
    if (ROLE_DIFFERENTIATORS.has(tok)) return true
  }
  return false
}

// True when the two roles describe meaningfully different positions and
// should not be merged into one timeline.
//
// Decision order:
//   1. If both map to a known role category, compare the categories directly.
//   2. Otherwise, fall back to "do both sides contain a different concrete
//      differentiator token?" — same logic as before.
function rolesClearlyDiffer(roleA, roleB) {
  const catA = categorizeRole(roleA)
  const catB = categorizeRole(roleB)
  if (catA && catB) return catA !== catB

  if (!hasConcreteRoleSignal(roleA) || !hasConcreteRoleSignal(roleB)) return false
  const a = new Set(significantTokens(roleA))
  const b = new Set(significantTokens(roleB))
  const aOnly = [...a].filter(t => !b.has(t) && ROLE_DIFFERENTIATORS.has(t))
  const bOnly = [...b].filter(t => !a.has(t) && ROLE_DIFFERENTIATORS.has(t))
  return aOnly.length > 0 && bOnly.length > 0
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

  // 2. Company-only match (includes substring — handles "Company Early" ↔ "Company")
  // BUT: if both the email and the saved app have a concrete (non-noisy) role
  // and they share zero significant tokens, treat as a different position and
  // skip this fallback so two unrelated emails don't merge under the same app.
  for (const app of applications) {
    const a = normaliseStr(app.company)
    if (!(a.includes(c) || c.includes(a))) continue
    if (rolesClearlyDiffer(role, app.role)) continue
    return app.id
  }

  // 3. Token-overlap fallback for noisy ATS-derived company names
  const companyTokens = significantTokens(company)
  const roleTokens = significantTokens(role)
  for (const app of applications) {
    const appCompanyTokens = significantTokens(app.company)
    const appRoleTokens = significantTokens(app.role || '')
    const companyOverlap = companyTokens.filter(t => appCompanyTokens.includes(t)).length
    const roleOverlap = roleTokens.filter(t => appRoleTokens.includes(t)).length
    if (companyOverlap >= 1 && (roleTokens.length === 0 || roleOverlap >= 1)) {
      if (rolesClearlyDiffer(role, app.role)) continue
      return app.id
    }
  }
  return null
}

// ── Deduplication ────────────────────────────────────────────────────────────
// Multiple emails about the same job → one result, most-advanced stage wins.

function groupKey(appId, company, role) {
  if (appId) return appId
  const cleanCompany = sanitiseCompanyName(company ?? '') ?? (company ?? 'unknown')
  const cn = normaliseStr(cleanCompany ?? 'unknown')
  const cleanedRole = cleanRoleText(role ?? '')
  if (!cleanedRole || isNoisyRole(cleanedRole) || /^(?:\d{4}\s+)?graduate\s+program$/i.test(cleanedRole)) {
    return `company:${cn}`
  }
  const rn = normaliseStr(cleanedRole)
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
  // Prefer the most specific role label: replace umbrella/noisy with explicit
  // when the incoming side has it.
  const existingNoisy = isNoisyRole(existing.role ?? '') || isUmbrellaRole(existing.role ?? '')
  const incomingNoisy = isNoisyRole(incoming.role ?? '') || isUmbrellaRole(incoming.role ?? '')
  if (existingNoisy && !incomingNoisy && incoming.role) {
    existing.role = incoming.role
    if (incoming.roleSource) existing.roleSource = incoming.roleSource
  }
  // Accumulate source emails
  existing.sourceEmails.push(incoming.sourceEmails[0])
}

// Two roles belong to the "same family" — i.e. they describe the same position
// at the same company and should collapse into one timeline.
function sameRoleFamily(a, b) {
  const aRole = a?.role ?? ''
  const bRole = b?.role ?? ''
  // Both are too generic to disambiguate → assume same.
  if (isNoisyRole(aRole) && isNoisyRole(bRole)) return true
  // Exact role match (after cleanup).
  if (normaliseStr(cleanRoleText(aRole)) === normaliseStr(cleanRoleText(bRole))) return true
  // Role bank: both map to the same canonical category (e.g. "Software
  // Developer" ≡ "Software Engineer" ≡ "SWE").
  const catA = categorizeRole(aRole)
  const catB = categorizeRole(bRole)
  if (catA && catB && catA === catB) return true
  // One side is umbrella / noisy → absorbs concrete sibling unless they
  // contain different concrete role differentiators (e.g. FPGA vs Software).
  const aSoft = isUmbrellaRole(aRole) || isNoisyRole(aRole)
  const bSoft = isUmbrellaRole(bRole) || isNoisyRole(bRole)
  if ((aSoft || bSoft) && !rolesClearlyDiffer(aRole, bRole)) return true
  return false
}

function consolidateGroups(values) {
  const byCompanyRole = new Map()
  for (const item of values) {
    const companyKey = normaliseStr(item.company ?? '')
    const roleKey = isNoisyRole(item.role ?? '') ? '' : normaliseStr(cleanRoleText(item.role ?? ''))
    const key = `${companyKey}:${roleKey}`
    if (!byCompanyRole.has(key)) {
      byCompanyRole.set(key, item)
    } else {
      mergeIntoGroup(byCompanyRole.get(key), item)
      byCompanyRole.get(key).hasFresh = byCompanyRole.get(key).hasFresh || item.hasFresh
    }
  }

  const grouped = Array.from(byCompanyRole.values())
  const byCompany = new Map()
  for (const item of grouped) {
    const cKey = normaliseStr(item.company ?? '')
    if (!byCompany.has(cKey)) byCompany.set(cKey, [])
    byCompany.get(cKey).push(item)
  }

  for (const items of byCompany.values()) {
    if (items.length < 2) continue

    // Pick a primary item to absorb others: prefer terminal stage (Rejected /
    // Offer), then a concrete (non-noisy) role, then earliest entry.
    const score = (i) => {
      let s = 0
      if (i.detectedStage === 'Rejected' || i.detectedStage === 'Offer') s += 1000
      if (!isNoisyRole(i.role ?? '') && !isUmbrellaRole(i.role ?? '')) s += 100
      return s
    }
    const sorted = [...items].sort((a, b) => score(b) - score(a))
    const primary = sorted[0]

    for (const item of sorted.slice(1)) {
      if (item === primary || item.__drop) continue
      if (sameRoleFamily(primary, item)) {
        mergeIntoGroup(primary, item)
        primary.hasFresh = primary.hasFresh || item.hasFresh
        item.__drop = true
      }
    }
  }

  return grouped.filter(i => !i.__drop)
}

// ── Assessment / interview status ────────────────────────────────────────────

const COMPLETED_PATTERNS = [
  /feedback report/i,                          // post-OA feedback = definitely done
  /assessment.*feedback/i,
  /thank you for (completing|attending|sitting|submitting)/i,
  /completed.{0,20}(assessment|interview|test)/i,
  /(assessment|interview|test).{0,20}(completed|submitted|received)/i,
  /(submitting|submitted)\s+your\s+(?:video\s+)?(interview|assessment|application|response|test)/i,
  /reviewing\s+your\s+(response|submission|interview|application)/i,
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
  let skippedAlerts = 0

  for (const email of emails) {
    if (isJobAlertEmail(email)) {
      skippedAlerts++
      console.log(`[classifier] SKIP job-alert/marketing: "${email.subject}" from ${email.from}`)
      continue
    }
    const isKnown = knownSet.has(email.id)
    const bodyOrSnippet = email.bodyText ?? email.snippet
    const { stage, confidence } = detectStage(email.subject, bodyOrSnippet)
    const company = extractCompany(email.from, email.subject, bodyOrSnippet)
    const { role, roleSource } = extractRole(email.subject, company, bodyOrSnippet)
    const appId = matchToApplication(company, applications, role)
    const dueDate = extractDueDate(email.subject, bodyOrSnippet, email.date, userTimeZone)

    const isAssessmentStage = stage === 'Online Assessment' || stage === 'Video Interview'
    const assessmentStatus = isAssessmentStage ? detectAssessmentStatus(email.subject, bodyOrSnippet) : null

    const resolvedCompany = company ?? inferCompanyFromSubject(email.subject) ?? 'Unknown'
    const result = {
      appId,
      company: resolvedCompany,
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

    const key = groupKey(appId, resolvedCompany, role)

    if (groups.has(key)) {
      const existing = groups.get(key)
      mergeIntoGroup(existing, result)
      if (!isKnown) existing.hasFresh = true
    } else {
      groups.set(key, { ...result, hasFresh: !isKnown })
    }

    console.log(`[classifier] ${resolvedCompany} → ${stage} (${confidence})${dueDate ? ` due:${dueDate}` : ''} | "${email.subject}"`)
  }

  const results = consolidateGroups(Array.from(groups.values()))
    .filter(r => r.hasFresh)
    .map(({ hasFresh, __drop, ...rest }) => rest)

  if (skippedAlerts > 0)
    console.log(`[classifier] Filtered ${skippedAlerts} job-alert/marketing email(s)`)

  return { results, skippedKnown }
}
