---
title: Bulk actions and export
description: Define selection scope and confirm consequential record changes.
---

Keep record selection separate from search, paging and export scope. Make the number and scope of affected records visible before applying an action.

## Selection contract

- Label aggregate selection precisely: “Select all visible records” selects this page only.
- A partial page selection uses an indeterminate checkbox.
- Keep selection keyed by stable IDs when paging; explain whether changing criteria clears it.
- Show the selected count and a Clear selection action in the bulk toolbar.
- If selection includes hidden/off-page records, state that before export or archive.

Use the [data table](/components/data-table/) and [checkbox](/components/checkbox/) contracts. Do not silently expand a visible-page selection to the full dataset.

## Archive workflow

1. Offer Archive selected only to permitted roles.
2. Name the number and consequence in a confirmation: “Archive 3 records? Their status will change to Archived.”
3. Provide Cancel and a specific confirm label; initial focus should favour the safe action.
4. While applying, prevent duplicate actions and keep the selection visible.
5. On success, announce the result, refresh rows and clamp pagination.
6. On partial failure, report successes/failures and retain failed selections for retry.

Use the [modal](/components/modal/) contract. Browser confirm is a demo fallback, not a styled design-system confirmation. If Undo is available, explain its duration and keep it reachable.

## Export scopes

| Action | Expected contents |
| --- | --- |
| Export CSV on a record list | All filtered rows, across pages |
| Export selected | Selected records, including off-page selection when explicitly retained |
| Export report | The chosen report and validated date range |

Use a descriptive filename and announce when the browser download starts; do not claim the file has been saved to disk. Preserve quoted values, Unicode and newlines, and neutralise spreadsheet formula prefixes. A production export must enforce authorization server-side and define which fields are permitted, their ordering and date/currency formats.

## States, accessibility and layout

Hide the selection toolbar when no records are selected. Keep selected totals readable and announce changes politely. Controls need visible labels, keyboard focus and enough room to wrap on mobile. Use semantic danger styling for a consequential action, but always include explicit consequence text. Failures remain visible until resolved, in both themes.

## Portal reference and limits

`apps/community-portal/src/routes/+page.svelte`: toggleRow(), bulkArchive(), download() and selection-bar. The demo preserves page-spanning selection, clears it on module navigation and uses browser confirm for archive. CSV export quotes fields, escapes quotes and prefixes dangerous leading formula characters. Field names/order come from record object keys rather than a designed export schema. There is no asynchronous partial-failure model, Undo, or page clamping after archive.
