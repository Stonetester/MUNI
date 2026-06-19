'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Calculator, Check, CheckCircle2, Info, Lightbulb, PiggyBank, Pencil, TrendingUp, X } from 'lucide-react'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import { getSavingsGoals, updateFinancialProfile } from '@/lib/api'
import { SavingsGoalData, SavingsGoalJoint, SavingsGoalPerson } from '@/lib/types'
import { formatCurrency, cn } from '@/lib/utils'

/**
 * Savings-goal tracker: current-month net cash saved plus profile contributions
 * compared to each person's effective monthly goal.
 */
export default function SavingsGoalCard() {
  const [data, setData] = useState<SavingsGoalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [draftGoal, setDraftGoal] = useState('')
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState<SavingsGoalDetail | null>(null)

  const load = () => {
    getSavingsGoals(true)
      .then((d) => { setData(d); setError('') })
      .catch(() => setError('Could not load savings goals.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return <Card title="Savings Goal"><p className="text-sm text-muted">Loading...</p></Card>
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
    <>
      <Card
        title="Savings Goal"
        action={<span className="text-xs text-muted normal-case tracking-normal">{monthLabel}</span>}
        className="border-primary/30"
      >
        <div className="mb-4 flex items-center gap-2">
          <PiggyBank size={18} className="text-primary" />
          <p className="text-xs text-text-secondary">
            Net saved this month + retirement contributions (HYSA, IRA, 401k), vs each person's planned goal.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {data.people.map((p) => (
            <GoalRow
              key={p.user_id}
              name={p.name}
              total={p.total_saved}
              goal={p.goal}
              pct={p.pct_of_goal}
              onTrack={p.on_track}
              remaining={p.remaining}
              highlight={p.user_id === data.current_user_id}
              person={p}
              onOpen={() => setDetail({ type: 'person', person: p })}
            />
          ))}

          <GoalRow
            name="Joint household"
            total={data.joint.total_saved}
            goal={data.joint.goal}
            pct={data.joint.pct_of_goal}
            onTrack={data.joint.on_track}
            remaining={data.joint.remaining}
            joint
            onOpen={() => setDetail({ type: 'joint', joint: data.joint, people: data.people })}
          />
        </div>

        {me && (
          <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
            <div className="flex items-start gap-2">
              <Lightbulb size={15} className="mt-0.5 shrink-0 text-amber-300" />
              <div className="flex-1">
                <p className="text-xs text-text-secondary">
                  Based on your last few months, a good goal for <span className="font-medium text-amber-300">{me.name}</span> is{' '}
                  <span className="font-semibold text-amber-300">{formatCurrency(me.suggested_goal)}/mo</span>.
                  {me.using_suggestion
                    ? ' You have not set your own yet, so this suggestion is in use.'
                    : ` You set ${formatCurrency(me.goal)}/mo.`}
                </p>

                {editing ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className="flex items-center rounded-lg border border-white/10 bg-background px-2">
                      <span className="text-xs text-muted">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step={25}
                        value={draftGoal}
                        autoFocus
                        onChange={(e) => setDraftGoal(e.target.value)}
                        className="w-24 bg-transparent py-1.5 text-sm text-text-primary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-xs text-muted">/mo</span>
                    </div>
                    <button
                      onClick={saveGoal}
                      disabled={saving}
                      className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                    >
                      <Check size={13} /> {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={useSuggested}
                      className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-text-secondary hover:text-amber-300"
                    >
                      Use suggested
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-muted hover:text-text-primary"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={startEdit}
                      className="flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-400/20"
                    >
                      <Pencil size={12} /> {me.using_suggestion ? 'Set your own goal' : 'Edit goal'}
                    </button>
                    <button
                      onClick={() => setDetail({ type: 'person', person: me })}
                      className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary"
                    >
                      <Calculator size={12} /> Show math
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      <SavingsGoalDetailModal detail={detail} onClose={() => setDetail(null)} />
    </>
  )
}

function GoalRow({
  name, total, goal, pct, onTrack, remaining, highlight, joint, person, onOpen,
}: {
  name: string
  total: number
  goal: number
  pct: number
  onTrack: boolean
  remaining: number
  highlight?: boolean
  joint?: boolean
  person?: SavingsGoalPerson
  onOpen: () => void
}) {
  const capped = Math.min(100, Math.max(0, pct))
  const barColor = onTrack ? 'bg-primary' : pct >= 60 ? 'bg-amber-400' : 'bg-danger'

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full rounded-xl border p-3 text-left transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/40',
        joint ? 'border-info/30 bg-info/5' : highlight ? 'border-primary/30 bg-primary/5' : 'border-white/10 bg-surface-2',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
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
          ? `Goal met - ${formatCurrency(total - goal)} ahead.`
          : `${formatCurrency(remaining)} to go this month.`}
        {person && person.contributions.total > 0 && (
          <> Includes {formatCurrency(person.contributions.total)} in retirement/savings contributions.</>
        )}
        {joint && <> Combined across both partners.</>}
      </p>
    </button>
  )
}

type SavingsGoalDetail =
  | { type: 'person'; person: SavingsGoalPerson }
  | { type: 'joint'; joint: SavingsGoalJoint; people: SavingsGoalPerson[] }

function SavingsGoalDetailModal({ detail, onClose }: { detail: SavingsGoalDetail | null; onClose: () => void }) {
  const title = detail?.type === 'joint' ? 'Joint Savings Goal' : `${detail?.person.name ?? ''} Savings Goal`

  return (
    <Modal isOpen={detail !== null} onClose={onClose} title={title} size="lg">
      {detail?.type === 'person' ? <PersonGoalDetail person={detail.person} /> : null}
      {detail?.type === 'joint' ? <JointGoalDetail joint={detail.joint} people={detail.people} /> : null}
    </Modal>
  )
}

function PersonGoalDetail({ person }: { person: SavingsGoalPerson }) {
  const contributionRows = [
    ['HYSA contribution', person.contributions.hysa],
    ['IRA contribution', person.contributions.ira],
    ['401(k) employee', person.contributions.k401_employee],
    ['401(k) employer match', person.contributions.k401_employer],
  ] as const

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="text-xs uppercase tracking-wider text-primary">Current month saved</p>
        <p className="mt-1 text-2xl font-bold text-text-primary">{formatCurrency(person.total_saved)}</p>
        <p className="mt-2 text-sm text-text-secondary">
          {formatCurrency(person.income)} income - {formatCurrency(person.spending)} spending = {formatCurrency(person.net_saved)} net cash saved.
          {' '}Then {formatCurrency(person.contributions.total)} automatic savings/retirement contributions are added.
        </p>
      </div>

      <DetailSection
        title="Why the goal is this number"
        icon={<Info size={15} />}
        rows={[
          ['Goal in use', formatCurrency(person.goal)],
          ['Source', person.using_suggestion ? 'App suggestion' : 'Your saved profile goal'],
          ['Suggested goal', `${formatCurrency(person.suggested_goal)}/mo`],
          ['Profile goal', person.user_goal === null ? 'Not set' : `${formatCurrency(person.user_goal)}/mo`],
        ]}
        note="The suggestion averages the last 6 completed months of positive total savings, stretches that by 10%, never goes below automatic contributions, then rounds to the nearest $25."
      />

      <DetailSection
        title="Saved calculation"
        icon={<Calculator size={15} />}
        rows={[
          ['Income counted this month', formatCurrency(person.income)],
          ['Spending counted this month', `-${formatCurrency(person.spending)}`],
          ['Net cash saved', formatCurrency(person.net_saved)],
          ['Automatic contributions', formatCurrency(person.contributions.total)],
          ['Total saved against goal', formatCurrency(person.total_saved)],
        ]}
        note="Savings and transfer categories are excluded from income and spending, so moving cash into savings does not count as spending."
      />

      <DetailSection
        title="Contribution breakdown"
        rows={contributionRows.map(([label, value]) => [label, formatCurrency(value)])}
      />

      <div className="rounded-xl border border-white/10 bg-surface-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text-primary">{person.pct_of_goal.toFixed(1)}% of goal</p>
            <p className="text-xs text-text-secondary">
              {person.on_track ? `${formatCurrency(person.total_saved - person.goal)} ahead this month.` : `${formatCurrency(person.remaining)} left this month.`}
            </p>
          </div>
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', person.on_track ? 'bg-primary/15 text-primary' : 'bg-danger/15 text-danger')}>
            {person.on_track ? 'On track' : 'Behind'}
          </span>
        </div>
      </div>
    </div>
  )
}

function JointGoalDetail({ joint, people }: { joint: SavingsGoalJoint; people: SavingsGoalPerson[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-info/30 bg-info/5 p-4">
        <p className="text-xs uppercase tracking-wider text-info">Household saved</p>
        <p className="mt-1 text-2xl font-bold text-text-primary">{formatCurrency(joint.total_saved)}</p>
        <p className="mt-2 text-sm text-text-secondary">
          {formatCurrency(joint.net_saved)} joint net cash saved + {formatCurrency(joint.contributions_total)} combined automatic contributions.
        </p>
      </div>

      <DetailSection
        title="Joint goal source"
        icon={<TrendingUp size={15} />}
        rows={[
          ['Joint goal in use', `${formatCurrency(joint.goal)}/mo`],
          ['Joint suggested goal', `${formatCurrency(joint.suggested_goal)}/mo`],
          ['People included', people.map((p) => p.name).join(', ')],
        ]}
        note="The household goal is the sum of each person's effective monthly goal, so one person's custom profile goal and another person's suggestion can both be represented."
      />

      <DetailSection
        title="Person-level inputs"
        rows={people.map((p) => [
          p.name,
          `${formatCurrency(p.total_saved)} saved of ${formatCurrency(p.goal)} goal`,
        ])}
      />

      <div className="rounded-xl border border-white/10 bg-surface-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text-primary">{joint.pct_of_goal.toFixed(1)}% of goal</p>
            <p className="text-xs text-text-secondary">
              {joint.on_track ? `${formatCurrency(joint.total_saved - joint.goal)} ahead this month.` : `${formatCurrency(joint.remaining)} left this month.`}
            </p>
          </div>
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', joint.on_track ? 'bg-primary/15 text-primary' : 'bg-danger/15 text-danger')}>
            {joint.on_track ? 'On track' : 'Behind'}
          </span>
        </div>
      </div>
    </div>
  )
}

function DetailSection({
  title, rows, note, icon,
}: {
  title: string
  rows: Array<readonly [string, string]>
  note?: string
  icon?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface-2 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
        {icon && <span className="text-primary">{icon}</span>}
        <span>{title}</span>
      </div>
      <div className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3 border-b border-white/5 pb-2 last:border-0 last:pb-0">
            <span className="text-xs text-text-secondary">{label}</span>
            <span className="text-right text-sm font-medium text-text-primary">{value}</span>
          </div>
        ))}
      </div>
      {note && <p className="mt-3 text-xs leading-5 text-muted">{note}</p>}
    </div>
  )
}
