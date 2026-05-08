// All helpers safely handle null/undefined/invalid date strings instead of
// rendering "NaNd ago" / "Invalid Date" in the UI. They return either a sane
// fallback string ('') or null when the date is unusable.

const DAY_MS = 86_400_000

function parseDate(input) {
  if (input == null || input === '') return null
  const t = typeof input === 'number' ? input : Date.parse(input)
  return Number.isFinite(t) ? t : null
}

export function relativeTime(dateStr) {
  const t = parseDate(dateStr)
  if (t == null) return ''
  const diffDays = Math.floor((Date.now() - t) / DAY_MS)
  // Future dates: don't render nonsense like "-2d ago"; treat as "Today".
  if (diffDays < 0) return 'Today'
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

export function deadlineCountdown(dateStr) {
  const t = parseDate(dateStr)
  if (t == null) return null
  const days = Math.ceil((t - Date.now()) / DAY_MS)
  if (days < 0) return { label: 'Expired', urgent: true }
  if (days === 0) return { label: 'Due today', urgent: true }
  if (days <= 3) return { label: `${days}d left`, urgent: true }
  if (days <= 14) return { label: `${days}d left`, urgent: false }
  return null
}

export function formatDate(dateStr) {
  const t = parseDate(dateStr)
  if (t == null) return ''
  return new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(isoStr) {
  const t = parseDate(isoStr)
  if (t == null) return ''
  return new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
