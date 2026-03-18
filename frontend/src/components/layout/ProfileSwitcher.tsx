'use client'

import { useState, useRef, useEffect } from 'react'
import { ArrowLeftRight, UserPlus, X, Loader2 } from 'lucide-react'
import { getAltUser, getAltToken, storeAltProfile, switchProfiles, clearAltProfile } from '@/lib/auth'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function ProfileSwitcher({ currentUser }: { currentUser: string }) {
  const [altUser, setAltUser] = useState<string | null>(null)
  const [altToken, setAltToken] = useState<string | null>(null)
  const [showPanel, setShowPanel] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setAltUser(getAltUser())
    setAltToken(getAltToken())
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPanel(false)
        setError('')
      }
    }
    if (showPanel) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPanel])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (username === currentUser) {
      setError("That's the current user.")
      return
    }
    setLoading(true)
    setError('')
    try {
      const formData = new URLSearchParams()
      formData.append('username', username)
      formData.append('password', password)
      const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      })
      if (!res.ok) throw new Error('Invalid credentials')
      const data = await res.json()
      storeAltProfile(data.access_token, username)
      setAltUser(username)
      setAltToken(data.access_token)
      setShowPanel(false)
      setUsername('')
      setPassword('')
    } catch {
      setError('Invalid username or password.')
    } finally {
      setLoading(false)
    }
  }

  function handleRemove() {
    clearAltProfile()
    setAltUser(null)
    setAltToken(null)
    setShowPanel(false)
  }

  return (
    <div className="relative" ref={panelRef}>
      {altToken && altUser ? (
        <div className="flex items-center gap-1">
          <button
            onClick={() => switchProfiles()}
            title={`Switch to ${altUser}`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-text-secondary hover:text-primary hover:bg-surface-2 transition-colors border border-[#2d3748]"
          >
            <ArrowLeftRight size={12} />
            <span className="hidden sm:inline">{altUser}</span>
          </button>
          <button
            onClick={() => setShowPanel(!showPanel)}
            title="Profile options"
            className="w-6 h-6 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors text-xs"
          >
            ···
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowPanel(!showPanel)}
          title="Add another profile"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-text-secondary hover:text-primary hover:bg-surface-2 transition-colors border border-[#2d3748]"
        >
          <UserPlus size={12} />
          <span className="hidden sm:inline">Add profile</span>
        </button>
      )}

      {showPanel && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-surface border border-[#2d3748] rounded-xl shadow-xl z-50 p-4">
          {altToken && altUser ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-text-secondary">Saved profile</p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary">{altUser}</span>
                <button
                  onClick={handleRemove}
                  className="text-xs text-danger hover:underline"
                >
                  Remove
                </button>
              </div>
              <button
                onClick={() => switchProfiles()}
                className="w-full py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Switch to {altUser}
              </button>
            </div>
          ) : (
            <form onSubmit={handleAdd} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Add Profile</p>
                <button type="button" onClick={() => setShowPanel(false)} className="text-text-secondary hover:text-text-primary">
                  <X size={14} />
                </button>
              </div>
              <p className="text-xs text-text-secondary">Log in as another user to switch between profiles without logging out.</p>
              {error && <p className="text-xs text-danger">{error}</p>}
              <input
                className="w-full bg-surface-2 border border-[#2d3748] rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-primary"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
              <input
                type="password"
                className="w-full bg-surface-2 border border-[#2d3748] rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-primary"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                Save Profile
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
