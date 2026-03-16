'use client'

import { useState, useEffect } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { changePassword } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { Settings, Lock, User, Info } from 'lucide-react'

export default function SettingsPage() {
  const [username, setUsername] = useState('')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  useEffect(() => {
    // Decode username from JWT
    const token = getToken()
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setUsername(payload.sub || '')
      } catch {
        // ignore
      }
    }
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
              <span>FinanceTrack v0.1 — Self-hosted personal finance tool</span>
            </div>
            <p className="text-xs">Login: keaton / finance123 &nbsp;·&nbsp; katherine / finance123</p>
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
