import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { relativeTime, deadlineCountdown, formatDate, formatDateTime } from './time.js'

const FIXED_NOW = new Date('2026-05-08T10:00:00Z').getTime()

describe('time utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })
  afterEach(() => vi.useRealTimers())

  describe('relativeTime', () => {
    it('returns Today / Yesterday / Nd ago for past dates', () => {
      expect(relativeTime(new Date(FIXED_NOW).toISOString())).toBe('Today')
      expect(relativeTime(new Date(FIXED_NOW - 86_400_000).toISOString())).toBe('Yesterday')
      expect(relativeTime(new Date(FIXED_NOW - 3 * 86_400_000).toISOString())).toBe('3d ago')
      expect(relativeTime(new Date(FIXED_NOW - 14 * 86_400_000).toISOString())).toBe('2w ago')
      expect(relativeTime(new Date(FIXED_NOW - 60 * 86_400_000).toISOString())).toBe('2mo ago')
      expect(relativeTime(new Date(FIXED_NOW - 400 * 86_400_000).toISOString())).toBe('1y ago')
    })

    it('returns "Today" for future dates rather than negative "-Nd ago"', () => {
      expect(relativeTime(new Date(FIXED_NOW + 5 * 86_400_000).toISOString())).toBe('Today')
    })

    it('returns "" for null / undefined / "" / invalid date strings', () => {
      expect(relativeTime(null)).toBe('')
      expect(relativeTime(undefined)).toBe('')
      expect(relativeTime('')).toBe('')
      expect(relativeTime('not a date')).toBe('')
      expect(relativeTime('2026-13-99')).toBe('')
    })
  })

  describe('deadlineCountdown', () => {
    it('marks past dates as Expired (urgent)', () => {
      expect(deadlineCountdown(new Date(FIXED_NOW - 86_400_000).toISOString())).toEqual({ label: 'Expired', urgent: true })
    })
    it('marks today/short-window deadlines urgent', () => {
      expect(deadlineCountdown(new Date(FIXED_NOW).toISOString())).toEqual({ label: 'Due today', urgent: true })
      expect(deadlineCountdown(new Date(FIXED_NOW + 2 * 86_400_000).toISOString())).toEqual({ label: '2d left', urgent: true })
      expect(deadlineCountdown(new Date(FIXED_NOW + 7 * 86_400_000).toISOString())).toEqual({ label: '7d left', urgent: false })
    })
    it('returns null beyond the 14-day window or for invalid input', () => {
      expect(deadlineCountdown(new Date(FIXED_NOW + 30 * 86_400_000).toISOString())).toBeNull()
      expect(deadlineCountdown(null)).toBeNull()
      expect(deadlineCountdown('garbage')).toBeNull()
    })
  })

  describe('formatDate / formatDateTime', () => {
    it('returns empty string for null / invalid input instead of "Invalid Date"', () => {
      expect(formatDate(null)).toBe('')
      expect(formatDate('')).toBe('')
      expect(formatDate('not a date')).toBe('')
      expect(formatDateTime(null)).toBe('')
      expect(formatDateTime(undefined)).toBe('')
      expect(formatDateTime('garbage')).toBe('')
    })

    it('formats valid dates without throwing', () => {
      expect(formatDate('2026-05-08T00:00:00Z')).toMatch(/2026/)
      expect(formatDateTime('2026-05-08T10:30:00Z')).toMatch(/May/)
    })
  })
})
