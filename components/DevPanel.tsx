'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

interface ChatMsg { role: 'user'|'assistant'; content: string; image?: string }
interface ToolCall { name: string; tool: string; status: 'running'|'done'|'error'; step?: number }

const CLAUDE_CHAT_URL = 'https://claude.ai/chat/d077d338-25af-4a74-b5ea-abfbf5bc5ab8'
const STORAGE_KEY = 'dev-panel-msgs-v2'

export default function DevPanel() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingImage, setPendingImage] = useState<{base64:string;name:string}|null>(null)
  const [dragging, setDragging] = useState(false)
  const [liveStatus, setLiveStatus] = useState('')
  const [stepCount, setStepCount] = useState(0)
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([])
  const [events, setEvents] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Persist history
  useEffect(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) setMsgs(JSON.parse(s)) } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-50))) } catch {}
  }, [msgs])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, toolCalls])

  function clearHistory() {
    setMsgs([]); setEvents([])
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }

  function readImageFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => setPendingImage({ base64: (reader.result as string).split(',')[1], name: file.name })
    reader.readAsDataURL(file)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) readImageFile(f); e.target.value = ''
  }

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!panelRef.current?.contains(e.relatedTarget as Node)) setDragging(false)
  }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'))
    if (f) readImageFile(f)
  }, [])

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!open) return
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'))
      if (item) { const f = item.getAsFile(); if (f) readImageFile(f) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [open])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg: ChatMsg = { role: 'user', content: input, image: pendingImage?.base64 }
    const newMsgs = [...msgs, userMsg]
    setMsgs(newMsgs); setInput(''); setPendingImage(null)
    setLoading(true); setLiveStatus('Connecting...'); setStepCount(0); setToolCalls([]); setEvents([])

    const apiMsgs = newMsgs.map(m => m.image
      ? { role: m.role, content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: m.image } }, { type: 'text', text: m.content }] }
      : { role: m.role, content: m.content }
    )

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMsgs, devMode: true, stream: true }),
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = ''
      const toolLog: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event: ')) { currentEvent = line.slice(7).trim(); continue }
          if (!line.startsWith('data: ')) continue
          try {
            const d = JSON.parse(line.slice(6))
            if (currentEvent === 'status') {
              setLiveStatus(d.text || '')
              if (d.step) setStepCount(d.step)
            }
            if (currentEvent === 'tool') {
              const label = `${d.tool}(${d.text})`
              toolLog.push(label); setEvents([...toolLog])
              setToolCalls(prev => [...prev, { name: label, tool: d.tool, status: 'running', step: d.step }])
              setLiveStatus(`${d.tool}: ${d.text}`)
              if (d.step) setStepCount(d.step)
            }
            if (currentEvent === 'tool_result') {
              setToolCalls(prev => prev.map((t, i) => i === prev.length - 1 ? { ...t, status: d.ok ? 'done' : 'error' } : t))
            }
            if (currentEvent === 'text') setLiveStatus('Writing response...')
            if (currentEvent === 'error') setMsgs(prev => [...prev, { role: 'assistant', content: `Error: ${d.text}` }])
            if (currentEvent === 'done') {
              if (d.reply) setMsgs(prev => [...prev, { role: 'assistant', content: d.reply }])
              setLiveStatus(''); setToolCalls([])
            }
          } catch {}
        }
      }
    } catch (e) {
      setMsgs(prev => [...prev, { role: 'assistant', content: `Request failed: ${e}` }])
    }
    setLoading(false); setLiveStatus('')
  }

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} title={msgs.length > 0 ? `Dev Agent (${msgs.length} msgs)` : 'Dev Agent'} style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 1000,
          width: 48, height: 48, borderRadius: '50%',
          background: msgs.length > 0 ? 'linear-gradient(135deg,#3a3aaa,#5B4FE9)' : 'linear-gradient(135deg,#5B4FE9,#7B6FF0)',
          border: msgs.length > 0 ? '2px solid #7B6FF0' : 'none',
          color: '#fff', fontSize: 18, cursor: 'pointer',
          boxShadow: '0 4px 24px rgba(91,79,233,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>⌨</button>
      )}

      {/* Side panel */}
      <div ref={panelRef} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: open ? 420 : 0, overflow: 'hidden',
          background: dragging ? '#0f0f38' : '#080818',
          borderLeft: dragging ? '2px solid #7B6FF0' : '1px solid #1a1a3e',
          zIndex: 999, transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex', flexDirection: 'column',
        }}>
        {open && (
          <>
            {dragging && (
              <div style={{ position:'absolute', inset:0, zIndex:10, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(91,79,233,0.15)', pointerEvents:'none' }}>
                <div style={{ textAlign:'center', color:'#a0a0ff', fontSize:14, fontWeight:600 }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>📎</div>
                  Drop screenshot here
                </div>
              </div>
            )}

            {/* Header */}
            <div style={{ padding:'16px 18px 12px', borderBottom:'1px solid #1a1a3e', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <div style={{ fontFamily:'var(--font-syne)', fontWeight:700, fontSize:14, color:'#a0a0ff' }}>
                  ⌨ Dev Agent
                  {msgs.length > 0 && <span style={{ fontSize:10, marginLeft:8, color:'#5555aa', fontWeight:400 }}>{msgs.length} msgs · saved</span>}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={clearHistory} style={{ background:'none', border:'1px solid #2a2a4e', borderRadius:6, color:'#5555aa', fontSize:10, padding:'3px 8px', cursor:'pointer' }}>Clear</button>
                  <button onClick={() => setOpen(false)} style={{ background:'#1a1a3e', border:'1px solid #3a3a6e', borderRadius:8, color:'#9999cc', fontSize:14, cursor:'pointer', width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                </div>
              </div>
              <a href={CLAUDE_CHAT_URL} target="_blank" rel="noopener noreferrer"
                style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:8, background:'#0f0f28', border:'1px solid #2a2a4e', color:'#5566bb', fontSize:11, textDecoration:'none', fontFamily:'var(--font-dm-mono)' }}>
                <span>✦ Open Claude chat (project knowledge)</span>
                <span style={{ marginLeft:'auto' }}>↗</span>
              </a>
            </div>

            {/* Messages */}
            <div style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>
              {msgs.length === 0 && (
                <div style={{ padding:24, textAlign:'center', color:'#4444aa', fontSize:12, lineHeight:1.7 }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>⌨</div>
                  <div style={{ color:'#7777bb', fontWeight:600, marginBottom:6 }}>Dev Agent</div>
                  Reads/writes GitHub files, commits, auto-deploys.
                  <div style={{ marginTop:8, fontSize:11, color:'#3333aa' }}>📎 Drop a screenshot or paste ⌘V</div>
                  <div style={{ marginTop:12, display:'flex', flexWrap:'wrap', gap:6, justifyContent:'center' }}>
                    {['Add a feature','Fix a bug','Show me the code','Change the styling'].map(s => (
                      <button key={s} onClick={() => setInput(s)} style={{ background:'#1a1a3e', border:'1px solid #2a2a4e', borderRadius:20, color:'#6677cc', fontSize:10, padding:'4px 10px', cursor:'pointer' }}>{s}</button>
                    ))}
                  </div>
                </div>
              )}

              {msgs.map((m, i) => (
                <div key={i} style={{ display:'flex', flexDirection:'column', alignItems: m.role==='user' ? 'flex-end' : 'flex-start' }}>
                  {m.image && <img src={`data:image/png;base64,${m.image}`} alt="uploaded" style={{ maxWidth:240, borderRadius:8, marginBottom:4, border:'1px solid #2a2a4e' }} />}
                  <div style={{
                    maxWidth:'90%', padding:'9px 13px',
                    borderRadius: m.role==='user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                    background: m.role==='user' ? 'linear-gradient(135deg,#3a3aaa,#5B4FE9)' : '#0f0f28',
                    color: m.role==='user' ? '#dde' : '#b0b0ee',
                    fontSize:12, lineHeight:1.6,
                    border: m.role==='assistant' ? '1px solid #1a1a3e' : 'none',
                    whiteSpace:'pre-wrap', wordBreak:'break-word',
                  }}>{m.content}</div>
                </div>
              ))}

              {/* Live progress while loading */}
              {loading && (
                <div style={{ background:'#06060f', border:'1px solid #1a1a3e', borderRadius:12, padding:'12px 14px', fontFamily:'var(--font-dm-mono)', fontSize:11 }}>
                  {/* Step counter */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, color:'#8899dd' }}>
                      <span style={{ width:7, height:7, borderRadius:'50%', background:'#5B4FE9', display:'inline-block', animation:'pulse 1s infinite' }}/>
                      <span style={{ fontWeight:600 }}>
                        {stepCount > 0 ? `Step ${stepCount} / ~12` : 'Starting...'}
                      </span>
                    </div>
                    <span style={{ color:'#3a3a6a', fontSize:10 }}>{toolCalls.length} tool{toolCalls.length !== 1 ? 's' : ''}</span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ background:'#0d0d20', borderRadius:3, height:4, marginBottom:8, overflow:'hidden' }}>
                    <div style={{
                      height:'100%', borderRadius:3,
                      background:'linear-gradient(90deg,#5B4FE9,#00D4FF)',
                      width: stepCount === 0 ? '5%' : `${Math.min(92, (stepCount / 12) * 100)}%`,
                      transition:'width 0.6s ease',
                    }}/>
                  </div>
                  {/* Current action */}
                  {liveStatus && (
                    <div style={{ color:'#6677cc', fontSize:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom: toolCalls.length > 0 ? 8 : 0 }}>
                      ▸ {liveStatus}
                    </div>
                  )}
                  {/* Tool call log */}
                  {toolCalls.length > 0 && (
                    <div style={{ borderTop:'1px solid #12122a', paddingTop:7, display:'flex', flexDirection:'column', gap:2, maxHeight:120, overflowY:'auto' }}>
                      {toolCalls.map((t, i) => (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:6, fontSize:10 }}>
                          <span style={{ flexShrink:0, fontSize:9, color: t.status==='running' ? '#7788cc' : t.status==='error' ? '#FF4757' : '#3a6a3a' }}>
                            {t.status==='running' ? '⟳' : t.status==='error' ? '✗' : '✓'}
                          </span>
                          <span style={{
                            color: t.status==='running' ? '#8899ee' : t.status==='error' ? '#FF4757' : '#3a4a6a',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1,
                            fontWeight: t.status==='running' ? 600 : 400,
                          }}>{t.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input area */}
            <div style={{ padding:'12px 14px', borderTop:'1px solid #1a1a3e', flexShrink:0 }}>
              {pendingImage && (
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, padding:'6px 10px', background:'#0f0f28', borderRadius:8, border:'1px solid #2a2a4e' }}>
                  <img src={`data:image/png;base64,${pendingImage.base64}`} alt="preview" style={{ width:32, height:32, objectFit:'cover', borderRadius:4 }} />
                  <span style={{ fontSize:11, color:'#6677cc', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>📎 {pendingImage.name}</span>
                  <button onClick={() => setPendingImage(null)} style={{ background:'none', border:'none', color:'#5555aa', cursor:'pointer', fontSize:13 }}>✕</button>
                </div>
              )}
              <div style={{ fontSize:10, color:'#2a2a5e', textAlign:'center', marginBottom:6 }}>Drop screenshot · paste ⌘V · or click 📎</div>
              <div style={{ display:'flex', gap:6, alignItems:'flex-end' }}>
                <button onClick={() => fileRef.current?.click()} title="Upload file" style={{ flexShrink:0, width:32, height:32, background:'#0f0f28', border:'1px solid #2a2a4e', borderRadius:8, color:'#5566bb', fontSize:15, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>📎</button>
                <textarea value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder="Describe what to build or fix... (Enter to send)"
                  style={{ flex:1, minHeight:36, maxHeight:120, resize:'none', background:'#0f0f28', border:'1px solid #2a2a4e', borderRadius:10, color:'#a0a0ee', fontSize:12, padding:'8px 10px', fontFamily:'var(--font-dm-sans)', lineHeight:1.5, outline:'none' }}
                  rows={2}
                />
                <button onClick={send} disabled={loading || !input.trim()} style={{
                  flexShrink:0, width:32, height:32,
                  background: loading || !input.trim() ? '#1a1a3e' : 'linear-gradient(135deg,#5B4FE9,#7B6FF0)',
                  border:'none', borderRadius:8, color:'#fff', fontSize:14,
                  cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>↑</button>
              </div>
              <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display:'none' }} onChange={handleFile} />
            </div>
          </>
        )}
      </div>
    </>
  )
}
