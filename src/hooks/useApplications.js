import { useReducer, useCallback, useEffect } from 'react'
import { genId } from '../data/mockData'

const STORAGE_KEY = 'trackr-apps-v1'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []  // empty board by default — no mock data
}

function saveToStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    // Also save a slim copy for the Gmail sync endpoint
    localStorage.setItem('trackr-applications', JSON.stringify(
      state.map(({ id, company, role, stage }) => ({ id, company, role, stage }))
    ))
  } catch {}
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
            try { timestamp = new Date(_emailDate).toISOString() } catch {}
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
          updated.history = [...app.history, entry]
        }
        return updated
      })
    }
    case 'DELETE':
      return state.filter(app => app.id !== action.id)
    case 'MOVE_STAGE':
      return state.map(app => {
        if (app.id !== action.id) return app
        return {
          ...app,
          stage: action.stage,
          history: [
            ...app.history,
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

  const getStats = useCallback(() => {
    const total = applications.length
    const offers = applications.filter(a => a.stage === 'Offer').length
    const rejected = applications.filter(a => a.stage === 'Rejected').length
    const inProgress = applications.filter(a => !['Applied', 'Offer', 'Rejected'].includes(a.stage)).length
    const responded = applications.filter(a => a.stage !== 'Applied').length
    const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0

    const now = Date.now()
    const in7d = now + 7 * 86400000
    const urgentDeadlines = applications.filter(a => {
      if (!a.deadline) return false
      const t = new Date(a.deadline).getTime()
      return t >= now && t <= in7d
    }).length

    return { total, offers, rejected, inProgress, responseRate, urgentDeadlines }
  }, [applications])

  return { applications, addApplication, updateApplication, deleteApplication, moveStage, resetApplications, getStats }
}
