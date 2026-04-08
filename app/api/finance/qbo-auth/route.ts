export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'

const CLIENT_ID = process.env.QBO_CLIENT_ID || 'AB5dQam2EOGhCzeLZxWmVmYqh9Tqbqy11m84ekZwwdRZiBmAPC'
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_URL || 'https://ethan-admin-hlfdr.ondigitalocean.app'}/api/finance/qbo-callback`
const SCOPES = 'com.intuit.quickbooks.accounting'

export async function GET() {
  // Build QBO OAuth URL — user clicks this, authorizes, and we capture the code
  const state = Math.random().toString(36).substring(2)
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    state,
  })

  const authUrl = `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`
  return NextResponse.redirect(authUrl)
}
