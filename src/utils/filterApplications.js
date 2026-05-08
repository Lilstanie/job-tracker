export function filterApplications(applications, filter) {
  let apps = applications
  const q = filter.query.trim().toLowerCase()

  if (q) {
    // Search across the fields users actually want to find by — company, role,
    // free-text notes, and tag list. Optional chaining + lowercase guards
    // against missing fields on older items.
    apps = apps.filter((a) => {
      if (a.company?.toLowerCase().includes(q)) return true
      if (a.role?.toLowerCase().includes(q)) return true
      if (a.notes?.toLowerCase().includes(q)) return true
      const tags = Array.isArray(a.tags) ? a.tags : []
      if (tags.some((t) => String(t).toLowerCase().includes(q))) return true
      return false
    })
  }

  if (filter.stages.size > 0) {
    apps = apps.filter((a) => filter.stages.has(a.stage))
  }

  return apps
}
