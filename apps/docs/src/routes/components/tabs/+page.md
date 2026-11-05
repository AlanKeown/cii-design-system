---
title: Tabs
description: Switch between related panels within one context.
---

Switch between related panels within one context.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Use tabs when one panel is visible at a time and each tab represents a distinct
section. Use navigation links for separate destinations. Use filter buttons for
different subsets of the same table.

## Application contract

| Concern       | Required behaviour                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| Selection     | Own the selected tab ID and choose automatic activation only when panels appear without noticeable delay.             |
| Relationships | Give tabs/panels unique IDs, aria-controls and aria-labelledby relationships.                                         |
| Focus         | Use one tab stop in the tablist and move it with arrow keys; keep selection and focus distinct for manual activation. |

## Structure example

```html
<div role="tablist" aria-label="Record sections">
  <button id="overview-tab" role="tab" aria-selected="true" aria-controls="overview-panel" tabindex="0">Overview</button>
  <button id="notes-tab" role="tab" aria-selected="false" aria-controls="notes-panel" tabindex="-1">Notes</button>
</div>
<section id="overview-panel" role="tabpanel" aria-labelledby="overview-tab" tabindex="0">Record details</section>
<section id="notes-panel" role="tabpanel" aria-labelledby="notes-tab" hidden>Notes</section>
```

## States and feedback

Show selected, hover, focus and disabled states. Loading or failed panel data
stays within the selected panel with a retry action. Avoid moving selection when
data refreshes. Disabled tabs need an explanation when their absence would be
confusing.

## Keyboard and accessibility

For horizontal tabs, Left/Right move focus and Home/End reach the ends. For
manual activation, Enter/Space selects the focused tab. Tab moves into the
active panel or its first control. Hide inactive panels from focus and
accessibility APIs.

## Themes and responsive layout

Use a selected underline plus aria-selected, not colour alone. Ensure borders
and focus remain visible in both themes. Allow horizontal scrolling on narrow
screens while keeping the selected tab visible; do not shrink labels to
unreadable text.

## Avoid

Avoid tab roles without keyboard behaviour, tab order containing every tab, or
using tabs as status filters.

## Portal reference and implementation limits

`RecordDrawer.svelte`: detail-tabs renders Overview, Activity, Notes and Related
records with tab/panel ID relationships, roving tabindex and
ArrowLeft/ArrowRight/Home/End handling. Only the active tab enters the tab
order. `+page.svelte` table-tabs are status filters and remain ordinary filter
controls.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
