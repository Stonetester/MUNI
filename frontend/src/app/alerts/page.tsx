'use client'

import { useEffect, useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { getAlerts } from '@/lib/api'
import type { AlertItem } from '@/lib/types'

function badgeClass(severity: AlertItem['severity']) {
  if (severity === 'critical') return 'bg-danger/20 text-danger border-danger/30'
  if (severity === 'warning') return 'bg-warning/20 text-warning border-warning/30'
  return 'bg-info/20 text-info border-info/30'
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const data = await getAlerts()
        setAlerts(data)
      } catch {
        setError('Failed to load alerts.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <AppLayout>
      {loading ? (
        <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>
      ) : error ? (
        <p className="text-danger">{error}</p>
      ) : (
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <Card>
              <p className="text-text-secondary">No active alerts for the selected period.</p>
            </Card>
          ) : (
            alerts.map((alert, idx) => (
              <Card key={`${alert.type}-${idx}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-text-primary">{alert.title}</h3>
                    <p className="text-sm text-text-secondary mt-1">{alert.message}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded border capitalize ${badgeClass(alert.severity)}`}>
                    {alert.severity}
                  </span>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </AppLayout>
  )
}
