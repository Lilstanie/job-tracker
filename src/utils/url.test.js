import { describe, expect, it } from 'vitest'
import { safeHref } from './url.js'

describe('safeHref', () => {
  it('returns null for empty / null / undefined', () => {
    expect(safeHref(null)).toBeNull()
    expect(safeHref(undefined)).toBeNull()
    expect(safeHref('')).toBeNull()
    expect(safeHref('   ')).toBeNull()
  })

  it('blocks dangerous schemes (XSS prevention)', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('JavaScript:alert(1)')).toBeNull()
    expect(safeHref('  javascript:alert(1)  ')).toBeNull()
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeHref('vbscript:msgbox(1)')).toBeNull()
    expect(safeHref('file:///etc/passwd')).toBeNull()
    expect(safeHref('mailto:hello@example.com')).toBeNull()
  })

  it('preserves valid http(s) URLs', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com/')
    expect(safeHref('http://example.com/path?q=1')).toBe('http://example.com/path?q=1')
    expect(safeHref('https://sub.domain.co.uk/jobs/123')).toBe('https://sub.domain.co.uk/jobs/123')
  })

  it('upgrades bare hostnames to https://', () => {
    expect(safeHref('example.com')).toBe('https://example.com')
    expect(safeHref('example.com/jobs/123')).toBe('https://example.com/jobs/123')
    expect(safeHref('careers.atlassian.com/jobs')).toBe('https://careers.atlassian.com/jobs')
  })

  it('rejects malformed input that is not a recognised URL form', () => {
    expect(safeHref('not a url')).toBeNull()
    expect(safeHref('http://')).toBeNull()
  })
})
