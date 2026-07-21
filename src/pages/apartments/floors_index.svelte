<script>
  import { onMount } from 'svelte';
  import { db } from '../../db.js';
  import { t, shortID } from '../../i18n/i18n.js';
  import { push } from 'svelte-spa-router';
  let mode = 'list';
  let floors = [];
  let floorId = null;
  let loading = true;
  let buildings = [];

  import FloorModal from './FloorModal.svelte';

  let floorModalRef = null;

  async function loadBuildings() {
    buildings = await db.buildings.orderBy('created_at').reverse().toArray();
    buildings = buildings.filter((w) => w.status === 1);
  }
  
  let searchTerm = '';
  let currentPage = 1;
  let itemsPerPage = 10;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';
  let filterBuilding = 'all';

  async function load() {
    loading = true;
    await loadBuildings();
    floors = await db.floors.orderBy('created_at').reverse().toArray();
    floors = floors.filter((w) => w.status === 1);
    loading = false;
  }

  onMount(load);
  function setSort(col) {
    if (sortColumn === col) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    else {
      sortColumn = col;
      sortDirection = 'asc';
    }
  }

  $: filtered = (() => {
    let res = floors.slice();
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      res = res.filter(
        (w) =>
          (w.name && String(w.name).toLowerCase().includes(term)) ||
          (w.code && String(w.code).toLowerCase().includes(term)) ||
          (w.description && w.description.toLowerCase().includes(term)) ||
          (w.id && String(w.id).includes(term)),
      );
    }
    if (filterBuilding !== 'all') {
      res = res.filter((p) => p.building_id === parseInt(filterBuilding));
    }
    res = res.sort((a, b) => {
      let A = a[sortColumn];
      let B = b[sortColumn];
      if (A === undefined || A === null) return 1;
      if (B === undefined || B === null) return -1;
      if (typeof A === 'string') A = A.toLowerCase();
      if (typeof B === 'string') B = B.toLowerCase();
      if (A < B) return sortDirection === 'asc' ? -1 : 1;
      if (A > B) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return res;
  })();

  $: paginated = (() => {
    const s = (currentPage - 1) * itemsPerPage;
    return filtered.slice(s, s + itemsPerPage);
  })();
  $: totalPages = Math.ceil(filtered.length / itemsPerPage);

  $: if (searchTerm || filterBuilding) currentPage = 1;
</script>

{#if mode === 'list'}
  {#if loading}
    <div>Loading...</div>
  {:else}
    <div class="card shadow-2">
      <div class="card-header bg-body-tertiary border-bottom p-3">
        <div class="row g-3 align-items-center">
          <div class="col-md-4">
            <input class="form-control" placeholder={t('Search floors...')} bind:value={searchTerm} />
          </div>
          <div class="col-md-2">
            <select class="form-select form-select-sm me-3" bind:value={filterBuilding}>
              <option value="all">{t('All') + ' ' + t('Buildings')}</option>
              {#each buildings as building}
                <option value={building.id}>{building.name} ({building.code})</option>
              {/each}
            </select>
          </div>
          <div class="col-md-4 text-end">
            <select class="form-select form-select-sm d-inline-block w-auto" bind:value={itemsPerPage}>
              <option value={5}>5 {t('per page')}</option>
              <option value={10}>10 {t('per page')}</option>
              <option value={20}>20 {t('per page')}</option>
            </select>
          </div>
          <div class="col-md-2">
            <button
              class="btn btn-primary w-100"
              on:click={() => {
                floorModalRef?.openFloorModal();
              }}><i class="bi bi-plus-circle me-2"></i>{t('New Floor')}</button>
          </div>
        </div>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover table-sm align-middle">
            <thead class="table-light">
              <tr>
                <th class="ps-4 cursor-pointer" on:click={() => setSort('id')}
                  >{t('ID')}{#if sortColumn === 'id'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('building_id')}
                  >{t('Building')}{#if sortColumn === 'building_id'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('floor_number')}
                  >{t('Floor Number')}{#if sortColumn === 'floor_number'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('total_units_on_floor')}
                  >{t('Total')}
                  {t('Units')}{#if sortColumn === 'total_units_on_floor'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('created_at')}
                  >{t('Created')}{#if sortColumn === 'created_at'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th width="150" class="text-center">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {#each paginated as w}
                <tr>
                  <td class="ps-4 text-muted small">{shortID(w.id)}</td>
                  <td class="text-center"
                    >{buildings.find((b) => b.id === w.building_id)?.name || ''} ({buildings.find(
                      (b) => b.id === w.building_id,
                    )?.code || ''})</td>
                  <td class="text-center">{w.floor_number}</td>
                  <td class="text-center">{w.total_units_on_floor}</td>
                  <td class="text-center" dir="ltr">{w.created_at ? new Date(w.created_at).toLocaleString() : ''}</td>
                  <td class="text-center">
                    <button class="btn btn-sm btn-outline-secondary me-1" on:click={() => floorModalRef?.editFloor(w)}>
                      <i class="bi bi-pencil"></i>
                    </button>
                  </td>
                </tr>
              {/each}
              {#if filtered.length === 0}
                <tr><td colspan="12" class="text-center text-muted p-4">{t('No floors found.')}</td></tr>
              {/if}
            </tbody>
          </table>
        </div>
      </div>
      {#if !loading && filtered.length > 0}
        <div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3">
          <div class="text-muted small">
            {t('Showing')}
            {(currentPage - 1) * itemsPerPage + 1}
            {t('to')}
            {Math.min(currentPage * itemsPerPage, filtered.length)}
            {t('of')}
            {filtered.length}
            {t('entries')}
          </div>
          <nav>
            <ul class="pagination pagination-circle pagination-sm mb-0">
              <li class="page-item" class:disabled={currentPage === 1}>
                <button class="page-link" on:click={() => (currentPage = 1)}>&laquo;</button>
              </li>
              <li class="page-item" class:disabled={currentPage === 1}>
                <button class="page-link" on:click={() => (currentPage -= 1)}>&lt;</button>
              </li>
              {#each Array(totalPages) as _, i}
                <li class="page-item" class:active={currentPage === i + 1}>
                  <button class="page-link" on:click={() => (currentPage = i + 1)}>{i + 1}</button>
                </li>
              {/each}
              <li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}>
                <button class="page-link" on:click={() => (currentPage += 1)}>&gt;</button>
              </li>
              <li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}>
                <button class="page-link" on:click={() => (currentPage = totalPages)}>&raquo;</button>
              </li>
            </ul>
          </nav>
        </div>
      {/if}
    </div>
  {/if}
{/if}
<FloorModal bind:this={floorModalRef} on:saved={load} />
<style>
  .cursor-pointer {
    cursor: pointer;
  }
  .pagination-circle .page-link {
    border-radius: 50% !important;
    margin-left: 3px;
    margin-right: 3px;
    border: none;
  }
</style>
