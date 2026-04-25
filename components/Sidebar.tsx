'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Zap,
  Send,
  AlertCircle,
  CreditCard,
  Package,
  Activity,
  Target,
  FolderOpen,
  Film,
  MessageCircle,
  Brain,
  Camera,
  TrendingUp,
  DollarSign,
  Lock,
  Radio,
  Sparkles,
  Newspaper,
  Rss,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type NavItem = { label: string; href: string; icon: LucideIcon }
type NavGroup = { section: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    section: 'Outreach',
    items: [
      { label: 'Campaigns', href: '/', icon: Zap },
      { label: 'Manual Outreach', href: '/manual-outreach', icon: Send },
    ],
  },
  {
    section: 'Operations',
    items: [
      { label: 'Issues', href: '/issues', icon: AlertCircle },
      { label: 'Alpine Ops', href: '/alpine-ops', icon: CreditCard },
      { label: 'Sire Ops', href: '/sire-ops', icon: Package },
      { label: 'System Status', href: '/status', icon: Activity },
    ],
  },
  {
    section: 'Intelligence',
    items: [
      { label: 'Lead Pool', href: '/lead-pool', icon: Target },
      { label: 'Projects', href: '/projects', icon: FolderOpen },
      { label: 'Content', href: '/content', icon: Film },
      { label: 'Conversations', href: '/conversations', icon: MessageCircle },
      { label: 'AI Life OS', href: '/life-os', icon: Brain },
      { label: 'AI Research', href: '/ai-research', icon: Sparkles },
      { label: 'Social Queue', href: '/social', icon: Camera },
      { label: 'Meta Ads', href: '/ads', icon: TrendingUp },
    ],
  },
  {
    section: 'Finance',
    items: [
      { label: 'Finance Monitor', href: '/finance', icon: DollarSign },
      { label: 'Investor Access', href: '/investor-access', icon: Lock },
    ],
  },
  {
    section: 'Daily Brief',
    items: [
      { label: 'Brief Tuning', href: '/brief-tuning', icon: Newspaper },
      { label: 'Brief Sources', href: '/brief-sources', icon: Rss },
    ],
  },
  {
    section: 'Settings',
    items: [
      { label: 'Outreach Settings', href: '/settings', icon: Radio },
    ],
  },
]

export default function Sidebar() {
  const path = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      style={{
        width: collapsed ? 56 : 220,
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
        height: '100vh',
      }}
    >
      {/* Logo + collapse */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          flexShrink: 0,
          height: 52,
        }}
      >
        {!collapsed && (
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--text-strong)',
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
            }}
          >
            Ethan Admin
          </span>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-3)',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <PanelLeft size={14} /> : <PanelLeftClose size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
        {NAV.map((group) => (
          <div key={group.section} style={{ marginBottom: 18 }}>
            {!collapsed && (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: 'var(--text-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  padding: '6px 10px 4px',
                  marginBottom: 2,
                }}
              >
                {group.section}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon
              const active =
                item.href === '/'
                  ? path === '/'
                  : path === item.href || path.startsWith(item.href + '/')
              return (
                <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: collapsed ? '8px 0' : '7px 10px',
                      borderRadius: 6,
                      background: active ? 'var(--surface-2)' : 'transparent',
                      color: active ? 'var(--text-strong)' : 'var(--text-2)',
                      fontSize: 13,
                      fontWeight: active ? 500 : 400,
                      cursor: 'pointer',
                      transition: 'background 0.12s, color 0.12s',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      marginBottom: 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        ;(e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)'
                        ;(e.currentTarget as HTMLDivElement).style.color = 'var(--text)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
                        ;(e.currentTarget as HTMLDivElement).style.color = 'var(--text-2)'
                      }
                    }}
                  >
                    <Icon size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
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
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--border)',
            fontSize: 10,
            color: 'var(--text-3)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          v0.2 · ethan-admin
        </div>
      )}
    </aside>
  )
}
