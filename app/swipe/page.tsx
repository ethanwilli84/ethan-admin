'use client'
import { useEffect, useState, useCallback, useRef } from 'react'

interface Finding {
  _id: string
  title: string
  summary?: string
  summaryBullets?: string[]
  url: string
  source: string
  category: string
  relevanceScore: number
  riskLevel: 'low' | 'medium' | 'high'
  cost?: 'free' | 'freemium' | 'paid' | 'unknown'
  costDetail?: string
  requiresNewAccount?: boolean
  accountSignupUrl?: string
  proposedAction: string
  actionBullets?: string[]
  rationale: string
  rationaleBullets?: string[]
}

const RISK_COLOR: Record<string, string> = {
  low: '#00C896',
  medium: '#f59e0b',
  high: '#FF4757',
}

const COST_STYLE: Record<string, { color: string; label: string }> = {
  free: { color: '#00C896', label: 'FREE' },
  freemium: { color: '#3b82f6', label: 'FREEMIUM' },
  paid: { color: '#FF4757', label: 'PAID' },
  unknown: { color: '#888', label: 'COST?' },
}

export default function SwipePage() {
  const [token, setToken] = useState<string | null>(null)
  const [requestedId, setRequestedId] = useState<string | null>(null)
  const [finding, setFinding] = useState<Finding | null>(null)
  const [remaining, setRemaining] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false })
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  // Read token + requested id from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setToken(params.get('t'))
    setRequestedId(params.get('f'))
  }, [])

  const loadNext = useCallback(
    async (idOverride?: string | null) => {
      if (!token) return
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ t: token })
      const useId = idOverride !== undefined ? idOverride : requestedId
      if (useId) params.set('id', useId)
      try {
        const res = await fetch(`/api/swipe?${params.toString()}`)
        const data = await res.json()
        if (!data.ok) {
          setError(data.error || 'unauthorized')
          setFinding(null)
        } else {
          setFinding(data.finding)
          setRemaining(data.remaining || 0)
        }
      } catch (e) {
        setError((e as Error).message)
      }
      setLoading(false)
    },
    [token, requestedId]
  )

  // Initial load (only after token is set)
  useEffect(() => {
    if (token !== null) loadNext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function decide(action: 'accept' | 'reject', reason?: string) {
    if (!finding || !token) return
    // Optimistic: clear card + advance to next immediately
    const id = finding._id
    setFinding(null)
    setRequestedId(null)
    setDrag({ x: 0, y: 0, active: false })

    fetch('/api/swipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: token, id, action, reason }),
    }).catch(() => {
      /* keep going either way; backend lag is fine */
    })

    // Pull the next one (without an id override — server picks highest score)
    setTimeout(() => loadNext(null), 150)
  }

  // ── Touch/mouse drag for swipe gestures ─────────────────────────────────
  function onPointerDown(e: React.PointerEvent) {
    startRef.current = { x: e.clientX, y: e.clientY }
    setDrag({ x: 0, y: 0, active: true })
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!startRef.current || !drag.active) return
    setDrag({
      x: e.clientX - startRef.current.x,
      y: e.clientY - startRef.current.y,
      active: true,
    })
  }
  function onPointerUp() {
    if (!startRef.current) return
    const { x } = drag
    setDrag((d) => ({ ...d, active: false }))
    startRef.current = null
    if (x > 110) {
      decide('accept')
    } else if (x < -110) {
      decide('reject')
    } else {
      setDrag({ x: 0, y: 0, active: false })
    }
  }

  // Apply derived rotation/translation to the card
  const cardTransform = drag.active
    ? `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * 0.06}deg)`
    : 'translate(0, 0) rotate(0)'
  const acceptOpacity = Math.max(0, Math.min(1, drag.x / 110))
  const rejectOpacity = Math.max(0, Math.min(1, -drag.x / 110))

  if (error) {
    return (
      <div style={pageStyle()}>
        <div style={emptyStyle()}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Auth failed</div>
          <div style={{ fontSize: 14, opacity: 0.7 }}>{error}</div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={pageStyle()}>
        <div style={emptyStyle()}>
          <div style={{ fontSize: 14, opacity: 0.7 }}>loading...</div>
        </div>
      </div>
    )
  }

  if (!finding) {
    return (
      <div style={pageStyle()}>
        <div style={emptyStyle()}>
          <div style={{ fontSize: 64, marginBottom: 20 }}>✨</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>all clear</div>
          <div style={{ fontSize: 14, opacity: 0.6 }}>nothing to triage rn</div>
          <button
            onClick={() => loadNext(null)}
            style={{ ...refreshBtnStyle(), marginTop: 32 }}
          >
            ↻ refresh
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle()}>
      {/* Header */}
      <div style={headerStyle()}>
        <div style={{ fontSize: 13, fontFamily: 'monospace', opacity: 0.5 }}>
          AI Research · {remaining} pending
        </div>
      </div>

      {/* Card */}
      <div style={cardWrapStyle()}>
        {/* "REJECT" stamp */}
        <div
          style={{
            ...stampStyle('left'),
            opacity: rejectOpacity,
            color: '#FF4757',
            borderColor: '#FF4757',
          }}
        >
          NOPE
        </div>
        {/* "ACCEPT" stamp */}
        <div
          style={{
            ...stampStyle('right'),
            opacity: acceptOpacity,
            color: '#00C896',
            borderColor: '#00C896',
          }}
        >
          SHIP IT
        </div>

        <div
          ref={cardRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            ...cardStyle(),
            transform: cardTransform,
            transition: drag.active ? 'none' : 'transform 0.25s ease',
          }}
        >
          {/* Score + risk pill */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                fontFamily: 'monospace',
                color: finding.relevanceScore >= 8 ? '#00C896' : finding.relevanceScore >= 6 ? '#f59e0b' : '#888',
              }}
            >
              {finding.relevanceScore}/10
            </div>
            <div
              style={{
                padding: '4px 10px',
                borderRadius: 100,
                fontSize: 11,
                fontFamily: 'monospace',
                fontWeight: 600,
                color: RISK_COLOR[finding.riskLevel],
                border: `1px solid ${RISK_COLOR[finding.riskLevel]}`,
                textTransform: 'uppercase',
              }}
            >
              {finding.riskLevel} risk
            </div>
          </div>

          {/* Cost + account chips — front-and-center */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {(() => {
              const cs = COST_STYLE[finding.cost || 'unknown']
              return (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    padding: '3px 9px',
                    borderRadius: 4,
                    color: cs.color,
                    border: `1px solid ${cs.color}`,
                    letterSpacing: '0.05em',
                  }}
                >
                  {cs.label}
                </span>
              )
            })()}
            {finding.requiresNewAccount && (
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  padding: '3px 9px',
                  borderRadius: 4,
                  color: '#f59e0b',
                  border: '1px solid #f59e0b',
                  letterSpacing: '0.05em',
                }}
              >
                NEEDS NEW ACCOUNT
              </span>
            )}
            <span style={chipStyle()}>{(finding.category || '').replace(/_/g, ' ')}</span>
            <span style={chipStyle()}>{finding.source}</span>
          </div>

          {/* Cost detail line */}
          {finding.costDetail && (
            <div style={{ fontSize: 12, color: '#888', marginBottom: 12, fontFamily: 'monospace' }}>
              💰 {finding.costDetail}
            </div>
          )}

          {/* Title */}
          <div
            style={{
              fontSize: 21,
              fontWeight: 600,
              lineHeight: 1.25,
              marginBottom: 14,
              color: '#fff',
            }}
          >
            {finding.title}
          </div>

          {/* Summary — bullets if available, otherwise prose */}
          {finding.summaryBullets && finding.summaryBullets.length > 0 ? (
            <ul style={bulletListStyle()}>
              {finding.summaryBullets.map((b, i) => (
                <li key={i} style={bulletItemStyle('#ddd')}>
                  {b}
                </li>
              ))}
            </ul>
          ) : finding.summary ? (
            <div style={{ fontSize: 14, lineHeight: 1.5, color: '#ccc', marginBottom: 14 }}>{finding.summary}</div>
          ) : null}

          {/* Why it matters */}
          <div style={sectionStyle()}>
            <div style={sectionLabelStyle()}>why it matters</div>
            {finding.rationaleBullets && finding.rationaleBullets.length > 0 ? (
              <ul style={bulletListStyle()}>
                {finding.rationaleBullets.map((b, i) => (
                  <li key={i} style={bulletItemStyle('#bbb')}>
                    {b}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={sectionTextStyle()}>{finding.rationale}</div>
            )}
          </div>

          {/* What to do */}
          <div style={sectionStyle()}>
            <div style={sectionLabelStyle()}>what to do</div>
            {finding.actionBullets && finding.actionBullets.length > 0 ? (
              <ul style={bulletListStyle()}>
                {finding.actionBullets.map((b, i) => (
                  <li key={i} style={bulletItemStyle('#bbb')}>
                    {b}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={sectionTextStyle()}>{finding.proposedAction}</div>
            )}
          </div>

          {/* Account signup CTA if needed */}
          {finding.requiresNewAccount && finding.accountSignupUrl && (
            <a
              href={finding.accountSignupUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                marginTop: 14,
                padding: '8px 14px',
                background: '#f59e0b',
                color: '#000',
                fontWeight: 600,
                fontSize: 12,
                fontFamily: 'monospace',
                borderRadius: 6,
                textDecoration: 'none',
              }}
            >
              ↗ sign up
            </a>
          )}

          {/* Source link */}
          <a
            href={finding.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              fontFamily: 'monospace',
              color: '#6366f1',
              wordBreak: 'break-all',
              display: 'block',
              marginTop: 14,
            }}
          >
            ↗ {finding.url}
          </a>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', padding: '16px 0 32px' }}>
        <button
          onClick={() => decide('reject')}
          aria-label="reject"
          style={{
            ...actionBtnStyle(),
            color: '#FF4757',
            border: '2px solid #FF4757',
          }}
        >
          ✕
        </button>
        <button
          onClick={() => decide('accept')}
          aria-label="accept"
          style={{
            ...actionBtnStyle(),
            color: '#00C896',
            border: '2px solid #00C896',
          }}
        >
          ✓
        </button>
      </div>
    </div>
  )
}

// ── Inline styles (no Tailwind, plain CSS, mobile-first) ────────────────────

function pageStyle(): React.CSSProperties {
  return {
    minHeight: '100vh',
    background: '#0a0a0a',
    color: '#fff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    padding: '20px 16px',
    display: 'flex',
    flexDirection: 'column',
    overscrollBehavior: 'none',
    touchAction: 'pan-y',
  }
}

function headerStyle(): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 16,
  }
}

function cardWrapStyle(): React.CSSProperties {
  return {
    flex: 1,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
  }
}

function cardStyle(): React.CSSProperties {
  return {
    width: '100%',
    maxWidth: 480,
    background: '#161616',
    border: '1px solid #262626',
    borderRadius: 16,
    padding: '20px 22px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
    cursor: 'grab',
    userSelect: 'none',
    touchAction: 'none',
  }
}

function stampStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    top: 32,
    [side]: 32,
    border: '3px solid',
    borderRadius: 6,
    padding: '4px 10px',
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: '0.08em',
    transform: side === 'left' ? 'rotate(-15deg)' : 'rotate(15deg)',
    pointerEvents: 'none',
    zIndex: 10,
    background: 'rgba(0,0,0,0.7)',
  }
}

function chipStyle(): React.CSSProperties {
  return {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#888',
    background: '#262626',
    borderRadius: 4,
    padding: '2px 7px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }
}

function sectionStyle(): React.CSSProperties {
  return {
    marginTop: 14,
    paddingTop: 12,
    borderTop: '1px solid #262626',
  }
}

function sectionLabelStyle(): React.CSSProperties {
  return {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: 4,
  }
}

function sectionTextStyle(): React.CSSProperties {
  return { fontSize: 13, lineHeight: 1.5, color: '#bbb' }
}

function bulletListStyle(): React.CSSProperties {
  return {
    margin: 0,
    paddingLeft: 18,
    listStyle: 'disc',
    color: '#bbb',
  }
}

function bulletItemStyle(color: string): React.CSSProperties {
  return {
    fontSize: 13.5,
    lineHeight: 1.45,
    color,
    marginBottom: 4,
  }
}

function actionBtnStyle(): React.CSSProperties {
  return {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: '#0a0a0a',
    fontSize: 28,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'monospace',
  }
}

function refreshBtnStyle(): React.CSSProperties {
  return {
    background: '#262626',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'monospace',
  }
}

function emptyStyle(): React.CSSProperties {
  return {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    minHeight: '70vh',
  }
}
