---
title: Checkbox
description: Select independent options or records.
---

Select independent options or records.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Use a checkbox for each independent choice. Use a
[radio group](/components/radio-group/) for one choice from a set, or a
[toggle](/components/toggle/) for an immediate setting. Table selection includes
an aggregate checkbox for the visible page.

## Application contract

| Concern         | Required behaviour                                                                         |
| --------------- | ------------------------------------------------------------------------------------------ |
| Checked         | Track a boolean for each choice and submit stable values.                                  |
| Mixed           | Set the native indeterminate property when some, but not all, target records are selected. |
| Selection scope | Label whether select-all means the visible page, filtered results or all records.          |

## Structure example

```html
<label>
  <input type="checkbox" name="showLocation" checked />
  Show location
</label>
```

## States and feedback

Support unchecked, checked, indeterminate, focus, disabled and invalid states.
Keep disabled selected choices visible. For a required acknowledgement explain
why it is needed; do not preselect consent. Announce selection totals after bulk
changes.

## Keyboard and accessibility

Native checkboxes toggle with Space and participate in normal Tab order. Make
the visible label clickable. An icon-only table cell still needs a
record-specific accessible label. Set indeterminate through the DOM property
rather than an HTML attribute.

## Themes and responsive layout

Use a visible outline/checkmark in both themes; colour alone cannot show
selection. Keep the control at least 16px visually with a comfortably padded
label target. Wrap option labels on small screens.

## Avoid

Avoid a checkbox that performs a destructive action immediately. Do not imply
that all filtered records are selected when only the current page is selected.

## Portal reference and implementation limits

`+page.svelte`: visible-row selection, per-row selection and View options.
Select-all covers only the visible page and selection can span pages. The
aggregate checkbox currently has no indeterminate state.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
