import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const DEFAULT = `Hey, I wanted to reach out to see what the process looks like for potentially being a guest on the platform. I really love the work you guys put out and honestly feel like my generation needs more of it. We need more people standing up and talking about what they actually believe in.

I haven't done too many public appearances in the past since I live a pretty private life, but I'm looking to start doing more because I genuinely believe my story can inspire others and my message moves people. I've spoken at a few schools and to entrepreneur groups but I'd really like to make a larger impact on a broader scale.

For context, I'm 20 years old, based in New York City, and I founded a software company that now does a little over $5 million per year in revenue. I also lead a community of young entrepreneurs called the Taco Project, pretty interesting origin story, but all good people actually making a difference in the world.

Would love to learn more about the process and what the upcoming calendar looks like for you guys.

Thanks,
Ethan Williams
ethan@sireapp.io | +1 (734) 664-5129
Instagram: @ethan.williamsx`

export async function GET(req: NextRequest) {
  const campaign = req.nextUrl.searchParams.get('campaign') || 'influence-outreach'
  const db = await getDb()
  const doc = await db.collection('campaign_settings').findOne({ campaign, key: 'pitch_template' })
  return NextResponse.json({ template: doc?.value ?? DEFAULT })
}

export async function POST(req: NextRequest) {
  const { campaign, template } = await req.json()
  const db = await getDb()
  await db.collection('campaign_settings').updateOne(
    { campaign, key: 'pitch_template' },
    { $set: { campaign, key: 'pitch_template', value: template, updatedAt: new Date() } },
    { upsert: true }
  )
  return NextResponse.json({ ok: true })
}
export const dynamic = 'force-dynamic'
