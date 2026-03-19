'use client'

import { useState, useEffect } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  getNotificationSettings,
  updateNotificationSettings,
  getWeeklyDigestPreview,
  sendWeeklyDigestNow,
} from '@/lib/api'
import { Mail, Send, CheckCircle, AlertCircle, TrendingDown, TrendingUp } from 'lucide-react'

function fmt(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function NotificationsPage() {
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [sendEmail, setSendEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sent: boolean; to: string } | null>(null)
  const [sendError, setSendError] = useState('')

  const [preview, setPreview] = useState<{
    week_start: string
    today: string
    income: number
    spending: number
    top_categories: [string, number][]
    net_worth: number
    total_assets: number
    total_liabilities: number
    over_budget: [string, number, number][]
  } | null>(null)

  useEffect(() => {
    getNotificationSettings().then(s => {
      setEmail(s.notification_email || '')
      setSendEmail(s.notification_email || '')
    }).catch(() => {})

    getWeeklyDigestPreview().then(setPreview).catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    try {
      await updateNotificationSettings({ notification_email: email })
      setSaved(true)
      setSendEmail(email)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setSaveError('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  const handleSend = async () => {
    setSending(true)
    setSendError('')
    setSendResult(null)
    try {
      const result = await sendWeeklyDigestNow(sendEmail)
      setSendResult(result)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSendError(msg || 'Failed to send. Check SMTP configuration.')
    } finally {
      setSending(false)
    }
  }

  const netWeek = preview ? preview.income - preview.spending : 0

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 max-w-lg">
        <div className="flex items-center gap-3">
          <Mail size={22} className="text-primary" />
          <h1 className="text-xl font-bold text-text-primary">Notifications</h1>
        </div>

        {/* Email Settings */}
        <Card title="Email Digest">
          <div className="flex flex-col gap-4 mt-1">
            <p className="text-xs text-text-secondary">
              Get a weekly spending summary every Monday morning. Shows income, spending, top categories, and any over-budget alerts.
            </p>

            <Input
              label="Your Email Address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
            />

            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" loading={saving} onClick={handleSave}>
                Save
              </Button>
              {saved && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle size={12} /> Saved
                </span>
              )}
              {saveError && (
                <span className="text-xs text-danger">{saveError}</span>
              )}
            </div>
          </div>
        </Card>

        {/* Weekly preview */}
        {preview && (
          <Card title={`This Week's Digest Preview`}>
            <p className="text-xs text-text-secondary mb-4 -mt-1">{preview.week_start} – {preview.today}</p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="flex flex-col gap-1 p-3 rounded-xl bg-surface-2">
                <span className="text-[10px] text-text-secondary uppercase tracking-wide">Income</span>
                <span className="text-sm font-bold text-green-400">{fmt(preview.income)}</span>
              </div>
              <div className="flex flex-col gap-1 p-3 rounded-xl bg-surface-2">
                <span className="text-[10px] text-text-secondary uppercase tracking-wide">Spent</span>
                <span className="text-sm font-bold text-red-400">{fmt(preview.spending)}</span>
              </div>
              <div className="flex flex-col gap-1 p-3 rounded-xl bg-surface-2">
                <span className="text-[10px] text-text-secondary uppercase tracking-wide">Net</span>
                <span className={`text-sm font-bold ${netWeek >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmt(netWeek)}
                </span>
              </div>
            </div>

            {/* Top categories */}
            {preview.top_categories.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-text-secondary mb-2">Top Spending</p>
                <div className="flex flex-col gap-1">
                  {preview.top_categories.map(([cat, amt]) => (
                    <div key={cat} className="flex items-center justify-between text-xs">
                      <span className="text-text-secondary">{cat}</span>
                      <span className="text-text-primary font-medium">{fmt(amt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Net worth */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20 mb-4">
              <span className="text-xs text-text-secondary">Net Worth</span>
              <span className="text-sm font-bold text-primary">{fmt(preview.net_worth)}</span>
            </div>

            {/* Over budget */}
            {preview.over_budget.length > 0 && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-danger flex items-center gap-1.5">
                  <AlertCircle size={12} /> Over-Budget This Month
                </p>
                {preview.over_budget.map(([cat, actual, budget]) => (
                  <div key={cat} className="flex justify-between text-xs text-text-secondary">
                    <span>{cat}</span>
                    <span className="text-danger">{fmt(actual)} / {fmt(budget)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Send now */}
        <Card title="Send Now">
          <div className="flex flex-col gap-4 mt-1">
            <p className="text-xs text-text-secondary">
              Manually send the weekly digest to any email address. The automatic digest goes out every Monday at 8 AM.
            </p>

            <Input
              label="Send to Email"
              value={sendEmail}
              onChange={e => setSendEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
            />

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                loading={sending}
                onClick={handleSend}
                disabled={!sendEmail}
                className="gap-2"
              >
                <Send size={14} />
                Send Digest
              </Button>
              {sendResult && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle size={12} /> Sent to {sendResult.to}
                </span>
              )}
            </div>

            {sendError && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-start gap-2">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                <div>
                  <p>{sendError}</p>
                  {sendError.includes('SMTP') && (
                    <p className="mt-1 text-text-secondary">
                      Set <code className="font-mono text-primary">SMTP_USER</code> and <code className="font-mono text-primary">SMTP_PASSWORD</code> in your backend <code className="font-mono text-primary">.env</code> file.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* SMTP setup info */}
        <div className="p-4 rounded-xl bg-surface-2 text-xs text-text-secondary flex flex-col gap-2">
          <span className="font-semibold text-text-primary">SMTP Setup</span>
          <p>Add these to your backend <code className="font-mono text-primary">.env</code>:</p>
          <pre className="font-mono text-[11px] bg-background p-2 rounded-lg overflow-x-auto text-text-primary">{`SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=Muni <your@gmail.com>`}</pre>
          <p>For Gmail, use an App Password (not your regular password) — generate one at myaccount.google.com → Security → App Passwords.</p>
        </div>
      </div>
    </AppLayout>
  )
}
