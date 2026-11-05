---
title: Permissions and workspace context
description: Make role-based visibility and demonstration controls understandable.
---

Show people destinations and actions they can use while keeping authorization in
the backend. The interface reflects permissions; it cannot enforce data access
by itself.

## Role-aware composition

Hide inaccessible modules, quick actions and create/edit controls. Apply the
same rules to global search, metric counts, related records, reporting and
exports so indirect surfaces do not disclose restricted records. Use a visible
explanation when a permitted action is temporarily unavailable for a business
reason.

When authenticated permissions change, close or revalidate an open record, clear
unauthorized selection/results and move to an allowed destination. Keep the new
location and focus understandable. A read-only user can inspect permitted
content without seeing editing affordances.

## Workspace identity and profile

The workspace block provides name and location. If switching workspaces is
supported, make it a labelled button with expanded state and describe what
happens to unsaved work. If switching is not supported, present static identity
without suggesting an available menu. Use [Avatar](/components/avatar/) for
profile identity and explain any presence indicator.

## Demo role preview

A role selector in an informational workspace banner must clearly say “Preview
role”. Explain that it previews visibility rather than signing in or changing
production authorization. Keep the device-local persistence message distinct
from a guarantee of durable saving. A role switch should never imply another
person's identity has been authenticated.

## States and accessibility

Distinguish permission loading, authorized content, forbidden access and expired
authentication. During permission loading, avoid briefly exposing restricted
actions. If a server rejects an update, retain safe entered data and explain the
next step. Label the selector, announce context changes politely and move focus
only when its current location becomes unavailable.

Use readable text, card/subtle surfaces and input/focus tokens in both themes.
On mobile stack banner text and role control rather than hiding the preview
explanation. Avoid colour-only role distinctions.

## Portal reference and limits

`apps/community-portal/src/lib/data.ts`: permissions. `+page.svelte`: allowed,
canWrite, changeRole(), workspace and demo-strip. The demo hides module links
and many actions, while canWrite is a coarse check against Board Member. Some
related data and dashboard counts use the full local dataset. No backend
authenticates roles or enforces access; these rules are a demonstration and must
be replaced with authenticated capabilities in production.
