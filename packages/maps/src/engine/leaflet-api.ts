/** Single browser-only import seam; Vite selects Leaflet's named ESM exports. */
export function loadLeaflet() {
  return import('leaflet');
}
