/**
 * Run in browser DevTools console while logged into the ERP app:
 *
 *   import('/scripts/export-dexie.mjs').then(m => m.exportDexieBackup())
 *
 * Or paste the exportDexieBackup function body into the console.
 */
import Dexie from 'dexie';

export async function exportDexieBackup(dbName = 'ERPDatabase') {
  const db = new Dexie(dbName);
  await db.open();
  const dump = { exported_at: new Date().toISOString(), dbName, tables: {} };
  for (const table of db.tables) {
    dump.tables[table.name] = await table.toArray();
  }
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dexie-backup-${dbName}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return dump;
}
