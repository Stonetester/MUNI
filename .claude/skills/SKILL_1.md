---
name: ui-design
description: Production-grade UI design skill for the FinanceTool project at C:\Users\keato\financeTool. Use this skill whenever building, improving, or styling ANY page, component, or view in the FinanceTool — including the dashboard, transactions, portfolio, budget, goals, tax pages, and any modals or charts. Activates automatically for all frontend work in this project. Enforces the FinanceTool design system (jade/green accent, DM Serif Display + DM Sans + JetBrains Mono fonts, dark/light mode tokens), distinctive layouts, high-impact micro-animations, and production-quality visual details. Never uses generic Inter/Roboto fonts, purple gradients, or flat cookie-cutter component patterns.
---

# FinanceTool UI Design Skill

You are working on **FinanceTool** — a personal finance dashboard at `C:\Users\keato\financeTool`.

## Project Stack
- Vanilla HTML + CSS + JavaScript (no framework required unless adding React)
- Design system: `css/design-system.css` — all CSS custom properties already defined
- JS utilities: `js/ui.js` — Toast, Modal, ThemeManager, Charts, Fmt, SidebarManager all available
- Charts: Chart.js (CDN) via `Charts.portfolio()`, `Charts.donut()`, `Charts.bar()`
- Fonts: DM Serif Display (display/headings), DM Sans (body), JetBrains Mono (numbers/amounts)

## FinanceTool Design Tokens (always use these — never hardcode colors)

```css
/* Backgrounds */
--bg-base, --bg-surface, --bg-raised, --bg-overlay

/* Text */
--text-primary, --text-secondary, --text-tertiary, --text-disabled

/* Accents */
--accent-primary      /* jade green — positive values, CTAs, active states */
--accent-danger       /* rose red — negative values, errors */
--accent-warning      /* amber — warnings, pending */
--accent-secondary    /* violet — investments, premium */

/* Brand palette direct refs */
--color-jade-400, --color-jade-500
--color-rose-400, --color-rose-500
--color-amber-400
--color-violet-400
```

## Typography Rules

- **Display/hero numbers**: `font-family: var(--font-display)` — use for dollar amounts in stat cards, big KPIs
- **Body copy**: `font-family: var(--font-body)` — DM Sans, all labels, descriptions, nav
- **Financial data**: `font-family: var(--font-mono)` — ALWAYS use for prices, percentages, tickers, account numbers, transaction amounts
- **Size scale**: `--text-xs` (11px) through `--text-4xl` (56px) — use clamp() for responsive headings
- Classes: `.display-xl`, `.display-lg`, `.heading-xl`→`.heading-sm`, `.body-lg`→`.body-sm`, `.caption`, `.label`, `.mono`

## Component Classes (all in design-system.css)

### Cards
```html
<div class="stat-card">               <!-- hover lift + top border glow -->
<div class="card">                    <!-- standard card -->
  <div class="card-header">...</div>
  <div class="card-body">...</div>
  <div class="card-footer">...</div>
</div>
```

### Stat Icons (4 color variants)
```html
<div class="stat-icon jade">   <!-- green -->
<div class="stat-icon amber">  <!-- amber -->
<div class="stat-icon rose">   <!-- red -->
<div class="stat-icon violet"> <!-- purple -->
```

### Buttons
```html
<button class="btn btn-primary">      <!-- jade CTA -->
<button class="btn btn-secondary">    <!-- muted -->
<button class="btn btn-ghost">        <!-- text-only -->
<button class="btn btn-danger">       <!-- destructive -->
<!-- Sizes: btn-sm, btn-lg, btn-xl, btn-icon, btn-full -->
```

### Badges
```html
<span class="badge badge-jade">Active</span>
<span class="badge badge-rose">Overdue</span>
<span class="badge badge-amber">Pending</span>
<span class="badge badge-violet">Premium</span>
<span class="badge badge-subtle">Archived</span>
```

### Progress Bars
```html
<div class="progress-bar">
  <div class="progress-fill" style="width:62%"></div>         <!-- jade default -->
  <div class="progress-fill amber" style="width:75%"></div>   <!-- amber warning -->
  <div class="progress-fill rose" style="width:100%"></div>   <!-- rose danger -->
</div>
```

### Form Inputs
```html
<div class="form-group">
  <label class="form-label">Amount</label>
  <div class="input-group">
    <span class="input-group-prefix">$</span>
    <input class="input" type="number" placeholder="0.00">
    <span class="input-group-suffix">USD</span>
  </div>
  <span class="form-hint">Helper text</span>
  <span class="form-error">Error message</span>  <!-- add class="error" to input too -->
</div>
```

### Tables
```html
<div class="table-container">
  <table id="myTable">
    <thead><tr><th>Col</th></tr></thead>
    <tbody>
      <tr>
        <td class="td-primary">Important cell</td>  <!-- white text, 500 weight -->
        <td class="mono">$1,234.56</td>              <!-- monospace number -->
        <td><span class="badge badge-jade">Cleared</span></td>
      </tr>
    </tbody>
  </table>
</div>
```

## JavaScript API (available globally after js/ui.js loads)

```javascript
// Toasts
Toast.success('Title', 'Optional message')
Toast.error('Title', 'Optional message')
Toast.warning('Title', 'Optional message')
Toast.info('Title', 'Optional message')

// Modals
Modal.create({ title, body, footer, size: 'sm|md|lg|xl' })
Modal.open('elementId')
Modal.close()

// Charts (requires Chart.js)
Charts.portfolio('canvasId', labels, datasets)   // line + fill
Charts.donut('canvasId', labels, data)            // allocation
Charts.bar('canvasId', labels, datasets)          // bars

// Number formatting
Fmt.currency(value)              // "$1,234.56"
Fmt.currency(value, 'USD', true) // "$1.2K" compact
Fmt.percent(8.3)                 // "+8.3%"
Fmt.percent(-2.1)                // "-2.1%"
Fmt.date(new Date())             // "Mar 21, 2026"
Fmt.relative(date)               // "3 hours ago"

// Counter animations (auto-triggers on scroll)
// In HTML: <span data-counter="124850" data-prefix="$" data-decimals="0">0</span>
// Manual:
animateCounter(element, 68420, 1400, v => Fmt.currency(v))

// Theme
ThemeManager.toggle()
ThemeManager.set('dark' | 'light')
```

## Layout Structure (maintain on every page)

```html
<div class="app-shell">
  <aside class="sidebar">
    <!-- logo, nav items, user footer -->
  </aside>
  <main class="main-content">
    <header class="topbar">...</header>
    <div class="page-content">
      <!-- YOUR PAGE CONTENT HERE -->
    </div>
  </main>
</div>
<!-- Mobile nav at body bottom -->
<nav class="mobile-nav">...</nav>
```

## Design Principles for FinanceTool

### Financial Data Hierarchy
1. **Primary metric** — large, DM Serif Display, high contrast
2. **Delta/change** — badge with color (jade=up, rose=down)
3. **Label/context** — small, `--text-tertiary`, uppercase label
4. **Trend sparkline or chart** — always below the metric

### Color Semantics — ALWAYS enforce
- Green / jade → positive, income, growth, success, cleared
- Red / rose → negative, expense, debt, loss, overdue
- Amber → warning, pending, approaching limit, caution
- Violet → investment, premium, portfolio, securities
- Neutral → historical data, metadata, placeholders

### Motion Guidelines
- Page load: use `.stagger` class on a grid container for cascaded card reveals
- Stat values: always animate with `data-counter` attribute on numbers
- Card hover: use `.stat-card` (built-in hover lift via CSS)
- Chart load: Chart.js handles its own entrance animations — don't suppress them
- Page transitions: `animation: slideUp var(--duration-slow) var(--ease-spring) both`
- Micro: use CSS transitions `var(--duration-fast)` for hover states

### Layout Patterns
- **Stat grid**: `class="grid grid-4 gap-4"` (collapses to 2 then 1 on mobile)
- **Chart + sidebar**: `grid-template-columns: 1fr 340px` → single col on mobile
- **Transaction list**: flex rows with icon + info + amount
- **Budget items**: label + progress bar + meta row
- **Watchlist/table**: 3-col grid (ticker info | price | change badge)

### Backgrounds & Depth
- Pages: `var(--bg-base)` — never white or solid black
- Cards: `var(--bg-surface)` with `border: 1px solid var(--border-subtle)`
- Inputs/table rows: `var(--bg-raised)` on hover/focus
- Overlays/dropdowns: `var(--bg-overlay)` with `box-shadow: var(--shadow-lg)`
- Add subtle top-border glow to important cards: `box-shadow: 0 -2px 0 var(--accent-primary) inset`

## What to AVOID
- ❌ Hardcoded hex colors — always use CSS tokens
- ❌ Inter, Roboto, Arial fonts — use DM Serif Display / DM Sans / JetBrains Mono
- ❌ Purple gradients on white — use jade accents on dark surfaces
- ❌ Flat cards with no depth — use border + shadow hierarchy
- ❌ Unformatted numbers — always `Fmt.currency()` or `Fmt.percent()`
- ❌ Static stat values — always wire `data-counter` for animation
- ❌ Missing mobile nav — every page needs the `.mobile-nav` bottom bar
- ❌ Breaking the sidebar — always wrap in `.app-shell` with `.sidebar` + `.main-content`

## File Checklist for Every New Page
```
✅ Links css/design-system.css
✅ Links js/ui.js (deferred)
✅ Links Chart.js CDN (if charts present)
✅ Google Fonts link in <head>
✅ <html data-theme="dark"> default
✅ <meta name="viewport"> with viewport-fit=cover
✅ app-shell > sidebar + main-content > topbar + page-content
✅ mobile-nav bar at end of body
✅ data-counter on all numeric KPIs
✅ data-theme-toggle on theme toggle buttons
✅ data-sidebar-toggle on hamburger button
```
