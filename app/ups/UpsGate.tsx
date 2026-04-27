'use client'
import { useState, useEffect, ReactNode } from 'react'

const STORAGE_KEY = 'ups-access-v1'
const PASSWORD = '2026'

type Stored = { name: string; ts: number }

export default function UpsGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false)
  const [checked, setChecked] = useState(false)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // On mount, check localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const v = JSON.parse(raw) as Stored
        if (v?.name && v?.ts) setUnlocked(true)
      }
    } catch {}
    setChecked(true)
  }, [])

  if (!checked) {
    return null
  }

  if (unlocked) {
    return <>{children}</>
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const trimmedName = name.trim()
    if (trimmedName.length < 2) {
      setError('Please enter your full name.')
      return
    }
    if (password !== PASSWORD) {
      setError('Incorrect password.')
      return
    }
    setSubmitting(true)
    try {
      // Log access to ethan-admin (same pattern as investor-access)
      await fetch('/api/investor-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, portal: 'ups' }),
      })
    } catch {}
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ name: trimmedName, ts: Date.now() } satisfies Stored)
      )
    } catch {}
    setSubmitting(false)
    setUnlocked(true)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <img
          src="https://sireship.com/assets/images/logo.png"
          alt="Sire"
          style={styles.logo}
        />
        <div style={styles.eyebrow}>UPS partnership priorities</div>
        <h1 style={styles.heading}>Sign in to view</h1>
        <p style={styles.sub}>
          Confidential to Sire Apps LLC and the recipient. Enter your full name and the access
          password to continue.
        </p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Your full name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jeannie Smith"
              autoFocus
              autoComplete="name"
              style={styles.input}
            />
          </label>
          <label style={styles.label}>
            Access password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Provided by Ethan"
              autoComplete="off"
              style={styles.input}
            />
          </label>
          {error && <div style={styles.error}>{error}</div>}
          <button type="submit" disabled={submitting} style={styles.button}>
            {submitting ? 'Verifying…' : 'Continue'}
          </button>
        </form>
        <div style={styles.footnote}>
          By signing in, you acknowledge the contents of this page are confidential.
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1f2c5c 0%, #4a3c8c 50%, #6b3fa0 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 16px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif',
  },
  card: {
    background: '#fff',
    borderRadius: 20,
    padding: '40px 36px',
    maxWidth: 440,
    width: '100%',
    boxShadow: '0 30px 80px rgba(0, 0, 0, 0.25)',
  },
  logo: {
    height: 28,
    marginBottom: 24,
    display: 'block',
  },
  eyebrow: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    color: '#6b3fa0',
    fontWeight: 700,
    marginBottom: 10,
  },
  heading: {
    fontSize: 26,
    fontWeight: 800,
    color: '#1a1d2e',
    margin: '0 0 10px',
    letterSpacing: '-0.02em',
  },
  sub: {
    fontSize: 14,
    color: '#4a4d5e',
    lineHeight: 1.55,
    margin: '0 0 24px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b6e7e',
    fontWeight: 700,
  },
  input: {
    padding: '12px 14px',
    border: '1px solid #d8dce8',
    borderRadius: 10,
    fontSize: 15,
    fontFamily: 'inherit',
    color: '#1a1d2e',
    background: '#fafbfd',
    outline: 'none',
  },
  error: {
    fontSize: 13,
    color: '#b91c1c',
    background: '#fff0f0',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #fecaca',
  },
  button: {
    padding: '14px 18px',
    border: 'none',
    borderRadius: 10,
    background: 'linear-gradient(135deg, #4a3c8c 0%, #6b3fa0 100%)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 4,
  },
  footnote: {
    fontSize: 11,
    color: '#9ca0b0',
    marginTop: 20,
    textAlign: 'center',
  },
}
