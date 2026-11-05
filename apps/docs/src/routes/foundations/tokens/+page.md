---
title: Design tokens
description: Design tokens in the CII Design System.
---

Tokens provide a shared vocabulary for the documentation examples and the community portal. Their source of truth is `packages/tokens/tokens.json`.

## Colour and meaning

| Token | Light | Dark |
| --- | --- | --- |
| `--cii-brand-primary` | #122B4D | #173A63 |
| `--cii-map-feature` | #122B4D | #B39BFF |
| `--cii-map-surface` | #EDF2F8 (bg-subtle) | #18283C (bg-subtle) |
| `--cii-brand-secondary` | #A88BFF | #B39BFF |
| `--cii-bg-page` | #F5F7FB | #0A121C |
| `--cii-bg-card` | #FFFFFF | #101B2A |
| `--cii-text-primary` | #152232 | #EDF3FF |
| `--cii-text-secondary` | #4F5F74 | #BAC9DF |
| `--cii-focus-ring` | #8D76F7 | #B39BFF |

Brand and status colours follow the supplied specification. Separate `text-success`, `text-warning`, `text-error` and `text-info` tokens provide stronger text colours for status messages. Status must also be conveyed through text.

## Typography

Inter is the preferred typeface, with system sans-serif fallbacks. The library does not download external fonts.

| Role | Size / line height | Weight |
| --- | --- | --- |
| Heading 1 | 28 / 36 px | 700 |
| Heading 2 | 22 / 30 px | 600 |
| Heading 3 | 18 / 26 px | 600 |
| Body | 14 / 21 px | 400 |
| Label | 12 / 18 px | 500–600 |
| Caption | 11 / 16 px | 500 |

## Spacing and shape

The spacing scale is 4, 8, 12, 16, 24, 32, 40, 48 and 64 pixels. Inputs use an 8px radius, buttons 10px, and cards 14px.

## Apply a theme

```svelte
<script lang="ts">
  import '@cii/tokens/tokens.css';
  let dark = $state(false);
</script>

<div data-cii-theme={dark ? 'dark' : 'light'}>
  <!-- Components inherit the selected tokens. -->
</div>
```

Theme attributes can be nested. Each live example has its own theme control, independent of the documentation theme. Token CSS only declares variables and colour schemes; it does not reset page elements.

## Change a token

Edit the JSON source, then regenerate the stylesheet:

```sh
npm run build -w @cii/tokens
```

Keep generated `tokens.css` in sync with its source. Component CSS uses namespaced tokens and scoped styles; avoid copying portal-specific global styles into another application.

## Surface, emphasis and focus

Use bg-page for the overall canvas, bg-card for contained content and bg-subtle for low-emphasis controls or headers. Pair them with text-primary, text-secondary and border-default rather than a hardcoded light surface. Use text-on-action for primary action labels. Status text tokens are intended for readable semantic text; a status fill alone does not guarantee contrast.

Keep the focus-ring token visible in both themes with sufficient offset from the control edge. Selection, status and errors also need text, icons or shape changes. Do not replace the focus ring with a subtle colour shift.

## Motion and elevation

The base token set includes motion-fast at 150ms and radius-pill at 999px. Honour reduced motion when using transitions or spinners. The token source currently has no elevation, backdrop, breakpoint, avatar or metric-accent tokens. Portal shadows and overlay colours are local values; they are not shared token definitions.

## Portal-specific values and exceptions

The portal aliases semantic colours inside .app, but also uses hardcoded avatar colours, blue/lilac/peach/green metric accents, promotional card colours, shadows and backdrops. These values do not automatically adapt into approved dark variants. New shared components should use existing semantic tokens; any new semantic colour pair needs explicit light/dark definitions and contrast review in packages/tokens/tokens.json before adoption.

The portal's local H2 is 18/26px, while the shared H2 token remains 22/30px; mobile H1 and several metadata sizes also differ. These are documented implementation exceptions, not changes to the token scale. See [responsive layout](/foundations/responsive-layout/) and [iconography](/foundations/iconography/) for layout and symbol guidance.

## Applying and verifying styles

Use spacing, radius, typography and motion variables in shared components as well as colour variables. Inspect default, hover, active, focus, disabled, invalid and loading states in both themes where applicable. Test nested themes and long content; do not rely on the documentation site's theme as proof that an application-level control responds correctly. This documentation update does not change the generated token values or certify portal contrast.
