export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

const CLIENT_ID = process.env.QBO_CLIENT_ID || 'AB5dQam2EOGhCzeLZxWmVmYqh9Tqbqy11m84ekZwwdRZiBmAPC'
const CLIENT_SECRET = process.env.QBO_CLIENT_SECRET || 'lzVeCWktEW9gtjIhzZYaMrPKzwuwa2mkbS7tDjzL'
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_URL || 'https://ethan-admin-hlfdr.ondigitalocean.app'}/api/finance/qbo-callback`

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const realmId = req.nextUrl.searchParams.get('realmId')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return new NextResponse(`<html><body style="font-family:sans-serif;padding:40px">
      <h2 style="color:red">❌ OAuth Error</h2><p>${error}</p>
      <a href="/finance-setup">← Back to setup</a></body></html>`, { headers: { 'Content-Type': 'text/html' } })
  }

  if (!code || !realmId) {
    return new NextResponse('<html><body style="font-family:sans-serif;padding:40px"><h2>Missing code or realmId</h2></body></html>', { headers: { 'Content-Type': 'text/html' } })
  }

  try {
    // Exchange auth code for tokens
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }).toString(),
    })

    const tokens = await tokenRes.json()
    if (!tokens.refresh_token) {
      return new NextResponse(`<html><body style="font-family:sans-serif;padding:40px"><h2 style="color:red">Token exchange failed</h2><pre>${JSON.stringify(tokens, null, 2)}</pre></body></html>`, { headers: { 'Content-Type': 'text/html' } })
    }

    // Save to DB
    const db = await getDb()
    await db.collection('qbo_credentials').updateOne(
      { _id: 'sire' as unknown as import('mongodb').ObjectId },
      {
        $set: {
          realmId,
          refreshToken: tokens.refresh_token,
          accessToken: tokens.access_token,
          tokenType: tokens.token_type,
          expiresIn: tokens.expires_in,
          refreshTokenExpiresIn: tokens.x_refresh_token_expires_in,
          updatedAt: new Date(),
          environment: CLIENT_ID.includes('sandbox') ? 'sandbox' : 'production',
        }
      },
      { upsert: true }
    )

    // Save refresh token to a display-friendly location for DO env setup
    const refreshToken = tokens.refresh_token

    return new NextResponse(`<html><body style="font-family:sans-serif;padding:40px;max-width:700px">
      <h2 style="color:green">✅ QuickBooks Connected!</h2>
      <p><strong>Realm ID:</strong> ${realmId}</p>
      <p><strong>Refresh Token saved to DB.</strong></p>
      <hr/>
      <h3>Next: Add to DigitalOcean env vars</h3>
      <p>Add these to your DO App Platform environment variables:</p>
      <pre style="background:#f5f5f5;padding:16px;border-radius:8px;overflow:auto">
QBO_CLIENT_ID=${CLIENT_ID}
QBO_CLIENT_SECRET=${CLIENT_SECRET}
QBO_REALM_ID=${realmId}
QBO_REFRESH_TOKEN=${refreshToken}
      </pre>
      <p style="color:#666;font-size:13px">The refresh token lasts 101 days and auto-renews on each use.</p>
      <a href="/finance" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#000;color:white;border-radius:8px;text-decoration:none">← Go to Finance Monitor</a>
    </body></html>`, { headers: { 'Content-Type': 'text/html' } })

  } catch (e: unknown) {
    return new NextResponse(`<html><body style="font-family:sans-serif;padding:40px"><h2 style="color:red">Error</h2><p>${(e as Error).message}</p></body></html>`, { headers: { 'Content-Type': 'text/html' } })
  }
}
