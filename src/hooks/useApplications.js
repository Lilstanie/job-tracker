import { useReducer, useCallback, useEffect, useMemo } from 'react'
import { genId } from '../data/mockData'

const STORAGE_KEY = 'trackr-apps-v1'

// Normalise an application loaded from storage so the rest of the codebase
// can rely on `app.history` always being an array. Older builds occasionally
// wrote items without a history field, which would crash UPDATE / MOVE_STAGE
// when we tried to spread a non-array.
function normaliseApp(app) {
  return {
    ...app,
    history: Array.isArray(app?.history) ? app.history : [],
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map(normaliseApp) : []
    }
  } catch {
    // Corrupt JSON — start clean rather than crash the app.
  }
  return [] // empty board by default — no mock data
}

function saveToStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    // Also save a slim copy for the Gmail sync endpoint
    localStorage.setItem('trackr-applications', JSON.stringify(
      state.map(({ id, company, role, stage }) => ({ id, company, role, stage }))
    ))
  } catch { /* private mode / quota */ }
}

function reducer(state, action) {
  switch (action.type) {
    case 'ADD': {
      const now = new Date().toISOString()
      const payloadHistory = Array.isArray(action.payload.history) ? action.payload.history : null
      return [...state, {
        role: '',
        url: '',
        notes: '',
        tags: [],
        deadline: null,
        contacts: [],
        documents: [],
        nextStep: null,
        assessmentStatus: null,
        ...action.payload,
        id: genId(),
        history: payloadHistory?.length
          ? payloadHistory
          : [{ stage: action.payload.stage, timestamp: now, note: 'Application added' }],
      }]
    }
    case 'UPDATE': {
      return state.map(app => {
        if (app.id !== action.id) return app
        const { _historyNote, _emailEvidence, _emailDate, ...rest } = action.payload
        const updated = { ...app, ...rest }
        if (rest.stage && rest.stage !== app.stage) {
          let timestamp = new Date().toISOString()
          if (_emailDate) {
            const t = Date.parse(_emailDate)
            if (Number.isFinite(t)) timestamp = new Date(t).toISOString()
          }
          const entry = {
            stage: rest.stage,
            timestamp,
            note: _historyNote ?? `Moved to ${rest.stage}`,
          }
          if (_emailEvidence) {
            entry.emailSubject = _emailEvidence.subject
            entry.emailFrom = _emailEvidence.from
          }
          const prevHistory = Array.isArray(app.history) ? app.history : []
          updated.history = [...prevHistory, entry]
        }
        return updated
      })
    }
    case 'DELETE':
      return state.filter(app => app.id !== action.id)
    case 'MOVE_STAGE':
      return state.map(app => {
        if (app.id !== action.id) return app
        const prevHistory = Array.isArray(app.history) ? app.history : []
        return {
          ...app,
          stage: action.stage,
          history: [
            ...prevHistory,
            { stage: action.stage, timestamp: new Date().toISOString(), note: `Moved to ${action.stage}` },
          ],
        }
      })
    case 'RESET_ALL':
      return []
    default:
      return state
  }
}

export function useApplications() {
  const [applications, dispatch] = useReducer(reducer, null, loadFromStorage)

  // Persist every change to localStorage
  useEffect(() => {
    saveToStorage(applications)
  }, [applications])

  const addApplication = useCallback((data) => dispatch({ type: 'ADD', payload: data }), [])
  const updateApplication = useCallback((id, payload) => dispatch({ type: 'UPDATE', id, payload }), [])
  const deleteApplication = useCallback((id) => dispatch({ type: 'DELETE', id }), [])
  const moveStage = useCallback((id, stage) => dispatch({ type: 'MOVE_STAGE', id, stage }), [])
  const resetApplications = useCallback(() => dispatch({ type: 'RESET_ALL' }), [])

  // Time-independent stats are memoised by `applications` so the linear scan
  // runs once per data change rather than every render of the consumer.
  const baseStats = useMemo(() => {
    let total = 0, offers = 0, rejected = 0, inProgress = 0, responded = 0
    for (const a of applications) {
      total++
      if (a.stage === 'Offer') offers++
      else if (a.stage === 'Rejected') rejected++
      else if (a.stage !== 'Applied') inProgress++
      if (a.stage !== 'Applied') responded++
    }
    const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0
    return { total, offers, rejected, inProgress, responseRate }
  }, [applications])

  // urgentDeadlines is intentionally time-dependent — it must reflect "the
  // next 7 days from now". Kept in a useCallback (NOT useMemo) because
  // useMemo's purity rule would flag Date.now(), and the work is cheap.
  const getStats = useCallback(() => {
    const now = Date.now()
    const in7d = now + 7 * 86_400_000
    let urgentDeadlines = 0
    for (const a of applications) {
      if (!a.deadline) continue
      const t = Date.parse(a.deadline)
      if (Number.isFinite(t) && t >= now && t <= in7d) urgentDeadlines++
    }
    return { ...baseStats, urgentDeadlines }
  }, [applications, baseStats])

  // Snapshot the time-dependent stats once per render of the consumer so
  // App.jsx can pass `stats` directly to children without each child also
  // calling getStats(). Using useMemo with Date.now() inside getStats is
  // safe because useCallback bodies are not subject to the purity rule.
  const stats = getStats()

  return { applications, addApplication, updateApplication, deleteApplication, moveStage, resetApplications, getStats, stats }
}
