---
title: Data table
description: Compare records, select rows and perform clearly scoped actions.
---

Compare records, select rows and perform clearly scoped actions.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Use semantic tables for structured comparisons. Put search and filters above the
table and pagination below it. Offer comfortable and compact density, column
visibility, sorting and an explicit primary row action. Use a separate overflow
action when secondary actions no longer fit.

## Application contract

| Concern            | Required behaviour                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Data and sorting   | Own rows, total, sort key/direction and stable row IDs; expose sort direction on the header.      |
| Selection          | Separate visible-page selection from all-results selection and preserve stable selected IDs.      |
| Actions            | Show the selected count and define whether export/archive uses selected, filtered or all records. |
| Loading and paging | Preserve criteria during requests and reconcile the current page after data changes.              |

## Structure example

```html
<table>
  <caption>Community members</caption>
  <thead><tr>
    <th scope="col" aria-sort="ascending"><button type="button">Name</button></th>
    <th scope="col">Status</th>
  </tr></thead>
  <tbody><tr><td><a href="?member=M-101">Alex Example</a></td><td>Active</td></tr></tbody>
</table>
```

## States and feedback

Support default, sorted, selected, mixed-selection, loading, empty, no-match and
error views. Loading must not look like a genuine zero result count. Failed bulk
actions retain unsuccessful selections and explain partial results. See
[bulk actions and export](/patterns/bulk-actions/).

## Keyboard and accessibility

Use caption or an accessible table name, scope on column headers and aria-sort
on the sorted header. Sorting buttons need clear labels. Label row checkboxes by
record name and the aggregate checkbox by scope. Tab visits interactive
elements; do not impose grid arrow-key semantics on an ordinary table.

## Themes and responsive layout

Use card/subtle surfaces for body/header, border tokens for separators and a
persistent focus ring. Density changes padding rather than reducing text below a
readable size. Keep a horizontally scrollable region on small screens, make it
keyboard reachable when needed and retain meaningful column headers.

## Avoid

Avoid a clickable entire row containing nested actions, colour-only
overdue/selection states or hiding essential actions in compact mode. Do not
assume a visually sticky header supplies sort semantics.

## Portal reference and implementation limits

`+page.svelte`: record-panel, selection-bar and table-footer; `styles.css`:
table-scroll, compact and sticky thead. The portal supports page selection,
sorting, location visibility, density and export. It exposes aria-sort on the
active sort column, native mixed-selection state on the aggregate checkbox, a
table caption and polite result/selection announcements. It still lacks
per-column filters, an overflow menu and remote loading/partial-failure
handling. Overdue dates currently rely on colour.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
