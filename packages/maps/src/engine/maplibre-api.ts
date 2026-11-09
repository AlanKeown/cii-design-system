export { Map, addProtocol, removeProtocol } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// A bundled worker URL also works under strict same-origin/CSP deployments.
setWorkerUrl(workerUrl);
