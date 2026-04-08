export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function GET() {
  const db = await getDb()
  const items = await db.collection('content_items').find({}).sort({ createdAt: -1 }).toArray()
  return NextResponse.json({ ok: true, items })
}

export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json()
  const { type, title, url, description, tags, fileData, fileName, fileType } = body

  const item: Record<string, unknown> = {
    type,       // 'youtube' | 'gdoc' | 'file' | 'link'
    title: title || '',
    url: url || '',
    description: description || '',
    tags: tags || [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  // YouTube — extract video ID for embed
  if (type === 'youtube' && url) {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
    item.videoId = match?.[1] || null
    item.embedUrl = item.videoId ? `https://www.youtube.com/embed/${item.videoId}` : null
    item.thumbnailUrl = item.videoId ? `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg` : null
  }

  // Google Doc — extract doc ID
  if (type === 'gdoc' && url) {
    const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
    item.docId = match?.[1] || null
    item.embedUrl = item.docId ? `https://docs.google.com/document/d/${item.docId}/preview` : null
  }

  // File upload — base64 stored in DB (for small files <5MB)
  if (type === 'file' && fileData) {
    item.fileData = fileData
    item.fileName = fileName
    item.fileType = fileType
  }

  const result = await db.collection('content_items').insertOne(item)
  return NextResponse.json({ ok: true, id: result.insertedId })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const db = await getDb()
  const { ObjectId } = await import('mongodb')
  await db.collection('content_items').deleteOne({ _id: new ObjectId(id) })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  const db = await getDb()
  const { ObjectId } = await import('mongodb')
  await db.collection('content_items').updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...updates, updatedAt: new Date() } }
  )
  return NextResponse.json({ ok: true })
}
