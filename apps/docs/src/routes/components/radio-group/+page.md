---
title: Radio group
description: Choose one option from a small set of alternatives.
---

Choose one option from a small set of alternatives.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Use when people should compare all choices before selecting one. Use a select
for longer sets and checkboxes for independent choices. Prefer a vertical group
when labels or descriptions are long.

## Application contract

| Concern         | Required behaviour                                                                    |
| --------------- | ------------------------------------------------------------------------------------- |
| Group           | Provide one shared name, a legend and unique values.                                  |
| Selection       | Own one selected value, or an empty value when a deliberate choice is required.       |
| Help and errors | Place group guidance before the choices and associate errors with the group/controls. |

## Structure example

```html
<fieldset>
  <legend>Contact preference</legend>
  <label><input type="radio" name="contact" value="email" /> Email</label>
  <label><input type="radio" name="contact" value="phone" /> Phone</label>
</fieldset>
```

## States and feedback

Support unselected, selected, focused, disabled options and a group validation
error. Explain disabled choices nearby. A loading or failed option source should
not clear an existing valid choice.

## Keyboard and accessibility

Use native radios inside fieldset/legend. Arrow keys move selection within the
group and Space selects the focused option. Tab enters/leaves the native group.
Do not make every radio a separate custom tab stop.

## Themes and responsive layout

Use input and focus tokens, maintain a visible selected dot and keep full labels
clickable. Stack choices on mobile rather than shrinking text.

## Avoid

Avoid two unrelated binary settings in one radio group, or preselecting a
consequential choice without making the default clear.

## Portal reference and implementation limits

No radio group is used in the current portal. This guidance covers a specified
component for future forms; there is no shared implementation or live example.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
