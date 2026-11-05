---
title: Modal
description: Contain a focused task or consequential confirmation.
---

Contain a focused task or consequential confirmation.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Use a modal for a short create/edit task or a decision that must be resolved
before continuing. Prefer a native dialog opened with showModal(). Name the
task, explain consequences and provide an explicit cancel/close action.

## Application contract

| Concern      | Required behaviour                                                                           |
| ------------ | -------------------------------------------------------------------------------------------- |
| Lifecycle    | The application owns opening, dismissal and the invoking element used for focus restoration. |
| Save         | Validate before submission, retain entered values on failure and close only after success.   |
| Confirmation | Name the affected records and use a specific verb such as “Archive 3 records”.               |

## Structure example

```html
<dialog aria-labelledby="archive-title" aria-describedby="archive-description">
  <h2 id="archive-title">Archive 3 records?</h2>
  <p id="archive-description">Their status will change to Archived.</p>
  <form method="dialog"><button value="cancel">Cancel</button></form>
  <button type="button">Archive 3 records</button>
</dialog>
```

## States and feedback

Document closed/open, validation errors, saving, failed save and success.
Disable repeated submission while saving and explain whether dismissal is
temporarily blocked. After failed validation focus the linked summary or first
invalid control. Discarding unsaved edits requires a clear policy.

## Keyboard and accessibility

Open native dialogs with showModal(), not just the open attribute. Set
aria-labelledby to the visible heading. Place initial focus deliberately,
contain focus, support Escape and restore focus to the trigger or a sensible
successor. For destructive confirmations prefer initial focus on Cancel.

## Themes and responsive layout

Use card/text/border tokens, a distinct backdrop and a visible focus ring. Keep
the task scrollable within the viewport, maintain access to close/save controls
and stack form columns below 768px. Test the dialog in both themes with zoom and
long validation messages.

## Avoid

Avoid nested modals, closing after a failed save, backdrop-only dismissal or
unspecified “OK” actions for destructive operations.

## Portal reference and implementation limits

`RecordFormDialog.svelte` uses a named native dialog with background inertness,
initial focus, Tab/Shift+Tab wrapping, Escape dismissal and focus restoration
through `modal-dialog.ts`. Failed submissions focus a linked error summary. The
form still lacks an unsaved-change policy. `+page.svelte` retains bulkArchive()
browser confirmation; browser confirm/prompt dialogs are not shared
design-system components.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
