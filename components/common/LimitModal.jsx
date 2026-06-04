import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const SANS = "'Space Grotesk', sans-serif"

const FEATURE_COPY = {
  chat:     { title: "You've used all 15 demo messages", body: "You've reached the chat limit for the Mentorable demo. Join the waitlist to get full access when we launch." },
  research: { title: "You've used all 3 research queries", body: "You've reached the research limit for the Mentorable demo. Join the waitlist to get full access when we launch." },
  quest_gen:{ title: "You've used all 3 quest generations", body: "You've reached the quest generation limit for the Mentorable demo. Join the waitlist to get full access when we launch." },
}

export default function LimitModal({ feature, onClose }) {
  const copy = FEATURE_COPY[feature] ?? FEATURE_COPY.chat
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | done | error

  const handleJoin = async () => {
    if (!email.trim()) return
    setStatus('loading')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('waitlist').upsert({
      user_id: user?.id ?? null,
      email: email.trim(),
    }, { onConflict: 'user_id' })
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
        maxWidth: 420, width: '90%',
        boxShadow: '0 32px 80px rgba(0,0,0,0.18), 0 4px 20px rgba(29,78,216,0.1)',
        display: 'flex', flexDirection: 'column', gap: '1.25rem',
      }}>
        {/* Icon */}
        <div style={{ width: 48, height: 48, borderRadius: 14,
          background: 'linear-gradient(135deg,#1d4ed8,#60a5fa)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </div>

        {/* Copy */}
        <div>
          <h2 style={{ fontFamily: SANS, fontSize: '1.2rem', fontWeight: 700, color: '#141413', margin: '0 0 0.5rem' }}>
            {copy.title}
          </h2>
          <p style={{ fontFamily: SANS, fontSize: '0.9rem', color: '#6b7280', lineHeight: 1.7, margin: 0 }}>
            {copy.body}
          </p>
        </div>

        {status === 'done' ? (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
            padding: '1rem', fontFamily: SANS, fontSize: '0.88rem', color: '#15803d', textAlign: 'center' }}>
            You're on the list! We'll reach out when paid plans launch.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              style={{
                fontFamily: SANS, fontSize: '0.92rem', padding: '0.85rem 1rem',
                border: '1.5px solid rgba(37,99,235,0.2)', borderRadius: 10,
                outline: 'none', color: '#141413', background: '#fafafa',
                transition: 'border-color 0.2s',
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
              onClick={handleJoin}
              disabled={status === 'loading' || !email.trim()}
              style={{
                fontFamily: SANS, fontWeight: 700, fontSize: '0.92rem',
                color: '#fff', background: 'linear-gradient(135deg,#1d4ed8,#60a5fa)',
                border: 'none', borderRadius: 10, padding: '0.9rem',
                cursor: status === 'loading' || !email.trim() ? 'not-allowed' : 'pointer',
                opacity: status === 'loading' || !email.trim() ? 0.7 : 1,
                transition: 'opacity 0.2s',
              }}>
              {status === 'loading' ? 'Joining…' : 'Join the Waitlist'}
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
