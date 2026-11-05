---
title: Textarea
description: Collect notes and other longer text without hiding the label.
---

Collect notes and other longer text without hiding the label.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Use for paragraphs and multiline notes. Use
[Text field](/components/text-field/) for a short value. Show format, privacy or
length guidance before entry; preserve line breaks when displaying saved notes.

## Application contract

| Concern            | Required behaviour                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Value and identity | Provide a unique ID, visible label and application-owned text value.                         |
| Constraints        | Explain required and maximum-length rules before input; retain text after failed submission. |
| Feedback           | Connect hints and errors with aria-describedby; set aria-invalid only after validation.      |

## Structure example

```html
<label for="record-notes">Notes</label>
<p id="notes-hint">Include information needed for the next follow-up.</p>
<textarea id="record-notes" rows="4" aria-describedby="notes-hint"></textarea>
```

## States and feedback

Support empty, populated, focus, invalid, read-only and disabled states.
Read-only notes remain selectable; disabled fields are not submitted. If a limit
applies, show remaining characters as text and avoid announcing every keystroke.
Save failures keep entered notes visible.

## Keyboard and accessibility

Use the native textarea and its keyboard behaviour. Do not intercept Enter to
submit a multiline task. A hint or error needs a stable ID; required text must
be visible and use the required attribute.

## Themes and responsive layout

Use input radius, card background, border and text tokens. Allow vertical
resizing and full-width reflow; provide at least three visible rows for a note.
Focus and invalid borders must remain visible in both themes.

## Avoid

Avoid placeholders as labels, fixed heights that conceal text and mandatory
notes without explaining why they are needed.

## Portal reference and implementation limits

`+page.svelte`: record form Notes and drawer Add note. The drawer saves appended
notes and clears the editor on success. The portal does not currently enforce a
length limit or provide per-note authorship.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
