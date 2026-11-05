---
title: Record detail
description: Inspect, update and connect a record without losing list context.
---

Use a [drawer](/components/drawer/) for inspection alongside a record list. Keep
list search, sort, page and selection intact while a record is open. Use a full
page instead when the task becomes too large for a drawer.

## Anatomy

| Region            | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| Context and close | Module, stable record ID and a named close action  |
| Identity          | Status, record title and useful secondary identity |
| Primary action    | Edit, only when the viewer may update the record   |
| Overview          | Label/value pairs and relevant lifecycle actions   |
| Activity          | Actor, action and timestamp for this record        |
| Notes             | Existing notes and a clearly labelled editor       |
| Related records   | Linked records and permitted assignment actions    |
| Update metadata   | Last updater, absolute timestamp and timezone      |

Use a definition list for labelled facts. Replace internal field keys with
readable labels and format dates/currency deliberately. Empty values should say
“Not provided” or use an explained dash rather than displaying raw undefined
values.

## Tabs and action state

Follow the complete [tabs keyboard contract](/components/tabs/). Reset the
selected section deliberately when opening a different record. Preserve unsaved
note text or confirm discarding it when changing record/closing. A save action
needs validation, pending feedback and persistent failure feedback; clear the
editor only after a successful save.

Lifecycle actions such as Close case or Acknowledge donation need explicit
outcome labels. When transitioning to the edit dialog, transfer focus
deliberately; after Save return to an appropriate record or list location.
Related-record selectors must contain only relationships the viewer is allowed
to see or modify.

## Audit and permissions

Identify history by stable record ID, not mutable display name. Separate
last-update metadata from the complete history. Use server-authenticated actors
and timestamps in production. An unavailable record, a forbidden record and a
record with no related entries require different messages.

## Accessibility, themes and layout

Name the drawer from its visible title. A modal drawer needs inert background
content, focus containment, Escape dismissal and focus restoration. Keep long
values wrapping and the close action reachable. Use theme surfaces and readable
metadata text; allow the drawer to occupy the viewport width on mobile.
Decorative separators/dots must not be the sole source of meaning.

## Portal reference and limits

`apps/community-portal/src/lib/components/RecordDrawer.svelte` owns the detail
overlay. `records.ts` validates record changes; the route applies updates and
records activity. The demo supports notes, program assignment, case status,
donation acknowledgement and aggregate event attendance. Notes are concatenated
text without per-note authorship; activity is matched by record name;
timestamps/actors are client-generated. Closing/reopening clears the unsaved
note editor. The native modal provides background inertness; tabs have linked
panels, roving focus and Arrow/Home/End keyboard handling.
