---
title: Dashboard
description: Compose metrics, attention queues, activity and upcoming work.
---

Help people decide what needs action first, then provide routes into the relevant record lists. A dashboard combines [cards](/components/card/), an attention queue, [activity](/components/activity-timeline/) and upcoming events.

## Content order

| Region | Content | Action |
| --- | --- | --- |
| Heading | Destination or greeting, brief context, date | One permitted quick action |
| Metrics | Named measure, value, period/scope | Open the corresponding filtered list |
| Needs attention | Record title, reason, due date, urgency | Open the record |
| Recent activity | Actor, action, record, timestamp | Inspect relevant history |
| Upcoming events | Date, title, location, attendance summary | Open event details |
| Supporting card | Brief explanatory or promotional content | One relevant next step |

Role permissions affect both metrics and actions. A hidden module must not leak counts through another widget. A decorative supporting card must not displace urgent work in reading order.

## Attention rows

An attention row groups an icon, record title, supporting metadata and a textual status such as “Overdue”. Use one link or button as the row action; avoid nesting buttons inside it. Explain why the item needs attention and where activation leads. Use a semantic list around multiple items.

## Event rows and calendar tiles

Show month/day in the visual tile and a complete date in accessible text or a time element. Include the year when it would otherwise be ambiguous. The calendar tile is supplementary, not a date picker. Keep the event name and destination understandable independently of the tile. Attendance summaries should describe aggregate counts rather than implying individual check-in records exist.

## Metrics and feedback

Do not substitute zero for loading or failed data. Label the period behind amounts such as “Donations this month”; show timezone where period boundaries matter. Match currency precision to the [number input](/components/number-input/) policy. Clicking a metric must apply the same scope represented by its label.

For empty queues explain that there is no work requiring attention. For no upcoming events offer event creation only to permitted users. Loading/error feedback belongs in the affected widget so other useful content remains available.

## Accessibility and layout

Use one H1 and named H2 regions. Ensure single-action cards have a clear accessible name and visible keyboard focus. Hide decorative symbols. Express urgency in text rather than colour alone. Preserve source order when the desktop columns stack on mobile. Use theme tokens for cards and text; promotional and accent palettes must be checked separately in both themes.

## Portal reference and limits

`apps/community-portal/src/routes/+page.svelte`: Dashboard branch, metric, task-row, event-row and welcome-card. `styles.css`: dashboard-grid and calendar-date. The portal uses local decorative colours and native button rows rather than shared components. The current “Upcoming events” count includes all future-dated events without filtering cancellation status, and its metric navigates to the unfiltered Events list. These are implementation limits, not recommended metric semantics.
