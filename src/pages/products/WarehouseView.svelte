<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, onDestroy } from 'svelte';

  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import { push } from 'svelte-spa-router';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { calculateAllStocks, calculateProductStock } from '../stocktransactions/calculateStock.js';

  // warehouses: "++id,name,location,description,status",

  let loading = true;
  let calculatingStock = false;
  let shiftPressed = false;
  let ctrlPressed = false;

  let warehouseProducts = [];
  let searchTerm = '';
  let filterStatus = 'active'; // 'all', 'active', 'inactive'
  let currentPage = 1;
  let itemsPerPage = 10;
  let sortColumn = 'updated_at';
  let sortDirection = 'desc'; // 'asc' or 'desc'

  let units = [];
  let warehouses = [];
  let products = [];
  let productCategories = [];

  function handleKeyDown(e) {
    if (e.key === 'Shift') shiftPressed = true;
    if (e.key === 'Control') ctrlPressed = true;
  }
  function handleKeyUp(e) {
    if (e.key === 'Shift') shiftPressed = false;
    if (e.key === 'Control') ctrlPressed = false;
  }

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  });

  export let selectedWarehouseId = null;

  async function loadWarehouses() {
    loading = true;
    try {
      warehouses = await db.warehouses.toArray();
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      loading = false;
    }
  }

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

  async function loadWarehouseProducts(warehouseId) {
    loading = true;
    try {
      warehouseProducts = await db.warehouse_products
        .where('warehouse_id')
        .equals(warehouseId)
        .and((wp) => wp.status !== 0)
        .toArray();
    } catch (err) {
      console.error('Failed to load warehouse products:', err);
    } finally {
      loading = false;
    }
  }

  async function loadUnits() {
    try {
      units = await db.product_units.toArray();
      console.log(units);
    } catch (err) {
      console.error('Failed to load units:', err);
    }
  }

  async function loadProducts() {
    try {
      products = await db.products.toArray();
    } catch (err) {
      console.error('Failed to load products:', err);
    }
  }

  async function loadProductCategories() {
    try {
      productCategories = await db.product_categories.toArray();
    } catch (err) {
      console.error('Failed to load product categories:', err);
    }
  }

  async function loadAll() {
    await loadUnits();
    await loadProducts();
    await loadProductCategories();
    await loadWarehouses();
    selectedWarehouseId && (await loadWarehouseProducts(Number(selectedWarehouseId)));
  }
  onMount(async () => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    if (window.mdb) {
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
    }
    await loadAll();
  });


  let totalPurchaseCostMap = {};
  let totalSaleValueMap = {};
  let totalQuantityCount = 0;

  async function calculatePriceMap() {
    if (!filteredProducts || !Array.isArray(filteredProducts)) return;

    totalPurchaseCostMap = {};
    totalSaleValueMap = {};
    totalQuantityCount = 0;

    filteredProducts.forEach((wp) => {
      const product = products.find((p) => p.id === wp.product_id);
      if (!product) return;

      const buyPrice = parseFloat(product.buy_price) || 0;
      const sellPrice = parseFloat(product.sell_price) || 0;
      const qty = parseFloat(wp.quantity) || 0;

      const buyCurrency = product.buy_currency?.trim() || '';
      const sellCurrency = product.sell_currency?.trim() || '';

      totalPurchaseCostMap[buyCurrency] = (totalPurchaseCostMap[buyCurrency] || 0) + buyPrice * qty;

      totalSaleValueMap[sellCurrency] = (totalSaleValueMap[sellCurrency] || 0) + sellPrice * qty;

      totalQuantityCount += qty;
    });
  }

  let productMap = {};
  let categoryMap = {};
  let unitMap = {};

  let lastWarehouseId;
  $: if (selectedWarehouseId && selectedWarehouseId !== lastWarehouseId) {
  lastWarehouseId = selectedWarehouseId;
  loadWarehouseProducts(Number(selectedWarehouseId));
}

  $: productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  $: categoryMap = Object.fromEntries(productCategories.map((c) => [c.id, c]));
  $: unitMap = Object.fromEntries(units.map((u) => [u.id, u]));

  $: filteredProducts = (() => {
    let result = warehouseProducts;

    result = result.filter((p) => p.quantity !== 0);

    // 1. Filter Status
    if (filterStatus === 'active') {
      result = result.filter((p) => p.status === 1);
    } else if (filterStatus === 'inactive') {
      result = result.filter((p) => p.status === 0);
    }

    // 3. Search
    if (searchTerm.trim()) {
  const term = searchTerm.toLowerCase();

  result = result.filter((wp) => {
    const product = productMap[wp.product_id];

    if (!product) return false;

    return (
      product.name?.toLowerCase().includes(term) ||
      product.code?.toLowerCase().includes(term)
    );
  });
}

    // 4. Sort
    result = result.sort((a, b) => {
        let valA;
        let valB;

        if (sortColumn === 'name') {
          valA = productMap[a.product_id]?.name || '';
          valB = productMap[b.product_id]?.name || '';
        } else {
          valA = a[sortColumn];
          valB = b[sortColumn];
        }

      // Handle null/undefined
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      // Specific handling for calculated fields
      // String comparison
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    calculatePriceMap();
    return result;
  })();

  $: paginatedProducts = (() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredProducts.slice(start, end);
  })();

  $: totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  // --- UI Helpers ---
  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  // Reset pagination when filters change
  $: if (searchTerm || filterStatus) {
    currentPage = 1;
  }

  function formatValueObj(obj) {
    if (!obj) return '-';
    return Object.keys(obj)
      .map((k) => `${obj[k].toLocaleString(undefined, { maximumFractionDigits: 3, minimumFractionDigits: 2 })} ${t(k)}`)
      .join('<br />');
  }
</script>

{#if selectedWarehouseId !== null}
 <button
            disabled={calculatingStock}
            class="btn btn-danger btn-sm mt-2 w-25 float-end {(shiftPressed && ctrlPressed) || calculatingStock ? '' : 'd-none'}"
            on:click={async () => {
              if (confirm(t('Are you sure you want to recalculate stock for all products? This may take a while.'))) {
                calculatingStock = true;
                await calculateAllStocks();
                calculatingStock = false;
                loadAll();
              }
            }}>
            {@html calculatingStock
              ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">Loading...</span>
</div>
`
              : `<i class="bi bi-plus-circle me-2"></i>` + t('Calculate All Products Stock')}
          </button>
<p class="h5 mt-2 mb-4">
            {t('Warehouse Products')}
            {selectedWarehouseId
              ? `(${warehouses.find((w) => w.id === Number(selectedWarehouseId))?.name || t('Unknown Warehouse')})`
              : ''}
          </p>

  <div class="mb-4 d-flex gap-3 flex-wrap">
    <div class="card">
      <div class="card-header py-2">
        <small><i class="bi bi-box-seam me-2 text-success"></i>{t('Total Products')}</small>
      </div>
      <div class="card-body p-2">
        <small class="text-center fw-bold d-block">
          {filteredProducts.length.toLocaleString()}
        </small>
      </div>
    </div>
    <div class="card">
      <div class="card-header py-2">
        <small><i class="bi bi-box me-2 text-primary"></i>{t('Total Purchase Rate')}</small>
      </div>
      <div class="card-body p-2">
        <small class=" text-center fw-bold d-block">
          {@html formatValueObj(totalPurchaseCostMap)}
        </small>
      </div>
    </div>
    <div class="card">
      <div class="card-header py-2">
        <small><i class="bi bi-shop me-2 text-success"></i>{t('Total Sale Rate')}</small>
      </div>
      <div class="card-body p-2">
        <small class="text-center fw-bold d-block">
          {@html formatValueObj(totalSaleValueMap)}
        </small>
      </div>
    </div>
  </div>

          <input
            type="text"
            id="product-search"
            class="form-control form-control-sm me-3 mb-2"
            placeholder={t('Search products...')}
            bind:value={searchTerm} />
  <div class="card shadow-sm rounded-lg border-0">
    <!-- Toolbar -->
    <div class="card-header bg-body-tertiary border-bottom p-3 d-none">
      <div class="row g-2 align-items-center">
        <!-- Search -->
        <!-- <div class="col-md-2">
            <input
              type="text"
              id="product-search"
              class="form-control form-control-sm me-3"
              placeholder={t('Search products...')}
              bind:value={searchTerm} />
          </div> -->
        <div class="col-md-10">
          
        </div>

        <div class="col-md-2">
          
        </div>

        <div class="col-md-2">
         
        </div>
      </div>
    </div>

    <!-- Table Body -->
    <div class="card-body p-0">
      {#if loading}
        <div class="text-center p-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">{t('Loading...')}</span>
          </div>
          <p class="mt-2 text-muted">{t('Loading...')}</p>
        </div>
      {:else if filteredProducts.length === 0}
        <div class="text-center p-5">
          <i class="bi bi-inbox fs-1 text-muted"></i>
          <p class="mt-2 text-muted">{t('No products found.')}</p>
        </div>
      {:else}
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th class="">{t('#')}</th>
                <!-- <th class="ps-4 cursor-pointer" on:click={() => setSort('id')}>
                    {t('ID')}
                    {#if sortColumn === 'id'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                    {/if}
                  </th> -->
                <th class="cursor-pointer" on:click={() => setSort('name')}>
                  {t('Product')}
                  {#if sortColumn === 'name'}
                    <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                  {/if}
                </th>
                <th class="">{t('Category')}</th>
                <th class=" cursor-pointer" on:click={() => setSort('quantity')}>
                  {t('Quantity')}
                  {#if sortColumn === 'quantity'}
                    <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                  {/if}
                </th>
                <th class="cursor-pointer" on:click={() => setSort('updated_at')}
                  >{t('Updated Date')}
                  {#if sortColumn === 'updated_at'}
                    <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                  {/if}
                </th>
                <!-- <th class=" pe-4">{t('Actions')}</th> -->
              </tr>
            </thead>
            <tbody>
              {#each paginatedProducts as wp, i}
                <tr
                  ><td>{i + 1 + (currentPage - 1) * itemsPerPage}</td>
                  <!-- <td>{wp.id}</td> -->
                  <td>
                    <button
                      class="btn btn-link text-primary fw-bold btn-sm px-1"
                      on:click={() => push(`/dashboard/product/${wp.product_id}`)}
                      >{productMap[wp.product_id]?.name || 'Unknown Product'}</button>
                  </td>
                  <td>{categoryMap[productMap[wp.product_id]?.category_id]?.name || 'Unknown Category'}</td>
                  <td
                    ><strong
                      >{Number(wp.quantity).toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 6,
                      })}{' '}
                      {unitMap[wp.product_unit_id]?.name || 'Unknown Unit'}</strong
                    ></td>
                  <td><span dir="ltr">{new Date(wp.updated_at).toLocaleString()}</span></td>
                  <!-- <td class=""></td> -->
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <!-- Pagination Footer -->
    {#if !loading && filteredProducts.length > 0}
      <div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3 overflow-x-auto">
        <div class="text-muted small">
          {t('Showing')}
          {(currentPage - 1) * itemsPerPage + 1}
          {t('to')}
          {Math.min(currentPage * itemsPerPage, filteredProducts.length)}
          {t('of')}
          {filteredProducts.length}
          {t('entries')}
        </div>
        <select class="form-select form-select-sm me-2 w-25" bind:value={itemsPerPage}>
            <option value={5}>5 {t('per page')}</option>
            <option value={10}>10 {t('per page')}</option>
            <option value={20}>20 {t('per page')}</option>
            <option value={50}>50 {t('per page')}</option>
            <option value={100}>100 {t('per page')}</option>
            <option value={250}>250 {t('per page')}</option>
          </select>
        <nav>
          <ul class="pagination pagination-circle pagination-sm mb-0">
            <li class="page-item" class:disabled={currentPage === 1}>
              <button class="page-link" on:click={() => (currentPage = 1)}>
                <i class="bi bi-chevron-double-{t('dir') === 'rtl' ? 'right' : 'left'}"></i>
              </button>
            </li>
            <li class="page-item" class:disabled={currentPage === 1}>
              <button class="page-link" on:click={() => (currentPage -= 1)}>
                <i class="bi bi-chevron-{t('dir') === 'rtl' ? 'right' : 'left'}"></i>
              </button>
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
              <button class="page-link" on:click={() => (currentPage += 1)}>
                <i class="bi bi-chevron-{t('dir') === 'rtl' ? 'left' : 'right'}"></i>
              </button>
            </li>
            <li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}>
              <button class="page-link" on:click={() => (currentPage = totalPages)}>
                <i class="bi bi-chevron-double-{t('dir') === 'rtl' ? 'left' : 'right'}"></i>
              </button>
            </li>
          </ul>
        </nav>
      </div>
    {/if}
  </div>
{:else}
  <div class="text-center text-muted p-4">
    <i class="bi bi-box-seam fs-1 mb-3"></i>
    <p class="h5">{t('Select a warehouse to view its products.')}</p>
  </div>
{/if}
