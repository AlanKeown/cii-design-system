---
title: Components
description: The complete CII Design System component catalogue and implementation status.
---

The catalogue covers the product specification and the additional primitives
found in the community portal audit. Individual controls and feedback components
have separate pages; composed workflows live in [Patterns](/patterns/).

**Shared** components are exported by a CII package and have live examples. Most
come from `@cii/svelte`; Map comes from `@cii/maps/svelte`, which builds on
`@cii/svelte`. **Application guidance** documents usage, contracts, semantic
structure, states, keyboard behaviour, themes and responsive layout, but has no
shared export. Each guide records whether the portal implements it and which
gaps remain. HTML structure examples require application behaviour where
described; they are not live widgets or invented package APIs.

| Component                                               | Purpose                                               | Implementation                           |
| ------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| [App shell](/components/app-shell/)                     | Structure the top bar, sidebar and main content.      | Application guidance                     |
| [Button](/components/button/)                           | Trigger actions with consistent emphasis.             | Shared                                   |
| [Icon button](/components/icon-button/)                 | Trigger compact, explicitly named actions.            | Application guidance                     |
| [Avatar](/components/avatar/)                           | Supplement a person's name with initials or an image. | Application guidance                     |
| [Badge and indicator](/components/badge/)               | Explain counts and contextual signals.                | Application guidance                     |
| [Text field](/components/text-field/)                   | Collect labelled text with hints and errors.          | Shared                                   |
| [Textarea](/components/textarea/)                       | Collect longer notes and descriptions.                | Application guidance                     |
| [Select](/components/select/)                           | Choose one option from a list.                        | Application guidance                     |
| [Multiselect](/components/multiselect/)                 | Choose multiple options from a list.                  | Application guidance                     |
| [Date input](/components/date-input/)                   | Enter or choose a date.                               | Application guidance                     |
| [Number and currency input](/components/number-input/)  | Enter numeric values with units and precision.        | Application guidance                     |
| [Checkbox](/components/checkbox/)                       | Select independent options or confirm a choice.       | Application guidance                     |
| [Radio group](/components/radio-group/)                 | Choose one option from a small set.                   | Application guidance                     |
| [Toggle](/components/toggle/)                           | Turn a setting on or off.                             | Application guidance                     |
| [Search and filter bar](/components/search-filter-bar/) | Find records and narrow a list.                       | Application guidance                     |
| [Data table](/components/data-table/)                   | Compare and act on structured records.                | Application guidance                     |
| [Map](/components/map/)                                 | Display declared-CRS features with Leaflet.           | Shared, first slice (`@cii/maps/svelte`) |
| [Status chip](/components/status-chip/)                 | Show a concise record status.                         | Shared                                   |
| [Tag](/components/tag/)                                 | Label and organise records with categories.           | Application guidance                     |
| [Card](/components/card/)                               | Group metrics, information or a related action.       | Application guidance                     |
| [Tabs](/components/tabs/)                               | Switch between related sections.                      | Application guidance                     |
| [Modal](/components/modal/)                             | Focus attention on a decision or contained task.      | Application guidance                     |
| [Drawer](/components/drawer/)                           | Show contextual details beside the current view.      | Application guidance                     |
| [Disclosure and popover](/components/disclosure/)       | Reveal optional controls in context.                  | Application guidance                     |
| [Toast](/components/toast/)                             | Acknowledge an action with brief feedback.            | Application guidance                     |
| [Alert](/components/alert/)                             | Explain information, success, warnings and failures.  | Shared                                   |
| [Banner](/components/banner/)                           | Present a persistent page or service message.         | Application guidance                     |
| [Empty state](/components/empty-state/)                 | Explain an empty view and offer a next step.          | Application guidance                     |
| [Activity timeline](/components/activity-timeline/)     | Show record history and audit events.                 | Application guidance                     |
| [Pagination](/components/pagination/)                   | Move through pages of records.                        | Application guidance                     |
| [Breadcrumbs](/components/breadcrumbs/)                 | Show location in a navigation hierarchy.              | Application guidance                     |
| [Command menu](/components/command-menu/)               | Find commands and perform quick actions.              | Application guidance                     |

## Shared requirements

Use [design tokens](/foundations/tokens/),
[responsive layout](/foundations/responsive-layout/) and
[iconography](/foundations/iconography/) across components. Follow the
component-specific contracts rather than treating visual similarity to the
portal as proof of accessibility.

The catalogue contains 32 guides: five shared components (four from
`@cii/svelte` and Map from `@cii/maps/svelte`) and 27 application guides.
Multiselect, Radio group and Tag are specified for future use; the portal does
not currently implement them. Toggle guidance distinguishes the portal's theme
action button from a switch.

Before promoting application guidance into a shared component, define its typed
API, implement its behaviour, add interactive light/dark examples and verify
keyboard, focus, semantics, responsive layout and feedback. Documented
requirements do not mean that extraction or verification has already happened.
