import { describe, expect, it } from 'vitest'
import { classifyEmails, extractDueDate } from './classifier.js'

describe('classifyEmails', () => {
  it('groups duplicate job emails and keeps most advanced stage', async () => {
    const applications = [
      { id: 'app-1', company: 'Company Alpha', role: 'Graduate Program' },
    ]

    const emails = [
      {
        id: 'e1',
        subject: 'Thank you for your application',
        snippet: 'We received your application',
        from: 'Company Alpha Careers <careers@companyalpha.example>',
        date: '2026-04-20T00:00:00.000Z',
      },
      {
        id: 'e2',
        subject: 'Interview invitation',
        snippet: 'You are invited to interview',
        from: 'Company Alpha Careers <careers@companyalpha.example>',
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
    const applications = [{ id: 'air-1', company: 'Company Radar', role: 'Control Trainee' }]
    const emails = [
      {
        id: 'known-round-1',
        subject: 'Round 1 online testing invite',
        snippet: 'You are invited to complete online assessment',
        from: 'Company Radar <avrecruit-504@mail.pageuppeople.com>',
        date: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'new-round-2',
        subject: 'Application Outcome - Control Trainee',
        snippet: 'Your application has been deemed unsuccessful.',
        bodyText: 'Unfortunately your application has been deemed unsuccessful.',
        from: 'Company Radar <avrecruit-504@mail.pageuppeople.com>',
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
      { id: 'air-1', company: 'Company Radar', role: 'Control Trainee', stage: 'Online Assessment' },
    ]
    const emails = [
      {
        id: 'rej-1',
        subject: 'Application Outcome - Control Trainee',
        snippet: 'Your application has been deemed unsuccessful.',
        bodyText: 'Your online testing results have been reviewed and assessed and unfortunately your application has been deemed unsuccessful.',
        from: 'Company Radar <avrecruit-504@mail.pageuppeople.com>',
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
        subject: 'Company Delta - Your Feedback Report',
        snippet: 'Feedback report available',
        from: 'no-reply@gradweb1.co.uk',
        date: '2026-05-08T00:00:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('Company Delta')
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
        subject: 'Application Acknowledgement: Company Finance Graduate Program',
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

  it('prefers company from subject "at <Company>" over recruiter personal name', async () => {
    const emails = [
      {
        id: 'fivecast-1',
        subject: 'Application Outcome- 2026 Graduate Software Engineer at Company Orion',
        snippet: 'Thank you for giving us the opportunity to consider you for our Graduate Software Engineer role.',
        bodyText: 'We have reviewed your application and unfortunately it is not a match for what we are looking for right now.',
        from: 'Recruiter Name <careers@companyorion.example>',
        date: '2026-04-09T04:13:00.000Z',
      },
    ]

    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('Company Orion')
    expect(results[0].detectedStage).toBe('Rejected')
  })

  it('groups Company Orion applied and outcome emails into one timeline group', async () => {
    const emails = [
      {
        id: 'orion-applied',
        subject: 'COMPANY ORION Application received',
        snippet: 'We have received your application for our 2026 Graduate Software Engineer role.',
        bodyText: 'Thank you for considering a role at Company Orion. We have received your application for our 2026 Graduate Software Engineer role.',
        from: 'careers@companyorion.example <careers@companyorion.example>',
        date: '2026-04-07T07:21:00.000Z',
      },
      {
        id: 'orion-outcome',
        subject: 'Application Outcome- 2026 Graduate Software Engineer at Company Orion',
        snippet: 'Thank you for giving us the opportunity to consider you.',
        bodyText: 'We have reviewed your application and unfortunately it is not a match for what we are looking for right now.',
        from: 'Recruiter Name <careers@companyorion.example>',
        date: '2026-04-09T04:13:00.000Z',
      },
    ]

    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toMatch(/company ?orion/i)
    expect(results[0].detectedStage).toBe('Rejected')
    expect(results[0].sourceEmails).toHaveLength(2)
  })

  it('keeps MyWorkday next-steps assessment emails in Online Assessment stage and extracts company', async () => {
    const emails = [
      {
        id: 'nbn-assess-1',
        subject: 'Next Steps: Complete Your Online Assessments for the Company Network Graduate Program',
        snippet: 'Assessment invitation. You may be invited to a video interview after completion.',
        from: 'Workday <notifications@myworkday.com>',
        date: '2026-04-13T02:36:00.000Z',
      },
    ]

    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].detectedStage).toBe('Online Assessment')
    expect(results[0].company).toBe('Company Network')
  })

  it('merges Company Alpha reminder/complete/outcome emails and calculates 72h due date', async () => {
    const emails = [
      {
        id: 'telstra-reminder',
        subject: 'Reminder: Interview with Company Alpha',
        snippet: 'You only have 72 hours to complete the tasks from receipt of the email.',
        bodyText: 'We have noticed that you have not completed your video interview and online assessment for 2027 Company Alpha Graduate Program (Software Engineering). You only have 72 hours to complete the tasks from receipt of the email.',
        from: 'Company Alpha Early Careers <interviews@hirevue.com>',
        date: '2026-04-04T00:00:00.000Z',
      },
      {
        id: 'telstra-complete',
        subject: 'Interview Complete - thank-you!',
        snippet: 'You have successfully completed your video interview and online assessments.',
        bodyText: 'Congratulations! You have successfully completed your video interview and online assessments for 2027 Company Alpha Graduate Program (Software Engineering).',
        from: 'Company Alpha Early Careers <interviews@hirevue.com>',
        date: '2026-04-06T11:42:00.000Z',
      },
      {
        id: 'telstra-outcome',
        subject: 'Application Outcome',
        snippet: 'Unfortunately we will not be moving forward with your application.',
        bodyText: 'Thank you again for taking the time to apply for the JR-10164745 2027 Graduate Program - Software Engineering role. Unfortunately we will not be moving forward with your application at this time.',
        from: 'Company Alpha Careers <companyalpha@myworkday.com>',
        date: '2026-04-28T01:48:00.000Z',
      },
    ]

    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('Company Alpha')
    expect(results[0].detectedStage).toBe('Rejected')
    expect(results[0].dueDate).toBe('2026-04-07')
    expect(results[0].assessmentStatus).toBe('completed')
    expect(results[0].sourceEmails).toHaveLength(3)
  })

  it('does not classify LinkedIn Premium marketing as Offer', async () => {
    const emails = [
      {
        id: 'li-premium-1',
        subject: 'Candidate, enjoy 50% off LinkedIn Premium for 2 months',
        snippet: 'Unlock Premium features with this limited-time offer.',
        from: 'LinkedIn <linkedin@em.linkedin.com>',
        date: '2026-04-22T00:00:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].detectedStage).not.toBe('Offer')
  })

  it('cleans noisy @domain sender labels into a readable company name', async () => {
    const emails = [
      {
        id: 'domain-noise-1',
        subject: 'Candidate, thank you for your application',
        snippet: 'We received your application.',
        from: '@francomgroup.com',
        date: '2026-04-10T00:00:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('Francomgroup')
  })

  it('extracts rejected outcome role and company from outcome wording', async () => {
    const emails = [
      {
        id: 'consult-outcome-1',
        subject: 'Outcome of your application for the Graduate Program | Risk & Analytics | Forensic Tech',
        snippet: "We won't be progressing your application for this role.",
        bodyText: "Thank you for your interest. We won't be progressing your application for this role - but we would like to keep your application for future opportunities.",
        from: 'Consulting Firm Recruitment <no-reply@consultingfirm.example>',
        date: '2026-04-29T06:31:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('Consulting Firm')
    expect(results[0].detectedStage).toBe('Rejected')
    expect(results[0].role).toContain('Forensic Tech')
  })

  it('keeps multiple rejected roles as separate entries for one company', async () => {
    const emails = [
      {
        id: 'consult-r1',
        subject: 'Outcome of your application for the Graduate Program | Risk & Analytics | Data Analytics',
        snippet: "We won't be progressing your application for this role.",
        from: 'Consulting Firm Recruitment <no-reply@consultingfirm.example>',
        date: '2026-04-29T06:31:00.000Z',
      },
      {
        id: 'consult-r2',
        subject: 'Outcome of your application for the Graduate Program | Risk & Analytics | Forensic Tech',
        snippet: "We won't be progressing your application for this role.",
        from: 'Consulting Firm Recruitment <no-reply@consultingfirm.example>',
        date: '2026-04-17T06:31:00.000Z',
      },
      {
        id: 'consult-r3',
        subject: 'Outcome of your application for the Graduate Program | Risk & Analytics | Actuarial',
        snippet: "We won't be progressing your application for this role.",
        from: 'Consulting Firm Recruitment <no-reply@consultingfirm.example>',
        date: '2026-04-17T01:31:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(3)
    expect(new Set(results.map(r => r.company)).size).toBe(1)
    expect(new Set(results.map(r => r.role)).size).toBe(3)
    expect(results.every(r => r.detectedStage === 'Rejected')).toBe(true)
  })

  it('does not merge two emails for the same company when roles clearly differ (Citadel FPGA vs Software)', async () => {
    const apps = [{ id: 'app-citadel', company: 'Citadel', role: 'Software Engineering Campus Assessment' }]
    const emails = [
      {
        id: 'cit-oa',
        subject: 'Your invite to [Citadel | Citadel Securities] Software Engineering Campus Assessment 2025 – 2026 expires in 7 days',
        snippet: 'Powered by HackerRank.',
        bodyText: 'Friendly reminder. End Login Date/Time: 11 May 2026 06:40 PM CDT (America - Chicago)',
        from: 'Citadel Hiring Team <support@hackerrankforwork.com>',
        date: '2026-05-05T00:00:00.000Z',
      },
      {
        id: 'cit-fpga',
        subject: 'Your Citadel | Citadel Securities Application',
        snippet: 'Thank you for your interest in FPGA Engineering at Citadel | Citadel Securities.',
        bodyText: 'Thank you for your interest in FPGA Engineering at Citadel | Citadel Securities. Our team has carefully considered your application and unfortunately will not be moving forward with your candidacy for FPGA Engineering at this time.',
        from: 'Bruna Diegues <bruna.diegues@citadel.com>',
        date: '2026-05-04T00:00:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, apps, [])
    expect(results).toHaveLength(2)
    const oa = results.find(r => r.detectedStage === 'Online Assessment')
    const rej = results.find(r => r.detectedStage === 'Rejected')
    expect(oa).toBeDefined()
    expect(rej).toBeDefined()
    expect(oa.appId).toBe('app-citadel')
    expect(rej.appId).toBeNull()
    expect(rej.role).toBe('FPGA Engineering')
  })

  it('extracts company from "<Company> Graduate Academy" subject (ANZ Greenhouse → Quantium)', async () => {
    const emails = [
      {
        id: 'q1',
        subject: 'Quantium Graduate Academy Application Outcome',
        snippet: 'After careful consideration, we regret to inform you that your application has been unsuccessful.',
        bodyText: 'Thank you for taking part in our Graduate Academy recruitment process. After careful consideration, we regret to inform you that your application has been unsuccessful.',
        from: 'Quantium Graduate Academy <no-reply@anz.greenhouse.io>',
        date: '2026-05-07T02:17:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('Quantium')
    expect(results[0].detectedStage).toBe('Rejected')
  })

  it('extracts company from HireVue display name and never returns "hirevue-app" as company', async () => {
    const emails = [
      {
        id: 'hv-1',
        subject: 'You are invited to a Video Interview with Quantium',
        snippet: 'Thank you for your interest in the Graduate Software Engineer - 2027 position at Quantium.',
        bodyText: 'Hello Ziqi He, Thank you for your interest in the Graduate Software Engineer - 2027 position at Quantium. You are invited to complete a Values-Based Video Interview. Once you log in, you will have 48 hour(s) to submit.',
        from: 'Quantium Graduate Recruitment <noreply@mail.hirevue-app.com.au>',
        date: '2026-04-19T13:52:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('Quantium')
    expect(results[0].company).not.toMatch(/hirevue/i)
    expect(results[0].role).toBe('Graduate Software Engineer - 2027')
    expect(results[0].detectedStage).toBe('Video Interview')
    expect(results[0].dueDate).toBe('2026-04-21')
  })

  it('extracts due date from "you will have 48 hour(s) to submit" relative deadline', () => {
    const due = extractDueDate(
      'You are invited to a Video Interview with Quantium',
      'Once you log in, you will have 48 hour(s) to submit.',
      '2026-04-19T13:52:00.000Z',
      'Australia/Sydney'
    )
    expect(due).toBe('2026-04-21')
  })

  it('merges Quantium HireVue VI emails with ANZ Greenhouse rejection into one timeline', async () => {
    const emails = [
      {
        id: 'q-vi-invite',
        subject: 'You are invited to a Video Interview with Quantium',
        snippet: 'Graduate Software Engineer - 2027 position at Quantium.',
        bodyText: 'Hello Ziqi He, Thank you for your interest in the Graduate Software Engineer - 2027 position at Quantium. You will have 48 hour(s) to submit.',
        from: 'Quantium Graduate Recruitment <noreply@mail.hirevue-app.com.au>',
        date: '2026-04-19T13:52:00.000Z',
      },
      {
        id: 'q-vi-submitted',
        subject: 'Thank you for submitting your Interview',
        snippet: 'reviewing your responses',
        bodyText: 'Dear Ziqi He, The Quantium Graduate Recruitment team is currently reviewing your responses. Thank you for your interest in Quantium.',
        from: 'Quantium Submittals <noreply@mail.hirevue-app.com.au>',
        date: '2026-04-19T09:38:00.000Z',
      },
      {
        id: 'q-rej',
        subject: 'Quantium Graduate Academy Application Outcome',
        snippet: 'we regret to inform you that your application has been unsuccessful',
        bodyText: 'Dear Ziqi, Thank you for taking part in our Graduate Academy recruitment process. After careful consideration, we regret to inform you that your application has been unsuccessful. Due to the volume of applications received, we are unfortunately unable to provide individual feedback at this time.',
        from: 'Quantium Graduate Academy <no-reply@anz.greenhouse.io>',
        date: '2026-05-07T02:17:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('Quantium')
    expect(results[0].detectedStage).toBe('Rejected')
    expect(results[0].role).toMatch(/graduate software engineer/i)
    expect(results[0].sourceEmails).toHaveLength(3)
    expect(results[0].dueDate).toBe('2026-04-21')
    expect(results[0].assessmentStatus).toBe('completed')
  })

  it('extracts role from "interest in the <Role> position at <Company>" body template', async () => {
    const emails = [
      {
        id: 'pos-1',
        subject: 'Application',
        snippet: 'Graduate Software Engineer - 2027 position at Quantium',
        bodyText: 'Thank you for your interest in the Graduate Software Engineer - 2027 position at Quantium.',
        from: 'Quantium Graduate Recruitment <noreply@mail.hirevue-app.com.au>',
        date: '2026-04-19T00:00:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results[0].company).toBe('Quantium')
    expect(results[0].role).toBe('Graduate Software Engineer - 2027')
    expect(results[0].roleSource).toBe('explicit')
  })

  it('classifies iCIMS polite rejection as Rejected despite thank-you opener (Ideagen)', async () => {
    const emails = [
      {
        id: 'ideagen-icims',
        subject: 'Thanks for your interest in Ideagen!',
        snippet: 'Thank you for applying to Ideagen',
        bodyText: `Dear Ziqi,

Thank you for applying to Ideagen – we really appreciate your interest.

Following on from your recent application for Graduate Programme Trainee, after reviewing your application against the role specification we have decided on this occasion not to progress your application to the next stage.

Due to application volumes, we are unable to provide individual feedback at this stage.`,
        from: 'Jasmine Perkins <ideagen+email+5165-f059405c40@talent.icims.eu>',
        date: '2026-05-06T23:32:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('Ideagen')
    expect(results[0].detectedStage).toBe('Rejected')
    expect(results[0].summary).toBe('Application unsuccessful')
  })

  it('classifies "unable to provide individual feedback" volume boilerplate as Rejected', async () => {
    const variants = [
      'Due to application volumes, we are unable to provide individual feedback at this stage.',
      'Due to the volume of applications received, we are unfortunately unable to provide individual feedback at this time.',
      'Due to the high volume of applications, we’re unable to provide individual feedback. We appreciate your understanding.',
    ]
    for (const [i, body] of variants.entries()) {
      const { results } = await classifyEmails(
        [
          {
            id: `vol-${i}`,
            subject: 'Update on your application',
            snippet: 'Thank you for applying.',
            bodyText: `Hi Stan, Thank you for your application. ${body}`,
            from: 'Careers <careers@example.com>',
            date: '2026-05-06T00:00:00.000Z',
          },
        ],
        [],
        []
      )
      expect(results, `variant ${i}`).toHaveLength(1)
      expect(results[0].detectedStage, `variant ${i}: ${body}`).toBe('Rejected')
    }
  })

  it('classifies Workday polite rejection as Rejected despite thank-you opener (ResMed)', async () => {
    const emails = [
      {
        id: 'resmed-wd',
        subject: 'ResMed application update for Student Intern - Software Engineer',
        snippet: 'Thank you for your interest in employment with ResMed',
        bodyText: `Dear Stan,

Thank you for your interest in employment with ResMed in our Student Intern - Software Engineer position.

At this time, we've decided to pursue other candidates who more closely match the job requirements of this position.`,
        from: 'Workday <resmed@myworkday.com>',
        date: '2026-05-06T17:29:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('ResMed')
    expect(results[0].detectedStage).toBe('Rejected')
  })

  it('uses subject company over recruiter person name when ATS tenant subdomain shadows employer (Lever)', async () => {
    const emails = [
      {
        id: 'r1',
        subject: 'Thanks for your interest in Ideagen!',
        snippet: 'Thank you for applying.',
        bodyText: 'Thank you for applying for the position with Ideagen.',
        from: 'Jasmine Perkins <jasmine.perkins@hire.lever.co>',
        date: '2026-05-01T00:00:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('Ideagen')
  })

  it('extracts company from "<Company> for <Role>" subject and rejects "Student" as a company', async () => {
    const emails = [
      {
        id: 's1',
        subject: 'ResMed for Student Intern - Software Engineer',
        snippet: 'Your application has been received.',
        bodyText: 'Thank you for applying.',
        from: 'do-not-reply@productsdc66pr1.workday.com',
        date: '2026-05-02T00:00:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('ResMed')
    expect(results[0].role).not.toMatch(/^for\b/i)
  })

  it('extracts role from "interest in <Role> at <Company>" body template', async () => {
    const emails = [
      {
        id: 'fpga-only',
        subject: 'Your Application',
        bodyText: 'Thank you for your interest in FPGA Engineering at Citadel | Citadel Securities. Unfortunately we are unable to proceed.',
        from: 'Bruna Diegues <bruna.diegues@citadel.com>',
        date: '2026-05-04T00:00:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results[0].role).toBe('FPGA Engineering')
    expect(results[0].roleSource).toBe('explicit')
  })

  it('extracts role from "interest in the position of" body template', async () => {
    const emails = [
      {
        id: 'capgemini-1',
        subject: 'Capgemini Group - New Job Application Received',
        snippet: 'Thank you for your application and interest in the position of Capgemini AUNZ Graduate Program 2026: July/August Start.',
        bodyText: 'Thank you for your application and interest in the position of Capgemini AUNZ Graduate Program 2026: July/August Start. Our Talent Acquisition Team will review your application.',
        from: 'HR System <hrsystem@capgemini.com>',
        date: '2026-04-30T12:09:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('Capgemini')
    expect(results[0].role).toContain('Capgemini AUNZ Graduate Program 2026')
    expect(results[0].role).not.toMatch(/new job application received/i)
  })
})
