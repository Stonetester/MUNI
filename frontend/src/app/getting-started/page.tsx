'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  Circle,
  Wallet,
  ArrowUpDown,
  RefreshCw,
  Target,
  ChevronDown,
  ChevronUp,
  Upload,
  PlusCircle,
  BarChart2,
  Calendar,
  Info,
  UserCircle,
  FileText,
  Sheet,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Section {
  id: string
  icon: React.ElementType
  iconColor: string
  iconBg: string
  title: string
  subtitle: string
  steps: Step[]
}

interface Step {
  title: string
  body: React.ReactNode
}

const CSV_COLUMNS = [
  { col: 'Date', desc: 'Transaction date', example: '2024-07-15 or 7/15/2024', required: true },
  { col: 'Description / Merchant', desc: 'Who you paid', example: 'Target, Amazon, etc.', required: true },
  { col: 'Amount', desc: 'Positive = income, Negative = expense', example: '-42.50', required: true },
  { col: 'Category', desc: 'Expense category (optional — app will default to Discretionary)', example: 'Groceries', required: false },
  { col: 'Account', desc: 'Which account (optional)', example: 'Chase Checking', required: false },
]

const sections: Section[] = [
  {
    id: 'accounts',
    icon: Wallet,
    iconColor: 'text-green-400',
    iconBg: 'bg-green-400/10',
    title: 'Step 1 — Add Your Accounts',
    subtitle: 'Start here. Every transaction and forecast depends on your accounts being set up first.',
    steps: [
      {
        title: 'Go to Accounts',
        body: (
          <p className="text-sm text-text-secondary">
            Click <span className="text-text-primary font-medium">Accounts</span> in the left sidebar. You'll see an empty accounts page.
          </p>
        ),
      },
      {
        title: 'Add each account',
        body: (
          <div className="flex flex-col gap-3 text-sm text-text-secondary">
            <p>Click <span className="text-text-primary font-medium">+ Add Account</span>. For each account, fill in:</p>
            <ul className="flex flex-col gap-1.5 ml-3">
              <li><span className="text-text-primary font-medium">Name</span> — e.g. "Chase Checking", "Everbank HYSA"</li>
              <li><span className="text-text-primary font-medium">Type</span> — checking, savings, hysa, 401k, ira, student_loan, other</li>
              <li><span className="text-text-primary font-medium">Institution</span> — Chase, Fidelity, etc. (optional)</li>
              <li><span className="text-text-primary font-medium">Current Balance</span> — enter the balance as of today; use a negative number for loans (e.g. <span className="font-mono">-24000</span> for student loans)</li>
              <li><span className="text-text-primary font-medium">Forecast enabled</span> — check this for accounts that should affect your net worth forecast</li>
            </ul>
          </div>
        ),
      },
      {
        title: 'Recommended account types to add',
        body: (
          <div className="flex flex-col gap-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'Checking account', type: 'checking', note: 'Where transactions flow' },
                { name: 'HYSA / Savings', type: 'hysa / savings', note: 'Emergency fund, wedding fund' },
                { name: '401(k)', type: '401k', note: 'Enter current balance' },
                { name: 'IRA', type: 'ira', note: 'Enter current balance' },
                { name: 'Student Loans', type: 'student_loan', note: 'Negative balance (debt)' },
                { name: 'Car / Assets', type: 'other', note: 'Estimated value, forecast off' },
              ].map((a) => (
                <div key={a.name} className="p-2.5 rounded-xl bg-surface-2 flex flex-col gap-0.5">
                  <span className="text-text-primary text-xs font-medium">{a.name}</span>
                  <span className="text-muted text-xs font-mono">{a.type}</span>
                  <span className="text-text-secondary text-xs">{a.note}</span>
                </div>
              ))}
            </div>
          </div>
        ),
      },
      {
        title: 'Add balance snapshots for investment & loan accounts',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <p>
              For accounts that change over time without transactions (401k, IRA, HYSA, student loans), use{' '}
              <span className="text-text-primary font-medium">balance snapshots</span> instead of CSV import.
            </p>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex gap-2">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>
                Click the account name, then <strong>+ Add Snapshot</strong>. Enter the date and the balance on that date.
                Do this whenever you check your balance — monthly is ideal.
              </span>
            </div>
          </div>
        ),
      },
    ],
  },
  {
    id: 'transactions',
    icon: ArrowUpDown,
    iconColor: 'text-yellow-400',
    iconBg: 'bg-yellow-400/10',
    title: 'Step 2 — Import Your Transactions',
    subtitle: 'Use CSV/XLSX import for checking account transactions. This is the fastest way to get real data in.',
    steps: [
      {
        title: 'Export your bank transactions as CSV',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <p>Most banks let you download a CSV of recent transactions from their website or app. Common export paths:</p>
            <ul className="flex flex-col gap-1 ml-3 text-xs">
              <li><span className="text-text-primary font-medium">Chase:</span> Account → Download Account Activity → CSV</li>
              <li><span className="text-text-primary font-medium">Bank of America:</span> Account Activity → Download → CSV</li>
              <li><span className="text-text-primary font-medium">Capital One:</span> Account → Download Transactions → CSV</li>
              <li><span className="text-text-primary font-medium">Any bank:</span> Look for "Export", "Download", or "Statement" options</li>
            </ul>
          </div>
        ),
      },
      {
        title: 'What columns does the import expect?',
        body: (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-text-secondary">The importer auto-detects common column names. Your CSV should have:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-separate border-spacing-y-1">
                <thead>
                  <tr className="text-muted text-left">
                    <th className="pb-1 pr-3">Column</th>
                    <th className="pb-1 pr-3">What it maps to</th>
                    <th className="pb-1 pr-3">Example</th>
                    <th className="pb-1">Required?</th>
                  </tr>
                </thead>
                <tbody>
                  {CSV_COLUMNS.map((c) => (
                    <tr key={c.col} className="bg-surface-2 rounded-lg">
                      <td className="px-2 py-1.5 rounded-l-lg font-mono text-text-primary">{c.col}</td>
                      <td className="px-2 py-1.5 text-text-secondary">{c.desc}</td>
                      <td className="px-2 py-1.5 text-muted">{c.example}</td>
                      <td className="px-2 py-1.5 rounded-r-lg">
                        {c.required
                          ? <span className="text-green-400 font-medium">Yes</span>
                          : <span className="text-muted">Optional</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted text-xs">If your bank uses different column names, you can rename them in a spreadsheet before importing.</p>
          </div>
        ),
      },
      {
        title: 'Run the import',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <ol className="flex flex-col gap-2 ml-3 list-decimal list-outside">
              <li>Go to <span className="text-text-primary font-medium">Transactions</span> in the sidebar</li>
              <li>Click <span className="text-text-primary font-medium">Import</span> (top right)</li>
              <li>Upload your CSV or XLSX file</li>
              <li>Review the column mapping preview and confirm</li>
              <li>Transactions are imported — duplicates are automatically skipped</li>
            </ol>
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex gap-2">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>
                <strong>From the spending spreadsheet?</strong> Export each monthly sheet as a separate CSV and import them one at a time.
                Make sure the <em>Type</em> column maps to <em>Category</em> so spending is correctly categorized.
              </span>
            </div>
          </div>
        ),
      },
      {
        title: 'Fix categories after import',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <p>
              Any transaction where the category couldn't be matched lands in{' '}
              <span className="text-text-primary font-medium">Discretionary</span>. After importing:
            </p>
            <ol className="flex flex-col gap-1.5 ml-3 list-decimal list-outside">
              <li>Go to Transactions and filter by category: Discretionary</li>
              <li>Click each row to edit and set the correct category</li>
              <li>Commonly miscategorized: mixed-case names like "gas" vs "Gas"</li>
            </ol>
          </div>
        ),
      },
      {
        title: 'Or add transactions manually',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <p>For one-off entries or corrections, use <span className="text-text-primary font-medium">+ Add Transaction</span> in the Transactions page.</p>
            <p>Fill in: date, merchant/description, amount, category, account, and payment method.</p>
            <p className="text-xs text-muted">Manual entry is also the best approach for loan payments, savings transfers, and any transaction that doesn't come from a bank export.</p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'balances',
    icon: BarChart2,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-400/10',
    title: 'Step 3 — Enter Account Balances (Investments & Loans)',
    subtitle: "Don't try to import these from a spreadsheet — manual balance snapshots are the right approach for savings, 401k, IRA, and student loans.",
    steps: [
      {
        title: 'Why manual snapshots instead of CSV import?',
        body: (
          <div className="flex flex-col gap-3 text-sm text-text-secondary">
            <p>
              Accounts like your 401k, HYSA, and student loans change due to contributions, interest, market gains, and payments —
              not individual purchases. CSV import is designed for transaction feeds, not balance history.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-green-400/10 border border-green-400/20">
                <p className="text-green-400 font-semibold mb-1">Use CSV import for:</p>
                <ul className="text-text-secondary flex flex-col gap-1">
                  <li>✓ Checking account transactions</li>
                  <li>✓ Credit card purchases</li>
                  <li>✓ Any itemized transaction feed</li>
                </ul>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-400/10 border border-blue-400/20">
                <p className="text-blue-400 font-semibold mb-1">Use balance snapshots for:</p>
                <ul className="text-text-secondary flex flex-col gap-1">
                  <li>✓ HYSA / savings accounts</li>
                  <li>✓ 401k, IRA balances</li>
                  <li>✓ Student loan balance</li>
                </ul>
              </div>
            </div>
          </div>
        ),
      },
      {
        title: 'How to add a balance snapshot',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <ol className="flex flex-col gap-2 ml-3 list-decimal list-outside">
              <li>Go to <span className="text-text-primary font-medium">Accounts</span></li>
              <li>Click the account you want to update (e.g. "Everbank HYSA")</li>
              <li>Click <span className="text-text-primary font-medium">+ Add Snapshot</span></li>
              <li>Enter the <span className="text-text-primary font-medium">Date</span> and the <span className="text-text-primary font-medium">Balance</span> on that date</li>
              <li>For loans, enter as a negative number (e.g. <span className="font-mono text-xs">-23450.00</span>)</li>
            </ol>
            <p className="text-xs text-muted mt-1">You can add historical snapshots too — entering past months builds a balance history chart on the account.</p>
          </div>
        ),
      },
      {
        title: 'Suggested update frequency',
        body: (
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex flex-col gap-1.5">
              {[
                { acct: 'HYSA / Savings', freq: 'Monthly', note: 'Check after each transfer' },
                { acct: '401k / IRA', freq: 'Quarterly', note: 'After each statement' },
                { acct: 'Student Loans', freq: 'Monthly', note: 'After payment posts' },
                { acct: 'Checking', freq: 'Via transaction import', note: 'Balance updates automatically' },
              ].map((r) => (
                <div key={r.acct} className="flex items-center gap-3 p-2 rounded-lg bg-surface-2 text-xs">
                  <span className="text-text-primary font-medium w-32 shrink-0">{r.acct}</span>
                  <span className="text-primary font-medium w-24 shrink-0">{r.freq}</span>
                  <span className="text-text-secondary">{r.note}</span>
                </div>
              ))}
            </div>
          </div>
        ),
      },
    ],
  },
  {
    id: 'recurring',
    icon: RefreshCw,
    iconColor: 'text-violet-400',
    iconBg: 'bg-violet-400/10',
    title: 'Step 4 — Set Up Recurring Rules',
    subtitle: 'Tell the forecast engine about your regular income and fixed expenses so projections are accurate.',
    steps: [
      {
        title: 'What are recurring rules?',
        body: (
          <p className="text-sm text-text-secondary">
            Recurring rules are standing income or expense entries that the forecast engine uses to project future cash flow.
            They don't create actual transactions — they're projections. Examples: your paycheck, rent, subscriptions, loan payments.
          </p>
        ),
      },
      {
        title: 'Add a recurring rule',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <ol className="flex flex-col gap-2 ml-3 list-decimal list-outside">
              <li>Go to <span className="text-text-primary font-medium">Budget</span> → <span className="text-text-primary font-medium">Recurring Rules</span> tab</li>
              <li>Click <span className="text-text-primary font-medium">+ Add Rule</span></li>
              <li>Fill in: name, amount (positive = income, negative = expense), frequency, account, category</li>
              <li>Set a start date — rules apply from that date forward in the forecast</li>
            </ol>
          </div>
        ),
      },
      {
        title: 'Rules to add first',
        body: (
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex flex-col gap-1.5">
              {[
                { name: 'Paycheck', amount: '+$X,XXX', freq: 'Semi-monthly or biweekly', cat: 'Salary' },
                { name: 'Rent / Mortgage', amount: '-$X,XXX', freq: 'Monthly', cat: 'Housing' },
                { name: 'Student Loan Payment', amount: '-$XXX', freq: 'Monthly', cat: 'Student Loans' },
                { name: 'Utilities', amount: '-$XXX', freq: 'Monthly', cat: 'Electricity / Internet' },
                { name: 'Subscriptions', amount: '-$XX', freq: 'Monthly (one per service)', cat: 'Subscriptions' },
                { name: '401k Contribution', amount: '+$XXX', freq: 'Per paycheck', cat: 'Retirement' },
              ].map((r) => (
                <div key={r.name} className="flex items-center gap-3 p-2 rounded-lg bg-surface-2 text-xs">
                  <span className="text-text-primary font-medium w-40 shrink-0">{r.name}</span>
                  <span className="text-primary font-mono w-20 shrink-0">{r.amount}</span>
                  <span className="text-muted">{r.freq} · {r.cat}</span>
                </div>
              ))}
            </div>
          </div>
        ),
      },
    ],
  },
  {
    id: 'budget',
    icon: Target,
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-400/10',
    title: 'Step 5 — Set Budget Amounts',
    subtitle: 'Once transactions are in, set monthly spending targets per category to unlock alerts and budget tracking.',
    steps: [
      {
        title: 'Set category budgets',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <ol className="flex flex-col gap-1.5 ml-3 list-decimal list-outside">
              <li>Go to <span className="text-text-primary font-medium">Budget</span></li>
              <li>Find each category in the list</li>
              <li>Click the budget amount field and enter your monthly target</li>
              <li>The progress bar fills as you spend — red = over budget</li>
            </ol>
          </div>
        ),
      },
      {
        title: 'Start with your top categories',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <p>You don't need to budget every category. Focus on the ones you actually want to control:</p>
            <div className="flex flex-wrap gap-2 text-xs">
              {['Eating Out', 'Groceries', 'Gas', 'Going Out', 'Shopping', 'Subscriptions', 'Entertainment'].map((c) => (
                <span key={c} className="px-2.5 py-1 rounded-full bg-surface-2 text-text-secondary">{c}</span>
              ))}
            </div>
          </div>
        ),
      },
      {
        title: 'Budget alerts activate automatically',
        body: (
          <p className="text-sm text-text-secondary">
            Once a category has a budget set, the Alerts page will fire whenever you exceed it for the selected month.
            Check the Alerts page weekly to catch overruns early.
          </p>
        ),
      },
    ],
  },
  {
    id: 'events',
    icon: Calendar,
    iconColor: 'text-pink-400',
    iconBg: 'bg-pink-400/10',
    title: 'Step 6 — Add Life Events (Optional)',
    subtitle: 'For large known costs like a wedding, vacation, or move — add them as Life Events so they appear in your forecast.',
    steps: [
      {
        title: 'Add a life event',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <ol className="flex flex-col gap-2 ml-3 list-decimal list-outside">
              <li>Go to <span className="text-text-primary font-medium">Life Events</span></li>
              <li>Click <span className="text-text-primary font-medium">+ Add Event</span></li>
              <li>Enter: name, type (wedding, vacation, move, etc.), start date, end date, total cost</li>
              <li>Optionally add a monthly breakdown to spread costs unevenly across months</li>
            </ol>
          </div>
        ),
      },
      {
        title: 'Example — Wedding',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <ul className="flex flex-col gap-1.5 ml-3">
              <li><span className="text-text-primary font-medium">Name:</span> Wedding</li>
              <li><span className="text-text-primary font-medium">Type:</span> wedding</li>
              <li><span className="text-text-primary font-medium">Start:</span> First deposit month</li>
              <li><span className="text-text-primary font-medium">End:</span> Wedding month</li>
              <li><span className="text-text-primary font-medium">Total cost:</span> Your full budget</li>
              <li><span className="text-text-primary font-medium">Monthly breakdown:</span> Large amounts for deposit months, smaller for regular months</li>
            </ul>
            <p className="text-xs text-muted">The forecast will show these costs hitting your cash flow in the right months.</p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'google-sheets',
    icon: Sheet,
    iconColor: 'text-green-400',
    iconBg: 'bg-green-400/10',
    title: 'Step 7 — Connect Google Sheets (Optional)',
    subtitle: 'Skip manual CSV exports. Connect your monthly spending sheet and let the app auto-import transactions.',
    steps: [
      {
        title: 'What you need',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <ul className="flex flex-col gap-1.5 ml-3">
              <li>A Google Sheets service account credentials file at <span className="font-mono text-xs text-primary">backend/credentials/google-sheets-key.json</span></li>
              <li>Your spreadsheet shared with the service account email (the <span className="font-mono text-xs">client_email</span> field in the JSON)</li>
              <li>Your Google Spreadsheet ID — found in the sheet URL between <span className="font-mono text-xs">/d/</span> and <span className="font-mono text-xs">/edit</span></li>
            </ul>
          </div>
        ),
      },
      {
        title: 'Sheet format expected',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <p>Each tab should represent a month (e.g. <span className="font-mono text-xs">Jan 2025</span>, <span className="font-mono text-xs">Feb 2025</span>). Rows should have:</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { col: 'Date', ex: '1/15/2025', req: true },
                { col: 'Description / Expense', ex: 'Target', req: true },
                { col: 'Amount', ex: '42.50', req: true },
              ].map(c => (
                <div key={c.col} className="p-2 rounded-lg bg-surface-2">
                  <p className="font-mono text-primary">{c.col}</p>
                  <p className="text-muted">{c.ex}</p>
                  {c.req && <p className="text-green-400">Required</p>}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted">Positive amounts = expenses (they are negated on import). Blank rows and header rows are skipped automatically.</p>
          </div>
        ),
      },
      {
        title: 'Connect in Settings',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <ol className="flex flex-col gap-2 ml-3 list-decimal list-outside">
              <li>Go to <span className="text-text-primary font-medium">Settings</span> → <span className="text-text-primary font-medium">Google Sheets Sync</span></li>
              <li>Paste your Spreadsheet ID into the field</li>
              <li>Toggle auto-sync on if you want background sync every 30 minutes</li>
              <li>Click <span className="text-text-primary font-medium">Save Settings</span></li>
              <li>Click <span className="text-text-primary font-medium">Sync Now</span> to run the first import immediately</li>
            </ol>
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex gap-2">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>
                Deduplication is automatic — re-running sync will not create duplicate transactions. Only new rows are imported.
              </span>
            </div>
          </div>
        ),
      },
    ],
  },
  {
    id: 'financial-profile',
    icon: UserCircle,
    iconColor: 'text-primary',
    iconBg: 'bg-primary/10',
    title: 'Step 8 — Fill Out Your Financial Profile',
    subtitle: 'Track salary, 401k details, HYSA contributions, student loans, investment holdings, and compensation history.',
    steps: [
      {
        title: 'Go to My Profile',
        body: (
          <p className="text-sm text-text-secondary">
            Click <span className="text-text-primary font-medium">My Profile</span> in the sidebar. Each user has their own profile — fill yours in, then switch users and fill in your partner&apos;s.
          </p>
        ),
      },
      {
        title: 'Enter salary and pay info',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <p>In the <span className="text-text-primary font-medium">Income & Salary</span> section, enter:</p>
            <ul className="flex flex-col gap-1 ml-3">
              <li>Annual salary</li>
              <li>Pay frequency (semi-monthly = 24 checks/yr, biweekly = 26)</li>
              <li>Net pay per paycheck (after taxes and deductions)</li>
              <li>Employer 401k match % (e.g. 6 for 6% Safe Harbor)</li>
            </ul>
          </div>
        ),
      },
      {
        title: 'Add student loans',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <p>In the <span className="text-text-primary font-medium">Student Loans</span> section, add each loan individually:</p>
            <ul className="flex flex-col gap-1 ml-3">
              <li>Loan name and servicer</li>
              <li>Original balance and current remaining balance</li>
              <li>Interest rate and minimum monthly payment</li>
            </ul>
            <p className="text-xs text-muted">Total remaining across all active loans is shown at the top of the section.</p>
          </div>
        ),
      },
      {
        title: 'Add investment holdings',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <p>In the <span className="text-text-primary font-medium">Investment Holdings</span> section, add each fund or account holding:</p>
            <ul className="flex flex-col gap-1 ml-3">
              <li>Ticker symbol (e.g. SWPPX) and fund name</li>
              <li>Current value and monthly contribution</li>
              <li>Assumed annual return rate (default 7%)</li>
              <li>Select the parent account (401k, IRA, brokerage)</li>
            </ul>
          </div>
        ),
      },
    ],
  },
  {
    id: 'paystubs',
    icon: FileText,
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-400/10',
    title: 'Step 9 — Upload Paystubs (Optional)',
    subtitle: 'Upload Paylocity PDF paystubs to automatically extract all fields — gross pay, taxes, 401k, deductions, and YTD totals.',
    steps: [
      {
        title: 'Go to Paystubs',
        body: (
          <p className="text-sm text-text-secondary">
            Click <span className="text-text-primary font-medium">Paystubs</span> in the sidebar. You'll see an upload zone and, once you've saved stubs, a history timeline.
          </p>
        ),
      },
      {
        title: 'Upload and review',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <ol className="flex flex-col gap-2 ml-3 list-decimal list-outside">
              <li>Drag a PDF onto the upload zone or click to browse</li>
              <li>The parser extracts all fields automatically using pdfplumber</li>
              <li>Review the pre-filled form — correct any fields that didn't parse correctly</li>
              <li>Click <span className="text-text-primary font-medium">Save Paystub</span> to store it</li>
            </ol>
          </div>
        ),
      },
      {
        title: 'What gets extracted',
        body: (
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                'Gross pay & net pay',
                'Federal income tax (FITW)',
                'MD state & county tax',
                'Social Security & Medicare',
                '401k employee deduction',
                'Employer Safe Harbor 401k',
                'Vision insurance',
                'YTD gross & net',
                'YTD 401k (employee + employer)',
                'Pay period dates',
              ].map(item => (
                <div key={item} className="flex items-center gap-2 p-2 rounded-lg bg-surface-2">
                  <CheckCircle2 size={12} className="text-green-400 shrink-0" />
                  <span className="text-text-secondary">{item}</span>
                </div>
              ))}
            </div>
          </div>
        ),
      },
    ],
  },
]

function SectionCard({ section }: { section: Section }) {
  const [expanded, setExpanded] = useState(true)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const Icon = section.icon
  const allDone = completedSteps.size === section.steps.length

  const toggleStep = (i: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div className={cn('rounded-2xl border transition-colors', allDone ? 'border-green-500/30 bg-green-500/5' : 'border-[#2d3748] bg-surface')}>
      {/* Header */}
      <button
        className="w-full flex items-start gap-4 px-5 py-4 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5', section.iconBg)}>
          <Icon size={20} className={section.iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-text-primary">{section.title}</h2>
            {allDone && <CheckCircle2 size={16} className="text-green-400 shrink-0" />}
          </div>
          <p className="text-sm text-text-secondary mt-0.5 leading-relaxed">{section.subtitle}</p>
        </div>
        <div className="shrink-0 mt-1">
          {expanded ? <ChevronUp size={18} className="text-text-secondary" /> : <ChevronDown size={18} className="text-text-secondary" />}
        </div>
      </button>

      {/* Steps */}
      {expanded && (
        <div className="px-5 pb-5 flex flex-col gap-3">
          {section.steps.map((step, i) => {
            const done = completedSteps.has(i)
            return (
              <div key={i} className={cn('rounded-xl border p-4 transition-colors', done ? 'border-green-500/20 bg-green-500/5' : 'border-[#2d3748] bg-surface-2')}>
                <div className="flex items-start gap-3">
                  <button onClick={() => toggleStep(i)} className="mt-0.5 shrink-0 text-text-secondary hover:text-primary transition-colors">
                    {done
                      ? <CheckCircle2 size={18} className="text-green-400" />
                      : <Circle size={18} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={cn('font-semibold text-sm mb-2', done ? 'text-text-secondary line-through' : 'text-text-primary')}>
                      {step.title}
                    </p>
                    {!done && step.body}
                  </div>
                </div>
              </div>
            )
          })}
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted">
              {completedSteps.size} / {section.steps.length} steps done
            </p>
            {!allDone && (
              <button
                onClick={() => setCompletedSteps(new Set(section.steps.map((_, i) => i)))}
                className="text-xs text-text-secondary hover:text-primary transition-colors"
              >
                Mark all done
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function GettingStartedPage() {
  const totalSteps = sections.reduce((s, sec) => s + sec.steps.length, 0)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <PlusCircle size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Getting Started</h1>
            <p className="text-sm text-text-secondary">A step-by-step guide to adding your data</p>
          </div>
        </div>

        <div className="mt-2 p-4 rounded-2xl bg-surface border border-[#2d3748] flex flex-col gap-3">
          <p className="text-sm text-text-secondary leading-relaxed">
            The app starts with a clean slate — no pre-loaded data. Follow these steps to set up your accounts, import transactions,
            and configure your forecast. It takes about <span className="text-text-primary font-medium">15–30 minutes</span> to get fully set up.
          </p>
          <div className="flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><Upload size={12} /> CSV/XLSX import supported</span>
            <span className="flex items-center gap-1.5"><PlusCircle size={12} /> Manual entry always available</span>
            <span className="flex items-center gap-1.5"><BarChart2 size={12} /> {totalSteps} steps total</span>
          </div>
        </div>
      </div>

      {/* Section cards */}
      {sections.map((section) => (
        <SectionCard key={section.id} section={section} />
      ))}

      {/* Footer tip */}
      <div className="p-4 rounded-2xl bg-surface border border-[#2d3748] text-sm text-text-secondary">
        <p className="font-semibold text-text-primary mb-1">After setup</p>
        <p>
          Check the <span className="text-text-primary font-medium">Dashboard</span> to confirm your net worth looks right,
          then visit <span className="text-text-primary font-medium">Forecast</span> to see your 60-month projection.
          Use <span className="text-text-primary font-medium">Insights</span> for spending analysis and{' '}
          <span className="text-text-primary font-medium">What-If Scenarios</span> to model financial decisions.
        </p>
      </div>
    </div>
  )
}
