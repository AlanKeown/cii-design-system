---
title: Search and filter bar
description: Find records and preserve understandable filter criteria.
---

Find records and preserve understandable filter criteria.

**Implementation: application guidance.** This component is not exported by `@cii/svelte`. The contract below describes responsibilities for an application implementation; it is not a package API. Code examples show semantic structure, with application behaviour described separately.

## Usage and variants

Combine quick search, status filters, result totals and saved views above a [data table](/components/data-table/). Treat status shortcut buttons as filters unless they actually switch tab panels. Offer one clear reset action.

## Application contract

| Concern | Required behaviour |
| --- | --- |
| Criteria | The application owns query, filters, sort and page; changing criteria resets the page. |
| Results | Show the filtered total and announce updates politely without moving focus. |
| Saved views | Define which criteria are saved, name the view and explain storage scope and restoration. |

## Structure example

```html
<form role="search" aria-label="Find members">
  <label for="member-query">Search members</label>
  <input id="member-query" type="search" name="query" />
  <label for="member-status">Status</label>
  <select id="member-status" name="status"><option>All statuses</option><option>Active</option></select>
  <button type="reset">Clear filters</button>
</form>
<p role="status">12 members found</p>
```

## States and feedback

Support no criteria, active criteria, loading, results, no matches and failed loading. Keep criteria during failures and retries. For remote search, debounce requests and ignore stale responses. Clearing filters resets criteria and returns to page one.

## Keyboard and accessibility

Label every input independently of its placeholder. Keep keyboard focus in the edited control while results change. Active filter removal buttons need names such as “Remove Active status filter”. Do not apply tab roles to buttons that only filter one result set.

## Themes and responsive layout

Use input tokens and allow controls to wrap, with search spanning the row on mobile. Keep reset and result counts visible. Use [disclosure](/components/disclosure/) guidance for View options.

## Avoid

Avoid silently changing criteria when switching pages, moving focus after every keystroke or treating a saved view as a separate authorization scope.

## Portal reference and implementation limits

`+page.svelte`: controls, table-tabs and saveView(). Saved views persist name, module, query, status and sort in browser storage; they omit sort direction, density and column visibility. Naming uses window.prompt. Search is client-side; result updates lack a dedicated live announcement.

Run the [community portal](/examples/community-portal/) to inspect the application. This reference does not certify that it meets every requirement above. See [foundations](/foundations/tokens/) and [responsive layout](/foundations/responsive-layout/).
