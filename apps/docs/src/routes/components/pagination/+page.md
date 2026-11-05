---
title: Pagination
description: Move through a result set while preserving its criteria.
---

Move through a result set while preserving its criteria.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Place pagination after the result region. Show current page, total pages, result
range and total records. Use previous/next controls for small sets; add
page-number controls when direct jumps are useful. Explain the selected page
size if it can change.

## Application contract

| Concern     | Required behaviour                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------- |
| Position    | Own page, page size and total; reset page when criteria/page size changes.                          |
| Boundaries  | Disable previous on the first page and next on the final page; clamp page after deletion/filtering. |
| Remote data | Preserve criteria while loading and define whether the API uses total counts or next-page cursors.  |

## Structure example

```html
<nav aria-label="Members pagination">
  <p>1–5 of 18 members · Page 1 of 4</p>
  <button type="button" disabled>Previous</button>
  <button type="button">Next</button>
</nav>
```

## States and feedback

Support first, middle, last, zero-results, loading and failed-page states. Zero
results display 0 records, not an impossible range. Prevent repeat paging while
a remote request is pending and keep the last successful page after a failed
request.

## Keyboard and accessibility

Label the pagination landmark and use aria-current="page" for numbered
current-page links. Button labels should describe direction; announce the loaded
range politely. Keep focus predictable and make the result heading easy to reach
after paging.

## Themes and responsive layout

Use button and text tokens in both themes. Keep Previous/Next labels usable on
small screens; wrap totals rather than shrinking them into tiny text. Do not
rely on hidden page information as the only orientation.

## Avoid

Avoid resetting search on page change, jumping to a blank page after archive or
showing a false total for a cursor-based API.

## Portal reference and implementation limits

`+page.svelte`: table-footer slices five records per page. Previous/Next have
boundary states. Page text hides below 1280px and buttons shrink on mobile. The
current page is not clamped after bulk archive changes filtered results; there
is no page-size chooser or remote paging.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
