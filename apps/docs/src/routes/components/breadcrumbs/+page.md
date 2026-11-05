---
title: Breadcrumbs
description: Show the current location within a hierarchy.
---

Show the current location within a hierarchy.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Use linked parents followed by the current location when a real hierarchy
exists. Keep breadcrumbs separate from the main module navigation. A simple
workspace/module label can be static context without pretending the parent is a
working destination.

## Application contract

| Concern    | Required behaviour                                                                         |
| ---------- | ------------------------------------------------------------------------------------------ |
| Items      | Supply ordered labels and destinations for navigable parents; mark the current page.       |
| Separators | Render separators decoratively so they are not repeatedly announced.                       |
| Overflow   | Preserve the current item and a useful parent when space is limited; label any disclosure. |

## Structure example

```html
<nav aria-label="Breadcrumb">
  <ol>
    <li><a href="?module=Dashboard">Workspace</a><span aria-hidden="true"> / </span></li>
    <li><span aria-current="page">Members</span></li>
  </ol>
</nav>
```

## States and feedback

Show normal, hovered and focused parent links and a distinct current item.
Breadcrumbs generally have no loading, validation or disabled state; unavailable
parents should be omitted or plain text rather than dead links.

## Keyboard and accessibility

Use a labelled navigation landmark and an ordered list. Keep the current item
understandable without colour; links follow ordinary Tab/Enter behaviour. Avoid
making a non-link look interactive.

## Themes and responsive layout

Use primary text for the current item and secondary text for parents/separators.
Allow wrapping or a labelled ancestor disclosure on narrow screens. Preserve
readable font sizes in both themes.

## Avoid

Avoid breadcrumbs for a flat tab set, invented parent routes or an unlabeled
ellipsis that conceals all navigation context.

## Portal reference and implementation limits

`+page.svelte`: topbar breadcrumb is a static “Workspace / module” span, not a
semantic breadcrumb navigation. Drawer module/record text is also static
context. Neither currently provides linked parents.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
