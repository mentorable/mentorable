import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const SANS = "'Raleway', sans-serif"

export default function FeedbackModal({ onClose }) {
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | done | error

  const handleSubmit = async () => {
    if (!message.trim()) return
    setStatus('loading')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setStatus('error'); return }
    const { error } = await supabase.from('feedback').insert({
      user_id: user.id,
      message: message.trim(),
    })
    setStatus(error ? 'error' : 'done')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '2.5rem 2rem',
        maxWidth: 440, width: '90%',
        boxShadow: '0 32px 80px rgba(0,0,0,0.18), 0 4px 20px rgba(29,78,216,0.1)',
        display: 'flex', flexDirection: 'column', gap: '1.25rem',
      }}>
        <div style={{ width: 48, height: 48, borderRadius: 14,
          background: '#1d4ed8',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>

        <div>
          <h2 style={{ fontFamily: SANS, fontSize: '1.2rem', fontWeight: 700, color: '#141413', margin: '0 0 0.5rem' }}>
            Share your feedback
          </h2>
          <p style={{ fontFamily: SANS, fontSize: '0.9rem', color: '#6b7280', lineHeight: 1.7, margin: 0 }}>
            Tell us what's working, what's not, or what you'd like to see in Mentorable.
          </p>
        </div>

        {status === 'done' ? (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
            padding: '1rem', fontFamily: SANS, fontSize: '0.88rem', color: '#15803d', textAlign: 'center' }}>
            Thanks, we got it.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <textarea
              placeholder="What's on your mind?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              style={{
                fontFamily: SANS, fontSize: '0.92rem', padding: '0.85rem 1rem',
                border: '1.5px solid rgba(37,99,235,0.2)', borderRadius: 10,
                outline: 'none', color: '#141413', background: '#fafafa',
                transition: 'border-color 0.2s', resize: 'vertical', minHeight: 110,
              }}
              onFocus={(e) => (e.target.style.borderColor = '#1d4ed8')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(37,99,235,0.2)')}
            />
            {status === 'error' && (
              <p style={{ fontFamily: SANS, fontSize: '0.8rem', color: '#dc2626', margin: 0 }}>
                Something went wrong. Try again.
              </p>
            )}
            <button
              onClick={handleSubmit}
              disabled={status === 'loading' || !message.trim()}
              style={{
                fontFamily: SANS, fontWeight: 700, fontSize: '0.92rem',
                color: '#fff', background: '#1d4ed8',
                border: 'none', borderRadius: 10, padding: '0.9rem',
                cursor: status === 'loading' || !message.trim() ? 'not-allowed' : 'pointer',
                opacity: status === 'loading' || !message.trim() ? 0.7 : 1,
                transition: 'opacity 0.2s',
              }}>
              {status === 'loading' ? 'Sending…' : 'Send Feedback'}
            </button>
          </div>
        )}

        <button onClick={onClose} style={{
          fontFamily: SANS, fontSize: '0.82rem', color: '#9ca3af',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'center',
        }}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
