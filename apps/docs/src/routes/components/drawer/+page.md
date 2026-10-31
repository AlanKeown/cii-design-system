---
title: Drawer
description: Show contextual record details beside the current view.
---

Show contextual record details beside the current view.

**Implementation: application guidance.** This component is not exported by `@cii/svelte`. The contract below describes responsibilities for an application implementation; it is not a package API. Code examples show semantic structure, with application behaviour described separately.

## Usage and variants

Use a right-side drawer when a person needs to inspect a record without losing list context. Choose modal behaviour when the list is unavailable during inspection; choose non-modal only when both regions remain usable. Compose record content using the [record detail pattern](/patterns/record-detail/).

## Application contract

| Concern | Required behaviour |
| --- | --- |
| Context | Own the selected record ID and keep list criteria/page intact while inspecting it. |
| Modality | Specify whether background content is inert and whether focus is contained. |
| Dismissal | Provide a named close action, Escape handling and a defined backdrop/unsaved-change policy. |

## Structure example

```html
<section role="dialog" aria-modal="true" aria-labelledby="detail-title" tabindex="-1">
  <button type="button" aria-label="Close record">×</button>
  <h2 id="detail-title">Alex Example</h2>
  <p>Member M-101</p>
</section>
```

## States and feedback

Support opening, loading, populated, unavailable record, failed loading and closing. Retain context on update failures and show retry inside the drawer. When deleting the current record, close and focus a remaining row or the list heading.

## Keyboard and accessibility

A modal drawer needs a named dialog, background inertness, initial focus, focus containment and focus restoration. aria-modal alone does not implement these behaviours. A non-modal drawer must allow Tab to leave and must not claim aria-modal.

## Themes and responsive layout

Use card/text/border tokens and an overlay whose contrast works in both themes. The portal uses min(540px, 100%) width; allow full width on mobile with internal vertical scrolling. Avoid hiding content behind fixed controls.

## Avoid

Avoid trapping focus in non-modal content, opening another overlay without transferring focus or clearing list filters when the drawer closes.

## Portal reference and implementation limits

`RecordDrawer.svelte` uses a named native modal dialog; `modal-dialog.ts` supplies initial focus, keyboard wrapping and focus restoration. The browser makes background content inert. Escape, the close button and backdrop clicks dismiss it. Editing transfers focus into the form; closing that form restores the original record trigger when it remains available.

Run the [community portal](/examples/community-portal/) to inspect the application. This reference does not certify that it meets every requirement above. See [foundations](/foundations/tokens/) and [responsive layout](/foundations/responsive-layout/).
