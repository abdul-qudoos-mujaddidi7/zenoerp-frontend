<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { db } from '../../db.js';
  import { showDate } from '../../calendar.js';
  import { t, lang, translate_org_type, shortID } from '../../i18n/i18n.js';
  import { generatePDF, generatingPDF } from '../generatePDF.js';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';

  export let account_id = null;

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let saleReturns = [];
  let purchaseReturns = [];
  let saleReturnItems = [];
  let purchaseReturnItems = [];
  let products = [];
  let units = [];
  let loading = true;

  let searchTerm = '';
  let filterType = 'all';
  let fromDate = '';
  let toDate = '';
  let currentPage = 1;
  let itemsPerPage = 10;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';
  let showReturnStats = false;

  async function load() {
    loading = true;
    try {
      [
        products,
        units,
        saleReturns,
        purchaseReturns,
        saleReturnItems,
        purchaseReturnItems,
      ] = await Promise.all([
        db.products.where({ status: 1 }).toArray(),
        db.product_units.where({ status: 1 }).toArray(),
        db.sale_returns.orderBy('return_date').reverse().toArray(),
        db.purchase_returns.orderBy('return_date').reverse().toArray(),
        db.sale_return_items.where('status').equals(1).toArray(),
        db.purchase_return_items.where('status').equals(1).toArray(),
      ]);

      saleReturns = saleReturns.filter((item) => item.status == 1);
      purchaseReturns = purchaseReturns.filter((item) => item.status == 1);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  function getProductName(productId) {
    return products.find((product) => product.id == productId)?.name || t('Unknown product');
  }

  function getUnitName(unitId) {
    return units.find((unit) => unit.id == unitId)?.name || '';
  }

  function getReturnType(item) {
    return item.sale_return_id ? 'sale' : 'purchase';
  }

  function getDocumentId(item) {
    if (item.sale_return_id) {
      return saleReturns.find((record) => record.id == item.sale_return_id)?.sale_id;
    }
    return purchaseReturns.find((record) => record.id == item.purchase_return_id)?.purchase_id;
  }

  function openDocument(item) {
    const id = getDocumentId(item);
    if (!id) return;
    push(item.sale_return_id ? `/dashboard/sales/${id}` : `/dashboard/purchases/${id}`);
  }

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function getPageNumbers(current, total) {
    const pages = [];
    const compact = [];
    let previous;

    for (let page = 1; page <= total; page += 1) {
      if (page === 1 || page === total || (page >= current - 2 && page <= current + 2)) pages.push(page);
    }

    for (const page of pages) {
      if (previous && page - previous > 1) compact.push(page - previous === 2 ? previous + 1 : '...');
      compact.push(page);
      previous = page;
    }
    return compact;
  }

  function isWithinDateRange(item) {
    if (!fromDate && !toDate) return true;
    const value = new Date(item.created_at);
    if (Number.isNaN(value.getTime())) return false;

    if (fromDate) {
      const from = new Date(`${fromDate}T00:00:00`);
      if (value < from) return false;
    }
    if (toDate) {
      const to = new Date(`${toDate}T23:59:59.999`);
      if (value > to) return false;
    }
    return true;
  }

  $: allReturnItems = [...saleReturnItems, ...purchaseReturnItems];

  $: filteredReturns = allReturnItems
    .filter((item) => {
      if (!isWithinDateRange(item)) return false;
      if (filterType !== 'all' && getReturnType(item) !== filterType) return false;
      if (account_id && item.account_id && item.account_id !== Number(account_id)) return false;

      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;
      const documentId = getDocumentId(item);
      return [
        item.id,
        documentId,
        item.invoice_number,
        item.description,
        getProductName(item.product_id),
      ].some((value) => String(value ?? '').toLowerCase().includes(term));
    })
    .sort((a, b) => {
      let left = sortColumn === 'product_id' ? getProductName(a.product_id) : a[sortColumn];
      let right = sortColumn === 'product_id' ? getProductName(b.product_id) : b[sortColumn];

      if (['unit_price', 'quantity', 'subtotal', 'id'].includes(sortColumn)) {
        left = Number(left) || 0;
        right = Number(right) || 0;
      } else {
        left = String(left ?? '').toLowerCase();
        right = String(right ?? '').toLowerCase();
      }
      if (left === right) return 0;
      const result = left < right ? -1 : 1;
      return sortDirection === 'asc' ? result : -result;
    });

  $: totalPages = Math.ceil(filteredReturns.length / itemsPerPage);
  $: if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
  $: paginatedReturns = filteredReturns.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  $: totalReturnsAmount = filteredReturns.reduce((totals, item) => {
    const currency = item.currency || '';
    totals[currency] = (totals[currency] || 0) + Number(item.subtotal || 0);
    return totals;
  }, {});

  $: saleCount = filteredReturns.filter((item) => item.sale_return_id).length;
  $: purchaseCount = filteredReturns.filter((item) => item.purchase_return_id).length;

  $: toolbarFilters = [
    {
      key: 'type',
      label: t('Return Type'),
      icon: 'bi-arrow-left-right',
      value: filterType,
      options: [
        { value: 'all', label: t('All Returns') },
        { value: 'sale', label: t('Sale Returns') },
        { value: 'purchase', label: t('Purchase Returns') },
      ],
    },
    { key: 'fromDate', label: t('From Date'), type: 'date', value: fromDate },
    { key: 'toDate', label: t('To Date'), type: 'date', value: toDate },
  ];

  function handleFilterChange(event) {
    const { key, value } = event.detail;
    if (key === 'type') filterType = value;
    if (key === 'fromDate') fromDate = value;
    if (key === 'toDate') toDate = value;
    currentPage = 1;
  }

  function resetFilters() {
    filterType = 'all';
    fromDate = '';
    toDate = '';
    currentPage = 1;
  }

  function formatAmountMap(amounts) {
    const entries = Object.entries(amounts);
    if (!entries.length) return `0 ${t('Returns')}`;
    return entries
      .map(([currency, amount]) =>
        `${amount.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${t(currency)}`,
      )
      .join(' · ');
  }
</script>

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('Returns')}
  toolbarWidth="25rem"
  showStats={showReturnStats}
  showFooter={!loading && filteredReturns.length > 0}
  dense={true}
  contained={false}
  contentClass="returns-index-content"
  tablePadding={true}>
  <svelte:fragment slot="actions">
    <ActionButton
      variant="secondary"
      icon="bi-file-pdf-fill"
      label={t('PDF')}
      loading={generatingPDF}
      disabled={loading || filteredReturns.length === 0 || generatingPDF}
      on:click={() =>
        generatePDF('sales', filteredReturns, fromDate, toDate, filteredReturns.length, totalReturnsAmount)} />

    <button
      type="button"
      class="index-settings-button"
      class:is-active={showReturnStats}
      aria-label={t('Summary')}
      aria-expanded={showReturnStats}
      title={t('Summary')}
      on:click={() => (showReturnStats = !showReturnStats)}>
      <i class="bi {showReturnStats ? 'bi-x-lg' : 'bi-arrow-return-left'}" aria-hidden="true"></i>
    </button>
  </svelte:fragment>

  <svelte:fragment slot="toolbar">
    <FilterToolbar
      searchValue={searchTerm}
      searchPlaceholder={t('Search returns...')}
      filters={toolbarFilters}
      filterLabel={t('Filter')}
      resetLabel={t('Clear Filters')}
      on:searchChange={(event) => {
        searchTerm = event.detail;
        currentPage = 1;
      }}
      on:filterChange={handleFilterChange}
      on:reset={resetFilters} />
  </svelte:fragment>

  <svelte:fragment slot="stats">
    <div class="index-summary-grid">
      <SummaryCard label={t('Returns Count')} icon="bi-arrow-return-left" tone="cyan">
        {filteredReturns.length}
      </SummaryCard>
      <SummaryCard label={t('Sale Returns')} icon="bi-receipt" tone="green">
        {saleCount}
      </SummaryCard>
      <SummaryCard label={t('Purchase Returns')} icon="bi-bag-dash" tone="amber">
        {purchaseCount}
      </SummaryCard>
      <SummaryCard label={t('Total Returns Amount')} icon="bi-cash-stack" tone="purple">
        {formatAmountMap(totalReturnsAmount)}
      </SummaryCard>
    </div>
  </svelte:fragment>

  {#if loading}
    <div class="index-table-state">
      <EmptyState loading message={t('Loading...')} />
    </div>
  {:else if filteredReturns.length === 0}
    <div class="index-table-state">
      <EmptyState icon="bi-arrow-return-left" message={t('No returns found.')} />
    </div>
  {:else}
    <DataTable
      ariaLabel={t('Returns')}
      minWidth="900px"
      dense={true}
      striped={true}
      hover={false}
      stickyHeader={true}
      layout="fixed"
      scrollbar="thin">
      <svelte:fragment slot="head">
        <tr>
          <th class="col-start">#</th>
          <th class="cursor-pointer" on:click={() => setSort('created_at')}>
            {t('Date')}
            {#if sortColumn === 'created_at'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="col-start cursor-pointer" on:click={() => setSort('product_id')}>
            {t('Product')}
            {#if sortColumn === 'product_id'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th>{t('Type')}</th>
          <th class="cursor-pointer" on:click={() => setSort('unit_price')}>
            {t('Unit Price')}
            {#if sortColumn === 'unit_price'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('quantity')}>
            {t('Quantity')}
            {#if sortColumn === 'quantity'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('subtotal')}>
            {t('Total')}
            {#if sortColumn === 'subtotal'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th>{t('Actions')}</th>
        </tr>
      </svelte:fragment>

      {#each paginatedReturns as item, index (getReturnType(item) + '-' + item.id)}
        <tr>
          <td class="col-start cell-muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>
          <td>
            <StatusBadge tone="neutral" ghost ltr={true} stacked>
              {@html showDate(item.created_at)}
            </StatusBadge>
          </td>
          <td class="col-start">
            <StatusBadge tone="neutral" ghost>
              {getProductName(item.product_id)}
            </StatusBadge>
          </td>
          <td>
            <StatusBadge tone={item.sale_return_id ? 'info' : 'warning'}>
              {item.sale_return_id ? t('Sale Return') : t('Purchase Return')}
            </StatusBadge>
          </td>
          <td>
            <span class="amount-pill">
              <span dir="ltr">
                {Number(item.unit_price || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
              </span>
              {t(item.currency)}
            </span>
          </td>
          <td>
            <StatusBadge tone="neutral" ltr={true}>
              {Number(item.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
              {getUnitName(item.product_unit_id)}
            </StatusBadge>
          </td>
          <td>
            <span class="amount-pill amount-pill--total">
              <span dir="ltr">
                {Number(item.subtotal || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
              </span>
              {t(item.currency)}
            </span>
          </td>
          <td>
            <div class="visible-table-actions">
              <ActionButton
                variant="icon"
                tone="view"
                icon="bi-eye"
                title={`${t('View')} ${getDocumentId(item) ? `#${shortID(getDocumentId(item))}` : ''}`}
                disabled={!getDocumentId(item)}
                on:click={() => openDocument(item)} />
            </div>
          </td>
        </tr>
      {/each}
    </DataTable>
  {/if}

  <svelte:fragment slot="footer">
    <PaginationBar
      bind:currentPage
      {totalPages}
      {itemsPerPage}
      totalItems={filteredReturns.length}
      {getPageNumbers}
      ariaLabel={t('Returns pagination')}
      perPageLabel={t('Showing')}
      countLabel={t('Returns')}
      rowLabel={t('rows')}
      on:perPageChange={(event) => {
        itemsPerPage = Number(event.detail);
        currentPage = 1;
      }} />
  </svelte:fragment>
</IndexPageLayout>

<style>
  .cursor-pointer {
    cursor: pointer;
  }

  .cell-muted {
    color: #7b8ba1;
    font-weight: 650;
  }

  .amount-pill {
    display: inline-flex;
    align-items: baseline;
    gap: 0.3rem;
    min-height: 1.625rem;
    padding: 0.25rem 0.625rem;
    border: 1px solid #dbe4ee;
    border-radius: 999px;
    background: #f8fafc;
    color: #334155;
    font-weight: 750;
    white-space: nowrap;
  }

  .amount-pill--total {
    border-color: #a7f3d0;
    background: #ecfdf5;
    color: #0f766e;
    font-weight: 850;
  }

  .visible-table-actions {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    white-space: nowrap;
  }

  .visible-table-actions :global(.action-btn.icon),
  .visible-table-actions :global(.action-btn.icon:hover:not(:disabled)) {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }
</style>
