export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!
type CampaignMeta = { slug: string; name: string; researchObjective: string; perSession: number }

async function aiDetermineStrategy(campaign: CampaignMeta) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 400,
      messages: [{ role: 'user', content: `Analyze this outreach campaign and determine which free lead databases to use.

Campaign: "${campaign.name}"
Objective: "${(campaign.researchObjective || '').substring(0, 400)}"

Available free sources:
1. iTunes/Apple Podcasts — for podcast outreach, guest appearances, speaking
2. FDIC Bank Database — all US community banks, for lending/warehouse/banking campaigns  
3. SEC EDGAR Form D — recent fundraising companies
4. GLEIF Registry — registered companies worldwide

Return ONLY raw JSON, no markdown:
{"category":"podcast_outreach|lending|investor|general","use_itunes":true,"itunes_queries":["q1","q2","q3","q4","q5"],"use_fdic":false,"fdic_filters":{},"use_sec":false,"use_gleif":false,"sec_search_term":"","gleif_keywords":[],"notes":"brief explanation"}` }]
    })
  })
  const d = await res.json()
  let raw = (d.content?.[0]?.text || '{}').replace(/```json\s*/g,'').replace(/```/g,'').trim()
  try { return JSON.parse(raw) }
  catch { return { category:'general', use_itunes:false, use_fdic:false, use_sec:false, use_gleif:false, itunes_queries:[], fdic_filters:{}, notes:'parse error' } }
}

async function fetchItunes(queries: string[], campaigns: string[]): Promise<number> {
  const db = await getDb(); let total = 0
  for (const query of queries) {
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=podcast&limit=100&entity=podcast`)
      const d = await res.json() as { results?: Record<string,unknown>[] }
      for (const p of (d.results || [])) {
        const name = (p.collectionName || p.trackName) as string
        if (!name) continue
        const exists = await db.collection('lead_pool').findOne({ name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'i') } })
        if (exists) { await db.collection('lead_pool').updateOne({_id:exists._id},{$addToSet:{campaigns:{$each:campaigns}}}); continue }
        let email: string|null=null, website=(p.artistViewUrl||'') as string
        if (p.feedUrl) {
          try {
            const fr = await fetch(p.feedUrl as string,{headers:{'User-Agent':'EthanAdmin/1.0'},signal:AbortSignal.timeout(4000)})
            const xml = await fr.text()
            const em = xml.match(/<itunes:email>([^<]+)<\/itunes:email>/)||xml.match(/<managingEditor>([^<]+)<\/managingEditor>/)
            if (em) email = em[1].trim()
            const lm = xml.match(/<link>([^<]+)<\/link>/)
            if (lm) website = lm[1].trim()
          } catch {}
        }
        await db.collection('lead_pool').insertOne({ name, website, feedUrl: p.feedUrl, email, category:'podcast', source:'itunes', campaigns, status:'pending', score: email?80:50, metadata:{genre:p.primaryGenreName}, createdAt:new Date(), updatedAt:new Date() })
        total++
      }
    } catch {}
  }
  return total
}

async function fetchFDIC(filters: Record<string,string>, campaigns: string[]): Promise<number> {
  const db = await getDb(); let total=0, offset=0
  const filterStr = Object.entries(filters).map(([k,v])=>`${k}:${v}`).join(' AND ')
  while (true) {
    try {
      const url = `https://banks.data.fdic.gov/api/institutions?filters=${encodeURIComponent(`ACTIVE:1${filterStr?' AND '+filterStr:''}`)}&fields=NAME,CITY,STALP,WEBADDR,ASSET&limit=100&offset=${offset}&sort_by=ASSET&sort_order=ASC&output=json`
      const res = await fetch(url)
      const d = await res.json() as { data?: Array<{data:Record<string,unknown>}> }
      const banks = d.data||[]
      if (!banks.length) break
      for (const b of banks) {
        const info=b.data, name=info.NAME as string
        if (!name) continue
        const rawWeb=(info.WEBADDR as string||'').split(';')[0].trim()
        const website = rawWeb?(rawWeb.startsWith('http')?rawWeb:`https://${rawWeb}`):null
        const exists = await db.collection('lead_pool').findOne({name:{$regex:new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'i')}})
        if (exists) { await db.collection('lead_pool').updateOne({_id:exists._id},{$addToSet:{campaigns:{$each:campaigns}}}); continue }
        await db.collection('lead_pool').insertOne({ name, website, category:'community_bank', description:`${name} — ${info.CITY}, ${info.STALP}. Assets: $${Math.round((info.ASSET as number)/1000)}M`, source:'fdic', campaigns, status:'pending', score:60, metadata:{state:info.STALP,assetsMM:Math.round((info.ASSET as number)/1000)}, createdAt:new Date(), updatedAt:new Date() })
        total++
      }
      if (banks.length<100) break; offset+=100; if (offset>3000) break
    } catch { break }
  }
  return total
}

async function fetchSEC(searchTerm: string, campaigns: string[]): Promise<number> {
  const db = await getDb(); let total=0
  try {
    const res = await fetch(`https://efts.sec.gov/LATEST/search-index?q="${encodeURIComponent(searchTerm)}"&dateRange=custom&startdt=2024-01-01&forms=D`,{headers:{'User-Agent':'EthanAdmin ethan@sireapp.io'}})
    const d = await res.json() as { hits?:{hits?:Array<{_source:Record<string,unknown>}>} }
    for (const hit of (d.hits?.hits||[]).slice(0,50)) {
      const src=hit._source, name=(src.entity_name||src.companyName) as string
      if (!name) continue
      const exists = await db.collection('lead_pool').findOne({name:{$regex:new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'i')}})
      if (exists) continue
      await db.collection('lead_pool').insertOne({ name, website:null, category:'fundraising_company', description:`Form D filing — ${src.period_of_report||src.file_date}`, source:'sec_edgar', campaigns, status:'pending', score:55, metadata:src, createdAt:new Date(), updatedAt:new Date() })
      total++
    }
  } catch {}
  return total
}

async function fetchGLEIF(keywords: string[], campaigns: string[]): Promise<number> {
  const db = await getDb(); let total=0
  for (const kw of keywords) {
    try {
      const res = await fetch(`https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=${encodeURIComponent(kw)}&filter[entity.legalAddress.country]=US&page[size]=20`)
      const d = await res.json() as { data?:Array<{attributes:{entity:{legalName:{name:string};registeredAddress?:{city?:string;region?:string}}};id:string}> }
      for (const rec of (d.data||[])) {
        const name = rec.attributes?.entity?.legalName?.name
        if (!name) continue
        const exists = await db.collection('lead_pool').findOne({name:{$regex:new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'i')}})
        if (exists) continue
        await db.collection('lead_pool').insertOne({ name, website:null, category:'registered_company', description:`Registered US company — ${rec.attributes?.entity?.registeredAddress?.city||''}, ${rec.attributes?.entity?.registeredAddress?.region||''}`.trim(), source:'gleif', campaigns, status:'pending', score:45, metadata:{lei:rec.id}, createdAt:new Date(), updatedAt:new Date() })
        total++
      }
    } catch {}
  }
  return total
}

export async function POST(req: NextRequest) {
  const db = await getDb()
  const { campaignSlug, campaignName, researchObjective, perSession=20, force=false } = await req.json()

  if (!force) {
    const existing = await db.collection('lead_pool').countDocuments({ campaigns: campaignSlug, status:'pending' })
    if (existing >= perSession * 5) return NextResponse.json({ ok:true, skipped:true, existingLeads:existing })
  }

  const campaign: CampaignMeta = { slug:campaignSlug, name:campaignName, researchObjective, perSession }
  const campaigns = [campaignSlug]
  const log: string[] = []
  let totalAdded = 0

  log.push('🤖 AI analyzing campaign for best lead sources...')
  const strategy = await aiDetermineStrategy(campaign)
  log.push(`Strategy: ${strategy.category} | iTunes:${strategy.use_itunes} FDIC:${strategy.use_fdic} SEC:${strategy.use_sec} GLEIF:${strategy.use_gleif}`)
  log.push(`Notes: ${strategy.notes}`)

  if (strategy.use_itunes && strategy.itunes_queries?.length) {
    log.push(`\n📻 Tier 1: iTunes Podcasts (${strategy.itunes_queries.length} queries)...`)
    const n = await fetchItunes(strategy.itunes_queries, campaigns)
    totalAdded += n; log.push(`✓ Added ${n} podcast leads`)
  }
  if (strategy.use_fdic) {
    log.push(`\n🏦 Tier 1: FDIC Bank Database...`)
    const n = await fetchFDIC(strategy.fdic_filters||{}, campaigns)
    totalAdded += n; log.push(`✓ Added ${n} bank leads`)
  }

  const afterTier1 = await db.collection('lead_pool').countDocuments({ campaigns:campaignSlug, status:'pending' })
  if (afterTier1 < perSession * 10) {
    if (strategy.use_sec && strategy.sec_search_term) {
      log.push(`\n📋 Tier 2: SEC EDGAR...`)
      const n = await fetchSEC(strategy.sec_search_term, campaigns)
      totalAdded += n; log.push(`✓ Added ${n} SEC leads`)
    }
    if (strategy.use_gleif && strategy.gleif_keywords?.length) {
      log.push(`\n🏢 Tier 2: GLEIF Registry...`)
      const n = await fetchGLEIF(strategy.gleif_keywords, campaigns)
      totalAdded += n; log.push(`✓ Added ${n} GLEIF leads`)
    }
  }

  const finalCount = await db.collection('lead_pool').countDocuments({ campaigns:campaignSlug, status:'pending' })
  log.push(`\n✅ Pool: ${finalCount} pending leads for ${campaignSlug}`)
  if (finalCount < perSession * 3) log.push(`⚠ Low pool — import CSV from Apollo.io, Crunchbase, or LinkedIn Sales Nav via Lead Pool > CSV Upload`)

  await db.collection('lead_source_strategies').updateOne(
    { campaign:campaignSlug },
    { $set:{ campaign:campaignSlug, strategy, lastRun:new Date(), totalLeads:finalCount } },
    { upsert:true }
  )

  return NextResponse.json({ ok:true, totalAdded, finalCount, strategy, log })
}

export async function GET() {
  const db = await getDb()
  const strategies = await db.collection('lead_source_strategies').find({}).toArray()
  const poolStats = await db.collection('lead_pool').aggregate([
    { $group:{_id:'$source',count:{$sum:1},pending:{$sum:{$cond:[{$eq:['$status','pending']},1,0]}}}}
  ]).toArray()
  return NextResponse.json({ ok:true, strategies, poolStats })
}
