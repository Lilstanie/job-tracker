import { useMemo } from 'react'
import { formatDate } from '../utils/time'
import { STAGE_COLORS } from '../data/mockData'

const PROG = ['Applied', 'Online Assessment', 'Video Interview', 'Assessment Centre', 'Offer']
const SHORT = ['Applied', 'OA', 'Interview', 'AC', 'Offer']
const COLORS = ['#6b7280', '#3b82f6', '#6c63ff', '#a855f7', '#22c55e']

function getMaxIdx(app) {
  let max = 0
  for (const s of [app.stage, ...(app.history || []).map(h => h.stage)]) {
    const idx = PROG.indexOf(s)
    if (idx > max) max = idx
  }
  return max
}

// Smooth bezier band between two column positions
function bandPath(x0, x1, y0top, y0bot, y1top, y1bot) {
  const cp = (x0 + x1) / 2
  return [
    `M ${x0} ${y0top}`,
    `C ${cp} ${y0top} ${cp} ${y1top} ${x1} ${y1top}`,
    `L ${x1} ${y1bot}`,
    `C ${cp} ${y1bot} ${cp} ${y0bot} ${x0} ${y0bot}`,
    'Z',
  ].join(' ')
}

function SankeyChart({ reached, total }) {
  const W = 640
  const H = 180
  const NODE_W = 18
  const TOP = 30
  const MAX_BAR = H - TOP - 50
  const COL_GAP = 148

  const xs = PROG.map((_, i) => 36 + i * COL_GAP)
  // bar heights proportional (min 5px so zero-count stages still draw a sliver)
  const bh = reached.map(n => n === 0 ? 0 : Math.max(5, (n / total) * MAX_BAR))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      <defs>
        {COLORS.map((c, i) => (
          <linearGradient key={i} id={`fg${i}`} x1="0" x2="1">
            <stop offset="0%" stopColor={c} stopOpacity="0.35" />
            <stop offset="100%" stopColor={c} stopOpacity="0.15" />
          </linearGradient>
        ))}
        {/* dropout gradient — fades downward */}
        <linearGradient id="dropGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ── flow bands between stages ── */}
      {reached.slice(0, -1).map((_, i) => {
        const nextN = reached[i + 1]
        if (nextN === 0) return null
        // flow at 'from' side = proportional height of nextN
        const fh = (nextN / total) * MAX_BAR
        const x0 = xs[i] + NODE_W
        const x1 = xs[i + 1]
        return (
          <path
            key={`flow-${i}`}
            d={bandPath(x0, x1, TOP, TOP + fh, TOP, TOP + bh[i + 1])}
            fill={`url(#fg${i + 1})`}
          />
        )
      })}

      {/* ── dropout bands (apps that didn't continue) ── */}
      {reached.slice(0, -1).map((fromN, i) => {
        const toN = reached[i + 1]
        const drop = fromN - toN
        if (drop === 0) return null
        const fh = (toN / total) * MAX_BAR   // band that "continues"
        const dropH = bh[i] - fh             // leftover height = dropout
        if (dropH <= 0) return null
        const x0 = xs[i] + NODE_W
        const x1 = x0 + 28
        const yTop = TOP + fh
        const yBot = TOP + bh[i]
        const cp = x0 + 16
        return (
          <g key={`drop-${i}`}>
            {/* dropout band curving downward */}
            <path
              d={[
                `M ${x0} ${yTop}`,
                `C ${cp} ${yTop} ${cp} ${yBot + 24} ${x0 + 6} ${H - 22}`,
                `L ${x0 - 2} ${H - 22}`,
                `C ${cp - 10} ${yBot + 20} ${x0 - 4} ${yTop + 4} ${x0} ${yTop}`,
                'Z',
              ].join(' ')}
              fill="url(#dropGrad)"
            />
            {/* dropout count label */}
            <text
              x={xs[i] + NODE_W / 2}
              y={H - 6}
              textAnchor="middle"
              fontSize={9}
              fill="#ef444488"
            >
              -{drop}
            </text>
          </g>
        )
      })}

      {/* ── node bars ── */}
      {PROG.map((stage, i) => {
        const n = reached[i]
        if (bh[i] === 0) return null
        return (
          <g key={stage}>
            <rect x={xs[i]} y={TOP} width={NODE_W} height={bh[i]} fill={COLORS[i]} rx={3} />
            {/* stage label above */}
            <text x={xs[i] + NODE_W / 2} y={TOP - 8} textAnchor="middle" fontSize={9} fill="#6b6b84">
              {SHORT[i]}
            </text>
            {/* count below bar */}
            <text
              x={xs[i] + NODE_W / 2}
              y={TOP + bh[i] + 13}
              textAnchor="middle"
              fontSize={13}
              fontWeight="bold"
              fill="#e2e2e8"
            >
              {n}
            </text>
            {/* conversion % (skip first column) */}
            {i > 0 && n > 0 && (
              <text
                x={xs[i] + NODE_W / 2}
                y={TOP + bh[i] + 25}
                textAnchor="middle"
                fontSize={9}
                fill="#6b6b84"
              >
                {Math.round((n / reached[0]) * 100)}%
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function KPI({ label, value, sub, color = '#e2e2e8' }) {
  return (
    <div className="flex flex-col gap-0.5 px-5 py-4 rounded-xl flex-1"
      style={{ background: '#1e1e28', border: '1px solid #2a2a38' }}>
      <span className="text-2xl font-bold" style={{ color }}>{value}</span>
      <span className="text-xs font-medium" style={{ color: '#e2e2e8' }}>{label}</span>
      {sub && <span className="text-xs" style={{ color: '#6b6b84' }}>{sub}</span>}
    </div>
  )
}

export default function PipelineView({ applications }) {
  const stats = useMemo(() => {
    const total = applications.length
    if (!total) return null

    const reached = PROG.map((_, i) =>
      applications.filter(a => getMaxIdx(a) >= i).length
    )

    const rejected = applications.filter(a => a.stage === 'Rejected').length
    const offers = applications.filter(a => a.stage === 'Offer').length
    const responseRate = total > 0 ? Math.round((reached[1] / total) * 100) : 0
    const offerRate = total > 0 ? Math.round((offers / total) * 100) : 0
    const stillApplied = applications.filter(a => a.stage === 'Applied').length

    // OA and VI pending/completed breakdown
    const oaPending = applications.filter(a => a.stage === 'Online Assessment' && a.assessmentStatus !== 'completed').length
    const oaDone = applications.filter(a => a.stage === 'Online Assessment' && a.assessmentStatus === 'completed').length
    const viPending = applications.filter(a => a.stage === 'Video Interview' && a.assessmentStatus !== 'completed').length
    const viDone = applications.filter(a => a.stage === 'Video Interview' && a.assessmentStatus === 'completed').length

    // Upcoming deadlines (next 14 days)
    const now = Date.now()
    const upcoming = applications
      .filter(a => a.deadline && a.stage !== 'Rejected')
      .map(a => ({ ...a, deadlineTs: new Date(a.deadline).getTime() }))
      .filter(a => a.deadlineTs >= now && a.deadlineTs <= now + 14 * 86400000)
      .sort((a, b) => a.deadlineTs - b.deadlineTs)

    return { total, reached, rejected, offers, responseRate, offerRate, stillApplied, oaPending, oaDone, viPending, viDone, upcoming }
  }, [applications])

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3"
        style={{ color: '#6b6b84' }}>
        <p className="text-sm">No applications yet — add some to see your pipeline.</p>
      </div>
    )
  }

  const { total, reached, rejected, offers, responseRate, offerRate, stillApplied, oaPending, oaDone, viPending, viDone, upcoming } = stats

  return (
    <div className="flex flex-col gap-5 overflow-y-auto h-full pb-6">
      {/* KPI row */}
      <div className="flex gap-3 flex-wrap">
        <KPI label="Total Applied" value={total} />
        <KPI label="Response Rate" value={`${responseRate}%`} sub="progressed past Applied" color="#f59e0b" />
        <KPI label="Offer Rate" value={`${offerRate}%`} sub={`${offers} offer${offers !== 1 ? 's' : ''}`} color="#22c55e" />
        <KPI label="Rejected" value={rejected} sub={`${Math.round((rejected / total) * 100)}% of total`} color="#ef4444" />
        <KPI label="Awaiting Response" value={stillApplied} sub="still at Applied stage" color="#6b7280" />
      </div>

      {/* Sankey chart */}
      <div className="rounded-2xl px-6 py-5" style={{ background: '#1e1e28', border: '1px solid #2a2a38' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: '#e2e2e8' }}>Application Pipeline</h3>
            <p className="text-xs mt-0.5" style={{ color: '#6b6b84' }}>
              Flow from application to offer · dropouts shown in red below each stage
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {PROG.map((s, i) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i] }} />
                <span className="text-xs" style={{ color: '#9ca3af' }}>{SHORT[i]}</span>
              </div>
            ))}
          </div>
        </div>
        <SankeyChart reached={reached} total={total} />
      </div>

      {/* Stage breakdown table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #2a2a38' }}>
        <div className="px-5 py-3 text-xs font-semibold uppercase tracking-wide"
          style={{ background: '#1a1a24', color: '#6b6b84', borderBottom: '1px solid #2a2a38' }}>
          Stage Breakdown
        </div>
        {PROG.map((stage, i) => {
          const n = reached[i]
          const prev = i > 0 ? reached[i - 1] : null
          const convRate = prev ? Math.round((n / prev) * 100) : 100
          const dropout = prev ? prev - n : 0
          const isOA = stage === 'Online Assessment'
          const isVI = stage === 'Video Interview'
          const pending = isOA ? oaPending : isVI ? viPending : null
          const done = isOA ? oaDone : isVI ? viDone : null
          const currentCount = isOA ? oaPending + oaDone : isVI ? viPending + viDone : null
          return (
            <div key={stage}
              className="flex items-center gap-4 px-5 py-3"
              style={{ background: '#1e1e28', borderBottom: i < PROG.length - 1 ? '1px solid #2a2a38' : 'none' }}>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i] }} />
              <span className="text-sm flex-1" style={{ color: '#e2e2e8' }}>{stage}</span>
              <span className="text-sm font-bold w-8 text-right" style={{ color: '#e2e2e8' }}>{n}</span>
              {/* Pending/Done breakdown for OA and VI */}
              {currentCount !== null && currentCount > 0 && (
                <div className="flex items-center gap-1.5">
                  {pending > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{ background: '#f59e0b18', color: '#f59e0b' }}>
                      {pending} pending
                    </span>
                  )}
                  {done > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{ background: '#22c55e18', color: '#4ade80' }}>
                      {done} done
                    </span>
                  )}
                </div>
              )}
              {prev !== null && (
                <>
                  <span className="text-xs w-16 text-right" style={{ color: '#f59e0b' }}>
                    {convRate}% pass
                  </span>
                  <span className="text-xs w-14 text-right" style={{ color: dropout > 0 ? '#ef444480' : '#6b6b84' }}>
                    {dropout > 0 ? `-${dropout} out` : '—'}
                  </span>
                </>
              )}
              {prev === null && (
                <span className="text-xs w-32 text-right" style={{ color: '#6b6b84' }}>
                  all applications
                </span>
              )}
            </div>
          )
        })}
        {/* Rejected row */}
        <div className="flex items-center gap-4 px-5 py-3"
          style={{ background: '#1e1e28', borderTop: '1px solid #2a2a38' }}>
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#ef4444' }} />
          <span className="text-sm flex-1" style={{ color: '#e2e2e8' }}>Rejected</span>
          <span className="text-sm font-bold w-8 text-right" style={{ color: '#ef4444' }}>{rejected}</span>
          <span className="text-xs w-16 text-right" style={{ color: '#ef444480' }}>
            {Math.round((rejected / total) * 100)}% of total
          </span>
          <span className="text-xs w-14 text-right" style={{ color: '#6b6b84' }}>—</span>
        </div>
      </div>

      {/* Upcoming deadlines */}
      {upcoming.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #2a2a38' }}>
          <div className="px-5 py-3 text-xs font-semibold uppercase tracking-wide"
            style={{ background: '#1a1a24', color: '#ef4444', borderBottom: '1px solid #2a2a38' }}>
            Upcoming Deadlines — next 14 days
          </div>
          {upcoming.map((a, i) => {
            const daysLeft = Math.ceil((a.deadlineTs - Date.now()) / 86400000)
            const urgent = daysLeft <= 3
            return (
              <div key={a.id}
                className="flex items-center gap-4 px-5 py-3"
                style={{ background: '#1e1e28', borderBottom: i < upcoming.length - 1 ? '1px solid #2a2a38' : 'none' }}>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block" style={{ color: '#e2e2e8' }}>{a.company}</span>
                  {a.role && <span className="text-xs truncate block" style={{ color: '#6b6b84' }}>{a.role}</span>}
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: `${STAGE_COLORS[a.stage]?.border ?? '#6b7280'}20`, color: STAGE_COLORS[a.stage]?.text ?? '#9ca3af' }}>
                  {a.stage}
                </span>
                <span className="text-xs font-medium shrink-0" style={{ color: '#9ca3af' }}>
                  {formatDate(a.deadline)}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                  style={{ background: urgent ? '#ef444420' : '#f59e0b20', color: urgent ? '#ef4444' : '#f59e0b' }}>
                  {daysLeft === 0 ? 'Today' : `${daysLeft}d`}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
