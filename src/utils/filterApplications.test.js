import { describe, expect, it } from 'vitest'
import { filterApplications } from './filterApplications'

const apps = [
  { id: '1', company: 'Company One', role: 'Graduate Program', stage: 'Applied' },
  { id: '2', company: 'Company Two', role: 'Technology Internship', stage: 'Online Assessment' },
  { id: '3', company: 'Company Three', role: 'Data Analyst', stage: 'Video Interview' },
]

describe('filterApplications', () => {
  it('filters by query across company and role', () => {
    const result = filterApplications(apps, { query: 'intern', stages: new Set() })
    expect(result.map(a => a.id)).toEqual(['2'])
  })

  it('filters by selected stages', () => {
    const result = filterApplications(apps, { query: '', stages: new Set(['Video Interview']) })
    expect(result.map(a => a.id)).toEqual(['3'])
  })

  it('combines query and stage filters', () => {
    const result = filterApplications(apps, {
      query: 'data',
      stages: new Set(['Video Interview']),
    })
    expect(result.map(a => a.id)).toEqual(['3'])
  })
})
