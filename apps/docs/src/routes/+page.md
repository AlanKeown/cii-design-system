---
title: CII Design System
description: Build services that bring people together.
tagline: Reusable Svelte components and practical patterns for community organisations.
heroImage: false
actions:
  - label: Get started
    to: /getting-started/
    type: primary
  - label: Explore components
    to: /components/
---



Reusable Svelte components, shared design tokens and practical guidance for community organisations.

The system uses deep blue and lilac, accessible forms, clear feedback and layouts that support everyday operational work. The Common Ground portal is the reference application.

## Start building

- [Get started](/getting-started/) — run the workspace and use the shared packages.
- [Design tokens](/foundations/tokens/) — colours, typography, spacing and themes.
- [Components](/components/) — the complete catalogue, availability, live examples and planned components.
- [Patterns](/patterns/) — compose dashboards, record forms/details, reports and bulk workflows.
- [Community portal](/examples/community-portal/) — see the components in a working application.

## Available in this release

| Component | Purpose |
| --- | --- |
| [Button](/components/button/) | Trigger actions with consistent emphasis |
| [Text field](/components/text-field/) | Collect labelled text with hints and errors |
| [Alert](/components/alert/) | Explain information, success, warnings and failures |
| [Status chip](/components/status-chip/) | Show a concise record status |

These components are used by both the documentation and the portal. The [complete component catalogue](/components/) also includes application-level guides for the remaining controls and portal primitives. Each describes usage, state, keyboard behaviour, themes, responsive layout and current implementation limits. These documented contracts do not add shared exports or claim that every portal behaviour has been verified.

## Built for Svelte

The documentation uses SveltePress on SvelteKit 3. The shared components use Svelte 5 and work independently of the portal, its data and its role model.


