---
title: Tag
description: Label categories or represent selected filter values.
---

Label categories or represent selected filter values.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Use read-only tags for categories, selectable tags for explicit filter choices
and removable tags for selected values. A
[Status chip](/components/status-chip/) describes record state; a count badge
displays quantity.

## Application contract

| Concern     | Required behaviour                                                                      |
| ----------- | --------------------------------------------------------------------------------------- |
| Label       | Supply meaningful text and a stable value for interactive tags.                         |
| Interaction | Use a button with aria-pressed for selection, or a separately named button for removal. |
| Overflow    | Wrap tags or provide an accessible “Show more” disclosure; retain the complete label.   |

## Structure example

```html
<span>Food support <button type="button" aria-label="Remove Food support">×</button></span>
<button type="button" aria-pressed="true">Active members</button>
```

## States and feedback

Support read-only, selectable selected/unselected, focused, disabled and
removable states. After removal place focus on the next tag, previous tag or
owning input. If removal fails, restore the value and explain the failure.

## Keyboard and accessibility

Read-only tags need no extra role or tab stop. Buttons support Space/Enter and
require distinct removal names. Never nest a removal button inside another
button. Announce changes when removing a value alters search results.

## Themes and responsive layout

Use subtle background, border, text and pill-radius tokens. Selection requires
text/icon/border changes as well as colour. Long labels may wrap or truncate
with another way to read the complete value; keep remove targets usable on
mobile.

## Avoid

Avoid making status labels appear interactive, relying on tooltip-only text or
rendering hundreds of tags without a summary.

## Portal reference and implementation limits

No standalone tag or removable filter chip is used in the portal. Status labels
are shared StatusChip instances and status shortcuts are ordinary buttons. This
page specifies future category/multi-value behaviour.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
