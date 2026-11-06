import { mount } from 'svelte';
import '@cii/tokens/tokens.css';
import CrsConfirmHarness from './CrsConfirmHarness.svelte';
const target = document.getElementById('app');
if (!target) throw new Error('Missing fixture root.');
mount(CrsConfirmHarness, { target });
