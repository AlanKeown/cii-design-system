---
title: Community portal
description: Community portal in the CII Design System.
---

Common Ground is the reference application for the design system. It
demonstrates members, programs, events, donations, support cases, reports and
administration.

## Try the live demo

[Open the Common Ground community portal](https://cii-community-portal.pages.dev).
The demo uses fictional records stored in your browser. Changes are local to
that browser and are not shared with other users.

## Run locally

```sh
npm run dev:portal
```

Open **<http://localhost:5187>**. The development URL is local to your machine.
Use the live demo link above when sharing the portal with others.

## Shared implementation

The portal imports the same Button, TextField, Alert and StatusChip components
shown in these docs. It also uses the generated token stylesheet for light and
dark themes.

Business data, role previews, navigation, local persistence and record workflows
live in `apps/community-portal`.

## Documentation coverage

| Portal surface                 | Guides                                                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar, workspace and toolbar | [App shell](/components/app-shell/), [permissions](/patterns/permissions/), [avatar](/components/avatar/), [badges](/components/badge/), [icon buttons](/components/icon-button/) |
| Headings and dashboard         | [Page heading](/patterns/page-heading/), [dashboard](/patterns/dashboard/), [cards](/components/card/)                                                                            |
| Record lists                   | [Data table](/components/data-table/), [search/filter bar](/components/search-filter-bar/), [disclosure](/components/disclosure/), [pagination](/components/pagination/)          |
| Selection and downloads        | [Bulk actions and export](/patterns/bulk-actions/)                                                                                                                                |
| Create/edit and drafts         | [Record forms](/patterns/record-forms/), [modal](/components/modal/), [number/currency input](/components/number-input/)                                                          |
| Record inspection              | [Record detail](/patterns/record-detail/), [drawer](/components/drawer/), [tabs](/components/tabs/), [activity](/components/activity-timeline/)                                   |
| Reports                        | [Reporting and date ranges](/patterns/reporting/), [date input](/components/date-input/)                                                                                          |
| Appearance                     | [Tokens](/foundations/tokens/), [responsive layout](/foundations/responsive-layout/), [iconography](/foundations/iconography/)                                                    |

The [catalogue](/components/) separates five shared exports (four from
`@cii/svelte` and Map from `@cii/maps/svelte`) from application guidance.
Multiselect, Radio group and Tag are documented future patterns without current
portal examples. Toggle guidance records the distinction between a switch and
the existing theme action button.

Component and pattern guides document implemented accessibility behaviour and
remaining gaps, including draft lifecycle, production authorization and
hardcoded theme values. This documentation pass does not extract new shared
components or change portal behaviour.

## Existing data

The migration retains the `community-portal-v1` local storage key and per-module
draft keys. Browser storage is origin-specific: using the same hostname and port
keeps existing demo data available.

## Scope

The portal is a demonstration using fictional data. Its role selector previews
access; production authorization must be enforced by a backend. Attendance
counts, reports and audit information retain the original demo limitations.
