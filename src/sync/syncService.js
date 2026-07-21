import { syncStatus } from './syncStore';
import { db, app_version } from '../db';
let progressTimer = null;
let isSyncing = false;
import { API_URL } from '../config';
import Swal from 'sweetalert2';

import { toast } from '../ToastUI/toast';

function mapUploadTableName(clientTable) {
  return clientTable;
}

function mapDownloadTableName(serverTable) {
  return serverTable;
}


function patchSyncStatus(patch) {
  syncStatus.update((current) => ({ ...current, ...patch }));
}

const SYNC_LOCK_KEY = 'sync_lock_v1';
const SYNC_LOCK_TTL_MS = 60 * 1000;
const SYNC_LOCK_HEARTBEAT_MS = 15 * 1000;

function safeParseJSON(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function nowMs() {
  return Date.now();
}

function getTabSessionId() {
  try {
    const existing = sessionStorage.getItem('tabSesID');
    if (existing) return existing;

    const globalId = typeof globalThis !== 'undefined' ? globalThis.tabSesID : null;
    const generated = globalId || (Math.random().toString(36).substring(2) + Date.now().toString(36)).toUpperCase();

    sessionStorage.setItem('tabSesID', generated);
    return generated;
  } catch (e) {
    try {
      return typeof globalThis !== 'undefined' ? globalThis.tabSesID || null : null;
    } catch (err) {
      return null;
    }
  }
}

const tabSessionId = getTabSessionId();

function acquireSyncLock(ownerId) {
  const now = nowMs();

  const current = safeParseJSON(localStorage.getItem(SYNC_LOCK_KEY));
  if (current && current.owner !== ownerId && typeof current.expiresAt === 'number' && current.expiresAt > now) {
    return false;
  }

  const lockValue = {
    owner: ownerId,
    acquiredAt: now,
    expiresAt: now + SYNC_LOCK_TTL_MS,
  };

  localStorage.setItem(SYNC_LOCK_KEY, JSON.stringify(lockValue));

  const after = safeParseJSON(localStorage.getItem(SYNC_LOCK_KEY));
  return !!after && after.owner === ownerId;
}

function refreshSyncLock(ownerId) {
  const now = nowMs();
  const current = safeParseJSON(localStorage.getItem(SYNC_LOCK_KEY));

  if (!current || current.owner !== ownerId) return false;

  current.expiresAt = now + SYNC_LOCK_TTL_MS;
  localStorage.setItem(SYNC_LOCK_KEY, JSON.stringify(current));
  return true;
}

function releaseSyncLock(ownerId) {
  const current = safeParseJSON(localStorage.getItem(SYNC_LOCK_KEY));
  if (current && current.owner === ownerId) {
    localStorage.removeItem(SYNC_LOCK_KEY);
  }
}

// let API_URL = 'https://zenoerp.tectors.com';

function isoToMySQL(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const YYYY = d.getUTCFullYear();
  const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
  const DD = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}

function toEpoch(dt) {
  if (!dt) return null;
  if (typeof dt === 'number') return dt;
  if (dt instanceof Date) return dt.getTime();
  try {
    if (typeof dt === 'string' && !dt.includes('T')) {
      return new Date(dt + 'Z').getTime();
    }
    return new Date(dt).getTime();
  } catch (e) {
    return null;
  }
}

function toSecondEpoch(dt) {
  const epoch = toEpoch(dt);
  if (!epoch || Number.isNaN(epoch)) return null;
  return Math.floor(epoch / 1000);
}

function normalizeToUTCISO(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function collectLocalChanges(lastSyncIso) {
  const data = {};
  const tables = db.tables.map((t) => t.name);

  for (const table of tables) {
    let records = [];
    try {
      records = await db[table].toArray();
    } catch (e) {
      records = [];
    }

    data[table] = await Promise.all(
      records
        .filter((record) => {
          try {
            const ru = record.updated_at || record.updatedAt || null;
            const lu = record.last_synced_at || null;

            if (!ru) return false;

            // Never synced → send
            if (!lu) return true;

            const ruSec = toSecondEpoch(ru);
            const luSec = toSecondEpoch(lu);

            if (ruSec == null || luSec == null) return false;

            // Compare at second precision to avoid DATETIME(ms=0) resend loops.
            if (ruSec > luSec) return true;

            return false;
          } catch (e) {
            console.warn('Date parsing error for record', record.id, table, e);
            return false;
          }
        })

        .map(async (record) => {
          const sanitized = {};
          for (const key in record) {
            let val = record[key];
            if (val === undefined) val = null;

            if (val && typeof val === 'object') {
              // Browser Blob → data URL
              if (typeof Blob !== 'undefined' && val instanceof Blob) {
                try {
                  const dataUrl = await new Promise((resolve, reject) => {
                    const fr = new FileReader();
                    fr.onload = () => resolve(fr.result);
                    fr.onerror = reject;
                    fr.readAsDataURL(val);
                  });
                  val = dataUrl;
                } catch (e) {
                  val = null;
                }
              }
              // Binary data → base64
              else if (val instanceof Uint8Array || val instanceof ArrayBuffer) {
                try {
                  const u8 = val instanceof Uint8Array ? val : new Uint8Array(val);
                  let binary = '';
                  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
                  val = btoa(binary);
                } catch (e) {
                  try {
                    val = JSON.stringify(val);
                  } catch (er) {
                    val = String(val);
                  }
                }
              }
              // Other objects → JSON string
              else {
                try {
                  val = JSON.stringify(val);
                } catch (e) {
                  val = String(val);
                }
              }
            }
            sanitized[key] = val;
          }
          return sanitized;
        }),
    );
  }

  return data;
}

function parseServerDatetimeToIso(dt) {
  if (!dt) return null;
  // Already ISO
  if (dt.includes && dt.includes('T')) {
    try {
      return new Date(dt).toISOString();
    } catch (e) {}
  }
  // MySQL DATETIME → treat as UTC
  try {
    return new Date(dt + 'Z').toISOString();
  } catch (e) {
    return null;
  }
}

async function applyServerUpdates(updates, org_id, serverTimeIso, progressCb) {
  const tables = Object.keys(updates || {});

  let totalRows = 0;
  for (const t of tables) {
    totalRows += (updates[t] || []).length;
  }

  if (totalRows === 0) return;

  let processedRows = 0;
  const chunkSize = 500;

  for (const table of tables) {
    const localTableName = mapDownloadTableName(table);
    const rows = updates[table] || [];
    const localTable = db[localTableName];

    if (!localTable || rows.length === 0) continue;

    // sanitize rows first
    const prepared = rows.map((row) => {
      const serverIso = parseServerDatetimeToIso(row.updated_at || row.updatedAt);

      const record = { ...row };
      ['created_at'].forEach((key) => {
        if (row[key]) {
          record[key] = parseServerDatetimeToIso(row[key]);
        }
      });

      if (serverIso) {
        record.updated_at = serverIso;
        record.last_synced_at = serverIso;
      }

      if (org_id) record.org_id = org_id;

      if (row.local_id != null) {
        record.id = row.local_id;
      }

      record.__skipHooks = true;

      return record;
    });

    for (let i = 0; i < prepared.length; i += chunkSize) {
      const chunk = prepared.slice(i, i + chunkSize);

      try {
        await localTable.bulkPut(chunk);
      } catch (e) {
        const err = new Error(
          `Failed to persist server updates for table "${localTableName}" at chunk starting index ${i}: ${e?.message || e}`,
        );
        err.cause = e;
        console.error(err);
        throw err;
      }

      processedRows += chunk.length;

      if (progressCb) {
        const progress = Math.min(90, 40 + Math.floor((processedRows / totalRows) * 50));

        progressCb(progress);
      }
    }
  }
}

async function checkClientClock() {
  const res = await fetch(API_URL + '/api/server-time');
  const data = await res.json();

  const serverTime = new Date(data.server_time).getTime();
  const clientTime = Date.now();

  const diff = Math.abs(clientTime - serverTime);

  const diffSeconds = diff / 1000;
  if (diffSeconds > 120) {
    console.warn('Client clock is incorrect by', diffSeconds, 'seconds');
    toast.warning(
      `Your device time is off by approximately ${Math.round(diffSeconds)} seconds compared to the server. Please correct your system clock for optimal performance.`,
      'Clock Skew Detected',
    );
  } else {
    // console.log('Client clock is OK');
  }
}
export async function runSync() {
  checkClientClock().catch((e) => {
    console.warn('Clock check failed', e);
  });

  if (isSyncing) return;

  const lockOwner = `${tabSessionId || 'tab'}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  if (!acquireSyncLock(lockOwner)) {
    return;
  }

  isSyncing = true;

  let lockHeartbeat = null;
  let newLastSyncIso = localStorage.getItem(`last_sync_${localStorage.getItem('org_id')}`) || null;

  patchSyncStatus({ syncing: true, progress: 5, error: null });

  try {
    const token = localStorage.getItem('token');
    const org_id = localStorage.getItem('org_id');

    if (!token || !org_id) throw new Error('Not authenticated');

    lockHeartbeat = setInterval(() => {
      const ok = refreshSyncLock(lockOwner);
      if (!ok) {
        console.warn('Sync lock lost during run; another tab may be syncing now.');
      }
    }, SYNC_LOCK_HEARTBEAT_MS);

    // 🎯 CRITICAL FIX: Capture sync start time BEFORE collecting changes
    // This becomes the checkpoint for this sync cycle. Any changes made
    // after this point will be captured in the NEXT sync.
    const syncStartTimeIso = new Date().toISOString();

    // Handle org change: clear local DB if switching organizations
    const lastSyncedOrg = localStorage.getItem('last_synced_org');
    let lastSyncIso = localStorage.getItem(`last_sync_${org_id}`) || null;

    if (lastSyncedOrg && String(lastSyncedOrg) !== String(org_id)) {
      for (const t of db.tables.map((x) => x.name)) {
        try {
          await db[t].clear();
        } catch (e) {
          /* ignore */
        }
      }
      lastSyncIso = null;
      localStorage.setItem('last_synced_org', org_id);
    } else if (!lastSyncedOrg) {
      localStorage.setItem('last_synced_org', org_id);
    }

    // Force full pull if local DB is empty but we have a stored checkpoint
    if (lastSyncIso) {
      try {
        let totalCount = 0;
        for (const t of db.tables.map((x) => x.name)) {
          try {
            totalCount += await db[t].count();
          } catch (e) {
            /* ignore */
          }
        }
        if (totalCount === 0) {
          console.log('Local DB empty; forcing full sync pull from server');
          lastSyncIso = null;
        }
      } catch (e) {
        /* ignore */
      }
    }

    patchSyncStatus({ syncing: true, progress: 15, error: null });

    const localChanges = await collectLocalChanges(lastSyncIso);

    // Start progress at 30%
    patchSyncStatus({ syncing: true, progress: 30, error: null });

    // Slowly move to 40% over 10 seconds
    let fakeProgress = 30;
    progressTimer = setInterval(() => {
      fakeProgress += 1;

      if (fakeProgress <= 40) {
        patchSyncStatus({
          syncing: true,
          progress: fakeProgress,
          error: null,
        });
      }

      if (fakeProgress >= 40) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
    }, 1000);

    // Filter out empty tables to reduce payload size
    const filteredData = {};
    for (const t in localChanges) {
      if (Array.isArray(localChanges[t]) && localChanges[t].length > 0) {
        const serverTable = mapUploadTableName(t);
        filteredData[serverTable] = localChanges[t];
      }
    }

    const payload = {
      data: filteredData,
      last_sync: lastSyncIso,
      app_version: app_version,
      tabSesID: tabSessionId || null,
    };

    const res = await fetch(API_URL + '/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Sync failed: ${res.status} ${errText}`);
    }

    const body = await res.json();

    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }

    // Candidate checkpoint should be server-generated time only.
    // Never advance with client clock time, otherwise a fast client clock
    // can skip legitimate server updates from other devices.
    const candidateLastSyncIso = body.server_time || syncStartTimeIso;

    // Apply server updates (server wins on conflicts)
    await applyServerUpdates(body.updates || {}, org_id, body.server_time, (progress) => {
      patchSyncStatus({
        syncing: true,
        progress,
        error: null,
      });
    });

    // Mark uploaded records as synced using server's timestamp
    if (body.applied) {
      for (const table of Object.keys(body.applied)) {
        const entries = body.applied[table] || [];
        const localTableName = mapDownloadTableName(table);
        const localTable = db[localTableName];
        if (!localTable) continue;

        for (const e of entries) {
          try {
            const localId = e.local_id ?? null;
            const updatedAt = parseServerDatetimeToIso(e.updated_at || body.server_time || null);

            if (localId != null) {
              await localTable.update(localId, {
                last_synced_at: updatedAt,
                __skipHooks: true,
              });
            }
          } catch (err) {
            console.error('Failed to apply applied-mapping for', table, e, err);
          }
        }
      }
    }

    // Commit checkpoint only after all local writes complete successfully.
    localStorage.setItem(`last_sync_${org_id}`, candidateLastSyncIso);
    newLastSyncIso = candidateLastSyncIso;

    syncStatus.set({
      syncing: false,
      progress: 100,
      lastSync: newLastSyncIso,
      error: null,
    });
  } catch (err) {
    console.error('SYNC ERROR:', err);
    if (Date.now() - lastErrorToast > 300000) {
      lastErrorToast = Date.now();
      toast.error('SYNC ERROR:', err);
    }
    syncStatus.set({
      syncing: false,
      progress: 0,
      lastSync: localStorage.getItem(`last_sync_${localStorage.getItem('org_id')}`),
      error: err.message,
    });
  } finally {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    if (lockHeartbeat) {
      clearInterval(lockHeartbeat);
      lockHeartbeat = null;
    }
    releaseSyncLock(lockOwner);
    isSyncing = false;
  }
}

let lastErrorToast = 0;

let autoSyncInterval = null;

export function startAutoSync(intervalMs = 30000) {
  if (autoSyncInterval !== null) {
    console.log('Auto-sync already running');
    return;
  }

  autoSyncInterval = setInterval(() => {
    runSync().catch((e) => console.error('Auto-sync error', e));
  }, intervalMs);

  console.log('Auto-sync started with interval', intervalMs);
}

export function stopAutoSync() {
  if (autoSyncInterval !== null) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
    console.log('Auto-sync stopped');
  }
}
