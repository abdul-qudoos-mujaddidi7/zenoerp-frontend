<script>
  import { onMount,tick } from 'svelte';
  import { db, logActivity } from '../db.js';
  import { convertUnit } from './stocktransactions/calculateStock.js';
  import { t, lang, translate_org_type,shortID,settings_all } from '../i18n/i18n';
  import ProductTransactionHistory from './products/ProductTransactionHistory.svelte';
  import DataTable from '../components/common/DataTable.svelte';
  import StatusBadge from '../components/common/StatusBadge.svelte';
  import EmptyState from '../components/common/EmptyState.svelte';
  import PaginationBar from '../components/common/PaginationBar.svelte';
  import FilterToolbar from '../components/common/FilterToolbar.svelte';
  import SummaryCard from '../components/common/SummaryCard.svelte';
  import ActionButton from '../components/common/ActionButton.svelte';
  import TableActions from '../components/common/TableActions.svelte';
  import IndexPageLayout from '../lib/components/index/IndexPageLayout.svelte';
  import {push} from 'svelte-spa-router';
  import { getCachedImage, cacheImage } from './products/imageCache.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  import { generatePDF } from './generatePDF.js';

  import { showDate, setDatePickers } from '../calendar.js';
  let generatingPDF = false;

  import { calculateProductStock } from './stocktransactions/calculateStock.js';

  export let id;
  export let page = 'overview';

  let activeTab = page || 'overview';
  $: if (page && page !== activeTab) {
    activeTab = page;
    if (page === 'report') {
      setTimeout(() => setDatePickers(handleDateChange), 200);
    }
  }

  function setActiveTab(tabId) {
    activeTab = tabId;
    push(`/dashboard/product/${id}/${tabId}`);
    if (tabId === 'report') {
      setTimeout(() => setDatePickers(handleDateChange), 200);
    }
  }

  function goEdit() {
    if (product?.id) push(`/dashboard/product-form/${product.id}`);
  }

  async function getProductByRouteId(routeId) {
    if (routeId == null || routeId === '') return null;
    const routeKey = String(routeId).trim();
    const products = await db.products.toArray();
    return products.find((p) => String(p.id).trim() === routeKey && p.status === 1) || null;
  }

  
  import { auth } from '../auth/authStore';
  $: permissions = $auth.permissions;


  function handleDateChange(inputName, value) {
    if (inputName === 'fromDate') fromDate = value;
    else if (inputName === 'toDate') toDate = value;
  }

  $: enable_batch = $settings_all.find((s) => s.key === 'enable_batch')?.value == 1;
  $: enable_manufacturing_date = $settings_all.find((s) => s.key === 'enable_manufacturing_date')?.value == 1;
  $: enable_expiry_date = $settings_all.find((s) => s.key === 'enable_expiry_date')?.value == 1;
  $: enable_generics = $settings_all.find((s) => s.key === 'enable_generics')?.value == 1;
  $: enable_brands = $settings_all.find((s) => s.key === 'enable_brands')?.value == 1;

  import { API_URL } from "../config";
  let myThumbnailUrl = null;
  let myImageUrl = null;
  let units = [];
  let brands = [];
  let generics = [];
  let warehouses = [];
  let warehouse_products = [];
  let product = null;
  let loading = true;
  let category = null;
  let unit = null;
  let brand = null;
  let generic = null;
  let stockTransactions = [];
  let fromDate = "";
  let toDate = "";
  let currencies = [];

  let editTransactionModal;
  let searchTerm = '';
  let filterStatus = 'all';
  let filterType = 'all';
  let currentPage = 1;
  let itemsPerPage = 10;
  let warehouseCurrentPage = 1;
  let warehouseItemsPerPage = 10;
  let sortColumn = 'updated_at';
  let sortDirection = 'desc';
  let showReportStats = false;

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
  let availableTypes = {};
  let fromDateInput = null;
  let toDateInput = null;
  $: filteredTransactions = (() => {
    let result = stockTransactions.slice();
    result = result.filter((s) => {
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
    if (filterStatus !== 'all') {
      result = result.filter((t) => t.status === filterStatus);
    }
    availableTypes = {};
    result.forEach(t=>{
      availableTypes[t.transaction_type] = availableTypes[t.transaction_type]?Number(availableTypes[t.transaction_type])+1:1;
    });
    if (filterType !== 'all') {
      result = result.filter((t) => t.transaction_type === filterType);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (t) =>
          (t.reference_number && String(t.reference_number).toLowerCase().includes(term)) ||
          (t.description && t.description.toLowerCase().includes(term)) ||
          (t.id && String(t.id).includes(term)),
      );
    }

    result = result.sort((a, b) => {
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

  $: reportToolbarFilters = [
    {
      key: 'type',
      label: t('Type'),
      value: filterType,
      icon: 'bi-arrow-left-right',
      options: [
        { value: 'all', label: t('All Types') },
        ...Object.entries(availableTypes).map(([type, count]) => ({
          value: type,
          label: `${t(type)} (${count})`,
        })),
      ],
    },
    { key: 'fromDate', label: t('From Date'), value: fromDate, icon: 'bi-calendar3', type: 'date' },
    { key: 'toDate', label: t('To Date'), value: toDate, icon: 'bi-calendar3', type: 'date' },
  ];

  function handleReportToolbarFilter(event) {
    const { key, value } = event.detail;
    if (key === 'type') filterType = value;
    if (key === 'fromDate') fromDate = value;
    if (key === 'toDate') toDate = value;
    currentPage = 1;
  }

  function resetReportFilters() {
    searchTerm = '';
    filterStatus = 'all';
    filterType = 'all';
    fromDate = '';
    toDate = '';
    currentPage = 1;
  }

  $: paginatedTransactions = (() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredTransactions.slice(start, end);
  })();

  $: totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  $: if (currentPage > (totalPages || 1)) currentPage = totalPages || 1;

  $: warehouseTotalPages = Math.ceil(warehouse_products.length / warehouseItemsPerPage) || 1;
  $: paginatedWarehouseProducts = warehouse_products.slice(
    (warehouseCurrentPage - 1) * warehouseItemsPerPage,
    warehouseCurrentPage * warehouseItemsPerPage,
  );
  $: if (warehouseCurrentPage > warehouseTotalPages) warehouseCurrentPage = warehouseTotalPages;

  $: if (searchTerm || filterStatus || filterType) currentPage = 1;
  let outQty = 0;
  let inQty = 0;
  let qtyBalance = 0;
  let balance = {};

  function getAccountName(acc) {
    if (t('Lang') === 'en') return acc.name || '';
    if (t('Lang') === 'fa') return acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') return acc.name_ps || acc.name || '';
    return acc.name || '';
  }

  async function loadStockTransactions() {
    product = product || (await getProductByRouteId(id));
    if (!product) {
      product = await db.products.where({ id: Number(id), status: 1 }).first();
    }
    if (!product) return;
    let sales = await db.sales.where({ status: 1 }).toArray();
    let purchases = await db.purchases.where({ status: 1 }).toArray();
    let accounts = await db.accounts.where({ status: 1 }).toArray();

    stockTransactions = await db.stock_transactions
      .where({ product_id: Number(product.id), status: 1 })
      .reverse()
      .toArray();

    stockTransactions = stockTransactions.map(t => {
      let sale = sales.find(s => s.id === t.reference_id && t.reference_type === 'sale');
      let purchase = purchases.find(p => p.id === t.reference_id && t.reference_type === 'purchase');
      if (sale) {
        t.reference_number = sale.invoice_number;
        t.account_name = getAccountName(accounts.find(a => a.id === sale.account_id) || '');
      } else if (purchase) {
        t.reference_number = purchase.bill_number;
        t.account_name = getAccountName(accounts.find(a => a.id === purchase.account_id) || '');
      }
      return {
        ...t
      }
    });

    // Calculate balance
    stockTransactions = stockTransactions.reverse(); // Start from oldest to newest
    qtyBalance = 0;
    balance = {};
    outQty = 0;
    inQty = 0;
    let newTransactions = [];

    for (const t of stockTransactions) {
      let qty = await convertUnit(Number(t.quantity), Number(t.product_unit_id), Number(product.product_unit_id));

      if (
        t.transaction_type === 'purchase' ||
        t.transaction_type === 'sale_return' ||
        t.transaction_type === 'adjustment_in' ||
        t.transaction_type === 'transfer_in' ||
        t.transaction_type === 'production_out'
      ) {
        qtyBalance += qty;
        inQty += qty;
        balance[t.currency] = (balance[t.currency] || 0) - Number(t.total_cost);
      } else {
        qtyBalance -= qty;
        outQty -= qty;
        if (t.transaction_type !== 'waste') {
          balance[t.currency] = (balance[t.currency] || 0) + Number(t.total_cost);
        }
      }

      newTransactions.push({
        ...t,
        convertedQuantity: qty,
        qtyBalance,
        inQty,
        outQty,
        balance: { ...balance },
      });
    }

    stockTransactions = newTransactions.reverse();
  }
  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = fromCurrency.exchangeRate || 1;
    const toRate = toCurrency.exchangeRate || 1;
    return (amount / toRate) * fromRate;
    console.log({
      amount,
      fromCurrencyCode,
      toCurrencyCode,
      fromRate,
      toRate,
      converted: (amount / toRate) * fromRate,
    });
  }
  function formatBalance(balance) {
    return Object.entries(balance)
      .map(
        ([currency, amount]) =>
          `<span dir="ltr">${amount.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 3,
          })}</span> ${t(currency)}`,
      )
      .join('<br >');
  }

  function unitLabel(unitId) {
    return units.find((u) => u.id === unitId)?.name || unitId || '';
  }

  function isIncomingTx(type) {
    return (
      type === 'purchase' ||
      type === 'sale_return' ||
      type === 'adjustment_in' ||
      type === 'transfer_in' ||
      type === 'production_out'
    );
  }

  function txTypeRoute(tx) {
    if (tx.transaction_type === 'sale') return `/dashboard/sales/${tx.reference_id}`;
    if (tx.transaction_type === 'purchase') return `/dashboard/purchases/${tx.reference_id}`;
    if (tx.transaction_type === 'transfer_in' || tx.transaction_type === 'transfer_out')
      return `/dashboard/stock-transfers/${tx.reference_id}`;
    if (tx.transaction_type === 'waste') return `/dashboard/wastes/${tx.reference_id}`;
    return null;
  }

  function getProductReportActions(tx) {
    const actions = [];
    const route = txTypeRoute(tx);

    if (route) {
      actions.push({
        icon: 'bi-eye',
        label: t('View'),
        tone: 'view',
        onClick: () => push(route),
      });
    }

    if (tx.reference_type === 'manual_adjustment' && tx.reference_id === product?.id) {
      actions.push({
        icon: 'bi-pencil',
        label: t('Edit'),
        tone: 'edit',
        onClick: () => editTheTransaction(tx),
      });
    }

    return actions;
  }

  async function exportProductReport() {
    generatingPDF = true;
    await generatePDF(
      'product_transactions',
      filteredTransactions,
      fromDate,
      toDate,
      filteredTransactions.length,
      balance,
      {
        product,
        qtyBalance,
        benefit: calculateBenefit(balance) || 0,
        predictedBenefit: calculatePredictedBenefit(balance) || 0,
      },
    );
    generatingPDF = false;
  }

  function calculateBenefit(balance) {
    if (!product) return null;
    let output = 0;
    const totalBuyPrice = product.buy_price * qtyBalance;
    Object.entries(balance).forEach(([currency, amount]) => {
      if (currency != product.buy_currency) {
        amount = exchangeRate(amount, currency, product.buy_currency);
      }
      output += amount;
    });
    return totalBuyPrice + output;
  }

  function calculatePredictedBenefit(balance) {
    if (!product) return null;
    let output = 0;
    let totalSellPrice = product.sell_price * qtyBalance;
    if (product.sell_currency !== product.buy_currency) {
      totalSellPrice = exchangeRate(totalSellPrice, product.sell_currency, product.buy_currency);
    }
    Object.entries(balance).forEach(([currency, amount]) => {
      if (currency != product.buy_currency) {
        amount = exchangeRate(amount, currency, product.buy_currency);
      }
      output += amount;
    });
    return totalSellPrice + output;
  }

  async function loadProduct() {
    currencies = await db.currencies.where({ status: 1 }).toArray();
    warehouses = await db.warehouses.where({ status: 1 }).toArray();
    warehouse_products = await db.warehouse_products
      .where({ status: 1, product_id: Number(product?.id || id) })
      .toArray();
    units = await db.product_units.where({ status: 1 }).toArray();
    brands = await db.product_brands.where({ status: 1 }).toArray();
    generics = await db.product_generics.where({ status: 1 }).toArray();
    product = await getProductByRouteId(id);
    if (!product) {
      product = await db.products.where({ id: Number(id), status: 1 }).first();
    }
    category = product ? await db.product_categories.where({ id: product.category_id, status: 1 }).first() : null;

    unit = product ? await db.product_units.where({ id: product.product_unit_id, status: 1 }).first() : null;
    brand = product ? await db.product_brands.where({ id: product.brand_id, status: 1 }).first() : null;
    generic = product ? await db.product_generics.where({ id: product.generic_id, status: 1 }).first() : null;
    const img = product ? await db.product_images.where({ product_id: product.id, status: 1 }).last() : null;

    if (img?.thumbnail && img?.thumbnail !== '' && typeof img.thumbnail === 'string') {
      if (img.thumbnail.startsWith("{")) {
        let dataJSON = JSON.parse(img?.thumbnail);
        product.thumbnailUrl = API_URL+`/api/sync/loadimage/${dataJSON?.table}/${dataJSON?.fieldName}/${dataJSON?.serveid}/${localStorage.getItem('token')||'none'}`;
      } else {
        product.thumbnailUrl = img?.thumbnail;
      }
    } else {
      product.thumbnailUrl = '/img/no-image.png';
    }

    if (img?.image && img?.image !== '' && typeof img.image === 'string') {
      if (img.image.startsWith("{")) {
        let dataJSON = JSON.parse(img?.image);
        product.imageUrl = API_URL+`/api/sync/loadimage/${dataJSON?.table}/${dataJSON?.fieldName}/${dataJSON?.serveid}/${localStorage.getItem('token')||'none'}`;
      } else {
        product.imageUrl = img?.image;
      }
    } else {
      product.imageUrl = '/img/no-image.png';
    }

    myThumbnailUrl = product?.thumbnailUrl || '/img/no-image.png';
    myImageUrl = product?.imageUrl || '/img/no-image.png';
    loading = false;
  }
  onMount(async () => {
    await loadProduct();
    await loadStockTransactions();
    if (window.mdb) {
      console.log(document.querySelectorAll('[data-mdb-input-init]'));
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
      const modalEl = document.getElementById('editTransactionModal');
      if (modalEl) {
        editTransactionModal = new window.mdb.Modal(modalEl);
      }
    }
    
    tick().then(() => setDatePickers(handleDateChange));
  });

  let editTransaction = {
    unit_cost: 0,
    quantity: 0,
    product_unit_id: null,
    warehouse_id: null,
    currency: 0,
    total_cost: 0,
    expiry_date: null,
  };

  function editTheTransaction(tx) {
    editTransaction = tx;

    editTransactionModal.show();
  }

  async function updateTransaction() {
    let oldTransaction = await db.stock_transactions.where({ id: editTransaction.id }).first();

    await db.stock_transactions.put(editTransaction).then(async () => {
      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'update',
        table_name: 'stock_transactions',
        entity_id: editTransaction.id,
        old_values: JSON.stringify(oldTransaction),
        new_values: JSON.stringify(editTransaction),
        description: `Updated initial product stock transaction ${editTransaction.id}`,
      });
      await calculateProductStock(editTransaction.product_id, 'single');
      await loadStockTransactions();
      editTransactionModal.hide();
    });
  }
</script>

{#if !permissions?.some((p) => p.code === 'Products' && p.view)}
  <h3 class="text-danger m-3"><i class="bi bi-exclamation-triangle me-2"></i>{t('No access allowed')}</h3>
{:else}
<div class="product-view-page">
  <div class="product-tab-panel">
    {#if activeTab === 'overview'}
    {#if loading}
      <div class="product-overview-card product-overview-card--loading">
        <div class="product-overview-card__image">
          <div class="product-skeleton product-skeleton--image"></div>
        </div>
        <div class="product-overview-card__body">
          <div class="product-skeleton product-skeleton--title"></div>
          <div class="product-price-grid">
            <div class="product-skeleton product-skeleton--metric"></div>
            <div class="product-skeleton product-skeleton--metric"></div>
            <div class="product-skeleton product-skeleton--metric"></div>
          </div>
          <div class="product-skeleton product-skeleton--line"></div>
          <div class="product-skeleton product-skeleton--line short"></div>
        </div>
      </div>
    {:else if product}
      <div class="product-overview-card">
        <div class="product-overview-card__image">
          <img src={myImageUrl} alt={product.name} class="product-overview-card__img" />
          <span class="product-overview-card__image-label">
            <i class="bi bi-image"></i>
            {category?.name || t('Uncategorized')}
          </span>
        </div>
        <div class="product-overview-card__body">
          <div class="product-overview-card__head">
            <div class="product-overview-card__heading">
              <span class="product-overview-card__section-icon" aria-hidden="true">
                <i class="bi bi-box-seam"></i>
              </span>
              <div>
                <span class="product-overview-card__eyebrow">{category?.name || t('Uncategorized')}</span>
                <h2 class="product-overview-card__name">{product.name}</h2>
              </div>
            </div>
            {#if permissions?.some((p) => p.code === 'Products' && p.edit)}
              <button
                type="button"
                class="product-overview-card__edit"
                aria-label={t('Edit Product')}
                title={t('Edit Product')}
                on:click={goEdit}>
                <i class="bi bi-pencil"></i>
              </button>
            {/if}
          </div>

          <div class="product-price-grid">
            <div
              class="product-price-card product-price-card--stock"
              class:product-price-card--warning={Number(qtyBalance) > 0 &&
                Number(product.alarm_quantity) > 0 &&
                Number(qtyBalance) <= Number(product.alarm_quantity)}
              class:product-price-card--danger={Number(qtyBalance) <= 0}>
              <span class="product-price-card__icon" aria-hidden="true">
                <i class="bi bi-boxes"></i>
              </span>
              <span class="product-price-card__content">
                <span class="product-price-card__label">{t('Quantity')}</span>
                <span class="product-price-card__value" dir="ltr">
                  {Number(qtyBalance).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  <small>{unit?.name || '-'}</small>
                </span>
              </span>
            </div>
            <div class="product-price-card product-price-card--buy">
              <span class="product-price-card__icon" aria-hidden="true">
                <i class="bi bi-arrow-down-left"></i>
              </span>
              <span class="product-price-card__content">
                <span class="product-price-card__label">{t('Buy Price')}</span>
                <span class="product-price-card__value" dir="ltr">
                  {Number(product.buy_price).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  <small>{t(product.buy_currency)}</small>
                </span>
              </span>
            </div>
            <div class="product-price-card product-price-card--sell">
              <span class="product-price-card__icon" aria-hidden="true">
                <i class="bi bi-arrow-up-right"></i>
              </span>
              <span class="product-price-card__content">
                <span class="product-price-card__label">{t('Sell Price')}</span>
                <span class="product-price-card__value" dir="ltr">
                  {Number(product.sell_price).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  <small>{t(product.sell_currency)}</small>
                </span>
              </span>
            </div>
          </div>

          <div class="product-details-grid">
            <section class="product-detail-section" aria-labelledby="product-basic-information">
              <h3 id="product-basic-information" class="product-detail-section__title">
                <i class="bi bi-info-circle"></i>
                {t('Basic Information')}
              </h3>
              <dl class="product-meta-list">
                <div class="product-meta-list__row">
                  <dt>{t('Code')}</dt>
                  <dd><bdi>{product.code || '-'}</bdi></dd>
                </div>
                <div class="product-meta-list__row">
                  <dt>{t('Category')}</dt>
                  <dd>{category?.name || t('Uncategorized')}</dd>
                </div>
                <div class="product-meta-list__row">
                  <dt>{t('Unit')}</dt>
                  <dd>{unit?.name || '-'}</dd>
                </div>
                {#if _translate_org_type == 'exchange'}
                  <div class="product-meta-list__row">
                    <dt>{t('Currency')}</dt>
                    <dd>{t(product?.currency || '-')}</dd>
                  </div>
                {/if}
                {#if enable_brands}
                  <div class="product-meta-list__row">
                    <dt>{t('Brand')}</dt>
                    <dd>{brand?.name || '-'}</dd>
                  </div>
                {/if}
                {#if enable_generics}
                  <div class="product-meta-list__row">
                    <dt>{t('Generic')}</dt>
                    <dd>{generic?.name || '-'}</dd>
                  </div>
                {/if}
              </dl>
            </section>

            <section class="product-detail-section" aria-labelledby="product-extra-information">
              <h3 id="product-extra-information" class="product-detail-section__title">
                <i class="bi bi-sliders"></i>
                {t('Extra Information')}
              </h3>
              <dl class="product-meta-list">
                {#if enable_batch}
                  <div class="product-meta-list__row">
                    <dt>{t('Batch')}</dt>
                    <dd>{product?.batch || '-'}</dd>
                  </div>
                {/if}
                {#if enable_manufacturing_date}
                  <div class="product-meta-list__row">
                    <dt>{t('Manufacturing Date')}</dt>
                    <dd>{product?.manufacturing_date || '-'}</dd>
                  </div>
                {/if}
                {#if enable_expiry_date}
                  <div class="product-meta-list__row">
                    <dt>{t('Expiry Date')}</dt>
                    <dd>{product?.expiry_date || '-'}</dd>
                  </div>
                {/if}
                <div class="product-meta-list__row">
                  <dt>{t('Alarm Quantity')}</dt>
                  <dd>{product.alarm_quantity} {unit?.name || '-'}</dd>
                </div>
                <div class="product-meta-list__row">
                  <dt>{t('Alarm Expiry Days')}</dt>
                  <dd>
                    {product.alarm_expiry_days}
                    {Number(product.alarm_expiry_days) < 2 ? t('Day') : t('Days')}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          {#if product.description}
            <section class="product-description-block" aria-labelledby="product-description-title">
              <h3 id="product-description-title" class="product-description-block__title">
                <i class="bi bi-text-paragraph"></i>
                {t('Description')}
              </h3>
              <p class="product-description-block__text">{product.description}</p>
            </section>
          {/if}
        </div>
      </div>
    {:else}
      <div class="product-empty-state">
        <i class="bi bi-exclamation-circle"></i>
        <h2>{t('Error')}</h2>
        <p>{t('Product not found.')}</p>
      </div>
    {/if}
    {:else if activeTab === 'buy'}
      {#if !product}
        <div class="product-empty-state product-empty-state--compact">
          <p>{t('Product not found.')}</p>
        </div>
      {:else}
        <ProductTransactionHistory productId={product?.id} kind="buy" />
      {/if}
    {:else if activeTab === 'sale'}
      {#if !product}
        <div class="product-empty-state product-empty-state--compact">
          <p>{t('Product not found.')}</p>
        </div>
      {:else}
        <ProductTransactionHistory productId={product?.id} kind="sale" />
      {/if}
    {:else if activeTab === 'warehouses'}
      {#if !product}
        <div class="product-empty-state product-empty-state--compact">
          <p>{t('Product not found.')}</p>
        </div>
      {:else}
        <IndexPageLayout
          dir={t('dir')}
          ariaLabel={t('Warehouse')}
          showFooter={warehouse_products.length > 0}
          dense={true}
          contained={false}
          tablePadding={false}>
          {#if warehouse_products.length === 0}
            <div class="index-table-state">
              <EmptyState icon="bi-building" message={t('No quantity found.')} />
            </div>
          {:else}
            <DataTable
              ariaLabel={t('Warehouse')}
              minWidth="560px"
              dense={true}
              striped={true}
              hover={false}
              stickyHeader={true}
              layout="fixed"
              scrollbar="thin">
              <svelte:fragment slot="head">
                <tr>
                  <th>{t('Warehouse')}</th>
                  <th>{t('Quantity')}</th>
                </tr>
              </svelte:fragment>

              {#each paginatedWarehouseProducts as wp (wp.id)}
                <tr>
                  <td>
                    <StatusBadge tone="neutral" ghost={true}>
                      {warehouses.find((warehouse) => warehouse.id === wp.warehouse_id)?.name || wp.warehouse_id}
                    </StatusBadge>
                  </td>
                  <td>
                    <StatusBadge tone={Number(wp.quantity) > 0 ? 'positive' : 'negative'} ltr={true}>
                      {Number(wp.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {units.find((u) => u.id === wp.product_unit_id)?.name || wp.product_unit_id || ''}
                    </StatusBadge>
                  </td>
                </tr>
              {/each}
            </DataTable>
          {/if}

          <svelte:fragment slot="footer">
            <PaginationBar
              bind:currentPage={warehouseCurrentPage}
              totalPages={warehouseTotalPages}
              itemsPerPage={warehouseItemsPerPage}
              totalItems={warehouse_products.length}
              {getPageNumbers}
              ariaLabel={t('Warehouse')}
              perPageOptions={[5, 10, 20, 50]}
              perPageSuffix={t('per page')}
              on:perPageChange={(event) => {
                warehouseItemsPerPage = Number(event.detail);
                warehouseCurrentPage = 1;
              }} />
          </svelte:fragment>
        </IndexPageLayout>
      {/if}
    {:else if activeTab === 'report'}
      <IndexPageLayout
        dir={t('dir')}
        ariaLabel={t('Report')}
        toolbarWidth="25rem"
        showStats={showReportStats}
        showFooter={!loading && filteredTransactions.length > 0}
        dense={true}
        contained={false}
        tablePadding={true}>
        <svelte:fragment slot="actions">
          <ActionButton
            variant="secondary"
            icon="bi-file-pdf-fill"
            label={t('PDF')}
            loading={generatingPDF}
            disabled={generatingPDF}
            on:click={exportProductReport} />

          <button
            type="button"
            class="index-settings-button"
            class:is-active={showReportStats}
            aria-label={t('Summary')}
            aria-expanded={showReportStats}
            aria-controls="product-report-statistics"
            title={t('Summary')}
            on:click={() => (showReportStats = !showReportStats)}>
            <i class="bi {showReportStats ? 'bi-x-lg' : 'bi-wallet2'}" aria-hidden="true"></i>
          </button>
        </svelte:fragment>

        <svelte:fragment slot="toolbar">
          <FilterToolbar
            searchValue={searchTerm}
            searchPlaceholder={t('Search transactions...')}
            filters={reportToolbarFilters}
            filterLabel={t('Filter')}
            resetLabel={t('Clear Filters')}
            showReset={true}
            on:searchChange={(event) => {
              searchTerm = event.detail;
              currentPage = 1;
            }}
            on:filterChange={handleReportToolbarFilter}
            on:reset={resetReportFilters} />
        </svelte:fragment>

        <svelte:fragment slot="stats">
          <div id="product-report-statistics" class="index-summary-grid product-report-summary">
            <SummaryCard label={t('Quantity Balance')} icon="bi-boxes" tone="cyan">
              <span dir="ltr">
                {qtyBalance.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                {unitLabel(product?.product_unit_id)}
              </span>
            </SummaryCard>

            <SummaryCard label={t('In')} icon="bi-arrow-down-left" tone="green">
              <span dir="ltr">
                {inQty.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                {unitLabel(product?.product_unit_id)}
              </span>
            </SummaryCard>

            <SummaryCard label={t('Out')} icon="bi-arrow-up-right" tone="amber">
              <span dir="ltr">
                {Math.abs(outQty).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                {unitLabel(product?.product_unit_id)}
              </span>
            </SummaryCard>

            <SummaryCard label={t('In-Out Balance')} icon="bi-wallet2" tone="purple">
              <span class="report-summary-balance">{@html formatBalance(balance) || t('No transactions yet.')}</span>
            </SummaryCard>

            {#if permissions?.some((permission) => permission.code === 'Benefit' && permission.view)}
              <SummaryCard label={t('Current Benefit')} icon="bi-cash-stack" tone="blue">
                <span dir="ltr">
                  {(calculateBenefit(balance) ?? 0).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 2,
                  })}
                  {t(product?.buy_currency)}
                </span>
              </SummaryCard>

              <SummaryCard label={t('Predicted Benefit')} icon="bi-graph-up-arrow" tone="green">
                <span dir="ltr">
                  {(calculatePredictedBenefit(balance) ?? 0).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 2,
                  })}
                  {t(product?.buy_currency)}
                </span>
              </SummaryCard>
            {/if}
          </div>
        </svelte:fragment>

        {#if loading}
          <div class="index-table-state">
            <EmptyState loading message={t('Loading...')} />
          </div>
        {:else if filteredTransactions.length === 0}
          <div class="index-table-state">
            <EmptyState icon="bi-journal-text" message={t('No transactions found.')} />
          </div>
        {:else}
          <DataTable
            ariaLabel={t('Report')}
            minWidth="1180px"
            dense={true}
            striped={true}
            hover={false}
            stickyHeader={true}
            layout="fixed"
            scrollbar="thin"
            clipCells={false}>
            <svelte:fragment slot="head">
              <tr>
                <th class="cursor-pointer" on:click={() => setSort('id')}>
                  <span class="sortable-heading">
                    {t('ID')}
                    {#if sortColumn === 'id'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                    {/if}
                  </span>
                </th>

                <th class="cursor-pointer" on:click={() => setSort('date')}>
                  <span class="sortable-heading">
                    {t('Date')}
                    {#if sortColumn === 'date'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                    {/if}
                  </span>
                </th>

                <th>{t('Warehouse')}</th>

                <th class="cursor-pointer" on:click={() => setSort('transaction_type')}>
                  <span class="sortable-heading">
                    {t('Type')}
                    {#if sortColumn === 'transaction_type'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                    {/if}
                  </span>
                </th>

                <th>{t('Name')}{t('-of-')}{t('Account')}</th>
                <th>{t('In')}</th>
                <th>{t('Out')}</th>
                <th>{t('Quantity Balance')}</th>
                <th>{t('In-Out Balance')}</th>
                <th>{t('Actions')}</th>
              </tr>
            </svelte:fragment>

            {#each paginatedTransactions as tx}
              <tr>
                <td>
                  <StatusBadge tone="neutral" ghost={true} ltr={true}>{shortID(tx.id)}</StatusBadge>
                </td>

                <td>
                  <StatusBadge tone="neutral" ghost={true} ltr={true}>
                    {new Date(tx.date || tx.created_at).toLocaleDateString()}
                  </StatusBadge>
                </td>

                <td>
                  <StatusBadge tone="neutral" ghost={true}>
                    {warehouses.find((warehouse) => warehouse.id === tx.warehouse_id)?.name || tx.warehouse_id}
                  </StatusBadge>
                </td>

                <td>
                  {#if txTypeRoute(tx)}
                    <button type="button" class="report-type-link" on:click={() => push(txTypeRoute(tx))}>
                      {t(tx.transaction_type)} {tx.reference_number || shortID(tx.reference_id)}
                    </button>
                  {:else}
                    <StatusBadge tone="info">{t(tx.transaction_type)}</StatusBadge>
                  {/if}
                </td>

                <td>
                  <StatusBadge tone="neutral" ghost={true}>
                    {tx.account_name ? t(tx.account_name) : '-'}
                  </StatusBadge>
                </td>

                <td>
                  {#if isIncomingTx(tx.transaction_type)}
                    <StatusBadge tone="positive" ltr={true}>
                      {Number(tx.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {unitLabel(tx.product_unit_id)}
                    </StatusBadge>
                  {:else}
                    <span class="report-muted-dash">-</span>
                  {/if}
                </td>

                <td>
                  {#if !isIncomingTx(tx.transaction_type)}
                    <StatusBadge tone="negative" ltr={true}>
                      {Number(tx.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {unitLabel(tx.product_unit_id)}
                    </StatusBadge>
                  {:else}
                    <span class="report-muted-dash">-</span>
                  {/if}
                </td>

                <td>
                  <StatusBadge tone={Number(tx.qtyBalance) >= 0 ? 'positive' : 'negative'} ltr={true}>
                    {Number(tx.qtyBalance).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    {unitLabel(product?.product_unit_id)}
                  </StatusBadge>
                </td>

                <td>
                  <div class="report-balance-cell">{@html formatBalance(tx.balance)}</div>
                </td>

                <td>
                  <TableActions actions={getProductReportActions(tx)} />
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
            totalItems={filteredTransactions.length}
            {getPageNumbers}
            ariaLabel={t('Report')}
            perPageOptions={[5, 10, 20, 50]}
            perPageSuffix={t('per page')}
            on:perPageChange={(event) => {
              itemsPerPage = Number(event.detail);
              currentPage = 1;
            }} />
        </svelte:fragment>
      </IndexPageLayout>
    {/if}
  </div>
</div>
<div
  class="modal fade"
  id="editTransactionModal"
  tabindex="-1"
  aria-labelledby="editTransactionModalLabel"
  aria-hidden="true">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="editTransactionModalLabel">
          {t('Edit')}
          {editTransaction?.id}
        </h5>
        <button type="button" class="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"
        ></button>
      </div>
      <div class="modal-body">
        <div class="row">
          <div class="col-md-12">
            <select class="form-select mb-3" bind:value={editTransaction.warehouse_id}>
              <option value="" disabled>{t('Select Warehouse')}</option>
              {#each warehouses as w}
                <option value={w.id}>{w.name}</option>
              {/each}
            </select>
          </div>
          <div class="col-md-4">
            <div class="input-group">
              <div class="form-outline mb-3" data-mdb-input-init>
                <input
                  type="number"
                  id="editQuantity"
                  class="form-control"
                  bind:value={editTransaction.quantity}
                  on:input={(e) => {
                    let value = e.target.value;
                    if (value === '') {
                      editTransaction.quantity = '';
                    } else {
                      editTransaction.quantity = Number(value);
                    }
                    editTransaction.total_cost = editTransaction.quantity * editTransaction.unit_cost;
                  }} />
                <label class="form-label" for="editQuantity">{t('Quantity')}</label>
              </div>
              <select class="form-select mb-3 w-50" bind:value={editTransaction.product_unit_id}>
                <option value="" disabled>{t('Select Product Unit')}</option>
                {#each units as u}
                  <option value={u.id}>{u.name}</option>
                {/each}
              </select>
            </div>
          </div>
          <div class="col-md-4">
            <div class="input-group">
              <div class="form-outline mb-3" data-mdb-input-init>
                <input
                  type="number"
                  id="editUnitCost"
                  class="form-control"
                  bind:value={editTransaction.unit_cost}
                  on:input={(e) => {
                    let value = e.target.value;
                    if (value === '') {
                      editTransaction.unit_cost = '';
                    } else {
                      editTransaction.unit_cost = Number(value);
                    }
                    editTransaction.total_cost = editTransaction.quantity * editTransaction.unit_cost;
                  }} />
                <label class="form-label" for="editUnitCost">{t('Unit Cost')}</label>
              </div>
              <select class="form-select mb-3 w-50" bind:value={editTransaction.currency}>
                <option value="" disabled>{t('Select Currency')}</option>
                {#each currencies as c}
                  <option value={c.code}>{t(c.code)}</option>
                {/each}
              </select>
            </div>
          </div>
          <div class="col-md-4">
            <div class="input-group">
              <div class="form-outline mb-3" data-mdb-input-init>
                <input
                  type="number"
                  id="editTotalCost"
                  class="form-control"
                  bind:value={editTransaction.total_cost}
                  on:input={(e) => {
                    let value = e.target.value;
                    if (value === '') {
                      editTransaction.total_cost = '';
                    } else {
                      editTransaction.total_cost = Number(value);
                    }
                    editTransaction.total_cost = editTransaction.quantity * editTransaction.unit_cost;
                  }} />
                <label class="form-label" for="editTotalCost">{t('Total Cost')}</label>
              </div>
              <select class="form-select mb-3 w-50" bind:value={editTransaction.currency}>
                <option value="" disabled>{t('Select Currency')}</option>
                {#each currencies as c}
                  <option value={c.code}>{t(c.code)}</option>
                {/each}
              </select>
            </div>
          </div>
          {#if enable_expiry_date}
            <div class="col-md-12 mb-4">
              <div class="input-group">
                <span class="input-group-text">{t('Expiry Date')}</span>
                <input type="date" class="form-control" bind:value={editTransaction.expiry_date} />
              </div>
            </div>
          {/if}
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-mdb-ripple-init data-mdb-dismiss="modal"
          ><i class="bi bi-x"></i> {t('Close')}</button>
        <button type="button" class="btn btn-primary" data-mdb-ripple-init on:click={updateTransaction}>
          <i class="bi bi-check"></i> {t('Save changes')}</button>
      </div>
    </div>
  </div>
</div>
{/if}

<style>
  .product-view-page {
    width: calc(100% + 1rem);
    margin: -0.5rem;
    min-height: 100%;
    padding: 1rem;
    background: #f7f9fc;
    color: #0f172a;
  }

  .product-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
    padding: 6px;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    background: #ffffff;
  }

  .product-tabs__btn {
    flex: 1 1 auto;
    min-width: 0;
    padding: 10px 14px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: #64748b;
    font-size: 0.88rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .product-tabs__btn:hover {
    background: #f8fafc;
    color: #0f172a;
  }

  .product-tabs__btn--active {
    background: #eff6ff;
    color: #0f6efd;
    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.15);
  }

  .product-tab-panel {
    min-height: 200px;
  }

  .product-tab-card {
    padding: 18px;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: #ffffff;
  }

  .product-tab-card--table {
    padding: 0;
    overflow: hidden;
  }

  .product-overview-card {
    display: grid;
    grid-template-columns: minmax(13rem, 17rem) minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid #dde5ef;
    border-radius: 8px;
    background: #ffffff;
  }

  .product-overview-card--loading {
    min-height: 28rem;
  }

  .product-overview-card__image {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    min-width: 0;
    padding: 1.4rem;
    border-inline-end: 1px solid #e3e9f1;
    background:
      linear-gradient(#eef2f7 1px, transparent 1px),
      linear-gradient(90deg, #eef2f7 1px, transparent 1px),
      #f8fafc;
    background-size: 20px 20px;
  }

  .product-overview-card__img {
    width: 100%;
    max-width: 14rem;
    max-height: 17rem;
    aspect-ratio: 1 / 1;
    object-fit: contain;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  }

  .product-overview-card__image-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    max-width: 100%;
    padding: 0.35rem 0.65rem;
    border: 1px solid #dce5f0;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.94);
    color: #52627a;
    font-size: 0.72rem;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .product-overview-card__image-label i {
    color: #0f6efd;
  }

  .product-overview-card__body {
    min-width: 0;
    padding: 1.25rem;
  }

  .product-overview-card__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.9rem;
  }

  .product-overview-card__heading {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
  }

  .product-overview-card__section-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 2.35rem;
    height: 2.35rem;
    border-radius: 7px;
    background: #eaf2ff;
    color: #0f6efd;
    font-size: 1rem;
  }

  .product-overview-card__eyebrow {
    display: block;
    margin-bottom: 0.1rem;
    color: #7b8ba5;
    font-size: 0.66rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .product-overview-card__name {
    margin: 0;
    color: #172033;
    font-size: 1.02rem;
    font-weight: 800;
    line-height: 1.3;
  }

  .product-overview-card__edit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 1px solid #cfe0f7;
    border-radius: 6px;
    background: #ffffff;
    color: #0f6efd;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .product-overview-card__edit:hover {
    border-color: #9ec5fe;
    background: #eef5ff;
  }

  .product-price-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .product-price-card {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
    min-height: 4.75rem;
    padding: 0.8rem;
    border: 1px solid #dce5f0;
    border-radius: 8px;
    background: #f8fafc;
  }

  .product-price-card--stock {
    border-color: #bfdbfe;
    background: #eff6ff;
  }

  .product-price-card--buy {
    border-color: #fed7aa;
    background: #fff7ed;
  }

  .product-price-card--sell {
    border-color: #bbf7d0;
    background: #ecfdf5;
  }

  .product-price-card--warning {
    border-color: #fde68a;
    background: #fffbeb;
  }

  .product-price-card--danger {
    border-color: #fecaca;
    background: #fef2f2;
  }

  .product-price-card__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 6px;
    background: #dbeafe;
    color: #0f6efd;
    font-size: 0.95rem;
  }

  .product-price-card--buy .product-price-card__icon {
    background: #ffedd5;
    color: #c2410c;
  }

  .product-price-card--sell .product-price-card__icon {
    background: #d1fae5;
    color: #047857;
  }

  .product-price-card--warning .product-price-card__icon {
    background: #fef3c7;
    color: #b45309;
  }

  .product-price-card--danger .product-price-card__icon {
    background: #fee2e2;
    color: #dc2626;
  }

  .product-price-card__content {
    display: block;
    min-width: 0;
  }

  .product-price-card__label {
    display: block;
    margin-bottom: 0.2rem;
    color: #64748b;
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .product-price-card__value {
    display: block;
    color: #0f172a;
    overflow: hidden;
    font-size: 0.94rem;
    font-weight: 800;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .product-price-card__value small {
    color: #64748b;
    font-size: 0.7rem;
    font-weight: 650;
  }

  .product-details-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: 1.15rem;
    border-top: 1px solid #e6ebf2;
  }

  .product-detail-section {
    min-width: 0;
    padding-top: 1rem;
  }

  .product-detail-section + .product-detail-section {
    padding-inline-start: 1.25rem;
    border-inline-start: 1px solid #e6ebf2;
  }

  .product-detail-section:first-child {
    padding-inline-end: 1.25rem;
  }

  .product-detail-section__title {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0 0 0.5rem;
    color: #344054;
    font-size: 0.78rem;
    font-weight: 800;
    line-height: 1.3;
  }

  .product-detail-section__title i {
    color: #0f6efd;
    font-size: 0.9rem;
  }

  .product-meta-list {
    margin: 0;
  }

  .product-meta-list__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    min-height: 2.25rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid #edf1f6;
  }

  .product-meta-list__row dt {
    margin: 0;
    color: #718096;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .product-meta-list__row dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
    color: #1e293b;
    font-size: 0.78rem;
    font-weight: 700;
    text-align: end;
  }

  .product-description-block {
    margin-top: 1rem;
    padding-top: 0.9rem;
    border-top: 1px solid #e6ebf2;
  }

  .product-description-block__title {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0 0 0.5rem;
    color: #344054;
    font-size: 0.76rem;
    font-weight: 800;
    line-height: 1.3;
  }

  .product-description-block__title i {
    color: #0f6efd;
  }

  .product-description-block__text {
    margin: 0;
    padding: 0.75rem 0.85rem;
    border-inline-start: 3px solid #93c5fd;
    background: #f7f9fc;
    color: #334155;
    font-size: 0.78rem;
    line-height: 1.65;
  }

  .product-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 48px 24px;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: #ffffff;
    text-align: center;
    color: #64748b;
  }

  .product-empty-state i {
    font-size: 2rem;
    color: #ef4444;
  }

  .product-empty-state h2 {
    margin: 0;
    font-size: 1.1rem;
    color: #0f172a;
  }

  .product-empty-state p {
    margin: 0;
  }

  .product-empty-state--compact {
    padding: 24px;
  }

  .product-skeleton {
    border-radius: 8px;
    background: linear-gradient(90deg, #eef2f7 25%, #f8fafc 50%, #eef2f7 75%);
    background-size: 200% 100%;
    animation: product-skeleton 1.2s ease-in-out infinite;
  }

  .product-skeleton--image {
    width: min(100%, 14rem);
    aspect-ratio: 1 / 1;
    border-radius: 8px;
  }

  .product-skeleton--title {
    width: min(55%, 15rem);
    height: 2.35rem;
    margin-bottom: 0.9rem;
  }

  .product-skeleton--metric {
    width: 100%;
    min-height: 4.75rem;
    margin-bottom: 1rem;
  }

  .product-skeleton--line {
    width: 100%;
    height: 0.85rem;
    margin-bottom: 0.65rem;
  }

  .product-skeleton--line.short {
    width: 70%;
  }

  @keyframes product-skeleton {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .product-tab-loading {
    min-height: 9rem;
  }

  .product-table-wrap {
    overflow: auto;
  }

  .product-table {
    width: 100%;
    border-collapse: collapse;
  }

  .product-table thead {
    background: #f8fafc;
  }

  .product-table th,
  .product-table td {
    padding: 12px 16px;
    border-bottom: 1px solid #eef2f7;
    text-align: start;
    font-size: 0.88rem;
    vertical-align: middle;
  }

  .product-table th {
    color: #64748b;
    font-weight: 700;
    white-space: nowrap;
  }

  .product-table tbody tr:hover {
    background: #fafcff;
  }

  .product-table__empty {
    padding: 32px 16px !important;
    text-align: center !important;
    color: #94a3b8;
  }

  .product-table--report th,
  .product-table--report td {
    font-size: 0.82rem;
    white-space: nowrap;
  }

  .product-table-toolbar {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) minmax(140px, 220px) auto;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid #eef2f7;
    background: #f8fafc;
  }

  .product-table-toolbar__search,
  .product-table-toolbar__select,
  .product-table-toolbar__pages {
    height: 42px;
    border-radius: 10px;
    font-size: 0.88rem;
  }

  .product-table-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 14px 16px;
    border-top: 1px solid #eef2f7;
    background: #f8fafc;
  }

  .product-table-footer__info {
    color: #64748b;
    font-size: 0.84rem;
  }

  .report-tab {
    display: grid;
    gap: 14px;
  }

  .report-tab__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
  }

  .report-kpi {
    padding: 14px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    background: #ffffff;
  }

  .report-kpi__label {
    display: block;
    margin-bottom: 6px;
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .report-kpi__value {
    display: block;
    color: #0f172a;
    font-size: 1rem;
    font-weight: 800;
    line-height: 1.35;
  }

  .report-kpi__value small {
    margin-inline-start: 4px;
    color: #64748b;
    font-size: 0.76rem;
    font-weight: 600;
  }

  .report-kpi__value--in {
    color: #047857;
  }

  .report-kpi__value--out {
    color: #be123c;
  }

  .report-kpi__value--positive {
    color: #047857;
  }

  .report-kpi__value--balance {
    font-size: 0.88rem;
    line-height: 1.5;
  }

  .report-panel {
    overflow: hidden;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: #ffffff;
  }

  .report-panel__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid #eef2f7;
    background: #f8fafc;
  }

  .report-panel__dates {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .report-panel__date {
    display: flex;
    align-items: stretch;
    min-width: 150px;
    border: 1px solid #dbe3ef;
    border-radius: 10px;
    overflow: hidden;
    background: #ffffff;
  }

  .report-panel__date .form-control {
    height: var(--control-height);
    border: none;
    box-shadow: none;
    font-size: 0.84rem;
  }

  .report-panel__chip {
    height: var(--control-height);
    padding: 0 14px;
    border: 1px solid #dbe3ef;
    border-radius: 999px;
    background: #ffffff;
    color: #475569;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
  }

  .report-panel__chip:hover {
    background: #f8fafc;
  }

  .report-panel__search-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 180px;
    min-width: 160px;
    height: var(--control-height);
    padding: 0 12px;
    border: 1px solid #dbe3ef;
    border-radius: 10px;
    background: #ffffff;
    color: #94a3b8;
  }

  .report-panel__search {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 0.84rem;
    color: #0f172a;
  }

  .report-panel__select {
    height: var(--control-height);
    padding: 0 10px;
    border: 1px solid #dbe3ef;
    border-radius: 10px;
    background: #ffffff;
    font-size: 0.84rem;
  }

  .report-panel__select--pages {
    min-width: 110px;
  }

  .report-panel__pdf {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: var(--control-height);
    margin-inline-start: auto;
    padding: 0 14px;
    border: 1px solid #fecaca;
    border-radius: 10px;
    background: #ffffff;
    color: #dc2626;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
  }

  .report-panel__pdf:hover {
    background: #fef2f2;
  }

  .report-panel__table-wrap {
    overflow: auto;
  }

  .report-panel__table {
    width: 100%;
    border-collapse: collapse;
  }

  .report-panel__table th,
  .report-panel__table td {
    padding: 12px 14px;
    border-bottom: 1px solid #eef2f7;
    font-size: 0.84rem;
    text-align: start;
    vertical-align: middle;
    white-space: nowrap;
  }

  .report-panel__table thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    color: #64748b;
    font-weight: 700;
    background: #ffffff;
    box-shadow: 0 1px 0 #eef2f7;
  }

  .report-panel__table tbody tr:hover {
    background: #fafcff;
  }

  .sortable {
    cursor: pointer;
    user-select: none;
  }

  .report-panel__id {
    color: #94a3b8;
    font-size: 0.78rem;
  }

  .report-panel__date {
    color: #475569;
  }

  .report-type-link {
    padding: 0;
    border: none;
    background: transparent;
    color: #0f6efd;
    font-size: 0.84rem;
    font-weight: 700;
    cursor: pointer;
  }

  .report-type-link:hover {
    text-decoration: underline;
  }

  .report-type {
    color: #475569;
    font-weight: 600;
  }

  .report-qty {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 999px;
    font-weight: 700;
  }

  .report-qty small {
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 600;
  }

  .report-qty--in {
    background: #ecfdf5;
    color: #047857;
  }

  .report-qty--out {
    background: #fff1f2;
    color: #be123c;
  }

  .report-balance {
    font-weight: 700;
    line-height: 1.4;
  }

  .report-edit-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    margin-inline-start: 6px;
    border: 1px solid #dbe3ef;
    border-radius: 8px;
    background: #ffffff;
    color: #0f6efd;
    cursor: pointer;
    vertical-align: middle;
  }

  .report-panel__footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-top: 1px solid #eef2f7;
    background: #f8fafc;
  }

  .report-panel__info {
    color: #64748b;
    font-size: 0.82rem;
  }

  .report-panel__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 24px;
    color: #94a3b8;
    text-align: center;
  }

  .report-panel__empty i {
    font-size: 2rem;
    opacity: 0.5;
  }

  .report-panel__empty p {
    margin: 0;
    font-size: 0.9rem;
  }

  .cursor-pointer {
    cursor: pointer;
    user-select: none;
  }

  .sortable-heading {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3125rem;
  }

  .sort-icon {
    color: #0f6efd;
    font-size: 0.75rem;
  }

  .report-summary-balance,
  .report-balance-cell {
    display: block;
    color: #334155;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.45;
    text-align: center;
  }

  .report-balance-cell {
    direction: ltr;
  }

  .report-muted-dash {
    color: #94a3b8;
  }

  .product-report-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }

  @media (max-width: 991px) {
    .product-overview-card {
      grid-template-columns: 1fr;
    }

    .product-overview-card__image {
      min-height: 15rem;
      border-inline-end: none;
      border-bottom: 1px solid #e5e7eb;
    }

    .product-overview-card__img {
      max-width: 12rem;
      max-height: 12rem;
    }

    .product-price-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .product-table-toolbar {
      grid-template-columns: 1fr;
    }

    .report-panel__pdf {
      margin-inline-start: 0;
      width: 100%;
      justify-content: center;
    }

    .report-panel__toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .product-report-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
  }

  @media (max-width: 767px) {
    .product-view-page {
      width: 100%;
      margin: 0;
      padding: 0.75rem;
    }

    .product-tabs__btn {
      flex: 1 1 calc(50% - 8px);
    }

    .product-price-grid {
      grid-template-columns: 1fr;
    }

    .product-details-grid {
      grid-template-columns: 1fr;
    }

    .product-detail-section:first-child {
      padding-inline-end: 0;
    }

    .product-detail-section + .product-detail-section {
      margin-top: 0.4rem;
      padding-inline-start: 0;
      border-inline-start: 0;
      border-top: 1px solid #e6ebf2;
    }

    .product-report-summary {
      grid-template-columns: 1fr !important;
    }
  }

  @media (max-width: 480px) {
    .product-overview-card__body {
      padding: 1rem;
    }
  }
</style>
