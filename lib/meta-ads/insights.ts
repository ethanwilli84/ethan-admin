import { meta } from './request'

// Pull performance metrics (spend, impressions, clicks, conversions) for any entity
// level = ad | adset | campaign | account
export async function getInsights(p: {
  object_id: string                  // campaign/adset/ad id
  level?: 'ad' | 'adset' | 'campaign' | 'account'
  date_preset?: 'today' | 'yesterday' | 'last_7d' | 'last_30d' | 'lifetime'
  time_range?: { since: string; until: string }  // YYYY-MM-DD
  breakdowns?: string[]              // e.g. ['age','gender'], ['device_platform']
  fields?: string[]
}) {
  const defaultFields = [
    'spend','impressions','reach','clicks','ctr','cpc','cpm','frequency',
    'actions','action_values','cost_per_action_type','cost_per_inline_link_click',
    'video_p25_watched_actions','video_p50_watched_actions','video_p75_watched_actions','video_p100_watched_actions',
  ]

  const params: Record<string, string> = {
    fields: (p.fields ?? defaultFields).join(','),
    level: p.level ?? 'ad',
  }
  if (p.time_range) {
    params['time_range'] = JSON.stringify(p.time_range)
  } else {
    params['date_preset'] = p.date_preset ?? 'today'
  }
  if (p.breakdowns?.length) params['breakdowns'] = p.breakdowns.join(',')

  return meta.get<{ data: Array<Record<string, unknown>> }>(`/${p.object_id}/insights`, params)
}

// Shortcut: given an ad set, return its current spend + key conversion metrics today
export async function getAdSetToday(adset_id: string) {
  const r = await getInsights({ object_id: adset_id, level: 'adset', date_preset: 'today' })
  return r.data?.[0] ?? null
}
