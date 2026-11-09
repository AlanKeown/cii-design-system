import { mount } from 'svelte';
import '@cii/tokens/tokens.css';
import LayersHarness from './LayersHarness.svelte';
import type { MapConfig, LayerSpec, LayerManager } from '../../../src/index.ts';
declare global {
  interface Window {
    layersFixture?: {
      spec(): LayerSpec;
      update(spec: LayerSpec): void;
      config(): MapConfig;
      configure(config: MapConfig): void;
      child(visible: boolean): void;
      duplicate(visible: boolean): void;
      unmount(): void;
      errors(): string[];
    };
    layerProbe?: { manager(): LayerManager | null; same(): boolean };
  }
}
mount(LayersHarness, { target: document.getElementById('app')! });
