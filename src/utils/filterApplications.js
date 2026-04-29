export function filterApplications(applications, filter) {
  let apps = applications
  const q = filter.query.trim().toLowerCase()

  if (q) {
    apps = apps.filter(
      (a) => a.company?.toLowerCase().includes(q) || a.role?.toLowerCase().includes(q)
    )
  }

  if (filter.stages.size > 0) {
    apps = apps.filter((a) => filter.stages.has(a.stage))
  }

  return apps
}
