---
title: Number and currency input
description: Collect structured numeric values with explicit units and precision.
---

Collect structured numeric values with explicit units and precision.

**Implementation: application guidance.** This component is not exported by `@cii/svelte`. The contract below describes responsibilities for an application implementation; it is not a package API. Code examples show semantic structure, with application behaviour described separately.

## Usage and variants

Use for donation amounts and other quantities that support arithmetic. Keep identifiers, postcodes and phone numbers as text. State the currency in the visible label and use a deliberate locale/rounding policy.

## Application contract

| Concern | Required behaviour |
| --- | --- |
| Value | Represent empty separately from zero; reject non-finite values and validate at the server boundary. |
| Units and precision | Specify currency/unit, allowed decimal places, minimum, maximum and step. |
| Errors | Validate on blur and submit; link error text and retain the attempted amount after failure. |

## Structure example

```html
<label for="donation-amount">Amount (AUD)</label>
<p id="amount-hint">Enter an amount greater than zero, with up to two decimal places.</p>
<input id="donation-amount" type="number" name="amount" min="0.01" step="0.01" required aria-describedby="amount-hint" />
```

## States and feedback

Support empty, zero, positive, out-of-range, excess-precision, disabled and read-only values. Explain invalid input with units, for example “Enter at least AUD 0.01”. Do not silently round while typing. An amount rejected on save remains editable.

## Keyboard and accessibility

A native number input has spinbutton semantics and browser keyboard behaviour; retain its label and constraint hints. A text input with inputmode="decimal" is an alternative when locale-aware parsing is implemented. Do not add spinbutton roles to unimplemented custom controls.

## Themes and responsive layout

Use input surface, border, radius, error and focus tokens. Keep the unit visible and allow full-width reflow. Display saved amounts using locale-aware formatting and the same precision policy in both themes.

## Avoid

Avoid using floating-point display rounding as accounting storage. Do not show a positive fractional donation as zero because a summary omits decimals.

## Portal reference and implementation limits

`+page.svelte`: Amount (AUD), validate('amount') and money(). The native input sets min=0.01 and step=0.01, but the custom novalidate form only checks positivity, not finite values or two-decimal precision. Errors lack aria-describedby. Display formatting currently rounds money to whole dollars; production accounting requires a consistent minor-unit/decimal policy.

Run the [community portal](/examples/community-portal/) to inspect the application. This reference does not certify that it meets every requirement above. See [foundations](/foundations/tokens/) and [responsive layout](/foundations/responsive-layout/).
