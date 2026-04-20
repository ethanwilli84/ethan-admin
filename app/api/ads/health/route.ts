import { NextResponse } from 'next/server'
import { getCreds } from '@/lib/meta-ads/client'
import { checkAndMaybeRefresh } from '@/lib/meta-ads/token'
import { meta } from '@/lib/meta-ads/request'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  try {
    const creds = await getCreds()
    const tokenCheck = await checkAndMaybeRefresh()

    let accountHealth: Record<string, unknown> = {}
    try {
      accountHealth = await meta.get(`/act_${creds.adAccountId}`, {
        fields: 'name,account_status,currency,timezone_name,amount_spent,balance,disable_reason',
      })
    } catch (e) {
      accountHealth = { error: (e as Error).message }
    }

    let pixelHealth: Record<string, unknown> = {}
    try {
      pixelHealth = await meta.get(`/${creds.pixelId}`, {
        fields: 'name,last_fired_time,is_unavailable,data_use_setting',
      })
    } catch (e) {
      pixelHealth = { error: (e as Error).message }
    }

    return NextResponse.json({
      ok: true,
      token: tokenCheck,
      adAccount: accountHealth,
      pixel: pixelHealth,
      pageId: creds.pageId,
      igUserId: creds.igUserId,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
