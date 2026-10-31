---
title: Date input
description: Enter a calendar date with clear limits and validation.
---

Enter a calendar date with clear limits and validation.

**Implementation: application guidance.** This component is not exported by `@cii/svelte`. The contract below describes responsibilities for an application implementation; it is not a package API. Code examples show semantic structure, with application behaviour described separately.

## Usage and variants

Use for date-only values such as due dates and event dates. Use two labelled controls for a range and follow the [reporting pattern](/patterns/reporting/). Store date-only values separately from timestamps.

## Application contract

| Concern | Required behaviour |
| --- | --- |
| Value | Use an ISO date value (YYYY-MM-DD) at the application boundary; display dates for the user locale. |
| Limits | Explain minimum/maximum dates, requiredness and any business-day restrictions. |
| Validation | Validate on blur and submission, associate the error and retain the attempted value where the browser permits. |

## Structure example

```html
<label for="due-date">Due date</label>
<p id="date-hint">Choose the day the follow-up is due.</p>
<input id="due-date" type="date" name="dueDate" required aria-describedby="date-hint" />
```

## States and feedback

Support empty, valid, focused, invalid, read-only and disabled states. Explain missing or out-of-range dates in text. A range with its end before its start must show a linked error and block running/exporting that invalid range.

## Keyboard and accessibility

Use a visible label and native keyboard entry/picker behaviour. Explain any typed format when using a text fallback. Do not require pointer interaction with a calendar. Link hints and errors using aria-describedby.

## Themes and responsive layout

Use input surface, border, radius and focus tokens. Native pickers follow browser/platform conventions. Stack paired date controls on narrow screens and preserve the labels “From” and “To”.

## Avoid

Avoid timezone conversion of date-only values through UTC midnight. Do not use an ambiguous numeric date format as the only instruction.

## Portal reference and implementation limits

`+page.svelte`: report From/To and record Date/Due date. Display formatting uses en-AU and Australia/Sydney. Report range errors currently do not prevent CSV export; record date errors have aria-invalid but lack an error description association.

Run the [community portal](/examples/community-portal/) to inspect the application. This reference does not certify that it meets every requirement above. See [foundations](/foundations/tokens/) and [responsive layout](/foundations/responsive-layout/).
