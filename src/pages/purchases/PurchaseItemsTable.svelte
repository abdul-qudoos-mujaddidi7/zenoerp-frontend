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

<div class="card purchase-items-card" bind:this={itemsTableRoot}>
  <div class="card-body">
    <header class="purchase-items-header">
      <div class="purchase-items-heading">
        <span class="purchase-items-heading__icon" aria-hidden="true">
          <i class="bi bi-cart-plus"></i>
        </span>

        <div class="purchase-items-heading__copy">
          <h5 class="purchase-items-title">{t('Purchase Items')}</h5>
        </div>
      </div>

      <div class="purchase-items-header__summary">
        <span class="purchase-items-count">
          <i class="bi bi-box-seam" aria-hidden="true"></i>
          {items.length} {t('Items')}
        </span>

        <strong class="purchase-items-header-total" dir="ltr">
          {Number(total || 0).toLocaleString(undefined, {
            maximumFractionDigits: 3,
          })}
          <small>{t(currency)}</small>
        </strong>
      </div>
    </header>

    <input
      type="text"
      class="purchase-barcode-input"
      bind:value={barcodeInput}
      on:keydown={handleBarcode}
      aria-hidden="true"
      tabindex="-1" />

    <section class="purchase-items-entry" aria-label={t('Add Item')}>
      <div class="purchase-entry-field purchase-entry-field--product position-relative">
        <label class="purchase-entry-label" for="purchase-product-search">
          {t('Product')}
        </label>

        <div class="purchase-product-search">
          <i class="bi bi-search" aria-hidden="true"></i>

          <input
            id="purchase-product-search"
            bind:this={searchInput}
            type="text"
            bind:value={search}
            autocomplete="off"
            on:focus={() => (showDropdown = true)}
            placeholder={t('Search product by name, barcode, or SKU...')} />

          {#if search}
            <button
              type="button"
              class="purchase-search-clear"
              aria-label={t('Clear')}
              title={t('Clear')}
              on:click={() => {
                search = '';
                selectedProduct = null;
                showDropdown = false;
                searchInput?.focus();
              }}>
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          {/if}
        </div>

        {#if showDropdown && filteredProducts.length > 0}
          <div
            use:portal
            class="list-group purchase-items-dropdown"
            style={productDropdownStyle}>
            {#each filteredProducts as p (p.id)}
              <button
                type="button"
                class="purchase-product-option"
                on:click={() => selectProduct(p)}>
                <span class="purchase-product-option__icon" aria-hidden="true">
                  <i class="bi bi-box-seam"></i>
                </span>

                <span class="purchase-product-option__copy">
                  <strong>{p.name}</strong>
                  <small>
                    {categories.find((c) => c.id === p.category_id)?.name ||
                      t('Category')}
                  </small>
                </span>

                <span class="purchase-product-option__stock">
                  <small>{t('Stock')}</small>
                  <strong dir="ltr">
                    {Number(p.quantity || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                  </strong>
                </span>
              </button>
            {/each}
          </div>
        {/if}

        {#if selectedProduct}
          <div
            class="purchase-selected-stock"
            class:is-empty={Number(selectedProduct.quantity || 0) <= 0}>
            <i class="bi bi-boxes" aria-hidden="true"></i>
            <span>
              {t('Available Stock')}:
              <strong dir="ltr">
                {Number(selectedProduct.quantity || 0).toLocaleString(undefined, {
                  maximumFractionDigits: 3,
                })}
              </strong>
              {units.find((u) => u.id === selectedProduct.product_unit_id)?.name ||
                t('Unit')}
            </span>
          </div>
        {/if}
      </div>

      <label class="purchase-entry-field">
        <span class="purchase-entry-label">{t('Unit')}</span>

        <div class="purchase-entry-control">
          <i class="bi bi-rulers" aria-hidden="true"></i>

          <select bind:value={unit} aria-label={t('Unit')}>
            <option value={0}>{t('Select Unit')}</option>
            {#each units as productUnit (productUnit.id)}
              <option value={productUnit.id}>{productUnit.name}</option>
            {/each}
          </select>

          <i class="bi bi-chevron-down purchase-entry-chevron" aria-hidden="true"></i>
        </div>
      </label>

      <label class="purchase-entry-field">
        <span class="purchase-entry-label">{t('Purchase Price')}</span>

        <div class="purchase-entry-control purchase-entry-control--price">
          <i class="bi bi-cash-stack" aria-hidden="true"></i>

          <input
            type="number"
            min="0"
            step="any"
            bind:value={unit_price}
            placeholder="0.00"
            aria-label={t('Purchase Price')} />

          <span>
            {unit_price_currency ? t(unit_price_currency) : t(currency)}
          </span>
        </div>
      </label>

      <button
        type="button"
        class="purchase-search-add-btn"
        disabled={!selectedProduct}
        on:click={addItem}>
        <i class="bi bi-plus-lg" aria-hidden="true"></i>
        <span>{t('Add Item')}</span>
      </button>
    </section>

    <div class="purchase-items-table-scroll">
      <table class="purchase-items-table">
        <thead>
          <tr>
            <th class="purchase-item-col-product">{t('Product')}</th>

            {#if enable_heaviness}
              <th class="purchase-item-col-heaviness">{t('Heaviness')}</th>
            {/if}

            {#if enable_batch}
              <th class="purchase-item-col-batch">{t('Batch No')}</th>
            {/if}

            {#if enable_manufacturing_date}
              <th class="purchase-item-col-date">{t('Manufacturing Date')}</th>
            {/if}

            {#if enable_expiry_date}
              <th class="purchase-item-col-date">{t('Expiry Date')}</th>
            {/if}

            <th class="purchase-item-col-quantity">{t('Quantity')}</th>
            <th class="purchase-item-col-price">{t('Buy Price')}</th>
            <th class="purchase-item-col-sell-price">{t('Sell Price')}</th>

            {#if enable_purchase_items_discount}
              <th class="purchase-item-col-discount">{t('Discount')}</th>
            {/if}

            <th class="purchase-item-col-subtotal">{t('Subtotal')}</th>
            <th class="purchase-item-col-actions">{t('Actions')}</th>
          </tr>
        </thead>

        <tbody>
          {#each items as item, index (item.id || `${item.product_id}-${index}`)}
            <tr>
              <td class="purchase-item-product-cell">
                <div class="purchase-item-product">
                  <span class="purchase-item-number">{index + 1}</span>

                  <span class="purchase-item-product-icon" aria-hidden="true">
                    <i class="bi bi-box-seam"></i>
                  </span>

                  <span class="purchase-item-product-copy">
                    <strong class="purchase-item-product-name">
                      {item.product_name}
                    </strong>

                    <small>
                      {t('Stock')}:
                      <span dir="ltr">
                        {Number(item.stock || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        })}
                      </span>
                      {units.find((u) => u.id === item.product_unit_id)?.name ||
                        t('Unit')}
                    </small>
                  </span>
                </div>
              </td>

              {#if enable_heaviness}
                <td class="purchase-item-col-heaviness">
                  <div class="purchase-item-heaviness">
                    <label>
                      <span>{t('USD')} {t('Price')}</span>
                      <input
                        type="number"
                        step="any"
                        bind:value={item.preUnitPrice}
                        on:input={() => recalc(index)} />
                    </label>

                    <label>
                      <span>{t('ton')}</span>
                      <input
                        type="number"
                        step="any"
                        bind:value={item.preUnitQuantity}
                        on:input={() => recalc(index)} />
                    </label>

                    <label>
                      <span>{t('Heaviness')}</span>
                      <input
                        type="number"
                        step="any"
                        bind:value={item.heaviness}
                        on:input={() => recalc(index)} />
                    </label>
                  </div>
                </td>
              {/if}

              {#if enable_batch}
                <td class="purchase-item-col-batch">
                  <div class="purchase-item-field">
                    <input
                      type="text"
                      bind:value={item.batch}
                      placeholder={t('Batch No')}
                      aria-label={t('Batch No')} />
                  </div>
                </td>
              {/if}

              {#if enable_manufacturing_date}
                <td class="purchase-item-col-date">
                  <div class="purchase-item-datepicker">
                    <AppDatePicker
                      bind:value={item.manufacturing_date}
                      on:change={handleItemDateChange} />
                  </div>
                </td>
              {/if}

              {#if enable_expiry_date}
                <td class="purchase-item-col-date">
                  <div class="purchase-item-datepicker">
                    <AppDatePicker
                      bind:value={item.expiry_date}
                      on:change={handleItemDateChange} />
                  </div>
                </td>
              {/if}

              <td class="purchase-item-col-quantity">
                <div class="purchase-item-field purchase-item-field--with-suffix">
                  {#if enable_heaviness}
                    <span class="purchase-item-readonly-value" dir="ltr">
                      {Number(item.quantity || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                    </span>
                  {:else}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      bind:value={item.quantity}
                      on:input={() => recalc(index)}
                      aria-label={t('Quantity')} />
                  {/if}

                  <span class="purchase-item-suffix">
                    {units.find((u) => u.id === item.product_unit_id)?.name ||
                      t('Unit')}
                  </span>
                </div>
              </td>

              <td class="purchase-item-col-price">
                <div class="purchase-item-field purchase-item-field--with-suffix">
                  {#if enable_heaviness}
                    <span class="purchase-item-readonly-value" dir="ltr">
                      {Number(item.unit_price || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                    </span>
                  {:else}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      bind:value={item.unit_price}
                      on:input={() => {
                        if (item.enablePercent) {
                          item.sell_price = Number(
                            Number(item.unit_price || 0) +
                              (Number(item.unit_price || 0) *
                                Number(item.benefit_percent || 0)) /
                                100,
                          ).toFixed(2);
                        }

                        recalc(index);
                      }}
                      aria-label={t('Buy Price')} />
                  {/if}

                  <span class="purchase-item-suffix">
                    {t(item.unit_price_currency || currency)}
                  </span>
                </div>
              </td>

              <td class="purchase-item-col-sell-price">
                <div class="purchase-item-field purchase-item-sell-field">
                  {#if enable_product_benefit_percentage}
                    <button
                      type="button"
                      class="purchase-item-toggle"
                      class:is-active={item.enablePercent}
                      title={t('Percent')}
                      aria-label={t('Percent')}
                      on:click={() => {
                        item.enablePercent = !item.enablePercent;

                        if (!item.enablePercent) {
                          if (
                            Number(item.unit_price || 0) &&
                            Number(item.sell_price || 0) < Number(item.unit_price || 0)
                          ) {
                            item.sell_price = item.unit_price;
                          }

                          item.sell_price_currency = item.unit_price_currency;
                        }

                        recalc(index);
                      }}>
                      <i class="bi bi-percent" aria-hidden="true"></i>
                    </button>
                  {/if}

                  {#if item.enablePercent}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      class="purchase-item-percent-input"
                      id="percentage_markup_{index}"
                      bind:value={item.benefit_percent}
                      on:input={() => {
                        item.sell_price = Number(
                          Number(item.unit_price || 0) +
                            (Number(item.unit_price || 0) *
                              Number(item.benefit_percent || 0)) /
                              100,
                        ).toFixed(2);

                        recalc(index);
                      }}
                      aria-label={t('Percent')} />
                  {/if}

                  <input
                    type="number"
                    min="0"
                    step="any"
                    disabled={item.enablePercent}
                    bind:value={item.sell_price}
                    on:input={() => recalc(index)}
                    aria-label={t('Sell Price')} />

                  <span class="purchase-item-suffix">
                    {t(item.sell_price_currency || currency)}
                  </span>
                </div>
              </td>

              {#if enable_purchase_items_discount}
                <td class="purchase-item-col-discount">
                  <div class="purchase-item-field purchase-item-discount-field">
                    <button
                      type="button"
                      class="purchase-item-toggle"
                      class:is-active={item.discount_type === 'percent'}
                      title={t('Discount')}
                      aria-label={t('Discount')}
                      on:click={() => {
                        if (item.discount_type === 'percent') {
                          item.discount_amount = Number(
                            Number(item.total_amount || 0) *
                              (Number(item.discount_amount || 0) / 100),
                          ).toFixed(2);
                          item.discount_type = 'fixed';
                        } else {
                          item.discount_amount =
                            Number(item.total_amount || 0) > 0
                              ? Number(
                                  (Number(item.discount_amount || 0) /
                                    Number(item.total_amount || 0)) *
                                    100,
                                ).toFixed(2)
                              : 0;
                          item.discount_type = 'percent';
                        }

                        recalc(index);
                      }}>
                      <i
                        class="bi bi-{item.discount_type === 'fixed'
                          ? 'cash-stack'
                          : 'percent'}"
                        aria-hidden="true"></i>
                    </button>

                    <input
                      type="number"
                      min="0"
                      step="any"
                      id="discountAmount_{index}"
                      bind:value={item.discount_amount}
                      on:input={() => {
                        if (item.discount_amount === '') {
                          item.discount_amount = null;
                        } else if (Number(item.discount_amount) < 0) {
                          item.discount_amount = 0;
                        } else if (
                          item.discount_type !== 'percent' &&
                          Number(item.discount_amount) > Number(item.total_amount || 0)
                        ) {
                          item.discount_amount = Number(item.total_amount || 0);
                        } else if (
                          item.discount_type === 'percent' &&
                          Number(item.discount_amount) > 100
                        ) {
                          item.discount_amount = 100;
                        } else {
                          item.discount_amount = Number(item.discount_amount);
                        }

                        recalc(index);
                      }}
                      aria-label={t('Discount')} />

                    <span class="purchase-item-suffix purchase-item-discount-suffix">
                      {#if item.discount_type === 'percent'}
                        {Number(
                          (Number(item.total_amount || 0) *
                            Number(item.discount_amount || 0)) /
                            100,
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                      {/if}
                      {t(item.unit_price_currency || currency)}
                    </span>
                  </div>
                </td>
              {/if}

              <td class="purchase-item-col-subtotal">
                <div class="purchase-item-money">
                  <strong dir="ltr">
                    {#if
                      item.unit_price_currency &&
                      currency &&
                      item.unit_price_currency !== currency}
                      {Number(
                        exchangeRate(item.subtotal, item.unit_price_currency, currency),
                      ).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                    {:else}
                      {Number(item.subtotal || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                    {/if}
                  </strong>

                  <small>
                    {t(
                      item.unit_price_currency &&
                        currency &&
                        item.unit_price_currency !== currency
                        ? currency
                        : item.unit_price_currency || currency,
                    )}
                  </small>
                </div>
              </td>

              <td class="purchase-item-actions purchase-item-col-actions">
                <button
                  type="button"
                  class="purchase-item-delete"
                  title={t('Delete')}
                  aria-label={t('Delete')}
                  on:click={() => removeItem(index)}>
                  <i class="bi bi-trash3" aria-hidden="true"></i>
                </button>
              </td>
            </tr>
          {/each}

          {#if items.length === 0}
            <tr class="purchase-items-empty-row">
              <td
                colspan={6 +
                  Number(enable_heaviness) +
                  Number(enable_batch) +
                  Number(enable_manufacturing_date) +
                  Number(enable_expiry_date) +
                  Number(enable_purchase_items_discount)}>
                <div class="purchase-items-empty">
                  <span aria-hidden="true">
                    <i class="bi bi-cart-plus"></i>
                  </span>

                  <strong>{t('No purchase items added')}</strong>
              
                </div>
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

    {#if items.length > 0}
      <footer class="purchase-items-total-row">
        <button
          type="button"
          class="purchase-items-clear-btn"
          on:click={clearItems}>
          <i class="bi bi-trash3" aria-hidden="true"></i>
          <span>{t('Clear All')}</span>
        </button>

        <div class="purchase-items-grand-total">
          <span>{t('Total')}</span>
          <strong dir="ltr">
            {Number(total || 0).toLocaleString(undefined, {
              maximumFractionDigits: 3,
            })}
          </strong>
          <small>{t(currency)}</small>
        </div>
      </footer>
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
    products = products.filter((p) =>
      p.product_status ? p.product_status === 'active' : p.status === 1,
    );

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
    --purchase-primary: var(--bs-primary, #2f6fed);
    --purchase-primary-dark: #1d4ed8;
    --purchase-border: #dfe6ef;
    --purchase-border-soft: #edf1f6;
    --purchase-text: #172033;
    --purchase-muted: #718096;

    width: 100%;
    margin-top: 1rem !important;
    overflow: visible;
    border: 1px solid var(--purchase-border);
    border-radius: 0.875rem;
    background: #ffffff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.055) !important;
  }

  .purchase-items-card :global(.card-body) {
    padding: 0;
  }

  .purchase-barcode-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }

  /* Header */

  .purchase-items-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 4.75rem;
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--purchase-border-soft);
    background: #ffffff;
  }

  .purchase-items-heading {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .purchase-items-heading__icon {
    display: inline-grid;
    flex: 0 0 2.5rem;
    width: 2.5rem;
    height: 2.5rem;
    place-items: center;
    border-radius: 0.625rem;
    background: #edf4ff;
    color: var(--purchase-primary);
    font-size: 1rem;
  }

  .purchase-items-heading__copy {
    min-width: 0;
  }

  .purchase-items-title {
    margin: 0;
    color: var(--purchase-text);
    font-size: 1rem;
    font-weight: 850;
    line-height: 1.3;
    letter-spacing: -0.015em;
  }

  .purchase-items-subtitle {
    margin: 0.15rem 0 0;
    color: var(--purchase-muted);
    font-size: 0.75rem;
    font-weight: 550;
  }

  .purchase-items-header__summary {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  .purchase-items-count {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 1.75rem;
    padding-inline: 0.6rem;
    border: 1px solid #dbe7fb;
    border-radius: 999px;
    background: #f4f8ff;
    color: #526783;
    font-size: 0.7rem;
    font-weight: 750;
  }

  .purchase-items-header-total {
    display: inline-flex;
    align-items: baseline;
    gap: 0.3rem;
    color: var(--purchase-text);
    font-size: 1.05rem;
    font-weight: 900;
  }

  .purchase-items-header-total small {
    color: var(--purchase-muted);
    font-size: 0.68rem;
    font-weight: 750;
  }

  /* Entry toolbar */

  .purchase-items-entry {
    position: relative;
    z-index: 20;
    display: grid;
    grid-template-columns:
      minmax(18rem, 1fr)
      minmax(8rem, 0.28fr)
      minmax(10rem, 0.36fr)
      auto;
    gap: 0.5rem;
    align-items: start;
    margin: 0;
    padding: 0.5rem 0.75rem 0.625rem;
    border-bottom: 1px solid var(--purchase-border-soft);
    background: #fbfcfe;
  }

  .purchase-entry-field {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    margin: 0;
  }

  .purchase-entry-field--product {
    align-self: stretch;
  }

  .purchase-entry-label {
    display: none;
  }

  .purchase-product-search,
  .purchase-entry-control {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    height: 2.375rem;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .purchase-product-search:hover,
  .purchase-entry-control:hover {
    border-color: #bdcadd;
  }

  .purchase-product-search:focus-within,
  .purchase-entry-control:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .purchase-product-search > i,
  .purchase-entry-control > i:first-child {
    flex: 0 0 2.35rem;
    width: 2.35rem;
    color: #8a99ad;
    text-align: center;
    pointer-events: none;
  }

  .purchase-product-search input,
  .purchase-entry-control input,
  .purchase-entry-control select {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.82rem;
    font-weight: 600;
    text-align: start;
  }

  .purchase-entry-control select {
    padding-inline-end: 2rem;
    appearance: none;
    cursor: pointer;
  }

  .purchase-product-search input::placeholder,
  .purchase-entry-control input::placeholder {
    color: #9aa7b8;
    font-weight: 500;
  }

  .purchase-search-clear {
    display: inline-grid;
    flex: 0 0 1.8rem;
    width: 1.8rem;
    height: 1.8rem;
    margin-inline-end: 0.35rem;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    color: #94a3b8;
    font-size: 0.65rem;
    cursor: pointer;
  }

  .purchase-search-clear:hover {
    background: #f1f5f9;
    color: #475569;
  }

  .purchase-entry-chevron {
    position: absolute;
    inset-inline-end: 0.75rem;
    color: #8795a8 !important;
    font-size: 0.6rem;
    pointer-events: none;
  }

  .purchase-entry-control--price > span {
    display: inline-flex;
    align-items: center;
    align-self: stretch;
    padding-inline: 0.7rem;
    border-inline-start: 1px solid #e2e8f0;
    color: #64748b;
    background: #f8fafc;
    font-size: 0.7rem;
    font-weight: 750;
    white-space: nowrap;
  }

  .purchase-search-add-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    min-width: 7.5rem;
    height: 2.375rem;
    padding-inline: 1rem;
    border: 0;
    border-radius: 0.625rem;
    background: var(--purchase-primary);
    color: #ffffff;
    font-size: 0.78rem;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: none;
    transition:
      background 0.15s ease,
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .purchase-search-add-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    background: var(--purchase-primary-dark);
    box-shadow: none;
  }

  .purchase-search-add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }

  .purchase-selected-stock {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 1.15rem;
    margin-top: 0.22rem;
    color: #62806f;
    font-size: 0.67rem;
    font-weight: 600;
  }

  .purchase-selected-stock.is-empty {
    color: #dc2626;
  }

  /* Dropdown */

  .purchase-items-dropdown {
    overflow-x: hidden;
    overflow-y: auto;
    max-height: 20rem;
    padding: 0.3rem;
    border: 1px solid #dce4ef;
    border-radius: 0.75rem;
    background: #ffffff;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.16);
  }

  .purchase-product-option {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    width: 100%;
    min-height: 3.2rem;
    padding: 0.45rem 0.55rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--purchase-text);
    text-align: start;
    cursor: pointer;
  }

  .purchase-product-option:hover {
    background: #f0f6ff;
  }

  .purchase-product-option__icon {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #edf4ff;
    color: var(--purchase-primary);
  }

  .purchase-product-option__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.08rem;
  }

  .purchase-product-option__copy strong {
    overflow: hidden;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-product-option__copy small {
    overflow: hidden;
    color: var(--purchase-muted);
    font-size: 0.65rem;
    font-weight: 550;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-product-option__stock {
    display: grid;
    flex-shrink: 0;
    gap: 0.05rem;
    color: #526176;
    text-align: end;
  }

  .purchase-product-option__stock small {
    color: #94a3b8;
    font-size: 0.58rem;
    font-weight: 650;
  }

  .purchase-product-option__stock strong {
    font-size: 0.72rem;
    font-weight: 800;
  }

  /* Table */

  .purchase-items-table-scroll {
    width: 100%;
    max-width: 100%;
    min-height: 11rem;
    overflow-x: auto !important;
    overflow-y: visible;
    background: #ffffff;
    scrollbar-width: thin;
    scrollbar-color: #b9c5d5 transparent;
  }

  .purchase-items-table-scroll::-webkit-scrollbar {
    height: 0.45rem;
  }

  .purchase-items-table-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .purchase-items-table-scroll::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: #b9c5d5;
  }

  .purchase-items-table-scroll::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }

  .purchase-items-table {
    width: 100%;
    min-width: 68rem;
    margin: 0;
    border: 0;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: auto;
    color: #42516a;
  }

  .purchase-items-table thead th {
    position: sticky;
    top: 0;
    z-index: 4;
    height: 2.875rem;
    padding: 0.55rem 0.625rem;
    border: 0;
    border-bottom: 1px solid #dfe5ed;
    background: #f7f9fc;
    color: #67768a;
    font-size: 0.68rem;
    font-weight: 850;
    line-height: 1.2;
    text-align: center;
    vertical-align: middle;
    white-space: nowrap;
  }
  .purchase-items-table thead th:first-child {
    text-align: start;
  }

  .purchase-items-table tbody tr {
    height: 4.25rem;
    background: #ffffff;
    transition: background 0.12s ease;
  }

  .purchase-items-table tbody tr:nth-child(even) {
    background: #fbfcfe;
  }

  .purchase-items-table tbody tr:hover {
    background: #f4f8ff;
  }

  .purchase-items-table tbody td {
    height: 4.25rem;
    padding: 0.45rem 0.5rem;
    border: 0;
    border-bottom: 1px solid #e9eef5;
    background: transparent;
    color: #46566d;
    font-size: 0.74rem;
    text-align: center;
    vertical-align: middle;
  }

  /* Product column */

  .purchase-item-col-product {
    width: 15rem;
    min-width: 15rem;

  }

  .purchase-item-product-cell {
    position: sticky;
    inset-inline-start: 0;
    z-index: 2;
    background: #ffffff !important;
    box-shadow: 1px 0 0 #e9eef5;
  }

  .purchase-items-table tbody tr:nth-child(even) .purchase-item-product-cell {
    background: #fbfcfe !important;
  }

  .purchase-items-table tbody tr:hover .purchase-item-product-cell {
    background: #f4f8ff !important;
  }

  .purchase-items-table thead .purchase-item-col-product {
    inset-inline-start: 0;
    z-index: 6;
    background: #fbfcfe;
    box-shadow: 1px 0 0 #dfe5ed;
  }

  .purchase-item-product {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }

  .purchase-item-number {
    display: inline-grid;
    flex: 0 0 1.6rem;
    width: 1.6rem;
    height: 1.6rem;
    place-items: center;
    border-radius: 0.4rem;
    background: #f0f3f8;
    color: #7b899d;
    font-size: 0.65rem;
    font-weight: 800;
  }

  .purchase-item-product-icon {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #edf4ff;
    color: var(--purchase-primary);
    font-size: 0.85rem;
  }

  .purchase-item-product-copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.1rem;
    text-align: start;
  }

  .purchase-item-product-name {
    overflow: hidden;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 850;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-item-product-copy small {
    overflow: hidden;
    color: #8491a4;
    font-size: 0.63rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* General editable field */

  .purchase-item-field {
    display: flex;
    align-items: stretch;
    width: 100%;
    min-width: 6rem;
    height: 2.25rem;
    overflow: hidden;
    border: 1px solid #dbe3ee;
    border-radius: 0.5rem;
    background: #ffffff;
    box-shadow: none;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .purchase-item-field:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.08);
  }

  .purchase-item-field > input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 2.5rem;
    height: 100%;
    padding: 0 0.45rem;
    border: 0;
    border-radius: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.73rem;
    font-weight: 700;
    text-align: center;
    box-shadow: none;
  }

  .purchase-item-field > input:disabled {
    background: #f8fafc;
    color: #64748b;
  }

  .purchase-item-field--with-suffix {
    min-width: 7rem;
  }

  .purchase-item-readonly-value {
    display: inline-flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    min-width: 3rem;
    padding-inline: 0.4rem;
    color: #26364b;
    font-size: 0.73rem;
    font-weight: 750;
  }

  .purchase-item-suffix {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    min-width: 2.75rem;
    padding: 0 0.4rem;
    border-inline-start: 1px solid #e3e8ef;
    background: #f7f9fc;
    color: #718096;
    font-size: 0.62rem;
    font-weight: 750;
    white-space: nowrap;
  }

  .purchase-item-toggle {
    display: inline-grid;
    flex: 0 0 2.15rem;
    width: 2.15rem;
    min-width: 2.15rem;
    height: 100%;
    padding: 0;
    place-items: center;
    border: 0;
    border-inline-end: 1px solid #e3e8ef;
    border-radius: 0;
    background: #f7f9fc;
    color: #64748b;
    font-size: 0.7rem;
    cursor: pointer;
    box-shadow: none;
  }

  .purchase-item-toggle:hover {
    background: #edf4ff;
    color: var(--purchase-primary);
  }

  .purchase-item-toggle.is-active {
    background: #fff7df;
    color: #b7791f;
  }

  .purchase-item-sell-field,
  .purchase-item-discount-field {
    min-width: 11rem;
  }

  .purchase-item-percent-input {
    max-width: 3.5rem;
    border-inline-end: 1px solid #e3e8ef !important;
  }

  .purchase-item-discount-suffix {
    min-width: 4.75rem;
  }

  /* Heaviness */

  .purchase-item-col-heaviness {
    width: 19rem;
    min-width: 19rem;
  }

  .purchase-item-heaviness {
    display: grid;
    grid-template-columns: repeat(3, minmax(5rem, 1fr));
    gap: 0.35rem;
    width: 100%;
  }

  .purchase-item-heaviness label {
    display: grid;
    min-width: 0;
    overflow: hidden;
    border: 1px solid #dbe3ee;
    border-radius: 0.5rem;
    background: #ffffff;
  }

  .purchase-item-heaviness label:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.07);
  }

  .purchase-item-heaviness label span {
    display: block;
    padding: 0.2rem 0.3rem;
    border-bottom: 1px solid #e7ebf1;
    background: #f7f9fc;
    color: #7b8799;
    font-size: 0.55rem;
    font-weight: 750;
    text-align: center;
    white-space: nowrap;
  }

  .purchase-item-heaviness label input {
    width: 100%;
    min-width: 0;
    height: 1.8rem;
    padding-inline: 0.35rem;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.7rem;
    font-weight: 700;
    text-align: center;
  }

  /* Column widths */

  .purchase-item-col-batch {
    width: 7rem;
    min-width: 7rem;
  }

  .purchase-item-col-date {
    width: 9rem;
    min-width: 9rem;
  }

  .purchase-item-col-quantity {
    width: 7.5rem;
    min-width: 7.5rem;
  }

  .purchase-item-col-price {
    width: 8.5rem;
    min-width: 8.5rem;
  }

  .purchase-item-col-sell-price {
    width: 12rem;
    min-width: 12rem;
  }

  .purchase-item-col-discount {
    width: 12rem;
    min-width: 12rem;
  }

  .purchase-item-col-subtotal {
    width: 8rem;
    min-width: 8rem;
  }

  .purchase-item-col-actions {
    width: 4rem;
    min-width: 4rem;
  }

  /* Datepicker */

  .purchase-item-datepicker {
    display: flex;
    width: 100%;
    height: 2.25rem;
    min-height: 2.25rem;
    overflow: hidden;
    border: 1px solid #dbe3ee;
    border-radius: 0.5rem;
    background: #ffffff;
  }

  .purchase-item-datepicker:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.08);
  }

  .purchase-item-datepicker :global(.date-picker-control) {
    width: 100%;
    min-width: 0;
    height: 100%;
    border: 0 !important;
    box-shadow: none !important;
  }

  .purchase-item-datepicker :global(.persian-date-text) {
    display: none !important;
  }

  .purchase-item-datepicker :global(.gregorian-date-text) {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    padding-inline: 0.4rem;
    border: 0 !important;
    background: transparent !important;
    font-size: 0.65rem;
  }

  .purchase-item-datepicker :global(.date-picker-icon) {
    flex: 0 0 2rem;
    width: 2rem;
    min-width: 2rem;
    height: 100%;
    border: 0 !important;
    border-inline-start: 1px solid #e3e8ef !important;
    background: #f7f9fc !important;
  }

  /* Subtotal and actions */

  .purchase-item-money {
    display: inline-flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.3rem;
    width: 100%;
    white-space: nowrap;
  }

  .purchase-item-money strong {
    color: #172033;
    font-size: 0.8rem;
    font-weight: 900;
  }

  .purchase-item-money small {
    color: #718096;
    font-size: 0.62rem;
    font-weight: 750;
  }

  .purchase-item-actions {
    text-align: center !important;
  }

  .purchase-item-delete {
    display: inline-grid;
    width: 2rem;
    height: 2rem;
    padding: 0;
    place-items: center;
    border: 1px solid #f3cccc;
    border-radius: 0.5rem;
    background: #fff7f7;
    color: #d64545;
    font-size: 0.75rem;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      transform 0.15s ease;
  }

  .purchase-item-delete:hover {
    transform: translateY(-1px);
    border-color: #efaaaa;
    background: #feecec;
  }

  /* Empty state */

  .purchase-items-empty-row,
  .purchase-items-empty-row:hover {
    height: auto !important;
    background: #ffffff !important;
  }

  .purchase-items-empty-row td {
    height: auto !important;
    padding: 0 !important;
  }

  .purchase-items-empty {
    display: grid;
    min-height: 12rem;
    place-items: center;
    align-content: center;
    gap: 0.35rem;
    padding: 2rem;
    text-align: center;
  }

  .purchase-items-empty > span {
    display: inline-grid;
    width: 3rem;
    height: 3rem;
    place-items: center;
    border-radius: 0.75rem;
    background: #edf4ff;
    color: var(--purchase-primary);
    font-size: 1.2rem;
  }

  .purchase-items-empty strong {
    margin-top: 0.3rem;
    color: #334155;
    font-size: 0.85rem;
    font-weight: 800;
  }

  .purchase-items-empty p {
    margin: 0;
    color: #8491a4;
    font-size: 0.72rem;
  }

  /* Footer */

  .purchase-items-total-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 4rem;
    margin: 0;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--purchase-border-soft);
    background: #fbfcfe;
  }

  .purchase-items-clear-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.1rem;
    padding-inline: 0.7rem;
    border: 1px solid #f1d0d0;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #cf4b4b;
    font-size: 0.68rem;
    font-weight: 750;
    cursor: pointer;
  }

  .purchase-items-clear-btn:hover {
    border-color: #edb4b4;
    background: #fff5f5;
  }

  .purchase-items-grand-total {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
    white-space: nowrap;
  }

  .purchase-items-grand-total > span {
    color: #64748b;
    font-size: 0.75rem;
    font-weight: 750;
  }

  .purchase-items-grand-total strong {
    color: var(--purchase-primary);
    font-size: 1.05rem;
    font-weight: 900;
  }

  .purchase-items-grand-total small {
    color: #718096;
    font-size: 0.68rem;
    font-weight: 750;
  }

  /* RTL */

  :global(html[dir='rtl']) .purchase-item-product-cell {
    box-shadow: -1px 0 0 #e9eef5;
  }

  :global(html[dir='rtl']) .purchase-items-table thead .purchase-item-col-product {
    box-shadow: -1px 0 0 #dfe5ed;
  }

  /* Responsive */

  @media (max-width: 1200px) {
    .purchase-items-entry {
      grid-template-columns: minmax(16rem, 1fr) 8rem 10rem;
    }

    .purchase-search-add-btn {
      grid-column: 1 / -1;
      width: 100%;
    }
  }

  @media (max-width: 767.98px) {
    .purchase-items-card {
      border-radius: 0.75rem;
    }

    .purchase-items-header {
      align-items: flex-start;
      flex-direction: column;
      padding: 0.8rem;
    }

    .purchase-items-header__summary {
      justify-content: space-between;
      width: 100%;
    }

    .purchase-items-entry {
      grid-template-columns: 1fr;
      padding: 0.8rem;
    }

    .purchase-search-add-btn {
      grid-column: auto;
    }

    .purchase-items-table {
      min-width: 62rem;
    }

    .purchase-items-table-scroll {
      min-height: 10rem;
    }

    .purchase-items-total-row {
      padding-inline: 0.8rem;
    }
  }

  @media (max-width: 420px) {
    .purchase-items-heading__icon {
      display: none;
    }

    .purchase-items-header__summary {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.35rem;
    }

    .purchase-items-total-row {
      align-items: stretch;
      flex-direction: column-reverse;
    }

    .purchase-items-clear-btn {
      width: 100%;
    }
  }

  /* Auto-size editable controls by their current value. */
  .purchase-items-table .purchase-item-field {
    display: inline-flex;
    width: fit-content;
    min-width: 0;
    max-width: none;
    vertical-align: middle;
  }

  .purchase-items-table .purchase-item-field--with-suffix,
  .purchase-items-table .purchase-item-sell-field,
  .purchase-items-table .purchase-item-discount-field {
    min-width: 0;
  }

  .purchase-items-table .purchase-item-field > input,
  .purchase-items-table .purchase-item-heaviness input {
    field-sizing: content;
    inline-size: auto;
    width: auto;
    min-inline-size: 3ch;
    min-width: 3ch;
    max-inline-size: none;
    max-width: none;
    flex: 0 0 auto;
  }

  .purchase-items-table .purchase-item-percent-input {
    max-width: none;
  }


  /* Auto-size the date-picker control to its displayed date value. */
  .purchase-items-table .purchase-item-datepicker {
    display: inline-flex;
    width: fit-content;
    min-width: 0;
    max-width: none;
    vertical-align: middle;
  }

  .purchase-items-table .purchase-item-datepicker :global(.date-picker-control),
  .purchase-items-table .purchase-item-datepicker :global(.app-date-field),
  .purchase-items-table .purchase-item-datepicker :global(.pdp-container) {
    display: inline-flex;
    width: fit-content;
    min-width: 0;
    max-width: none;
    flex: 0 0 auto;
  }

  .purchase-items-table .purchase-item-datepicker :global(input),
  .purchase-items-table .purchase-item-datepicker :global(.gregorian-date-text) {
    field-sizing: content;
    inline-size: auto !important;
    width: auto !important;
    min-inline-size: 10ch;
    min-width: 10ch !important;
    max-inline-size: none;
    max-width: none !important;
    flex: 0 0 auto !important;
  }


  /* Keep value columns tight around their controls.
     Extra table space is assigned to the Product column only. */
  .purchase-items-table .purchase-item-col-product {
    width: auto;
    min-width: 15rem;
  }

  .purchase-items-table .purchase-item-col-batch,
  .purchase-items-table .purchase-item-col-date,
  .purchase-items-table .purchase-item-col-quantity,
  .purchase-items-table .purchase-item-col-price,
  .purchase-items-table .purchase-item-col-sell-price,
  .purchase-items-table .purchase-item-col-discount,
  .purchase-items-table .purchase-item-col-subtotal,
  .purchase-items-table .purchase-item-col-actions {
    width: 1%;
    min-width: 0;
    white-space: nowrap;
  }

  .purchase-items-table tbody td.purchase-item-col-batch,
  .purchase-items-table tbody td.purchase-item-col-date,
  .purchase-items-table tbody td.purchase-item-col-quantity,
  .purchase-items-table tbody td.purchase-item-col-price,
  .purchase-items-table tbody td.purchase-item-col-sell-price,
  .purchase-items-table tbody td.purchase-item-col-discount,
  .purchase-items-table tbody td.purchase-item-col-subtotal,
  .purchase-items-table tbody td.purchase-item-col-actions {
    padding-inline: 0.25rem;
  }

</style>

