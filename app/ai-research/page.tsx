'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Finding {
  _id: string
  title: string
  summary: string
  url: string
  source: string
  category: string
  relevanceScore: number
  riskLevel: 'low' | 'medium' | 'high'
  proposedAction: string
  proposedFiles: string[]
  rationale: string
  status: string
  outcome?: string
  notes?: string[]
  searchQuery?: string
  createdAt: string
  updatedAt: string
}

const SOURCE_LABEL: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  github: 'GitHub',
  hn: 'HN',
  producthunt: 'Product Hunt',
  web: 'Web',
  other: 'Other',
}
const CAT_LABEL: Record<string, string> = {
  prompt_improvement: 'Prompt',
  new_data_source: 'Data source',
  new_api_unlock: 'API unlock',
  cost_reduction: 'Cost',
  architecture_pattern: 'Arch',
  tool_or_library: 'Tool/lib',
  other: 'Other',
}
const RISK_COLOR: Record<string, string> = {
  low: 'var(--green)',
  medium: '#f59e0b',
  high: '#FF4757',
}

export default function AiResearchPage() {
  const [findings, setFindings] = useState<Finding[]>([])
  const [counts, setCounts] = useState<{ _id: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selected, setSelected] = useState<Finding | null>(null)
  const [statusFilter, setStatusFilter] = useState('new')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [minScore, setMinScore] = useState(5)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<{ kept: number; total: number } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ status: statusFilter, limit: '100', minScore: String(minScore) })
    if (categoryFilter !== 'all') params.set('category', categoryFilter)
    const res = await fetch(`/api/ai-research?${params}`)
    const d = await res.json()
    setFindings(d.findings || [])
    setCounts(d.counts || [])
    setLastSyncedAt(d.lastSyncedAt || null)
    setLoading(false)
  }, [statusFilter, categoryFilter, minScore])

  useEffect(() => {
    load()
  }, [load])

  async function runSync() {
    setSyncing(true)
    setSyncResult(null)
    const res = await fetch('/api/ai-research/sync', { method: 'POST' })
    const d = await res.json()
    setSyncResult({ kept: d.findingsKept || 0, total: d.findingsSurfaced || 0 })
    setSyncing(false)
    load()
  }

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    await fetch('/api/ai-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id, ...extra }),
    })
    setSelected(null)
    load()
  }

  const countMap = Object.fromEntries(counts.map((c) => [c._id, c.count]))
  const newCount = countMap['new'] || 0
  const acceptedCount = countMap['accepted'] || 0

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <Link href="/" style={{ color: 'var(--text-3)', fontSize: 13, textDecoration: 'none' }}>
            ← Admin
          </Link>
          <div
            style={{
              fontFamily: 'var(--font-syne)',
              fontWeight: 700,
              fontSize: 22,
              marginTop: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            AI Research
            {newCount > 0 && (
              <span
                style={{
                  fontSize: 12,
                  background: 'var(--accent)',
                  color: '#fff',
                  borderRadius: 20,
                  padding: '2px 8px',
                  fontFamily: 'var(--font-dm-mono)',
                  fontWeight: 600,
                }}
              >
                {newCount} new
              </span>
            )}
            {acceptedCount > 0 && (
              <span
                style={{
                  fontSize: 11,
                  background: 'rgba(0,200,150,0.12)',
                  color: 'var(--green)',
                  borderRadius: 20,
                  padding: '2px 8px',
                  fontFamily: 'var(--font-dm-mono)',
                  border: '1px solid rgba(0,200,150,0.25)',
                }}
              >
                {acceptedCount} accepted
              </span>
            )}
          </div>
          {lastSyncedAt && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, fontFamily: 'var(--font-dm-mono)' }}>
              last synced {new Date(lastSyncedAt).toLocaleString()}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {syncResult && (
            <span style={{ fontSize: 11, color: 'var(--green)', fontFamily: 'var(--font-dm-mono)' }}>
              +{syncResult.kept} kept of {syncResult.total}
            </span>
          )}
          <button className="btn-primary" style={{ fontSize: 12 }} onClick={runSync} disabled={syncing}>
            {syncing ? '◌ Searching...' : '↺ Run Research'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          ['new', 'New'],
          ['accepted', 'Accepted'],
          ['shipped', 'Shipped'],
          ['rejected', 'Rejected'],
          ['archived', 'Archived'],
          ['all', 'All'],
        ].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setStatusFilter(val as string)}
            style={{
              padding: '5px 11px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: statusFilter === val ? 'var(--surface-2)' : 'transparent',
              color: statusFilter === val ? 'var(--text-strong)' : 'var(--text-2)',
              cursor: 'pointer',
              fontFamily: 'var(--font-dm-mono)',
            }}
          >
            {label}
            {countMap[val as string] !== undefined && val !== 'all' && (
              <span style={{ marginLeft: 6, color: 'var(--text-3)' }}>{countMap[val as string]}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{
            padding: '5px 8px',
            fontSize: 12,
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text-2)',
            fontFamily: 'var(--font-dm-mono)',
          }}
        >
          <option value="all">All categories</option>
          {Object.entries(CAT_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)' }}>min score</span>
        <input
          type="range"
          min={0}
          max={10}
          value={minScore}
          onChange={(e) => setMinScore(parseInt(e.target.value))}
          style={{ width: 100 }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-dm-mono)', minWidth: 18 }}>
          {minScore}
        </span>
      </div>

      {/* List */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: selected ? '1fr 420px' : '1fr',
          gap: 16,
        }}
      >
        <div>
          {loading ? (
            <div style={{ color: 'var(--text-3)', fontSize: 13 }}>loading...</div>
          ) : findings.length === 0 ? (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              {statusFilter === 'new'
                ? 'No new findings. Hit Run Research to scan for AI/automation news.'
                : 'No findings match these filters.'}
            </div>
          ) : (
            findings.map((f) => (
              <div
                key={f._id}
                onClick={() => setSelected(f)}
                className="card"
                style={{
                  padding: 14,
                  marginBottom: 8,
                  cursor: 'pointer',
                  border:
                    selected?._id === f._id ? '1px solid var(--accent)' : '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: 'var(--font-dm-mono)',
                          color: 'var(--text-3)',
                          background: 'var(--surface-2)',
                          borderRadius: 4,
                          padding: '1px 6px',
                        }}
                      >
                        {SOURCE_LABEL[f.source] || f.source}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: 'var(--font-dm-mono)',
                          color: 'var(--text-3)',
                          background: 'var(--surface-2)',
                          borderRadius: 4,
                          padding: '1px 6px',
                        }}
                      >
                        {CAT_LABEL[f.category] || f.category}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: 'var(--font-dm-mono)',
                          color: RISK_COLOR[f.riskLevel],
                          border: `1px solid ${RISK_COLOR[f.riskLevel]}`,
                          borderRadius: 4,
                          padding: '1px 6px',
                        }}
                      >
                        {f.riskLevel} risk
                      </span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong)', marginBottom: 4 }}>
                      {f.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{f.summary}</div>
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontFamily: 'var(--font-dm-mono)',
                      fontWeight: 600,
                      color:
                        f.relevanceScore >= 8
                          ? 'var(--green)'
                          : f.relevanceScore >= 6
                          ? '#f59e0b'
                          : 'var(--text-3)',
                      flexShrink: 0,
                    }}
                  >
                    {f.relevanceScore}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div
            className="card"
            style={{
              padding: 18,
              position: 'sticky',
              top: 16,
              alignSelf: 'flex-start',
              maxHeight: 'calc(100vh - 32px)',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)' }}>
                Score {selected.relevanceScore}/10 · {selected.riskLevel}
              </span>
              <button
                onClick={() => setSelected(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-3)',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--text-strong)' }}>
              {selected.title}
            </div>
            <a
              href={selected.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11,
                color: 'var(--accent)',
                fontFamily: 'var(--font-dm-mono)',
                wordBreak: 'break-all',
                display: 'block',
                marginBottom: 12,
              }}
            >
              {selected.url}
            </a>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 14 }}>
              {selected.summary}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-dm-mono)',
                  color: 'var(--text-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 6,
                }}
              >
                Why it matters
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>{selected.rationale}</div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-dm-mono)',
                  color: 'var(--text-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 6,
                }}
              >
                Proposed action
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>{selected.proposedAction}</div>
              {selected.proposedFiles?.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {selected.proposedFiles.map((p) => (
                    <div
                      key={p}
                      style={{
                        fontSize: 11,
                        fontFamily: 'var(--font-dm-mono)',
                        color: 'var(--text-3)',
                        background: 'var(--surface-2)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        display: 'inline-block',
                        marginRight: 4,
                        marginTop: 4,
                      }}
                    >
                      {p}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selected.searchQuery && (
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-dm-mono)',
                  color: 'var(--text-3)',
                  marginBottom: 16,
                }}
              >
                via search: {selected.searchQuery}
              </div>
            )}

            {selected.status === 'new' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => act(selected._id, 'accept')}>
                  ✓ Accept
                </button>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    const r = prompt('reason?')
                    if (r !== null) act(selected._id, 'reject', { reason: r })
                  }}
                >
                  ✕ Reject
                </button>
                <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => act(selected._id, 'archive')}>
                  ⌫ Archive
                </button>
              </div>
            )}
            {selected.status === 'accepted' && (
              <button
                className="btn-primary"
                style={{ fontSize: 12 }}
                onClick={() => {
                  const o = prompt('outcome / what shipped?') || ''
                  act(selected._id, 'mark_shipped', { outcome: o })
                }}
              >
                ✓ Mark shipped
              </button>
            )}
            {selected.outcome && (
              <div
                style={{
                  marginTop: 14,
                  padding: 10,
                  background: 'var(--surface-2)',
                  borderRadius: 6,
                  fontSize: 12,
                  color: 'var(--text-2)',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-dm-mono)',
                    color: 'var(--text-3)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 4,
                  }}
                >
                  outcome
                </div>
                {selected.outcome}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
