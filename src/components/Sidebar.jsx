import { useState } from 'react'
import { LayoutDashboard, Briefcase, Calendar, Settings, ChevronLeft, ChevronRight, Zap } from 'lucide-react'

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: Briefcase, label: 'Applications', active: false },
  { icon: Calendar, label: 'Calendar', active: false },
  { icon: Settings, label: 'Settings', active: false },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className="flex flex-col shrink-0 transition-all duration-300 relative"
      style={{
        width: collapsed ? 64 : 220,
        background: '#16161d',
        borderRight: '1px solid #2a2a38',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5" style={{ height: 64 }}>
        <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: '#6c63ff' }}>
          <Zap size={15} color="white" fill="white" />
        </div>
        {!collapsed && (
          <span className="font-bold text-base tracking-tight" style={{ color: '#e2e2e8' }}>
            Trackr
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-2 flex-1 mt-2">
        {NAV.map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            title={collapsed ? label : undefined}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-left transition-colors duration-150"
            style={{
              background: active ? '#6c63ff18' : 'transparent',
              color: active ? '#a78bfa' : '#6b6b84',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#ffffff08' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
          >
            <Icon size={17} style={{ color: active ? '#6c63ff' : '#6b6b84', shrink: 0 }} className="shrink-0" />
            {!collapsed && <span className="text-sm font-medium">{label}</span>}
          </button>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center justify-center w-6 h-6 rounded-full absolute -right-3 top-8 transition-colors"
        style={{ background: '#2a2a38', border: '1px solid #3a3a4e', color: '#9ca3af' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#3a3a4e' }}
        onMouseLeave={e => { e.currentTarget.style.background = '#2a2a38' }}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  )
}
