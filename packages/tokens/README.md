# @cii/tokens

Framework-independent CII design tokens.

Edit `tokens.json`, then run `npm run build -w @cii/tokens`. Commit the generated `tokens.css` with the JSON source. Import `@cii/tokens/tokens.css` and use `data-cii-theme="light"` or `data-cii-theme="dark"` on the theme boundary.

All variables use the `--cii-` prefix. The stylesheet declares tokens and colour schemes without resetting consumer elements.
