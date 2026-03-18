'use client'

import { useState, useEffect } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { changePassword, getSyncConfig, updateSyncConfig, runSync } from '@/lib/api'
import { getToken } from '@/lib/auth'
import type { SyncConfig, SyncResult } from '@/lib/types'
import { Settings, Lock, User, Info, RefreshCw, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react'

function fmtDate(s?: string | null) {
  if (!s) return 'Never'
  return new Date(s).toLocaleString()
}

export default function SettingsPage() {
  const [username, setUsername] = useState('')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  // Google Sheets sync state
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null)
  const [sheetId, setSheetId] = useState('')
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [syncSaving, setSyncSaving] = useState(false)
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState('')
  const [syncSaved, setSyncSaved] = useState(false)

  useEffect(() => {
    const token = getToken()
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setUsername(payload.sub || '')
      } catch {
        // ignore
      }
    }

    getSyncConfig().then(cfg => {
      setSyncConfig(cfg)
      setSheetId(cfg.sheet_id || '')
      setSyncEnabled(cfg.is_enabled)
    }).catch(() => {
      // Sync not configured yet — fine
    })
  }, [])

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError('')
    setPwSuccess(false)
    if (newPw !== confirmPw) {
      setPwError('New passwords do not match.')
      return
    }
    if (newPw.length < 6) {
      setPwError('Password must be at least 6 characters.')
      return
    }
    setPwLoading(true)
    try {
      await changePassword(currentPw, newPw)
      setPwSuccess(true)
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setPwError(msg || 'Failed to change password.')
    } finally {
      setPwLoading(false)
    }
  }

  const handleSaveSyncConfig = async () => {
    setSyncSaving(true)
    setSyncError('')
    try {
      const cfg = await updateSyncConfig({ sheet_id: sheetId, is_enabled: syncEnabled })
      setSyncConfig(cfg)
      setSyncSaved(true)
      setTimeout(() => setSyncSaved(false), 2000)
    } catch {
      setSyncError('Failed to save sync settings.')
    } finally {
      setSyncSaving(false)
    }
  }

  const handleRunSync = async () => {
    setSyncRunning(true)
    setSyncError('')
    setSyncResult(null)
    try {
      const result = await runSync()
      setSyncResult(result)
      // Refresh config to get updated last_sync_at
      const cfg = await getSyncConfig()
      setSyncConfig(cfg)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSyncError(msg || 'Sync failed. Check that your Sheet ID is correct and the sheet is shared with the service account.')
    } finally {
      setSyncRunning(false)
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 max-w-lg">
        <div className="flex items-center gap-3">
          <Settings size={22} className="text-primary" />
          <h1 className="text-xl font-bold text-text-primary">Settings</h1>
        </div>

        {/* Account Info */}
        <Card title="Account">
          <div className="flex items-center gap-3 py-2">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <User size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">{username}</p>
              <p className="text-xs text-text-secondary">Personal account</p>
            </div>
          </div>
        </Card>

        {/* Google Sheets Sync */}
        <Card title="Google Sheets Sync">
          <div className="flex flex-col gap-4 mt-1">
            <p className="text-xs text-text-secondary">
              Connect a Google Sheet to automatically import transactions. The sheet is synced every 30 minutes when enabled, or you can trigger it manually below.
            </p>

            <Input
              label="Google Spreadsheet ID"
              value={sheetId}
              onChange={e => setSheetId(e.target.value)}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            />
            <p className="text-[11px] text-muted -mt-2">
              Find this in the URL: docs.google.com/spreadsheets/d/<strong className="text-text-secondary">SPREADSHEET_ID</strong>/edit
            </p>

            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className={`w-10 h-5 rounded-full transition-colors ${syncEnabled ? 'bg-primary' : 'bg-[#2d3748]'}`}
                onClick={() => setSyncEnabled(!syncEnabled)}
              >
                <div className={`w-4 h-4 rounded-full bg-white m-0.5 transition-transform ${syncEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
              <span className="text-sm text-text-secondary">Auto-sync every 30 minutes</span>
            </label>

            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" loading={syncSaving} onClick={handleSaveSyncConfig}>
                Save Settings
              </Button>
              {syncSaved && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={12} /> Saved</span>}
            </div>

            <div className="h-px bg-[#2d3748]" />

            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <p className="text-xs text-text-secondary">
                  Last sync: <span className="text-text-primary">{fmtDate(syncConfig?.last_sync_at)}</span>
                </p>
                {syncConfig?.last_sync_status && (
                  <p className="text-xs text-muted">
                    Status: <span className={syncConfig.last_sync_status === 'ok' ? 'text-green-400' : 'text-danger'}>{syncConfig.last_sync_status}</span>
                    {syncConfig.last_sync_message ? ` — ${syncConfig.last_sync_message}` : ''}
                  </p>
                )}
              </div>
              <Button variant="primary" size="sm" loading={syncRunning} onClick={handleRunSync} disabled={!sheetId}>
                <RefreshCw size={14} />
                Sync Now
              </Button>
            </div>

            {syncResult && (
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-sm flex flex-col gap-1">
                <div className="flex items-center gap-2 text-primary font-medium">
                  <CheckCircle size={14} /> Sync complete
                </div>
                <div className="text-xs text-text-secondary flex gap-4">
                  <span>Imported: <strong className="text-text-primary">{syncResult.imported}</strong></span>
                  <span>Skipped (dupes): <strong className="text-text-primary">{syncResult.skipped}</strong></span>
                  {syncResult.errors > 0 && <span>Errors: <strong className="text-danger">{syncResult.errors}</strong></span>}
                </div>
              </div>
            )}

            {syncError && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{syncError}</span>
              </div>
            )}

            <div className="p-3 rounded-xl bg-surface-2 text-xs text-text-secondary flex flex-col gap-1">
              <span className="font-semibold text-text-primary">Setup reminder</span>
              <span>Share your Google Sheet with the service account email from <code className="font-mono text-primary">backend/credentials/google-sheets-key.json</code> (the <code>client_email</code> field).</span>
              <a
                href="https://docs.google.com/spreadsheets"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline mt-1"
              >
                <ExternalLink size={11} /> Open Google Sheets
              </a>
            </div>
          </div>
        </Card>

        {/* Change Password */}
        <Card title="Change Password">
          <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
            {pwError && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
                {pwError}
              </div>
            )}
            {pwSuccess && (
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm">
                Password changed successfully.
              </div>
            )}
            <Input
              label="Current Password"
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              required
              placeholder="Enter current password"
            />
            <Input
              label="New Password"
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              required
              placeholder="At least 6 characters"
            />
            <Input
              label="Confirm New Password"
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
              placeholder="Repeat new password"
            />
            <Button type="submit" variant="primary" loading={pwLoading} className="w-fit">
              <Lock size={14} />
              Update Password
            </Button>
          </form>
        </Card>

        {/* App Info */}
        <Card title="About">
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <div className="flex items-center gap-2">
              <Info size={14} />
              <span>FinanceTrack v0.2 — Self-hosted personal finance tool</span>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
