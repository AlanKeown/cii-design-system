---
title: Multiselect
description: Choose several values from a searchable set.
---

Choose several values from a searchable set.

**Implementation: application guidance.** This component is not exported by `@cii/svelte`. The contract below describes responsibilities for an application implementation; it is not a package API. Code examples show semantic structure, with application behaviour described separately.

## Usage and variants

Use for many possible categories or relationships when multiple selections are allowed. For a short fixed set use checkboxes. Show selected values as [tags](/components/tag/) and a readable count when they overflow.

## Application contract

| Concern | Required behaviour |
| --- | --- |
| Values | Own an array of stable selected IDs; preserve selections when search or result pages change. |
| Search | Filter available options without removing existing values; distinguish no matches from unavailable options. |
| Removal | Provide individually named remove actions and an explicit clear-all action. |

## Structure example

```html
<fieldset>
  <legend>Program interests</legend>
  <label><input type="checkbox" name="interests" value="food" /> Food support</label>
  <label><input type="checkbox" name="interests" value="learning" /> Learning</label>
</fieldset>
```

## States and feedback

Support empty, selected, search results, no matches, loading, invalid and disabled states. Show failed option loading inline and retain selected IDs. Explain limits such as “Choose up to three”; reject extra choices with text feedback.

## Keyboard and accessibility

The example is a native small-set alternative. A custom searchable control requires a labelled combobox with expanded state, a controlled listbox, aria-multiselectable and selected options. Specify arrow-key navigation, Enter/Space selection, Escape closing and focus retention. Removal buttons need names such as “Remove Food support”.

## Themes and responsive layout

Use card, border and text tokens; selected styling needs a check or text as well as colour. Let selected tags wrap within the input width and avoid a popup extending outside the mobile viewport.

## Avoid

Avoid inventing a shared Multiselect import: none exists yet. Do not erase selected values when the search changes or make Backspace removal the only removal method.

## Portal reference and implementation limits

The current portal has no multiselect. Record forms use single-value selects. This page defines the pattern for future multi-value fields; its custom combobox behaviour has not been implemented or tested here.

Run the [community portal](/examples/community-portal/) to inspect the application. This reference does not certify that it meets every requirement above. See [foundations](/foundations/tokens/) and [responsive layout](/foundations/responsive-layout/).
