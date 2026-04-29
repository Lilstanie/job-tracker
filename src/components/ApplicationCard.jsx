import { Edit2, Archive, ChevronRight } from 'lucide-react'
import { STAGE_COLORS, STAGES } from '../data/mockData'
import { relativeTime, deadlineCountdown, formatDate } from '../utils/time'

function Avatar({ company }) {
  const colors = ['#6c63ff', '#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6']
  const letter = (company || '?')[0].toUpperCase()
  const idx = letter.charCodeAt(0) % colors.length
  return (
    <div
      className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 text-sm font-bold"
      style={{ background: colors[idx], color: 'white' }}
    >
      {letter}
    </div>
  )
}

const ASSESSMENT_STAGES = ['Online Assessment', 'Video Interview']

function StatusBadge({ status, onToggle }) {
  const isDone = status === 'completed'
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle() }}
      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium transition-all"
      style={{
        background: isDone ? '#22c55e18' : '#f59e0b18',
        color: isDone ? '#4ade80' : '#f59e0b',
        border: `1px solid ${isDone ? '#22c55e40' : '#f59e0b40'}`,
        cursor: 'pointer',
      }}
      title={isDone ? 'Click to mark as pending' : 'Click to mark as done'}
    >
      <span style={{ fontSize: 8 }}>{isDone ? '●' : '○'}</span>
      {isDone ? 'Done' : 'Pending'}
    </button>
  )
}

function DeadlineBadge({ deadline: dateStr, always }) {
  if (!dateStr) return null
  const countdown = deadlineCountdown(dateStr)
  if (countdown) {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full font-medium"
        style={{
          background: countdown.urgent ? '#ef444420' : '#f59e0b20',
          color: countdown.urgent ? '#ef4444' : '#f59e0b',
        }}
      >
        {countdown.label}
      </span>
    )
  }
  // For stages where a deadline always matters (OA/VI/Offer), show it regardless of how far away
  if (always) {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full font-medium"
        style={{ background: '#6c63ff18', color: '#a78bfa' }}
      >
        Due {formatDate(dateStr)}
      </span>
    )
  }
  return null
}

export default function ApplicationCard({ app, onEdit, onDelete, onMove, onUpdate, onClick, isDragging }) {
  const sc = STAGE_COLORS[app.stage] ?? STAGE_COLORS['Applied']
  const alwaysShowDeadline = ASSESSMENT_STAGES.includes(app.stage) || app.stage === 'Offer'
  const currentIdx = STAGES.indexOf(app.stage)
  const nextStage = currentIdx < STAGES.length - 1 ? STAGES[currentIdx + 1] : null

  return (
    <div
      onClick={() => onClick(app)}
      className="rounded-xl cursor-pointer select-none group transition-all duration-200"
      style={{
        background: '#1e1e28',
        border: `1px solid #2a2a38`,
        borderLeft: `3px solid ${sc.border}`,
        opacity: isDragging ? 0.5 : 1,
        boxShadow: isDragging ? '0 8px 32px #00000060' : '0 1px 3px #00000040',
        transform: isDragging ? 'rotate(2deg)' : 'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px #00000060'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px #00000040'; e.currentTarget.style.transform = 'none' }}
    >
      <div className="p-3">
        {/* Header */}
        <div className="flex items-start gap-2 mb-2">
          <Avatar company={app.company} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm leading-tight truncate" style={{ color: '#e2e2e8' }}>
              {app.company}
            </div>
            {app.role ? (
              <div
                className="text-xs truncate mt-0.5"
                style={{ color: app.roleSource === 'subject' ? '#6b6b84' : '#9ca3af', fontStyle: app.roleSource === 'subject' ? 'italic' : 'normal' }}
              >
                {app.role}
              </div>
            ) : app.sourceEmailSubject ? (
              <div className="text-xs truncate mt-0.5 italic" style={{ color: '#3a3a52' }}
                title={app.sourceEmailSubject}>
                {app.sourceEmailSubject.length > 52 ? app.sourceEmailSubject.slice(0, 52) + '…' : app.sourceEmailSubject}
              </div>
            ) : (
              <div className="text-xs mt-0.5" style={{ color: '#3a3a52' }}>Role unknown</div>
            )}
          </div>
        </div>

        {/* Assessment status badge */}
        {ASSESSMENT_STAGES.includes(app.stage) && app.assessmentStatus && (
          <div className="mb-2">
            <StatusBadge
              status={app.assessmentStatus ?? 'pending'}
              onToggle={() => onUpdate?.(app.id, {
                assessmentStatus: app.assessmentStatus === 'completed' ? 'pending' : 'completed'
              })}
            />
          </div>
        )}

        {/* Tags */}
        {(app.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {(app.tags ?? []).map(tag => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: '#2a2a38', color: '#9ca3af' }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs" style={{ color: '#6b6b84' }}>
            Applied {relativeTime(app.applied)}
          </span>
          <DeadlineBadge deadline={app.deadline ?? null} always={alwaysShowDeadline} />
        </div>

        {/* Next step */}
        {app.nextStep && (
          <div className="mt-2 text-xs px-2 py-1.5 rounded-lg truncate" style={{ background: '#6c63ff14', color: '#a78bfa' }}>
            → {app.nextStep.text}
          </div>
        )}
      </div>

      {/* Actions — visible on hover */}
      <div
        className="flex items-center gap-1 px-3 pb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => onEdit(app)}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors"
          style={{ color: '#6b6b84', background: '#2a2a38' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#e2e2e8' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6b6b84' }}
        >
          <Edit2 size={11} /> Edit
        </button>
        {nextStage && (
          <button
            onClick={() => onMove(app.id, nextStage)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors"
            style={{ color: sc.text, background: `${sc.border}18` }}
          >
            <ChevronRight size={11} /> {nextStage}
          </button>
        )}
        <button
          onClick={() => onDelete(app.id)}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md ml-auto transition-colors"
          style={{ color: '#6b6b84', background: '#2a2a38' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ef4444' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6b6b84' }}
        >
          <Archive size={11} />
        </button>
      </div>
    </div>
  )
}
