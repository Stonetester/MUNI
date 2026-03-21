'use client'

import { useState } from 'react'
import { ArrowLeftRight, Loader2 } from 'lucide-react'
import { storeAltProfile, switchProfiles } from '@/lib/auth'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const KNOWN_USERS = ['keaton', 'katherine']

export default function ProfileSwitcher({ currentUser }: { currentUser: string }) {
  const [loading, setLoading] = useState(false)

  const otherUser = KNOWN_USERS.find((u) => u.toLowerCase() !== currentUser.toLowerCase()) ?? 'katherine'

  async function handleSwitch() {
    setLoading(true)
    try {
      const res = await fetch(`${BASE_URL}/api/v1/auth/switch/${otherUser}`, { method: 'POST' })
      if (!res.ok) return
      const data = await res.json()
      storeAltProfile(data.access_token, otherUser)
      switchProfiles()
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleSwitch}
      disabled={loading}
      title={`Switch to ${otherUser}`}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-text-secondary hover:text-primary hover:bg-surface-2 transition-colors border border-white/10 disabled:opacity-50"
    >
      {loading ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <ArrowLeftRight size={12} />
      )}
      <span className="hidden sm:inline capitalize">{otherUser}</span>
    </button>
  )
}
