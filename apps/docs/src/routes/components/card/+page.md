---
title: Card
description: Group a metric, related information or a focused action.
---

Group a metric, related information or a focused action.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Choose a metric card for a single value with context, an information card for a
headed section, or an actionable card with one destination. Promotional cards
may add artwork and a call to action, but must preserve readable content and
hierarchy.

## Application contract

| Concern | Required behaviour                                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------- |
| Content | Provide a meaningful title, optional description/metadata and a clear reading order.                     |
| Action  | Choose either a single card-level link/button or separate named actions; never nest interactive targets. |
| Metric  | Explain the measure, period and destination; format counts and money using the application locale.       |

## Structure example

```html
<section aria-labelledby="members-metric">
  <h2 id="members-metric">Active members</h2>
  <p>18 <span>members</span></p>
  <a href="?module=Members">View active members</a>
</section>
```

## States and feedback

Static cards have no hover/focus affordance. Actionable cards need hover, focus,
active and unavailable states. A loading metric must not show zero; failed
values show an explanation/retry. Empty informational cards offer a relevant
next step.

## Keyboard and accessibility

Use headings consistent with page hierarchy. Prefer links for destinations and
buttons for changes. Decorative artwork is hidden from assistive technology.
Keep source order consistent with visual order when cards reflow.

## Themes and responsive layout

Use card background, border, radius-card and spacing tokens. Maintain text
contrast for tinted cards in both themes. Use a responsive grid and permit long
titles/large values to wrap. Metric accent palettes remain portal-specific until
tokenised.

## Avoid

Avoid multiple competing primary actions, decorative graphics that obscure text
or a whole-card button containing links/buttons.

## Portal reference and implementation limits

`+page.svelte`: metric buttons, panel sections and welcome-card. Metric cards
navigate to filtered modules. The lilac welcome card and coloured metric icons
use local colours; those treatments are not approved shared theme variants.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
