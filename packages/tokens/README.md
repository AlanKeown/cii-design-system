# @cii/tokens

Framework-independent CII design tokens.

Edit `tokens.json`, then run `npm run build -w @cii/tokens`. Commit the
generated `tokens.css` with the JSON source. Import `@cii/tokens/tokens.css` and
use `data-cii-theme="light"` or `data-cii-theme="dark"` on the theme boundary.

All variables use the `--cii-` prefix. The stylesheet declares tokens and colour
schemes without resetting consumer elements.

`--cii-map-feature` is the default map feature outline colour: light-theme navy
and dark-theme light purple. `--cii-map-surface` is the map background when no
basemap is shown; it currently aliases `--cii-bg-subtle`.
`--cii-map-feature-invalid` aliases `--cii-status-error`.
`--cii-map-feature-selected` uses teal: `#007F86` in light mode and `#4DD0C8` in
dark mode. It contrasts with the default map surface at 4.26:1 and 7.94:1,
respectively, and differs from the normal feature and focus-ring colours.
Selection still needs a thicker outline and point ring when implemented; colour
alone is insufficient. Custom colours, opacity and basemaps require separate
contrast checks.

Map colour tokens must resolve to six-digit hex colours, directly or through
`var(--cii-…)` aliases, because canvas renderers cannot use `color-mix()` or
relative colours. Run `npm run test:unit -w @cii/tokens` after editing them. The
test checks that each map colour token is defined in both themes, that each pair
in `requirements` meets its minimum contrast, and that each token in `distinct`
differs from the tokens it lists. Add enforced rules there for every new map
token.
