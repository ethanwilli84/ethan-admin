'use client'
import { useState, useEffect, useCallback } from 'react'
import { ITEMS, type AskItem } from './data'
import UpsGate from './UpsGate'
import './ups.css'

type ItemState = {
  feedback: string
  submittedToUps: boolean
  submittedDate: string | null
  lastUpdated: string
}

type StateMap = Record<string, ItemState>

const EMPTY: ItemState = { feedback: '', submittedToUps: false, submittedDate: null, lastUpdated: '' }

export default function UpsPage() {
  const [state, setState] = useState<StateMap>({})
  const [loaded, setLoaded] = useState(false)
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({})

  // Load all state on mount
  useEffect(() => {
    fetch('/api/ups')
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d === 'object' && !d.error) setState(d)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  // Save handler — used for both feedback and submitted toggle
  const save = useCallback(
    async (
      itemId: string,
      patch: { feedback?: string; submittedToUps?: boolean }
    ) => {
      setSavingMap((m) => ({ ...m, [itemId]: true }))
      try {
        await fetch('/api/ups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, ...patch }),
        })
      } catch {}
      setSavingMap((m) => {
        const n = { ...m }
        delete n[itemId]
        return n
      })
    },
    []
  )

  const updateLocal = (itemId: string, patch: Partial<ItemState>) => {
    setState((s) => ({
      ...s,
      [itemId]: {
        ...(s[itemId] || EMPTY),
        ...patch,
        lastUpdated: new Date().toISOString(),
      },
    }))
  }

  const submittedCount = Object.values(state).filter((v) => v.submittedToUps).length
  const totalAsks = ITEMS.length

  return (
    <UpsGate>
    <div className="ups-page">
      <div className="ups-container">
        <div className="hero">
          <img
            className="logo"
            src="https://sireship.com/assets/images/logo.png"
            alt="Sire"
          />
          <div className="eyebrow">Partnership Priorities · Q2 2026</div>
          <h1>Where we&apos;d love your help, Jeannie</h1>
          <p className="sub">
            Welcome to the account! Putting our top UPS asks in one place — ranked by what helps us
            most NOW. Most are amendments to the F835B6 carrier agreement; a couple are operational
            questions. <strong>You can give feedback per item and mark each as &ldquo;submitted to UPS&rdquo; as you work through them — Ethan sees your updates in real time.</strong>
          </p>
          <div className="stats">
            <div className="stat">
              <div className="num">$1.51M</div>
              <div className="lbl">UPS spend (T12M)</div>
            </div>
            <div className="stat">
              <div className="num">68,600</div>
              <div className="lbl">UPS shipments</div>
            </div>
            <div className="stat">
              <div className="num">$343K</div>
              <div className="lbl">Surcharges paid</div>
            </div>
            <div className="stat">
              <div className="num">
                {submittedCount}/{totalAsks}
              </div>
              <div className="lbl">Submitted to UPS</div>
            </div>
          </div>
        </div>

        <div className="urgent-banner">
          <strong>⏰ Time-sensitive:</strong> Item #1 below — our F835B6 + E32G88 Digital Connections
          approval codes expire in 5 days. Need access ASAP.
        </div>

        <div className="body">
          <div className="summary-totals">
            <h3>What&apos;s at stake (the numbers)</h3>
            <div className="summary-grid">
              <div className="summary-item">
                <div className="num">$311K</div>
                <div className="lbl">
                  Spent on dim-correction surcharges (T12M) — 89% of all our surcharge spend
                </div>
              </div>
              <div className="summary-item">
                <div className="num">$273K</div>
                <div className="lbl">
                  Spent on top destination ZIPs (top 30 ZIPs = 23.6% of all UPS volume)
                </div>
              </div>
              <div className="summary-item">
                <div className="num">12,300</div>
                <div className="lbl">Shipments/yr on our 5 highest-volume lanes</div>
              </div>
            </div>
          </div>

          <div className="section-label">
            <div className="bar"></div>
            <h2>Ranked by what helps us most — top to bottom</h2>
            <span className="count">
              {totalAsks} items · {submittedCount} submitted
            </span>
          </div>

          <div className="cards">
            {ITEMS.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                state={state[item.id] || EMPTY}
                saving={!!savingMap[item.id]}
                loaded={loaded}
                onLocalChange={(patch) => updateLocal(item.id, patch)}
                onSave={(patch) => save(item.id, patch)}
              />
            ))}
          </div>

          <div className="footer">
            <h3>Suggested next step</h3>
            <p>
              <strong>This week:</strong> get me the DCA approval codes (#1) before they expire,
              and answer items #2 and #3 (claim filing paths).
            </p>
            <p>
              <strong>Next 30 days:</strong> let&apos;s grab 30 min on the calendar with whoever from
              Pricing Engineering you&apos;d loop in to walk through items #4–#9 (the dim-correction
              relief bundle + the 3PL program review). Combined estimated impact for us is{' '}
              <strong>$200K+/yr</strong>.
            </p>
            <div className="signoff">
              Thanks Jeannie — looking forward to partnering with you.
              <strong>Ethan Williams · Owner, Sire Apps LLC</strong>
              <span style={{ opacity: 0.75, fontSize: 13 }}>ethan@sireapp.io</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </UpsGate>
  )
}

function ItemCard({
  item,
  state,
  saving,
  loaded,
  onLocalChange,
  onSave,
}: {
  item: AskItem
  state: ItemState
  saving: boolean
  loaded: boolean
  onLocalChange: (patch: Partial<ItemState>) => void
  onSave: (patch: { feedback?: string; submittedToUps?: boolean }) => void
}) {
  const [feedbackDraft, setFeedbackDraft] = useState(state.feedback || '')

  // Sync draft when remote state arrives or changes
  useEffect(() => {
    setFeedbackDraft(state.feedback || '')
  }, [state.feedback])

  const isSubmitted = state.submittedToUps

  const numCircleStyle: React.CSSProperties = item.redAccent
    ? {
        background: 'linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)',
      }
    : {}

  const cardClass =
    `card ${item.tier}` +
    (isSubmitted ? ' submitted' : '') +
    (item.redAccent ? ' red-accent' : '')

  return (
    <div className={cardClass}>
      <div className="num-circle" style={numCircleStyle}>
        {item.rank}
      </div>
      <div className="body-col">
        <h3 style={item.redAccent ? { color: '#b91c1c' } : undefined}>
          {item.alarm ? '⏰ ' : ''}
          {item.title}
        </h3>
        <p style={{ whiteSpace: 'pre-line' }}>{item.description}</p>
        <p className="why">
          <strong>{item.rank === 1 || item.rank === 2 || item.rank === 3 ? 'Why this is top priority:' : 'Why UPS should grant it:'}</strong>{' '}
          {item.why}
        </p>

        {loaded && (
          <div className="feedback-section">
            <label className="fb-label">Your feedback / status notes</label>
            <textarea
              className="fb-input"
              placeholder="Add notes here — what's been agreed, what's escalated, what's blocked, etc. Saves automatically when you click outside the box."
              value={feedbackDraft}
              onChange={(e) => setFeedbackDraft(e.target.value)}
              onBlur={() => {
                if (feedbackDraft !== state.feedback) {
                  onLocalChange({ feedback: feedbackDraft })
                  onSave({ feedback: feedbackDraft })
                }
              }}
            />
            <div className="fb-controls">
              <label className="submit-toggle">
                <input
                  type="checkbox"
                  checked={isSubmitted}
                  onChange={(e) => {
                    onLocalChange({
                      submittedToUps: e.target.checked,
                      submittedDate: e.target.checked ? new Date().toISOString() : null,
                    })
                    onSave({ submittedToUps: e.target.checked })
                  }}
                />
                <span>
                  {isSubmitted ? '✓ Submitted to UPS' : 'Mark as submitted to UPS'}
                </span>
              </label>
              {isSubmitted && state.submittedDate && (
                <span className="submitted-date">
                  on {new Date(state.submittedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
              <span className="save-status">
                {saving ? 'Saving…' : state.lastUpdated ? 'Saved' : ''}
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="meta-col">
        <div className="impact" style={item.redAccent ? { color: '#b91c1c' } : undefined}>
          {item.impact}
        </div>
        <div className="impact-sub">{item.impactSub}</div>
        {item.badge && (
          <div className="badges">
            <span className={`badge ${item.badge.kind}`}>{item.badge.label}</span>
          </div>
        )}
        {isSubmitted && (
          <div className="submitted-badge">SUBMITTED</div>
        )}
      </div>
    </div>
  )
}
