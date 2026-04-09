export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!

async function analyzeYouTube(url: string) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  const videoId = match?.[1]
  if (!videoId) throw new Error('Invalid YouTube URL')

  const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
  const oembed = oembedRes.ok ? await oembedRes.json() : {}
  const title = oembed.title || ''
  const author = oembed.author_name || ''

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200,
      messages: [{ role: 'user', content: `Write a 1-2 sentence description for this YouTube video.\nTitle: "${title}"\nChannel: "${author}"\nReturn only the description, no quotes.` }]
    })
  })
  const aiData = await aiRes.json()
  const description = aiData.content?.[0]?.text?.trim() || `YouTube video by ${author}`
  const tags = title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ')
    .filter((w: string) => w.length > 3 && !['with','this','that','from','your','have','what','when','where'].includes(w)).slice(0, 5)

  return { title, description, videoId, embedUrl: `https://www.youtube.com/embed/${videoId}`,
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, tags, author }
}

async function analyzeGoogleDoc(url: string) {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  const docId = match?.[1]
  if (!docId) throw new Error('Invalid Google Doc URL')
  const embedUrl = `https://docs.google.com/document/d/${docId}/preview`
  let title = 'Google Document', description = '', tags = ['document']

  try {
    const exportRes = await fetch(`https://docs.google.com/document/d/${docId}/export?format=txt`,
      { headers: { 'User-Agent': 'EthanAdmin/1.0' }, signal: AbortSignal.timeout(8000) })
    if (exportRes.ok) {
      const text = await exportRes.text()
      title = text.split('\n').find((l: string) => l.trim().length > 3)?.substring(0, 80) || 'Google Document'
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200,
          messages: [{ role: 'user', content: `Summarize this document in 1-2 sentences. Return only summary.\n\n${text.substring(0, 1000)}` }]
        })
      })
      const aiData = await aiRes.json()
      description = aiData.content?.[0]?.text?.trim() || ''
      tags = ['writing', 'document']
    }
  } catch {}
  return { title, description, docId, embedUrl, tags }
}

async function analyzeLink(url: string) {
  let title = url, description = '', tags: string[] = []
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) })
    const html = await res.text()
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    title = titleMatch?.[1]?.trim() || url
    const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i) ||
                      html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)
    const metaDesc = descMatch?.[1]?.trim() || ''
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 150,
        messages: [{ role: 'user', content: `1-2 sentence description for this link. Return only description.\nTitle: ${title}\nURL: ${url}\nMeta: ${metaDesc}` }]
      })
    })
    const aiData = await aiRes.json()
    description = aiData.content?.[0]?.text?.trim() || metaDesc
    tags = title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w: string) => w.length > 4).slice(0, 4)
  } catch {}
  return { title, description, tags }
}

export async function POST(req: NextRequest) {
  const { type, url } = await req.json()
  try {
    if (type === 'youtube') return NextResponse.json({ ok: true, ...(await analyzeYouTube(url)) })
    if (type === 'gdoc') return NextResponse.json({ ok: true, ...(await analyzeGoogleDoc(url)) })
    if (type === 'link') return NextResponse.json({ ok: true, ...(await analyzeLink(url)) })
    return NextResponse.json({ ok: false, error: 'Unknown type' })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message })
  }
}
