<script>
  import Router from "svelte-spa-router";
  import routes from "./routes";
  import { onMount } from 'svelte';
  import { startAutoSync, runSync, stopAutoSync } from './sync/syncService';
  import { auth,setPermissionsFromUsers } from './auth/authStore';
  import { fetchOrganizationInventoryMethod } from './stores/organizationStore.js';
  import { loadSettings } from './i18n/i18n';

  import ToastContainer from "./ToastUI/ToastContainer.svelte";
  import ConfirmModalHost from "./components/common/ConfirmModalHost.svelte";

  onMount(() => {
    setPermissionsFromUsers();
    loadSettings();

    return () => {
      stopAutoSync();
    };
  });
  // Ensure initial sync runs once after a successful login. Also start/stop auto-sync
  // according to authentication state.
  let initialSyncDone = false;

  $: if ($auth && $auth.isAuthenticated && !initialSyncDone) {
    initialSyncDone = true;
    try {
      fetchOrganizationInventoryMethod().catch((e) =>
        console.warn('Could not load inventory method, using cache if available', e),
      );
    } catch (e) {
      console.warn(e);
    }
    try { runSync().catch((e) => console.error('Initial sync failed', e)); } catch (e) { console.error(e); }
    try { startAutoSync(15000); } catch (e) { console.warn('Failed to start auto-sync', e); }
  }

  // When logged out, reset the flag and stop auto-sync so it won't run in background.
  $: if (!$auth || !$auth.isAuthenticated) {
    initialSyncDone = false;
    try { stopAutoSync(); } catch (e) { /* ignore */ }
  }
</script>

<ToastContainer />
<ConfirmModalHost />
<Router {routes} />
