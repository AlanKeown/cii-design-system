---
title: Disclosure and popover
description: Reveal optional controls without leaving the current task.
---

Reveal optional controls without leaving the current task.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Use native details/summary for a simple expandable section. A floating View
options panel is a disclosure styled as a popover, not an ARIA menu: it contains
checkboxes and ordinary buttons. Use a modal when the task must block the
background.

## Application contract

| Concern    | Required behaviour                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| Open state | Native details owns open state; a custom trigger must expose aria-expanded and aria-controls.        |
| Dismissal  | Define summary/trigger toggling, Escape, outside-click and focus return when using a floating panel. |
| Placement  | Keep the panel inside the viewport and above its content without obscuring essential actions.        |

## Structure example

```html
<details>
  <summary>View options</summary>
  <label><input type="checkbox" checked /> Show location</label>
  <label><input type="checkbox" /> Compact rows</label>
</details>
```

## States and feedback

Support closed, open, focused trigger and individual control states. Keep
changes applied when the panel closes unless it explicitly offers Apply/Cancel.
Failed saves belong near the affected option and must not silently close the
panel.

## Keyboard and accessibility

Native summary supports Space/Enter and exposes expansion. Tab reaches the
revealed controls; a non-modal disclosure must not trap focus. A custom floating
implementation should close with Escape and restore the trigger when
appropriate. Do not add menu roles without menu keyboard behaviour.

## Themes and responsive layout

Use card/border/text tokens for floating surfaces and a visible focus ring. On
mobile align to the available viewport or render inline. Do not rely on a shadow
as the sole boundary in dark mode.

## Avoid

Avoid hover-only access, nested interactive controls inside summary or a popup
clipped by the table's scroll container.

## Portal reference and implementation limits

`+page.svelte`: details.view-options; `styles.css`: absolutely positioned
view-options panel. Native toggle and checkbox behaviour works without a custom
widget. Escape/outside-click dismissal and viewport collision handling are not
implemented.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
