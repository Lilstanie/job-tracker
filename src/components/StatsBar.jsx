import { TrendingUp, CheckCircle, XCircle, Activity, BarChart2, AlertTriangle } from 'lucide-react'

function Stat({ icon: Icon, label, value, color, urgent }) {
  return (
    <div
      className="flex items-center gap-3 px-5 py-3 rounded-xl flex-1 min-w-0"
      style={{
        background: '#1e1e28',
        border: `1px solid ${urgent ? color + '50' : '#2a2a38'}`,
      }}
    >
      <div className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0" style={{ background: `${color}18` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold leading-tight" style={{ color: urgent ? color : '#e2e2e8' }}>{value}</div>
        <div className="text-xs truncate" style={{ color: '#6b6b84' }}>{label}</div>
      </div>
    </div>
  )
}

export default function StatsBar({ stats }) {
  return (
    <div className="flex gap-3 flex-wrap">
      <Stat icon={BarChart2} label="Total Applied" value={stats.total} color="#6c63ff" />
      <Stat icon={Activity} label="In Progress" value={stats.inProgress} color="#3b82f6" />
      <Stat icon={CheckCircle} label="Offers" value={stats.offers} color="#22c55e" />
      <Stat icon={XCircle} label="Rejected" value={stats.rejected} color="#ef4444" />
      <Stat icon={TrendingUp} label="Response Rate" value={`${stats.responseRate}%`} color="#f59e0b" />
      {stats.urgentDeadlines > 0 && (
        <Stat icon={AlertTriangle} label="Due This Week" value={stats.urgentDeadlines} color="#ef4444" urgent />
      )}
    </div>
  )
}
