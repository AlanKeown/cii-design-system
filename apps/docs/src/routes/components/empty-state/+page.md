---
title: Empty state
description: Explain why a view has no content and offer a useful next step.
---

Explain why a view has no content and offer a useful next step.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Distinguish first use (“No members yet”), no matches (“No members match these
filters”) and unavailable data (“Members could not be loaded”). Tailor the
action: add a first record, clear filters or retry. An authorization restriction
is not an empty dataset.

## Application contract

| Concern   | Required behaviour                                                                      |
| --------- | --------------------------------------------------------------------------------------- |
| Reason    | Choose a truthful reason based on data/loading/error state.                             |
| Action    | Offer the most relevant permitted next step and retain existing criteria when retrying. |
| Placement | Keep empty feedback inside the region that would contain the results.                   |

## Structure example

```html
<section aria-labelledby="no-members">
  <h2 id="no-members">No members match these filters</h2>
  <p>Try a different name or clear your filters.</p>
  <button type="button">Clear filters</button>
</section>
```

## States and feedback

Loading, genuinely empty, no matches and failed loading must be distinct. Do not
briefly flash an empty state before initial data loads. When results become
empty after an action, preserve useful context and announce the updated count.

## Keyboard and accessibility

Use a meaningful heading and explanation; hide decorative artwork. Keep the
action keyboard accessible and do not automatically move focus when filtering
produces no results. In tables use a cell spanning the current visible columns.

## Themes and responsive layout

Use ordinary text tokens and a restrained surface treatment in both themes. Keep
content concise, readable and inside the parent region on narrow screens.

## Avoid

Avoid blaming language, a “Create” action for read-only users or reporting an
error as “No records”.

## Portal reference and implementation limits

`+page.svelte`: no table results, no upcoming events, empty activity and command
no-results. The record table has a fixed colspan of 7 even when a column is
hidden. Some dashboard calls to create records are based on module visibility
rather than a complete production permission model.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
