---
title: Toast
description: Acknowledge an action without interrupting the current task.
---

Acknowledge an action without interrupting the current task.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Use brief messages for completed actions such as saving or exporting. Use
information/warning variants only for non-essential messages; keep errors
requiring action in an [Alert](/components/alert/) or
[Banner](/components/banner/).

## Application contract

| Concern     | Required behaviour                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| Message     | Provide concise outcome text and an optional named dismiss action.                                         |
| Duration    | Choose a readable duration; pause expiry during hover/focus and retain actionable messages until resolved. |
| Concurrency | Define queue/replacement behaviour so repeated actions do not erase important feedback.                    |

## Structure example

```html
<div role="status" aria-atomic="true">
  <span>Member saved.</span>
  <button type="button" aria-label="Dismiss message">×</button>
</div>
```

## States and feedback

Support queued, visible and dismissed states. Success, information and warning
messages need text as well as icons/colour. If a message offers Undo, keep it
reachable long enough and describe the undo result. Avoid using a success icon
for failed actions.

## Keyboard and accessibility

Announce ordinary feedback politely using a stable live region without moving
focus. Give dismissal an accessible name. If a focused toast disappears, return
focus to a sensible control. Do not announce every item in a rapid update
stream.

## Themes and responsive layout

Use semantic surface/text tokens with readable contrast; cap width and wrap long
messages. Position above mobile safe areas and other fixed actions. Honour
reduced motion and do not obscure the current field or save action.

## Avoid

Avoid transient messages as the only record of errors, forcing focus into
feedback or treating a notification as proof a file reached disk.

## Portal reference and implementation limits

`+page.svelte`: notify() and toast. The portal uses role="status", replaces the
previous message and clears it after 4.5 seconds. It lacks pause-on-focus/hover,
queueing and severity-specific icons; draft storage failures currently use the
same transient presentation.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
