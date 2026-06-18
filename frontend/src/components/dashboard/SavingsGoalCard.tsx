'use client'

import { useEffect, useState } from 'react'
import { Check, CheckCircle2, Lightbulb, PiggyBank, Pencil, TrendingUp, X } from 'lucide-react'
import Card from '@/components/ui/Card'
import { getSavingsGoals, updateFinancialProfile } from '@/lib/api'
import { SavingsGoalData, SavingsGoalPerson } from '@/lib/types'
import { formatCurrency, cn } from '@/lib/utils'

/**
 * Savings-goal tracker — shows, for the current month, whether Keaton, Katherine,
 * and the Joint household are hitting their planned monthly savings.
 *
 * "Saved" = net cash saved (income − spending) + retirement/savings contributions
 * (HYSA + IRA + 401k). The app suggests a goal from history; you can set your own.
 */
export default function SavingsGoalCard() {
  const [data, setData] = useState<SavingsGoalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [draftGoal, setDraftGoal] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    getSavingsGoals(true)
      .then((d) => { setData(d); setError('') })
      .catch(() => setError('Could not load savings goals.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return <Card title="Savings Goal"><p className="text-sm text-muted">Loading…</p></Card>
  }
  if (error || !data) {
    return <Card title="Savings Goal"><p className="text-sm text-danger">{error || 'No data'}</p></Card>
  }

  const me = data.people.find((p) => p.user_id === data.current_user_id)

  const startEdit = () => {
    setDraftGoal(String(Math.round(me?.goal ?? me?.suggested_goal ?? 0)))
    setEditing(true)
  }

  const saveGoal = async () => {
    const value = parseFloat(draftGoal)
    if (!Number.isFinite(value) || value < 0) return
    setSaving(true)
    try {
      await updateFinancialProfile({ monthly_savings_goal: value })
      setEditing(false)
      load()
    } catch {
      /* non-fatal */
    } finally {
      setSaving(false)
    }
  }

  const useSuggested = () => {
    if (me) setDraftGoal(String(Math.round(me.suggested_goal)))
  }

  const monthLabel = new Date(data.month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <Card
      title="Savings Goal"
      action={<span className="text-xs text-muted normal-case tracking-normal">{monthLabel}</span>}
      className="border-primary/30"
    >
      <div className="flex items-center gap-2 mb-4">
        <PiggyBank size={18} className="text-primary" />
        <p className="text-xs text-text-secondary">
          Net saved this month + retirement contributions (HYSA, IRA, 401k), vs each person&apos;s planned goal.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {data.people.map((p) => (
          <GoalRow key={p.user_id} name={p.name} total={p.total_saved} goal={p.goal}
            pct={p.pct_of_goal} onTrack={p.on_track} remaining={p.remaining}
            highlight={p.user_id === data.current_user_id} person={p} />
        ))}

        {/* Joint roll-up — visually distinct */}
        <GoalRow name="Joint household" total={data.joint.total_saved} goal={data.joint.goal}
          pct={data.joint.pct_of_goal} onTrack={data.joint.on_track} remaining={data.joint.remaining} joint />
      </div>

      {/* Suggested goal + set-your-own (current user) */}
      {me && (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
          <div className="flex items-start gap-2">
            <Lightbulb size={15} className="mt-0.5 shrink-0 text-amber-300" />
            <div className="flex-1">
              <p className="text-xs text-text-secondary">
                Based on your last few months, a good goal for <span className="font-medium text-amber-300">{me.name}</span> is{' '}
                <span className="font-semibold text-amber-300">{formatCurrency(me.suggested_goal)}/mo</span>.
                {me.using_suggestion
                  ? ' You haven’t set your own yet — this suggestion is in use.'
                  : ` You’ve set ${formatCurrency(me.goal)}/mo.`}
              </p>

              {editing ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="flex items-center rounded-lg border border-white/10 bg-background px-2">
                    <span className="text-xs text-muted">$</span>
                    <input
                      type="number" inputMode="decimal" step={25} value={draftGoal}
                      autoFocus
                      onChange={(e) => setDraftGoal(e.target.value)}
                      className="w-24 bg-transparent py-1.5 text-sm text-text-primary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-muted">/mo</span>
                  </div>
                  <button onClick={saveGoal} disabled={saving}
                    className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50">
                    <Check size={13} /> {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={useSuggested}
                    className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-text-secondary hover:text-amber-300">
                    Use suggested
                  </button>
                  <button onClick={() => setEditing(false)}
                    className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-muted hover:text-text-primary">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button onClick={startEdit}
                  className="mt-2 flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-400/20">
                  <Pencil size={12} /> {me.using_suggestion ? 'Set your own goal' : 'Edit goal'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

function GoalRow({
  name, total, goal, pct, onTrack, remaining, highlight, joint, person,
}: {
  name: string; total: number; goal: number; pct: number; onTrack: boolean
  remaining: number; highlight?: boolean; joint?: boolean; person?: SavingsGoalPerson
}) {
  const capped = Math.min(100, Math.max(0, pct))
  const barColor = onTrack ? 'bg-primary' : pct >= 60 ? 'bg-amber-400' : 'bg-danger'

  return (
    <div className={cn(
      'rounded-xl border p-3',
      joint ? 'border-info/30 bg-info/5' : highlight ? 'border-primary/30 bg-primary/5' : 'border-white/10 bg-surface-2',
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {joint && <TrendingUp size={14} className="shrink-0 text-info" />}
          <span className={cn('truncate text-sm font-semibold', joint ? 'text-info' : 'text-text-primary')}>
            {name}{highlight && !joint ? ' (you)' : ''}
          </span>
        </div>
        <span className={cn(
          'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
          onTrack ? 'bg-primary/15 text-primary' : 'bg-danger/15 text-danger',
        )}>
          {onTrack ? <><CheckCircle2 size={12} /> On track</> : <>Behind</>}
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between text-xs">
        <span className="text-text-secondary">
          <span className={cn('text-sm font-bold', onTrack ? 'text-primary' : 'text-text-primary')}>{formatCurrency(total)}</span>
          {' '}saved of {formatCurrency(goal)}
        </span>
        <span className="font-semibold text-text-secondary">{pct.toFixed(0)}%</span>
      </div>

      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${capped}%` }} />
      </div>

      <p className="mt-1.5 text-[11px] text-muted">
        {onTrack
          ? `Goal met — ${formatCurrency(total - goal)} ahead.`
          : `${formatCurrency(remaining)} to go this month.`}
        {person && person.contributions.total > 0 && (
          <> · Includes {formatCurrency(person.contributions.total)} in retirement/savings contributions.</>
        )}
        {joint && <> · Combined across both partners.</>}
      </p>
    </div>
  )
}
