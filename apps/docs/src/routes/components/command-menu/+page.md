---
title: Command menu
description: Find accessible records and perform quick actions.
---

Find accessible records and perform quick actions.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Offer global search and a short set of role-permitted commands. Open from a
visible search trigger and Control+K or Command+K. Group results by record type
when helpful and distinguish search results from create actions.

## Application contract

| Concern    | Required behaviour                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| Open state | Own opening/closing, initial query policy and the element to receive focus on close.                      |
| Results    | Supply stable result IDs, names, type/context and authorized actions; cap results with a way to see more. |
| Activation | Define whether results use native buttons/links or a combobox/listbox keyboard model.                     |

## Structure example

```html
<section role="dialog" aria-modal="true" aria-labelledby="command-title">
  <h2 id="command-title">Search and quick actions</h2>
  <label for="global-search">Search accessible records</label>
  <input id="global-search" type="search" />
  <ul><li><button type="button">Alex Example — Members</button></li></ul>
  <button type="button">Close search</button>
</section>
```

## States and feedback

Support closed, empty-query quick actions, typing, loading, matching results, no
results and failed search. Retain the query on failure and offer retry. Explain
a result cap rather than silently concealing matches. Hide unauthorized actions
and recheck permissions when activating.

## Keyboard and accessibility

Name the modal, focus the search input on opening, make background content
inert, contain focus and restore it on close. Escape closes it. In the
native-button structure, Tab reaches results and Enter/Space activates buttons.
For an enhanced arrow-navigation model, document active result, Up/Down, Enter
and listbox relationships together; do not mix incomplete models.

## Themes and responsive layout

Use card/text/border tokens and a visible selected/focused result. Fit within
viewport height with a scrollable result region. Keep shortcut hints
platform-appropriate and accessible even if visually hidden on mobile.

## Avoid

Avoid global shortcuts that interfere with entry while another modal is open,
inaccessible icon-only mobile search or offering create actions to read-only
roles.

## Portal reference and implementation limits

`+page.svelte`: command dialog, globalResults and window keyboard handler. It
uses a native modal dialog and `modal-dialog.ts`, caps matches at eight and
retains the previous query. Initial focus goes to Search; background content is
inert, Tab/Shift+Tab wrap, and Escape restores the originating control. The
global shortcut does not open another dialog over a record or form. Search has
no loading/error model or arrow-key result navigation; results are native
buttons reached with Tab.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
