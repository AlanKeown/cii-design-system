---
title: Record forms
description: Create or update records with clear validation, drafts and feedback.
---

Help people complete a record with predictable controls, retained input and a clear outcome.

## Structure the task

1. Name the task, such as “Add member”, and distinguish creating from editing.
2. Explain required markers before the first field.
3. Put visible labels above controls and hints before entry.
4. Group related fields and keep reading order consistent with the task.
5. Offer one primary Save action and an explicit Cancel action.
6. For longer tasks, explain draft scope and offer Save draft / Restore draft.

Use [Text field](/components/text-field/) for short text, [Textarea](/components/textarea/) for notes, [Select](/components/select/) for predefined values, [Date input](/components/date-input/) for dates and [Number input](/components/number-input/) for amounts. Use [Button](/components/button/) and [Alert](/components/alert/) for actions and persistent feedback. Only those documented as shared exports can be imported from `@cii/svelte`.

## Validation and focus

Validate on blur and submit, using the same business rules on the server. Show requiredness in text and use native required attributes. Connect each hint/error to the control using aria-describedby and expose aria-invalid after validation.

After a failed submission show a summary linking to invalid control IDs and focus that summary or the first invalid field. Error text explains how to fix the value. Keep entered values after validation or server failure and provide an explicit retry path. Revalidate dependent fields when one field changes their validity, such as a report end date.

## Form state contract

| State | Behaviour |
| --- | --- |
| Loading record | Keep task title visible and explain the wait |
| Ready | Permit editing and cancellation |
| Invalid | Retain values, show linked summary and field errors |
| Saving | Show busy feedback and prevent duplicate submission |
| Failed save | Keep the form open with persistent explanation and retry |
| Saved | Confirm the outcome and update the list/detail/audit context |
| Unsaved close | Follow a clear discard or automatic-draft policy |

A modal form follows the [modal focus contract](/components/modal/). A close icon is helpful, but a visible Cancel action makes the choice clearer. Do not require a pointer to escape the task.

## Drafts and persistence

State whether a draft is saved to this device or an account, when it was saved and which record/module it belongs to. Restoring a draft should not silently replace unsaved input: preview or confirm replacement. Clear or version obsolete drafts after successful submission, validate restored data and avoid restoring one record's draft into another record.

Draft storage failure is actionable feedback and should remain available until resolved. Browser storage is origin-specific and may be unavailable; it is not durable production storage. Avoid placing sensitive production records in browser drafts without an application data policy.

## Themes and responsive layout

Use input/error/focus tokens and maintain readable contrast in both themes. Two-column forms may collapse below 768px; source order must remain logical. Let error messages and action groups wrap, and keep save/cancel controls reachable with zoom and mobile keyboards.

## Portal reference and limits

`apps/community-portal/src/lib/components/RecordFormDialog.svelte` owns the native record dialog, validation and draft actions. `records.ts` defines form rules and builds validated records; `persistence.ts` validates and versions stored drafts. TextField and local date/amount/count controls connect inline errors with aria-describedby. The dialog is named from its heading, failed submissions focus the error summary, and its links focus the invalid fields. It still lacks a visible Cancel action and an unsaved-change policy.

Drafts are per module in community-draft-* browser keys, not per record; valid restores replace entered values, invalid drafts leave current entries intact, successful saves do not clear drafts and failures use transient toast feedback. The demonstration saves synchronously to local state/browser storage. Production applications need authenticated permissions, server validation, durable storage and trusted audit events.
