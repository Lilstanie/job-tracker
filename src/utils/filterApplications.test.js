import { describe, expect, it } from 'vitest'
import { filterApplications } from './filterApplications'

const apps = [
  { id: '1', company: 'Company One', role: 'Graduate Program', stage: 'Applied', notes: 'phone screen done', tags: ['priority'] },
  { id: '2', company: 'Company Two', role: 'Technology Internship', stage: 'Online Assessment', notes: '', tags: ['remote'] },
  { id: '3', company: 'Company Three', role: 'Data Analyst', stage: 'Video Interview', notes: 'referred by Alice', tags: ['referral', 'priority'] },
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

  it('also searches notes', () => {
    const result = filterApplications(apps, { query: 'alice', stages: new Set() })
    expect(result.map(a => a.id)).toEqual(['3'])
  })

  it('also searches tags', () => {
    const result = filterApplications(apps, { query: 'referral', stages: new Set() })
    expect(result.map(a => a.id)).toEqual(['3'])
  })

  it('handles missing notes / tags gracefully (older records)', () => {
    const partial = [{ id: 'x', company: 'Acme', role: 'SWE', stage: 'Applied' }]
    expect(() => filterApplications(partial, { query: 'acme', stages: new Set() })).not.toThrow()
    expect(filterApplications(partial, { query: 'acme', stages: new Set() })).toHaveLength(1)
  })
})
