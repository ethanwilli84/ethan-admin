import { meta, adAccountPath } from './request'

// Meta campaign objectives (2024+ naming)
export type Objective =
  | 'OUTCOME_SALES'       // what we use — signups/purchases
  | 'OUTCOME_LEADS'
  | 'OUTCOME_TRAFFIC'
  | 'OUTCOME_AWARENESS'
  | 'OUTCOME_ENGAGEMENT'
  | 'OUTCOME_APP_PROMOTION'

export type CampaignStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED'

export async function createCampaign(p: {
  name: string
  objective: Objective
  status?: CampaignStatus
  daily_budget_cents?: number    // CBO — optional, can set at adset level instead
  special_ad_categories?: string[]  // required by Meta, default []
}) {
  const path = `${await adAccountPath()}/campaigns`
  return meta.post<{ id: string }>(path, {}, {
    name: p.name,
    objective: p.objective,
    status: p.status ?? 'PAUSED',
    special_ad_categories: p.special_ad_categories ?? [],
    ...(p.daily_budget_cents ? { daily_budget: p.daily_budget_cents } : {}),
    buying_type: 'AUCTION',
  })
}

export async function createAdSet(p: {
  campaign_id: string
  name: string
  daily_budget_cents: number    // e.g. 1500 = $15/day
  optimization_goal: 'OFFSITE_CONVERSIONS' | 'LINK_CLICKS' | 'LANDING_PAGE_VIEWS'
  billing_event: 'IMPRESSIONS' | 'LINK_CLICKS'
  bid_strategy?: 'LOWEST_COST_WITHOUT_CAP' | 'LOWEST_COST_WITH_BID_CAP' | 'COST_CAP'
  targeting: Record<string, unknown>  // geo, age, interests, lookalikes
  pixel_id?: string
  custom_event_type?: 'LEAD' | 'COMPLETE_REGISTRATION' | 'PURCHASE' | 'SUBSCRIBE'
  status?: CampaignStatus
  start_time?: string
}) {
  const path = `${await adAccountPath()}/adsets`
  const promoted: Record<string, unknown> = {}
  if (p.pixel_id) promoted.pixel_id = p.pixel_id
  if (p.custom_event_type) promoted.custom_event_type = p.custom_event_type

  return meta.post<{ id: string }>(path, {}, {
    campaign_id: p.campaign_id,
    name: p.name,
    daily_budget: p.daily_budget_cents,
    billing_event: p.billing_event,
    optimization_goal: p.optimization_goal,
    bid_strategy: p.bid_strategy ?? 'LOWEST_COST_WITHOUT_CAP',
    targeting: p.targeting,
    status: p.status ?? 'PAUSED',
    ...(Object.keys(promoted).length ? { promoted_object: promoted } : {}),
    ...(p.start_time ? { start_time: p.start_time } : {}),
  })
}

// Upload an image to the ad library (needed before creating an ad creative)
export async function uploadAdImage(p: { url: string }) {
  const path = `${await adAccountPath()}/adimages`
  const r = await meta.post<{ images: Record<string, { hash: string; url: string }> }>(
    path, { url: p.url }
  )
  const first = Object.values(r.images)[0]
  return { hash: first.hash, url: first.url }
}

// Create an ad creative (image + primary text + headline + CTA + landing URL)
export async function createAdCreative(p: {
  name: string
  page_id: string
  instagram_actor_id?: string   // IG user id for cross-posting
  image_hash: string
  link: string
  primary_text: string
  headline: string
  description?: string
  cta_type?: 'SIGN_UP' | 'LEARN_MORE' | 'GET_OFFER' | 'SHOP_NOW' | 'APPLY_NOW' | 'DOWNLOAD'
}) {
  const path = `${await adAccountPath()}/adcreatives`
  const object_story_spec: Record<string, unknown> = {
    page_id: p.page_id,
    link_data: {
      link: p.link,
      message: p.primary_text,
      name: p.headline,
      ...(p.description ? { description: p.description } : {}),
      image_hash: p.image_hash,
      call_to_action: { type: p.cta_type ?? 'SIGN_UP', value: { link: p.link } },
    },
  }
  if (p.instagram_actor_id) object_story_spec.instagram_actor_id = p.instagram_actor_id

  return meta.post<{ id: string }>(path, {}, {
    name: p.name,
    object_story_spec,
  })
}

export async function createAd(p: {
  adset_id: string
  creative_id: string
  name: string
  status?: CampaignStatus
}) {
  const path = `${await adAccountPath()}/ads`
  return meta.post<{ id: string }>(path, {}, {
    name: p.name,
    adset_id: p.adset_id,
    creative: { creative_id: p.creative_id },
    status: p.status ?? 'PAUSED',
  })
}

// Toggle any entity status (campaign, adset, ad)
export async function setStatus(id: string, status: CampaignStatus) {
  return meta.post<{ success: boolean }>(`/${id}`, {}, { status })
}

// Update daily budget on an adset (used for auto-scaling winners)
export async function updateAdSetBudget(adset_id: string, daily_budget_cents: number) {
  return meta.post<{ success: boolean }>(`/${adset_id}`, {}, { daily_budget: daily_budget_cents })
}
