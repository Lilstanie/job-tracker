// Returns an http(s) URL safe to render as <a href>, or null when the input
// can't be safely rendered as a link.
//
// Rules:
//   - http: / https: → returned as-is (after URL parse)
//   - bare hostname or hostname/path → upgraded to https://
//   - everything else (javascript:, data:, file:, vbscript:, mailto:, …) → null
//
// The null case lets the caller render the raw string as plain text instead
// of a clickable link, defeating `javascript:…` and similar scheme injection.
export function safeHref(rawUrl) {
  if (!rawUrl) return null
  const url = String(rawUrl).trim()
  if (!url) return null
  // Bare hostname / path — assume https.
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(url)) return `https://${url}`
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href
  } catch {
    return null
  }
  return null
}
