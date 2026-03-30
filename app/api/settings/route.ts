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

const DEFAULT_RESEARCH = `Find 15 podcast shows or speaking panel events that would be a great fit for a guest appearance by a 20-year-old self-made entrepreneur from NYC who built a $5M/year software company and leads a social community called the Taco Project. Focus on entrepreneurship, Gen Z, business, fintech, and startup podcasts or speaking opportunities. Return only podcasts and speaking panels — no competitions or awards.`

const DEFAULTS = {
  template: DEFAULT_TEMPLATE,
  researchPrompt: DEFAULT_RESEARCH,
  sendTime: '09:00',
  sendDays: ['mon','tue','wed','thu','fri'],
  endDate: null,
  perSession: 15,
  paused: false,
}

export async function GET(req: NextRequest) {
  const campaign = req.nextUrl.searchParams.get('campaign') || 'influence-outreach'
  const db = await getDb()
  const doc = await db.collection('campaign_settings').findOne({ campaign, key: 'config' })
  return NextResponse.json({ ...DEFAULTS, ...(doc?.value ?? {}) })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { campaign, ...settings } = body
  const db = await getDb()
  await db.collection('campaign_settings').updateOne(
    { campaign, key: 'config' },
    { $set: { campaign, key: 'config', value: settings, updatedAt: new Date() } },
    { upsert: true }
  )
  return NextResponse.json({ ok: true })
}
