<script>
  import { createEventDispatcher } from "svelte";

  import { db } from "../db.js";

  const dispatch = createEventDispatcher();

  let exporting = false;
  let importing = false;
  let progress = 0;
  let message = "";
  let fileInput;


  function blobToBase64(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(base64) {
    const arr = base64.split(",");
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);

    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    return new Blob([u8arr], { type: mime });
  }

  function downloadFile(content, filename) {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  /* ------------------ Export ------------------ */

  async function exportDatabase() {
    exporting = true;
    progress = 0;
    message = "Preparing backup...";

    try {
      const exportData = {};
      const tables = db.tables;
      let processedTables = 0;

      for (const table of tables) {
        const rows = await table.toArray();

        const processedRows = await Promise.all(
          rows.map(async (row) => {
            const newRow = { ...row };

            for (const key in newRow) {
              if (newRow[key] instanceof Blob) {
                newRow[key] = await blobToBase64(newRow[key]);
              }
            }

            return newRow;
          })
        );

        exportData[table.name] = processedRows;

        processedTables++;
        progress = Math.round(
          (processedTables / tables.length) * 100
        );
      }

      const backup = {
        version: 1,
        date: new Date().toISOString(),
        data: exportData
      };

      downloadFile(
        JSON.stringify(backup),
        `erp-backup-${Date.now()}.json`
      );

      message = "Backup completed successfully.";
      dispatch("exported");
    } catch (err) {
      console.error(err);
      message = "Export failed.";
    }

    exporting = false;
  }

  /* ------------------ Import ------------------ */

  async function importDatabase(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm("This will overwrite current database. Continue?"))
      return;

    importing = true;
    progress = 0;
    message = "Restoring backup...";

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const tables = Object.keys(parsed.data);
      let processedTables = 0;

      await db.transaction("rw", db.tables, async () => {
        for (const tableName of tables) {
          const table = db.table(tableName);

          await table.clear();

          const rows = parsed.data[tableName];

          for (const row of rows) {
            for (const key in row) {
              if (
                typeof row[key] === "string" &&
                row[key].startsWith("data:")
              ) {
                row[key] = base64ToBlob(row[key]);
              }
            }
          }

          await table.bulkPut(rows);

          processedTables++;
          progress = Math.round(
            (processedTables / tables.length) * 100
          );
        }
      });

      message = "Restore completed successfully.";
      dispatch("imported");
    } catch (err) {
      console.error(err);
      message = "Restore failed.";
    }

    importing = false;
    fileInput.value = "";
  }

  async function importForcedDatabase(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm("This will overwrite current database. Continue?"))
      return;

    importing = true;
    progress = 0;
    message = "Restoring backup...";

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const tables = Object.keys(parsed.data);
      let processedTables = 0;

      await db.transaction("rw", db.tables, async () => {
        for (const tableName of tables) {
          const table = db.table(tableName);

          await table.clear();

          const rows = parsed.data[tableName];

          for (const row of rows) {

            row.last_synced_at = "1900-04-09T11:07:57.709Z";
            for (const key in row) {
              if (
                typeof row[key] === "string" &&
                row[key].startsWith("data:")
              ) {
                row[key] = base64ToBlob(row[key]);
              }
            }
          }

          await table.bulkPut(rows);

          processedTables++;
          progress = Math.round(
            (processedTables / tables.length) * 100
          );
        }
      });

      message = "Restore completed successfully.";
      dispatch("imported");
    } catch (err) {
      console.error(err);
      message = "Restore failed.";
    }

    importing = false;
    fileInput.value = "";
  }
</script>

<!-- MDBootstrap Card -->
<div class="card shadow-3">
  <div class="card-header bg-dark text-white">
    <h5 class="mb-0">Database Backup & Restore</h5>
  </div>

  <div class="card-body">

    <!-- Export Section -->
    <div class="mb-4">
      <h6>Backup Database</h6>
      <p class="text-muted small">
        Download a full backup including images and all data.
      </p>

      <button
        class="btn btn-success"
        on:click={exportDatabase}
        disabled={exporting || importing}
      >
        {exporting ? "Exporting..." : "Download Backup"}
      </button>
    </div>

    <hr />

    <!-- Import Section -->
    <div class="mb-3">
      <h6>Restore Database</h6>
      <p class="text-muted small">
        Restore from a previously exported backup file.
      </p>

      <input
        type="file"
        accept=".json"
        class="form-control mb-3"
        bind:this={fileInput}
        on:change={importDatabase}
        disabled={exporting || importing}
      />
    </div>

    <div class="mb-3">
      <h6>Restore Forced Database</h6>
      <p class="text-muted small">
        Restore from a previously exported backup file and remove lastSync to force sync.
      </p>

      <input
        type="file"
        accept=".json"
        class="form-control mb-3"
        bind:this={fileInput}
        on:change={importForcedDatabase}
        disabled={exporting || importing}
      />
    </div>

    <!-- Progress -->
    {#if exporting || importing}
      <div class="progress mb-3">
        <div
          class="progress-bar"
          role="progressbar"
          style="width: {progress}%"
        >
          {progress}%
        </div>
      </div>
    {/if}

    <!-- Message -->
    {#if message}
      <div class="alert alert-info mt-2">
        {message}
      </div>
    {/if}
  </div>
</div>

<style>
  .shadow-3 {
    border-radius: 12px;
  }
</style>
