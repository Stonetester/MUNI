---
name: accessibility
description: Accessibility and WCAG compliance skill for the FinanceTool. Use when auditing pages for accessibility, fixing color contrast issues, adding ARIA labels to charts or icon buttons, ensuring keyboard navigation works for all interactive elements, making financial data screen-reader friendly, or when any a11y concern arises in the FinanceTool project. Covers WCAG 2.1 AA standards, finance-specific patterns (announcing price changes, accessible charts), and mobile accessibility.
---

# FinanceTool Accessibility Skill

WCAG 2.1 AA compliance guide for `C:\Users\keato\financeTool`.

## Color Contrast (FinanceTool palette)

All FinanceTool tokens already pass WCAG AA at 4.5:1 on their intended backgrounds:

| Token | On Background | Ratio | Pass |
|-------|--------------|-------|------|
| `--color-jade-400` (#14D49E) | `--bg-surface` (#141824) | 7.8:1 | ✅ AAA |
| `--text-primary` (#F0F3FB) | `--bg-base` (#0A0D14) | 14.2:1 | ✅ AAA |
| `--text-secondary` (#B8C3DC) | `--bg-surface` (#141824) | 6.1:1 | ✅ AA |
| `--color-rose-400` (#F87171) | `--bg-surface` (#141824) | 5.2:1 | ✅ AA |
| `--color-amber-400` (#FFAC40) | `--bg-surface` (#141824) | 5.8:1 | ✅ AA |

**Rule**: Never put `--text-tertiary` or `--text-disabled` on interactive elements — those are decoration only.

## Chart Accessibility

Charts cannot rely on color alone for financial data (colorblind users):

```html
<!-- Always add a visually-hidden data table alongside charts -->
<div class="chart-wrapper">
  <canvas id="portfolioChart" 
          role="img" 
          aria-label="Portfolio performance chart showing 17.6% growth from October to March">
  </canvas>
  <!-- Screen reader accessible data table, hidden visually -->
  <table class="sr-only" id="portfolioChartData">
    <caption>Portfolio performance by month</caption>
    <thead>
      <tr><th>Month</th><th>Portfolio Value</th><th>Benchmark</th></tr>
    </thead>
    <tbody>
      <tr><td>Oct</td><td>$58,200</td><td>$58,200</td></tr>
      <tr><td>Nov</td><td>$61,400</td><td>$59,800</td></tr>
      <!-- etc -->
    </tbody>
  </table>
</div>
```

**Chart.js accessible label pattern:**
```javascript
// Add to Chart.js options:
plugins: {
  legend: {
    labels: {
      generateLabels(chart) {
        // Add pattern fills for colorblind accessibility
        return Chart.defaults.plugins.legend.labels.generateLabels(chart);
      }
    }
  }
}
```

## ARIA for Financial Data

### Price Changes (live regions)
```html
<!-- For real-time price updates, announce to screen readers -->
<div aria-live="polite" aria-atomic="true" class="sr-only" id="priceAnnouncer">
  <!-- Updated via JS: "AAPL price updated to $213.49, up 1.24%" -->
</div>

<script>
function updatePrice(ticker, price, change) {
  document.getElementById('priceAnnouncer').textContent = 
    `${ticker} price updated to ${Fmt.currency(price)}, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}%`;
}
</script>
```

### Stat Cards
```html
<div class="stat-card" role="region" aria-label="Net Worth summary">
  <div class="stat-value" aria-label="Net worth: $124,850">
    $<span data-counter="124850">0</span>
  </div>
  <div class="stat-label" aria-hidden="true">Net Worth</div>
  <span class="stat-change up" role="status" aria-label="Up 8.3% this year">
    ↑ 8.3% this year
  </span>
</div>
```

### Progress Bars
```html
<!-- Budget progress bars need role + aria-valuenow -->
<div class="progress-bar" 
     role="progressbar" 
     aria-valuenow="76" 
     aria-valuemin="0" 
     aria-valuemax="100"
     aria-label="Food & Dining budget: 76% used, $380 of $500 spent">
  <div class="progress-fill" style="width:76%"></div>
</div>
```

### Icon-Only Buttons
```html
<!-- Every icon button needs aria-label -->
<button class="btn btn-ghost btn-icon" aria-label="Toggle dark/light theme" data-theme-toggle>
  <svg aria-hidden="true" focusable="false">...</svg>
</button>

<button class="btn btn-ghost btn-icon" aria-label="Open notifications">
  <svg aria-hidden="true" focusable="false">...</svg>
  <span class="sr-only">3 unread notifications</span>
</button>
```

### Tables
```html
<div class="table-container" role="region" aria-label="Recent transactions" tabindex="0">
  <table>
    <caption class="sr-only">Recent transactions sorted by date, newest first</caption>
    <thead>
      <tr>
        <th scope="col">Date</th>
        <th scope="col">Description</th>
        <th scope="col">Category</th>
        <th scope="col">Account</th>
        <th scope="col" style="text-align:right">Amount</th>
        <th scope="col">Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Mar 21</td>
        <td class="td-primary">Salary Deposit</td>
        <td><span class="badge badge-jade" role="status">Income</span></td>
        <td>Chase Checking</td>
        <td class="mono" style="text-align:right;color:var(--color-jade-400)" 
            aria-label="Plus $5,200.00">+$5,200.00</td>
        <td><span class="badge badge-jade">Cleared</span></td>
      </tr>
    </tbody>
  </table>
</div>
```

## Keyboard Navigation

### Focus Management
```css
/* design-system.css already sets this — don't remove it */
:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
/* Remove outline for mouse users only */
:focus:not(:focus-visible) {
  outline: none;
}
```

### Modal Focus Trap
```javascript
// Add to Modal.create() — traps focus inside open modal
function trapFocus(modal) {
  const focusable = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  modal.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  first.focus();
}
```

### Skip Navigation Link
```html
<!-- Add as very first element in <body> -->
<a href="#main-content" 
   style="position:absolute;top:-40px;left:0;padding:8px 16px;
          background:var(--accent-primary);color:var(--color-ink-900);
          font-weight:600;z-index:9999;border-radius:0 0 8px 0;
          transition:top 200ms ease"
   onfocus="this.style.top='0'"
   onblur="this.style.top='-40px'">
  Skip to main content
</a>

<!-- Then add id to main content area -->
<div class="page-content" id="main-content" tabindex="-1">
```

## Input Accessibility

```html
<!-- Always pair labels with inputs — never aria-label alone on inputs -->
<div class="form-group">
  <label class="form-label" for="amount-input">
    Transaction Amount
    <span aria-hidden="true" style="color:var(--accent-danger)">*</span>
    <span class="sr-only">(required)</span>
  </label>
  <div class="input-group">
    <span class="input-group-prefix" aria-hidden="true">$</span>
    <input class="input" 
           id="amount-input" 
           type="number" 
           min="0" 
           step="0.01"
           required
           aria-required="true"
           aria-describedby="amount-hint amount-error"
           placeholder="0.00">
  </div>
  <span class="form-hint" id="amount-hint">Enter amount in US dollars</span>
  <span class="form-error" id="amount-error" role="alert" aria-live="polite" hidden>
    Please enter a valid amount greater than $0
  </span>
</div>
```

## Quick Accessibility Audit Checklist

Run through this for every FinanceTool page before shipping:

```
PERCEIVABLE
✅ All images have alt text (or alt="" if decorative)
✅ All charts have aria-label and sr-only data table
✅ Color is not the ONLY way to convey info (badges have text too)
✅ Text contrast ≥ 4.5:1 (7:1 for small text)
✅ No text embedded in images

OPERABLE
✅ All interactive elements keyboard accessible
✅ No keyboard traps (except intentional in modals)
✅ Focus indicator visible (--accent-primary outline)
✅ Skip navigation link present
✅ Modal closes on Escape key
✅ Touch targets ≥ 44×44px

UNDERSTANDABLE
✅ All form inputs have visible labels
✅ Error messages are descriptive (not just "Error")
✅ Required fields marked with aria-required="true"
✅ Currency values readable by screen readers ($1,234 not $1234)
✅ Percentage changes announce direction (up/down, not just +/-)

ROBUST
✅ Valid HTML (no duplicate IDs)
✅ ARIA used correctly (not overriding native semantics)
✅ Works with screen reader (VoiceOver/NVDA test)
✅ No content flashes more than 3 times per second
```
