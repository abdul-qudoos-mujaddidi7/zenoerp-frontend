import { auth } from './authStore';
import { db } from '../db';
import { API_URL } from '../config';
import { t, setLanguage, isRTL, lang, supported, setTranslateOrgType, setSettingsAll } from '../i18n/i18n';
// const API = 'http://127.0.0.1:3000/api';
const API = API_URL + '/api';
// const API = 'https://zenoerp.tectors.com/api';

export async function validateRegister(username, email) {
  const res = await fetch(`${API}/auth/validate-register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email }),
  });

  if (!res.ok) {
    const err = await res.json();
    alert(err.message || 'Validation failed');
    return false;
  }

  const data = await res.json();
  return data;
}

export async function register(data) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Registration failed');
  }

  try {
    await login(data.username, data.password);
    return await res.json();
  } catch (err) {
    error = err.message;
  }
}

async function getSettings() {
  const token = localStorage.getItem('token');
  const org_id = localStorage.getItem('org_id');

  if (!token || !org_id) throw new Error('Not authenticated');

  const res = await fetch(API_URL + '/api/sync/get-settings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: '',
  });

  let response = await res.json();

  setSettingsAll(response);
  console.log('from getSet of auth', response);
}

export async function login(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Login failed');
  }

  const data = await res.json();

  localStorage.setItem('token', data.token);
  localStorage.setItem('user_id', data.user_id);
  localStorage.setItem('role_id', data.role_id);
  localStorage.setItem('org_id', data.org_id);
  localStorage.setItem('subscription', JSON.stringify(data.subscription));
  localStorage.setItem('permissions', data.permissions ? data.permissions || "[]" : "[]");

  if (data.settings) {
    setSettingsAll(data.settings);
  }
  // await getSettings();
  if (data.org_type) {
    localStorage.setItem('org_type', data.org_type);
    setTranslateOrgType(data.org_type);
  }
  if (data.inventory_method) {
    const { setOrganizationContext } = await import('../stores/organizationStore.js');
    setOrganizationContext({ inventoryMethod: String(data.inventory_method).trim().toUpperCase() });
  }
  localStorage.setItem('username', data.username);
  if (data.language) localStorage.setItem('lang', data.language);
  if (data.theme) localStorage.setItem('theme', data.theme);
  // If user switched organizations, clear local DB to avoid leaking data
  const prevSyncedOrg = localStorage.getItem('last_synced_org');
  if (prevSyncedOrg && String(prevSyncedOrg) !== String(data.org_id)) {
    // clear all local tables (best-effort)
    for (const t of db.tables.map((x) => x.name)) {
      try {
        await db[t].clear();
      } catch (e) {
        /* ignore */
      }
    }
  }
  // Set last_synced_org to current org (sync will set last_sync_{org} when it runs)
  localStorage.setItem('last_synced_org', data.org_id);

  auth.set({
    token: data.token,
    user_id: data.user_id,
    org_id: data.org_id,
    role_id: data.role_id,
    username: data.username,
    subscription: data.subscription,
    permissions: data.permissions ? JSON.parse(data.permissions) : null,
    isAuthenticated: true,
  });

  try {
    const { fetchOrganizationInventoryMethod } = await import('../stores/organizationStore.js');
    await fetchOrganizationInventoryMethod();
  } catch (e) {
    console.warn('Inventory method not loaded at login', e);
  }

  return Object.assign({}, data);
}

import { push } from 'svelte-spa-router';

async function clearEverything() {
  // Attempt to delete the Dexie database used by the app
  try {
    if (db && typeof db.delete === 'function') {
      await db.delete();
    }
  } catch (e) {
    console.warn('Failed to delete local Dexie DB', e);
  }

  // If browser supports enumerating indexedDB databases, attempt to delete them all
  try {
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      for (const d of dbs) {
        try {
          if (d && d.name) await indexedDB.deleteDatabase(d.name);
        } catch (err) {
          /* ignore individual failures */
        }
      }
    }
  } catch (e) {
    console.warn('Failed to enumerate/delete indexedDB databases', e);
  }

  // Clear storages and caches
  try {
    localStorage.clear();
  } catch (e) {}
  try {
    sessionStorage.clear();
  } catch (e) {}
  try {
    if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
      const keys = await caches.keys();
      for (const k of keys) {
        try {
          await caches.delete(k);
        } catch (err) {
          /* ignore */
        }
      }
    }
  } catch (e) {
    /* ignore */
  }
}

export async function logoutClear() {
  auth.set({
    token: null,
    user_id: null,
    org_id: null,
    username: null,
    role_id: null,
    subscription: null,
    permissions: null,
    isAuthenticated: false,
  });
  try {
    const { clearOrganizationContext } = await import('../stores/organizationStore.js');
    clearOrganizationContext();
  } catch (e) {
    /* ignore */
  }
  await clearEverything();

  try {
    push('/');
    location.reload();
  } catch (e) {
    /* ignore if reload unavailable */
  }

  try {
    push('/');
  } catch (e) {
    /* ignore if push unavailable */
  }
}

export async function logout(clearLocalData = true) {
  auth.set({
    token: null,
    user_id: null,
    org_id: null,
    username: null,
    role_id: null,
    subscription: null,
    permissions: null,
    isAuthenticated: false,
  });

  try {
    localStorage.clear();
  } catch (e) {}
  try {
    sessionStorage.clear();
  } catch (e) {}

  if (clearLocalData) {
    // await clearEverything();
    // try { location.reload(); } catch (e) { /* ignore if reload unavailable */ }
  } else {
    // Just clear auth-related localStorage keys
    // try { localStorage.removeItem('token'); } catch (e) {}
    // try { localStorage.removeItem('user_id'); } catch (e) {}
    // try { localStorage.removeItem('org_id'); } catch (e) {}
    // try { localStorage.removeItem('lang'); } catch (e) {}
    // try { localStorage.removeItem('theme'); } catch (e) {}
  }

  // hard reload the page

  // Redirect to login after logout

  try {
    push('/');
  } catch (e) {
    /* ignore if push unavailable */
  }
}
