import { writable } from 'svelte/store';

export const syncStatus = writable({
  syncing: false,
  progress: 0,
  lastSync: null,
  error: null
});
