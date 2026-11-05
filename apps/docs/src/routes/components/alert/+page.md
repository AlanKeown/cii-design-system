---
title: Alert
description: Alert in the CII Design System.
---

<script lang="ts">
  import AlertExample from '#lib/examples/AlertExample.svelte';
</script>

Explain important information or the result of an action with a short heading
and actionable message.

<AlertExample />

## Usage

```svelte
<script lang="ts">
  import { Alert } from '@cii/svelte';
</script>

<Alert tone="danger" role="alert" title="Couldn’t save changes">
  Check the required fields and try again.
</Alert>
```

## Properties

| Property   | Type                           | Default |
| ---------- | ------------------------------ | ------- |
| `tone`     | info, success, warning, danger | info    |
| `title`    | string                         | —       |
| `role`     | alert, status                  | none    |
| `children` | Svelte snippet                 | —       |

## Accessibility

Choose the announcement behaviour deliberately. Use `role="status"` for a
dynamically inserted success message and `role="alert"` for an urgent error.
Static guidance generally needs neither.

An alert does not move focus. After an invalid form submission, the application
should focus its error summary when appropriate and provide links to invalid
fields.

## Content

State what happened and what the user can do next. Avoid relying on colour
alone. Keep important validation errors visible until the user resolves them; a
disappearing toast is insufficient.

## Tones and state changes

Use info for explanatory context, success for a completed action, warning for a
recoverable risk and danger for a failed or blocked task. Tone controls
presentation; role controls announcement urgency. Do not make a static warning
urgent simply because it uses a warning colour.

When retrying, keep the explanation visible and describe progress near the
action. After resolution replace or remove stale feedback and announce the
outcome once. An Alert has no intrinsic selected, disabled, loading or
dismissible state; the application owns those workflows and any action buttons
in its content.

## Themes and responsive layout

The shared component uses semantic text colours, a tinted card surface and a
visible border in both themes. Long headings, error lists and action labels must
wrap within the container. Keep links recognisable and preserve keyboard focus
if an application action updates the message. Do not shrink an error summary to
keep a dialog short; allow the dialog to scroll.

## Related feedback

Use [Banner](/components/banner/) for page/service scope and
[Toast](/components/toast/) for non-essential transient acknowledgement. Follow
[Record forms](/patterns/record-forms/) for linked validation summaries. Avoid
repeated assertive announcements, colour-only meaning or dismissing an
unresolved error automatically.
