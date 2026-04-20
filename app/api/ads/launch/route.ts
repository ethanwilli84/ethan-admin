import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/mongodb'
import { getCreds } from '@/lib/meta-ads/client'
import {
  createCampaign, createAdSet, createAd, createAdCreative, uploadAdImage,
  type Objective, type CampaignStatus,
} from '@/lib/meta-ads/entities'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// POST /api/ads/launch
// Body:
// {
//   accountId: 'sire-ship',
//   campaignName: 'Sire Ship — Waitlist Test 1',
//   objective: 'OUTCOME_SALES',
//   destinations: [
//     { name: 'waitlist',  url: 'https://app.sireapp.io',      creativeIds: ['...', '...'] },
//     { name: 'homepage',  url: 'https://sireapp.io',          creativeIds: ['...'] },
//   ],
//   dailyBudgetCents: 1500,       // per ad set
//   optimizationGoal: 'OFFSITE_CONVERSIONS',
//   customEvent: 'LEAD' | 'COMPLETE_REGISTRATION' | 'PURCHASE',
//   primaryText: 'Ship smarter. Pay less.',
//   headline: 'Sire Ship',
//   description: '10% below Shippo.',
//   ctaType: 'SIGN_UP',
//   targeting: { geo_locations: { countries: ['US'] }, age_min: 18, age_max: 55 },
//   status: 'PAUSED',             // safer default, flip to ACTIVE from UI
// }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const accountId = body.accountId ?? 'sire-ship'
  const status: CampaignStatus = body.status ?? 'PAUSED'

  try {
    const db = await getDb()
    const creds = await getCreds(accountId)

    // 1) Create the campaign
    const camp = await createCampaign({
      name: body.campaignName,
      objective: body.objective as Objective,
      status,
    })

    const createdAt = new Date().toISOString()
    await db.collection('ads_campaigns').insertOne({
      accountId, metaId: camp.id, name: body.campaignName,
      objective: body.objective, status, createdAt,
    })

    const results: Array<{ destination: string; adsetId: string; ads: Array<{ metaAdId: string; creativeId: string }> }> = []

    // 2) For each destination: one ad set, N ads
    for (const dest of body.destinations as Array<{ name: string; url: string; creativeIds: string[] }>) {
      const adset = await createAdSet({
        campaign_id: camp.id,
        name: `${body.campaignName} · ${dest.name}`,
        daily_budget_cents: body.dailyBudgetCents ?? 1500,
        optimization_goal: body.optimizationGoal ?? 'OFFSITE_CONVERSIONS',
        billing_event: 'IMPRESSIONS',
        targeting: body.targeting ?? { geo_locations: { countries: ['US'] }, age_min: 18, age_max: 55 },
        pixel_id: creds.pixelId,
        custom_event_type: body.customEvent ?? 'LEAD',
        status,
      })

      await db.collection('ads_adsets').insertOne({
        accountId, metaId: adset.id, campaignMetaId: camp.id,
        destinationUrl: dest.url, destinationName: dest.name,
        dailyBudgetCents: body.dailyBudgetCents ?? 1500,
        status, createdAt,
      })

      const adsForDest: Array<{ metaAdId: string; creativeId: string }> = []
      for (const creativeId of dest.creativeIds) {
        const creative = await db.collection('ads_creatives').findOne({ _id: new ObjectId(creativeId) })
        if (!creative) continue

        // Ensure image is in Meta's ad library
        let imgHash = creative.metaImageHash as string | null
        if (!imgHash) {
          const uploaded = await uploadAdImage({ url: creative.imageUrl as string })
          imgHash = uploaded.hash
          await db.collection('ads_creatives').updateOne({ _id: creative._id }, { $set: { metaImageHash: imgHash } })
        }

        const adCreative = await createAdCreative({
          name: `${creative.name} → ${dest.name}`,
          page_id: creds.pageId,
          instagram_actor_id: creds.igUserId,
          image_hash: imgHash,
          link: dest.url,
          primary_text: body.primaryText ?? '',
          headline: body.headline ?? 'Sire Ship',
          description: body.description,
          cta_type: body.ctaType ?? 'SIGN_UP',
        })

        const ad = await createAd({
          adset_id: adset.id,
          creative_id: adCreative.id,
          name: `${creative.name} → ${dest.name}`,
          status,
        })

        await db.collection('ads_ads').insertOne({
          accountId, metaId: ad.id, adsetMetaId: adset.id, campaignMetaId: camp.id,
          creativeId: creative._id.toString(), adCreativeMetaId: adCreative.id,
          destinationUrl: dest.url, name: `${creative.name} → ${dest.name}`,
          status, createdAt,
        })

        // Bump usage counter
        await db.collection('ads_creatives').updateOne(
          { _id: creative._id },
          { $inc: { 'stats.timesUsedInAds': 1 }, $set: { updatedAt: createdAt } },
        )

        adsForDest.push({ metaAdId: ad.id, creativeId: creative._id.toString() })
      }

      results.push({ destination: dest.name, adsetId: adset.id, ads: adsForDest })
    }

    return NextResponse.json({ ok: true, campaignId: camp.id, results })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
