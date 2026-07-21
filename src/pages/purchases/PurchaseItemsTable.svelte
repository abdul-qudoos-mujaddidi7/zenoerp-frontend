<script>
  import { db } from '../../db.js';
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import ProductModal from '../products/ProductModal.svelte';
  import AppDatePicker from '../../components/common/AppDatePicker.svelte';

  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let warehouse_id = '';
  export let items = [];
  export let currency = '';

  const dispatch = createEventDispatcher();

  let itemsTableRoot;
  let products = [];
  let search = '';
  let showDropdown = false;
  let searchInput;
  let productDropdownStyle = '';

  function portal(node) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  function positionProductDropdown() {
    if (!searchInput) return;
    const rect = searchInput.closest('.col-md-6')?.getBoundingClientRect() || searchInput.getBoundingClientRect();
    const maxHeight = Math.min(250, window.innerHeight * .45);
    const openUp = window.innerHeight - rect.bottom < maxHeight + 10;
    productDropdownStyle = openUp
      ? `position:fixed;left:${rect.left}px;width:${rect.width}px;bottom:${window.innerHeight - rect.top + 5}px;top:auto;max-height:${maxHeight}px;overflow:auto;z-index:100000;`
      : `position:fixed;left:${rect.left}px;width:${rect.width}px;top:${rect.bottom + 5}px;bottom:auto;max-height:${maxHeight}px;overflow:auto;z-index:100000;`;
  }

  $: if (showDropdown) tick().then(positionProductDropdown);

  let quantity = 1;
  let unit_price = 0;
  let unit_price_currency = '';
  let unit = 0;
  let sell_price = 0;
  let sell_price_currency = '';
  let selectedProduct = null;

  $: enable_batch = $settings_all.find((s) => s.key === 'enable_batch')?.value == 1;
  $: enable_manufacturing_date = $settings_all.find((s) => s.key === 'enable_manufacturing_date')?.value == 1;
  $: enable_expiry_date = $settings_all.find((s) => s.key === 'enable_expiry_date')?.value == 1;

  $: enable_heaviness = $settings_all.find((s) => s.key === 'enable_heaviness')?.value == 1;

  $: enable_product_benefit_percentage =
    $settings_all.find((s) => s.key === 'enable_product_benefit_percentage')?.value == 1;
  $: default_product_benefit_percentage =
    $settings_all.find((s) => s.key === 'default_product_benefit_percentage')?.value || 0;

  $: enable_purchase_items_discount = $settings_all.find((s) => s.key === 'enable_purchase_items_discount')?.value == 1;

  let barcodeInput = '';

  // Reference to the modal
  let productModal;

  let categories = [];
  let units = [];
  let currencies = [];
  let warehouses = [];
  let warehouse_products = [];

  async function loadAll() {
    categories = await db.product_categories.where('status').equals(1).toArray();
    units = await db.product_units.where('status').equals(1).toArray();
    currencies = await db.currencies.where('status').equals(1).toArray();
    warehouses = await db.warehouses.where('status').equals(1).toArray();
    warehouse_products = await db.warehouse_products.where('status').equals(1).toArray();
  }

  function handleItemDateChange() {
    items = [...items];
    dispatch('update', { items });
  }

  onMount(async () => {
    loadAll();
    products = await db.products.where('status').equals(1).toArray();
    products = products.filter((p) => (p.product_status ? p.product_status == 'active' : true) && p.status == 1);
  });

  $: filteredProducts =
    search.length > 0
      ? products
          .filter(
            (p) =>
              p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
              p.code?.includes(search.trim().toLowerCase()),
          )
          .slice(0, 10)
      : [];

  function selectProduct(product) {
    selectedProduct = product;
    search = product.name;
    unit_price = Number(product.buy_price) || 0;
    unit_price_currency = product.buy_currency || '';
    sell_price = Number(product.sell_price) || 0;
    sell_price_currency = product.sell_currency || '';
    unit = product.product_unit_id;
    showDropdown = false;
  }

  function addItem() {
    if (!selectedProduct) return;

    const existingIndex = items.findIndex((i) => i.product_id === selectedProduct.id);

    if (existingIndex !== -1) {
      items[existingIndex].quantity += Number(quantity);
      items[existingIndex].subtotal = items[existingIndex].quantity * items[existingIndex].unit_price;
    } else {
      items.push({
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        product_unit_id: unit || selectedProduct.product_unit_id,
        quantity: Number(quantity),
        stock: Number(selectedProduct.quantity) || 0,
        unit_price: Number(unit_price),
        unit_price_currency: unit_price_currency,
        sell_price: Number(sell_price),
        sell_price_currency: sell_price_currency,
        total_amount: Number(quantity) * Number(unit_price),
        discount_type: 'percent',
        discount_amount: 0,
        heaviness: Number(1),
        enablePercent: enable_product_benefit_percentage,
        benefit_percent: default_product_benefit_percentage,
        manufacturing_date: selectedProduct.manufacturing_date || null,
        expiry_date: selectedProduct.expiry_date || null,
        batch: selectedProduct.batch || null,
        preUnitQuantity: Number(1),
        preUnitPrice: 0,
        subtotal: Number(quantity) * Number(unit_price),
      });
    }

    // Important: reassign so Svelte updates the table
    items = [...items];

    dispatch('update', { items });

    // Reset
    search = '';
    selectedProduct = null;
    quantity = 1;
    unit_price = 0;
    sell_price = 0;
    unit = 0;
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
          new window.mdb.Input(el);
        });
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 50);
  }
  function removeItem(index) {
    items.splice(index, 1);
    items = [...items];
    dispatch('update', { items });
  }

  function clearItems() {
    items = [];
    dispatch('update', { items });
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
  function recalc(index) {
    if (enable_heaviness) {
      items[index].quantity = (items[index].preUnitQuantity / items[index].heaviness) * 1000;
      items[index].unit_price = items[index].preUnitPrice / (items[index].quantity / items[index].preUnitQuantity);
      items[index].unit_price = exchangeRate(items[index].unit_price, 'USD', currency);
    }
    items[index].subtotal = Number(items[index].quantity) * Number(items[index].unit_price);
    items[index].total_amount = Number(items[index].quantity) * Number(items[index].unit_price);
    if (items[index].discount_type === 'percent') {
      items[index].subtotal = items[index].subtotal - (items[index].subtotal * items[index].discount_amount) / 100;
    } else if (items[index].discount_type === 'fixed') {
      items[index].subtotal = items[index].subtotal - Number(items[index].discount_amount);
    }
    items = [...items];
    dispatch('update', { items });
  }

  let barcodeTimer;
  function handleBarcode(e) {
    if (barcodeTimer) clearTimeout(barcodeTimer);

    if (e.key === 'Enter') {
      processBarcode(barcodeInput);
      barcodeInput = '';
      return;
    }

    barcodeTimer = setTimeout(() => {
      barcodeInput = '';
    }, 100);
  }

  async function processBarcode(code) {
    const product = await db.products
      .where('code')
      .equals(code)
      .and((p) => (p.product_status ? p.product_status == 'active' : true) && p.status == 1)
      .first();
    if (!product) return;
    selectProduct(product);
    addItem();
  }

  $: total = items.reduce((s, i) => {
    if (i.unit_price_currency && currency && i.unit_price_currency !== currency) {
      let exchangeRateValue = exchangeRate(i.subtotal, i.unit_price_currency, currency);
      console.log(
        `Converting ${i.subtotal} from ${i.unit_price_currency} to ${currency} for total calculation - exchange rate value: ${exchangeRateValue}`,
      );
      return s + exchangeRateValue;
    } else {
      return s + i.subtotal;
    }
  }, 0);
</script>

<div class="card shadow-2 mt-4 purchase-items-card" bind:this={itemsTableRoot}>
  <div class="card-body">
   

    <input type="text" class="position-absolute opacity-0" bind:value={barcodeInput} on:keydown={handleBarcode} />

    <div class="row g-3 mb-4 purchase-items-add-row">
      <div class="col-12 position-relative">
        <div class="input-group input-group-sm purchase-unified-input-group">
          <span class="input-group-text purchase-product-search-icon" aria-hidden="true">
            <i class="bi bi-search"></i>
          </span>
          <input
            bind:this={searchInput}
            type="text"
            class="form-control form-control-sm"
            bind:value={search}
            on:focus={() => (showDropdown = true)}
            placeholder={t('Search product by name, barcode, or SKU...')} />
        </div>
        {#if showDropdown && filteredProducts.length > 0}
          <div
            use:portal
            class="list-group shadow purchase-items-dropdown"
            style={productDropdownStyle}>
            {#each filteredProducts as p}
              <button type="button" class="list-group-item list-group-item-action" on:click={() => selectProduct(p)}>
                <div class="d-flex justify-content-between">
                  <span>{p.name}</span>
                  <small>{categories.find((c) => c.id === p.category_id)?.name || t('Category')}</small>
                </div>
              </button>
            {/each}
          </div>
        {/if}

        {#if selectedProduct}
          <div class="form-text mt-0 {selectedProduct.quantity == 0 ? 'text-danger' : ''}">
            {t('Quantity')}:
            <span dir="ltr"
              >{Number(selectedProduct.quantity || 0).toLocaleString(undefined, {
                maximumFractionDigits: 3,
              })}</span>
            {units.find((u) => u.id === selectedProduct.product_unit_id)?.name || t('Unit')}
          </div>
        {/if}
      </div>
      <div class="purchase-search-unit">
        <select class="form-select form-select-sm" bind:value={unit} aria-label={t('Unit')}>
          <option value={0}>{t('Unit')}</option>
          {#each units as productUnit}
            <option value={productUnit.id}>{productUnit.name}</option>
          {/each}
        </select>
      </div>
      <div class="purchase-search-price">
        <input
          type="number"
          class="form-control form-control-sm"
          min="0"
          bind:value={unit_price}
          placeholder={t('Purchase Price')}
          aria-label={t('Purchase Price')} />
        <span>{unit_price_currency ? t(unit_price_currency) : t(currency)}</span>
      </div>
      <button type="button" class="purchase-search-add-btn" on:click={addItem}>
        <i class="bi bi-plus-lg" aria-hidden="true"></i>
        {t('Add Item')}
      </button>
    </div>

    <div class="table-responsive">
      <table class="table table-hover align-middle purchase-items-table">
        <thead class="table-light">
          <tr>
            <th class="purchase-item-col-product">{t('Product')}</th>
            {#if enable_heaviness}
              <th class="text-center">{t('Heaviness')}</th>
            {/if}
            {#if enable_batch}
              <th class="text-center purchase-item-col-batch">{t('Batch No')}</th>
            {/if}
            {#if enable_manufacturing_date}
              <th class="text-center purchase-item-col-date">{t('Manufacturing Date')}</th>
            {/if}
            {#if enable_expiry_date}
              <th class="text-center purchase-item-col-date">{t('Expiry Date')}</th>
            {/if}
            <th class="text-center purchase-item-col-quantity">{t('Quantity')}</th>
            <th class="text-center purchase-item-col-price">{t('Buy Price')}</th>
            <th class="text-center purchase-item-col-price">{t('Sell Price')}</th>
            {#if enable_purchase_items_discount}
              <th class="text-center purchase-item-col-discount">{t('Discount')}</th>
            {/if}
            <th class="text-center purchase-item-col-subtotal">{t('Subtotal')}</th>
            <th class="text-center purchase-item-col-actions">{t('Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each items as item, index}
            <tr>
              <td class="purchase-item-product-cell">
                <div class="purchase-item-product">
                  <span class="purchase-item-product-copy">
                    <strong class="purchase-item-product-name">{item.product_name}</strong>
                    <small>
                      {t('Quantity')}:
                      {Number(item.stock || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {units.find((u) => u.id === item.product_unit_id)?.name || t('Unit')}
                    </small>
                  </span>
                </div>
              </td>

              {#if enable_heaviness}
                <td class="text-center">
                  <div class="input-group input-group-sm purchase-unified-input-group purchase-item-cell-group">
                    <input
                      type="number"
                      class="form-control form-control-sm"
                      bind:value={item.preUnitPrice}
                      on:input={() => recalc(index)} />
                    <span class="input-group-text">{t('USD')} {t('Price')}</span>
                    <input
                      type="number"
                      class="form-control form-control-sm"
                      bind:value={item.preUnitQuantity}
                      on:input={() => recalc(index)} />
                    <span class="input-group-text">{t('ton')}</span>
                    <input
                      type="number"
                      class="form-control form-control-sm"
                      bind:value={item.heaviness}
                      on:input={() => recalc(index)} />
                    <span class="input-group-text">{t('Heaviness')}</span>
                  </div>
                </td>
              {/if}

              {#if enable_batch}
                <td class="text-center purchase-item-col-batch">
                  <div class="input-group input-group-sm purchase-unified-input-group purchase-item-cell-group">
                    <input type="text" class="form-control form-control-sm" bind:value={item.batch} />
                  </div>
                </td>
              {/if}
              {#if enable_manufacturing_date}
                <td class="text-center purchase-item-col-date">
                  <div class="purchase-item-datepicker">
                    <AppDatePicker bind:value={item.manufacturing_date} on:change={handleItemDateChange} />
                  </div>
                </td>
              {/if}
              {#if enable_expiry_date}
                <td class="text-center purchase-item-col-date">
                  <div class="purchase-item-datepicker">
                    <AppDatePicker bind:value={item.expiry_date} on:change={handleItemDateChange} />
                  </div>
                </td>
              {/if}

              <td class="text-center purchase-item-col-quantity">
                <div class="input-group input-group-sm purchase-unified-input-group purchase-item-cell-group">
                  {#if enable_heaviness}
                    <span class="input-group-text"
                      >{Number(item.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                  {:else}
                    <input
                      type="number"
                      class="form-control form-control-sm"
                      bind:value={item.quantity}
                      on:input={() => recalc(index)} />
                  {/if}
                  <span class="input-group-text"
                    >{units.find((u) => u.id === item.product_unit_id)?.name || t('Unit')}</span>
                </div>
              </td>

              <td class="text-center purchase-item-col-price">
                <div class="input-group input-group-sm purchase-unified-input-group purchase-item-cell-group">
                  {#if enable_heaviness}
                    <span class="input-group-text"
                      >{Number(item.unit_price || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                  {:else}
                    <input
                      type="number"
                      class="form-control form-control-sm"
                      bind:value={item.unit_price}
                      on:input={() => {
                        if (item.enablePercent) {
                          item.sell_price = Number(
                            parseFloat(item.unit_price) +
                              (parseFloat(item.unit_price) * parseFloat(item.benefit_percent)) / 100,
                          ).toFixed(2);
                        }
                        recalc(index);
                      }} />
                  {/if}

                  <span class="input-group-text">{t(item.unit_price_currency)}</span>
                </div>
              </td>

              <td class="text-center purchase-item-col-price">
                <div class="input-group input-group-sm purchase-unified-input-group purchase-item-cell-group">
                  {#if enable_product_benefit_percentage}
                    <button
                      type="button"
                      class="btn {item.enablePercent ? 'btn-warning' : 'btn-outline-secondary'} purchase-item-toggle-btn btn-sm"
                      title={t('Percent')}
                      aria-label={t('Percent')}
                      on:click={() => {
                        item.enablePercent = !item.enablePercent;
                        if (!item.enablePercent) {
                          if (item.unit_price && item.sell_price < item.unit_price) {
                            item.sell_price = item.unit_price;
                          }
                          item.sell_price_currency = item.unit_price_currency;
                        }
                        setTimeout(() => {
                          if (window.mdb) {
                            document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
                              new window.mdb.Input(el);
                            });
                            document.querySelectorAll('.dropdown-toggle').forEach((el) => {
                              new window.mdb.Dropdown(el);
                            });
                          }
                        }, 50);
                      }}
                      ><i class="bi bi-percent"></i>
                    </button>
                  {/if}

                  {#if item.enablePercent}
                    <input
                      type="number"
                      id="percentage_markup_{index}"
                      class="form-control form-control-sm"
                      bind:value={item.benefit_percent}
                      on:input={() => {
                        item.sell_price = Number(
                          parseFloat(item.unit_price) +
                            (parseFloat(item.unit_price) * parseFloat(item.benefit_percent)) / 100,
                        ).toFixed(2);
                      }} />
                  {/if}
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    disabled={item.enablePercent}
                    bind:value={item.sell_price}
                    on:input={() => recalc(index)} />
                  <span class="input-group-text">{t(item.sell_price_currency)}</span>
                </div>
              </td>

              {#if enable_purchase_items_discount}
                <td class="purchase-item-col-discount">
                  <div class="input-group input-group-sm purchase-unified-input-group purchase-item-cell-group">
                    <button
                      type="button"
                      class="btn btn-sm btn-{item.discount_type === 'fixed' ? 'outline-secondary' : 'success'} purchase-item-toggle-btn"
                      title={t('Discount')}
                      aria-label={t('Discount')}
                      on:click={() => {
                        if (item.discount_type === 'percent') {
                          item.discount_amount = Number(item.total_amount * (item.discount_amount / 100)).toFixed(2);
                          item.discount_type = 'fixed';
                        } else {
                          item.discount_amount =
                            item.total_amount > 0
                              ? Number((item.discount_amount / item.total_amount) * 100).toFixed(2)
                              : 0;
                          item.discount_type = 'percent';
                        }
                        setTimeout(() => {
                          if (window.mdb) {
                            document
                              .querySelectorAll('[data-mdb-input-init]')
                              .forEach((el) => new window.mdb.Input(el));
                          }
                        }, 100);
                      }}><i class="bi bi-{item.discount_type === 'fixed' ? 'cash-stack' : 'percent'}"></i></button>

                    <input
                      type="number"
                      id="discountAmount_{index}"
                      class="form-control form-control-sm"
                      bind:value={item.discount_amount}
                      on:input={() => {
                        if (item.discount_amount === '') {
                          item.discount_amount = null;
                        } else if (item.discount_amount < 0) {
                          item.discount_amount = 0;
                        } else if (item.discount_type !== 'percent' && item.discount_amount > item.total_amount) {
                          item.discount_amount = item.total_amount;
                        } else if (item.discount_type === 'percent' && item.discount_amount > 100) {
                          item.discount_amount = 100;
                        } else {
                          item.discount_amount = Number(item.discount_amount);
                        }
                        recalc(index);
                      }} />

                    <span class="input-group-text">
                      {item.discount_type == 'fixed'
                        ? ''
                        : Number((item.total_amount * item.discount_amount) / 100 || 0).toFixed(2)}
                      {item.unit_price_currency ? t(item.unit_price_currency) : t(currency)}
                    </span>
                  </div>

                </td>
              {/if}
              <td class="fw-bold text-center purchase-item-subtotal purchase-item-col-subtotal">
                <div class="purchase-item-money">
                  <strong>
                    {#if item.unit_price_currency && currency && item.unit_price_currency !== currency}
                      {exchangeRate(item.subtotal, item.unit_price_currency, currency).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                    {:else}
                      {Number(item.subtotal || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    {/if}
                  </strong>
                  <small>{t(item.unit_price_currency && currency && item.unit_price_currency !== currency ? currency : item.unit_price_currency)}</small>
                </div>
              </td>
              <td class="text-center purchase-item-actions purchase-item-col-actions">
                <button type="button" class="purchase-item-more-btn" title={t('Actions')} aria-label={t('Actions')}>
                  <i class="bi bi-three-dots-vertical"></i>
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-danger"
                  title={t('Delete')}
                  aria-label={t('Delete')}
                  on:click={() => removeItem(index)}><i class="bi bi-trash" aria-hidden="true"></i></button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if items.length > 0}
      <div class="text-end mt-3 purchase-items-total-row">
        <button type="button" class="purchase-items-clear-btn" on:click={clearItems}>
          <i class="bi bi-trash"></i>{t('Clear All')}
        </button>
        <h5 class="mb-0">
          {t('Total')}:
          <span class="text-primary">{total.toFixed(2)} {t(currency)}</span>
        </h5>
      </div>
    {/if}
  </div>
</div>

<ProductModal
  bind:this={productModal}
  {categories}
  {units}
  {warehouses}
  type="purchase"
  warehouse_id=""
  defaultCurrency="AFN"
  {warehouse_products}
  on:saved={async () => {
    products = await db.products.where('status').equals(1).toArray();
    products = products.filter((p) => (p.product_status ? p.product_status == 'active' : p.status == 1));

    const newProduct = products[products.length - 1];
    if (newProduct) {
      items.push({
        product_id: newProduct.id,
        product_name: newProduct.name,
        product_unit_id: newProduct.product_unit_id,
        quantity: 1,
        heaviness: 1,
        stock: Number(newProduct.quantity) || 0,
        batch: newProduct.batch,
        manufacturing_date: newProduct.manufacturing_date,
        expiry_date: newProduct.expiry_date,
        total_amount: Number(newProduct.buy_price) || 0,
        discount_type: 'percent',
        discount_amount: 0,
        preUnitQuantity: 1,
        preUnitPrice: 0,
        enablePercent: enable_product_benefit_percentage,
        benefit_percent: default_product_benefit_percentage,
        unit_price: Number(newProduct.buy_price) || 0,
        unit_price_currency: newProduct.buy_currency || '',
        sell_price: Number(newProduct.sell_price) || 0,
        sell_price_currency: newProduct.sell_currency || '',
        subtotal: Number(newProduct.buy_price) || 0,
      });
      items = [...items];
      dispatch('update', { items });
    }
  }} />

<style>
  .purchase-items-card {
    border: 0;
  }

  .purchase-items-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #0f172a;
    font-size: 0.9rem;
    font-weight: 800;
    text-align: start;
  }

  .purchase-items-title::before {
    content: '';
    width: 4px;
    height: 18px;
    border-radius: 999px;
    background: #0f6efd;
  }

  .purchase-items-card {
    border: 1px solid #e5eaf2;
    border-radius: 12px;
    box-shadow: 0 3px 12px rgba(15, 23, 42, 0.04) !important;
    overflow: hidden;
    background: #ffffff;
  }

  .purchase-items-card :global(.card-body) {
    padding: 0.75rem 0.9rem;
  }

  .purchase-items-heading {
    padding: 0.1rem 0.15rem 0.55rem;
    border-bottom: 1px solid #eef2f7;
  }

  .purchase-items-title {
    color: #27364d;
    font-weight: 800;
    font-size: 0.88rem;
    letter-spacing: -0.01em;
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .purchase-items-title i {
    color: #0f6efd;
    font-size: 0.9rem;
  }

  .purchase-items-add-row {
    display: block;
    padding-block: 0.85rem;
    padding-inline: 0;
    background: #ffffff;
    border: 0;
    border-radius: 12px;
  }

  .purchase-items-add-row > .col-12 {
    width: 100%;
    padding-inline: 0;
  }

  .purchase-items-add-row .purchase-unified-input-group {
    width: 100%;
    margin: 0;
  }

  .purchase-unified-input-group,
  .purchase-item-cell-group {
    display: flex;
    align-items: stretch;
    width: 100%;
    min-width: 0;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow: hidden;
    background: #ffffff;
    height: 32px;
    min-height: 32px;
  }

  .purchase-unified-input-group:focus-within,
  .purchase-item-cell-group:focus-within {
    border-color: #93c5fd;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  }

  .purchase-unified-input-group :global(.form-control),
  .purchase-item-cell-group :global(.form-control) {
    border: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    flex: 1 1 auto;
    min-width: 0;
    height: 100% !important;
    min-height: 0 !important;
    background: #ffffff !important;
    font-size: 0.8rem;
    font-weight: 600;
    padding-top: 0;
    padding-bottom: 0;
  }

  .purchase-unified-input-group :global(.form-control:focus),
  .purchase-item-cell-group :global(.form-control:focus) {
    border: 0 !important;
    box-shadow: none !important;
    background: #ffffff !important;
  }

  .purchase-unified-input-group :global(.input-group-text),
  .purchase-item-cell-group :global(.input-group-text) {
    border: 0 !important;
    border-radius: 0 !important;
    background: #ffffff !important;
    color: #64748b;
    font-weight: 600;
    font-size: 0.78rem;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    height: 100%;
  }

  .purchase-unified-input-group :global(.input-group-text:not(:first-child)),
  .purchase-item-cell-group :global(.input-group-text:not(:first-child)) {
    border-inline-start: 1px solid #e2e8f0 !important;
  }

  .purchase-unified-input-group :global(.input-group-text:first-child:not(:last-child)),
  .purchase-item-cell-group :global(.input-group-text:first-child:not(:last-child)) {
    border-inline-end: 1px solid #e2e8f0 !important;
  }

  .purchase-unified-input-group :global(.purchase-input-addon-btn),
  .purchase-unified-input-group :global(.btn-info) {
    border: 0 !important;
    border-inline-start: 1px solid #e2e8f0 !important;
    border-radius: 0 !important;
    padding: 0 0.65rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    align-self: stretch;
    box-shadow: none !important;
    background: #eff6ff !important;
    color: #0f6efd;
  }

  .purchase-unified-input-group :global(.purchase-product-quick-btn) {
    flex-direction: row;
    flex-wrap: nowrap;
    gap: 0.35rem;
    width: auto !important;
    min-width: auto !important;
    padding: 0 0.65rem !important;
    border: none !important;
    background: #0f6efd !important;
    color: #ffffff !important;
    font-size: 0.72rem !important;
    font-weight: 700 !important;
    line-height: 1;
    white-space: nowrap;
  }

  .purchase-unified-input-group :global(.purchase-product-quick-btn:hover),
  .purchase-unified-input-group :global(.purchase-product-quick-btn:focus) {
    background: #1d4ed8 !important;
    color: #ffffff !important;
  }

  .purchase-unified-input-group :global(.purchase-product-quick-btn i),
  .purchase-product-quick-btn__text {
    display: inline-block;
    flex-shrink: 0;
    white-space: nowrap;
    line-height: 1;
    border: none;
  }

  .purchase-item-toggle-btn {
    border: 0 !important;
    border-radius: 0 !important;
    border-inline-end: 1px solid #e2e8f0 !important;
    width: 32px;
    min-width: 32px;
    padding: 0 !important;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    flex-shrink: 0;
    line-height: 1;
    box-shadow: none !important;
  }

  .purchase-items-add-row :global(input.form-control),
  .purchase-items-card :global(input.form-control),
  .purchase-items-card :global(textarea.form-control) {
    background-color: #ffffff !important;
    background: #ffffff !important;
  }

  .purchase-items-add-row :global(.btn-primary) {
    border-radius: 10px;
    font-weight: 700;
    min-height: 32px;
    background: linear-gradient(180deg, #3b82f6 0%, #0f6efd 100%);
    border: none;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.22);
  }

  .purchase-items-dropdown {
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
  }

  .purchase-items-dropdown :global(.list-group-item) {
    border: 0;
    font-weight: 600;
    font-size: 0.82rem;
  }

  .purchase-items-dropdown :global(.list-group-item:hover) {
    background: #eff6ff;
    color: #0f6efd;
  }

  .purchase-items-table :global(thead th) {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #64748b;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    padding: 0.7rem 0.55rem;
    white-space: nowrap;
  }

  .purchase-items-table {
    width: 100%;
    min-width: 78rem;
    margin-bottom: 0;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 0;
    border: 1px solid #edf1f6;
    border-radius: 8px;
    overflow: hidden;
  }

  .purchase-items-table :global(tbody td) {
    border-bottom: 1px solid #edf1f6;
    border-inline-start: 1px solid #f3f5f8;
    font-size: 0.72rem;
    vertical-align: middle;
    padding: 0.38rem 0.4rem;
    color: #526177;
  }

  .purchase-items-table :global(tbody tr:nth-child(even)) {
    background: #fbfdff;
  }

  .purchase-items-table :global(tbody tr:hover) {
    background: #f0f7ff !important;
  }

  .purchase-items-table :global(.form-control),
  .purchase-items-table :global(.input-group) {
    min-width: 0;
  }

  .purchase-items-table :global(.form-control) {
    border-radius: 8px;
    border-color: #e2e8f0;
    background-color: #ffffff !important;
    font-size: 0.8rem;
    font-weight: 600;
    height: 32px;
  }

  .purchase-items-table .purchase-item-cell-group,
  .purchase-items-table .purchase-item-datepicker,
  .purchase-items-table .purchase-item-datepicker.purchase-unified-input-group {
    height: 30px;
    min-height: 30px;
    border: 0 !important;
    border-radius: 5px !important;
    background: transparent !important;
  }

  .purchase-items-table .purchase-item-cell-group:focus-within,
  .purchase-items-table .purchase-item-datepicker:focus-within {
    background: #f8fbff !important;
    box-shadow: inset 0 0 0 1px #bfdbfe;
  }

  .purchase-items-table .purchase-item-cell-group :global(.form-control),
  .purchase-items-table .purchase-item-datepicker :global(.form-control),
  .purchase-items-table .purchase-item-cell-group :global(.input-group-text) {
    background: transparent !important;
    font-size: 0.7rem;
  }

  .purchase-item-product {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-item-product-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .purchase-item-col-product {
    width: 10rem;
  }

  .purchase-item-col-batch {
    width: 7rem;
  }

  .purchase-item-col-date {
    width: 10rem;
  }

  .purchase-item-col-quantity {
    width: 8.5rem;
  }

  .purchase-item-col-price {
    width: 9rem;
  }

  .purchase-item-col-discount {
    width: 11rem;
  }

  .purchase-item-col-subtotal {
    width: 9rem;
  }

  .purchase-item-col-actions {
    width: 4.5rem;
  }

  .purchase-item-datepicker {
    width: 100%;
    min-width: 0;
    height: 32px;
    min-height: 32px;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }

  .purchase-item-datepicker.date-picker-control,
  .purchase-item-datepicker.purchase-unified-input-group {
    border: 1px solid #e2e8f0 !important;
    border-radius: 8px !important;
  }

  .purchase-item-datepicker :global(.persian-date-text),
  .purchase-item-datepicker :global(.input-group-text.persian-date-text) {
    display: none !important;
  }

  .purchase-item-datepicker :global(.gregorian-date-text) {
    flex: 1 1 auto;
    justify-content: flex-start;
    border-inline-end: 0;
    padding-inline: 0.55rem;
    font-size: 0.72rem;
    min-height: 32px;
    height: 32px;
  }

  .purchase-item-datepicker :global(.date-picker-icon) {
    height: 32px;
    min-height: 32px;
    max-height: 32px;
    flex: 0 0 30px;
    width: 30px;
    min-width: 30px;
  }

  .purchase-item-stock {
    margin-top: 0.28rem;
    font-size: 0.68rem;
    line-height: 1.25;
    color: #94a3b8;
    font-weight: 600;
    white-space: nowrap;
  }

  .purchase-item-stock.text-danger {
    color: #ef4444;
  }

  .purchase-item-actions {
    width: 4.5rem;
  }

  .purchase-items-table :global(.btn-outline-danger) {
    border-radius: 8px;
    width: 32px;
    height: 32px;
    padding: 0;
    line-height: 1;
    border-color: #fecaca;
    color: #ef4444;
    background: #fff;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .purchase-items-total-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.75rem !important;
    padding: 0.45rem 0.55rem;
    border: 0;
    border-radius: 7px;
    background: transparent;
  }

  .purchase-items-total-row :global(h5) {
    font-size: 1rem;
    font-weight: 800;
    color: #334155;
    margin: 0;
  }

  .purchase-items-total-row :global(.text-primary) {
    color: #334e78 !important;
    font-weight: 900;
    font-size: 0.82rem;
  }

  .purchase-items-clear-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 30px;
    padding: 0.35rem 0.65rem;
    border: 1px solid #fee2e2;
    border-radius: 7px;
    background: #fff;
    color: #ef4444;
    font-size: 0.68rem;
    font-weight: 700;
  }

  .purchase-items-clear-btn:hover:not(:disabled) {
    border-color: #fecaca;
    background: #fef2f2;
  }

  .purchase-items-clear-btn:disabled {
    opacity: 0.45;
  }

  /* Spacious purchase-item row, matching the supplied design reference. */
  .purchase-items-card {
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(35, 50, 85, 0.07) !important;
  }

  .purchase-items-card .table-responsive {
    border: 1px solid #e7ebf2;
    border-radius: 12px;
    background: #fff;
    overflow-x: hidden;
  }

  .purchase-items-table {
    min-width: 0;
    border: 0;
    border-radius: 0;
  }

  .purchase-items-table :global(thead th) {
    height: 4.5rem;
    padding: 0.8rem 0.5rem 0.55rem;
    border-bottom: 1px solid #e7ebf2;
    background: #fff;
    color: #1f2a44;
    font-size: 0.78rem;
    font-weight: 850;
    letter-spacing: 0;
    text-transform: none;
    vertical-align: middle;
  }

  .purchase-items-table :global(thead th:not(.purchase-item-col-product):not(.purchase-item-col-actions)::after) {
    content: 'ⓘ';
    display: block;
    margin-top: 0.28rem;
    color: #c8ceda;
    font-size: 0.62rem;
    line-height: 1;
  }

  .purchase-items-table :global(tbody tr) {
    height: 7.4rem;
    background: #fff !important;
  }

  .purchase-items-table :global(tbody td) {
    padding: 1rem 0.5rem;
    border-inline-start: 0;
    border-bottom: 0;
    background: #fff;
    font-size: 0.78rem;
  }

  .purchase-item-col-product {
    width: 13rem;
  }

  .purchase-item-col-batch {
    width: 6.5rem;
  }

  .purchase-item-col-date {
    width: 9rem;
  }

  .purchase-item-col-quantity {
    width: 6.5rem;
  }

  .purchase-item-col-price,
  .purchase-item-col-subtotal {
    width: 7rem;
  }

  .purchase-item-col-discount {
    width: 8rem;
  }

  .purchase-item-col-actions {
    width: 5rem;
  }

  .purchase-item-product {
    min-height: 3.9rem;
    padding: 0.5rem 0.65rem !important;
    border: 1px solid #dfe5ee !important;
    border-radius: 10px;
    flex-direction: row-reverse;
    background: #fff;
  }

  .purchase-item-product-cell {
    vertical-align: middle !important;
  }

  .purchase-item-product-cell .purchase-item-product {
    width: 100%;
    height: 3.9rem;
    margin: 0;
  }

  .purchase-item-product-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 0.2rem;
    text-align: end;
  }

  .purchase-item-product-name {
    color: #18243a;
    font-size: 0.86rem;
    font-weight: 850;
  }

  .purchase-item-product-copy small {
    overflow: hidden;
    color: #8a94a8;
    font-size: 0.66rem;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-items-table .purchase-item-cell-group,
  .purchase-items-table .purchase-item-datepicker,
  .purchase-items-table .purchase-item-datepicker.purchase-unified-input-group {
    min-height: 3.55rem;
    height: 3.55rem;
    overflow: hidden;
    border: 1px solid #dfe5ee !important;
    border-radius: 9px !important;
    background: #fff !important;
  }

  .purchase-items-table .purchase-item-cell-group {
    flex-direction: column;
  }

  .purchase-items-table .purchase-item-cell-group :global(.form-control) {
    width: 100%;
    min-height: 2rem !important;
    flex: 1 1 auto;
    padding: 0.3rem 0.45rem;
    color: #18243a;
    font-size: 0.82rem;
    text-align: center;
  }

  .purchase-items-table .purchase-item-cell-group :global(.input-group-text) {
    width: 100%;
    min-height: 1.35rem;
    height: 1.35rem;
    justify-content: center;
    border: 0 !important;
    border-top: 1px solid #e5e9f0 !important;
    color: #7c879b;
    background: #f8f9fc !important;
    font-size: 0.65rem;
  }

  .purchase-items-table .purchase-item-datepicker {
    flex-direction: row;
  }

  .purchase-items-table .purchase-item-datepicker :global(.form-control),
  .purchase-items-table .purchase-item-datepicker :global(.gregorian-date-text) {
    height: 100% !important;
    min-height: 100% !important;
    padding-inline: 0.45rem;
    color: #24324b;
    background: #fff !important;
    font-size: 0.68rem;
    text-align: center;
  }

  .purchase-items-table .purchase-item-datepicker :global(.date-picker-icon) {
    height: 100% !important;
    min-height: 100% !important;
    max-height: none;
    color: #1d5ccc;
    background: #fff;
  }

  .purchase-item-col-discount .purchase-item-cell-group {
    flex-direction: row;
  }

  .purchase-item-col-discount .purchase-item-cell-group :global(.input-group-text) {
    width: auto;
    min-width: 3rem;
    height: 100%;
    border-top: 0 !important;
    border-inline-start: 1px solid #e5e9f0 !important;
  }

  .purchase-item-stock {
    margin-top: 0.25rem;
    font-size: 0.6rem;
  }

  .purchase-item-money {
    display: flex;
    min-height: 3.55rem;
    overflow: hidden;
    flex-direction: column;
    border: 1px solid #dfe5ee;
    border-radius: 9px;
    background: #fff;
  }

  .purchase-item-money strong {
    display: grid;
    min-height: 2.15rem;
    place-items: center;
    color: #18243a;
    font-size: 0.82rem;
  }

  .purchase-item-money small {
    display: grid;
    min-height: 1.35rem;
    place-items: center;
    border-top: 1px solid #e5e9f0;
    color: #7c879b;
    background: #f8f9fc;
    font-size: 0.65rem;
  }

  .purchase-item-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
  }

  .purchase-item-more-btn {
    display: inline-grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: #1763d6;
    font-size: 1rem;
  }

  .purchase-items-table :global(.btn-outline-danger) {
    width: 2.45rem;
    height: 2.45rem;
    border-radius: 9px;
    background: #fff7f7;
  }

  /* Keep purchase-only columns, but match the compact Sale Items row design. */
  .purchase-items-card .table-responsive {
    overflow-x: hidden;
    border: 0;
    border-radius: 0;
  }

  .purchase-items-table {
    width: 100%;
    min-width: 0;
    border: 0;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .purchase-items-table :global(thead th) {
    height: auto;
    padding: 0.7rem 0.4rem;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
    color: #64748b;
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    text-transform: none;
  }

  .purchase-items-table :global(thead th::after) {
    display: none !important;
  }

  .purchase-items-table :global(tbody tr) {
    height: auto;
    background: #fff !important;
  }

  .purchase-items-table :global(tbody tr:nth-child(even)) {
    background: #fbfdff !important;
  }

  .purchase-items-table :global(tbody tr:hover) {
    background: #f0f7ff !important;
  }

  .purchase-items-table :global(tbody td) {
    padding: 0.55rem 0.35rem;
    border-bottom: 1px solid #f1f5f9;
    background: transparent;
    color: #46536a;
    font-size: 0.76rem;
    vertical-align: middle;
  }

  .purchase-item-product-cell {
    padding: 0.55rem 0.4rem !important;
  }

  .purchase-item-product-cell .purchase-item-product {
    width: 100%;
    height: auto;
    min-height: 0;
    margin: 0;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0;
    background: transparent;
  }

  .purchase-item-product-copy {
    gap: 0.1rem;
    text-align: start;
  }

  .purchase-item-product-name {
    color: #334155;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .purchase-item-product-copy small {
    color: #94a3b8;
    font-size: 0.62rem;
  }

  .purchase-items-table .purchase-item-cell-group,
  .purchase-items-table .purchase-item-datepicker,
  .purchase-items-table .purchase-item-datepicker.purchase-unified-input-group {
    height: 32px;
    min-height: 32px;
    overflow: hidden;
    flex-direction: row;
    border: 1px solid #e2e8f0 !important;
    border-radius: 8px !important;
    background: #fff !important;
  }

  .purchase-items-table .purchase-item-cell-group :global(.form-control),
  .purchase-items-table .purchase-item-datepicker :global(.form-control),
  .purchase-items-table .purchase-item-datepicker :global(.gregorian-date-text) {
    width: auto;
    height: 100% !important;
    min-height: 0 !important;
    flex: 1 1 auto;
    padding: 0 0.3rem;
    background: #fff !important;
    color: #334155;
    font-size: 0.68rem;
    text-align: center;
  }

  .purchase-items-table .purchase-item-cell-group :global(.input-group-text) {
    width: auto;
    min-width: 0;
    height: 100%;
    min-height: 0;
    padding-inline: 0.3rem;
    border: 0 !important;
    border-inline-start: 1px solid #e2e8f0 !important;
    background: #fff !important;
    color: #64748b;
    font-size: 0.62rem;
  }

  .purchase-items-table .purchase-item-datepicker :global(.date-picker-icon) {
    width: 28px;
    min-width: 28px;
    height: 100% !important;
    min-height: 100% !important;
    color: #64748b;
    background: #fff;
  }

  .purchase-item-money {
    display: block;
    min-height: 0;
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .purchase-item-money strong,
  .purchase-item-money small {
    display: inline;
    min-height: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 0.76rem;
  }

  .purchase-item-money small {
    margin-inline-start: 0.2rem;
    color: #64748b;
  }

  .purchase-item-actions {
    gap: 0;
  }

  .purchase-item-more-btn {
    display: none;
  }

  .purchase-items-table :global(.btn-outline-danger) {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border-color: #fecaca;
    background: #fff;
  }

  .purchase-items-table .purchase-item-col-quantity .purchase-item-cell-group,
  .purchase-items-table .purchase-item-col-price .purchase-item-cell-group {
    height: 42px;
    min-height: 42px;
    flex-direction: column;
  }

  .purchase-items-table .purchase-item-col-quantity .purchase-item-cell-group :global(.form-control),
  .purchase-items-table .purchase-item-col-price .purchase-item-cell-group :global(.form-control) {
    width: 100%;
    min-height: 24px !important;
  }

  .purchase-items-table .purchase-item-col-quantity .purchase-item-cell-group :global(.input-group-text),
  .purchase-items-table .purchase-item-col-price .purchase-item-cell-group :global(.input-group-text) {
    width: 100%;
    height: 17px;
    min-height: 17px;
    justify-content: center;
    border-inline-start: 0 !important;
    border-top: 1px solid #e2e8f0 !important;
    background: #f8fafc !important;
  }

  .purchase-item-col-discount .purchase-item-cell-group {
    display: grid;
    height: 42px;
    min-height: 42px;
    grid-template-columns: 30px minmax(0, 1fr);
    grid-template-rows: 24px 17px;
  }

  .purchase-item-col-discount .purchase-item-toggle-btn {
    width: 30px;
    min-width: 30px;
    height: 100%;
    grid-column: 1;
    grid-row: 1 / 3;
    border: 1px solid #a7f3d0 !important;
    background: #ecfdf5 !important;
    color: #059669 !important;
  }

  .purchase-item-col-discount .purchase-item-toggle-btn:hover,
  .purchase-item-col-discount .purchase-item-toggle-btn:focus {
    border-color: #6ee7b7 !important;
    background: #d1fae5 !important;
    color: #047857 !important;
  }

  .purchase-item-col-discount .purchase-item-cell-group :global(.form-control) {
    width: 100%;
    min-height: 24px !important;
    grid-column: 2;
    grid-row: 1;
  }

  .purchase-item-col-discount .purchase-item-cell-group :global(.input-group-text) {
    width: 100%;
    height: 17px;
    min-height: 17px;
    justify-content: center;
    grid-column: 2;
    grid-row: 2;
    border-inline-start: 0 !important;
    border-top: 1px solid #e2e8f0 !important;
    background: #f8fafc !important;
  }

  .purchase-item-money {
    display: flex;
    min-height: 42px;
    overflow: hidden;
    flex-direction: column;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #fff;
  }

  .purchase-item-money strong {
    display: grid;
    min-height: 24px;
    flex: 1;
    place-items: center;
    color: #334155;
    font-size: 0.72rem;
  }

  .purchase-item-money small {
    display: grid;
    width: 100%;
    min-height: 17px;
    margin: 0;
    place-items: center;
    border-top: 1px solid #e2e8f0;
    background: #f8fafc;
    color: #64748b;
    font-size: 0.6rem;
  }

  .purchase-items-table :global(tbody td) {
    vertical-align: middle !important;
  }

  .purchase-items-table .purchase-item-datepicker {
    display: flex;
    width: 100%;
    height: 42px;
    min-height: 42px;
    align-items: center;
    overflow: visible;
    border: 0 !important;
    background: transparent !important;
  }

  .purchase-item-datepicker :global(.app-date-field),
  .purchase-item-datepicker :global(.pdp-container) {
    width: 100%;
    min-width: 0;
    height: 42px;
    min-height: 42px;
    margin: 0;
    gap: 0;
  }

  .purchase-item-datepicker :global(.app-date-field input),
  .purchase-item-datepicker :global(.pdp-container input) {
    width: 100%;
    height: 42px !important;
    min-height: 42px !important;
    margin: 0 !important;
    padding-block: 0 !important;
    border-radius: 8px !important;
    font-size: 0.68rem !important;
    line-height: 42px;
  }

  /* Tighter, consistently aligned purchase row controls. */
  .purchase-items-table .purchase-item-col-quantity .purchase-item-cell-group,
  .purchase-items-table .purchase-item-col-price .purchase-item-cell-group,
  .purchase-item-col-discount .purchase-item-cell-group,
  .purchase-item-money,
  .purchase-items-table .purchase-item-datepicker,
  .purchase-item-datepicker :global(.app-date-field),
  .purchase-item-datepicker :global(.pdp-container) {
    height: 34px;
    min-height: 34px;
  }

  .purchase-items-table .purchase-item-col-quantity .purchase-item-cell-group :global(.form-control),
  .purchase-items-table .purchase-item-col-price .purchase-item-cell-group :global(.form-control),
  .purchase-item-col-discount .purchase-item-cell-group :global(.form-control),
  .purchase-item-money strong {
    min-height: 20px !important;
  }

  .purchase-items-table .purchase-item-col-quantity .purchase-item-cell-group :global(.input-group-text),
  .purchase-items-table .purchase-item-col-price .purchase-item-cell-group :global(.input-group-text),
  .purchase-item-col-discount .purchase-item-cell-group :global(.input-group-text),
  .purchase-item-money small {
    height: 13px;
    min-height: 13px;
    line-height: 13px;
  }

  .purchase-item-col-discount .purchase-item-cell-group {
    grid-template-rows: 20px 13px;
  }

  .purchase-item-datepicker :global(.app-date-field input),
  .purchase-item-datepicker :global(.pdp-container input) {
    height: 34px !important;
    min-height: 34px !important;
    line-height: 34px;
  }

  .purchase-items-table :global(tbody td .btn-outline-danger) {
    width: 26px !important;
    min-width: 26px !important;
    height: 26px !important;
    min-height: 26px !important;
    padding: 0 !important;
    border-radius: 7px !important;
    font-size: 0.68rem !important;
    line-height: 1 !important;
  }

  .purchase-items-add-row .purchase-unified-input-group {
    border-radius: 4px;
  }

  .purchase-items-add-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: nowrap;
    gap: 0.75rem;
  }

  .purchase-items-add-row > .col-12 {
    width: auto;
    min-width: 0;
    flex: 1 1 760px;
    order: 1;
  }

  .purchase-items-add-row .purchase-unified-input-group {
    height: 24px;
    min-height: 24px;
    border-color: #dbe4ef;
    background: #fff;
  }

  .purchase-product-search-icon {
    display: inline-flex;
    width: 40px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0 !important;
    background: transparent !important;
    color: #64748b !important;
  }

  .purchase-items-add-row :global(.form-control) {
    height: 22px;
    min-height: 22px;
    padding-inline: 0.25rem 0.75rem;
    border: 0 !important;
    background: #fff !important;
    box-shadow: none !important;
    color: #334155;
  }

  .purchase-items-add-row :global(.form-control::placeholder) {
    color: #94a3b8;
  }

  .purchase-search-add-btn {
    display: inline-flex;
    height: 24px;
    min-height: 24px;
    width: auto !important;
    min-width: 110px;
    flex: 0 0 auto;
    order: 2;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding-inline: 0.85rem;
    border: 0;
    border-radius: 4px;
    background: #0f6efd;
    color: #fff;
    font-size: 0.72rem;
    font-weight: 700;
    box-shadow: 0 3px 8px rgba(37, 99, 235, 0.18);
  }

  .purchase-search-unit,
  .purchase-search-price {
    position: relative;
    width: 130px;
    min-width: 110px;
    flex: 0 0 130px;
    order: 2;
  }

  .purchase-search-unit :global(.form-select),
  .purchase-search-price :global(.form-control) {
    width: 100%;
    height: 24px;
    min-height: 24px;
    padding-block: 0;
    border: 1px solid #dbe4ef !important;
    border-radius: 4px !important;
    font-size: 0.72rem;
  }

  .purchase-search-price :global(.form-control) {
    padding-inline-end: 2.8rem;
  }

  .purchase-search-price > span {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-end: 0.55rem;
    transform: translateY(-50%);
    color: #64748b;
    font-size: 0.62rem;
    pointer-events: none;
  }

  .purchase-search-add-btn {
    order: 3;
    align-self: flex-start;
  }

  .purchase-search-add-btn:hover,
  .purchase-search-add-btn:focus-visible {
    background: #1d4ed8;
  }

  :global([dir='rtl']) .purchase-items-add-row {
    justify-content: flex-start;
  }

  @media (max-width: 767.98px) {
    .purchase-items-add-row > .col-12 {
      width: auto;
      flex-basis: auto;
    }

    .purchase-search-add-btn {
      width: auto !important;
    }

    .purchase-search-unit,
    .purchase-search-price {
      width: 92px;
      min-width: 82px;
      flex-basis: 92px;
    }
  }

  .purchase-items-table .purchase-item-cell-group,
  .purchase-items-table .purchase-item-datepicker,
  .purchase-items-table .purchase-item-datepicker :global(input),
  .purchase-items-table .purchase-item-money,
  .purchase-items-table :global(tbody td .btn-outline-danger) {
    border-radius: 4px !important;
  }

  .purchase-items-card {
    border: 1px solid #e2e8f0;
  }

</style>
