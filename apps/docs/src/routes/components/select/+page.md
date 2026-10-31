---
title: Select
description: Choose one value from a predefined list.
---

Choose one value from a predefined list.

**Implementation: application guidance.** This component is not exported by `@cii/svelte`. The contract below describes responsibilities for an application implementation; it is not a package API. Code examples show semantic structure, with application behaviour described separately.

## Usage and variants

Prefer a native select for short, familiar lists such as status or role. Use a radio group when comparing a few options matters; use a multiselect for multiple values. A placeholder represents no selection, not a valid saved value.

## Application contract

| Concern | Required behaviour |
| --- | --- |
| Options | Supply stable values and readable labels, with a selected value owned by the application. |
| Validation | Label the control, explain required selection and associate errors with its ID. |
| Changes | State whether selection applies immediately or waits for Save; reset dependent pagination when filtering. |

## Structure example

```html
<label for="case-status">Status</label>
<select id="case-status" name="status">
  <option value="open">Open</option>
  <option value="in-progress">In progress</option>
  <option value="closed">Closed</option>
</select>
```

## States and feedback

Document placeholder, selected, disabled and invalid values. While options load, explain the wait and disable selection only as needed. If loading fails, retain an existing valid selection and offer retry; never silently select the first new option.

## Keyboard and accessibility

Keep native keyboard selection and type-ahead. Use a visible label, a unique ID and aria-describedby for guidance/errors. Avoid custom listbox roles around a native select.

## Themes and responsive layout

Use input tokens and sufficient space for the native arrow. Let labels wrap and controls fill narrow layouts. Verify option readability in the platform picker for both themes.

## Avoid

Avoid automatically navigating or submitting a destructive change on selection. Do not use unexplained abbreviations or an enormous unsorted list.

## Portal reference and implementation limits

`+page.svelte`: role preview, status filters, report module and record fields. Filters apply immediately; fields in the record dialog apply on Save. The native controls remain local to the portal.

Run the [community portal](/examples/community-portal/) to inspect the application. This reference does not certify that it meets every requirement above. See [foundations](/foundations/tokens/) and [responsive layout](/foundations/responsive-layout/).
