import { mount } from 'svelte';
import '@cii/tokens/tokens.css';
import AdaptersHarness from './AdaptersHarness.svelte';
import type { IMapEngine, MapConfig, ViewState } from '../../../src/index.ts';
import type { MapSnapshot } from '../../../src/map-controller.ts';
declare global {
  interface Window {
    adapters?: {
      config(): MapConfig;
      update(config: MapConfig): void;
      engine(): IMapEngine;
      view(): ViewState;
      snapshot(): {
        ready: number;
        errors: string[];
        switches: string[];
        events: { source: string; view: ViewState }[];
      };
      rendered(): number;
      switchTo(code: string): void;
      contract(): Promise<string[]>;
      unmount(): void;
    };
  }
}
const target = document.getElementById('app')!;
mount(AdaptersHarness, { target });
export type { MapSnapshot };
