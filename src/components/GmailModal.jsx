import { useState, useEffect, useRef } from 'react'
import { X, Mail, Shield, Zap, RefreshCw, CheckCircle, XCircle, AlertCircle, ChevronRight, ChevronDown, Calendar } from 'lucide-react'
import { STAGE_COLORS } from '../data/mockData'

const API = '/api/gmail'

function Badge({ confidence }) {
  const map = { high: ['#22c55e', '#22c55e20'], medium: ['#f59e0b', '#f59e0b20'], low: ['#6b7280', '#6b728020'] }
  const [color, bg] = map[confidence] ?? map.low
  return (
    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ color, background: bg }}>
      {confidence}
    </span>
  )
}

function StagePill({ stage }) {
  const sc = STAGE_COLORS[stage] ?? STAGE_COLORS['Applied']
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: sc.text, background: sc.bg, border: `1px solid ${sc.border}40` }}>
      {stage}
    </span>
  )
}

// ─── View: not yet connected ───────────────────────────────────────────────
function ConnectView({ onConnect }) {
  return (
    <>
      <div className="flex flex-col items-center py-6 gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: '#6c63ff20', border: '1px solid #6c63ff40' }}>
          <Mail size={28} style={{ color: '#6c63ff' }} />
        </div>
        <div className="text-center">
          <h3 className="font-bold text-base" style={{ color: '#e2e2e8' }}>Connect your Gmail</h3>
          <p className="text-sm mt-1 max-w-xs" style={{ color: '#9ca3af' }}>
            Trackr will scan your inbox for recruiter emails and automatically suggest stage updates.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 mb-6">
        {[
          { icon: Shield, text: 'Read-only OAuth — we never send emails on your behalf' },
          { icon: Zap, text: 'AI detects interview invites, offers & rejections' },
          { icon: Mail, text: 'Scans the last 90 days of your inbox' },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: '#16161d' }}>
            <Icon size={14} style={{ color: '#6c63ff' }} className="shrink-0" />
            <span className="text-sm" style={{ color: '#c4c4d4' }}>{text}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onConnect}
        className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
        style={{ background: '#6c63ff', color: 'white', cursor: 'pointer', border: 'none' }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <Mail size={15} />
        Connect Gmail
      </button>
    </>
  )
}

const RANGE_OPTIONS = [
  { label: '7 days',   days: 7 },
  { label: '30 days',  days: 30 },
  { label: '60 days',  days: 60 },
  { label: '90 days',  days: 90 },
]

function ToggleSwitch({ on, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        position: 'relative', width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
        background: on ? '#6c63ff' : '#2a2a38', transition: 'background 0.2s', flexShrink: 0, padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16,
        borderRadius: '50%', background: 'white', transition: 'left 0.2s',
      }} />
    </button>
  )
}

// ─── View: connected, ready to sync ────────────────────────────────────────
function ReadyView({ onSync, onDisconnect, syncing, profile, days, onDaysChange, onResetHistory, autoApplyHigh, onToggleAutoApply }) {
  return (
    <>
      {/* Profile card */}
      <div className="flex items-center gap-3 p-3 rounded-xl mb-5" style={{ background: '#16161d', border: '1px solid #2a2a38' }}>
        {profile?.picture
          ? <img src={profile.picture} alt={profile.name} className="w-10 h-10 rounded-full shrink-0" referrerPolicy="no-referrer" />
          : <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold" style={{ background: '#6c63ff', color: 'white' }}>{profile?.name?.[0] ?? 'G'}</div>
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: '#e2e2e8' }}>{profile?.name ?? 'Google Account'}</p>
          <p className="text-xs truncate" style={{ color: '#6b6b84' }}>{profile?.email ?? ''}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <CheckCircle size={14} style={{ color: '#22c55e' }} />
          <span className="text-xs font-medium" style={{ color: '#22c55e' }}>Connected</span>
        </div>
      </div>

      {/* Time range picker */}
      <div className="mb-5">
        <p className="text-xs mb-2" style={{ color: '#6b6b84' }}>Scan range</p>
        <div className="flex gap-2 flex-wrap">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.days}
              onClick={() => onDaysChange(opt.days)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: days === opt.days ? '#6c63ff' : '#16161d',
                color: days === opt.days ? 'white' : '#6b6b84',
                border: `1px solid ${days === opt.days ? '#6c63ff' : '#2a2a38'}`,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Auto-apply toggle */}
      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl mb-3"
        style={{ background: '#16161d', border: '1px solid #2a2a38' }}>
        <div>
          <p className="text-xs font-medium" style={{ color: '#e2e2e8' }}>Auto-apply high confidence</p>
          <p className="text-xs mt-0.5" style={{ color: '#6b6b84' }}>Skip review for results Gmail is certain about</p>
        </div>
        <ToggleSwitch on={autoApplyHigh} onToggle={onToggleAutoApply} />
      </div>

      <button
        onClick={onSync}
        disabled={syncing}
        className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mb-3"
        style={{ background: syncing ? '#2a2a38' : '#6c63ff', color: syncing ? '#6b6b84' : 'white', cursor: syncing ? 'not-allowed' : 'pointer', border: 'none' }}
      >
        <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
        {syncing ? `Scanning last ${days} days…` : `Sync Last ${days} Days`}
      </button>

      <div className="flex gap-2">
        <button
          onClick={onDisconnect}
          className="flex-1 text-xs py-2 rounded-lg"
          style={{ background: 'transparent', color: '#6b6b84', border: '1px solid #2a2a38', cursor: 'pointer' }}
        >
          Disconnect Gmail
        </button>
        <button
          onClick={onResetHistory}
          className="flex-1 text-xs py-2 rounded-lg"
          style={{ background: 'transparent', color: '#6b6b84', border: '1px solid #2a2a38', cursor: 'pointer' }}
          title="Clear remembered email IDs so all emails in the date range are re-scanned"
        >
          Reset sync history
        </button>
      </div>
    </>
  )
}

const CONFIDENCE_LEVELS = ['high', 'medium', 'low']
const CONFIDENCE_COLORS = { high: '#22c55e', medium: '#f59e0b', low: '#6b7280' }

// ─── View: results ─────────────────────────────────────────────────────────
function ResultsView({ results, emailCount, rawCount, skippedKnown, onApply, onClose, onResetHistory, autoAppliedCount }) {
  // Default: show high + medium; auto-include low if there are no high/medium results
  const hasHighOrMedium = results.some(r => r.confidence === 'high' || r.confidence === 'medium')
  const [visibleLevels, setVisibleLevels] = useState(
    () => hasHighOrMedium ? new Set(['high', 'medium']) : new Set(['high', 'medium', 'low'])
  )

  const visible = results
    .map((r, i) => ({ ...r, _i: i }))
    .filter(r => visibleLevels.has(r.confidence))

  const [selected, setSelected] = useState(
    () => new Set(results.map((_, i) => i).filter(i => {
      const conf = results[i]?.confidence
      return conf === 'high' || conf === 'medium' || !hasHighOrMedium
    }))
  )

  const toggleLevel = level => {
    setVisibleLevels(prev => {
      const next = new Set(prev)
      next.has(level) ? next.delete(level) : next.add(level)
      return next
    })
  }

  const toggle = i => setSelected(s => {
    const next = new Set(s)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })

  const counts = { high: 0, medium: 0, low: 0 }
  results.forEach(r => counts[r.confidence]++)

  const matched = visible.filter(r => r.appId)
  const unmatched = visible.filter(r => !r.appId)
  const selectedVisible = visible.filter(r => selected.has(r._i))
  const selectedMatched = selectedVisible.filter(r => r.appId).length
  const selectedNew = selectedVisible.filter(r => !r.appId).length

  if (!results.length) {
    return (
      <div className="flex flex-col items-center py-8 gap-3">
        {autoAppliedCount > 0 ? (
          <>
            <CheckCircle size={32} style={{ color: '#22c55e' }} />
            <p className="text-sm text-center font-medium" style={{ color: '#4ade80' }}>
              Auto-applied {autoAppliedCount} high-confidence result{autoAppliedCount !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-center" style={{ color: '#6b6b84' }}>No medium/low results to review.</p>
          </>
        ) : (
          <>
            <AlertCircle size={32} style={{ color: '#6b7280' }} />
            <p className="text-sm text-center" style={{ color: '#9ca3af' }}>
              Scanned {emailCount} emails — no new job emails found.
            </p>
          </>
        )}
        {skippedKnown > 0 && (
          <p className="text-xs text-center" style={{ color: '#f59e0b' }}>
            {skippedKnown} email{skippedKnown !== 1 ? 's' : ''} skipped (already synced).{' '}
            <button onClick={onResetHistory} style={{ color: '#6c63ff', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Reset sync history
            </button>{' '}
            to re-scan them.
          </p>
        )}
        <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg" style={{ background: '#2a2a38', color: '#9ca3af', border: 'none', cursor: 'pointer' }}>
          Close
        </button>
      </div>
    )
  }

  return (
    <>
      {/* Auto-applied banner */}
      {autoAppliedCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3"
          style={{ background: '#22c55e12', border: '1px solid #22c55e30' }}>
          <CheckCircle size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
          <p className="text-xs" style={{ color: '#4ade80' }}>
            Auto-applied {autoAppliedCount} high-confidence result{autoAppliedCount !== 1 ? 's' : ''} · review medium/low below
          </p>
        </div>
      )}

      {/* Stats + confidence filter */}
      <div className="mb-3">
        <p className="text-xs" style={{ color: '#6b6b84' }}>
          Gmail returned <strong style={{ color: '#9ca3af' }}>{rawCount}</strong> →
          job filter kept <strong style={{ color: '#9ca3af' }}>{emailCount}</strong> →
          found <strong style={{ color: '#9ca3af' }}>{results.length}</strong> new result{results.length !== 1 ? 's' : ''}
          {skippedKnown > 0 && (
            <span style={{ color: '#f59e0b' }}>
              {' '}· {skippedKnown} skipped (already synced —{' '}
              <button onClick={onResetHistory} style={{ color: '#6c63ff', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 'inherit' }}>
                reset
              </button>
              {' '}to re-scan)
            </span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs" style={{ color: '#6b6b84' }}>Show:</span>
        {CONFIDENCE_LEVELS.map(level => {
          const active = visibleLevels.has(level)
          const color = CONFIDENCE_COLORS[level]
          return (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition-all"
              style={{
                background: active ? `${color}20` : '#16161d',
                color: active ? color : '#3a3a4e',
                border: `1px solid ${active ? color + '50' : '#2a2a38'}`,
                cursor: 'pointer',
              }}
            >
              {level} <span style={{ color: active ? color : '#3a3a4e' }}>({counts[level]})</span>
            </button>
          )
        })}
        <button
          onClick={() => setSelected(new Set(visible.map(r => r._i)))}
          className="text-xs ml-auto"
          style={{ color: '#6c63ff', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Select all
        </button>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto mb-4" style={{ maxHeight: 340 }}>
        {matched.length > 0 && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#6b6b84' }}>
              Matched to your applications
            </p>
            {matched.map(r => (
              <ResultRow key={r._i} result={r} index={r._i} checked={selected.has(r._i)} onToggle={toggle} />
            ))}
          </>
        )}
        {unmatched.length > 0 && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide mt-3 mb-1" style={{ color: '#6b6b84' }}>
              New — will be added to tracker
            </p>
            {unmatched.map(r => (
              <ResultRow key={r._i} result={r} index={r._i} checked={selected.has(r._i)} onToggle={toggle} unmatched />
            ))}
          </>
        )}
        {visible.length === 0 && (
          <p className="text-xs text-center py-6" style={{ color: '#3a3a4e' }}>
            No results for selected confidence levels
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: '#2a2a38', color: '#9ca3af', border: 'none', cursor: 'pointer' }}>
          Cancel
        </button>
        <button
          onClick={() => onApply(visible.filter(r => selected.has(r._i)))}
          disabled={selectedVisible.length === 0}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
          style={{
            background: selectedVisible.length ? '#6c63ff' : '#2a2a38',
            color: selectedVisible.length ? 'white' : '#6b6b84',
            border: 'none',
            cursor: selectedVisible.length ? 'pointer' : 'not-allowed',
          }}
        >
          {selectedVisible.length === 0
            ? 'Apply'
            : [selectedMatched && `Update ${selectedMatched}`, selectedNew && `Add ${selectedNew} new`].filter(Boolean).join(' · ')
          }
        </button>
      </div>
    </>
  )
}

function DueDateBadge({ date }) {
  if (!date) return null
  const d = new Date(date + 'T00:00:00')
  const label = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  const daysLeft = Math.ceil((d - new Date()) / 86400000)
  const expired = daysLeft < 0
  const urgent = !expired && daysLeft <= 3
  const color = expired ? '#6b7280' : urgent ? '#ef4444' : '#f59e0b'
  const text = expired ? `Expired ${label}` : `Due ${label}${daysLeft <= 14 ? ` (${daysLeft}d)` : ''}`
  return (
    <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium"
      style={{ background: `${color}20`, color }}>
      <Calendar size={10} />
      {text}
    </span>
  )
}

function ResultRow({ result, index, checked, onToggle, unmatched }) {
  const [expanded, setExpanded] = useState(false)
  const emailCount = result.sourceEmails?.length ?? 1
  const firstSubject = result.sourceEmails?.[0]?.subject ?? ''

  return (
    <div
      className="rounded-xl transition-colors"
      style={{ background: checked ? '#6c63ff0e' : '#16161d', border: `1px solid ${checked ? '#6c63ff40' : '#2a2a38'}` }}
    >
      <label className="flex items-start gap-3 p-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(index)}
          className="mt-0.5 shrink-0"
          style={{ accentColor: '#6c63ff' }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: '#e2e2e8' }}>{result.company}</span>
            <ChevronRight size={12} style={{ color: '#6b6b84' }} />
            <StagePill stage={result.detectedStage} />
            <Badge confidence={result.confidence} />
            {unmatched && (
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#f59e0b20', color: '#f59e0b' }}>new</span>
            )}
            {result.dueDate && <DueDateBadge date={result.dueDate} />}
          </div>
          {result.role && (
            <p className="text-xs mt-0.5 truncate font-medium" style={{ color: '#c4c4d4' }}>{result.role}</p>
          )}
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-xs" style={{ color: '#6b6b84' }}>{result.summary}</p>
            {emailCount > 1 && (
              <button
                onClick={e => { e.preventDefault(); setExpanded(x => !x) }}
                className="flex items-center gap-0.5 text-xs shrink-0"
                style={{ color: '#6c63ff', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {emailCount} emails
                <ChevronDown size={11} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>
            )}
          </div>
        </div>
      </label>
      {expanded && emailCount > 1 && (
        <div className="px-3 pb-3 flex flex-col gap-1.5" style={{ borderTop: '1px solid #2a2a38' }}>
          <p className="text-xs pt-2 font-semibold uppercase tracking-wide" style={{ color: '#6b6b84' }}>Source emails</p>
          {result.sourceEmails.map((e, i) => (
            <div key={i} className="flex gap-2 items-start">
              <Mail size={11} style={{ color: '#6b6b84', marginTop: 2, shrink: 0 }} />
              <div className="min-w-0">
                <p className="text-xs truncate" style={{ color: '#c4c4d4' }}>{e.subject}</p>
                <p className="text-xs truncate" style={{ color: '#6b6b84' }}>{e.from} · {e.date ? new Date(e.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main modal ─────────────────────────────────────────────────────────────
export default function GmailModal({ onClose, syncToken, profile, onConnected, onDisconnected, onSyncApply }) {
  const [view, setView] = useState('idle')
  const [results, setResults] = useState([])
  const [emailCount, setEmailCount] = useState(0)
  const [rawCount, setRawCount] = useState(0)
  const [skippedKnown, setSkippedKnown] = useState(0)
  const [autoAppliedCount, setAutoAppliedCount] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [days, setDays] = useState(30)
  const [autoApplyHigh, setAutoApplyHigh] = useState(
    () => localStorage.getItem('trackr-auto-apply-high') === 'true'
  )
  const syncingRef = useRef(false)

  const toggleAutoApply = () => {
    setAutoApplyHigh(prev => {
      const next = !prev
      localStorage.setItem('trackr-auto-apply-high', String(next))
      return next
    })
  }

  // Escape key
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // If we have a token+profile, go straight to ready
  useEffect(() => {
    if (syncToken && profile) { setView('ready'); return }
    if (!syncToken) { setView('idle'); return }
    fetch(`${API}/status`, { headers: { 'x-sync-token': syncToken } })
      .then(r => r.json())
      .then(data => setView(data.connected ? 'ready' : 'idle'))
      .catch(() => setView('idle'))
  }, [syncToken, profile])

  const handleConnect = () => { window.location.href = `${API}/auth` }

  const handleDisconnect = () => {
    onDisconnected()
    setView('idle')
  }

  const handleSync = async () => {
    if (syncingRef.current) return  // debounce
    syncingRef.current = true
    setView('syncing')
    setErrorMsg('')
    try {
      const appsRaw = JSON.parse(localStorage.getItem('trackr-applications') || '[]')
      const knownIds = JSON.parse(localStorage.getItem('trackr-synced-ids') || '[]')
      const res = await fetch(`${API}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sync-token': syncToken },
        body: JSON.stringify({
          applications: appsRaw,
          days,
          knownIds,
          userTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      const allResults = data.results ?? []
      setEmailCount(data.emailCount ?? 0)
      setRawCount(data.rawCount ?? data.emailCount ?? 0)
      setSkippedKnown(data.skippedKnown ?? 0)
      setAutoAppliedCount(0)

      if (autoApplyHigh) {
        const highs = allResults.filter(r => r.confidence === 'high')
        const rest = allResults.filter(r => r.confidence !== 'high')
        if (highs.length > 0) {
          onSyncApply(highs)
          setAutoAppliedCount(highs.length)
        }
        setResults(rest)
      } else {
        setResults(allResults)
      }
      setView('results')
    } catch (err) {
      setErrorMsg(err.message)
      setView('error')
    } finally {
      syncingRef.current = false
    }
  }

  const handleApply = (confirmed) => {
    onSyncApply(confirmed)
    onClose()
  }

  const handleResetHistory = () => {
    localStorage.removeItem('trackr-synced-ids')
    setSkippedKnown(0)
    setView('ready')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: '#00000080' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative rounded-2xl w-full max-w-md mx-4 p-6"
        style={{ background: '#1e1e28', border: '1px solid #2a2a38', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#6c63ff20' }}>
              <Mail size={18} style={{ color: '#6c63ff' }} />
            </div>
            <div>
              <h2 className="font-bold text-sm" style={{ color: '#e2e2e8' }}>Gmail Sync</h2>
              <p className="text-xs" style={{ color: '#6b6b84' }}>Auto-detect recruiter emails</p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: '#6b6b84' }}
            onMouseEnter={e => e.currentTarget.style.color = '#e2e2e8'}
            onMouseLeave={e => e.currentTarget.style.color = '#6b6b84'}
          >
            <X size={18} />
          </button>
        </div>

        {/* Views */}
        {view === 'idle' && <ConnectView onConnect={handleConnect} />}
        {(view === 'ready' || view === 'syncing') && (
          <ReadyView onSync={handleSync} onDisconnect={handleDisconnect} onResetHistory={handleResetHistory} syncing={view === 'syncing'} profile={profile} days={days} onDaysChange={setDays} autoApplyHigh={autoApplyHigh} onToggleAutoApply={toggleAutoApply} />
        )}
        {view === 'results' && (
          <ResultsView results={results} emailCount={emailCount} rawCount={rawCount} skippedKnown={skippedKnown} onApply={handleApply} onClose={onClose} onResetHistory={handleResetHistory} autoAppliedCount={autoAppliedCount} />
        )}
        {view === 'error' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <XCircle size={32} style={{ color: '#ef4444' }} />
            <p className="text-sm text-center" style={{ color: '#ef4444' }}>{errorMsg}</p>
            <button
              onClick={() => setView('ready')}
              className="text-sm px-4 py-2 rounded-lg"
              style={{ background: '#2a2a38', color: '#9ca3af', border: 'none', cursor: 'pointer' }}
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
