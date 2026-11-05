---
title: Iconography
description: Use consistent symbols with clear names and accessible meaning.
---

Use icons to reinforce familiar actions, not replace labels for unfamiliar
tasks. The repository does not yet provide a shared icon package or a canonical
SVG set.

## Meaning and naming

| Meaning      | Preferred accompanying text or accessible name        |
| ------------ | ----------------------------------------------------- |
| Search       | Search records / Search anything                      |
| Close        | Close record / Close form / Close search              |
| Navigation   | Open navigation, with expanded state                  |
| Theme        | Use dark theme / Use light theme for an action button |
| Export       | Export CSV                                            |
| Add          | Add member, Add event or another concrete record type |
| Warning      | A textual reason such as Overdue or Could not save    |
| Notification | View activity, with an unread count only when tracked |

Use one visual symbol consistently for each meaning. A module decoration is not
automatically the right icon for a global action. Unicode glyphs vary across
operating systems and may be rendered or spoken differently; the portal's
symbols are local placeholders rather than a reusable icon vocabulary.

## Structure and accessibility

Hide a decorative icon using aria-hidden when visible text or the parent control
supplies its name. [Icon buttons](/components/icon-button/) need a
purpose-specific accessible name on the button. Never make the glyph's
pronunciation the control label. An icon conveying status requires visible
explanatory text.

```html
<button type="button" aria-label="Close search">
  <span aria-hidden="true">×</span>
</button>
```

If adding SVG assets, keep a consistent viewBox, stroke weight and optical size;
decorative SVGs should not be independent focus targets. Do not introduce a fake
Icon import before a library asset/API exists.

## Size, themes and states

Use a consistent optical size within each toolbar, with a sufficiently large
button target. Let icons inherit an appropriate text colour; use semantic colour
only when there is corresponding text. Verify contrast and focus in light/dark
themes. Disabled/loading actions keep their accessible names. Rotate or animate
only when it communicates progress, and honour reduced motion.

## Portal reference

`apps/community-portal/src/routes/+page.svelte`: icons array, topbar glyphs,
task symbols and decorative artwork. `styles.css`: nav-icon, icon and
metric-icon. The portal mixes Unicode symbols and local sizes/colours. Its
notification glyph and static dot do not represent a complete notification
subsystem.
