import { describe, expect, it } from 'vitest'
import { __test__ } from './gmail.js'

const { isLikelyJobEmail, extractTextFromPayload } = __test__

describe('isLikelyJobEmail', () => {
  it('keeps likely application emails', () => {
    const email = {
      from: 'Example Careers <noreply@careers.example.com>',
      subject: 'Your application update',
      snippet: 'Thank you for your application',
    }
    expect(isLikelyJobEmail(email)).toBe(true)
  })

  it('filters out job digest/alerts', () => {
    const email = {
      from: 'SEEK Alerts <jobmail@s.seek.com.au>',
      subject: 'Jobs digest for you',
      snippet: 'Recommended jobs this week',
    }
    expect(isLikelyJobEmail(email)).toBe(false)
  })

  it('keeps offer emails framed as engagement agreements', () => {
    const email = {
      from: 'Tutor Co <people@tutorco.example>',
      subject: 'Tutor Co Tutor Engagement Agreement – please review & sign (Candidate)',
      snippet: 'Attached is your Tutor Engagement Agreement. Once your agreement is signed, we will begin your onboarding process.',
    }
    expect(isLikelyJobEmail(email)).toBe(true)
  })

  it('keeps workday application acknowledgement emails', () => {
    const email = {
      from: 'CBA HR <cba@myworkday.com>',
      subject: 'Application Acknowledgement: Commonwealth Bank Group',
      snippet: 'Thanks for taking the time to complete your application. We are excited to review your application in more detail.',
    }
    expect(isLikelyJobEmail(email)).toBe(true)
  })

  it('keeps HackerRank For Work assessment invitation emails', () => {
    const email = {
      from: 'Citadel Hiring Team <support@hackerrankforwork.com>',
      subject: 'Your HackerRank [Citadel | Citadel Securities] Software Engineering Campus Assessment 2025 – 2026 Invitation',
      snippet: 'You have been invited to take the following test and the assessment will expire in 10 days.',
    }
    expect(isLikelyJobEmail(email)).toBe(true)
  })

  it('keeps unknown domain emails when multiple recruiting signals exist', () => {
    const email = {
      from: 'Talent Team <jobs@newco.ai>',
      subject: 'Interview invitation for software engineer',
      snippet: 'Thank you for your application. Please book your interview slot.',
    }
    expect(isLikelyJobEmail(email)).toBe(true)
  })

  it('rejects unknown domain marketing emails with weak signals', () => {
    const email = {
      from: 'Growth Team <hello@randomstartup.ai>',
      subject: 'Special offer just for you',
      snippet: 'Join our newsletter for product updates and discounts.',
    }
    expect(isLikelyJobEmail(email)).toBe(false)
  })

  it('filters LinkedIn Premium marketing blasts', () => {
    const email = {
      from: 'LinkedIn <linkedin@em.linkedin.com>',
      subject: 'Candidate, enjoy 50% off LinkedIn Premium for 2 months',
      snippet: 'Limited-time offer for Premium features.',
    }
    expect(isLikelyJobEmail(email)).toBe(false)
  })

  it('extracts readable text from html-only payloads', () => {
    const html = '<div><p>Your application has been deemed unsuccessful.</p><p>Kind regards</p></div>'
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [
        {
          mimeType: 'text/html',
          body: { data: Buffer.from(html, 'utf-8').toString('base64url') },
        },
      ],
    }
    const text = extractTextFromPayload(payload)
    expect(text).toContain('deemed unsuccessful')
  })
})
