'use client'
import { useState, useRef, useEffect } from 'react'

interface ChatMsg { role: 'user'|'assistant'; content: string; image?: string }

// This Claude chat URL — copy from your browser when the dev panel bugs out
const CLAUDE_CHAT_URL = 'https://claude.ai/chat/d077d338-25af-4a74-b5ea-abfbf5bc5ab8'

export default function DevPanel() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [events, setEvents] = useState<string[]>([])
  const [pendingImage, setPendingImage] = useState<{base64: string; name: string}|null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({behavior:'smooth'}) }, [msgs])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setPendingImage({ base64, name: file.name })
    }
    reader.readAsDataURL(file)
  }

  async function send() {
    if (!input.trim() || loading) return
    const userMsg: ChatMsg = { role: 'user', content: input, image: pendingImage?.base64 }
    const newMsgs = [...msgs, userMsg]
    setMsgs(newMsgs); setInput(''); setPendingImage(null); setLoading(true); setEvents([])

    // Build messages array for API, include image if present
    const apiMsgs = newMsgs.map(m => {
      if (m.image) {
        return {
          role: m.role,
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: m.image } },
            { type: 'text', text: m.content }
          ]
        }
      }
      return { role: m.role, content: m.content }
    })

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: apiMsgs, devMode: true })
    })
    const d = await res.json()
    setMsgs(prev => [...prev, { role: 'assistant', content: d.reply || d.error || 'Error' }])
    if (d.events?.length) setEvents(d.events)
    setLoading(false)
  }

  const panelW = 420

  return (
    <>
      {/* Toggle button — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 1000,
          width: 52, height: 52, borderRadius: '50%',
          background: open ? '#1a1a3e' : 'linear-gradient(135deg,#5B4FE9,#7B6FF0)',
          border: open ? '2px solid #5B4FE9' : 'none',
          color: '#fff', fontSize: 20, cursor: 'pointer',
          boxShadow: '0 4px 24px rgba(91,79,233,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s',
        }}
        title="Dev Agent"
      >
        {open ? '✕' : '⌨'}
      </button>

      {/* Side panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: open ? panelW : 0,
        overflow: 'hidden',
        background: '#080818',
        borderLeft: '1px solid #1a1a3e',
        zIndex: 999,
        transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>
        {open && (
          <>
            {/* Header */}
            <div style={{
              padding: '16px 18px 12px',
              borderBottom: '1px solid #1a1a3e',
              flexShrink: 0,
            }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8 }}>
                <div style={{ fontFamily:'var(--font-syne)', fontWeight:700, fontSize:14, color:'#a0a0ff' }}>⌨ Dev Agent</div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => setMsgs([])} style={{ background:'none', border:'1px solid #2a2a4e', borderRadius:6, color:'#5555aa', fontSize:10, padding:'3px 8px', cursor:'pointer' }}>Clear</button>
                  <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', color:'#5555aa', fontSize:16, cursor:'pointer', lineHeight:1 }}>✕</button>
                </div>
              </div>
              {/* Link to this Claude chat */}
              <a
                href={CLAUDE_CHAT_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems:'center', gap:6,
                  padding:'6px 10px', borderRadius:8,
                  background:'#0f0f28', border:'1px solid #2a2a4e',
                  color:'#5566bb', fontSize:11,
                  textDecoration:'none', fontFamily:'var(--font-dm-mono)',
                }}
              >
                <span>✦ Open Claude chat (project knowledge)</span>
                <span style={{marginLeft:'auto'}}>↗</span>
              </a>
            </div>

            {/* Messages */}
            <div style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>
              {msgs.length === 0 && (
                <div style={{ padding:24, textAlign:'center', color:'#4444aa', fontSize:12, lineHeight:1.7 }}>
                  <div style={{fontSize:28,marginBottom:8}}>⌨</div>
                  <div style={{color:'#7777bb',fontWeight:600,marginBottom:6}}>Dev Agent</div>
                  Reads/writes GitHub files, commits to main, auto-deploys.
                  <div style={{marginTop:12,display:'flex',flexWrap:'wrap',gap:6,justifyContent:'center'}}>
                    {['Add a feature','Fix a bug','Show me the homepage code','Change the color scheme'].map(s => (
                      <button key={s} onClick={() => setInput(s)} style={{
                        background:'#1a1a3e',border:'1px solid #2a2a4e',borderRadius:20,
                        color:'#6677cc',fontSize:10,padding:'4px 10px',cursor:'pointer'
                      }}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} style={{ display:'flex', flexDirection:'column', alignItems: m.role==='user'?'flex-end':'flex-start' }}>
                  {m.image && (
                    <img src={`data:image/png;base64,${m.image}`} alt="uploaded"
                      style={{ maxWidth:240, borderRadius:8, marginBottom:4, border:'1px solid #2a2a4e' }} />
                  )}
                  <div style={{
                    maxWidth:'90%', padding:'9px 13px',
                    borderRadius: m.role==='user'?'14px 14px 3px 14px':'14px 14px 14px 3px',
                    background: m.role==='user'?'linear-gradient(135deg,#3a3aaa,#5B4FE9)':'#0f0f28',
                    color: m.role==='user'?'#dde':'#b0b0ee',
                    fontSize:12, lineHeight:1.6,
                    border: m.role==='assistant'?'1px solid #1a1a3e':'none',
                    whiteSpace:'pre-wrap', wordBreak:'break-word',
                  }}>
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display:'flex' }}>
                  <div style={{ padding:'9px 13px', background:'#0f0f28', border:'1px solid #1a1a3e', borderRadius:'14px 14px 14px 3px', fontSize:12, color:'#4444aa' }}>
                    ◌ working...
                  </div>
                </div>
              )}
              {events.length > 0 && (
                <div style={{ padding:'8px 12px', background:'#050510', border:'1px solid #1a1a3e', borderRadius:8 }}>
                  <div style={{ fontFamily:'var(--font-dm-mono)', fontSize:9, color:'#3333aa', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>Tool Calls</div>
                  {events.map((e, i) => (
                    <div key={i} style={{ fontFamily:'var(--font-dm-mono)', fontSize:10, color:'#5566bb', padding:'2px 0', borderBottom:'1px solid #0f0f28', wordBreak:'break-all' }}>{e}</div>
                  ))}
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div style={{ padding:'12px 14px', borderTop:'1px solid #1a1a3e', flexShrink:0 }}>
              {pendingImage && (
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, padding:'6px 10px', background:'#0f0f28', borderRadius:8, border:'1px solid #2a2a4e' }}>
                  <span style={{ fontSize:11, color:'#6677cc' }}>📎 {pendingImage.name}</span>
                  <button onClick={() => setPendingImage(null)} style={{ marginLeft:'auto', background:'none', border:'none', color:'#5555aa', cursor:'pointer', fontSize:13 }}>✕</button>
                </div>
              )}
              <div style={{ display:'flex', gap:6, alignItems:'flex-end' }}>
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{ flexShrink:0, width:32, height:32, background:'#0f0f28', border:'1px solid #2a2a4e', borderRadius:8, color:'#5566bb', fontSize:15, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
                  title="Upload screenshot or file"
                >📎</button>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder="Describe what to build or fix... (Enter to send, Shift+Enter for newline)"
                  style={{
                    flex:1, minHeight:36, maxHeight:120, resize:'none',
                    background:'#0f0f28', border:'1px solid #2a2a4e', borderRadius:10,
                    color:'#a0a0ee', fontSize:12, padding:'8px 10px',
                    fontFamily:'var(--font-dm-sans)', lineHeight:1.5, outline:'none',
                  }}
                  rows={2}
                />
                <button
                  onClick={send}
                  disabled={loading || !input.trim()}
                  style={{
                    flexShrink:0, width:32, height:32,
                    background: loading||!input.trim() ? '#1a1a3e' : 'linear-gradient(135deg,#5B4FE9,#7B6FF0)',
                    border:'none', borderRadius:8, color:'#fff', fontSize:14,
                    cursor: loading||!input.trim() ? 'not-allowed' : 'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}
                >↑</button>
              </div>
              <input ref={fileRef} type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={handleFile} />
            </div>
          </>
        )}
      </div>
    </>
  )
}
