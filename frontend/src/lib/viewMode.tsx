'use client'
import { createContext, useContext, useState, useEffect } from 'react'

type ViewMode = 'solo' | 'joint'
const ViewModeContext = createContext<{ mode: ViewMode; toggle: () => void }>({ mode: 'solo', toggle: () => {} })

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ViewMode>('solo')
  useEffect(() => {
    const saved = localStorage.getItem('viewMode') as ViewMode | null
    if (saved) setMode(saved)
  }, [])
  const toggle = () => {
    setMode(m => {
      const next = m === 'solo' ? 'joint' : 'solo'
      localStorage.setItem('viewMode', next)
      return next
    })
  }
  return <ViewModeContext.Provider value={{ mode, toggle }}>{children}</ViewModeContext.Provider>
}

export function useViewMode() { return useContext(ViewModeContext) }
