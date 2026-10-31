---
title: App shell
description: Organise navigation, workspace context and the current task.
---

Organise navigation, workspace context and the current task.

**Implementation: application guidance.** This component is not exported by `@cii/svelte`. The contract below describes responsibilities for an application implementation; it is not a package API. Code examples show semantic structure, with application behaviour described separately.

## Usage and variants

Use one shell around the application. Place the brand, workspace identity and module links in the sidebar; global search, theme and profile controls in the top bar. Main content starts with a [page heading](/patterns/page-heading/). An optional context rail must follow the main task in reading order.

Hide destinations that the current role cannot access. Keep the current module recognisable after navigation and preserve browser Back and Forward behaviour.

## Application contract

| Concern | Required behaviour |
| --- | --- |
| Navigation | Label the navigation landmark and expose the current link with aria-current="page". |
| Mobile menu | Track open state, expose aria-expanded on its trigger and restore focus when dismissed. |
| Theme and role | The application owns theme persistence and authenticated access; a role preview is only a demonstration. |

## Structure example

```html
<a href="#main-content">Skip to content</a>
<header><p>Common Ground</p></header>
<nav aria-label="Main navigation">
  <a href="?module=Members" aria-current="page">Members</a>
</nav>
<main id="main-content" tabindex="-1"><h1>Members</h1></main>
```

## States and feedback

Show active navigation using text treatment and a visual marker. Preserve landmarks during loading and mark the relevant content region busy. A failed module load belongs in main content with a retry action; an empty module still retains navigation.

## Keyboard and accessibility

Provide one main landmark and a working skip link. Mobile disclosure navigation uses ordinary links and Tab navigation. If presented as a modal sheet, make the background inert, contain focus and support Escape. Keep the trigger reachable and return focus after closing.

## Themes and responsive layout

Use page/card surfaces and border/text tokens in both themes. The portal uses a 248px sidebar, 218px at 1024–1279px and a disclosure below 1024px. At mobile widths retain search, navigation and theme controls with accessible names.

## Avoid

Do not use hidden navigation as authorization. Do not make a static workspace identity appear to be a working workspace switcher. Avoid multiple competing page scroll containers.

## Portal reference and implementation limits

`apps/community-portal/src/routes/+page.svelte`: sidebar, topbar and main-shell. Navigation uses module query parameters and reads legacy fragment links. The workspace chevron is decorative; no workspace switching or profile menu is implemented. Mobile navigation lacks a complete focus-return/disclosure contract.

Run the [community portal](/examples/community-portal/) to inspect the application. This reference does not certify that it meets every requirement above. See [foundations](/foundations/tokens/) and [responsive layout](/foundations/responsive-layout/).
