export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const DEFAULT_TEMPLATE = `Hey, I wanted to reach out to see what the process looks like for potentially being a guest on the platform. I really love the work you guys put out and honestly feel like my generation needs more of it. We need more people standing up and talking about what they actually believe in.

I haven't done too many public appearances in the past since I live a pretty private life, but I'm looking to start doing more because I genuinely believe my story can inspire others and my message moves people. I've spoken at a few schools and to entrepreneur groups but I'd really like to make a larger impact on a broader scale.

For context, I'm 20 years old, based in New York City, and I founded a software company that now does a little over $5 million per year in revenue. I also lead a community of young entrepreneurs called the Taco Project, pretty interesting origin story, but all good people actually making a difference in the world.

Would love to learn more about the process and what the upcoming calendar looks like for you guys.

Thanks,
Ethan Williams
ethan@sireapp.io | +1 (734) 664-5129
Instagram: @ethan.williamsx`

const DEFAULT_RESEARCH = `Search the web and find 15 NEW podcast or public speaking opportunities for a 20-year-old NYC entrepreneur named Ethan Williams.

About Ethan:
- 20 years old, based in NYC
- Founded a software company doing $5M+/year revenue
- Leads a young entrepreneur community called The Taco Project
- Topics: entrepreneurship, gen z mindset, travel/culture, living a full life while building, overcoming struggles
- Has spoken at schools and entrepreneur groups before

Target platforms with 1,000–100,000 listeners/followers that are actively growing. Avoid mega-famous shows.
Focus on: college entrepreneurship events, niche podcasts (sneakers, fintech, gen z, young money), NYC startup panels.
Do NOT include pitch competitions or anything requiring prepared materials.

Return ONLY a valid JSON array of 15 objects. No other text:
[{"name":"...","category":"podcast|speaking","website":"...","contact_page":"...","description":"...","why_fit":"..."}]`

const DEFAULT_CONTACT_PROMPT = `Find contact email addresses for "{name}" ({website}).

Search their website to find:
1. Emails on their contact/booking/apply page: {contact_page}
2. The producer, booking manager, or guest coordinator
3. Common patterns: contact@, booking@, press@, apply@, hello@, guests@, [firstname]@domain.com

Return ONLY a valid JSON array. Max 4 contacts. No other text:
[{"email": "email@domain.com", "name": "First Last or null", "role": "host/producer/booking/general", "confidence": "high/medium/low"}]

Only include emails you actually found or can reasonably guess from their domain pattern.`

const DEFAULT_EMAIL_SUBJECT = 'Guest Appearance - Ethan Williams'
const DEFAULT_SENDER_NAME = 'Ethan Williams'
const DEFAULT_SENDER_EMAIL = 'ethan@sireapp.io'

const DEFAULTS = {
  template: DEFAULT_TEMPLATE,
  researchPrompt: DEFAULT_RESEARCH,
  contactPrompt: DEFAULT_CONTACT_PROMPT,
  emailSubject: DEFAULT_EMAIL_SUBJECT,
  senderName: DEFAULT_SENDER_NAME,
  senderEmail: DEFAULT_SENDER_EMAIL,
  sendTime: '09:00',
  sendDays: ['mon','tue','wed','thu','fri'],
  endDate: null,
  perSession: 15,
  maxContactsPerPlatform: 3,
  skipLowConfidence: true,
  paused: false,
}


// Build full research prompt from plain-English objective
function buildResearchPrompt(objective: string, perSession: number): string {
  const base = objective || `Find podcast shows and speaking events for a 20-year-old NYC entrepreneur (Ethan Williams, $5M+ software company, The Taco Project community). Target 1k-100k audience, actively booking guests.`
  return `${base}

Already contacted (skip these): {already_contacted}

Search the web to find {per_session} new options matching the above criteria.`.replace('{per_session}', String(perSession))
}

// Build full contact prompt from plain-English objective
function buildContactPrompt(objective: string): string {
  const base = objective || `Find the host, booking manager, or guest coordinator. Check contact/booking pages first. Try common email patterns like booking@, contact@, guests@, or [firstname]@domain.com.`
  return `Find contact email addresses for "{name}" ({website}).

${base}

Contact page to check: {contact_page}

Return ONLY a valid JSON array, max 4 contacts, no other text:
[{"email":"...","name":"First Last or null","role":"host/producer/booking/general","confidence":"high/medium/low"}]`
}

export async function GET(req: NextRequest) {
  const campaign = req.nextUrl.searchParams.get('campaign') || 'influence-outreach'
  const db = await getDb()
  const doc = await db.collection('campaign_settings').findOne({ campaign, key: 'config' })
  const saved = doc?.value ?? {}
  return NextResponse.json({ ...DEFAULTS, ...saved })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { campaign, researchObjective, contactObjective, perSession, ...settings } = body
  // Build full prompts from plain-English objectives
  const builtSettings: Record<string, unknown> = { ...settings }
  if (researchObjective !== undefined) {
    builtSettings.researchObjective = researchObjective
    builtSettings.researchPrompt = buildResearchPrompt(researchObjective, perSession ?? 15)
  }
  if (contactObjective !== undefined) {
    builtSettings.contactObjective = contactObjective
    builtSettings.contactPrompt = buildContactPrompt(contactObjective)
  }
  if (perSession !== undefined) builtSettings.perSession = perSession
  if (!campaign) return NextResponse.json({ ok: false, error: 'missing campaign' }, { status: 400 })
  const db = await getDb()
  // Merge with existing so partial saves don't wipe other fields
  const existing = await db.collection('campaign_settings').findOne({ campaign, key: 'config' })
  const merged = { ...(existing?.value ?? {}), ...builtSettings }
  await db.collection('campaign_settings').updateOne(
    { campaign, key: 'config' },
    { $set: { campaign, key: 'config', value: merged, updatedAt: new Date() } },
    { upsert: true }
  )
  return NextResponse.json({ ok: true })
}
