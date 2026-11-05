---
title: Icon button
description: Trigger a compact action with an explicit accessible name.
---

Trigger a compact action with an explicit accessible name.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Use for familiar toolbar actions such as Close, Open navigation and Change
theme. Use a visible text button when the action is unfamiliar or consequential.
Pair unfamiliar glyphs with text and follow
[iconography](/foundations/iconography/).

## Application contract

| Concern | Required behaviour                                                                      |
| ------- | --------------------------------------------------------------------------------------- |
| Name    | Provide an action-oriented accessible name; an icon or title alone is insufficient.     |
| State   | Expose expanded/controls for disclosures or pressed for a true toggle button.           |
| Target  | Provide a minimum 40px target as the shared button baseline, with a visible focus ring. |

## Structure example

```html
<button type="button" aria-label="Close record">
  <span aria-hidden="true">×</span>
</button>
```

## States and feedback

Support default, hover, focus, active, disabled and busy states. A loading icon
must retain the action name. A tooltip may repeat the name on hover/focus but
cannot be its only source. Explain disabled actions nearby when needed.

## Keyboard and accessibility

Native buttons support Space/Enter. Keep the glyph decorative and expose one
meaningful name. A navigation opener needs aria-expanded and aria-controls. A
theme action may use the changing action label “Use dark theme”; a switch uses a
stable setting label instead.

## Themes and responsive layout

Use shared button surface, border, radius and focus tokens. Preserve contrast
for both glyph and ring in both themes. Maintain the target size on mobile; hide
redundant text only when the accessible name remains available.

## Avoid

Avoid guessing an icon variant prop: Button currently exports only primary,
secondary, tertiary and danger variants. Do not rely on Unicode pronunciation or
colour for an action name.

## Portal reference and implementation limits

`+page.svelte`: mobile-toggle, theme, notification and close actions;
`styles.css`: icon. Local targets are 38px, below the 40px shared Button
baseline. The mobile search trigger hides its text via font-size: 0 and needs
explicit name verification. No shared IconButton is exported.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
