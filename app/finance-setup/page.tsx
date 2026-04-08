'use client'
import Link from 'next/link'

export default function FinanceSetupPage() {
  const callbackUrl = 'https://ethan-admin-hlfdr.ondigitalocean.app/api/finance/qbo-callback'

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
      <Link href="/finance" style={{ color: 'var(--text-3)', fontSize: 13, textDecoration: 'none' }}>← Finance Monitor</Link>
      <div style={{ fontFamily: 'var(--font-syne)', fontWeight: 700, fontSize: 22, marginTop: 8, marginBottom: 24 }}>
        🔗 QuickBooks Setup
      </div>

      {/* Step 1 — Connect */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Step 1 — Connect your QBO account</div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.7 }}>
          Click below to authorize the admin app to read your QuickBooks data. You&apos;ll be redirected to Intuit, then back here with tokens saved automatically.
        </p>
        <a href="/api/finance/qbo-auth" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block', padding: '10px 20px' }}>
          Connect QuickBooks →
        </a>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10, fontFamily: 'var(--font-dm-mono)' }}>
          Callback URL (add this to your Intuit app redirect URIs):<br/>
          <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>{callbackUrl}</code>
        </div>
      </div>

      {/* Step 2 — Production vs Sandbox */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Step 2 — Sandbox vs Production</div>
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <p style={{ marginBottom: 8 }}><strong>Current:</strong> Sandbox credentials (development) — connects to test data, NOT your real Sire Apps LLC account.</p>
          <p style={{ marginBottom: 8 }}><strong>For real data:</strong> Complete the App Assessment on developer.intuit.com (20 min). Once approved, swap in production Client ID + Secret.</p>
          <p style={{ color: 'var(--text-3)', fontSize: 12 }}>Since it&apos;s just for your own company, Intuit is usually quick to approve internal-use apps.</p>
        </div>
        <a href="https://developer.intuit.com/app/developer/myapps" target="_blank"
          style={{ display: 'inline-block', marginTop: 12, fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
          Open Intuit Developer Console →
        </a>
      </div>

      {/* Step 3 — DO env vars */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Step 3 — Add env vars to DigitalOcean</div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 10 }}>After connecting, add these to your DO App Platform environment variables:</p>
        <pre style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '12px 16px', fontSize: 11, fontFamily: 'var(--font-dm-mono)', overflow: 'auto', lineHeight: 1.6 }}>
{`QBO_CLIENT_ID=AB5dQam2EOGhCzeLZxWmVmYqh9Tqbqy11m84ekZwwdRZiBmAPC
QBO_CLIENT_SECRET=lzVeCWktEW9gtjIhzZYaMrPKzwuwa2mkbS7tDjzL
QBO_REALM_ID=9341453460974038
QBO_REFRESH_TOKEN=(shown after you connect above)`}
        </pre>
      </div>

      {/* Daily auto-sync */}
      <div className="card">
        <div className="section-label" style={{ marginBottom: 12 }}>Step 4 — Daily auto-sync (GitHub Actions)</div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 8 }}>
          A GitHub Actions cron runs daily at 8 AM ET and hits <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>/api/finance/qbo-sync</code> — pulls P&L, transactions, balance sheet, and flags anomalies. No action needed once configured.
        </p>
        <div style={{ fontSize: 11, color: 'var(--green)', fontFamily: 'var(--font-dm-mono)' }}>✓ GitHub Actions workflow already deployed</div>
      </div>
    </div>
  )
}
