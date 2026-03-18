'use client'

const TOKEN_KEY = 'finance_token'
const USER_KEY = 'finance_user'
const ALT_TOKEN_KEY = 'finance_token_alt'
const ALT_USER_KEY = 'finance_user_alt'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(USER_KEY)
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, token)
}

export function setUser(username: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(USER_KEY, username)
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

export function logout(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  window.location.href = '/login'
}

export function getAltToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ALT_TOKEN_KEY)
}

export function getAltUser(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ALT_USER_KEY)
}

export function storeAltProfile(token: string, username: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(ALT_TOKEN_KEY, token)
  localStorage.setItem(ALT_USER_KEY, username)
}

export function clearAltProfile(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ALT_TOKEN_KEY)
  localStorage.removeItem(ALT_USER_KEY)
}

export function switchProfiles(): void {
  if (typeof window === 'undefined') return
  const mainToken = localStorage.getItem(TOKEN_KEY)
  const mainUser = localStorage.getItem(USER_KEY)
  const altToken = localStorage.getItem(ALT_TOKEN_KEY)
  const altUser = localStorage.getItem(ALT_USER_KEY)
  if (!altToken || !altUser) return
  localStorage.setItem(TOKEN_KEY, altToken)
  localStorage.setItem(USER_KEY, altUser)
  localStorage.setItem(ALT_TOKEN_KEY, mainToken || '')
  localStorage.setItem(ALT_USER_KEY, mainUser || '')
  window.location.reload()
}

export async function login(username: string, password: string): Promise<void> {
  const formData = new URLSearchParams()
  formData.append('username', username)
  formData.append('password', password)

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Login failed' }))
    throw new Error(error.detail || 'Login failed')
  }

  const data = await response.json()
  setToken(data.access_token)
  setUser(username)
}
