import { useState, useEffect, useMemo } from 'react'
import { Plus, Mail, CheckCircle, LayoutDashboard, GitBranch, Search, X } from 'lucide-react'
import { STAGES, STAGE_COLORS } from './data/mockData'
import Sidebar from './components/Sidebar'
import StatsBar from './components/StatsBar'
import KanbanBoard from './components/KanbanBoard'
import PipelineView from './components/PipelineView'
import AddApplicationModal from './components/AddApplicationModal'
import DetailDrawer from './components/DetailDrawer'
import GmailModal from './components/GmailModal'
import { useApplications } from './hooks/useApplications'
import { filterApplications } from './utils/filterApplications'

const API = '/api/gmail'

export default function App() {
  const { applications, addApplication, updateApplication, deleteApplication, moveStage, resetApplications, getStats } = useApplications()
  const [showAdd, setShowAdd] = useState(false)
  const [editApp, setEditApp] = useState(null)
  const [detailApp, setDetailApp] = useState(null)
  const [showGmail, setShowGmail] = useState(false)
  const [mainView, setMainView] = useState('board') // 'board' | 'pipeline'
  const [syncToken, setSyncToken] = useState(() => localStorage.getItem('gmailSyncToken'))
  const [gmailProfile, setGmailProfile] = useState(null)
  const [toast, setToast] = useState(null)
  const [filter, setFilter] = useState({ query: '', stages: new Set() })

  const stats = getStats()

  const filteredApps = useMemo(() => {
    return filterApplications(applications, filter)
  }, [applications, filter])

  // Handle OAuth redirect back: /?syncToken=xxx&gmailConnected=true
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('syncToken')
    const error = params.get('gmailError')
    if (token) {
      localStorage.setItem('gmailSyncToken', token)
      setSyncToken(token)
      window.history.replaceState({}, '', window.location.pathname)
      setShowGmail(true)
    }
    if (error) showToast(`Gmail connection failed: ${error}`, 'error')
  }, [])

  // Fetch Google profile whenever syncToken changes
  useEffect(() => {
    if (!syncToken) { setGmailProfile(null); return }
    fetch(`${API}/profile`, { headers: { 'x-sync-token': syncToken } })
      .then(r => r.json())
      .then(data => {
        if (data.connected && data.profile) {
          setGmailProfile(data.profile)
        } else if (!data.connected) {
          // Token no longer valid on server side
          setSyncToken(null)
          localStorage.removeItem('gmailSyncToken')
          setGmailProfile(null)
        }
      })
      .catch(() => {})
  }, [syncToken])

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const handleEdit = (app) => { setDetailApp(null); setEditApp(app) }
  const handleEditSave = (data) => { updateApplication(editApp.id, data); setEditApp(null) }

  const buildHistoryFromSources = (sources = [], fallbackStage = 'Applied') => {
    const stageFromText = (subject = '', snippet = '') => {
      const text = `${subject} ${snippet}`.toLowerCase()
      if (/regret to inform|unsuccessful|deemed unsuccessful|not been selected|not moving forward/.test(text)) return 'Rejected'
      if (/offer of employment|pleased to offer|delighted to offer|verbal offer/.test(text)) return 'Offer'
      if (/assessment cent(re|er)|assessment day|ac day/.test(text)) return 'Assessment Centre'
      if (/video interview|phone interview|telephone interview|interview invitation|invited to interview/.test(text)) return 'Video Interview'
      if (/online assessment|hackerrank|codility|hirevue|pymetrics|assessment/.test(text)) return 'Online Assessment'
      if (/application|thank you for applying|application acknowledgement|application acknowledgment/.test(text)) return 'Applied'
      return fallbackStage
    }

    const sorted = [...sources]
      .filter(s => s?.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date))

    if (!sorted.length) return null

    const history = []
    for (const s of sorted) {
      const stage = stageFromText(s.subject, s.snippet)
      const timestamp = new Date(s.date).toISOString()
      const last = history[history.length - 1]
      if (last && last.stage === stage) continue
      history.push({
        stage,
        timestamp,
        note: 'Stage inferred from Gmail sync',
        emailSubject: s.subject,
        emailFrom: s.from,
      })
    }
    if (!history.length) return null

    // Guarantee timeline final stage aligns with classifier output.
    const last = history[history.length - 1]
    if (fallbackStage && last?.stage !== fallbackStage) {
      const latestSource = sorted[sorted.length - 1]
      history.push({
        stage: fallbackStage,
        timestamp: latestSource?.date ? new Date(latestSource.date).toISOString() : new Date().toISOString(),
        note: 'Stage inferred from Gmail sync',
        emailSubject: latestSource?.subject ?? '',
        emailFrom: latestSource?.from ?? '',
      })
    }

    return history
  }

  const handleSyncApply = (confirmed) => {
    let updated = 0
    let added = 0
    const newSyncedIds = []

    confirmed.forEach(r => {
      const src = r.sourceEmails?.[0]
      const stepText = r.detectedStage === 'Online Assessment' ? 'Complete online assessment'
        : r.detectedStage === 'Video Interview' ? 'Attend interview'
        : r.detectedStage === 'Assessment Centre' ? 'Attend assessment centre'
        : 'Next step'

      if (r.appId) {
        const payload = {
          stage: r.detectedStage,
          _historyNote: 'Stage updated via Gmail sync',
          _emailEvidence: src ? { subject: src.subject, from: src.from } : null,
          _emailDate: src?.date ?? null,
        }
        if (r.dueDate) {
          payload.deadline = r.dueDate
          payload.nextStep = { text: stepText, due: r.dueDate }
        }
        if (r.assessmentStatus) payload.assessmentStatus = r.assessmentStatus
        updateApplication(r.appId, payload)
        updated++
      } else {
        const sortedSources = [...(r.sourceEmails ?? [])]
          .filter(e => e?.date)
          .sort((a, b) => new Date(a.date) - new Date(b.date))
        const firstDate = sortedSources[0]?.date ?? src?.date
        const emailDate = firstDate ? new Date(firstDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
        const history = buildHistoryFromSources(sortedSources, r.detectedStage)
        addApplication({
          company: r.company,
          role: r.role ?? '',
          roleSource: r.roleSource ?? 'subject',
          sourceEmailSubject: r.sourceEmails?.[0]?.subject ?? '',
          stage: r.detectedStage,
          applied: emailDate,
          url: '',
          notes: r.summary ?? '',
          ...(history ? { history } : {}),
          ...(r.dueDate ? { deadline: r.dueDate, nextStep: { text: stepText, due: r.dueDate } } : {}),
          ...(r.assessmentStatus ? { assessmentStatus: r.assessmentStatus } : {}),
        })
        added++
      }

      // Collect all source email IDs so we never re-surface them
      r.sourceEmails?.forEach(e => { if (e.id) newSyncedIds.push(e.id) })
    })

    // Persist synced IDs to localStorage
    if (newSyncedIds.length) {
      try {
        const existing = JSON.parse(localStorage.getItem('trackr-synced-ids') || '[]')
        localStorage.setItem('trackr-synced-ids', JSON.stringify([...new Set([...existing, ...newSyncedIds])]))
      } catch {}
    }

    const parts = []
    if (updated) parts.push(`${updated} stage update${updated !== 1 ? 's' : ''}`)
    if (added) parts.push(`${added} new application${added !== 1 ? 's' : ''} added`)
    showToast(parts.join(' · ') || 'Nothing applied', 'success')
  }

  const handleDisconnect = () => {
    setSyncToken(null)
    setGmailProfile(null)
    localStorage.removeItem('gmailSyncToken')
  }

  const handleClearLocalArchive = () => {
    const ok = window.confirm('Clear all local applications and sync history? This cannot be undone.')
    if (!ok) return
    resetApplications()
    localStorage.removeItem('trackr-synced-ids')
    localStorage.removeItem('trackr-applications')
    localStorage.removeItem('gmailSyncToken')
    setSyncToken(null)
    setGmailProfile(null)
    setFilter({ query: '', stages: new Set() })
    showToast('Local archive cleared', 'success')
  }

  const liveDetailApp = detailApp ? applications.find(a => a.id === detailApp.id) : null

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0f0f13' }}>
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header
          className="flex items-center justify-between px-6 shrink-0"
          style={{ height: 64, borderBottom: '1px solid #2a2a38', background: '#0f0f13' }}
        >
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-bold leading-tight" style={{ color: '#e2e2e8' }}>Applications</h1>
              <p className="text-xs" style={{ color: '#6b6b84' }}>{applications.length} total · drag cards to update stages</p>
            </div>
            {/* View toggle */}
            <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid #2a2a38' }}>
              {[
                { id: 'board', icon: LayoutDashboard, label: 'Board' },
                { id: 'pipeline', icon: GitBranch, label: 'Pipeline' },
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => setMainView(v.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all"
                  style={{
                    background: mainView === v.id ? '#2a2a38' : 'transparent',
                    color: mainView === v.id ? '#e2e2e8' : '#6b6b84',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <v.icon size={13} />
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Gmail button */}
            {gmailProfile ? (
              <button
                onClick={() => setShowGmail(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ background: '#22c55e14', border: '1px solid #22c55e40', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#22c55e80'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#22c55e40'}
                title={`Gmail connected: ${gmailProfile.email}`}
              >
                <img
                  src={gmailProfile.picture}
                  alt={gmailProfile.name}
                  className="w-5 h-5 rounded-full"
                  referrerPolicy="no-referrer"
                />
                <span style={{ color: '#22c55e' }}>Sync Gmail</span>
              </button>
            ) : (
              <button
                onClick={() => setShowGmail(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#1e1e28', color: '#9ca3af', border: '1px solid #2a2a38', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#6c63ff60'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#2a2a38'}
              >
                <Mail size={15} />
                Sync Gmail
              </button>
            )}

            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: '#6c63ff', color: 'white', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <Plus size={16} />
              Add Application
            </button>
            <button
              onClick={handleClearLocalArchive}
              className="px-3 py-2 rounded-lg text-xs font-medium"
              style={{ background: '#2a2a38', color: '#ef4444', border: '1px solid #ef444450', cursor: 'pointer' }}
              title="Clear all local applications and sync history"
            >
              Clear Local Archive
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="px-6 py-4 shrink-0" style={{ borderBottom: '1px solid #2a2a38' }}>
          <StatsBar stats={stats} />
        </div>

        {/* Filter bar — board view only */}
        {mainView === 'board' && (
          <div className="flex items-center gap-2 px-6 py-2.5 shrink-0 flex-wrap" style={{ borderBottom: '1px solid #2a2a38' }}>
            <div className="relative flex-1" style={{ minWidth: 180, maxWidth: 280 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b6b84', pointerEvents: 'none' }} />
              <input
                placeholder="Search company or role…"
                value={filter.query}
                onChange={e => setFilter(f => ({ ...f, query: e.target.value }))}
                style={{
                  width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 6, paddingBottom: 6,
                  borderRadius: 8, border: '1px solid #2a2a38', background: '#16161d',
                  color: '#e2e2e8', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = '#6c63ff60'}
                onBlur={e => e.target.style.borderColor = '#2a2a38'}
              />
            </div>
            {STAGES.map(stage => {
              const active = filter.stages.has(stage)
              const sc = STAGE_COLORS[stage]
              const short = { 'Online Assessment': 'OA', 'Video Interview': 'Interview', 'Assessment Centre': 'AC' }[stage] ?? stage
              return (
                <button
                  key={stage}
                  onClick={() => setFilter(f => {
                    const next = new Set(f.stages)
                    active ? next.delete(stage) : next.add(stage)
                    return { ...f, stages: next }
                  })}
                  className="text-xs px-2.5 py-1 rounded-full font-medium transition-all shrink-0"
                  style={{
                    background: active ? sc.bg : '#16161d',
                    color: active ? sc.text : '#6b6b84',
                    border: `1px solid ${active ? sc.border + '80' : '#2a2a38'}`,
                    cursor: 'pointer',
                  }}
                >
                  {short}
                </button>
              )
            })}
            {(filter.query || filter.stages.size > 0) && (
              <button
                onClick={() => setFilter({ query: '', stages: new Set() })}
                style={{ color: '#6b6b84', background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
                title="Clear filter"
              >
                <X size={14} />
              </button>
            )}
            {(filter.query || filter.stages.size > 0) && (
              <span className="text-xs" style={{ color: '#6b6b84' }}>
                {filteredApps.length} of {applications.length}
              </span>
            )}
          </div>
        )}

        {/* Main view */}
        <div className="flex-1 overflow-hidden px-6 py-4 min-h-0">
          {mainView === 'board' ? (
            applications.length > 0 && filteredApps.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: '#6b6b84' }}>
                <Search size={28} style={{ opacity: 0.4 }} />
                <p className="text-sm">No applications match your filter</p>
                <button
                  onClick={() => setFilter({ query: '', stages: new Set() })}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: '#2a2a38', color: '#9ca3af', border: 'none', cursor: 'pointer' }}
                >
                  Clear filter
                </button>
              </div>
            ) : (
              <KanbanBoard
                applications={filteredApps}
                onEdit={handleEdit}
                onDelete={deleteApplication}
                onMove={moveStage}
                onUpdate={updateApplication}
                onCardClick={app => setDetailApp(app)}
                onAddFirst={() => setShowAdd(true)}
              />
            )
          ) : (
            <PipelineView applications={applications} />
          )}
        </div>
      </div>

      {/* Modals */}
      {showAdd && <AddApplicationModal onClose={() => setShowAdd(false)} onAdd={addApplication} />}
      {editApp && <AddApplicationModal onClose={() => setEditApp(null)} onAdd={handleEditSave} initial={editApp} />}
      {liveDetailApp && <DetailDrawer app={liveDetailApp} onClose={() => setDetailApp(null)} onUpdate={updateApplication} />}
      {showGmail && (
        <GmailModal
          onClose={() => setShowGmail(false)}
          syncToken={syncToken}
          profile={gmailProfile}
          onConnected={token => { setSyncToken(token); if (token) localStorage.setItem('gmailSyncToken', token) }}
          onDisconnected={handleDisconnect}
          onSyncApply={handleSyncApply}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium z-[100] shadow-xl"
          style={{
            background: toast.type === 'error' ? '#ef444420' : '#22c55e20',
            border: `1px solid ${toast.type === 'error' ? '#ef444460' : '#22c55e60'}`,
            color: toast.type === 'error' ? '#ef4444' : '#22c55e',
          }}
        >
          <CheckCircle size={15} />
          {toast.message}
        </div>
      )}
    </div>
  )
}
