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

  it('keeps two same-company roles separate when role bank says different categories (SWE vs FPGA, Data Analyst vs SDET)', async () => {
    const emails = [
      {
        id: 'cit-swe',
        subject: 'Citadel Software Engineering Application',
        snippet: 'unfortunately not progressing',
        bodyText: 'Thank you for your interest in Software Engineering at Citadel. We will not be moving forward with your application for Software Engineering at this time.',
        from: 'Recruiter A <a@citadel.com>',
        date: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'cit-fpga',
        subject: 'Citadel FPGA Application',
        snippet: 'unfortunately',
        bodyText: 'Thank you for your interest in FPGA Engineering at Citadel. We will not be moving forward with your candidacy for FPGA Engineering at this time.',
        from: 'Recruiter B <b@citadel.com>',
        date: '2026-04-02T00:00:00.000Z',
      },
      {
        id: 'cit-da',
        subject: 'Outcome of your application for the Data Analyst role at Citadel',
        snippet: 'we regret to inform',
        bodyText: 'We regret to inform you that we will not be progressing your application for the Data Analyst role at Citadel.',
        from: 'Recruiter C <c@citadel.com>',
        date: '2026-04-03T00:00:00.000Z',
      },
      {
        id: 'cit-sdet',
        subject: 'Outcome of your application for the SDET role at Citadel',
        snippet: 'we regret to inform',
        bodyText: 'We regret to inform you that we will not be progressing your application for the SDET role at Citadel.',
        from: 'Recruiter D <d@citadel.com>',
        date: '2026-04-04T00:00:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(4)
    expect(new Set(results.map(r => r.company)).size).toBe(1)
    expect(results.every(r => r.detectedStage === 'Rejected')).toBe(true)
  })

  it('treats role aliases as the same canonical category (Software Developer ≡ Software Engineer)', async () => {
    const emails = [
      {
        id: 'sd-app',
        subject: 'Acme Software Developer Application',
        snippet: 'thanks for applying',
        bodyText: 'Thank you for applying to the Software Developer position at Acme.',
        from: 'Acme Talent <talent@acme.example>',
        date: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'sd-rej',
        subject: 'Acme Software Engineer outcome',
        snippet: 'we regret',
        bodyText: 'Thank you for your interest in the Software Engineer position at Acme. We regret to inform you that your application has been unsuccessful.',
        from: 'Acme Talent <talent@acme.example>',
        date: '2026-04-10T00:00:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].detectedStage).toBe('Rejected')
    expect(results[0].sourceEmails).toHaveLength(2)
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

  it('extracts "Airservices Australia" as company (geographic suffix is not a person name)', async () => {
    const emails = [
      {
        id: 'airservices-1',
        subject: 'Application Outcome - Air Traffic Control Trainee',
        snippet: 'Thank you for the time and commitment to your application.',
        bodyText: 'Dear Ziqi, Thank you for the time and commitment to your application for the position of Air Traffic Control Trainee with Airservices Australia. Your online testing results have been reviewed and assessed and unfortunately your application has been deemed unsuccessful. Due to the large volume of applications, we receive, we are unable to provide individual feedback.',
        from: 'Airservices Australia <avrecruit-504@mail.pageuppeople.com>',
        date: '2026-04-29T00:06:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('Airservices Australia')
    expect(results[0].role).toBe('Air Traffic Control Trainee')
    expect(results[0].detectedStage).toBe('Rejected')
  })

  it('skips GradConnection-style aggregator senders entirely (broadcast marketing, not real applications)', async () => {
    const applications = [
      { id: 'app-cba', company: 'CommBank', role: 'Graduate' },
    ]
    const emails = [
      {
        id: 'gradconnection-1',
        subject: 'Closing soon: CommBank 2027 Graduate Program',
        snippet: "If you're planning to apply for the 2027 CommBank Graduate Program, now's the time! Applications close soon on 21 April 2026.",
        bodyText: "Hi there, Applications close soon on 21 April 2026. Apply now.",
        from: 'SEEK Grad <mail@gradconnection.com>',
        date: '2026-04-16T01:31:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, applications, [])
    expect(results).toHaveLength(0)
  })

  it('skips "Closing soon: …" / "Apply now" subjects even when sender is a real company domain', async () => {
    const emails = [
      {
        id: 'cba-marketing',
        subject: 'Apply now: CommBank 2027 Graduate Program',
        snippet: "Don't miss your chance — applications are still open.",
        bodyText: 'Apply now to start your career with us.',
        from: 'CommBank Careers <careers@cba.com.au>',
        date: '2026-04-16T01:31:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(0)
  })

  it('does NOT skip legitimate "Reminder" / "Last chance" interview emails (the aggregator filter must be conservative)', async () => {
    const emails = [
      {
        id: 'real-interview-reminder',
        subject: 'Reminder: complete your video interview by 21 April 2026',
        snippet: 'You have 24 hours left to submit your Video Interview with Quantium.',
        bodyText: 'You have 24 hours left to submit your Video Interview with Quantium. Please complete it as soon as possible.',
        from: 'Quantium Graduate Recruitment <noreply@mail.hirevue-app.com.au>',
        date: '2026-04-20T10:00:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].detectedStage).toBe('Video Interview')
  })

  it('keeps Data Analyst and Business Analyst as separate canonical roles (no auto-merge)', async () => {
    const emails = [
      {
        id: 'da-1',
        subject: 'Application received - Data Analyst',
        snippet: 'Thank you for applying to our Data Analyst role.',
        bodyText: 'Thank you for applying for the Data Analyst position at MegaCorp.',
        from: 'MegaCorp Careers <careers@megacorp.example>',
        date: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'ba-1',
        subject: 'Application received - Business Analyst',
        snippet: 'Thank you for applying to our Business Analyst role.',
        bodyText: 'Thank you for applying for the Business Analyst position at MegaCorp.',
        from: 'MegaCorp Careers <careers@megacorp.example>',
        date: '2026-05-02T00:00:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(2)
    const roles = results.map((r) => r.role).sort()
    expect(roles).toEqual(['Business Analyst', 'Data Analyst'])
  })

  it('skips LinkedIn job-alert digests but keeps real per-applicant company notifications', async () => {
    const emails = [
      {
        id: 'linkedin-alert-1',
        subject: '5 new jobs in Sydney for Software Engineer',
        snippet: 'Your daily digest of recommended jobs.',
        from: 'LinkedIn <jobalerts-noreply@linkedin.com>',
        date: '2026-05-01T09:00:00.000Z',
      },
      {
        id: 'linkedin-alert-2',
        subject: 'New jobs at Atlassian',
        snippet: 'Recommended for you',
        from: 'LinkedIn Jobs <jobs-listings@linkedin.com>',
        date: '2026-05-01T10:00:00.000Z',
      },
      {
        id: 'real-application',
        subject: 'Application sent to Atlassian',
        snippet: 'Your application for Software Engineer at Atlassian was successfully submitted.',
        bodyText: 'Your application for Software Engineer at Atlassian was successfully submitted.',
        from: 'Atlassian Careers <careers@atlassian.com>',
        date: '2026-05-01T11:00:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('Atlassian')
  })

  it('regression: real-world emails containing "due to high volume of applications" classify correctly', async () => {
    // Each of these emails contains the phrase "due to (high) volume of applications"
    // but only some are rejections. The classifier must rely on the surrounding
    // context (decision verbs + "unable to provide feedback") rather than the
    // standalone phrase, otherwise legitimate Applied confirmations are mis-judged.
    const cases = [
      {
        // Mastercard Workday: Applied confirmation — has "due to high volume" but
        // it's about response times ("we may not reach out — check Workday"),
        // not a rejection decision.
        id: 'mastercard',
        expected: 'Applied',
        subject: 'Thank you for applying!',
        from: 'Mastercard <noreply@workday.com>',
        bodyText: 'Dear Ziqi, Thank you for your interest in joining Mastercard! We have received your application for the role: Software Engineer I, 2027 Mastercard Launch Graduate Program - Sydney, Australia. Whats next? Our team is carefully reviewing your application. Note: due to the high volume of applications we receive, we may not be able to reach out to each candidate directly, however you can check the status of your application at any time by logging into your Workday profile.',
      },
      {
        // Optiver: real rejection — "regret to inform" + "decided not to proceed"
        // + "unable to provide individual feedback" all present.
        id: 'optiver',
        expected: 'Rejected',
        subject: 'Application Update - Software Developer Internship - 2026-27',
        from: 'careers@optiver.com.au',
        bodyText: 'Hi Ziqi, Thank you for taking the time to apply to the role of Software Developer Internship - 2026-27 at Optiver. However, after careful consideration, we regret to inform you that we have decided not to proceed with your application at this time. Due to the high volume of candidates, unfortunately we are unable to provide individual feedback.',
      },
      {
        // Citadel APAC Terminal: per user, this is an EVENT decline, not a job
        // rejection — application stays open for other roles. We should not flag
        // it as Rejected just because it has "due to volume of applications".
        id: 'citadel-event',
        expected: 'Applied',
        subject: 'Thank you for applying to the Citadel APAC Terminal',
        from: 'No-Reply <no-reply@citadel.com>',
        bodyText: 'Hello Ziqi, On behalf of Citadel and Citadel Securities, thank you for applying to the APAC Terminal 2026! Please know your credentials are impressive, however due to the volume of applications received we were only able to invite a select number of individuals to the event. We are always interested in knowing talented individuals such as yourself and will be in touch if any appropriate roles become available.',
      },
      {
        // APSC AGGP: real rejection — "not been successful in progressing" + "unable
        // to provide individual feedback" both present.
        id: 'apsc',
        expected: 'Rejected',
        subject: '2027 Australian Government Graduate Program - Generalist Stream - Outcome',
        from: 'apsc@nga.net.au',
        bodyText: 'Hi Ziqi, Thank you for your continued interest in the Australian Government Graduate Program. We received over 3,700 applications this year, and due to the highly competitive nature of the process, unfortunately on this occasion, you have not been successful in progressing to the next stage of the recruitment process. Due to the high volume of applications received, we are unable to provide individual feedback at this stage.',
      },
    ]
    for (const c of cases) {
      const { results } = await classifyEmails([{
        id: c.id,
        subject: c.subject,
        from: c.from,
        bodyText: c.bodyText,
        snippet: c.bodyText.slice(0, 200),
        date: '2026-05-01T00:00:00.000Z',
      }], [], [])
      expect(results, `${c.id} should not be filtered as a job alert`).toHaveLength(1)
      expect(results[0].detectedStage, `${c.id} expected ${c.expected}`).toBe(c.expected)
    }
  })

  it('captures full long-form role with " - <Specialisation>" suffixes (Macquarie banking)', async () => {
    // Real Macquarie rejection — role spec runs across multiple " - " separated
    // segments. The lazy "applyMatch" used to stop at the first "Program" word
    // and lose the specialisation. Continuation regex must extend until the
    // sentence terminator (", we appreciate") and not bleed past the pipe in
    // the subject ("(Sydney)| Macquarie Group").
    const emails = [
      {
        id: 'macq-1',
        subject: 'Update on your application for 2027 ANZ Graduate Program - Corporate Finance, M&A, Treasury and Markets - Macquarie Capital (Sydney)| Macquarie Group',
        from: 'Macquarie Recruitment <talent@macquarie.com>',
        bodyText: 'Hi Stan, Thank you for your application for our 2027 ANZ Graduate Program - Corporate Finance, M&A, Treasury and Markets - Macquarie Capital (Sydney), we appreciate the time you have committed to our process. We have received strong applications for this role and after careful consideration, we would like to advise that your application has been unsuccessful. Kind regards, Macquarie Recruitment Team',
        snippet: 'Thank you for your application for our 2027 ANZ Graduate Program',
        date: '2026-05-01T01:45:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(1)
    expect(results[0].company).toBe('Macquarie')
    expect(results[0].detectedStage).toBe('Rejected')
    // Full role spec preserved; "(Sydney)" stripped by cleanRoleText for stable grouping.
    expect(results[0].role).toBe('2027 ANZ Graduate Program - Corporate Finance, M&A, Treasury and Markets - Macquarie Capital')
  })

  it('keeps Test Analyst and QA / Test Engineer (SDET) as separate canonical roles', async () => {
    const emails = [
      {
        id: 'ta-1',
        subject: 'Application received - Test Analyst',
        snippet: 'Thank you for applying.',
        bodyText: 'Thank you for applying for the Test Analyst position at MegaCorp.',
        from: 'MegaCorp Careers <careers@megacorp.example>',
        date: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'sdet-1',
        subject: 'Application received - SDET',
        snippet: 'Thank you for applying.',
        bodyText: 'Thank you for applying for the SDET position at MegaCorp.',
        from: 'MegaCorp Careers <careers@megacorp.example>',
        date: '2026-05-02T00:00:00.000Z',
      },
    ]
    const { results } = await classifyEmails(emails, [], [])
    expect(results).toHaveLength(2)
    const roles = results.map((r) => r.role.toLowerCase()).sort()
    expect(roles[0]).toMatch(/sdet/)
    expect(roles[1]).toMatch(/test analyst/)
  })
})
