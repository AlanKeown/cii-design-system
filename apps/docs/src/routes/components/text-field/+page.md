---
title: Text field
description: Text field in the CII Design System.
---

<script lang="ts">
  import TextFieldExample from '#lib/examples/TextFieldExample.svelte';
</script>

Collect a short text value with a persistent label, optional hint and an error connected to the control.

<TextFieldExample />

## Usage

```svelte
<script lang="ts">
  import { TextField } from '@cii/svelte';
  let name = $state('');
  let error = $state('');
</script>

<TextField
  id="member-name"
  label="Member name"
  required
  hint="Use the name the member prefers."
  bind:value={name}
  {error}
/>
```

## Properties

| Property | Type | Default |
| --- | --- | --- |
| `id` | unique string, required | — |
| `label` | string, required | — |
| `value` | bindable string | empty |
| `type` | text, email, tel, url, search, password | text |
| `hint` | string | — |
| `error` | string | — |
| `required` | boolean | false |

Native input attributes and events are forwarded. Use distinct IDs when rendering multiple examples or records.

## Validation

The application owns validation rules and timing. Validate on blur and submit; present an error summary for multiple errors. An `error` sets `aria-invalid` and adds its message to `aria-describedby`. Any supplied `aria-describedby` is preserved.

## Accessibility and content

Use a visible label even when a placeholder is provided. Hints explain format or purpose; errors describe how to fix a problem. Required fields use the native required attribute and a visible asterisk.

Use a separate number or date control for structured numeric or date input.

## States and task feedback

Support empty, populated, focused, required and invalid fields. Native disabled and readonly attributes are forwarded: disabled values cannot be edited or submitted, while read-only values remain available to inspect/copy. Errors appear after application validation, not simply because a required field starts empty.

The application owns loading/saving and must retain input after a failed save. Do not clear the error until revalidation confirms it is resolved. If multiple fields fail, follow the [record form](/patterns/record-forms/) linked-summary and focus contract. A server error that cannot be attributed to one field belongs in persistent task feedback.

## Themes and responsive layout

The shared field uses text, card, border, error, focus and input-radius tokens. Hints and errors wrap at the field width in both themes. Let the field fill its container; stack form columns on narrow screens without changing label/input/error reading order. Verify long labels, browser autofill and disabled text rather than assuming the site theme covers every input state.

## Avoid

Do not use placeholders as the sole label, duplicate IDs or colour-only validation. Use [Number and currency input](/components/number-input/) and [Date input](/components/date-input/) for structured values; these are application guides, not additional TextField types or package exports.

