/** Single browser-only import seam; Vite selects Leaflet's named ESM exports. */
export function loadLeaflet() {
  return Promise.all([
    import('leaflet'),
    import('leaflet/dist/leaflet.css')
  ]).then(([library]) => library);
}
