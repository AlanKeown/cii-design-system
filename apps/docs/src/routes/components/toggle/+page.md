---
title: Toggle
description: Change a binary setting with an immediate effect.
---

Change a binary setting with an immediate effect.

**Implementation: application guidance.** This component is not exported by `@cii/svelte`. The contract below describes responsibilities for an application implementation; it is not a package API. Code examples show semantic structure, with application behaviour described separately.

## Usage and variants

Use for settings such as theme or notifications when the change applies immediately. Use a checkbox for choices submitted with a form. Keep the label stable when the state changes: “Email notifications”, rather than alternating “Enable” and “Disable”.

## Application contract

| Concern | Required behaviour |
| --- | --- |
| State | Expose the current boolean, a stable accessible name and whether a change is pending. |
| Persistence | Apply the change immediately; persist it in the application and roll back or explain failure. |
| Feedback | Use checked state for the setting, not colour or icon alone. |

## Structure example

```html
<label>
  <input type="checkbox" role="switch" name="emailNotifications" />
  Email notifications
</label>
```

## States and feedback

Support off, on, focus, disabled and pending/failed updates. Prevent duplicate requests while saving. On failure explain whether the previous state was restored and provide a retry path.

## Keyboard and accessibility

A native checkbox with role="switch" exposes its checked state and supports Space. A button-based switch must expose aria-checked and support Space and Enter. Do not change the accessible name with the state.

## Themes and responsive layout

Use a distinct thumb position or an explicit On/Off label in addition to colour. Ensure both positions and focus rings are visible in light/dark themes; honour reduced motion.

## Avoid

Avoid a switch for a multi-option choice or a setting that only takes effect after a separate Save action. Do not hide a save failure in a disappearing message.

## Portal reference and implementation limits

The portal theme action is an icon button with an action label (“Use dark theme”), not a switch. View options uses native checkboxes. No shared Toggle is exported; do not relabel those controls as an implemented switch.

Run the [community portal](/examples/community-portal/) to inspect the application. This reference does not certify that it meets every requirement above. See [foundations](/foundations/tokens/) and [responsive layout](/foundations/responsive-layout/).
