'use client'
import { useState } from 'react'
import Link from 'next/link'

const BADGE = (label: string, color = 'var(--accent)') => (
  <span style={{ fontSize:10, background:`${color}22`, color, border:`1px solid ${color}44`, borderRadius:20, padding:'2px 8px', fontFamily:'var(--font-dm-mono)', marginLeft:8 }}>{label}</span>
)

const CHANNELS = [
  { id:'imessage', label:'iMessage', icon:'💬', color:'#34C759', connected:true, description:'Reads Mac Messages DB every 30 min via LaunchAgent' },
  { id:'slack', label:'Slack', icon:'#', color:'#4A154B', connected:true, description:'All #alpine-* channels synced every 30 min' },
  { id:'email_sire', label:'Email (Sire)', icon:'📧', color:'var(--accent)', connected:true, description:'ethan@sireapp.io via IMAP' },
  { id:'whatsapp', label:'WhatsApp', icon:'📱', color:'#25D366', connected:false, description:'Needs WhatsApp desktop DB access — planned' },
  { id:'google_voice', label:'Google Voice', icon:'📞', color:'#4285F4', connected:false, description:'Takeout import available. Real-time: planned' },
]

const MOCK_THREADS = [
  { channel:'imessage', contact:'+18044265663', preview:'We have had so many people where it keeps glitching and have them login to their bank...', time:'Today 6:53 PM', unread:1, hasIssue:true },
  { channel:'slack', contact:'#alpine-salesmafia', preview:'hey Ethan my customer is saying their payment isnt going through again', time:'Today 4:20 PM', unread:3, hasIssue:true },
  { channel:'imessage', contact:'+15183345348', preview:'Hey! Does Sire still work with USPS?', time:'Today 6:08 PM', unread:0, hasIssue:false },
  { channel:'email_sire', contact:'support@crossriverfund.com', preview:'Re: Funding Inquiry — Thanks for reaching out...', time:'Yesterday', unread:0, hasIssue:false },
  { channel:'whatsapp', contact:'Amine (Alpine)', preview:'yo did you see the checkout bug?', time:'2 days ago', unread:2, hasIssue:true },
]

const CHAN_ICON: Record<string,string> = { imessage:'💬', slack:'#', email_sire:'📧', whatsapp:'📱', google_voice:'📞' }
const CHAN_COLOR: Record<string,string> = { imessage:'#34C759', slack:'#4A154B', email_sire:'var(--accent)', whatsapp:'#25D366', google_voice:'#4285F4' }

export default function ConversationsPage() {
  const [activeChannel, setActiveChannel] = useState('all')

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'28px 24px' }}>
      <div style={{ marginBottom:24 }}>
        <Link href="/" style={{ color:'var(--text-3)', fontSize:13, textDecoration:'none' }}>← Admin</Link>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:4 }}>
          <div style={{ fontFamily:'var(--font-syne)', fontWeight:700, fontSize:22 }}>Conversations</div>
          {BADGE('PARTIAL','#f59e0b')}
        </div>
        <div style={{ fontSize:13, color:'var(--text-3)', marginTop:4 }}>Unified inbox across all channels. iMessage + Slack working. WhatsApp + Google Voice full threads coming.</div>
      </div>

      {/* Channel status */}
      <div className="card" style={{ marginBottom:20 }}>
        <div className="section-label" style={{ marginBottom:12 }}>Channel Status</div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {CHANNELS.map(ch => (
            <div key={ch.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:10, background:'var(--surface-2)', border:`1px solid ${ch.connected ? ch.color + '44' : 'var(--border)'}` }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:ch.connected ? ch.color : '#555', display:'inline-block', flexShrink:0 }}/>
              <div>
                <div style={{ fontSize:12, fontWeight:600 }}>{ch.icon} {ch.label}</div>
                <div style={{ fontSize:10, color:'var(--text-3)' }}>{ch.connected ? '✓ Connected' : '○ Not connected'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:16 }}>
        {/* Thread list */}
        <div>
          <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
            {['all','imessage','slack','email_sire'].map(ch => (
              <button key={ch} className={activeChannel===ch?'chip active':'chip'} style={{ fontSize:10 }} onClick={()=>setActiveChannel(ch)}>
                {CHAN_ICON[ch] || '◈'} {ch === 'all' ? 'All' : ch}
              </button>
            ))}
          </div>
          {MOCK_THREADS.filter(t => activeChannel === 'all' || t.channel === activeChannel).map((t,i) => (
            <div key={i} style={{ padding:'10px 12px', borderRadius:10, marginBottom:6, background:'var(--surface)', border:`1px solid ${t.hasIssue ? 'rgba(255,71,87,0.2)' : 'var(--border)'}`, cursor:'pointer' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                <span style={{ fontSize:11, color:CHAN_COLOR[t.channel] }}>{CHAN_ICON[t.channel]}</span>
                <span style={{ fontWeight:600, fontSize:12, flex:1 }}>{t.contact}</span>
                {t.unread > 0 && <span style={{ fontSize:10, background:'var(--accent)', color:'#fff', borderRadius:10, padding:'1px 6px' }}>{t.unread}</span>}
                {t.hasIssue && <span style={{ fontSize:9, color:'var(--red)' }}>⚠</span>}
              </div>
              <div style={{ fontSize:11, color:'var(--text-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.preview}</div>
              <div style={{ fontSize:10, color:'var(--text-3)', marginTop:4 }}>{t.time}</div>
            </div>
          ))}
        </div>

        {/* Thread detail — placeholder */}
        <div className="card" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:400 }}>
          <div style={{ textAlign:'center', color:'var(--text-3)' }}>
            <div style={{ fontSize:32, marginBottom:8 }}></div>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>Thread Viewer</div>
            <div style={{ fontSize:12 }}>TODO: Show full conversation with both sides,<br/>AI summary, linked issues, quick reply</div>
            {BADGE('TODO — needs WhatsApp + GV full thread access')}
          </div>
        </div>
      </div>
    </div>
  )
}
