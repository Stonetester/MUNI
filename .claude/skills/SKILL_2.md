---
name: mobile-ui
description: Mobile-first UI skill for the FinanceTool project. Use this skill whenever building or improving mobile layouts, touch interactions, bottom navigation, swipe gestures, PWA features, responsive breakpoints, safe area handling, or any mobile-specific UI pattern in the FinanceTool. Automatically activates when working on mobile views, the bottom nav bar, touch targets, or when the task involves making any FinanceTool page work well on phones and tablets. Also use when adding pull-to-refresh, haptic feedback patterns, mobile chart sizing, or iOS/Android safe area insets.
---

# FinanceTool Mobile UI Skill

Mobile-first implementation guide for `C:\Users\keato\financeTool`.

## Core Mobile Principles

### Touch Target Rules
- **Minimum**: 44×44px for all interactive elements (iOS HIG + Android MD3 standard)
- **Comfortable**: 48×48px preferred for primary actions
- **Spacing**: 8px minimum between adjacent touch targets
- **Never** place two tap targets closer than 8px edge-to-edge

```css
/* Always add this to interactive mobile elements */
-webkit-tap-highlight-color: transparent;  /* removes tap flash */
touch-action: manipulation;                /* removes 300ms delay */
user-select: none;                         /* prevents text selection on tap */
```

### Safe Area Insets (iPhone notch / Dynamic Island / Android gesture bar)
```css
/* Bottom nav — CRITICAL for iPhones */
.mobile-nav {
  padding-bottom: env(safe-area-inset-bottom);
  height: calc(72px + env(safe-area-inset-bottom));
}

/* Page content — prevent content hiding behind bottom nav */
.page-content {
  padding-bottom: calc(var(--mobile-bar-height) + env(safe-area-inset-bottom) + 16px);
}

/* Modals that slide up from bottom */
.modal-sheet {
  padding-bottom: max(env(safe-area-inset-bottom), 24px);
}
```

### Viewport Fix (iOS Safari 100vh bug)
```javascript
// Already in js/ui.js as fixViewportHeight()
// Sets --dvh = 1% of actual window.innerHeight
// Usage:
height: calc(var(--dvh, 1vh) * 100);
min-height: calc(var(--dvh, 1vh) * 100);
```

## FinanceTool Mobile Layout

### Breakpoints
```css
/* Full desktop sidebar */          /* ≥ 1025px */
/* Compact sidebar (220px) */       /* 768px – 1024px */
/* Hidden sidebar + mobile nav */   /* ≤ 768px  ← most phones */
/* Single column everything */      /* ≤ 480px  ← small phones */
```

### Mobile Bottom Navigation
```html
<!-- Always placed at end of <body>, outside app-shell -->
<nav class="mobile-nav">
  <div class="mobile-nav-inner">
    <a class="mobile-nav-item active" href="index.html">
      <svg><!-- home icon --></svg>
      Home
    </a>
    <a class="mobile-nav-item" href="portfolio.html">
      <svg><!-- chart icon --></svg>
      Portfolio
    </a>
    <a class="mobile-nav-item" href="transactions.html">
      <svg><!-- dollar icon --></svg>
      Tx
    </a>
    <a class="mobile-nav-item" href="budget.html">
      <svg><!-- clock icon --></svg>
      Budget
    </a>
    <button class="mobile-nav-item" data-sidebar-toggle>
      <svg><!-- more icon --></svg>
      More
    </button>
  </div>
</nav>
```

**Rules for mobile nav:**
- Max 5 items
- Icons: 22×22px SVG
- Labels: `var(--text-xs)` — 1-2 words max
- Active state: top border indicator + `--accent-primary` color + icon scale(1.15)
- Never scroll horizontally

### Mobile Sidebar Drawer
The sidebar slides in from the left on mobile. Already wired in `js/ui.js`:
```javascript
// Auto-wired to any element with data-sidebar-toggle
// Creates backdrop overlay on open
// Closes on backdrop click or Escape key
SidebarManager.toggle()
SidebarManager.open()
SidebarManager.close()
```

**Hamburger button in topbar (show only on mobile):**
```html
<button class="btn btn-ghost btn-icon" data-sidebar-toggle aria-label="Menu"
        style="display:none" id="mobileBurger">
  <svg><!-- hamburger --></svg>
</button>
<script>
  if (window.innerWidth <= 768) document.getElementById('mobileBurger').style.display = '';
</script>
```

## Mobile Chart Sizing

Charts must resize gracefully on mobile:

```javascript
// Always set maintainAspectRatio: false and control height via CSS
// Portfolio chart: full width, shorter on mobile
.chart-wrapper { 
  height: 240px; 
}
@media (max-width: 480px) {
  .chart-wrapper { height: 180px; }
}

// Donut chart: square-ish, constrained
.donut-wrapper {
  height: 200px;
  max-width: 280px;
  margin: 0 auto;
}
```

**Chart.js mobile tips:**
- Reduce font sizes in tooltips on mobile: `font: { size: 10 }`
- Hide legend on very small screens (< 380px)
- Use `interaction: { mode: 'nearest' }` instead of `'index'` on touch

## Swipe Gestures

### Horizontal Swipe for Tabs / Cards
```javascript
function addSwipe(el, onLeft, onRight, threshold = 50) {
  let startX, startY;
  el.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
      dx < 0 ? onLeft?.() : onRight?.();
    }
  });
}

// Usage — swipe between time periods on portfolio chart:
addSwipe(chartContainer,
  () => switchPeriod('next'),
  () => switchPeriod('prev')
);
```

### Pull-to-Refresh
```javascript
// Already in js/ui.js as initPullToRefresh(callback)
initPullToRefresh(() => {
  Toast.info('Refreshing', 'Syncing your accounts…');
  // call your sync function here
  syncAccounts();
});
```

## Mobile-Specific Components

### Bottom Sheet Modal (mobile alternative to centered modal)
```css
@media (max-width: 768px) {
  .modal-backdrop {
    align-items: flex-end;
    padding: 0;
  }
  .modal {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border-top-left-radius: var(--radius-xl);
    border-top-right-radius: var(--radius-xl);
    max-width: 100%;
    max-height: 90dvh;
    /* Drag handle */
  }
  .modal-body::before {
    content: '';
    display: block;
    width: 36px; height: 4px;
    background: var(--border-strong);
    border-radius: var(--radius-full);
    margin: -8px auto 16px;
  }
}
```

### Mobile Transaction Row
On small screens, simplify the transaction row layout:
```css
@media (max-width: 480px) {
  .tx-row {
    flex-wrap: wrap;
  }
  .tx-info { 
    flex: 1 1 calc(100% - 56px); /* icon width + gap */
    min-width: 0;
  }
  .tx-amount {
    margin-left: auto;
    font-size: var(--text-base);
  }
  .tx-date {
    /* Show date on second line */
    flex-basis: 100%;
    padding-left: calc(40px + var(--space-4)); /* align under name */
    margin-top: -4px;
  }
}
```

### Horizontal Scroll Cards (mobile quick stats)
When 4 stat cards don't fit in a 2-col grid on very small screens, offer horizontal scroll:
```html
<div class="stat-scroll-row" style="
  display: flex;
  gap: var(--space-3);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  padding-bottom: var(--space-2);
  /* hide scrollbar */
  scrollbar-width: none;
">
  <div class="stat-card" style="
    min-width: 200px;
    scroll-snap-align: start;
    flex-shrink: 0;
  ">...</div>
</div>
```

### Mobile Search / Filter
On mobile, full-width search bar that expands from icon:
```css
/* Mobile: collapsed by default, expand on focus */
@media (max-width: 768px) {
  .search-wrapper {
    position: absolute; right: var(--space-4);
    width: 36px; /* icon only */
    transition: width var(--duration-normal) var(--ease-out);
  }
  .search-wrapper:focus-within {
    width: calc(100vw - 120px); /* expand */
  }
}
```

## Performance Rules for Mobile

1. **Images**: Always use `loading="lazy"` and specify `width`/`height`
2. **Charts**: Destroy and recreate on orientation change, not resize
3. **Animations**: Always check `prefers-reduced-motion` — design-system.css handles this globally
4. **Scroll**: Use `will-change: transform` only on actively animating elements, remove after
5. **Touch**: Use `{ passive: true }` on all touchstart/touchmove listeners
6. **Lists**: If showing > 50 transactions, implement virtual scrolling or pagination

## PWA Setup

Add to `<head>` of every page:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="FinanceTool">
<meta name="theme-color" content="#0A0D14" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F5F7FC" media="(prefers-color-scheme: light)">
<link rel="manifest" href="/manifest.json">
```

`manifest.json` (place in project root):
```json
{
  "name": "FinanceTool",
  "short_name": "Finance",
  "description": "Personal finance dashboard",
  "start_url": "/index.html",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#0A0D14",
  "theme_color": "#0A0D14",
  "icons": [
    { "src": "assets/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "assets/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

## Accessibility on Mobile

- Focus rings: design-system.css sets `outline: 2px solid var(--accent-primary)` via `:focus-visible`
- Font size: never below 16px on inputs (prevents iOS auto-zoom)
- Contrast: jade green (#14D49E) on dark bg passes WCAG AA at 4.5:1
- ARIA: all icon-only buttons need `aria-label`
- Screen readers: hide decorative elements with `aria-hidden="true"`

## Mobile Checklist for Every Page
```
✅ viewport meta with viewport-fit=cover
✅ theme-color meta tags (dark + light)
✅ mobile-nav present at bottom of body
✅ sidebar has data-sidebar-toggle wired
✅ page-content has bottom padding for mobile nav
✅ safe area insets on fixed bottom elements
✅ charts have responsive height (shorter on mobile)
✅ all touch targets ≥ 44×44px
✅ no horizontal scroll on any page
✅ modals become bottom sheets on mobile
✅ initPullToRefresh() called if page has live data
✅ stat cards scroll horizontally if needed on 320px
```
