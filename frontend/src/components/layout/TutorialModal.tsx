'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X, ChevronLeft, ChevronRight, LayoutDashboard, ArrowUpDown, Wallet, Target, TrendingUp, Calendar, FlaskConical, BellRing, Settings, HelpCircle, PlusCircle, UserCircle, FileText, RefreshCw, Home, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const steps = [
  {
    icon: HelpCircle,
    title: 'Welcome to FinanceTrack',
    color: 'text-primary',
    bg: 'bg-primary/10',
    content: (
      <div className="flex flex-col gap-3 text-sm text-text-secondary">
        <p>FinanceTrack is your personal finance command center. It tracks your spending, projects your future net worth, and helps you plan for big life events.</p>
        <p>This walkthrough covers every section of the app. Use the arrows to go step by step, or click any dot to jump to a section.</p>
        <div className="mt-2 p-3 rounded-xl bg-surface-2 text-xs flex flex-col gap-2">
          <span className="text-text-primary font-semibold">New here? Start with the setup guide:</span>
          <Link
            href="/getting-started"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium text-sm"
          >
            <PlusCircle size={14} /> Getting Started Guide →
          </Link>
          <span className="text-muted">Step-by-step: add accounts, upload paystubs for income, connect Google Sheets for expenses.</span>
        </div>
      </div>
    ),
  },
  {
    icon: LayoutDashboard,
    title: 'Dashboard',
    color: 'text-primary',
    bg: 'bg-primary/10',
    content: (
      <div className="flex flex-col gap-3 text-sm text-text-secondary">
        <p>The Dashboard is your daily snapshot. Open it to get a full picture at a glance.</p>
        <ul className="flex flex-col gap-2">
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[110px]">Net Worth card</span>Total assets minus liabilities, updated live.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[110px]">Quick Stats</span>This month's income, spending, and account totals.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[110px]">Accounts Grid</span>All accounts grouped by type with current balances.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[110px]">Spending Chart</span>Breakdown of spending by category this month.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[110px]">Forecast preview</span>Quick view of your projected net worth trajectory.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[110px]">Recent activity</span>Your latest transactions at the bottom.</li>
        </ul>
        <p className="text-xs text-muted">Tip: Check Dashboard weekly. If an alert or spending spike appears, drill into Budget or Transactions.</p>
      </div>
    ),
  },
  {
    icon: Users,
    title: 'Joint View',
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    content: (
      <div className="flex flex-col gap-3 text-sm text-text-secondary">
        <p>Joint View lets you see your finances together — both users' accounts, transactions, and net worth combined in one place.</p>
        <ul className="flex flex-col gap-2">
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[130px]">Toggle</span>Use the Solo / Joint button in the top bar to switch views. Solo shows only your data.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[130px]">Joint Dashboard</span>In joint mode the dashboard combines both users' net worth, accounts, and recent transactions.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[130px]">Color-coded</span>Transactions show who they belong to — each user gets a distinct color in joint transaction lists.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[130px]">Joint accounts</span>Mark an account as Joint when adding it. Both users can see its balance. Great for a shared HYSA or wedding savings account.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[130px]">Profile Switcher</span>Click your name in the top bar to instantly switch to your partner's view without logging out.</li>
        </ul>
        <div className="p-3 rounded-xl bg-surface-2 text-xs flex flex-col gap-1">
          <span className="text-text-primary font-semibold">How joint transactions work:</span>
          <span>All transactions from both users appear together, sorted by date, with an owner label. Filter by account to isolate one person's spending.</span>
        </div>
      </div>
    ),
  },
  {
    icon: ArrowUpDown,
    title: 'Transactions',
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
    content: (
      <div className="flex flex-col gap-3 text-sm text-text-secondary">
        <p>Every dollar in and out lives here. Income comes from paystubs; expenses come from Google Sheets sync.</p>
        <ul className="flex flex-col gap-2">
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[80px]">Income</span>Upload paystub PDFs — the app auto-creates income transactions when you save a stub.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[80px]">Expenses</span>Connect Google Sheets (Settings) to sync your monthly spending sheets automatically.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[80px]">CSV import</span>Upload a CSV from your bank if you need to backfill data manually.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[80px]">Add manual</span>Use the Add button to enter any one-off transaction by hand.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[80px]">Filter</span>Filter by date range, account, category, or keyword search.</li>
        </ul>
        <div className="p-3 rounded-xl bg-surface-2 text-xs">
          <span className="font-semibold text-text-primary">Income flow:</span> Paystubs page → upload PDF → review → Save. A "Salary" income transaction is created automatically on the pay date.
        </div>
      </div>
    ),
  },
  {
    icon: Wallet,
    title: 'Accounts',
    color: 'text-green-400',
    bg: 'bg-green-400/10',
    content: (
      <div className="flex flex-col gap-3 text-sm text-text-secondary">
        <p>Accounts tracks every asset and liability you own — checking, savings, investments, loans, cars, anything.</p>
        <ul className="flex flex-col gap-2">
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[130px]">Add an account</span>Use the Add button. Choose the type (checking, 401k, loan, etc.).</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[130px]">Balance snapshots</span>Click an account to add a balance update. These feed the forecast.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[130px]">Balance history</span>Each account shows a chart of balance over time.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[130px]">Forecast toggle</span>Enable/disable whether an account contributes to net worth forecasting.</li>
        </ul>
        <p className="text-xs text-muted">Tip: Update investment and loan balances at least quarterly so your forecast stays accurate.</p>
      </div>
    ),
  },
  {
    icon: Target,
    title: 'Budget',
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
    content: (
      <div className="flex flex-col gap-3 text-sm text-text-secondary">
        <p>Budget compares what you planned to spend against what you actually spent, by category.</p>
        <ul className="flex flex-col gap-2">
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[130px]">Set a budget</span>Click a category and enter a monthly budget amount.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[130px]">Track progress</span>See % used, amount remaining, and whether you're over.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[130px]">Recurring rules</span>The Recurring Rules section lists all automated income/expense rules.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[130px]">Over-budget alert</span>Any category that goes over budget automatically triggers an Alert.</li>
        </ul>
        <p className="text-xs text-muted">Tip: Set budget amounts for every category you care about — that's what makes alerts useful.</p>
      </div>
    ),
  },
  {
    icon: TrendingUp,
    title: 'Forecast',
    color: 'text-primary',
    bg: 'bg-primary/10',
    content: (
      <div className="flex flex-col gap-3 text-sm text-text-secondary">
        <p>Forecast projects your finances 60 months into the future using your real data.</p>
        <ul className="flex flex-col gap-2">
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">Net worth chart</span>Month-by-month projected net worth curve.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">Cash flow chart</span>Projected income vs expenses each month.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">Category breakdown</span>See which categories drive spending in the forecast.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">Scenario selector</span>Switch between your Baseline and any What-If scenarios.</li>
        </ul>
        <div className="p-3 rounded-xl bg-surface-2 text-xs">
          The engine uses your trailing spending averages + recurring rules + life events + 7% investment growth (configurable).
        </div>
      </div>
    ),
  },
  {
    icon: Calendar,
    title: 'Life Events',
    color: 'text-pink-400',
    bg: 'bg-pink-400/10',
    content: (
      <div className="flex flex-col gap-3 text-sm text-text-secondary">
        <p>Life Events models large known costs or income changes — weddings, moves, vacations, salary bumps — and injects them into the forecast.</p>
        <ul className="flex flex-col gap-2">
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[120px]">Add an event</span>Give it a name, type, start/end date, and total cost.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[120px]">Monthly breakdown</span>Spread the cost unevenly across months (big deposit months, quiet months).</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[120px]">Active toggle</span>Deactivate an event to remove it from the forecast without deleting it.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[120px]">Alert window</span>Upcoming event costs show up in Alerts as a heads-up.</li>
        </ul>
        <p className="text-xs text-muted">Example: A $62k wedding spread across 17 months with big deposit months entered manually.</p>
      </div>
    ),
  },
  {
    icon: FlaskConical,
    title: 'What-If Scenarios',
    color: 'text-violet-400',
    bg: 'bg-violet-400/10',
    content: (
      <div className="flex flex-col gap-3 text-sm text-text-secondary">
        <p>Scenarios let you ask "what if?" without touching your real baseline data.</p>
        <ul className="flex flex-col gap-2">
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[130px]">Clone baseline</span>Create a copy of your current plan as a starting point.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[130px]">Modify the clone</span>Change transactions, recurring rules, or life events inside the scenario.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[130px]">Compare</span>Switch the Forecast view to your scenario to see the impact on net worth.</li>
        </ul>
        <div className="p-3 rounded-xl bg-surface-2 text-xs flex flex-col gap-1">
          <span className="text-text-primary font-semibold">Example questions:</span>
          <span>• What if I cut dining out by 30%?</span>
          <span>• What if I increase student loan payment by $200/month?</span>
          <span>• What if the wedding shifts 3 months later?</span>
        </div>
      </div>
    ),
  },
  {
    icon: BellRing,
    title: 'Alerts',
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    content: (
      <div className="flex flex-col gap-3 text-sm text-text-secondary">
        <p>Alerts proactively flags problems so you don't have to go looking for them.</p>
        <ul className="flex flex-col gap-2">
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[120px]">Budget alerts</span>Fires when a category exceeds its budget for the selected month. Severity scales with how far over you are.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[120px]">Event alerts</span>Warns you when a life event payment is coming up within the lookahead window.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[120px]">Dashboard card</span>Top alerts also appear on the Dashboard so you see them immediately.</li>
        </ul>
        <p className="text-xs text-muted">No alerts? Either everything is fine, or you haven't set budget amounts yet — go to Budget to set them.</p>
      </div>
    ),
  },
  {
    icon: UserCircle,
    title: 'Financial Profile',
    color: 'text-primary',
    bg: 'bg-primary/10',
    content: (
      <div className="flex flex-col gap-3 text-sm text-text-secondary">
        <p>Financial Profile is your personal financial data hub — salary, loans, investments, and pay history all in one place.</p>
        <ul className="flex flex-col gap-2">
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">Income & Salary</span>Enter your annual salary, pay frequency, and 401k contribution details.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">HYSA & IRA</span>Set your APY and monthly contribution amounts for savings accounts.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">Student Loans</span>Track each loan individually — balance, rate, servicer, and min payment.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">Investment Holdings</span>Fund-level tracking: SWPPX, SWISX, 401k funds, with assumed return rates.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">Compensation History</span>Log raises, bonuses, spot awards, and stipends with dates and amounts.</li>
        </ul>
        <p className="text-xs text-muted">Each user has their own profile — both partners fill in their own data independently.</p>
      </div>
    ),
  },
  {
    icon: FileText,
    title: 'Paystubs',
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
    content: (
      <div className="flex flex-col gap-3 text-sm text-text-secondary">
        <p>Upload Paylocity paystub PDFs — the app extracts every field and <strong className="text-text-primary">automatically posts income transactions</strong> to your transaction history.</p>
        <ul className="flex flex-col gap-2">
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[120px]">Upload PDF</span>Drag and drop or click to browse. Supports Paylocity digital PDFs.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[120px]">Review & save</span>All extracted fields shown for review. Correct anything, then hit Save.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[120px]">Auto-income</span>Saving creates a Salary transaction (net pay) + Employer 401k transaction on the pay date.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[120px]">Bonus paystubs</span>The parser detects bonus/supplemental pay. Bonus stubs get a yellow badge and are excluded from avg-net stats.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[120px]">YTD tracking</span>Year-to-date totals (gross, net, 401k, taxes) captured from each stub.</li>
        </ul>
        <div className="p-3 rounded-xl bg-surface-2 text-xs">
          Fields extracted: gross pay, net pay, federal/MD/SS/Medicare taxes, 401k (employee + employer Safe Harbor), vision, GTL, and all YTD figures.
        </div>
      </div>
    ),
  },
  {
    icon: RefreshCw,
    title: 'Google Sheets Sync',
    color: 'text-green-400',
    bg: 'bg-green-400/10',
    content: (
      <div className="flex flex-col gap-3 text-sm text-text-secondary">
        <p>Connect your Google Sheet to import transactions automatically — no manual CSV uploads required.</p>
        <ul className="flex flex-col gap-2">
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[120px]">Auto-sync</span>When enabled, the app syncs your sheet every 30 minutes in the background.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[120px]">Sync Now</span>Hit the button in Settings to force an immediate sync without waiting.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[120px]">Deduplication</span>Transactions already imported are detected and skipped — safe to sync repeatedly.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[120px]">Sheet format</span>Each tab is a month. Columns: Date, Description/Expense, Amount. Positive amounts = expenses.</li>
        </ul>
        <div className="p-3 rounded-xl bg-surface-2 text-xs flex flex-col gap-1">
          <span className="text-text-primary font-semibold">To connect:</span>
          <span>1. Get your Sheet ID from the URL</span>
          <span>2. Share the sheet with the service account email from your credentials file</span>
          <span>3. Paste the ID into Settings → Google Sheets Sync → Save → Sync Now</span>
        </div>
      </div>
    ),
  },
  {
    icon: Home,
    title: 'Home Buying',
    color: 'text-teal-400',
    bg: 'bg-teal-400/10',
    content: (
      <div className="flex flex-col gap-3 text-sm text-text-secondary">
        <p>The Home Buying page is your dedicated house-purchase planning hub — built around Maryland's down payment assistance programs and your specific financial situation.</p>
        <ul className="flex flex-col gap-2">
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">DPA eligibility</span>Checks whether Keaton alone (income $130,935) qualifies for Maryland Mortgage Program — stacking up to $20,500 in assistance (MMP $6K + HAP $12K + Partner Match $2.5K).</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">Down pmt scenarios</span>Compare 5%, 10%, 15%, and 20% down across your target price range — shows P&I, PMI, and total monthly payment for each combo.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">Savings tracker</span>Tracks your current house savings vs the down payment target and projects your monthly savings rate.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">DTI calculator</span>Front-end (28%) and back-end (36%) debt-to-income checks against your estimated mortgage payment.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">Multi-profile goals</span>Save multiple named goal profiles (e.g., "Conservative", "Stretch") — switch which is active and compare any two side-by-side.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">Resources</span>Links to official sources: DHCD MMP, Frederick County HAP, MDHFA, CFPB mortgage tools, and more.</li>
        </ul>
        <div className="p-3 rounded-xl bg-surface-2 text-xs flex flex-col gap-1">
          <span className="text-text-primary font-semibold">Key insight:</span>
          <span>Keaton-only mortgage ($130,935 income) keeps you under the MMP income limit ($196,680 for 1–2 persons in Frederick County). Combined income ($207,935) would disqualify you from all three programs. The page highlights this and shows the $20,500 trade-off.</span>
        </div>
      </div>
    ),
  },
  {
    icon: Settings,
    title: 'Settings',
    color: 'text-text-secondary',
    bg: 'bg-surface-2',
    content: (
      <div className="flex flex-col gap-3 text-sm text-text-secondary">
        <p>Settings manages your profile cards and Google Sheets sync integration.</p>
        <ul className="flex flex-col gap-2">
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">Profile cards</span>Shows Keaton and Katherine — click to switch the active profile (no password needed).</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">Google Sheets Sync</span>Paste your Sheet ID, toggle auto-sync every 30 min, or hit Sync Now for immediate import.</li>
          <li className="flex gap-2"><span className="text-text-primary font-medium min-w-[140px]">Email digest</span>Configure weekly spending summary emails via Notifications settings.</li>
        </ul>
        <div className="p-3 rounded-xl bg-surface-2 text-xs flex flex-col gap-1">
          <span className="text-text-primary font-semibold">Google Sheets setup:</span>
          <span>1. Get your Sheet ID from the URL (between <span className="font-mono">/d/</span> and <span className="font-mono">/edit</span>)</span>
          <span>2. Share the sheet with the service account email from your credentials file</span>
          <span>3. Paste the ID → Save → Sync Now</span>
        </div>
        <p className="mt-1 text-center text-text-primary font-medium">You are all set — go explore!</p>
      </div>
    ),
  },
]

interface TutorialModalProps {
  onClose: () => void
}

export default function TutorialModal({ onClose }: TutorialModalProps) {
  const [step, setStep] = useState(0)
  const current = steps[step]
  const Icon = current.icon

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-surface border border-[#2d3748] rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#2d3748]">
          <div className="flex items-center gap-3">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', current.bg)}>
              <Icon size={18} className={current.color} />
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">Step {step + 1} of {steps.length}</p>
              <h2 className="text-base font-bold text-text-primary leading-tight">{current.title}</h2>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {current.content}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#2d3748] flex items-center justify-between gap-4">
          {/* Dot nav */}
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={cn(
                  'rounded-full transition-all',
                  i === step ? 'w-5 h-2 bg-primary' : 'w-2 h-2 bg-[#2d3748] hover:bg-primary/50'
                )}
              />
            ))}
          </div>

          {/* Prev / Next */}
          <div className="flex gap-2">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            {step < steps.length - 1 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="flex items-center gap-1 px-4 py-1.5 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
