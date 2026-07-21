<script>
  import { onMount, onDestroy } from 'svelte';
  import { db, logActivity } from '../../db.js';
  import ProductModal from './ProductModal.svelte';
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  import { push } from 'svelte-spa-router';
  import OpenFoodAPIModal from './OpenFoodAPIModal.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import TableActions from '../../components/common/TableActions.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import { getCachedImage, cacheImage } from './imageCache.js';

  import { auth } from '../../auth/authStore';
  $: permissions = $auth.permissions;

  import { API_URL } from '../../config';

  let openFoodAPIModalRef;

  import { toast } from '../../ToastUI/toast.js';

  import { calculateAllStocks } from '../stocktransactions/calculateStock.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  $: enable_generics = $settings_all.find((s) => s.key === 'enable_generics')?.value == 1;
  $: enable_brands = $settings_all.find((s) => s.key === 'enable_brands')?.value == 1;
  $: enable_expiry_date = $settings_all.find((s) => s.key === 'enable_expiry_date')?.value == 1;
  $: enable_services = $settings_all.find((s) => s.key === 'enable_services')?.value == 1;

  let shiftPressed = false;
  let ctrlPressed = false;

  // get shift key status for sidebar toggle
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
  // --- State ---
  let products = [];
  let calculatingStock = false;
  let categories = [];
  let brands = [];
  let generics = [];
  let units = [];
  let currencies = [];
  let warehouses = [];
  let warehouse_products = [];
  let totalProfitMap = {};
  let loading = true;

  let goodModal;
  let serviceModal;

  // --- Table State ---
  let searchTerm = '';
  let filterCategory = 'all';
  let filterBrand = 'all';
  let filterCurrency = 'all';
  let filterGeneric = 'all';
  let filterStatus = 'active'; // 'all', 'active', 'inactive'
  let currentPage = 1;
  let itemsPerPage = 10;
  let sortColumn = 'created_at';
  let sortDirection = 'desc'; // 'asc' or 'desc'

  // --- Helper Functions ---
  function getStockTone(qty, alarm_quantity) {
    if (qty <= 0) return 'negative';
    if (qty < alarm_quantity) return 'warning';
    return 'positive';
  }

  function getExpiryTone(expiryDate) {
    if (!expiryDate) return 'neutral';

    const parsedDate = new Date(expiryDate);
    if (Number.isNaN(parsedDate.getTime())) return 'neutral';

    const now = new Date();
    const diffDays = Math.ceil((parsedDate - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'negative';
    if (diffDays <= 30) return 'warning';
    return 'info';
  }

  function formatQty(qty) {
    return qty.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }

  function getStockBadge(qty, unitName, alarm_quantity) {
    let cls = 'badge-success';
    if (qty <= 0) {
      cls = 'badge-danger';
    } else if (qty < alarm_quantity) {
      cls = 'badge-warning';
    }
    return `<span class="badge ${cls}"><span dir='ltr'>${qty.toLocaleString(undefined, {
      maximumFractionDigits: 3,
    })}</span> ${unitName}</span>`;
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

  // --- Data Loading ---

  let totalPurchaseCostMap = {};
  let totalSaleValueMap = {};
  let totalQuantityCount = 0;

  async function calculatePriceMap() {
    totalPurchaseCostMap = {};
    totalSaleValueMap = {};
    totalQuantityCount = 0;
    products.forEach((p) => {
      const buyPrice = parseFloat(p.buy_price) || 0;
      const sellPrice = parseFloat(p.sell_price) || 0;
      const qty = parseFloat(p.quantity) || 0;
      const buyCurrency = p.buy_currency;
      const sellCurrency = p.sell_currency;
      totalPurchaseCostMap[buyCurrency] = (totalPurchaseCostMap[buyCurrency] || 0) + buyPrice * qty;
      totalSaleValueMap[sellCurrency] = (totalSaleValueMap[sellCurrency] || 0) + sellPrice * qty;
      totalQuantityCount += qty;
      // check if qty is not integer and it is float, then round to 2 decimal places
      if (qty % 1 !== 0) {
        console.log(p.name, p.id, qty);
      }
    });
  }

  async function loadAll() {
    loading = true;
    try {
      products = await db.products.toArray();
      for (let product of products) {
        if (!product.product_status) {
          try {
            await db.products.update(product.id, { product_status: 'active' });
          } catch (e) {
            console.error('Error updating product status', product.id, e);
          }
        }
      }

      products = products.filter((p) => p.status !== 0); // filter out deleted products

      products = products.filter((p) => p.type !== 'service');
      categories = await db.product_categories.where('status').equals(1).toArray();
      brands = await db.product_brands.where('status').equals(1).toArray();
      generics = await db.product_generics.where('status').equals(1).toArray();
      units = await db.product_units.where('status').equals(1).toArray();
      currencies = await db.currencies.where('status').equals(1).toArray();
      warehouses = await db.warehouses.where('status').equals(1).toArray();
      warehouse_products = await db.warehouse_products.where('status').equals(1).toArray();

      // Build totalProfitMap by summing sale_items.profit per product
      try {
        totalProfitMap = {};
        const allSaleItems = await db.sale_items.where('status').equals(1).toArray();
        for (const si of allSaleItems) {
          const pid = si.product_id;
          const pval = Number(si.profit || 0);
          totalProfitMap[pid] = (totalProfitMap[pid] || 0) + pval;
        }
      } catch (err) {
        console.error('Failed to build totalProfitMap', err);
        totalProfitMap = {};
      }

      await calculateTotalBenefit();
      await calculateTotalPredictedBenefit();
      await calculatePriceMap();
      // Handle Thumbnails
      for (let product of products) {
        const img = await db.product_images.where('product_id').equals(product.id).last();
        if (img?.thumbnail && img?.thumbnail !== '' && typeof img.thumbnail === 'string') {
          if (img.thumbnail.startsWith('{')) {
            let dataJSON = JSON.parse(img?.thumbnail);
            product.thumbnailUrl =
              API_URL +
              `/api/sync/loadimage/${dataJSON?.table}/${dataJSON?.fieldName}/${dataJSON?.serveid}/${localStorage.getItem('token') || 'none'}`;
          } else {
            product.thumbnailUrl = img?.thumbnail;
          }
        } else {
          product.thumbnailUrl = '/img/no-image.png';
        }
      }
    } catch (e) {
      console.error('Error loading products:', e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    loadAll();
  });

  // --- Actions ---
  async function deleteProduct(id) {
    if (confirm(t('Are you sure you want to delete this product?'))) {
      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'delete',
        table_name: 'products',
        entity_id: id,
        old_values: JSON.stringify(products.find((p) => p.id === id)),
        new_values: null,
        description: `Deleted product #${id}`,
      });
      await db.products.update(id, { status: 0 });
      loadAll();
    }
  }

  function openNewProduct(type = 'product') {
    if (type === 'service') {
      serviceModal.openModal();
      return;
    }
    push('/dashboard/product-form/new');
  }

  function editExistingProduct(product) {
    if (product?.type === 'service') {
      serviceModal.editProduct(product);
    } else {
      push(`/dashboard/product-form/${product.id}`);
    }
  }

  function onProductSaved(e) {
    loadAll();
    console.log('Product saved event received:', e.detail);
    if (e.detail.save_type === 'again') {
      setTimeout(() => {
        openNewProduct(); // Open new product modal after saving to allow quick entry of multiple products
      }, 500);
    }
  }

  // --- Computed Data (Filter, Sort, Pagination) ---
  // Use a reactive statement to filter and sort the products list

  $: filteredProducts = (() => {
    let result = products;

    // 1. Filter Status
    if (filterStatus === 'active') {
      result = result.filter((p) => (p.product_status ? p.product_status === 'active' : true));
    } else if (filterStatus === 'archived') {
      result = result.filter((p) => p.product_status === 'archived');
    }

    // 2. Filter Category
    if (filterCategory !== 'all') {
      result = result.filter((p) => p.category_id === parseInt(filterCategory));
    }

    if (filterBrand !== 'all') {
      result = result.filter((p) => p.brand_id === parseInt(filterBrand));
    }

    if (filterCurrency !== 'all') {
      console.log('filterCurrency', filterCurrency);
      result = result.filter((p) => p.currency === filterCurrency);
    }
    if (filterGeneric !== 'all') {
      result = result.filter((p) => p.generic_id === parseInt(filterGeneric));
    }
    // 3. Search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (p) =>
          (p.id && String(p.id).includes(term)) ||
          (p.name && p.name.toLowerCase().includes(term)) ||
          (p.code && p.code.toLowerCase().includes(term)),
      );
    }

    // 4. Sort
    result = result.sort((a, b) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];

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

    return result;
  })();

  $: paginatedProducts = (() => {
    const perPage = Number(itemsPerPage);
    const start = (currentPage - 1) * perPage;
    const end = start + perPage;
    return filteredProducts.slice(start, end);
  })();

  $: totalPages = Math.ceil(filteredProducts.length / Number(itemsPerPage));

  // --- UI Helpers ---
  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function getCategoryName(id) {
    return categories.find((c) => c.id === id)?.name || '-';
  }

  function getBrandName(id) {
    return brands.find((b) => b.id === id)?.name || '-';
  }

  function getGenericName(id) {
    return generics.find((g) => g.id === id)?.name || '-';
  }

  function getUnitName(id) {
    return units.find((u) => u.id === id)?.name || '';
  }

  function getProductUnitParts(product) {
    try {
      return JSON.parse(product.benefit || '{}')?.unit_parts || [];
    } catch (e) {
      return [];
    }
  }

  let showUnitParts = false;

  function productStatusLabel(status) {
    if (status === 'active') return t('Active');
    if (status === 'archived') return t('Archived');
    return t(status);
  }

  $: productToolbarFilters = [
    {
      key: 'category',
      label: t('Category'),
      value: filterCategory,
      options: [{ value: 'all', label: t('All') }, ...categories.map((cat) => ({ value: cat.id, label: cat.name }))],
    },
    {
      key: 'status',
      label: t('Status'),
      value: filterStatus,
      options: [
        { value: 'all', label: t('All') },
        { value: 'active', label: t('Active') },
        { value: 'archived', label: t('Archived') },
      ],
    },
    {
      key: 'currency',
      label: t('Currency'),
      value: filterCurrency,
      visible: _translate_org_type == 'exchange',
      options: [
        { value: 'all', label: t('All') },
        ...currencies.map((cur) => ({ value: cur.code, label: t(cur.code) })),
      ],
    },
    {
      key: 'generic',
      label: t('Generic'),
      value: filterGeneric,
      visible: enable_generics,
      options: [
        { value: 'all', label: t('All') },
        ...generics.map((generic) => ({ value: generic.id, label: generic.name })),
      ],
    },
    {
      key: 'brand',
      label: t('Brand'),
      value: filterBrand,
      visible: enable_brands,
      options: [{ value: 'all', label: t('All') }, ...brands.map((brand) => ({ value: brand.id, label: brand.name }))],
    },
  ];

  // Reset pagination when filters change
  $: if (searchTerm || filterCategory || filterStatus) {
    currentPage = 1;
  }

  function handleToolbarFilterChange(e) {
    const { key, value } = e.detail;
    if (key === 'category') filterCategory = value;
    if (key === 'currency') filterCurrency = value;
    if (key === 'generic') filterGeneric = value;
    if (key === 'brand') filterBrand = value;
    if (key === 'status') filterStatus = value;
  }

  function resetFilters() {
    searchTerm = '';
    filterCategory = 'all';
    filterBrand = 'all';
    filterCurrency = 'all';
    filterGeneric = 'all';
    filterStatus = 'active';
    currentPage = 1;
  }

  function addInitialStockTransactionsForAllProducts() {
    if (
      !confirm(
        'This will create initial stock transactions for all products based on current warehouse_products quantities. Are you sure?',
      )
    )
      return;
    (async () => {
      const products = await db.products.toArray();
      const warehouses = await db.warehouses.toArray();
      for (const p of products) {
        if (p.initial_warehouse_id > 0) {
          const w = warehouses.find((w) => w.id === p.initial_warehouse_id);
          if (!w) continue;
          await db.stock_transactions.add({
            warehouse_id: w.id,
            product_id: p.id,
            product_unit_id: p.product_unit_id || 0,
            reference_id: p.id,
            reference_type: 'manual_adjustment',
            transaction_type: 'adjustment_in',
            quantity: p.initial_quantity || 0,
            unit_cost: parseFloat(p.buy_price) || 0,
            total_cost: parseFloat(p.buy_price) * parseFloat(p.initial_quantity || 0) || 0,
            currency: p.buy_currency,
            peer_price: parseFloat(p.sell_price) || 0,
            peer_currency: p.sell_currency,
            expiry_date: null, // You can add logic to calculate expiry date if needed
            heaviness: null, // You can add logic to calculate heaviness if needed
            date: new Date().toISOString(),
            description: `Initial stock for product #${p.id}`,
            status: 1,
          });
        }
      }
    })();
  }

  function formatValueObj(obj) {
    if (!obj) return '-';
    return Object.keys(obj)
      .map(
        (k) =>
          `${toNumber(obj[k]).toLocaleString(undefined, { maximumFractionDigits: 3, minimumFractionDigits: 2 })} ${t(k)}`,
      )
      .join('<br />');
  }

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = fromCurrency.exchangeRate || 1;
    const toRate = toCurrency.exchangeRate || 1;
    return (amount / toRate) * fromRate;
  }
  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function isWarehouseBalance(balance) {
    if (!balance || typeof balance !== 'object') return false;
    const keys = Object.keys(balance);
    if (!keys.length) return false;
    return keys.every((key) => /^\d+$/.test(String(key)));
  }

  function getProductQty(product, benefitData) {
    const qty = toNumber(product.quantity);
    if (qty > 0) return qty;

    const balance = benefitData?.balance;
    if (isWarehouseBalance(balance)) {
      return Object.values(balance).reduce((sum, value) => sum + toNumber(value), 0);
    }

    return qty;
  }

  function calculateBenefit(product) {
    let benefitData = null;
    try {
      benefitData = product.benefit ? JSON.parse(product.benefit) : null;
    } catch {
      benefitData = null;
    }

    const balance = benefitData?.balance || {};
    const qty = getProductQty(product, benefitData);
    const buyPrice = toNumber(product.buy_price);

    if (isWarehouseBalance(balance) || !Object.keys(balance).length) {
      const benefit = buyPrice * qty;
      product.calculated_benefit = benefit;
      return benefit;
    }

    let output = 0;
    const totalBuyPrice = buyPrice * qty;
    Object.entries(balance).forEach(([currency, amount]) => {
      let val = toNumber(amount);
      if (currency !== product.buy_currency) {
        val = toNumber(exchangeRate(val, currency, product.buy_currency));
      }
      output += val;
    });

    const benefit = totalBuyPrice + output;
    product.calculated_benefit = benefit;
    return benefit;
  }
  let totalBenefit = {};
  async function calculateTotalBenefit() {
    totalBenefit = {};
    products.forEach((p) => {
      if (p.product_status !== 'active') return;
      const benefit = toNumber(calculateBenefit(p));
      if (totalBenefit[p.buy_currency]) {
        totalBenefit[p.buy_currency] += benefit;
      } else {
        totalBenefit[p.buy_currency] = benefit;
      }
    });
    return totalBenefit;
  }
  async function calculatePredictedBenefit(product) {
    let benefitData = null;
    try {
      benefitData = product.benefit ? JSON.parse(product.benefit) : null;
    } catch {
      benefitData = null;
    }

    const balance = benefitData?.balance || {};
    const qty = getProductQty(product, benefitData);
    const sellPrice = toNumber(product.sell_price);

    if (isWarehouseBalance(balance) || !Object.keys(balance).length) {
      let sellValue = sellPrice * qty;
      if (product.sell_currency && product.buy_currency && product.sell_currency !== product.buy_currency) {
        sellValue = toNumber(exchangeRate(sellValue, product.sell_currency, product.buy_currency));
      }
      product.calculated_predicted_benefit = sellValue;
      return sellValue;
    }

    let output = 0;
    let totalSellPrice = sellPrice * qty;
    if (product.sell_currency !== product.buy_currency) {
      totalSellPrice = toNumber(exchangeRate(totalSellPrice, product.sell_currency, product.buy_currency));
    }

    Object.entries(balance).forEach(([currency, amount]) => {
      let val = toNumber(amount);
      if (currency !== product.buy_currency) {
        val = toNumber(exchangeRate(val, currency, product.buy_currency));
      }
      output += val;
    });

    const benefit = totalSellPrice + output;
    product.calculated_predicted_benefit = benefit;
    return benefit;
  }
  let totalPredictedBenefit = {};
  async function calculateTotalPredictedBenefit() {
    totalPredictedBenefit = {};
    for (const p of products) {
      if (p.product_status !== 'active') continue;
      const benefit = toNumber(await calculatePredictedBenefit(p));
      if (totalPredictedBenefit[p.buy_currency]) {
        totalPredictedBenefit[p.buy_currency] += benefit;
      } else {
        totalPredictedBenefit[p.buy_currency] = benefit;
      }
    }
    return totalPredictedBenefit;
  }

  function changeProductStatus(id, newStatus) {
    if (newStatus === 'archived') {
      const product = products.find((p) => p.id === id);
      if (Number(product.quantity || 0) > 0) {
        toast.error(
          t('Cannot archive product with stock'),
          t('Please reduce the stock to zero before archiving this product.'),
        );
        return;
      }
    }

    toast
      .confirm(t('Are you sure?'), t('Are you sure you want to change the status of this product!'))
      .then(async (result) => {
        if (result) {
          await db.products.update(id, { product_status: newStatus });
          await logActivity({
            user_id: parseInt(localStorage.getItem('user_id')) || 0,
            action: 'update',
            table_name: 'products',
            entity_id: id,
            old_values: JSON.stringify({ product_status: newStatus === 'active' ? 'archived' : 'active' }),
            new_values: JSON.stringify({ product_status: newStatus }),
            description: `Changed product #${id} status to ${newStatus}`,
          });
          loadAll();
        }
      });
  }
  let showProductStats = false;
</script>

{#if !permissions?.some((p) => p.code === 'Products' && p.view)}
  <h3 class="permission-denied">
    <i class="bi bi-exclamation-triangle"></i>
    {t('Permission denied')}
  </h3>
{:else}
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Products')}
    toolbarWidth="25rem"
    showStats={showProductStats}
    showExtra={(shiftPressed && ctrlPressed) || calculatingStock}
    showFooter={!loading && filteredProducts.length > 0}
    dense={true}
    contentClass="products-index-content"
    tablePadding={true}>
    <svelte:fragment slot="actions">
      {#if permissions?.some((p) => p.code === 'Products' && p.create)}
        <ActionButton
          class="new-product-button"
          icon="bi-plus-lg"
          label={t('New Product')}
          on:click={() => openNewProduct()} />
      {/if}

      <button
        type="button"
        class="index-settings-button"
        class:is-active={showProductStats}
        aria-label={t('Table settings')}
        aria-expanded={showProductStats}
        aria-controls="product-statistics-panel"
        title={t('Statistics')}
        on:click={() => {
          showProductStats = !showProductStats;
        }}>
        <i class="bi {showProductStats ? 'bi-x-lg' : ' bi-box-seam'}" aria-hidden="true"></i>
      </button>
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={searchTerm}
        searchPlaceholder={t('stock_transactions.search')}
        filters={productToolbarFilters}
        filterLabel={t('Filter')}
        resetLabel={t('Clear Filters')}
        showReset={true}
        on:searchChange={(e) => {
          searchTerm = e.detail;
          currentPage = 1;
        }}
        on:filterChange={handleToolbarFilterChange}
        on:reset={resetFilters} />
    </svelte:fragment>

    <svelte:fragment slot="stats">
      <div id="product-statistics-panel" class="index-summary-grid">
        <SummaryCard label={t('Total Purchase Rate')} icon="bi-bag-check" tone="cyan">
          {@html formatValueObj(totalPurchaseCostMap)}
        </SummaryCard>

        <SummaryCard label={t('Total Sale Rate')} icon="bi-shop" tone="green">
          {@html formatValueObj(totalSaleValueMap)}
        </SummaryCard>

        {#if permissions?.some((p) => p.code === 'Benefit' && p.view)}
          <SummaryCard label={t('Current Benefit')} icon="bi-graph-up-arrow" tone="amber">
            {@html formatValueObj(totalBenefit)}
          </SummaryCard>

          <SummaryCard label={t('Predicted Benefit')} icon="bi-stars" tone="purple">
            {@html formatValueObj(totalPredictedBenefit)}
          </SummaryCard>
        {/if}
      </div>
    </svelte:fragment>

    <svelte:fragment slot="extra">
      <ActionButton
        variant="secondary"
        icon="bi-calculator"
        label={t('Calculate stock')}
        loading={calculatingStock}
        disabled={calculatingStock}
        on:click={async () => {
          if (confirm(t('Are you sure you want to recalculate stock for all products? This may take a while.'))) {
            calculatingStock = true;

            try {
              await calculateAllStocks();
              await loadAll();
            } finally {
              calculatingStock = false;
            }
          }
        }} />
    </svelte:fragment>

        {#if loading}
          <div class="index-table-state">
            <EmptyState loading message={t('Loading...')} />
          </div>
        {:else if filteredProducts.length === 0}
          <div class="index-table-state">
            <EmptyState icon="bi-inbox" message={t('No products found.')} />
          </div>
        {:else}
          <DataTable
            ariaLabel={t('Products')}
            minWidth="900px"
            dense={true}
            striped={true}
            hover={false}
            stickyHeader={true}
            layout="fixed"
            scrollbar="thin">
            <svelte:fragment slot="head">
              <tr>
                <th class="col-start cursor-pointer" on:click={() => setSort('name')}>
                  <span class="sortable-heading">
                    {t('Product')}

                    {#if sortColumn === 'name'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                    {/if}
                  </span>
                </th>

                <th>{t('Category')}</th>

                <th class="cursor-pointer" on:click={() => setSort('quantity')}>
                  <span class="sortable-heading">
                    {t('Stock')}

                    {#if sortColumn === 'quantity'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                    {/if}
                  </span>
                </th>

                {#if _translate_org_type === 'exchange'}
                  <th class="cursor-pointer" on:click={() => setSort('currency')}>
                    <span class="sortable-heading">
                      {t('Currency')}

                      {#if sortColumn === 'currency'}
                        <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                      {/if}
                    </span>
                  </th>
                {/if}

                {#if enable_expiry_date}
                  <th>{t('Expiry Date')}</th>
                {/if}

                <th>{t('Purchase Price')}</th>
                <th>{t('Selling Price')}</th>
                <th>{t('Profit')}</th>

                {#if filterStatus === 'all' || filterStatus === 'archived'}
                  <th>{t('Status')}</th>
                {/if}

                <th>{t('Actions')}</th>
              </tr>
            </svelte:fragment>

            {#each paginatedProducts as product (product.id)}
              <tr class:service-row={product.type === 'service'}>
                <!-- Product -->
                <td class="product-column">
                  <div class="product-info">
                    <StatusBadge tone="neutral" ghost>
                      <button
                        type="button"
                        class="product-name-btn"
                        title={product.name}
                        on:click={() => push(`/dashboard/product/${product.id}`)}>
                        {product.name}
                      </button>
                    </StatusBadge>

                    
                  </div>
                </td>

                <!-- Category -->
                <td>
                  <StatusBadge tone="neutral" ghost>
                    {getCategoryName(product.category_id)}
                  </StatusBadge>
                </td>

                <!-- Quantity -->
                <td>
                  <button
                    type="button"
                    class="quantity-cell"
                    title={t('Show unit details')}
                    on:click={() => {
                      showUnitParts = !showUnitParts;
                    }}>
                    {#if showUnitParts}
                      <span class="unit-parts">
                        {#each getProductUnitParts(product) as part}
                          {#if part.quantity !== 0}
                            <StatusBadge tone={part.quantity > 0 ? 'positive' : 'negative'} ltr={true}>
                              {formatQty(Number(part.quantity))}
                              {part.unit_name}
                            </StatusBadge>
                          {/if}
                        {/each}
                      </span>
                    {:else}
                      <StatusBadge
                        tone={getStockTone(Number(product.quantity || 0), Number(product.alarm_quantity || 0))}
                        ltr={true}>
                        {formatQty(Number(product.quantity || 0))}
                        {getUnitName(product.product_unit_id)}
                      </StatusBadge>
                    {/if}
                  </button>
                </td>

                <!-- Currency -->
                {#if _translate_org_type === 'exchange'}
                  <td>
                    <StatusBadge tone="info">
                      {t(product.currency || '')}
                    </StatusBadge>
                  </td>
                {/if}

                <!-- Expiry date -->
                {#if enable_expiry_date}
                  <td>
                    <StatusBadge tone={getExpiryTone(product.expiry_date)} ltr={true} ghost>
                      {product.expiry_date || '–'}
                    </StatusBadge>
                  </td>
                {/if}

                <!-- Purchase price -->
                <td>
                  <StatusBadge tone="info" ltr={true}>
                    {Number(product.buy_price || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                    {t(product.buy_currency)}
                  </StatusBadge>
                </td>

                <!-- Selling price -->
                <td>
                  <StatusBadge tone="positive" ltr={true}>
                    {Number(product.sell_price || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                    {t(product.sell_currency)}
                  </StatusBadge>
                </td>

                <!-- Profit -->
                <td>
                  {#if totalProfitMap[product.id] !== undefined}
                    <StatusBadge tone={totalProfitMap[product.id] < 0 ? 'negative' : 'positive'} ltr={true}>
                      {Number(totalProfitMap[product.id] || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                        minimumFractionDigits: 2,
                      })}
                    </StatusBadge>
                  {:else}
                    <span class="muted-dash">–</span>
                  {/if}
                </td>

                <!-- Status -->
                {#if filterStatus === 'all' || filterStatus === 'archived'}
                  <td>
                    <div class="status-control">
                      <StatusBadge tone={product.product_status === 'active' ? 'positive' : 'negative'}>
                        {productStatusLabel(product.product_status)}
                      </StatusBadge>

                      <ActionButton
                        variant="icon"
                        tone="muted"
                        icon="bi-{product.product_status === 'active' ? 'archive' : 'box-arrow-in-up'}"
                        title={t('Change status')}
                        on:click={() =>
                          changeProductStatus(
                            product.id,
                            product.product_status === 'active' ? 'archived' : 'active',
                          )} />
                    </div>
                  </td>
                {/if}

                <!-- Actions -->
                <td>
                  <TableActions
                    actions={[
                      {
                        icon: 'bi-eye',
                        label: t('View'),
                        tone: 'view',
                        onClick: () => push(`/dashboard/product/${product.id}`),
                      },
                      ...(permissions?.some((p) => p.code === 'Products' && p.edit)
                        ? [
                            {
                              icon: 'bi-pencil',
                              label: t('Edit'),
                              tone: 'edit',
                              onClick: () => editExistingProduct(product),
                            },
                          ]
                        : []),
                    ]} />
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
        totalItems={filteredProducts.length}
        ariaLabel={t('Products pagination')}
        rowLabel={t('rows')}
        on:perPageChange={(e) => {
          itemsPerPage = e.detail;
          currentPage = 1;
        }}
        {getPageNumbers} />
    </svelte:fragment>
  </IndexPageLayout>
{/if}

<!-- =====================================================================
     Modals
     ===================================================================== -->
<ProductModal
  bind:this={goodModal}
  {categories}
  {units}
  {warehouses}
  type="product"
  defaultCurrency="AFN"
  {warehouse_products}
  on:saved={(e) => {
    onProductSaved(e);
  }} />

<ProductModal
  bind:this={serviceModal}
  {categories}
  {units}
  {warehouses}
  type="service"
  defaultCurrency="AFN"
  {warehouse_products}
  on:saved={onProductSaved} />

<OpenFoodAPIModal bind:this={openFoodAPIModalRef} on:productSelected={(e) => {}} />

<style>
  .permission-denied {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 1rem;
    color: #dc2626;
    font-size: 1rem;
  }

  .cursor-pointer {
    cursor: pointer;
  }

  .sortable-heading {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
  }

  .sort-icon {
    color: #0f6efd;
    font-size: 0.75rem;
  }

  .product-column {
    max-width: 16rem;
  }

  .product-info {
    display: grid;
    min-width: 0;
    gap: 0.125rem;
    text-align: start;
  }

  .product-name-btn {
    display: block;
    overflow: hidden;
    width: 100%;
    max-width: 100%;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: #172033;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.3;
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .product-name-btn:hover,
  .product-name-btn:focus-visible {
    color: #0f6efd;
  }

  .product-info small {
    display: block;
    overflow: hidden;
    max-width: 100%;
    color: #94a3b8;
    font-size: 0.71875rem;
    font-weight: 500;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quantity-cell {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .unit-parts {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .status-control {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
  }

  .muted-dash {
    color: #a8b4c2;
    font-weight: 800;
  }

</style>
