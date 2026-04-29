import { useState, useEffect } from 'react'
import { X, ExternalLink, User, FileText, CheckSquare, Clock, Mail, Calendar, Edit2, Check } from 'lucide-react'
import { STAGE_COLORS, STAGES } from '../data/mockData'
import { formatDate, formatDateTime, relativeTime, deadlineCountdown } from '../utils/time'

const sectionStyle = {
  background: '#16161d',
  border: '1px solid #2a2a38',
  borderRadius: 10,
  padding: '14px 16px',
}

const ASSESSMENT_STAGES = ['Online Assessment', 'Video Interview']

function InlineEdit({ value, onSave, placeholder, multiline }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  const save = () => { onSave(draft); setEditing(false) }
  const cancel = () => { setDraft(value || ''); setEditing(false) }

  useEffect(() => { setDraft(value || '') }, [value])

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 text-left w-full group"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <span className="text-sm leading-snug" style={{ color: value ? '#c4c4d4' : '#3a3a4e' }}>
          {value || placeholder}
        </span>
        <Edit2 size={11} style={{ color: '#6b6b84', opacity: 0, transition: 'opacity 0.1s' }}
          className="group-hover:opacity-100 shrink-0" />
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {multiline ? (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={4}
          className="w-full rounded-lg p-2 text-sm resize-none"
          style={{ background: '#1e1e28', border: '1px solid #6c63ff', color: '#e2e2e8', outline: 'none' }}
          autoFocus
          onKeyDown={e => { if (e.key === 'Escape') cancel() }}
        />
      ) : (
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          className="rounded-lg px-2 py-1.5 text-sm w-full"
          style={{ background: '#1e1e28', border: '1px solid #6c63ff', color: '#e2e2e8', outline: 'none' }}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
        />
      )}
      <div className="flex gap-2">
        <button onClick={save} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ background: '#6c63ff', color: 'white', border: 'none', cursor: 'pointer' }}>
          <Check size={11} /> Save
        </button>
        <button onClick={cancel} className="text-xs px-3 py-1.5 rounded-lg"
          style={{ background: '#2a2a38', color: '#9ca3af', border: 'none', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function DetailDrawer({ app, onClose, onUpdate }) {
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState(app.notes || '')

  useEffect(() => { setNotes(app.notes || '') }, [app.notes])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape' && !editingNotes) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, editingNotes])

  const sc = STAGE_COLORS[app.stage] ?? STAGE_COLORS['Applied']
  const deadline = deadlineCountdown(app.deadline ?? null)
  const isAssessment = ASSESSMENT_STAGES.includes(app.stage)

  const saveNotes = () => {
    onUpdate(app.id, { notes })
    setEditingNotes(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: '#00000060' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col h-full overflow-y-auto"
        style={{
          width: 480,
          background: '#1e1e28',
          borderLeft: '1px solid #2a2a38',
          animation: 'slideIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-6 py-5 border-b sticky top-0 z-10"
          style={{ borderColor: '#2a2a38', background: '#1e1e28' }}>
          <div
            className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0 font-bold text-base"
            style={{ background: sc.border + '30', color: sc.text }}
          >
            {(app.company || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base leading-tight" style={{ color: '#e2e2e8' }}>{app.company}</h2>
            {/* Inline-editable role */}
            <div className="mt-0.5">
              <InlineEdit
                value={app.role}
                placeholder="Click to add role…"
                onSave={v => onUpdate(app.id, { role: v })}
              />
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}40` }}
              >
                {app.stage}
              </span>
              {isAssessment && app.assessmentStatus && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: app.assessmentStatus === 'completed' ? '#22c55e18' : '#f59e0b18',
                    color: app.assessmentStatus === 'completed' ? '#4ade80' : '#f59e0b',
                  }}
                >
                  {app.assessmentStatus === 'completed' ? '● Done' : '○ Pending'}
                </span>
              )}
              <span className="text-xs" style={{ color: '#6b6b84' }}>
                Applied {relativeTime(app.applied)} · {formatDate(app.applied)}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ color: '#6b6b84' }}
            onMouseEnter={e => e.currentTarget.style.color = '#e2e2e8'}
            onMouseLeave={e => e.currentTarget.style.color = '#6b6b84'}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          {/* Deadline */}
          {app.deadline && (
            <div style={sectionStyle}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={14} style={{ color: deadline?.urgent ? '#ef4444' : '#f59e0b' }} />
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6b6b84' }}>Deadline</span>
                </div>
                {deadline ? (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: deadline.urgent ? '#ef444420' : '#f59e0b20',
                      color: deadline.urgent ? '#ef4444' : '#f59e0b',
                    }}>
                    {deadline.label}
                  </span>
                ) : null}
              </div>
              <p className="text-sm mt-1 font-medium" style={{ color: '#e2e2e8' }}>{formatDate(app.deadline)}</p>
              {isAssessment && app.assessmentStatus !== 'completed' && (
                <button
                  onClick={() => onUpdate(app.id, { assessmentStatus: 'completed' })}
                  className="text-xs mt-2 px-3 py-1.5 rounded-lg"
                  style={{ background: '#22c55e18', color: '#4ade80', border: '1px solid #22c55e40', cursor: 'pointer' }}
                >
                  Mark as completed
                </button>
              )}
            </div>
          )}

          {/* Move Stage */}
          <div style={sectionStyle}>
            <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: '#6b6b84' }}>Move Stage</div>
            <div className="flex flex-wrap gap-2">
              {STAGES.map(s => {
                const c = STAGE_COLORS[s]
                const active = s === app.stage
                return (
                  <button
                    key={s}
                    onClick={() => !active && onUpdate(app.id, { stage: s })}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                    style={{
                      background: active ? c.bg : '#2a2a38',
                      color: active ? c.text : '#6b6b84',
                      border: active ? `1px solid ${c.border}60` : '1px solid transparent',
                      cursor: active ? 'default' : 'pointer',
                    }}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Next Step */}
          {app.nextStep && (
            <div style={sectionStyle}>
              <div className="flex items-center gap-2 mb-1">
                <CheckSquare size={14} style={{ color: '#6c63ff' }} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6b6b84' }}>Next Step</span>
              </div>
              <p className="text-sm mt-1" style={{ color: '#e2e2e8' }}>{app.nextStep.text}</p>
              {app.nextStep.due && (
                <p className="text-xs mt-1" style={{ color: '#6b6b84' }}>Due {formatDate(app.nextStep.due)}</p>
              )}
            </div>
          )}

          {/* Notes — inline editable */}
          <div style={sectionStyle}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText size={14} style={{ color: '#6c63ff' }} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6b6b84' }}>Notes</span>
              </div>
              {!editingNotes && (
                <button
                  onClick={() => setEditingNotes(true)}
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ color: '#6c63ff', background: '#6c63ff18' }}
                >
                  Edit
                </button>
              )}
            </div>
            {editingNotes ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full rounded-lg p-2 text-sm resize-none"
                  rows={4}
                  style={{ background: '#1e1e28', border: '1px solid #6c63ff', color: '#e2e2e8', outline: 'none' }}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={saveNotes} className="text-xs px-3 py-1.5 rounded-lg font-medium"
                    style={{ background: '#6c63ff', color: 'white', border: 'none', cursor: 'pointer' }}>
                    Save
                  </button>
                  <button onClick={() => { setNotes(app.notes || ''); setEditingNotes(false) }}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: '#2a2a38', color: '#9ca3af', border: 'none', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-relaxed" style={{ color: notes ? '#c4c4d4' : '#3a3a4e' }}>
                {notes || 'No notes yet. Click Edit to add some.'}
              </p>
            )}
          </div>

          {/* URL — inline editable */}
          <div style={sectionStyle}>
            <div className="flex items-center gap-2 mb-2">
              <ExternalLink size={14} style={{ color: '#6c63ff' }} />
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6b6b84' }}>Job Posting</span>
            </div>
            {app.url ? (
              <div className="flex items-center gap-2">
                <a href={app.url} target="_blank" rel="noreferrer"
                  className="text-sm truncate flex-1" style={{ color: '#6c63ff' }}>
                  {app.url}
                </a>
                <button onClick={() => onUpdate(app.id, { url: '' })}
                  className="text-xs shrink-0" style={{ color: '#6b6b84', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Clear
                </button>
              </div>
            ) : (
              <InlineEdit
                value={app.url}
                placeholder="Add job posting URL…"
                onSave={v => onUpdate(app.id, { url: v })}
              />
            )}
          </div>

          {/* Contacts */}
          {(app.contacts || []).length > 0 && (
            <div style={sectionStyle}>
              <div className="flex items-center gap-2 mb-3">
                <User size={14} style={{ color: '#6c63ff' }} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6b6b84' }}>Contacts</span>
              </div>
              <div className="flex flex-col gap-2">
                {app.contacts.map((c, i) => (
                  <div key={i}>
                    <div className="text-sm font-medium" style={{ color: '#e2e2e8' }}>{c.name}</div>
                    <div className="text-xs" style={{ color: '#6b6b84' }}>{c.email}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documents */}
          {(app.documents || []).length > 0 && (
            <div style={sectionStyle}>
              <div className="flex items-center gap-2 mb-3">
                <FileText size={14} style={{ color: '#6c63ff' }} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6b6b84' }}>Documents</span>
              </div>
              <div className="flex flex-col gap-2">
                {app.documents.map((d, i) => (
                  <a key={i} href={d.url}
                    className="flex items-center gap-2 text-sm"
                    style={{ color: '#6c63ff' }}
                    target="_blank" rel="noreferrer">
                    <ExternalLink size={13} />
                    {d.label}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div style={sectionStyle}>
            <div className="flex items-center gap-2 mb-4">
              <Clock size={14} style={{ color: '#6c63ff' }} />
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6b6b84' }}>Timeline</span>
            </div>
            <div className="flex flex-col gap-3">
              {[...(app.history || [])].reverse().map((h, i) => {
                const c = STAGE_COLORS[h.stage] ?? STAGE_COLORS['Applied']
                return (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: c.dot }} />
                      {i < (app.history || []).length - 1 && (
                        <span className="w-px flex-1 mt-1" style={{ background: '#2a2a38', minHeight: 12 }} />
                      )}
                    </div>
                    <div className="pb-2 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium" style={{ color: c.text }}>{h.stage}</span>
                        {h.emailSubject && (
                          <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full"
                            style={{ background: '#6c63ff18', color: '#6c63ff' }}>
                            <Mail size={10} /> Gmail
                          </span>
                        )}
                        <span className="text-xs" style={{ color: '#6b6b84' }}>{formatDateTime(h.timestamp)}</span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: '#6b6b84' }}>{h.note}</p>
                      {h.emailSubject && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: '#6b6b84' }} title={h.emailSubject}>
                          {h.emailSubject}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
