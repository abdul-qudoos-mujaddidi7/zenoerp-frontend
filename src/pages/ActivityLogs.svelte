<script>
  import { db } from '../db.js';
  import { onMount } from 'svelte';

  import { t, lang, translate_org_type } from '../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let logs = [];
  let search = '';
  let sortField = 'created_at';
  let sortOrder = 'desc';
  let filterAction = '';
  let filterUser = '';
  let filterTable = '';
  let selectedLog = null;
  let users = [];
  let loading = true;

  function getTable(tableName) {
    return db.table ? db.table(tableName) : db[tableName];
  }

  async function fetchLogs() {
    loading = true;
    let query = getTable('activity_logs');
    if (filterAction) query = query.where('action').equals(filterAction);
    if (filterUser) query = query.where('user_id').equals(filterUser);
    if (filterTable) query = query.where('table_name').equals(filterTable);
    let allLogs = await query.toArray();
    if (search) {
      allLogs = allLogs.filter(
        (log) =>
          (log.entity_id && String(log.entity_id).toLowerCase().includes(search.toLowerCase())) ||
          (log.action && log.action.toLowerCase().includes(search.toLowerCase())) ||
          (log.table_name && log.table_name.toLowerCase().includes(search.toLowerCase())) ||
          (log.description && log.description.toLowerCase().includes(search.toLowerCase())),
      );
    }
    allLogs.sort((a, b) => {
      if (sortOrder === 'asc') return a[sortField] > b[sortField] ? 1 : -1;
      else return a[sortField] < b[sortField] ? 1 : -1;
    });
    logs = allLogs;
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
    fetchLogs();
  }

  onMount(async () => {
    await fetchUsers();
    await fetchLogs();
  });

  function showDetails(log) {
    selectedLog = log;
    activeTab = 'new';
  }

  function closeDetails() {
    selectedLog = null;
  }

  let activeTab = 'new';

  async function copyValues(type) {
    if (!selectedLog) return;
    const key = type === 'new' ? 'new_values' : 'old_values';
    const payload = selectedLog[key];
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

  $: paginatedActivitylogs = (() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return logs.slice(start, end);
  })();

  $: totalPages = Math.ceil(logs.length / itemsPerPage);

  $: if (filterAction || filterUser || filterTable || search) currentPage = 1;
</script>

<div class="activity-logs-container m-3">
  <div class="d-flex mb-3 gap-2 justify-content-between align-items-center">
    <input class="form-control" type="text" placeholder="Search..." bind:value={search} on:input={fetchLogs} />
    <select class="form-control" bind:value={filterAction} on:change={fetchLogs}>
      <option value="">All Actions</option>
      {#each Array.from(new Set(logs.map((l) => l.action)).values()) as action}
        <option value={action}>{action}</option>
      {/each}
    </select>
    <select class="form-control" bind:value={filterUser} on:change={fetchLogs}>
      <option value="">All Users</option>
      {#each users as user}
        <option value={user.id}>{user.username}</option>
      {/each}
    </select>
    <select class="form-control" bind:value={filterTable} on:change={fetchLogs}>
      <option value="">All Tables</option>
      {#each Array.from(new Set(logs.map((l) => l.table_name)).values()) as table}
        <option value={table}>{table}</option>
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
    <div>Loading logs...</div>
  {:else}
    <div class="table-responsive">
      <table class="table table-sm">
        <thead class="table-light">
          <tr>
            <th
              on:click={() => {
                sortField = 'id';
                sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
                fetchLogs();
              }}>ID {sortField === 'id' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
            <th
              on:click={() => {
                sortField = 'created_at';
                sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
                fetchLogs();
              }}>Date {sortField === 'created_at' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
            <th
              on:click={() => {
                sortField = 'user_id';
                sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
                fetchLogs();
              }}>User {sortField === 'user_id' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
            <th
              on:click={() => {
                sortField = 'action';
                sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
                fetchLogs();
              }}>Action {sortField === 'action' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
            <th
              on:click={() => {
                sortField = 'table_name';
                sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
                fetchLogs();
              }}>Table {sortField === 'table_name' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
            <th>Entity ID</th>
            <th>Description</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {#each paginatedActivitylogs as log}
            <tr>
              <td>{log.id}</td>
              <!-- show date in local time -->
              <td dir="ltr" class="text-start">{new Date(log.created_at).toLocaleString()}</td>
              <td>{users.find((u) => u.id === log.user_id)?.username || log.user_id}</td>
              <td>{log.action}</td>
              <td>{log.table_name}</td>
              <td>{log.entity_id}</td>
              <td>{log.description}</td>
              <td><button class="btn btn-primary" on:click={() => showDetails(log)}>View</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if paginatedActivitylogs.length === 0}
      <div>No activity logs found.</div>
    {/if}
  {/if}

  {#if !loading && logs.length > 0}
    <div class="d-flex justify-content-between align-items-center pt-3">
      <div class="text-muted small">
        {t('Showing')}
        {(currentPage - 1) * itemsPerPage + 1}
        {t('to')}
        {Math.min(currentPage * itemsPerPage, logs.length)}
        {t('of')}
        {logs.length}
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

  {#if selectedLog}
    <div class="modal show d-block" tabindex="-1" role="dialog" aria-modal="true">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header bg-body-tertiary">
            <h5 class="modal-title">Activity Log Details</h5>
            <button type="button" class="btn-close" aria-label="Close" on:click={closeDetails}
              ><i class="bi bi-x-lg"></i></button>
          </div>
          <div class="modal-body">
            <div class="row gy-3">
              <div class="col-md-6">
                <dl class="row mb-0">
                  <dt class="col-4">ID</dt>
                  <dd class="col-8">{selectedLog.id}</dd>
                  <dt class="col-4">User</dt>
                  <dd class="col-8">
                    {users.find((u) => u.id === selectedLog.user_id)?.username || selectedLog.user_id}
                  </dd>
                  <dt class="col-4">Action</dt>
                  <dd class="col-8">{selectedLog.action}</dd>
                  <dt class="col-4">Table</dt>
                  <dd class="col-8">{selectedLog.table_name}</dd>
                  <dt class="col-4">Entity</dt>
                  <dd class="col-8">{selectedLog.entity_id}</dd>
                  <dt class="col-4">Date</dt>
                  <dd class="col-8" dir="ltr">{new Date(selectedLog.created_at).toLocaleString()}</dd>
                  <dt class="col-4">IP</dt>
                  <dd class="col-8">{selectedLog.ip_address || '-'}</dd>
                  <dt class="col-4">Session</dt>
                  <dd class="col-8">{selectedLog.session_id || '-'}</dd>
                  <dt class="col-4">Device</dt>
                  <dd class="col-8">{selectedLog.device_info || '-'}</dd>
                  <dt class="col-4">Description</dt>
                  <dd class="col-8">{selectedLog.description || '-'}</dd>
                </dl>
              </div>
              <div class="col-md-6">
                <ul class="nav nav-tabs mb-2">
                  <li class="nav-item">
                    <a
                      class="nav-link {activeTab === 'new' ? 'active' : ''}"
                      href="#"
                      on:click|preventDefault={() => (activeTab = 'new')}>New Values</a>
                  </li>
                  <li class="nav-item">
                    <a
                      class="nav-link {activeTab === 'old' ? 'active' : ''}"
                      href="#"
                      on:click|preventDefault={() => (activeTab = 'old')}>Old Values</a>
                  </li>
                </ul>
                {#if activeTab === 'new'}
                  {#if selectedLog.new_values}
                    <div class="table-responsive">
                      <table class="table table-sm">
                        <thead>
                          <tr><th>Field</th><th>Value</th></tr>
                        </thead>
                        <tbody>
                          {#each Object.entries(JSON.parse(selectedLog.new_values)) as [field, value]}
                            <tr>
                              <td>{field}</td>
                              <td>{String(value)}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  {:else}
                    <div class="text-muted">No new values</div>
                  {/if}
                {/if}
                {#if activeTab === 'old'}
                  {#if selectedLog.old_values}
                    <div class="table-responsive">
                      <table class="table table-sm">
                        <thead>
                          <tr><th>Field</th><th>Value</th></tr>
                        </thead>
                        <tbody>
                          {#each Object.entries(JSON.parse(selectedLog.old_values)) as [field, value]}
                            <tr>
                              <td>{field}</td>
                              <td>{JSON.stringify(value)}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  {:else}
                    <div class="text-muted">No old values</div>
                  {/if}
                {/if}
                <div class="d-flex gap-2 mt-3">
                  <button class="btn btn-outline-primary btn-sm" on:click={() => copyValues('new')}>Copy New</button>
                  <button class="btn btn-outline-secondary btn-sm" on:click={() => copyValues('old')}>Copy Old</button>
                  <button class="btn btn-secondary ms-auto" on:click={closeDetails}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop show"></div>
  {/if}
</div>

<style>
  .logs-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
  }
  .logs-table th,
  .logs-table td {
    padding: 0.5rem 1rem;
    border: 1px solid #ddd;
  }
  .logs-table th {
    background: #f8f9fa;
    cursor: pointer;
  }
  .logs-table tr:hover {
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

  .modal-body {
    max-height: 60vh;
    overflow: auto;
  }

  .btn-close {
    border: none;
    background: transparent;
    font-size: 1.25rem;
    line-height: 1;
    opacity: 0.7;
  }
</style>
