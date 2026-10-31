---
title: Responsive layout
description: Keep navigation, records and actions usable across viewport sizes.
---

Use content-driven reflow within consistent viewport bands. Keep source order, accessible names and essential actions intact when layouts change.

## Viewport bands and portal behaviour

| Width | Layout guidance | Current portal reference |
| --- | --- | --- |
| Below 768px | Single main column; wrap actions; stack form/report controls | 16px main inset; stacked page headings and dashboard sections; one-column forms |
| 768–1023px | Collapsed navigation with a labelled opener; keep controls readable | Sidebar hidden; dashboard retains two content columns |
| 1024–1279px | Persistent compact sidebar; allow content to reflow | 218px sidebar; 24px main inset; two-column metric grid |
| 1280–1599px | Persistent sidebar and full dashboard layout | 248px sidebar; responsive metric grid |
| 1600px and above | Increase whitespace without increasing reading burden | 50px main inset; larger card/grid gaps |

The breakpoints above describe the current portal and the product's viewport bands; they are not exported CSS tokens or a shared layout API. Use [App shell](/components/app-shell/) for navigation behaviour.

## Component reflow

- Page headings move actions below the title/description on mobile.
- Search spans the available width; filters and secondary controls wrap.
- Wide data tables scroll inside their own region rather than forcing the page wider.
- Drawers can fill the viewport width, while retaining a visible close action.
- Dialogs keep a viewport margin and scroll internally when necessary.
- Calendar tiles, avatars and badges keep stable dimensions; adjacent text wraps.
- Pagination and bulk actions retain readable labels rather than shrinking text to fit.

## Typography, zoom and interaction

Use the [documented typography](/foundations/tokens/) for shared components. Test at 200% zoom and narrow widths with long names, large amounts and validation messages. Controls must remain keyboard reachable and focus must not be clipped. Support touch without relying on hover. Shared buttons use a 40px minimum height; extend the clickable area for compact glyphs rather than reducing targets.

Respect prefers-reduced-motion when animating navigation, panels or scrolling. Fixed banners/toasts must not cover focused controls, especially when a mobile keyboard is open.

## Current exceptions to reconcile

`apps/community-portal/src/lib/styles.css` uses local typography overrides: base H2 18/26px rather than the token H2 22/30px, mobile H1 25px and some very small metadata/pagination text. Local icon buttons are 38px. Page numbers disappear below 1280px. These are recorded exceptions, not new shared defaults; use readable type, explicit orientation and the shared control baseline for new work.

The portal's focus navigation, wide-table behaviour and all overlay/zoom combinations still require dedicated interaction review. A documentation requirement is not a claim of browser verification.
