<script>
  import { db } from '../../db.js';
  import { onMount, tick } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { convertUnit, getMultiple } from '../stocktransactions/calculateStock.js';
  import { generatePDF, generatingPDF } from '../generatePDF.js';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';

  import { showDate, setDatePickers } from '../../calendar.js';

  import { t, lang, translate_org_type,shortID ,settings_all} from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let sale_items = [];
  let purchase_items = [];

  let sales = [];
  let purchases = [];

  let units = [];

  let productDropdownEl;
  let productDropdownOpen = false;
  let filterProduct = new Set();
  let selectedProduct = 'all';
  let showProductStats = true;


  function handleClickOutside(event) {
      if (
          productDropdownOpen &&
          productDropdownEl &&
          !productDropdownEl.contains(event.target)
      ) {
          productDropdownOpen = false;
      }
  }

  
  let currencies = [];


  let accounts = [];


  export let account_id = null;
  let warehouses = [];
  let saleId = null;
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
    currencies = await db.currencies.where({ status: 1 }).toArray();
    units = await db.product_units.where({ status: 1 }).toArray();

    accounts = await db.accounts.where({ status: 1 }).toArray();
    warehouses = await db.warehouses.where({ status: 1 }).toArray();
    // Order sales by invoice_date descending so newest appear first


    sale_items = await db.sale_items.where('status').equals(1).reverse().toArray();


    sales = await db.sales.orderBy('invoice_date').reverse().toArray();

    sales = sales.filter((s) => s.status == 1);


    purchase_items = await db.purchase_items.where('status').equals(1).reverse().toArray();


    
    purchases = await db.purchases.orderBy('bill_date').reverse().toArray();

    purchases = purchases.filter((s) => s.status == 1);


    loading = false;
  }

  onMount(async () => {
    await load();
    tick().then(() => setDatePickers(handleDateChange));

    document.addEventListener("click", handleClickOutside);

    return () => {
        document.removeEventListener("click", handleClickOutside);
    };
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

  let productsInvolved = {};

  // Reactive computed list
  $: filteredItems = (() => {



    let result = sale_items.filter((s) => {
      let sale = sales.find(sl=>sl.id==s.sale_id);
      if (!sale) return false;
      if (sale.account_id != account_id) {
        return false;
      }
      const invoiceDate = new Date(s.created_at);
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      // If both dates are same, show that day's sales
      if (from && to && from.getTime() === to.getTime()) {
        return invoiceDate.toDateString() === from.toDateString();
      }
      if (from && invoiceDate < from) return false;
      if (to && invoiceDate > to) return false;
      return true;
    });

    result = [...result,...purchase_items.filter((s) => {
      let purchase = purchases.find(sl=>sl.id==s.purchase_id);
      if (!purchase) return false;
      if (purchase.account_id != account_id) {
        return false;
      }
      const invoiceDate = new Date(s.created_at);
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      // If both dates are same, show that day's sales
      if (from && to && from.getTime() === to.getTime()) {
        return invoiceDate.toDateString() === from.toDateString();
      }
      if (from && invoiceDate < from) return false;
      if (to && invoiceDate > to) return false;
      return true;
    })];
    productsInvolved = {};
    result.forEach(r=>{
      productsInvolved[r.product_id] = productsInvolved[r.product_id] ? Number(productsInvolved[r.product_id])+1 : 1;
    });





    console.log("productsInvolved",productsInvolved);

    
    if (account_id) {
    //   result = result.filter((s) => s.account_id === Number(account_id));
    }

    if (filterStatus !== 'all') {
        if (filterStatus=='sale') {
            result = result.filter((s) => s.sale_id);
        } else if (filterStatus=='purchase') {
            result = result.filter((s) => s.purchase_id);
        }
    }


    if (filterProduct.size > 0) {
        result = result.filter((a) => filterProduct.has(a.product_id+""));
    } else {

    }


    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          (s.sale_id && String(s.sale_id).toLowerCase().includes(term)) ||
          (s.purchase_id && String(s.purchase_id).toLowerCase().includes(term)) ||
          (s.product_id && s.product_id.toLowerCase().includes(term)) ||
          (s.id && String(s.id).includes(term)),
      );
    }

    result = result.sort((a, b) => {
      if (sortColumn == 'subtotal') {
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

  $: paginatedItems = (() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredItems.slice(start, end);
  })();

  $: totalPages = Math.ceil(filteredItems.length / itemsPerPage);

  $: if (searchTerm || filterProduct || filterStatus) currentPage = 1;


  let totalItemsAmount = {};
  // consider currency if you have multi currency support
  $: totalItemsAmount = filteredItems.reduce((totals, s) => {
    if (!totals[s.currency]) totals[s.currency] = 0;
    totals[s.currency] += Number(s.subtotal);
    return totals;
  }, {});

    $: enable_services = $settings_all.find((s) => s.key === 'enable_services')?.value == 1;

  $: reportFilters = [
    {
      key: 'type', label: t('Type'), value: filterStatus,
      options: [
        { value: 'all', label: t('All Items') },
        { value: 'sale', label: t('Sale Items') },
        { value: 'purchase', label: t('Purchase Items') },
      ],
    },
    {
      key: 'product', label: enable_services ? t('Product or Service') : t('Product'), value: selectedProduct,
      options: [
        { value: 'all', label: t('All') },
        ...Object.keys(productsInvolved).map((productId) => ({
          value: String(productId), label: products.find((p) => String(p.id) === String(productId))?.name || productId,
        })),
      ],
    },
  ];

  function handleReportFilter(event) {
    const { key, value } = event.detail;
    if (key === 'type') filterStatus = value;
    if (key === 'product') {
      selectedProduct = value;
      filterProduct = value === 'all' ? new Set() : new Set([String(value)]);
    }
    currentPage = 1;
  }

  function resetReportFilters() {
    searchTerm = '';
    filterStatus = 'all';
    selectedProduct = 'all';
    filterProduct = new Set();
    fromDate = '';
    toDate = '';
    currentPage = 1;
  }

  function formatTotalAmount() {
    return Object.entries(totalItemsAmount)
      .map(([currency, amount]) => `${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${t(currency)}`)
      .join('<br />') || '0';
  }
</script>

{#if true}
<div class="products-report-page" dir={t('dir')}>
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Products Report')}
    toolbarWidth="25rem"
    showStats={showProductStats}
    showFooter={!loading && filteredItems.length > 0}
    dense={true}
    tablePadding={true}>
    <svelte:fragment slot="actions">
      <ActionButton
        variant="secondary"
        icon="bi-file-pdf-fill"
        label={t('PDF')}
        loading={generatingPDF}
        disabled={generatingPDF}
        on:click={() => generatePDF('sales', filteredItems, fromDate, toDate, filteredItems.length, totalItemsAmount)} />
      <button type="button" class="index-settings-button" class:is-active={showProductStats}
        aria-label={t('Statistics')} aria-expanded={showProductStats} title={t('Statistics')}
        on:click={() => (showProductStats = !showProductStats)}>
        <i class="bi {showProductStats ? 'bi-x-lg' : 'bi-gear'}"></i>
      </button>
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar searchValue={searchTerm} searchPlaceholder={t('Search products...')}
        filters={reportFilters} filterLabel={t('Filter')} resetLabel={t('Clear Filters')} showReset={true}
        on:searchChange={(event) => { searchTerm = event.detail; currentPage = 1; }}
        on:filterChange={handleReportFilter} on:reset={resetReportFilters} />
    </svelte:fragment>

    <svelte:fragment slot="stats">
      <div class="index-summary-grid product-report-summary">
        <SummaryCard label={enable_services ? t('Quantity') + t('-of-') + t('Products & Services') : t('Products Count')}
          icon="bi-box-seam" tone="green">{filteredItems.length.toLocaleString()}</SummaryCard>
        <SummaryCard label={enable_services ? t('Total') + t('-of-') + t('Products & Services') : t('Total Products Amount')}
          icon="bi-cash-stack" tone="cyan">{@html formatTotalAmount()}</SummaryCard>
      </div>
    </svelte:fragment>

    {#if loading}
      <div class="index-table-state"><EmptyState loading message={t('Loading...')} /></div>
    {:else if filteredItems.length === 0}
      <div class="index-table-state"><EmptyState icon="bi-inbox" message={t('No products found.')} /></div>
    {:else}
      <DataTable ariaLabel={t('Products Report')} minWidth="780px" dense striped hover={false} stickyHeader layout="fixed" scrollbar="thin">
        <svelte:fragment slot="head"><tr>
          <th class="cursor-pointer" on:click={() => setSort('created_at')}>{t('Date')}</th>
          <th>{t('Invoice #')}</th>
          <th class="cursor-pointer" on:click={() => setSort('product_id')}>{enable_services ? t('Product or Service') : t('Product')}</th>
          <th class="text-end cursor-pointer" on:click={() => setSort('unit_price')}>{t('Unit Price')}</th>
          <th class="text-end cursor-pointer" on:click={() => setSort('quantity')}>{t('Quantity')}</th>
          <th class="text-end cursor-pointer" on:click={() => setSort('subtotal')}>{t('Total')}</th>
        </tr></svelte:fragment>
        {#each paginatedItems as row}
          <tr>
            <td><span class="report-date">{@html showDate(row.created_at)}</span></td>
            <td>
              {#if row.sale_id}<button class="report-link" on:click={() => push(`/dashboard/sales/${row.sale_id}`)}>{sales.find((sale) => sale.id == row.sale_id)?.invoice_number || shortID(row.sale_id)}</button>{/if}
              {#if row.purchase_id}<button class="report-link" on:click={() => push(`/dashboard/purchases/${row.purchase_id}`)}>{purchases.find((purchase) => purchase.id == row.purchase_id)?.bill_number || shortID(row.purchase_id)}</button>{/if}
            </td>
            <td><button class="product-link" on:click={() => push(`/dashboard/product/${row.product_id}`)}>{products.find((product) => product.id == row.product_id)?.name || '—'}</button></td>
            <td class="text-end fw-bold" dir="ltr">{Number(row.unit_price).toLocaleString(undefined,{maximumFractionDigits:3})} {t(row.currency)}</td>
            <td class="text-end" dir="ltr">{Number(row.quantity).toLocaleString(undefined,{maximumFractionDigits:3})} {units.find((unit) => unit.id == row.product_unit_id)?.name || ''}</td>
            <td class="text-end fw-bold" dir="ltr">{Number(row.subtotal).toLocaleString(undefined,{maximumFractionDigits:3})} {t(row.currency)}</td>
          </tr>
        {/each}
      </DataTable>
    {/if}

    <svelte:fragment slot="footer">
      <PaginationBar bind:currentPage totalPages={totalPages} itemsPerPage={itemsPerPage} totalItems={filteredItems.length}
        ariaLabel={t('Products Report pagination')} rowLabel={t('rows')} perPageOptions={[5,10,20,50]}
        on:perPageChange={(event) => { itemsPerPage = Number(event.detail); currentPage = 1; }} {getPageNumbers} />
    </svelte:fragment>
  </IndexPageLayout>
</div>
{:else if loading}
  <div>Loading...</div>
{:else}
  <button
    on:click={() => {
      generatePDF('sales', filteredItems, fromDate, toDate,filteredItems.length,totalItemsAmount);
    }}
    disabled={generatingPDF}
    class="btn btn-outline-danger btn-sm me-2 px-2 float-end d-none">
    {#if generatingPDF}
      <div class="spinner-border spinner-border-sm" role="status">
        <span class="visually-hidden">${t('Generating...')}</span>
      </div>
    {:else}
      <i class="bi bi-file-pdf-fill"></i>
      {t('PDF')}
    {/if}
  </button>
  <div class="row">
    <div class="col-md-4">
      <div class="input-group input-group-sm persianDatePicker">
        <input type="date" class="form-control" data-bind="fromDate" bind:value={fromDate} />

        <span class="input-group-text persian-date-text"></span>
      </div>
    </div>

    <div class="col-md-4">
      <div class="input-group input-group-sm persianDatePicker">
        <input type="date" class="form-control" data-bind="toDate" bind:value={toDate} />

        <span class="input-group-text persian-date-text"></span>
      </div>
    </div>
  </div>
  <div class="m-3 d-flex gap-3 flex-wrap">
    <div class="card">
      <div class="card-header py-2">
        <small><i class="bi bi-box-seam me-2 text-success"></i>
          
              
                     {#if enable_services}
                {t('Quantity')}{t('-of-')}{t('Products & Services')}
            {:else}
                {t('Products Count')}
            {/if}
            </small>
      </div>
      <div class="card-body p-2">
        <small class="text-center fw-bold d-block">
          {filteredItems.length}

              {#if enable_services}
               {filteredItems.length < 2 ? t('Product or Service') : t('Products & Services')}
            {:else}
                 {filteredItems.length < 2 ? t('Product') : t('Products')}
            {/if}
         
        </small>
      </div>
    </div>
    <div class="card">
      <div class="card-header py-2">
        <small><i class="bi bi-box me-2 text-primary"></i>
          
          
              {#if enable_services}
               {t('Total')}{t('-of-')}{t('Products & Services')}
            {:else}
                 {t('Total Products Amount')}
            {/if}
          </small>
      </div>
      <div class="card-body p-2">
        <small class=" text-center fw-bold d-block">
          {@html Object.entries(totalItemsAmount)
            .map(
              ([currency, amount]) =>
                `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ${t(currency)}`,
            )
            .join(' <br> ')}
        </small>
      </div>
    </div>
  </div>
  <div class="card shadow-2">
    <!-- Toolbar -->
    <div class="card-header bg-body-tertiary border-bottom p-3">
      <div class="row g-3 align-items-center">
        <div class="col-md-4">
          <input type="text" class="form-control" placeholder={t('Search sales...')} bind:value={searchTerm} />
        </div>

        <div class="col-md-3 d-none">
          <select class="form-select" bind:value={filterStatus}>
            <option value="all">{t('All Items')}</option>
            <option value="sale">{t('Sale Items')}</option>
            <option value="purchase">{t('Purchase Items')}</option>
          </select>
        </div>

         <div class="col-md-4">
                <div class="dropdown d-inline"  bind:this={productDropdownEl}>
                    <button
                        class="btn btn-outline-secondary dropdown-toggle"
                        type="button"
                        on:click={() => (productDropdownOpen = !productDropdownOpen)}
                    >
                        {#if filterProduct.size === 0}
                            
                     {#if enable_services}
                {t('Product or Service')}
            {:else}
                {t('Products')}
            {/if}
                
                        {:else}
                            
                     {#if enable_services}
                {t('Product or Service')}
            {:else}
                {t('Products')}
            {/if}
                 ({filterProduct.size})
                        {/if}
                    </button>

                    {#if productDropdownOpen}
                        <div
                            class="dropdown-menu show p-2 shadow"
                            style="min-width:260px; max-height:320px; overflow:auto;"
                        >
                        
                            <!-- optional actions -->
                            <div class="d-flex justify-content-between mb-2">
                                <button
                                    class="btn btn-sm btn-link p-0"
                                    on:click={() => {
                                        filterProduct = new Set();
                                    }}
                                >
                                    {t("Clear")}
                                </button>
                                <button
                                    class="btn btn-sm btn-link p-0"
                                    on:click={() => {
                                        filterProduct = new Set(Object.keys(productsInvolved));
                                    }}
                                >
                                    {t("Select All")}
                                </button>
                            </div>

                            <div class="border-top pt-2">
                                
                                {#each Object.entries(productsInvolved) as [key, value]}
                                    <div class="form-check">
                                        <input
                                            class="form-check-input"
                                            type="checkbox"
                                            id={"type-filter-" + key}
                                            checked={filterProduct.has(key)}
                                            on:change={(e) => {
                                                if (e.target.checked) {
                                                    filterProduct.add(key);
                                                } else {
                                                    filterProduct.delete(key);
                                                }
                                                filterProduct = new Set(
                                                    filterProduct,
                                                );
                                            }}
                                        />
                                        <label
                                            class="form-check-label"
                                            for={"type-filter-" + key}
                                        >
                                            {products.find(p=>p.id==key)?.name} ({value})
                                        </label>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>
            </div>

        <div class="col-md-4 text-end">
          <select class="form-select form-select-sm d-inline-block w-auto" bind:value={itemsPerPage}>
            <option value={5}>5 {t('per page')}</option>
            <option value={10}>10 {t('per page')}</option>
            <option value={20}>20 {t('per page')}</option>
            <option value={50}>50 {t('per page')}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card-body p-0">
      <div class="table-responsive">
        <table class="table table-hover table-sm align-middle">
          <thead class="table-light">
            <tr>
              <th class="ps-4 cursor-pointer" on:click={() => setSort('id')}>
                {t('ID')}
                {#if sortColumn === 'id'}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}
              </th>
              <th class="text-center cursor-pointer" on:click={() => setSort('created_at')}
                >{t('Date')}{#if sortColumn === 'created_at'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>

              <th class="text-center cursor-pointer"
                >{t('Invoice #')}</th>


              <th class="cursor-pointer" on:click={() => setSort('product_id')}
                >
                
                     {#if enable_services}
                {t('Product or Service')}
            {:else}
                {t('Product')}
            {/if}
                
                {#if sortColumn === 'product_id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>

              <th class="text-center cursor-pointer" on:click={() => setSort('unit_price')}
                >{t('Unit Price')}{#if sortColumn === 'unit_price'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>


              <th class="text-center cursor-pointer" on:click={() => setSort('quantity')}
                >{t('Quantity')}{#if sortColumn === 'quantity'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>


              <th class="text-center cursor-pointer" on:click={() => setSort('subtotal')}
                >{t('Total')}{#if sortColumn === 'subtotal'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>

              <!-- <th class="text-center">{t('Status')}</th> -->
              <!-- <th width="150" class="text-center">{t('Actions')}</th> -->
            </tr>
          </thead>
          <tbody>
            {#each paginatedItems as r}
              <tr>
                <td class="ps-4 text-muted small">{shortID(r.id)}</td>
                <td class="text-center">{@html showDate(r.created_at)}</td>
                <td class="text-center">
                  {#if r.sale_id}
                      <span class="badge badge-primary cursor-pointer" on:click={push(`/dashboard/sales/${r.sale_id}`)} >
                        {sales.find(s=>s.id==r.sale_id)?.invoice_number}
                      </span>
                  {/if}
                  {#if r.purchase_id}
                      <span class="badge badge-primary cursor-pointer" on:click={push(`/dashboard/purchases/${r.purchase_id}`)}  >
                        {purchases.find(s=>s.id==r.purchase_id)?.bill_number}
                      </span>
                  {/if}
                </td>
                <td class="">
                    <button
                        class="btn btn-link text-primary fw-bold btn-sm px-1"
                        on:click={() => push(`/dashboard/product/${r.product_id}`)}>{products.find(p=>p.id==r.product_id)?.name}</button>
                  
                  
                  </td>
                 

                <td class="text-center fw-bold"
                  >{Number(r.unit_price).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}{' '}
                  {t(r.currency)}</td>
                   

                <td class="text-center fw-bold"
                  >{Number(r.quantity).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}{' '}
                  {units.find(u=>u.id==r.product_unit_id)?.name||""}</td>

                <td class="text-center fw-bold"
                  >{Number(r.subtotal).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}{' '}
                  {t(r.currency)}</td>

              

                <!-- <td class="text-center"
                  ><span class="badge badge-{r.return_status === 'confirmed' ? 'success' : 'warning'}"
                    >{t(r.return_status)}</span
                  ></td> -->

               
                <!-- <td class="text-center">
                  <button
                    class="btn btn-sm btn-outline-primary me-1"
                    on:click={() => push(`/dashboard/sales/${r.id}`)}
                    title="View"><i class="bi bi-eye"></i></button>
                  {#if r.invoice_status === 'draft'}
                    <button class="btn btn-sm btn-warning" on:click={() => push(`/dashboard/sale-form/` + r.id)}
                      >{t('Edit')}</button>
                  {/if}
                </td> -->
              </tr>
            {/each}
            {#if filteredItems.length === 0}
              <tr><td colspan="12" class="text-center text-muted p-4">{t('No sales found.')}</td></tr>
            {/if}
          </tbody>
        </table>
      </div>
    </div>

    {#if !loading && filteredItems.length > 0}
      <div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3 overflow-x-auto">
        <div class="text-muted small">
          {t('Showing')}
          {(currentPage - 1) * itemsPerPage + 1}
          {t('to')}
          {Math.min(currentPage * itemsPerPage, filteredItems.length)}
          {t('of')}
          {filteredItems.length}
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
  </div>
{/if}

<style>
  .products-report-page{display:flex;flex:1 1 auto;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden}
  .products-report-page :global(.index-page){flex:1 1 auto}
  .products-report-page :global(.index-statistics .product-report-summary){
    width:100%;
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
  .report-link,.product-link{border:0;background:transparent;padding:0;color:#0f6efd;font:inherit;font-weight:700;cursor:pointer}
  .report-link{padding:.2rem .45rem;border-radius:999px;background:#eef4ff;font-size:.72rem}
  .report-date{display:flex;flex-direction:column;align-items:flex-start;gap:.12rem;line-height:1.2;white-space:nowrap}
  .report-date :global(br){display:none}
  .report-date :global(small){display:block;margin:0}
  [dir='rtl'] .report-date{align-items:flex-end}
  .cursor-pointer{cursor:pointer}
  @media(max-width:650px){
    .products-report-page :global(.index-statistics .product-report-summary){grid-template-columns:1fr}
  }

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
