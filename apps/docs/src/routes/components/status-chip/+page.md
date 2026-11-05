---
title: Status chip
description: Status chip in the CII Design System.
---

<script lang="ts">
  import StatusChipExample from '#lib/examples/StatusChipExample.svelte';
</script>

Display short, read-only status labels in record lists and detail views.

<StatusChipExample />

## Usage

```svelte
<script lang="ts">
  import { StatusChip } from '@cii/svelte';
</script>

<StatusChip tone="success">Active</StatusChip>
<StatusChip tone="warning">Pending</StatusChip>
```

## Properties

| Property   | Type                                      | Default |
| ---------- | ----------------------------------------- | ------- |
| `tone`     | neutral, success, warning, danger, accent | neutral |
| `children` | Svelte snippet                            | —       |

## Guidance

A chip is a text label, not an interactive filter. Use buttons for filtering.
Always provide meaningful text so colour is supplementary. Map business statuses
to tones in the consuming application, rather than adding domain-specific status
names to the component.

## Tones and states

| Tone    | Intended meaning               |
| ------- | ------------------------------ |
| neutral | Ordinary state without urgency |
| success | Positive or completed state    |
| warning | Attention or pending work      |
| danger  | A problem requiring attention  |
| accent  | Non-semantic emphasis          |

A read-only chip has no hover, selected, focus, disabled or validation state. Do
not add a tab stop. If status is unknown or loading, say so explicitly rather
than substituting a success state. A dynamic status change may need a separate
polite announcement; do not make every chip a live region.

## Themes and layout

The shared component uses semantic colours and pill radius in both themes. Keep
the status text present and verify application-specific tone mappings. Chips
should fit short labels; allow the parent row to reflow without hiding the
status on mobile. Use a full explanation elsewhere for complex errors.

## Related primitives

Use [Tag](/components/tag/) for categories or removable values,
[Badge](/components/badge/) for counts and filter buttons for changing results.
Avoid using an accent tone to imply success or relying on chip colour to
communicate an overdue date.
