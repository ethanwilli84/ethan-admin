'use client'
import { useEffect, useState } from 'react'

interface EmailAccount { id: string; email: string; label: string; active: boolean; type: string }
interface GlobalConfig {
  emailAccounts: EmailAccount[]
  dedupWindowDays: number
  dedupCrossChannel: boolean
  dedupCrossCampaign: boolean
  globalPause: boolean
  channels: { email: { enabled: boolean }; instagram: { enabled: boolean; accounts: string[] }; facebook: { enabled: boolean; accounts: string[] } }
}

export default function SettingsPage() {
  const [config, setConfig] = useState<GlobalConfig|null>(null)
  const [saved, setSaved] = useState(false)
  const [contactStats, setContactStats] = useState<{total: number}>({total: 0})
  const [newEmail, setNewEmail] = useState('')
  const [newEmailLabel, setNewEmailLabel] = useState('')

  useEffect(() => {
    fetch('/api/global-settings').then(r=>r.json()).then(setConfig)
    fetch('/api/contacts?limit=1').then(r=>r.json()).then((c: unknown[]) => setContactStats({total: Array.isArray(c) ? c.length : 0}))
    // get total count
    fetch('/api/contacts?limit=10000').then(r=>r.json()).then((c: unknown[]) => setContactStats({total: Array.isArray(c) ? c.length : 0}))
  }, [])

  async function save() {
    await fetch('/api/global-settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(config) })
    setSaved(true); setTimeout(()=>setSaved(false), 2000)
  }

  function addEmailAccount() {
    if (!newEmail || !newEmail.includes('@')) return
    const account: EmailAccount = { id: Date.now().toString(), email: newEmail, label: newEmailLabel || newEmail, active: true, type: 'gmail' }
    setConfig(p => p ? {...p, emailAccounts: [...p.emailAccounts, account]} : p)
    setNewEmail(''); setNewEmailLabel('')
  }

  function removeEmailAccount(id: string) {
    setConfig(p => p ? {...p, emailAccounts: p.emailAccounts.filter(a => a.id !== id)} : p)
  }

  if (!config) return <div className="main" style={{color:'var(--text-3)'}}>Loading...</div>

  return (
    <><div className="page-header-bar"><div><div className="page-title">Outreach Settings</div><div className="page-sub">Global config across all campaigns and channels</div></div><button className="btn-primary" onClick={save}>{saved?'✓ Saved':'Save Settings'}</button></div><div className="main" style={{maxWidth:720}}>

      {/* Email Accounts */}
      <div className="card space-24">
        <div className="section-label space-8">Email Accounts</div>
        <div style={{fontSize:11,color:'var(--text-3)',marginBottom:12}}>All campaigns share these accounts. Dedup runs across all of them.</div>
        {config.emailAccounts.map(acc => (
          <div key={acc.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'var(--surface-2)',borderRadius:10,marginBottom:8,border:'1px solid var(--border)'}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:600,fontSize:13}}>{acc.label}</div>
              <div style={{fontFamily:'var(--font-dm-mono)',fontSize:11,color:'var(--text-3)'}}>{acc.email} · {acc.type}</div>
            </div>
            <span className={acc.active ? 'badge-active' : 'badge-paused'}>{acc.active ? 'active' : 'inactive'}</span>
            {acc.id !== 'default' && (
              <button onClick={()=>removeEmailAccount(acc.id)} style={{background:'none',border:'none',color:'var(--red)',fontSize:13,cursor:'pointer'}}>✕</button>
            )}
          </div>
        ))}
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <input className="settings-input" style={{flex:1}} placeholder="email@domain.com" value={newEmail} onChange={e=>setNewEmail(e.target.value)} />
          <input className="settings-input" style={{width:160}} placeholder="Label (e.g. Alpine)" value={newEmailLabel} onChange={e=>setNewEmailLabel(e.target.value)} />
          <button className="btn-ghost" onClick={addEmailAccount}>+ Add</button>
        </div>
      </div>

      {/* Dedup Settings */}
      <div className="card space-24">
        <div className="section-label space-8">Contact Deduplication</div>
        <div style={{fontSize:11,color:'var(--text-3)',marginBottom:16}}>
          Central database tracks <strong>{contactStats.total}</strong> contacted people across all campaigns. Prevents double-outreach.
        </div>
        <div className="grid-2 space-16">
          <div>
            <div className="settings-label">Dedup Window (days)</div>
            <input type="number" className="settings-input" min={1} max={365} value={config.dedupWindowDays}
              onChange={e=>setConfig(p=>p?{...p,dedupWindowDays:parseInt(e.target.value)||90}:p)} />
            <div style={{fontSize:11,color:'var(--text-3)',marginTop:4}}>Don't re-contact same email within this window</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:12,paddingTop:20}}>
            <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
              <input type="checkbox" checked={config.dedupCrossCampaign} onChange={e=>setConfig(p=>p?{...p,dedupCrossCampaign:e.target.checked}:p)} />
              <span style={{fontSize:13}}>Dedup across campaigns</span>
            </label>
            <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
              <input type="checkbox" checked={config.dedupCrossChannel} onChange={e=>setConfig(p=>p?{...p,dedupCrossChannel:e.target.checked}:p)} />
              <span style={{fontSize:13}}>Dedup across channels (email, Instagram, etc)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Channels */}
      <div className="card space-24">
        <div className="section-label space-8">Channels</div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {[
            { key: 'email', label: '✉ Email', status: 'connected' },
            { key: 'instagram', label: '📸 Instagram', status: 'coming soon' },
            { key: 'facebook', label: '👥 Facebook', status: 'coming soon' },
            { key: 'linkedin', label: '💼 LinkedIn', status: 'coming soon' },
          ].map(ch => (
            <div key={ch.key} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'var(--surface-2)',borderRadius:10,border:'1px solid var(--border)'}}>
              <div style={{fontWeight:500,fontSize:13}}>{ch.label}</div>
              <span className={ch.status==='connected'?'badge-active':'badge-paused'}>{ch.status}</span>
            </div>
          ))}
        </div>
        <div style={{marginTop:12,fontSize:12,color:'var(--text-3)',lineHeight:1.6}}>
          When Instagram/Facebook/LinkedIn are added, all contacts will be deduplicated in the same central database. Same person won't get reached from two different channels in the same window.
        </div>
      </div>

      {/* Global Pause */}
      <div className="card">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div className="section-label space-8">Global Pause</div>
            <div style={{fontSize:12,color:'var(--text-3)'}}>Pause ALL campaigns across all channels instantly</div>
          </div>
          <button className={config.globalPause ? 'btn-primary' : 'btn-ghost'} style={{background:config.globalPause?'var(--red)':undefined}}
            onClick={()=>setConfig(p=>p?{...p,globalPause:!p.globalPause}:p)}>
            {config.globalPause ? '⏸ Paused — Click to Resume' : '⏸ Pause All'}
          </button>
        </div>
      </div>
    </div></>
  )
}
