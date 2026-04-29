import { useState, useRef, useCallback } from 'react'
import { Briefcase, Plus } from 'lucide-react'
import { STAGES, STAGE_COLORS } from '../data/mockData'
import ApplicationCard from './ApplicationCard'

function KanbanColumn({ stage, apps, onEdit, onDelete, onMove, onUpdate, onCardClick, onDrop, dragOverStage, setDragOverStage, onDragStart }) {
  const sc = STAGE_COLORS[stage]
  const isOver = dragOverStage === stage

  return (
    <div
      className="flex flex-col shrink-0 rounded-xl transition-all duration-150"
      style={{
        width: 272,
        background: isOver ? '#1a1a2e' : '#16161d',
        border: `1px solid ${isOver ? sc.border + '80' : '#2a2a38'}`,
        boxShadow: isOver ? `0 0 0 1px ${sc.border}40` : 'none',
      }}
      onDragOver={e => { e.preventDefault(); setDragOverStage(stage) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverStage(null) }}
      onDrop={e => { e.preventDefault(); onDrop(stage) }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b" style={{ borderColor: '#2a2a38' }}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sc.dot }} />
        <span className="text-sm font-semibold flex-1 truncate" style={{ color: '#c4c4d4' }}>{stage}</span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: `${sc.border}20`, color: sc.text }}>
          {apps.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2.5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 216px)' }}>
        {apps.map(app => (
          <div
            key={app.id}
            draggable
            onDragStart={e => { e.dataTransfer.setData('appId', app.id); onDragStart(app.id) }}
          >
            <ApplicationCard app={app} onEdit={onEdit} onDelete={onDelete} onMove={onMove} onUpdate={onUpdate} onClick={onCardClick} />
          </div>
        ))}

        {/* Drop zone */}
        <div
          className="flex items-center justify-center text-xs rounded-lg py-6 transition-all duration-150"
          style={{
            color: isOver ? sc.text : '#3a3a52',
            border: `1px dashed ${isOver ? sc.border + '80' : '#2a2a3a'}`,
            background: isOver ? `${sc.border}08` : 'transparent',
            minHeight: apps.length === 0 ? 80 : undefined,
          }}
        >
          {isOver ? `Drop to move here` : apps.length === 0 ? 'Empty' : ''}
        </div>
      </div>
    </div>
  )
}

function EmptyBoard({ onAdd }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 pb-16">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: '#6c63ff18', border: '1px solid #6c63ff30' }}
      >
        <Briefcase size={26} style={{ color: '#6c63ff' }} />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold mb-1" style={{ color: '#e2e2e8' }}>No applications yet</p>
        <p className="text-sm" style={{ color: '#6b6b84' }}>
          Add your first application or connect Gmail to auto-import
        </p>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
        style={{ background: '#6c63ff', color: 'white', border: 'none', cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <Plus size={15} />
        Add Application
      </button>
    </div>
  )
}

export default function KanbanBoard({ applications, onEdit, onDelete, onMove, onUpdate, onCardClick, onAddFirst }) {
  const [dragOverStage, setDragOverStage] = useState(null)
  const draggedIdRef = useRef(null)

  const handleDragStart = useCallback((id) => { draggedIdRef.current = id }, [])

  const handleDrop = useCallback((targetStage) => {
    if (draggedIdRef.current) {
      onMove(draggedIdRef.current, targetStage)
      draggedIdRef.current = null
    }
    setDragOverStage(null)
  }, [onMove])

  if (applications.length === 0) return <EmptyBoard onAdd={onAddFirst} />

  const byStage = STAGES.reduce((acc, s) => {
    acc[s] = applications.filter(a => a.stage === s)
    return acc
  }, {})

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 flex-1" style={{ minHeight: 0 }}>
      {STAGES.map(stage => (
        <KanbanColumn
          key={stage}
          stage={stage}
          apps={byStage[stage]}
          onEdit={onEdit}
          onDelete={onDelete}
          onMove={onMove}
          onUpdate={onUpdate}
          onCardClick={onCardClick}
          onDrop={handleDrop}
          dragOverStage={dragOverStage}
          setDragOverStage={setDragOverStage}
          onDragStart={handleDragStart}
        />
      ))}
    </div>
  )
}
