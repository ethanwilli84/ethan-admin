'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Terminal, X, Paperclip, ArrowUp, ExternalLink } from 'lucide-react'

interface ChatMsg { role: 'user'|'assistant'; content: string; image?: string }
interface ToolCall { name: string; tool: string; status: 'running'|'done'|'error'; step?: number }

const CLAUDE_CHAT_URL = 'https://claude.ai/chat/d077d338-25af-4a74-b5ea-abfbf5bc5ab8'
const STORAGE_KEY = 'dev-panel-msgs-v2'

// ─── Monochrome palette for the dev console.
// Dark theme is kept because it reads as a "terminal/agent" surface,
// but all purple/cyan has been swapped for neutral charcoal tones.
const C = {
  bg:       '#0e0e0e',
  bgHover:  '#141414',
  panel:    '#171717',
  panelAlt: '#1c1c1c',
  border:   '#262626',
  borderHi: '#353535',
  text:     '#e4e4e4',
  textDim:  '#9a9a9a',
  textMore: '#6a6a6a',
  textFaint:'#4a4a4a',
  accent:   '#ffffff',
  success:  '#16a34a',
  error:    '#dc2626',
}

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
      {/* Floating button to open the console */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title={msgs.length > 0 ? `Dev Agent (${msgs.length} msgs)` : 'Dev Agent'}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
            width: 44, height: 44, borderRadius: '50%',
            background: C.accent,
            color: '#000',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25), 0 6px 24px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(0,0,0,0.08)',
          }}
        >
          <Terminal size={18} strokeWidth={2} />
        </button>
      )}

      {/* Side panel */}
      <div
        ref={panelRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: open ? 420 : 0, overflow: 'hidden',
          background: dragging ? C.panel : C.bg,
          borderLeft: dragging ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
          zIndex: 999, transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {open && (
          <>
            {dragging && (
              <div style={{ position:'absolute', inset:0, zIndex:10, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,0.04)', pointerEvents:'none' }}>
                <div style={{ textAlign:'center', color:C.text, fontSize:13, fontWeight:500 }}>
                  <Paperclip size={28} style={{ marginBottom:8, opacity:0.6 }} />
                  <div>Drop screenshot here</div>
                </div>
              </div>
            )}

            {/* Header */}
            <div style={{ padding:'14px 16px 12px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, color:C.text, fontSize:13, fontWeight:500 }}>
                  <Terminal size={14} strokeWidth={2} />
                  <span>Dev Agent</span>
                  {msgs.length > 0 && (
                    <span style={{ fontSize:10, marginLeft:4, color:C.textMore, fontWeight:400 }}>
                      {msgs.length} msgs
                    </span>
                  )}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button
                    onClick={clearHistory}
                    style={{ border:`1px solid ${C.border}`, borderRadius:4, color:C.textMore, fontSize:10, padding:'3px 8px', cursor:'pointer' }}
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:6, color:C.textDim, cursor:'pointer', width:26, height:26, display:'flex', alignItems:'center', justifyContent:'center' }}
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
              </div>
              <a
                href={CLAUDE_CHAT_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:6, background:C.panel, border:`1px solid ${C.border}`, color:C.textDim, fontSize:11, textDecoration:'none', fontFamily:'var(--font-mono)' }}
              >
                <span>Open Claude chat (project knowledge)</span>
                <ExternalLink size={11} style={{ marginLeft:'auto' }} />
              </a>
            </div>

            {/* Messages */}
            <div style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>
              {msgs.length === 0 && (
                <div style={{ padding:24, textAlign:'center', color:C.textMore, fontSize:12, lineHeight:1.7 }}>
                  <Terminal size={24} strokeWidth={1.5} style={{ margin:'0 auto 10px', color:C.textDim }} />
                  <div style={{ color:C.text, fontWeight:500, marginBottom:6 }}>Dev Agent</div>
                  Reads/writes GitHub files, commits, auto-deploys.
                  <div style={{ marginTop:10, fontSize:11, color:C.textFaint }}>Drop a screenshot or paste ⌘V</div>
                  <div style={{ marginTop:12, display:'flex', flexWrap:'wrap', gap:6, justifyContent:'center' }}>
                    {['Add a feature','Fix a bug','Show me the code','Change the styling'].map(s => (
                      <button
                        key={s}
                        onClick={() => setInput(s)}
                        style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:16, color:C.textDim, fontSize:11, padding:'4px 10px', cursor:'pointer' }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {msgs.map((m, i) => (
                <div key={i} style={{ display:'flex', flexDirection:'column', alignItems: m.role==='user' ? 'flex-end' : 'flex-start' }}>
                  {m.image && (
                    <img
                      src={`data:image/png;base64,${m.image}`}
                      alt="uploaded"
                      style={{ maxWidth:240, borderRadius:6, marginBottom:4, border:`1px solid ${C.border}` }}
                    />
                  )}
                  <div style={{
                    maxWidth:'90%',
                    padding:'9px 13px',
                    borderRadius: m.role==='user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                    background: m.role==='user' ? C.accent : C.panel,
                    color: m.role==='user' ? '#000' : C.text,
                    fontSize:12, lineHeight:1.6,
                    border: m.role==='assistant' ? `1px solid ${C.border}` : 'none',
                    whiteSpace:'pre-wrap', wordBreak:'break-word',
                  }}>
                    {m.content}
                  </div>
                </div>
              ))}

              {/* Live progress while loading */}
              {loading && (
                <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:8, padding:'12px 14px', fontFamily:'var(--font-mono)', fontSize:11 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, color:C.text }}>
                      <span style={{ width:6, height:6, borderRadius:'50%', background:C.accent, display:'inline-block', animation:'shimmer 1s infinite' }}/>
                      <span style={{ fontWeight:500 }}>
                        {stepCount > 0 ? `Step ${stepCount} / ~12` : 'Starting...'}
                      </span>
                    </div>
                    <span style={{ color:C.textFaint, fontSize:10 }}>{toolCalls.length} tool{toolCalls.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ background:C.bg, borderRadius:2, height:3, marginBottom:8, overflow:'hidden' }}>
                    <div style={{
                      height:'100%',
                      borderRadius:2,
                      background: C.accent,
                      width: stepCount === 0 ? '5%' : `${Math.min(92, (stepCount / 12) * 100)}%`,
                      transition:'width 0.6s ease',
                    }}/>
                  </div>
                  {liveStatus && (
                    <div style={{ color:C.textDim, fontSize:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom: toolCalls.length > 0 ? 8 : 0 }}>
                      ▸ {liveStatus}
                    </div>
                  )}
                  {toolCalls.length > 0 && (
                    <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:7, display:'flex', flexDirection:'column', gap:2, maxHeight:120, overflowY:'auto' }}>
                      {toolCalls.map((t, i) => (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:6, fontSize:10 }}>
                          <span style={{ flexShrink:0, fontSize:9, color: t.status==='running' ? C.textDim : t.status==='error' ? C.error : C.success }}>
                            {t.status==='running' ? '⟳' : t.status==='error' ? '✗' : '✓'}
                          </span>
                          <span style={{
                            color: t.status==='running' ? C.text : t.status==='error' ? C.error : C.textMore,
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1,
                            fontWeight: t.status==='running' ? 500 : 400,
                          }}>
                            {t.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input area */}
            <div style={{ padding:'12px 14px', borderTop:`1px solid ${C.border}`, flexShrink:0 }}>
              {pendingImage && (
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, padding:'6px 10px', background:C.panel, borderRadius:6, border:`1px solid ${C.border}` }}>
                  <img
                    src={`data:image/png;base64,${pendingImage.base64}`}
                    alt="preview"
                    style={{ width:32, height:32, objectFit:'cover', borderRadius:4 }}
                  />
                  <span style={{ fontSize:11, color:C.textDim, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {pendingImage.name}
                  </span>
                  <button
                    onClick={() => setPendingImage(null)}
                    style={{ color:C.textMore, cursor:'pointer', display:'flex' }}
                    aria-label="Remove attachment"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              <div style={{ fontSize:10, color:C.textFaint, textAlign:'center', marginBottom:6 }}>
                Drop screenshot · paste ⌘V · or click the attach icon
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'flex-end' }}>
                <button
                  onClick={() => fileRef.current?.click()}
                  title="Upload file"
                  style={{ flexShrink:0, width:30, height:30, background:C.panel, border:`1px solid ${C.border}`, borderRadius:6, color:C.textDim, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
                >
                  <Paperclip size={14} strokeWidth={2} />
                </button>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder="Describe what to build or fix... (Enter to send)"
                  style={{
                    flex:1, minHeight:34, maxHeight:120, resize:'none',
                    background:C.panel, border:`1px solid ${C.border}`, borderRadius:8,
                    color:C.text, fontSize:12, padding:'7px 10px',
                    fontFamily:'var(--font-sans)', lineHeight:1.5, outline:'none',
                  }}
                  rows={2}
                />
                <button
                  onClick={send}
                  disabled={loading || !input.trim()}
                  style={{
                    flexShrink:0, width:30, height:30,
                    background: loading || !input.trim() ? C.panel : C.accent,
                    color: loading || !input.trim() ? C.textFaint : '#000',
                    border: loading || !input.trim() ? `1px solid ${C.border}` : 'none',
                    borderRadius:6,
                    cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}
                >
                  <ArrowUp size={14} strokeWidth={2.25} />
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display:'none' }} onChange={handleFile} />
            </div>
          </>
        )}
      </div>
    </>
  )
}
