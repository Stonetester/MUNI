/**
 * Coast FI / FIRE goal solver.
 *
 * The Coast FI calculator runs the model FORWARD: given every input, what's the
 * Coast FI number and when do you hit it. The solver runs it BACKWARD: fix a goal
 * (retire at 45, contribute $2k/mo, …) and solve for the ONE input that makes it
 * work, holding the others fixed.
 *
 * Model (matches CoastFiCalculator's `result`):
 *   - Spend grows with inflation to retirement; FIRE target is in FUTURE dollars:
 *       fireNumber = (monthlySpend*12 * (1+infl)^years) / swr
 *   - Your invested pile grows at `nominal` and you add `annualContrib` each year.
 *     Balance at retirement (future value of a lump + an annuity):
 *       FV(years) = invested*(1+r)^years + annualContrib * ((1+r)^years - 1)/r
 *   - You are "fully funded" (can retire on plan) when FV(years) >= fireNumber.
 *
 * Each solve inverts FV(years) = fireNumber for one variable. Closed-form where
 * the algebra allows; a small monotonic bisection otherwise. No dependencies.
 */

export interface SolverInputs {
  currentAge: number
  retirementAge: number
  currentInvested: number
  monthlyContribution: number
  monthlyRetirementSpend: number
  investmentReturn: number // % nominal annual
  inflationRate: number // %
  safeWithdrawalRate: number // %
}

export type SolveTarget =
  | 'monthlyContribution'
  | 'retirementAge'
  | 'monthlyRetirementSpend'
  | 'investmentReturn'

export interface SolveResult {
  /** The solved value, in the natural unit of the target (dollars, age, or %). */
  value: number | null
  /** True when no positive/finite solution exists in a sane range. */
  unsolvable: boolean
  /** Human-readable reason when unsolvable, or a one-line interpretation. */
  note: string
}

/** Inflated FIRE target (future dollars) for a given spend + horizon. */
export function fireTarget(
  monthlyRetirementSpend: number,
  inflationRatePct: number,
  swrPct: number,
  years: number,
): number {
  const infl = inflationRatePct / 100
  const swr = swrPct / 100
  if (swr <= 0) return Infinity
  const annualFuture = monthlyRetirementSpend * 12 * Math.pow(1 + infl, Math.max(years, 0))
  return annualFuture / swr
}

/** Future value of the invested pile at retirement, given an annual contribution. */
export function futureValue(
  currentInvested: number,
  annualContribution: number,
  nominalPct: number,
  years: number,
): number {
  const r = nominalPct / 100
  const y = Math.max(years, 0)
  const growthLump = currentInvested * Math.pow(1 + r, y)
  // Annuity factor; guard r≈0 with the limit (y).
  const annuityFactor = Math.abs(r) < 1e-9 ? y : (Math.pow(1 + r, y) - 1) / r
  return growthLump + annualContribution * annuityFactor
}

/** Generic monotonic bisection for f(x)=0 on [lo,hi]; assumes f changes sign. */
function bisect(f: (x: number) => number, lo: number, hi: number, iters = 200): number | null {
  let flo = f(lo)
  let fhi = f(hi)
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2
    const fmid = f(mid)
    if (!Number.isFinite(fmid)) return null
    if (Math.abs(fmid) < 1e-6 || hi - lo < 1e-7) return mid
    if (flo * fmid < 0) {
      hi = mid
      fhi = fmid
    } else {
      lo = mid
      flo = fmid
    }
  }
  return (lo + hi) / 2
}

/**
 * Solve for the single variable named by `target`, holding the rest of `inputs`
 * fixed, so that the invested pile reaches the FIRE target exactly at retirement.
 */
export function solveFor(target: SolveTarget, inputs: SolverInputs): SolveResult {
  const {
    currentAge, retirementAge, currentInvested, monthlyContribution,
    monthlyRetirementSpend, investmentReturn, inflationRate, safeWithdrawalRate,
  } = inputs

  const years = retirementAge - currentAge
  const r = investmentReturn / 100

  if (target === 'monthlyContribution') {
    // FV = invested*(1+r)^Y + annual*((1+r)^Y - 1)/r = fire  →  solve annual.
    if (years <= 0) return { value: null, unsolvable: true, note: 'Retirement age must be after current age.' }
    const fire = fireTarget(monthlyRetirementSpend, inflationRate, safeWithdrawalRate, years)
    const growthLump = currentInvested * Math.pow(1 + r, years)
    const annuityFactor = Math.abs(r) < 1e-9 ? years : (Math.pow(1 + r, years) - 1) / r
    const neededAnnual = (fire - growthLump) / annuityFactor
    const monthly = neededAnnual / 12
    if (monthly <= 0) {
      return { value: 0, unsolvable: false, note: 'Your current balance alone already reaches the FIRE number — no further contributions required.' }
    }
    return { value: monthly, unsolvable: false, note: `Contribute ${'$'}${Math.round(monthly).toLocaleString()}/mo to be fully funded by age ${retirementAge}.` }
  }

  if (target === 'retirementAge') {
    // Both FV and fire grow with years; find the earliest Y where FV(Y) >= fire(Y).
    const annual = monthlyContribution * 12
    const g = (y: number) =>
      futureValue(currentInvested, annual, investmentReturn, y) -
      fireTarget(monthlyRetirementSpend, inflationRate, safeWithdrawalRate, y)
    // If already funded at y=0, you're there now.
    if (g(0) >= 0) return { value: currentAge, unsolvable: false, note: 'You can retire now — your pile already covers the FIRE number.' }
    // Search up to age 100. Requires the gap to close (return must exceed inflation).
    const maxYears = Math.max(1, 100 - currentAge)
    if (g(maxYears) < 0) {
      return { value: null, unsolvable: true, note: 'Not reachable by age 100 at these settings — raise contribution/return or lower spend.' }
    }
    const yStar = bisect(g, 0, maxYears)
    if (yStar == null) return { value: null, unsolvable: true, note: 'Could not solve a retirement age from these settings.' }
    const age = currentAge + yStar
    return { value: age, unsolvable: false, note: `You can retire at about age ${Math.ceil(age)} (${Math.ceil(yStar)} years) on this plan.` }
  }

  if (target === 'monthlyRetirementSpend') {
    // fire = FV is fixed by the other inputs; spend is linear in fire → invert.
    if (years <= 0) return { value: null, unsolvable: true, note: 'Retirement age must be after current age.' }
    const annual = monthlyContribution * 12
    const fvAtRetire = futureValue(currentInvested, annual, investmentReturn, years)
    const infl = inflationRate / 100
    const swr = safeWithdrawalRate / 100
    // fire = (spend*12*(1+infl)^Y)/swr = fvAtRetire  →  spend = fvAtRetire*swr / (12*(1+infl)^Y)
    const spend = (fvAtRetire * swr) / (12 * Math.pow(1 + infl, years))
    if (spend <= 0) return { value: null, unsolvable: true, note: 'No positive sustainable spend at these settings.' }
    return { value: spend, unsolvable: false, note: `You could sustainably spend about ${'$'}${Math.round(spend).toLocaleString()}/mo in retirement (today's dollars).` }
  }

  if (target === 'investmentReturn') {
    // Find the nominal return r where FV(Y) = fire(Y). fire is independent of r.
    if (years <= 0) return { value: null, unsolvable: true, note: 'Retirement age must be after current age.' }
    const fire = fireTarget(monthlyRetirementSpend, inflationRate, safeWithdrawalRate, years)
    const annual = monthlyContribution * 12
    const h = (ratePct: number) => futureValue(currentInvested, annual, ratePct, years) - fire
    // Bracket 0%..60%. If even 0% overshoots, you need no growth; if 60% undershoots, unreachable.
    if (h(0) >= 0) return { value: 0, unsolvable: false, note: 'You reach the FIRE number even at 0% return — your contributions alone get you there.' }
    if (h(60) < 0) return { value: null, unsolvable: true, note: 'Even a 60%/yr return falls short — raise contribution or lower spend/retirement age.' }
    const rStar = bisect(h, 0, 60)
    if (rStar == null) return { value: null, unsolvable: true, note: 'Could not solve a required return from these settings.' }
    return { value: rStar, unsolvable: false, note: `You'd need about ${rStar.toFixed(1)}%/yr to hit this plan.` }
  }

  return { value: null, unsolvable: true, note: 'Unknown solve target.' }
}
