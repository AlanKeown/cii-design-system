import { mount } from 'svelte';
import '@cii/tokens/tokens.css';
import Harness from './Harness.svelte';
import type { MapConfig, ViewState } from '../../../src/index.ts';
declare global {
  interface Window {
    mapHarness?: {
      config(): MapConfig;
      setConfig(config: MapConfig): void;
      view(): ViewState;
      viewEvents(): { view: ViewState; source: 'api' | 'user' }[];
      clearViewEvents(): void;
      setView(view: Partial<ViewState>): void;
      setBoundView(view: ViewState): void;
      stats(): Promise<{ count: number; radius: number; color: string }>;
      hit(): (string | number | undefined)[];
      contract(): Promise<string[]>;
    };
  }
}
const target = document.getElementById('app');
if (!target) throw new Error('Missing fixture target.');
mount(Harness, { target });
