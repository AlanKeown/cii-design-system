---
title: Reporting and date ranges
description: Filter a report, explain its summaries and export the same result set.
---

Combine report selection, a validated date range, summary metrics, results and export in one predictable task.

## Workflow

1. Choose a report the viewer is allowed to access.
2. Supply labelled From and To [date inputs](/components/date-input/).
3. Explain whether boundaries are inclusive and which record date is used.
4. Validate the range before calculating/exporting results.
5. Show the result count, relevant totals and a semantic result table.
6. Export the same criteria and data scope currently presented.

Use the application locale for visible dates and currency. Define the reporting timezone before interpreting date boundaries. Date-only values should not shift a day because of timestamp conversion.

## Validation and state contract

| State | Behaviour |
| --- | --- |
| Initial | Show an explicit default range and selected report |
| Invalid range | Explain that To must be on or after From; associate the error and block run/export |
| Loading | Keep criteria visible, mark results busy and prevent duplicate exports |
| Ready | Display criteria, totals and rows from the same successful query |
| Empty | State that no records match this range; distinguish from failed loading |
| Failed | Preserve criteria and the last successful result with a stale-data explanation, or replace it with retry feedback |
| Exporting | Identify the scope and announce completion or failure without moving focus |

If dates are optional, explain what an empty boundary means. If they are mandatory, validate them as required. Do not show computed zeros for an invalid range.

## Summary and export

Label each measure: “Records in this period”, “Status groups” and “Total contributions (AUD)”. Use the same rounding policy as the underlying data. Give exports descriptive filenames and include criteria when useful. See [bulk actions and export](/patterns/bulk-actions/) for scope and CSV behaviour.

## Accessibility, themes and responsive behaviour

Use visible labels for report and date controls, link errors with aria-describedby and announce result counts politely. A range summary should remain understandable outside the controls. Use a caption or accessible name for the results table. Apply input/card/text/focus tokens in both themes. Stack filters on mobile, wrap summaries and scroll wide tables within their own region.

## Portal reference and limits

`apps/community-portal/src/lib/components/Reports.svelte` owns the report controls and summary. `reporting.ts` filters records and exports CSV. Non-empty ISO date strings are compared inclusively against each record's date. The portal defaults to the start of the current month through today in Sydney. Reversed ranges show a linked error, return no records and disable export. Report results use a named table and polite result announcements. Clearing a boundary currently makes it unbounded, but the interface does not explain this. Reports are client-side, without remote loading, scheduled reports or a trusted authorization boundary.
