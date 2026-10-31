---
title: Badge and indicator
description: Supplement a label with a count or a clearly explained signal.
---

Supplement a label with a count or a clearly explained signal.

**Implementation: application guidance.** This component is not exported by `@cii/svelte`. The contract below describes responsibilities for an application implementation; it is not a package API. Code examples show semantic structure, with application behaviour described separately.

## Usage and variants

Use count badges for quantities such as open cases. Use an indicator dot only when nearby text or the accessible name explains its meaning. Use StatusChip for a record state and Tag for a category.

## Application contract

| Concern | Required behaviour |
| --- | --- |
| Count | Supply a non-negative number and a plural-aware description; define zero and overflow display. |
| Meaning | Explain whether the number is a total, unread count or actionable count. |
| Updates | Keep navigation labels stable and announce significant changes without repeating the whole navigation. |

## Structure example

```html
<a href="?module=Cases">
  Cases <span aria-label="3 open cases">3</span>
</a>
<span><span aria-hidden="true">●</span> Demo workspace</span>
```

## States and feedback

Support zero, positive and capped counts such as 99+, with the exact count available in accessible text when useful. Unknown/loading counts are not zero. Indicators need a textual equivalent; no hover or focus state is needed unless the parent is interactive.

## Keyboard and accessibility

Keep badges out of the Tab order and include their meaning in readable text. Hide purely decorative dots. Avoid creating live regions on every badge; use one concise update for important changes.

## Themes and responsive layout

Use subtle/text tokens, compact padding and a shape that still fits multiple digits. Do not let counts squeeze navigation labels on mobile. Verify text and indicator contrast in both themes.

## Avoid

Avoid an unlabeled dot as the only notification signal, treating zero as an error or confusing a count with a selectable tag.

## Portal reference and implementation limits

`+page.svelte`: Cases navigation count, dashboard attention count, table total and notification dot. The notification action scrolls to activity; its static dot does not represent a tracked unread count. The demo workspace dot is decorative.

Run the [community portal](/examples/community-portal/) to inspect the application. This reference does not certify that it meets every requirement above. See [foundations](/foundations/tokens/) and [responsive layout](/foundations/responsive-layout/).
