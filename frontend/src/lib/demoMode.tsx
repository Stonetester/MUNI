'use client'
import { createContext, useContext, useState, useEffect } from 'react'

interface DemoModeContextValue {
  isDemoMode: boolean
  toggleDemoMode: () => void
}

const DemoModeContext = createContext<DemoModeContextValue>({
  isDemoMode: false,
  toggleDemoMode: () => {},
})

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false)

  useEffect(() => {
    setIsDemoMode(localStorage.getItem('demoMode') === 'true')
  }, [])

  const toggleDemoMode = () => {
    setIsDemoMode(prev => {
      const next = !prev
      localStorage.setItem('demoMode', String(next))
      return next
    })
  }

  return (
    <DemoModeContext.Provider value={{ isDemoMode, toggleDemoMode }}>
      {children}
    </DemoModeContext.Provider>
  )
}

export function useDemoMode() {
  return useContext(DemoModeContext)
}

export function isDemoModeActive(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('demoMode') === 'true'
}
