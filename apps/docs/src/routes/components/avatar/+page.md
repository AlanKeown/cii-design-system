---
title: Avatar
description: Identify a person with initials or an image next to their name.
---

Identify a person with initials or an image next to their name.

**Implementation: application guidance.** This component is not exported by
`@cii/svelte`. The contract below describes responsibilities for an application
implementation; it is not a package API. Code examples show semantic structure,
with application behaviour described separately.

## Usage and variants

Use an avatar as supplementary identity in profile blocks and person rows. Keep
the full name and role nearby. Initials are a fallback, not a unique identifier.
The portal uses regular 36px and compact 31px profile avatars.

## Application contract

| Concern  | Required behaviour                                                                              |
| -------- | ----------------------------------------------------------------------------------------------- |
| Identity | Provide a display name; derive at most two initials and use a neutral fallback for empty names. |
| Image    | Use a supplied image when available; fall back on load failure without changing layout.         |
| Presence | Only display presence when its meaning is backed by data and explained in text.                 |

## Structure example

```html
<div>
  <span aria-hidden="true">SM</span>
  <span>Sarah Mitchell <small>Admin</small></span>
</div>
```

## States and feedback

Support initials, image, missing identity and failed image loading. Presence may
be available/unavailable/unknown only when the application can substantiate it.
An avatar itself has no disabled or validation state; an enclosing profile
action does.

## Keyboard and accessibility

Hide redundant initials/images from assistive technology when a visible name
supplies identity. For an avatar-only action, give the button/link the person's
name and purpose. Do not announce a decorative dot as actual online presence.

## Themes and responsive layout

Keep dimensions stable and use circular cropping with object-fit for images. Use
text/surface tokens for a shared implementation, and verify initials contrast in
both themes. Portal lavender colours are local styling, not avatar tokens.

## Avoid

Avoid initials-only identification, assigning meaning to random avatar colours
or suggesting the demo's static green dot represents live presence.

## Portal reference and implementation limits

`+page.svelte`: profile, topbar and member/admin record-name cells;
`styles.css`: avatar, avatar.small and row-avatar. The profile dot is static and
titled “Demo profile”. The portal does not implement profile photos or a profile
menu.

Run the [community portal](/examples/community-portal/) to inspect the
application. This reference does not certify that it meets every requirement
above. See [foundations](/foundations/tokens/) and
[responsive layout](/foundations/responsive-layout/).
