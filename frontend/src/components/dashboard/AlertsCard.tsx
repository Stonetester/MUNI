import Card from '@/components/ui/Card'
import type { AlertItem } from '@/lib/types'

function severityClasses(severity: AlertItem['severity']) {
  if (severity === 'critical') return 'bg-danger/20 text-danger border-danger/30'
  if (severity === 'warning') return 'bg-warning/20 text-warning border-warning/30'
  return 'bg-info/20 text-info border-info/30'
}

export default function AlertsCard({ alerts }: { alerts: AlertItem[] }) {
  return (
    <Card title="Alerts" className="h-full">
      {alerts.length === 0 ? (
        <p className="text-sm text-text-secondary">No alerts right now. You are on track this month.</p>
      ) : (
        <div className="space-y-2">
          {alerts.slice(0, 4).map((alert, idx) => (
            <div key={`${alert.type}-${idx}`} className={`border rounded-lg p-3 ${severityClasses(alert.severity)}`}>
              <p className="text-sm font-semibold">{alert.title}</p>
              <p className="text-xs opacity-90 mt-1">{alert.message}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
