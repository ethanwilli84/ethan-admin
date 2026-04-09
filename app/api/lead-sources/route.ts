export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

// Lead source ingestion — pulls from external APIs and populates lead_pool

async function ingestPodcasts(queries: string[], targetCampaigns: string[]): Promise<number> {
  const db = await getDb()
  let total = 0

  for (const query of queries) {
    // iTunes Search API — free, no key, reliable
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=podcast&limit=100&entity=podcast`,
        { headers: { 'User-Agent': 'EthanAdmin/1.0' } }
      )
      const d = await res.json() as { results?: Record<string, unknown>[] }

      for (const podcast of (d.results || [])) {
        const feedUrl = podcast.feedUrl as string
        const name = podcast.collectionName as string || podcast.trackName as string
        const website = podcast.artistViewUrl as string || ''

        // Try to extract contact email from RSS feed
        let email: string | null = null
        let contactWebsite = website
        if (feedUrl) {
          try {
            const feedRes = await fetch(feedUrl, {
              headers: { 'User-Agent': 'EthanAdmin/1.0' },
              signal: AbortSignal.timeout(5000)
            })
            const xml = await feedRes.text()
            // Extract email from itunes:email or managingEditor
            const emailMatch = xml.match(/<itunes:email>([^<]+)<\/itunes:email>/) ||
                               xml.match(/<managingEditor>([^<]+)<\/managingEditor>/)
            if (emailMatch) email = emailMatch[1].trim()

            // Extract website
            const linkMatch = xml.match(/<link>([^<]+)<\/link>/)
            if (linkMatch) contactWebsite = linkMatch[1].trim()
          } catch {}
        }

        const existing = await db.collection('lead_pool').findOne({ name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } })
        if (existing) {
          await db.collection('lead_pool').updateOne(
            { _id: existing._id },
            { $addToSet: { campaigns: { $each: targetCampaigns } } }
          )
          continue
        }

        await db.collection('lead_pool').insertOne({
          name,
          website: contactWebsite,
          feedUrl,
          email,
          category: 'podcast',
          description: `Podcast: ${podcast.primaryGenreName || ''}. Episodes: ${podcast.trackCount || '?'}`,
          source: 'itunes',
          campaigns: targetCampaigns,
          status: 'pending',
          score: email ? 80 : 50,  // Higher score if we have email
          metadata: { itunesId: podcast.collectionId, genre: podcast.primaryGenreName },
          createdAt: new Date(), updatedAt: new Date()
        })
        total++
      }
    } catch (e) { console.error('iTunes ingest error:', e) }
  }
  return total
}

async function ingestFDICBanks(filters: Record<string, string>, targetCampaigns: string[]): Promise<number> {
  const db = await getDb()
  let total = 0
  let offset = 0
  const limit = 100

  // Build FDIC query string
  const filterParts = Object.entries(filters).map(([k, v]) => `${k}:${v}`)
  const filterStr = filterParts.join(' AND ')

  while (true) {
    try {
      const url = `https://banks.data.fdic.gov/api/institutions?filters=${encodeURIComponent(`ACTIVE:1 ${filterStr ? 'AND ' + filterStr : ''}`)}&fields=NAME,CITY,STALP,WEBADDR,ASSET,SPECGRP,NAMEHCR&limit=${limit}&offset=${offset}&sort_by=ASSET&sort_order=ASC&output=json`
      const res = await fetch(url)
      const d = await res.json() as { data?: Array<{ data: Record<string, unknown> }>; meta?: { total: number } }

      const banks = d.data || []
      if (banks.length === 0) break

      for (const b of banks) {
        const info = b.data
        const name = info.NAME as string
        const website = (info.WEBADDR as string || '').split(';')[0].trim()
        const assetsMM = Math.round((info.ASSET as number) / 1000)

        if (!name) continue

        const existing = await db.collection('lead_pool').findOne({ name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } })
        if (existing) {
          await db.collection('lead_pool').updateOne({ _id: existing._id }, { $addToSet: { campaigns: { $each: targetCampaigns } } })
          continue
        }

        await db.collection('lead_pool').insertOne({
          name,
          website: website ? (website.startsWith('http') ? website : `https://${website}`) : null,
          category: 'community_bank',
          description: `${name} — ${info.CITY}, ${info.STALP}. Assets: $${assetsMM}M. Holding co: ${info.NAMEHCR || 'independent'}`,
          location: `${info.CITY}, ${info.STALP}`,
          source: 'fdic',
          campaigns: targetCampaigns,
          status: 'pending',
          score: 60,
          metadata: { assetsMM, state: info.STALP, specgrp: info.SPECGRP },
          createdAt: new Date(), updatedAt: new Date()
        })
        total++
      }

      if (banks.length < limit) break
      offset += limit
      if (offset > 5000) break  // safety cap
    } catch (e) { console.error('FDIC ingest error:', e); break }
  }
  return total
}

async function ingestCSV(csvContent: string, source: string, targetCampaigns: string[], mapping: Record<string, string>): Promise<number> {
  const db = await getDb()
  let total = 0

  const lines = csvContent.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return 0

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase())

  for (const line of lines.slice(1)) {
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] || '' })

    // Apply column mapping
    const name = row[mapping.name || 'name'] || row['company'] || row['podcast'] || ''
    const email = row[mapping.email || 'email'] || ''
    const website = row[mapping.website || 'website'] || row['url'] || row['domain'] || ''
    const category = row[mapping.category || 'category'] || row['type'] || 'unknown'
    const description = row[mapping.description || 'description'] || row['bio'] || ''

    if (!name) continue

    const existing = await db.collection('lead_pool').findOne({ name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } })
    if (existing) continue

    await db.collection('lead_pool').insertOne({
      name, email: email || null, website: website || null,
      category, description, source,
      campaigns: targetCampaigns,
      status: 'pending',
      score: email ? 75 : 50,
      metadata: row,
      createdAt: new Date(), updatedAt: new Date()
    })
    total++
  }
  return total
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { sourceType, campaigns: targetCampaigns = [], ...params } = body

  let count = 0
  let error = null

  try {
    if (sourceType === 'itunes_podcasts') {
      const queries = params.queries || [
        'entrepreneurship startup founder',
        'fintech business young entrepreneur',
        'gen z entrepreneur sneaker business',
        'startup founder interview venture',
        'small business owner hustle',
      ]
      count = await ingestPodcasts(queries, targetCampaigns)
    }

    else if (sourceType === 'fdic_banks') {
      // Filter options: state, asset range, specgrp (1=commercial bank, 2=savings), etc.
      const filters = params.filters || {}
      count = await ingestFDICBanks(filters, targetCampaigns)
    }

    else if (sourceType === 'csv') {
      const { csvContent, source = 'csv_upload', columnMapping = {} } = params
      count = await ingestCSV(csvContent, source, targetCampaigns, columnMapping)
    }

    else {
      return NextResponse.json({ ok: false, error: `Unknown sourceType: ${sourceType}` })
    }
  } catch (e: unknown) {
    error = (e as Error).message
  }

  const db = await getDb()
  const poolSize = await db.collection('lead_pool').countDocuments({ status: 'pending' })

  return NextResponse.json({ ok: !error, count, error, poolSize })
}

export async function GET() {
  const db = await getDb()
  const sources = await db.collection('lead_pool').aggregate([
    { $group: { _id: '$source', count: { $sum: 1 }, pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } } } }
  ]).toArray()
  const total = await db.collection('lead_pool').countDocuments()
  const pending = await db.collection('lead_pool').countDocuments({ status: 'pending' })
  return NextResponse.json({ ok: true, total, pending, sources })
}
