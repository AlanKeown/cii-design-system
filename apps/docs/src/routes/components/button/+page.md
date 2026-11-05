---
title: Button
description: Button in the CII Design System.
---

<script lang="ts">
  import ButtonExample from '#lib/examples/ButtonExample.svelte';
</script>

Use buttons for actions such as adding a record, submitting a form or opening a
dialog. Use a link when the primary purpose is navigation.

<ButtonExample />

## Usage

```svelte
<script lang="ts">
  import { Button } from '@cii/svelte';
</script>

<Button onclick={save}>Save member</Button>
<Button variant="secondary" onclick={cancel}>Cancel</Button>
<Button type="submit" loading={saving}>Save changes</Button>
```

## Properties

| Property   | Type                                 | Default |
| ---------- | ------------------------------------ | ------- |
| `variant`  | primary, secondary, tertiary, danger | primary |
| `loading`  | boolean                              | false   |
| `disabled` | boolean                              | false   |
| `type`     | button, submit, reset                | button  |
| `children` | Svelte snippet                       | —       |

Native button attributes and event handlers are forwarded. Set `type="submit"`
explicitly for form submission.

## Behaviour and accessibility

- Use a clear verb-first label. Keep the label present while loading.
- Loading disables activation and sets `aria-busy`.
- Native buttons support Enter and Space activation.
- Focus uses the shared focus-ring token.
- A disabled button cannot receive keyboard focus; explain unavailable actions
  nearby.
- Confirm destructive operations in the application before applying them.

Prefer one primary action per task. The danger variant communicates risk but
does not implement a confirmation workflow.

## Variants and states

| Variant   | Use                                                   |
| --------- | ----------------------------------------------------- |
| Primary   | The main task action, such as Save member             |
| Secondary | A supporting action, such as Cancel or Export         |
| Tertiary  | A low-emphasis action within an established context   |
| Danger    | A consequential action with an explicit outcome label |

Default, hover, focus, disabled and loading styles are implemented by the shared
component. There is no separate active/pressed style; a persistent toggle needs
an explicit state contract. A failed action is application feedback, not a
button variant: keep entered values and show a persistent explanation. Loading
prevents repeat activation, but the application still owns request completion
and retry.

## Themes and responsive layout

Use the inherited action, surface, text, border and focus tokens in light and
dark themes. The shared button has a 40px minimum height and a 10px radius. Let
action groups wrap on mobile; retain readable labels and do not shrink hit
areas. The spinner honours reduced motion. Verify any application class
overrides, especially semantic text/surface pairings in danger actions.

## Icon actions and anti-patterns

See [Icon button](/components/icon-button/) for compact actions and accessible
names. There is no `icon` variant or shared IconButton export. Do not use a
button for a plain destination, nest interactive controls or use an unexplained
“OK” for a destructive action. Follow
[bulk confirmation](/patterns/bulk-actions/) for archive workflows.
