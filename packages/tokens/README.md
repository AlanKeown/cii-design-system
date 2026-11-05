# @cii/tokens

Framework-independent CII design tokens.

Edit `tokens.json`, then run `npm run build -w @cii/tokens`. Commit the generated `tokens.css` with the JSON source. Import `@cii/tokens/tokens.css` and use `data-cii-theme="light"` or `data-cii-theme="dark"` on the theme boundary.

All variables use the `--cii-` prefix. The stylesheet declares tokens and colour schemes without resetting consumer elements.

`--cii-map-feature` is the default map feature outline colour: light-theme navy and dark-theme light purple. `--cii-map-surface` is the map background when no basemap is shown; it currently aliases `--cii-bg-subtle`. Custom colours, opacity and basemaps require separate contrast checks.

Map colour tokens must resolve to six-digit hex colours, directly or through `var(--cii-…)` aliases, because canvas renderers cannot use `color-mix()` or relative colours. Run `npm run test:unit -w @cii/tokens` after editing them. The test checks that each map colour token is defined in both themes and that `--cii-map-feature` meets 3:1 against `--cii-map-surface`. Add a row to `requirements` in `tests/contrast.test.ts` for each new pair that must stay distinguishable.
