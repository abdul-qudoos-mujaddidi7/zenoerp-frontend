<script>
  import { db } from '../db.js';
  import { onMount, tick } from 'svelte';
  import { push } from 'svelte-spa-router';

  import { generatePDF, generatingPDF } from './generatePDF.js';

  import { showDate, setDatePickers } from '../calendar.js';

  import { t, lang, translate_org_type, shortID } from '../i18n/i18n';
  import IndexPageLayout from '../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../components/common/FilterToolbar.svelte';
  import ActionButton from '../components/common/ActionButton.svelte';
  import PaginationBar from '../components/common/PaginationBar.svelte';
  import EmptyState from '../components/common/EmptyState.svelte';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let stocktransfers = [];
  let stocktransferId = null;
  let loading = true;
  let products = [];

  // --- Table State ---
  let searchTerm = '';
  let filterStatus = 'all'; // 'all', 'confirmed', 'draft', etc.
  let currentPage = 1;
  let itemsPerPage = 10;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';

  function handleDateChange(inputName, value) {
    if (inputName === 'fromDate') fromDate = value;
    else if (inputName === 'toDate') toDate = value;
  }

  async function load() {
    loading = true;
    products = await db.products.where({ status: 1 }).toArray();
    // Order stocktransfers by transfer_date descending so newest appear first
    stocktransfers = await db.stock_transfers.orderBy('transfer_date').reverse().toArray();

    stocktransfers = stocktransfers.filter((s) => s.status == 1);
    loading = false;
  }

  onMount(async () => {
    await load();
    tick().then(() => setDatePickers(handleDateChange));
  });

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

  function getLocalDate() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  }

  let fromDate = '';
  let toDate = '';
  // Reactive computed list
  $: filteredStockTransfers = (() => {
    let result = stocktransfers.filter((s) => {
      const transferDate = new Date(s.created_at);
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      // If both dates are same, show that day's stocktransfers
      if (from && to && from.getTime() === to.getTime()) {
        return transferDate.toDateString() === from.toDateString();
      }
      if (from && transferDate < from) return false;
      if (to && transferDate > to) return false;
      return true;
    });

    if (filterStatus !== 'all') {
      result = result.filter((s) => s.transfer_status === filterStatus);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          (s.transfer_number && String(s.transfer_number).toLowerCase().includes(term)) ||
          (s.description && s.description.toLowerCase().includes(term)) ||
          (s.id && String(s.id).includes(term)),
      );
    }

    result = result.sort((a, b) => {
      if (sortColumn == 'total_amount') {
        const valA = Number(a[sortColumn]) || 0;
        const valB = Number(b[sortColumn]) || 0;
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      let valA = a[sortColumn];
      let valB = b[sortColumn];

      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  })();

  $: paginatedStockTransfers = (() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredStockTransfers.slice(start, end);
  })();

  $: totalPages = Math.ceil(filteredStockTransfers.length / itemsPerPage);

  $: if (searchTerm || filterStatus) currentPage = 1;

  let totalStockTransfersAmount = {};
  // consider currency if you have multi currency support
  $: totalStockTransfersAmount = filteredStockTransfers.reduce((totals, s) => {
    if (!s.transfer_status || s.transfer_status !== 'confirmed') return totals; // Skip cancelled or invalid stocktransfers
    if (!totals[s.currency]) totals[s.currency] = 0;
    totals[s.currency] += Number(s.total_amount);
    return totals;
  }, {});

  $: transferToolbarFilters = [
    {
      key: 'status',
      label: t('Status'),
      value: filterStatus,
      icon: 'bi-activity',
      options: [
        { value: 'all', label: t('All Statuses') },
        { value: 'confirmed', label: t('Confirmed') },
        { value: 'draft', label: t('Draft') },
        { value: 'cancelled', label: t('Cancelled') },
      ],
    },
    { key: 'fromDate', label: t('From Date'), value: fromDate, icon: 'bi-calendar3', type: 'date' },
    { key: 'toDate', label: t('To Date'), value: toDate, icon: 'bi-calendar3', type: 'date' },
  ];

  function handleToolbarFilter(event) {
    const { key, value } = event.detail;
    if (key === 'status') filterStatus = value;
    if (key === 'fromDate') fromDate = value;
    if (key === 'toDate') toDate = value;
    currentPage = 1;
  }

  function resetFilters() {
    filterStatus = 'all';
    fromDate = '';
    toDate = '';
    currentPage = 1;
  }
</script>

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('Stock Transfers')}
  toolbarWidth="25rem"
  showFooter={!loading && filteredStockTransfers.length > 0}
  dense={true}
  contained={false}
  contentClass="stock-transfers-index-content"
  tablePadding={true}>
  <svelte:fragment slot="actions">
    <ActionButton
      icon="bi-plus-lg"
      label={`+ ${t('New Stock Transfer')}`}
      on:click={() => push(`/dashboard/stock-transfer-form/0`)} />
    <ActionButton
      variant="secondary"
      icon="bi-file-pdf-fill"
      label={t('PDF')}
      loading={generatingPDF}
      disabled={generatingPDF || loading}
      on:click={() => generatePDF('stocktransfers', filteredStockTransfers, fromDate, toDate)} />
  </svelte:fragment>

  <svelte:fragment slot="toolbar">
    <FilterToolbar
      searchValue={searchTerm}
      searchPlaceholder={t('Search Stock Transfers...')}
      filters={transferToolbarFilters}
      filterLabel={t('Filter')}
      resetLabel={t('Clear Filters')}
      showReset={true}
      on:searchChange={(event) => {
        searchTerm = event.detail;
        currentPage = 1;
      }}
      on:filterChange={handleToolbarFilter}
      on:reset={resetFilters} />
  </svelte:fragment>

  {#if loading}
    <div class="index-table-state">
      <EmptyState loading message={t('Loading...')} />
    </div>
  {:else if filteredStockTransfers.length === 0}
    <div class="index-table-state">
      <EmptyState icon="bi-arrow-left-right" message={t('No stocktransfers found.')} />
    </div>
  {:else}
      <div class="table-responsive">
        <table class="table table-hover table-sm align-middle">
          <thead class="table-light">
            <tr>
              <th class="ps-4 cursor-pointer" on:click={() => setSort('id')}>
                {t('ID')}
                {#if sortColumn === 'id'}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}
              </th>
              <th class="text-center cursor-pointer" on:click={() => setSort('transfer_number')}
                >{t('Transfer #')}{#if sortColumn === 'transfer_number'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
              <th class="text-center cursor-pointer" on:click={() => setSort('transfer_date')}
                >{t('Date')}{#if sortColumn === 'transfer_date'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
              <th class="text-center cursor-pointer" on:click={() => setSort('total_amount')}
                >{t('Total')}{#if sortColumn === 'total_amount'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
              <th class="text-center">{t('Status')}</th>
              <th class="text-center">{t('Created Date')}</th>
              <th width="150" class="text-center">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedStockTransfers as s}
              <tr>
                <td class="ps-4 text-muted small">{shortID(s.id)}</td>
                <td class="text-center">{s.transfer_number}</td>
                <td class="text-center">{@html showDate(s.transfer_date)}</td>
                <td class="text-center"
                  >{Number(s.total_amount).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}{' '}
                  {t(s.currency)}</td>
                <td class="text-center"
                  ><span class="badge badge-{s.transfer_status === 'confirmed' ? 'success' : 'warning'}"
                    >{t(s.transfer_status)}</span
                  ></td>

                <td class="text-center"><span dir="ltr">{new Date(s.created_at).toLocaleString()}</span></td>
                <td class="text-center">
                  <button
                    class="btn btn-sm btn-outline-primary me-1"
                    on:click={() => push(`/dashboard/stock-transfers/${s.id}`)}
                    title="View"><i class="bi bi-eye"></i></button>
                  {#if s.transfer_status === 'draft'}
                    <button
                      class="btn btn-sm btn-warning"
                      on:click={() => push(`/dashboard/stock-transfer-form/` + s.id)}>{t('Edit')}</button>
                  {/if}
                </td>
              </tr>
            {/each}
            {#if filteredStockTransfers.length === 0}
              <tr><td colspan="12" class="text-center text-muted p-4">{t('No stocktransfers found.')}</td></tr>
            {/if}
          </tbody>
        </table>
      </div>
  {/if}

  <svelte:fragment slot="footer">
    <PaginationBar
      bind:currentPage
      {totalPages}
      {itemsPerPage}
      totalItems={filteredStockTransfers.length}
      ariaLabel={t('Stock Transfers pagination')}
      rowLabel={t('rows')}
      on:perPageChange={(event) => {
        itemsPerPage = Number(event.detail);
        currentPage = 1;
      }}
      {getPageNumbers} />
  </svelte:fragment>
</IndexPageLayout>

<style>
  .cursor-pointer {
    cursor: pointer;
  }
</style>
