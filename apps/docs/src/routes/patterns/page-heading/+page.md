---
title: Page heading
description: Compose a clear page title, description and task actions.
---

Introduce the current task before presenting controls or results. Use the same hierarchy for dashboards, lists and reports.

## Anatomy and hierarchy

1. Optional eyebrow provides brief context, such as “Community in action”.
2. One H1 names the destination or task: “Members” or “Reports”.
3. An optional sentence explains what people can do here.
4. An action group contains one primary action and relevant secondary actions.

For a record list, make “Add member” primary and “Export CSV” secondary. For Reports, export can be the primary action. A greeting is appropriate on the dashboard, while the document title should still identify the destination.

## Example composition

```html
<header>
  <p>Community in action</p>
  <h1>Members</h1>
  <p>People at the heart of your community.</p>
  <div role="group" aria-label="Member actions">
    <button type="button">Export CSV</button>
    <button type="button">Add member</button>
  </div>
</header>
```

Use shared [Button](/components/button/) instances for implemented actions. This HTML demonstrates structure rather than a shared PageHeading API.

## Permissions and states

Hide unavailable create actions according to authenticated permissions. Keep the page title visible during loading. A failed export reports the failure beside its trigger or in persistent feedback; it must not appear to succeed. Long-running exports need busy feedback and duplicate-action prevention.

## Accessibility, themes and layout

Keep source order consistent with visual order: heading, explanation, then actions. Preserve visible labels and focus rings. Use H1 typography, text and spacing tokens in both themes; decorative eyebrows should not replace the H1. At desktop widths actions may align to the right; below 768px move them below the description and allow wrapping. Avoid shrinking the title or action labels to make them fit.

## Portal reference

`apps/community-portal/src/routes/+page.svelte`: page-heading and heading-actions in Dashboard, Reports and record modules. `styles.css` stacks the layout below 768px and uses a local mobile H1 size of 25px. There is no shared PageHeading export. See [responsive layout](/foundations/responsive-layout/) for the documented local exceptions.
