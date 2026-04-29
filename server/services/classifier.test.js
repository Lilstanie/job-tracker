import { describe, expect, it } from 'vitest'
import { classifyEmails, extractDueDate } from './classifier.js'

describe('classifyEmails', () => {
  it('groups duplicate job emails and keeps most advanced stage', async () => {
    const applications = [
      { id: 'app-1', company: 'Telstra', role: 'Graduate Program' },
    ]

    const emails = [
      {
        id: 'e1',
        subject: 'Thank you for your application',
        snippet: 'We received your application',
        from: 'Telstra Careers <careers@telstra.com>',
        date: '2026-04-20T00:00:00.000Z',
      },
      {
        id: 'e2',
        subject: 'Interview invitation',
        snippet: 'You are invited to interview',
        from: 'Telstra Careers <careers@telstra.com>',
        date: '2026-04-21T00:00:00.000Z',
      },
    ]

    const { results, skippedKnown } = await classifyEmails(emails, applications, [])
    expect(skippedKnown).toBe(0)
    expect(results).toHaveLength(1)
    expect(results[0].appId).toBe('app-1')
    expect(results[0].detectedStage).toBe('Video Interview')
    expect(results[0].sourceEmails).toHaveLength(2)
  })

  it('skips already-known email ids', async () => {
    const emails = [
      {
        id: 'known-1',
        subject: 'Application received',
        snippet: 'Thank you for applying',
        from: 'Company <careers@example.com>',
        date: '2026-04-20T00:00:00.000Z',
      },
    ]

    const { results, skippedKnown } = await classifyEmails(emails, [], ['known-1'])
    expect(skippedKnown).toBe(1)
    expect(results).toHaveLength(0)
  })

  it('keeps known source emails in context when a new email exists in same group', async () => {
    const applications = [{ id: 'air-1', company: 'Airservices Australia', role: 'Air Traffic Control Trainee' }]
    const emails = [
      {
        id: 'known-round-1',
        subject: 'Round 1 online testing invite',
        snippet: 'You are invited to complete online assessment',
        from: 'Airservices Australia <avrecruit-504@mail.pageuppeople.com>',
        date: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'new-round-2',
        subject: 'Application Outcome - Air Traffic Control Trainee',
        snippet: 'Your application has been deemed unsuccessful.',
        bodyText: 'Unfortunately your application has been deemed unsuccessful.',
        from: 'Airservices Australia <avrecruit-504@mail.pageuppeople.com>',
        date: '2026-05-10T00:00:00.000Z',
      },
    ]

    const { results } = await classifyEmails(emails, applications, ['known-round-1'])
    expect(results).toHaveLength(1)
    expect(results[0].appId).toBe('air-1')
    expect(results[0].detectedStage).toBe('Rejected')
    expect(results[0].sourceEmails).toHaveLength(2)
  })

  it('classifies engagement agreement onboarding email as Offer', async () => {
    const emails = [
      {
        id: 'offer-1',
        subject: 'Tutor Engagement Agreement - please review and sign',
        snippet: 'Attached is your Tutor Engagement Agreement.',
        bodyText: 'We are delighted to offer you a tutor position on the team. Once your agreement is signed, we will begin your onboarding process.',
        from: 'JDN Tuition <people@jdntuition.com.au>',
        date: '2026-04-23T00:00:00.000Z',
      },
    ]

    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].detectedStage).toBe('Offer')
  })

  it('classifies application acknowledgement email as Applied with high confidence', async () => {
    const emails = [
      {
        id: 'ack-1',
        subject: 'Application Acknowledgement: Commonwealth Bank Group',
        snippet: 'Thanks for taking the time to complete your application. We are excited to review your application in more detail.',
        from: 'CBA HR <cba@myworkday.com>',
        date: '2026-04-07T00:00:00.000Z',
      },
    ]

    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].detectedStage).toBe('Applied')
    expect(results[0].confidence).toBe('high')
  })

  it('extracts relative assessment expiry like "expire in 10 days"', () => {
    const due = extractDueDate(
      'HackerRank assessment invitation',
      'We encourage you to take the exam as soon as possible as the assessment will expire in 10 days.',
      '2026-05-01T12:00:00.000Z',
      'Australia/Sydney'
    )
    expect(due).toBe('2026-05-11')
  })

  it('converts absolute deadline with timezone abbreviation to user timezone date', () => {
    const due = extractDueDate(
      'HackerRank invitation',
      'End Login Date/Time: 11 May 2026 06:40 PM CDT (America - Chicago)',
      '2026-05-01T12:00:00.000Z',
      'Australia/Sydney'
    )
    expect(due).toBe('2026-05-12')
  })

  it('updates matched application to Rejected for "deemed unsuccessful" outcome emails', async () => {
    const applications = [
      { id: 'air-1', company: 'Airservices Australia', role: 'Air Traffic Control Trainee', stage: 'Online Assessment' },
    ]
    const emails = [
      {
        id: 'rej-1',
        subject: 'Application Outcome - Air Traffic Control Trainee',
        snippet: 'Your application has been deemed unsuccessful.',
        bodyText: 'Your online testing results have been reviewed and assessed and unfortunately your application has been deemed unsuccessful.',
        from: 'Airservices Australia <avrecruit-504@mail.pageuppeople.com>',
        date: '2026-05-10T00:00:00.000Z',
      },
    ]

    const { results } = await classifyEmails(emails, applications, [])
    expect(results).toHaveLength(1)
    expect(results[0].appId).toBe('air-1')
    expect(results[0].detectedStage).toBe('Rejected')
    expect(results[0].confidence).toBe('high')
  })

  it('cleans ATS display names and extracts real company from subject prefix', async () => {
    const emails = [
      {
        id: 'g1',
        subject: 'NEXTDC - Your Feedback Report',
        snippet: 'Feedback report available',
        from: 'no-reply@gradweb1.co.uk',
        date: '2026-05-08T00:00:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('NEXTDC')
  })

  it('extracts company from possessive subject format', async () => {
    const emails = [
      {
        id: 'c1',
        subject: "Citadel's Campus 27 - Australia Software Engineering | Intern role",
        snippet: 'Thank you for your application',
        from: 'Citadel Hiring Team <support@hackerrankforwork.com>',
        date: '2026-05-08T00:00:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('Citadel')
  })

  it('normalizes company aliases and matches existing application', async () => {
    const applications = [
      { id: 'cba-1', company: 'Commonwealth Bank Group', role: 'Graduate Program', stage: 'Applied' },
    ]
    const emails = [
      {
        id: 'alias-1',
        subject: 'Application Acknowledgement: CommBank Graduate Program',
        snippet: 'Thanks for taking the time to complete your application.',
        from: 'CBA HR <cba@myworkday.com>',
        date: '2026-04-07T00:00:00.000Z',
      },
    ]

    const { results } = await classifyEmails(emails, applications, [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('Commonwealth Bank')
    expect(results[0].appId).toBe('cba-1')
  })
})
