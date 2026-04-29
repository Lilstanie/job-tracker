import { useState, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { STAGES, ALL_TAGS } from '../data/mockData'

const EMPTY = {
  company: '',
  role: '',
  url: '',
  applied: new Date().toISOString().slice(0, 10),
  stage: 'Applied',
  tags: [],
  notes: '',
}

const inputStyle = {
  background: '#16161d',
  border: '1px solid #2a2a38',
  borderRadius: 8,
  color: '#e2e2e8',
  padding: '8px 12px',
  fontSize: 14,
  outline: 'none',
  width: '100%',
}

function Field({ label, error, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium" style={{ color: '#9ca3af' }}>{label}</label>
        {error && <span className="text-xs" style={{ color: '#ef4444' }}>{error}</span>}
      </div>
      {children}
    </div>
  )
}

export default function AddApplicationModal({ onClose, onAdd, initial }) {
  const [form, setForm] = useState(initial ? { ...EMPTY, ...initial } : EMPTY)
  const [errors, setErrors] = useState({})

  // Escape key to close
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    if (errors[k]) setErrors(e => ({ ...e, [k]: null }))
  }

  const toggleTag = tag => set('tags', form.tags.includes(tag) ? form.tags.filter(t => t !== tag) : [...form.tags, tag])

  const handleSubmit = (e) => {
    e.preventDefault()
    const newErrors = {}
    if (!form.company.trim()) newErrors.company = 'Required'
    if (Object.keys(newErrors).length) { setErrors(newErrors); return }
    onAdd(form)
    onClose()
  }

  const borderFocus = e => e.target.style.borderColor = '#6c63ff'
  const borderBlur = e => e.target.style.borderColor = '#2a2a38'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: '#00000080' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative rounded-2xl w-full max-w-lg mx-4"
        style={{ background: '#1e1e28', border: '1px solid #2a2a38', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10" style={{ borderColor: '#2a2a38', background: '#1e1e28' }}>
          <h2 className="text-base font-semibold" style={{ color: '#e2e2e8' }}>
            {initial ? 'Edit Application' : 'Add Application'}
          </h2>
          <button onClick={onClose} style={{ color: '#6b6b84' }}
            onMouseEnter={e => e.currentTarget.style.color = '#e2e2e8'}
            onMouseLeave={e => e.currentTarget.style.color = '#6b6b84'}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Company *" error={errors.company}>
              <input
                style={{ ...inputStyle, borderColor: errors.company ? '#ef4444' : '#2a2a38' }}
                value={form.company}
                onChange={e => set('company', e.target.value)}
                placeholder="e.g. Example Company"
                autoFocus
                onFocus={borderFocus}
                onBlur={borderBlur}
              />
            </Field>
            <Field label="Role" error={errors.role}>
              <input
                style={{ ...inputStyle, borderColor: errors.role ? '#ef4444' : '#2a2a38' }}
                value={form.role}
                onChange={e => set('role', e.target.value)}
                placeholder="e.g. Graduate SWE"
                onFocus={borderFocus}
                onBlur={borderBlur}
              />
            </Field>
          </div>

          <Field label="Job Posting URL">
            <input
              style={inputStyle}
              value={form.url}
              onChange={e => set('url', e.target.value)}
              placeholder="https://..."
              onFocus={borderFocus}
              onBlur={borderBlur}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Applied Date">
              <input
                type="date"
                style={{ ...inputStyle, colorScheme: 'dark' }}
                value={form.applied}
                onChange={e => set('applied', e.target.value)}
                onFocus={borderFocus}
                onBlur={borderBlur}
              />
            </Field>
            <Field label="Stage">
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={form.stage}
                onChange={e => set('stage', e.target.value)}
                onFocus={borderFocus}
                onBlur={borderBlur}
              >
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Tags">
            <div className="flex flex-wrap gap-2">
              {ALL_TAGS.map(tag => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className="text-xs px-3 py-1 rounded-full"
                  style={{
                    background: form.tags.includes(tag) ? '#6c63ff' : '#2a2a38',
                    color: form.tags.includes(tag) ? 'white' : '#9ca3af',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Notes">
            <textarea
              style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Any notes about the application..."
              onFocus={borderFocus}
              onBlur={borderBlur}
            />
          </Field>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: '#2a2a38', color: '#9ca3af', border: 'none', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: '#6c63ff', color: 'white', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              <Plus size={15} />
              {initial ? 'Save Changes' : 'Add Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
