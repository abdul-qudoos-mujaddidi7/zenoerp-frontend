<script>
  import { db, logActivity } from '../db.js';
  import { onMount } from 'svelte';
  import { link, push } from 'svelte-spa-router';

  import { t, lang, translate_org_type } from '../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let page = 'list';

  let tables = db.tables;

  import { toast } from '../ToastUI/toast.js';

  $: selectedTable = page;

  $: selected = tables.find((t) => t.name === selectedTable);

  $: columns = selected ? [selected.schema.primKey.name, ...selected.schema.indexes.map((i) => i.name)] : [];

  $: if (selectedTable && selectedTable != 'list') {
    fetchRows();
  }

  let rows = [];
  let search = '';
  let sortField = 'created_at';
  let sortOrder = 'desc';
  let filterAction = '';
  let filterUser = '';
  let filterTable = selectedTable;
  let selectedRow = null;
  let users = [];
  let loading = false;

  function getTable(tableName) {
    return db.table ? db.table(tableName) : db[tableName];
  }

  async function fetchRows() {
    loading = true;
    let table = getTable(selectedTable);
    let query = table;

    const indexedFields = table.schema.indexes.map((i) => i.name);

    if (filterAction && indexedFields.includes('action')) {
      query = query.where('action').equals(filterAction);
    }

    if (filterUser && indexedFields.includes('user_id')) {
      query = query.where('user_id').equals(filterUser);
    }

    if (filterTable && indexedFields.includes('table_name')) {
      query = query.where('table_name').equals(filterTable);
    }

    let allRows = await query.toArray();
    if (search) {
      allRows = allRows.filter(
        (row) =>
          (row.id && row.id.toString().includes(search.toLowerCase())) ||
          (row.name && row.name.toLowerCase().includes(search.toLowerCase())) ||
          (row.description && row.description.toLowerCase().includes(search.toLowerCase())),
      );
    }
    allRows.sort((a, b) => {
      if (sortOrder === 'asc') return a[sortField] > b[sortField] ? 1 : -1;
      else return a[sortField] < b[sortField] ? 1 : -1;
    });
    rows = allRows;
    loading = false;
  }

  async function fetchUsers() {
    users = await getTable('users').toArray();
  }

  function clearFilters() {
    filterAction = '';
    filterUser = '';
    filterTable = '';
    search = '';
    if (selectedTable != 'list') {
      fetchRows();
    }
  }
  let editValue = null;
  onMount(async () => {
    tables = db.tables;

    for (let i = 0; i < tables.length; i++) {
      tables[i].counted = await db.table(tables[i].name).count();
      console.log(tables[i].name + ': ' + tables[i].counted);
    }

    tables = [...tables];

    await fetchUsers();

    if (selectedTable != 'list') {
      await fetchRows();
    }
  });

  function showDetails(row) {
    selectedRow = row;
    activeTab = 'new';
  }

  function closeDetails() {
    selectedRow = null;
  }

  let activeTab = 'new';

  async function copyValues(type) {
    if (!selectedRow) return;
    const key = type === 'new' ? 'new_values' : 'old_values';
    const payload = selectedRow[key];
    if (!payload) return alert('No values to copy');
    try {
      await navigator.clipboard.writeText(payload);
      // small visual confirmation
      alert(`${type === 'new' ? 'New' : 'Old'} values copied to clipboard`);
    } catch (err) {
      console.error('Copy failed', err);
      alert('Copy failed');
    }
  }

  let currentPage = 1;
  let itemsPerPage = 10;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';

  function getPageNumbers(current, total) {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
        range.push(i);
      }
    }

    for (let i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    return rangeWithDots;
  }

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  $: paginatedActivityrows = (() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return rows.slice(start, end);
  })();

  $: totalPages = Math.ceil(rows.length / itemsPerPage);

  $: if (filterAction || filterUser || filterTable || search) currentPage = 1;
</script>

<div class="row">
  <div class="col-md-{selectedTable == 'list' ? '12' : '2'}">
    <div class="row">
      <div class="col-md-{selectedTable == 'list' ? '3' : '12'}">
        <a
          use:link
          href="/dashboard/tables/list"
          type="button"
          class="btn btn-link p-1 d-flex w-100 d-block justify-content-between align-items-center {selectedTable ==
          'list'
            ? 'active'
            : ''}"
          >list <i class="bi bi-list"></i>
        </a>
      </div>
      {#each tables as table, index}
        <div class="col-md-{selectedTable == 'list' ? '3' : '12'}">
          <a
            use:link
            href="/dashboard/tables/{table.name}"
            type="button"
            class="btn btn-link p-1 d-flex w-100 d-block justify-content-between align-items-center {selectedTable ==
            table.name
              ? 'active'
              : ''}">
            {table.name}<span class="badge badge-primary rounded-pill">{table.counted}</span>
          </a>
        </div>
      {/each}
    </div>
  </div>
  <div class="col-md-10 {selectedTable == 'list' ? 'd-none' : ''}">
    <div class="rows-container m-3">
      <div class="d-flex mb-3 gap-2 justify-content-between align-items-center">
        <input class="form-control" type="text" placeholder="Search..." bind:value={search} on:input={fetchRows} />
        <select class="form-control" bind:value={filterAction} on:change={fetchRows}>
          <option value="">All Actions</option>
          {#each Array.from(new Set(rows.map((l) => l.action)).values()) as action}
            <option value={action}>{action}</option>
          {/each}
        </select>
        <select class="form-control" bind:value={filterUser} on:change={fetchRows}>
          <option value="">All Users</option>
          {#each users as user}
            <option value={user.id}>{user.username}</option>
          {/each}
        </select>

        <select class="form-select form-select-sm d-inline-block w-auto" bind:value={itemsPerPage}>
          <option value={5}>5 {t('per page')}</option>
          <option value={10}>10 {t('per page')}</option>
          <option value={20}>20 {t('per page')}</option>
          <option value={50}>50 {t('per page')}</option>
          <option value={100}>100 {t('per page')}</option>
          <option value={250}>250 {t('per page')}</option>
        </select>
        <button class="btn btn-primary" on:click={clearFilters}>Clear</button>
      </div>
      {#if loading}
        <div>Loading rows...</div>
      {:else}
        <div class="table-responsive">
          <table class="table table-sm">
            <thead class="table-light">
              <tr>
                <th>Actions</th>
                {#each columns as col}
                  <th
                    on:click={() => {
                      sortField = col;
                      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
                      fetchRows();
                    }}>{col} {sortField === col ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
                {/each}

                <th
                  on:click={() => {
                    sortField = 'created_at';
                    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
                    fetchRows();
                  }}>created_at {sortField === 'created_at' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
              </tr>
            </thead>
            <tbody>
              {#each paginatedActivityrows as row}
                <tr>
                  <td
                    ><button
                      class="btn btn-sm btn-primary"
                      on:click={() => {
                        selectedRow = row;
                      }}><i class="bi bi-eye"></i></button
                    ></td>

                  {#each columns as col}
                    <td>{row[col]}</td>
                  {/each}

                  <td>{row['created_at'] ? row['created_at'] : '-'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if paginatedActivityrows.length === 0}
          <div>No rows found.</div>
        {/if}
      {/if}

      {#if !loading && rows.length > 0}
        <div class="d-flex justify-content-between align-items-center pt-3">
          <div class="text-muted small">
            {t('Showing')}
            {(currentPage - 1) * itemsPerPage + 1}
            {t('to')}
            {Math.min(currentPage * itemsPerPage, rows.length)}
            {t('of')}
            {rows.length}
            {t('entries')}
          </div>
          <nav>
            <ul class="pagination pagination-circle pagination-sm mb-0">
              <li class="page-item" class:disabled={currentPage === 1}>
                <button class="page-link" on:click={() => (currentPage = 1)}
                  ><i class="bi bi-chevron-double-{t('dir') === 'rtl' ? 'right' : 'left'}"></i></button>
              </li>
              <li class="page-item" class:disabled={currentPage === 1}>
                <button class="page-link" on:click={() => (currentPage -= 1)}
                  ><i class="bi bi-chevron-{t('dir') === 'rtl' ? 'right' : 'left'}"></i></button>
              </li>

              {#each getPageNumbers(currentPage, totalPages) as pageNum, idx (pageNum === '...' ? `dot-${idx}` : pageNum)}
                {#if pageNum === '...'}
                  <li class="page-item disabled">
                    <span class="page-link">...</span>
                  </li>
                {:else}
                  <li class="page-item" class:active={currentPage === pageNum}>
                    <button class="page-link" on:click={() => (currentPage = pageNum)}>{pageNum}</button>
                  </li>
                {/if}
              {/each}

              <li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}>
                <button class="page-link" on:click={() => (currentPage += 1)}
                  ><i class="bi bi-chevron-{t('dir') === 'rtl' ? 'left' : 'right'}"></i></button>
              </li>
              <li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}>
                <button class="page-link" on:click={() => (currentPage = totalPages)}
                  ><i class="bi bi-chevron-double-{t('dir') === 'rtl' ? 'left' : 'right'}"></i></button>
              </li>
            </ul>
          </nav>
        </div>
      {/if}

      {#if selectedRow}
        <div class="modal show d-block" tabindex="-1" aria-modal="true" dir="ltr">
          <div class="modal-dialog modal-lg" role="document">
            <div class="modal-content">
              <div class="modal-header bg-body-tertiary">
                <h5 class="modal-title">Row Details</h5>
                <button type="button" class="btn-close" aria-label="Close" on:click={closeDetails}
                  ><i class="bi bi-x-lg"></i></button>
              </div>
              <div class="modal-body">
                <div class="row g-2">
                  {#each columns as col}
                    <div class="col-md-3 border">
                      <div class="text-center text-primary mt-1" style="line-height: 16pt;"><small>{col}</small></div>
                      <div class="mb-3 text-center">
                        {#if selectedRow.editable && selectedRow.editable === col}
                          <textarea class="form-control form-control-sm" bind:value={editValue}></textarea>

                          <button
                            class="btn btn-sm btn-success mt-1 px-2"
                            on:click={async () => {
                              if (col == 'status' || col == 'id' || col.endsWith('_id')) {
                                if (isNaN(Number(editValue))) {
                                  return toast.error(
                                    t('Invalid value'),
                                    t('Please enter a valid number for this field.'),
                                  );
                                }
                              }
                              const ok = await toast.confirm(
                                t('Are you sure?'),
                                t('This action will update the value of {col} to "{editValue}" for this row.')
                                  .replace('{col}', col)
                                  .replace('{editValue}', editValue),
                              );
                              if (ok) {
                                if (col == 'status' || col == 'id' || col.endsWith('_id')) {
                                  await getTable(selectedTable).update(selectedRow.id, { [col]: Number(editValue) });
                                } else {
                                  await getTable(selectedTable).update(selectedRow.id, { [col]: editValue });
                                }
                                await logActivity({
                                  user_id: parseInt(localStorage.getItem('user_id')) || 0,
                                  action: 'update',
                                  table_name: selectedTable,
                                  entity_id: selectedRow.id,
                                  old_values: JSON.stringify(selectedRow),
                                  new_values: JSON.stringify({ [col]: editValue }),
                                  description: `Force Updated ${selectedTable} #${selectedRow.id}`,
                                });
                                toast.success(t('Success'), t('Value updated successfully'));

                                await fetchRows();
                                selectedRow = rows.find((r) => r.id === selectedRow.id);
                                selectedRow.editable = false;
                              }
                            }}><i class="bi bi-check"></i></button>
                          <button
                            class="btn btn-sm btn-danger mt-1 px-2"
                            on:click={() => {
                              selectedRow.editable = false;
                            }}><i class="bi bi-x"></i></button>
                        {:else}
                          {selectedRow[col]}
                          <button
                            class="btn btn-sm btn-warning px-2"
                            on:click={() => {
                              selectedRow.editable = col;
                              editValue = selectedRow[col];
                            }}><i class="bi bi-pencil"></i></button>
                        {/if}
                      </div>
                    </div>
                  {/each}
                  <div class="col-md-3 border">
                    <div class="text-center text-primary mt-1"><small>{'created_at'}</small></div>
                    <div class="mb-3 text-center">{selectedRow['created_at']}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-backdrop show"></div>
      {/if}
    </div>
  </div>
</div>

<style>
  .rows-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
  }
  .rows-table th,
  .rows-table td {
    padding: 0.5rem 1rem;
    border: 1px solid #ddd;
  }
  .rows-table th {
    background: #f8f9fa;
    cursor: pointer;
  }
  .rows-table tr:hover {
    background: #f1f1f1;
  }
  .filter-bar {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .details-modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--modal-overlay-padding, 1rem);
  }
  .details-content {
    background: #fff;
    padding: var(--card-padding, 1rem);
    border-radius: var(--card-radius, 0.5rem);
    max-width: min(95vw, 37.5rem);
    max-height: min(90vh, 40rem);
    width: 100%;
    overflow: auto;
    box-shadow: 0 2px 16px rgba(0, 0, 0, 0.2);
  }
  .modal-backdrop.show {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 1040;
  }

  .modal.show.d-block {
    z-index: 1050;
  }

  .btn-close {
    border: none;
    background: transparent;
    font-size: 1.25rem;
    line-height: 1;
    opacity: 0.7;
  }
</style>
