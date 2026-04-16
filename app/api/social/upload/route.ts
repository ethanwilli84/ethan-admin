export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

// Local upload server running on user's Mac at localhost:3002
// Files saved to ~/Social/Templates/{accountId}/{contentType}/
// Started via LaunchAgent com.ethan.social-upload-server.plist
const LOCAL_SERVER = 'http://localhost:3002'

// GET — check if local server is reachable
export async function GET() {
  try {
    const res = await fetch(`${LOCAL_SERVER}/health`, { signal: AbortSignal.timeout(3000) })
    const d = await res.json()
    return NextResponse.json({ ok: true, serverUrl: LOCAL_SERVER, storage: d.storage })
  } catch {
    return NextResponse.json({
      ok: false,
      error: 'Local upload server not running. Start it: python3 ~/scripts/social/upload_server.py',
      serverUrl: LOCAL_SERVER,
    }, { status: 503 })
  }
}
