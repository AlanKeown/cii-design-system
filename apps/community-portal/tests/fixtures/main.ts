import { mount } from 'svelte';
import '@cii/tokens/tokens.css';
import '../../src/lib/styles.css';
import AsyncHarness from './AsyncHarness.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Missing test mount target');
mount(AsyncHarness, { target });
