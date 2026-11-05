---
title: Banner
description: Present a persistent message affecting a page or service.
---

Present a persistent message affecting a page or service.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Use an informational banner for workspace context, a warning for degraded
service and an error for a blocked task. Keep one dominant message with a clear
next step. Use an Alert for feedback scoped to a smaller task.

## Application contract

| Concern     | Required behaviour                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| Content     | Provide a heading or concise message, severity and optional action.                                            |
| Persistence | Keep consequential messages until resolved; allow dismissal only when doing so cannot conceal required action. |
| Scope       | Place page-wide messages before the page heading and task-level messages near the affected content.            |

## Structure example

```html
<section aria-labelledby="storage-warning">
  <h2 id="storage-warning">Changes are not being saved</h2>
  <p>Export your records before leaving this browser.</p>
  <button type="button">Export records</button>
</section>
```

## States and feedback

Support information, warning, error, action-in-progress and resolved states.
When retrying, explain progress in place; a failed retry keeps the banner and
entered data. A static informational banner does not need an urgent live
announcement.

## Keyboard and accessibility

Use normal region semantics for static context, role="status" for non-urgent
dynamic changes and role="alert" for an urgent failure. Name actions and
dismissal. Keep announcements concise and do not move focus automatically.

## Themes and responsive layout

Use semantic text/border colours over card or subtle surfaces, with an icon and
text for meaning. Let actions wrap below the message on mobile; verify both
themes and long translated content.

## Avoid

Avoid multiple stacked urgent banners, colour-only severity or dismissing a
storage failure while unsaved work is still at risk.

## Portal reference and implementation limits

`+page.svelte`: demo-strip combines informational workspace persistence text
with role preview; storage errors use shared Alert. The role control is demo
tooling rather than a reusable banner property. No shared Banner is exported.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
