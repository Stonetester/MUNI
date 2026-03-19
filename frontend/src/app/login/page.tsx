'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Layers } from 'lucide-react'
import { login, isAuthenticated } from '@/lib/auth'

const PROFILES = [
  { username: 'keaton', display: 'Keaton', initial: 'K', color: 'from-violet-500 to-indigo-600' },
  { username: 'katherine', display: 'Katherine', initial: 'K', color: 'from-pink-500 to-rose-600' },
]

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard')
  }, [router])

  const handleSelect = async (username: string) => {
    setLoading(username)
    try {
      await login(username)
      router.replace('/dashboard')
    } catch {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      <div className="flex flex-col items-center gap-10 relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
            <Layers size={26} className="text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-text-primary">Muni</h1>
            <p className="text-xs text-text-secondary italic">track dat shit</p>
          </div>
        </div>

        {/* Profile picker */}
        <div className="w-full flex flex-col gap-3">
          <p className="text-sm text-text-secondary text-center mb-1">Who are you?</p>
          {PROFILES.map((p) => (
            <button
              key={p.username}
              onClick={() => handleSelect(p.username)}
              disabled={!!loading}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-surface border border-[#2d3748] hover:border-primary/50 hover:bg-surface-2 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${p.color} flex items-center justify-center text-white font-bold text-lg shadow-md flex-shrink-0`}>
                {loading === p.username ? (
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                ) : (
                  p.initial
                )}
              </div>
              <div className="text-left">
                <p className="text-base font-semibold text-text-primary group-hover:text-primary transition-colors">
                  {p.display}
                </p>
                <p className="text-xs text-text-secondary">Personal finance profile</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
