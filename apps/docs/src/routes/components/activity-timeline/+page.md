---
title: Activity timeline
description: Explain record history in chronological order.
---

Explain record history in chronological order.

**Implementation: application guidance.** This component is not exported by `@cii/svelte`. The contract below describes responsibilities for an application implementation; it is not a package API. Code examples show semantic structure, with application behaviour described separately.

## Usage and variants

Use a compact timeline for recent activity and a fuller list for record/admin history. Each item includes actor, action, affected record and timestamp. Link the record only if the viewer can access it.

## Application contract

| Concern | Required behaviour |
| --- | --- |
| Events | Supply stable event IDs, timestamp, actor and human-readable action/record labels. |
| Ordering | Declare newest-first or oldest-first and keep that order consistent. |
| Paging | Provide a named “Load more activity” action and retain focus/scroll position when appending. |

## Structure example

```html
<ol aria-label="Recent activity">
  <li>
    <p>Sarah Mitchell updated Alex Example.</p>
    <time datetime="2026-10-30T00:00:00Z">30 Oct 2026, 11:00 am Sydney time</time>
  </li>
</ol>
```

## States and feedback

Support loading, events, no events, failed loading and loading more. A failed next page must preserve existing events. Relative times may supplement an absolute date/time; expose the timezone when it affects interpretation.

## Keyboard and accessibility

Use an ordered or unordered list and machine-readable time elements. Decorative timeline dots are hidden from assistive technology. Avoid announcing the entire history when one event is added; announce a concise update instead.

## Themes and responsive layout

Use text-secondary for metadata and border/subtle tokens for connectors. Meaning must remain in the text. Wrap long record names and stack metadata on narrow screens while preserving order.

## Avoid

Avoid colour-only event meaning, relative-only timestamps or presenting a client-generated history as a trusted security audit.

## Portal reference and implementation limits

`+page.svelte`: dashboard recent activity, detail Activity and Administration Audit log. Entries are newest-first; dashboard shows five. The portal uses divs instead of a semantic list/time elements, has no load-more control and matches record history by mutable name rather than stable ID.

Run the [community portal](/examples/community-portal/) to inspect the application. This reference does not certify that it meets every requirement above. See [foundations](/foundations/tokens/) and [responsive layout](/foundations/responsive-layout/).
