'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const NAV = [
  {
    section: 'Outreach',
    items: [
      { label: 'Campaigns', href: '/', icon: '◈' },
      { label: 'Manual Outreach', href: '/manual-outreach', icon: '📲' },
    ]
  },
  {
    section: 'Operations',
    items: [
      { label: 'Issues', href: '/issues', icon: '🔴' },
      { label: 'Alpine Ops', href: '/alpine-ops', icon: '💳' },
      { label: 'Sire Ops', href: '/sire-ops', icon: '📦' },
      { label: 'System Status', href: '/status', icon: '🟢' },
    ]
  },
  {
    section: 'Intelligence',
    items: [
      { label: 'Lead Pool', href: '/lead-pool', icon: '🎯' },
      { label: 'Projects', href: '/projects', icon: '⚡' },
      { label: 'Content', href: '/content', icon: '🎬' },
      { label: 'Conversations', href: '/conversations', icon: '💬' },
      { label: 'AI Life OS', href: '/life-os', icon: '🧠' },
      { label: 'Social Queue', href: '/social', icon: '📸' },
    ]
  },
  {
    section: 'Finance',
    items: [
      { label: 'Finance Monitor', href: '/finance', icon: '💰' },
    ]
  },
  {
    section: 'Settings',
    items: [
      { label: 'Outreach Settings', href: '/settings', icon: '📡' },
    ]
  },
]

export default function Sidebar() {
  const path = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{
      width: collapsed ? 56 : 210,
      minHeight: '100vh',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      transition: 'width 0.2s ease',
      overflow: 'hidden',
      position: 'sticky',
      top: 0,
    }}>
      {/* Logo + collapse */}
      <div style={{
        padding: '18px 14px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: 'var(--font-syne)',
          fontWeight: 800,
          fontSize: 14,
          background: 'linear-gradient(135deg,var(--accent),var(--accent-2))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          whiteSpace: 'nowrap',
        }}>
          {collapsed ? 'EA' : 'Ethan Admin'}
        </span>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            background: 'none', border: 'none',
            color: 'var(--text-3)', cursor: 'pointer',
            fontSize: 14, padding: 4, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
        {NAV.map(group => (
          <div key={group.section} style={{ marginBottom: 20 }}>
            {!collapsed && (
              <div style={{
                fontFamily: 'var(--font-dm-mono)',
                fontSize: 9,
                fontWeight: 500,
                color: 'var(--text-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                padding: '0 8px',
                marginBottom: 6,
              }}>
                {group.section}
              </div>
            )}
            {group.items.map(item => {
              const active = item.href === '/' ? path === '/' : path === item.href || path.startsWith(item.href)
              return (
                <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: collapsed ? '9px 0' : '8px 10px',
                    borderRadius: 8,
                    background: active ? 'rgba(91,79,233,0.12)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text-2)',
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    marginBottom: 2,
                    borderLeft: active && !collapsed ? '2px solid var(--accent)' : '2px solid transparent',
                  }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
                    {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
                  </div>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      {!collapsed && (
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          fontSize: 10,
          color: 'var(--text-3)',
          fontFamily: 'var(--font-dm-mono)',
        }}>
          v0.1 · ethan-admin
        </div>
      )}
    </div>
  )
}