<script>
  import { db } from '../../db.js';
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import ProductModal from '../products/ProductModal.svelte';
  import { calculateProductStock } from '../stocktransactions/calculateStock.js';
  import Swal from 'sweetalert2';
  import FilterSelect from '../../components/common/FilterSelect.svelte';

  import { toast } from '../../ToastUI/toast.js';
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let items = [];
  export let currency = '';
  export let warehouse_id = '';
  export let selected_account_id = '';

  $: enable_stock_minus = $settings_all.find((s) => s.key === 'enable_stock_minus')?.value == 1;
  $: enable_duplicate_product = $settings_all.find((s) => s.key === 'enable_duplicate_product')?.value == 1;
  $: enable_show_buy_price = $settings_all.find((s) => s.key === 'enable_show_buy_price')?.value == 1;
  $: enable_show_latest_sale_price = $settings_all.find((s) => s.key === 'enable_show_latest_sale_price')?.value == 1;
  $: enable_show_buy_price_and_latest_sale_price_in_item =
    $settings_all.find((s) => s.key === 'enable_show_buy_price_and_latest_sale_price_in_item')?.value == 1;

  $: bill_max_items = $settings_all.find((s) => s.key === 'bill_max_items')?.value || 100;

  const dispatch = createEventDispatcher();

  let products = [];
  let search = '';
  let showDropdown = false;

  let quantity = 1;
  let unit_price = 0;
  let unit_currency = '';
  let unit = 0;
  let selectedProduct = null;

  let barcodeInput = '';

  // Reference to the modal
  let productModal;

  let categories = [];
  let units = [];
  let currencies = [];
  let warehouses = [];
  let warehouse_products = [];
  let stock = 0;

  async function loadAll() {
    categories = await db.product_categories.where('status').equals(1).toArray();
    units = await db.product_units.where('status').equals(1).toArray();
    currencies = await db.currencies.where('status').equals(1).toArray();
    warehouses = await db.warehouses.where('status').equals(1).toArray();
    warehouse_products = await db.warehouse_products.where('status').equals(1).toArray();
  }

  onMount(async () => {
    await loadAll();

    products = await db.products.where('status').equals(1).toArray();
    products = products.filter((product) =>
      product.product_status
        ? product.product_status === 'active'
        : Number(product.status) === 1,
    );

    refreshAvailableProducts();
  });

  // Build lookup map
  $: unitMap = Object.fromEntries(units.map((u) => [u.id, u]));

  // Get full unit chain recursively
  function getUnitHierarchy(unitId) {
    const result = [];

    function traverse(id, multiplier = 1) {
      const unit = unitMap[id];
      if (!unit) return;

      result.push({
        ...unit,
        multiplier,
      });

      if (unit.subunit_id) {
        traverse(unit.subunit_id, multiplier / (unit.subunit_multiple || 1));
      }
    }

    traverse(unitId);
    return result;
  }
  function changeUnit(item, unitId) {
    unitId = Number(unitId);

    const selectedUnit = item.availableUnits?.find((u) => u.id === unitId);
    if (!selectedUnit) return;

    item.product_unit_id = unitId;
    item.calculated_price = item.unit_price * selectedUnit.multiplier || item.unit_price; // adjust price if needed
    item.subtotal = item.quantity * item.calculated_price;

    recalc(items.indexOf(item));
    items = [...items];
    dispatch('update', { items });
  }

  let filteredProducts = [];

  let latestPrice = null;
  let previousWarehouseId = null;

  function isProductActive(product) {
    if (!product) return false;

    if (
      product.product_status !== undefined &&
      product.product_status !== null
    ) {
      return product.product_status === 'active';
    }

    return (
      product.status === undefined ||
      product.status === null ||
      Number(product.status) === 1
    );
  }

  function productMatchesSearch(product, searchValue = '') {
    const term = String(searchValue || '').trim().toLowerCase();

    if (!term) return true;

    return [
      product.name,
      product.code,
      product.barcode,
      product.sku,
      product.product_code,
    ].some((value) =>
      String(value || '').toLowerCase().includes(term),
    );
  }

  function getProductStock(productId) {
    if (!warehouse_id || !productId) return 0;

    return warehouse_products
      .filter((warehouseProduct) => {
        const active =
          warehouseProduct.status === undefined ||
          warehouseProduct.status === null ||
          Number(warehouseProduct.status) === 1;

        return (
          active &&
          Number(warehouseProduct.product_id) === Number(productId) &&
          Number(warehouseProduct.warehouse_id) === Number(warehouse_id)
        );
      })
      .reduce((sum, warehouseProduct) => {
        const rowQuantity = Number(
          warehouseProduct.quantity ??
            warehouseProduct.current_quantity ??
            warehouseProduct.available_quantity ??
            warehouseProduct.stock ??
            0,
        );

        return sum + (Number.isFinite(rowQuantity) ? rowQuantity : 0);
      }, 0);
  }

  function getAvailableProducts(searchValue = '') {
    if (!warehouse_id) return [];

    return products
      .filter((product) => {
        if (!isProductActive(product)) return false;
        if (!productMatchesSearch(product, searchValue)) return false;

        // Services do not use warehouse stock.
        if (product.type === 'service') return true;

        return getProductStock(product.id) > 0;
      })
      .map((product) => ({
        ...product,
        warehouse_stock:
          product.type === 'service'
            ? null
            : getProductStock(product.id),
      }));
  }

  function refreshAvailableProducts() {
    filteredProducts = getAvailableProducts(search);
  }

  async function findLatestSalesPrice(productId) {
    const customerSales = await db.sales.where('account_id').equals(selected_account_id).reverse().toArray();

    for (const sale of customerSales) {
      if (sale.status !== 1) continue;

      const item = await db.sale_items
        .where({
          sale_id: sale.id,
          product_id: productId,
          status: 1,
        })
        .first();

      if (item) {
        latestPrice = {
          price: item.unit_price,
          currency: item.currency,
        };
        return latestPrice;
      }
    }
    latestPrice = null;
    return latestPrice;
  }

  async function selectProduct(product) {
    if (!product) return false;

    if (!warehouse_id) {
      toast.warning(t('Please select a warehouse first.'));
      return false;
    }

    showProductDropdown = false;

    if (product.type !== 'service') {
      try {
        await calculateProductStock(Number(product.id));
      } catch (error) {
        console.warn('Failed to calculate product stock:', error);
      }

      warehouse_products = await db.warehouse_products
        .where('status')
        .equals(1)
        .toArray();

      const availableStock = getProductStock(product.id);

      if (availableStock <= 0) {
        selectedProduct = null;
        stock = 0;
        search = '';
        refreshAvailableProducts();

        toast.error(
          t('Product is out of stock in the selected warehouse.'),
        );

        return false;
      }

      stock = availableStock;
    } else {
      stock = 0;
    }

    const unitHierarchy = getUnitHierarchy(product.product_unit_id);

    selectedProduct = {
      ...product,
      availableUnits: unitHierarchy,
      warehouse_stock:
        product.type === 'service'
          ? null
          : getProductStock(product.id),
    };

    search = product.name;
    unit_price = Number(product.sell_price) || 0;
    unit_currency =
      product.sell_currency || currency?.code || currency || 'AFN';
    unit = product.product_unit_id;

    if (enable_show_latest_sale_price) {
      latestPrice = null;
      await findLatestSalesPrice(product.id);
    }

    return true;
  }

  function addItem() {
    if (items.length >= bill_max_items) {
      toast.warning(
        t('Maximum Items Reached'),
        t('You have added more than ' + bill_max_items + ' items to the bill.'),
      );
      // return;
    }
    if (!selectedProduct) return;

    const existingIndex = items.findIndex((i) => i.product_id === selectedProduct.id);

    if (existingIndex !== -1 && !enable_duplicate_product) {
      items[existingIndex].quantity += Number(quantity);
      items[existingIndex].subtotal = items[existingIndex].quantity * items[existingIndex].unit_price;
    } else {
      items.push({
        type: selectedProduct.type || 'good',
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        product_unit_id: selectedProduct.product_unit_id,
        quantity: Number(quantity),
        unit_price: Number(unit_price),
        latestPrice: latestPrice,
        buy_price: selectedProduct.buy_price,
        buy_price_currency: selectedProduct.buy_currency || currency.code,
        calculated_price: Number(unit_price),
        currency: selectedProduct.sell_currency || currency.code,
        subtotal: Number(quantity) * Number(unit_price),
        availableUnits: selectedProduct.availableUnits,
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
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      }
    }, 100);
  }
  function removeItem(index) {
    items.splice(index, 1);
    items = [...items];
    dispatch('update', { items });
  }

  function getCalculatedStock(item) {
    if (enable_duplicate_product) {
      const totalQuantity = items
        .filter((i) => i.product_id === item.product_id)
        .reduce((sum, i) => {
          const selectedUnit = i.availableUnits?.find((u) => u.id === i.product_unit_id);
          const multiplier = selectedUnit?.multiplier || 1;
          return sum + i.quantity * multiplier;
        }, 0);
      return Math.floor(
        (getProductStock(item.product_id) - totalQuantity) /
          (item.availableUnits?.find((u) => u.id === item.product_unit_id)?.multiplier || 1),
      );
    }
    const selectedUnit = item.availableUnits?.find((u) => u.id === item.product_unit_id);
    const multiplier = selectedUnit?.multiplier || 1;
    return Math.floor(getProductStock(item.product_id) / multiplier);
  }

  function recalc(index) {
    const item = items[index];

    // Find the selected unit
    const selectedUnit = item.availableUnits?.find((u) => u.id === item.product_unit_id);
    const multiplier = selectedUnit?.multiplier || 1;

    // Get stock in the warehouse adjusted for selected unit
    let stock = Math.floor(getProductStock(item.product_id) / multiplier);

    // Adjust quantity if it exceeds available stock

    if (enable_duplicate_product) {
      const totalQuantity = items
        .filter((i) => i.product_id === item.product_id)
        .reduce((sum, i) => {
          const selectedUnit = i.availableUnits?.find((u) => u.id === i.product_unit_id);
          const multiplier = selectedUnit?.multiplier || 1;
          return sum + i.quantity * multiplier;
        }, 0);
      stock = Math.floor((getProductStock(item.product_id) - totalQuantity + item.quantity * multiplier) / multiplier);
    }

    if (!enable_stock_minus && stock < item.quantity && item.type !== 'service') {
      item.quantity = stock;
    }

    // Calculate subtotal using multiplier
    item.subtotal = Number(item.quantity) * (Number(item.calculated_price) || 0);

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
    if (!warehouse_id) {
      toast.warning(t('Please select a warehouse first.'));
      return;
    }

    const product = await db.products
      .where('code')
      .equals(code)
      .and(
        (item) =>
          (item.product_status
            ? item.product_status === 'active'
            : true) &&
          Number(item.status) === 1,
      )
      .first();

    if (!product) return;

    const selected = await selectProduct(product);

    if (selected) {
      addItem();
    }
  }

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    let toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (typeof toCurrencyCode === 'object') {
      toCurrency = toCurrencyCode;
    }
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = fromCurrency.exchangeRate || 1;
    const toRate = toCurrency.exchangeRate || 1;
    return (amount / toRate) * fromRate;
  }
  $: total = items.reduce((s, i) => {
    if (i.currency && currency && i.currency !== currency.code) {
      let exchangeRateValue = exchangeRate(i.subtotal, i.currency, currency);
      console.log(
        `Converting ${i.subtotal} from ${i.currency} to ${currency.code} for total calculation - exchange rate value: ${exchangeRateValue}`,
      );
      return s + exchangeRateValue;
    } else {
      return s + i.subtotal;
    }
  }, 0);

  let search_input = null;

  let showProductDropdown = false;
  let productDropdownStyle = '';

  function portal(node) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  function positionProductDropdown() {
    if (!search_input) return;
    const rect = search_input.closest('.col-md-6')?.getBoundingClientRect() || search_input.getBoundingClientRect();
    const width = rect.width;
    const maxHeight = Math.min(250, window.innerHeight * .45);
    const openUp = window.innerHeight - rect.bottom < maxHeight + 10;
    productDropdownStyle = openUp
      ? `position:fixed;left:${rect.left}px;width:${width}px;bottom:${window.innerHeight - rect.top + 5}px;top:auto;max-height:${maxHeight}px;overflow:auto;z-index:100000;`
      : `position:fixed;left:${rect.left}px;width:${width}px;top:${rect.bottom + 5}px;bottom:auto;max-height:${maxHeight}px;overflow:auto;z-index:100000;`;
  }

  $: {
    // Explicit dependencies so the list refreshes after Dexie reloads.
    products;
    warehouse_products;
    search;

    const currentWarehouseId = warehouse_id
      ? Number(warehouse_id)
      : null;

    if (currentWarehouseId !== previousWarehouseId) {
      previousWarehouseId = currentWarehouseId;

      search = '';
      selectedProduct = null;
      stock = 0;
      quantity = 1;
      unit_price = 0;
      unit_currency = '';
      unit = 0;
      latestPrice = null;
      showProductDropdown = false;
    }

    filteredProducts = getAvailableProducts(search);

    if (
      selectedProduct &&
      selectedProduct.type !== 'service' &&
      getProductStock(selectedProduct.id) <= 0
    ) {
      selectedProduct = null;
      search = '';
      stock = 0;
    }
  }

  $: if (showProductDropdown) {
    tick().then(positionProductDropdown);
  }
</script>
<div class="card shadow-2 mt-4 purchase-items-card">
  <div class="card-body">
    <div class="d-flex align-items-center mb-3">
      <h5 class="mb-0 purchase-items-title">{t('Sale Items')}</h5>
    </div>

    <input type="text" class="position-absolute opacity-0" bind:value={barcodeInput} on:keydown={handleBarcode} />

    <div class="row g-3 mb-4 purchase-items-add-row">
      <div class="col-md-6 position-relative">
        <div class="input-group input-group-sm purchase-unified-input-group">
          <span class="input-group-text sale-product-search-icon" aria-hidden="true">
            <i class="bi bi-search"></i>
          </span>
          <input
            type="text"
            class="form-control form-control-sm"
            id="form_product_search"
            bind:this={search_input}
            bind:value={search}
            disabled={!warehouse_id}
            on:input={() => {
              showProductDropdown = true;
              refreshAvailableProducts();

              if (!search.trim()) {
                selectedProduct = null;
              }
            }}
            on:focus={() => {
              if (!warehouse_id) return;

              showProductDropdown = true;
              refreshAvailableProducts();
            }}
            on:blur={() =>
              setTimeout(() => {
                showProductDropdown = false;
              }, 150)}
            placeholder={warehouse_id
              ? t('Search product by name, barcode, or SKU...')
              : t('Select Warehouse')}
            autocomplete="off" />

          <button
            class="btn btn-info btn-sm purchase-input-addon-btn purchase-product-quick-btn"
            type="button"
            title={t('Add')}
            aria-label={t('Add')}
            on:click={() => productModal.openModal()}>
            <i class="bi bi-plus-lg" aria-hidden="true"></i><span class="purchase-product-quick-btn__text">{t('Add')}</span>
          </button>
        </div>

        {#if showProductDropdown && filteredProducts.length > 0}
          <div
            use:portal
            class="list-group shadow purchase-items-dropdown"
            style={productDropdownStyle}>
            {#each filteredProducts as prod (prod.id)}
              <button
                type="button"
                class="list-group-item list-group-item-action"
                on:mousedown={async () => {
                  await selectProduct(prod);
                  showProductDropdown = false;
                }}>
                <div class="sale-product-option">
                  <span class="sale-product-option__copy">
                    <strong>{prod.name}</strong>

                    <small>
                      {categories.find(
                        (category) => category.id === prod.category_id,
                      )?.name || t('Category')}
                    </small>
                  </span>

                  {#if prod.type === 'service'}
                    <span class="sale-product-option__service">
                      <i class="bi bi-tools" aria-hidden="true"></i>
                      {t('Service')}
                    </span>
                  {:else}
                    <span
                      class="sale-product-option__stock"
                      title={t('Present in Warehouse')}>
                      <i class="bi bi-box-seam" aria-hidden="true"></i>

                      <strong dir="ltr">
                        {Number(
                          prod.warehouse_stock || 0,
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        })}
                      </strong>

                      <small>
                        {units.find(
                          (item) => item.id === prod.product_unit_id,
                        )?.name || t('Unit')}
                      </small>
                    </span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {/if}

        {#if
          showProductDropdown &&
          warehouse_id &&
          search.trim() &&
          filteredProducts.length === 0}
          <div
            use:portal
            class="purchase-items-dropdown sale-product-empty"
            style={productDropdownStyle}>
            <span class="sale-product-empty__icon" aria-hidden="true">
              <i class="bi bi-box-seam"></i>
            </span>

            <strong>{t('No products available')}</strong>

            <small>
              {t('No stock is available in the selected warehouse.')}
            </small>
          </div>
        {/if}

        {#if selectedProduct}
          <div class="form-text mt-0">
            {#if enable_show_buy_price}
              {t('Buy Price')}: {selectedProduct.buy_price
                ? Number(selectedProduct.buy_price).toLocaleString(undefined, { maximumFractionDigits: 3 })
                : 0}
              {t(selectedProduct.buy_currency)}
            {/if}
            {#if enable_show_latest_sale_price && latestPrice}
              {#if enable_show_buy_price}|{/if}
              {t('Last Sold Price')}: {Number(latestPrice.price || 0).toLocaleString(undefined, {
                maximumFractionDigits: 3,
              })}
              {t(latestPrice.currency)}
            {/if}
          </div>
          {#if selectedProduct.type !== 'service'}
            <div class="form-text mt-0 {stock === 0 ? 'text-danger' : ''}">
              {t('Present in Warehouse')}:
              <span dir="ltr">{Number(stock || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
              {units.find((u) => u.id === unit)?.name || t('Unit')}
            </div>
          {/if}
        {/if}
      </div>

      <div class="col-md-2">
        <div class="input-group input-group-sm purchase-unified-input-group">
          <input
            type="number"
            class="form-control form-control-sm"
            bind:value={quantity}
            on:input={() => {
              if (!enable_stock_minus && quantity > stock && selectedProduct?.type !== 'service') quantity = stock;
            }}
            min="1" />
          <span class="input-group-text">{units.find((u) => u.id === unit)?.name || t('Unit')}</span>
        </div>
      </div>

      <div class="col-md-2">
        <div class="input-group input-group-sm purchase-unified-input-group">
          <input type="number" class="form-control form-control-sm" bind:value={unit_price} min="0" />
          <span class="input-group-text">{t(unit_currency)}</span>
        </div>
      </div>

      <div class="col-md-2 d-flex align-items-start">
        <button
          class="btn btn-primary btn-sm w-100"
          on:click={() => {
            if (quantity <= 0) {
              toast.error(t('Quantity must be greater than zero'));
              return;
            }
            if (enable_stock_minus || stock > 0 || selectedProduct?.type === 'service') {
              addItem();
            } else {
              Swal.fire({
                icon: 'error',
                title: t('Out of Stock'),
                text: t('Product is out of stock in the selected warehouse.'),
              });
            }
          }}>{t('Add Item')}</button>
      </div>
    </div>

    <div class="table-responsive">
      <table class="table table-hover align-middle purchase-items-table">
        <thead class="table-light">
          <tr>
            <th class="purchase-item-col-product">{t('Product')}</th>
            <th class="text-center purchase-item-col-quantity">{t('Quantity')}</th>
            <th class="text-center purchase-item-col-price">{t('Sell Price')}</th>
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
                    {#if item.type !== 'service'}
                      <small>
                        {t('Present in Warehouse')}:
                        {Number(getCalculatedStock(item) || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                        {units.find((u) => u.id === item.product_unit_id)?.name || t('Unit')}
                      </small>
                    {/if}
                  </span>
                </div>
              </td>
              <td class="text-center purchase-item-col-quantity">
                <div class="input-group input-group-sm purchase-unified-input-group purchase-item-cell-group">
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    bind:value={item.quantity}
                    on:input={() => recalc(index)} />
                  {#if item.availableUnits?.length > 1}
                    <FilterSelect compact value={item.product_unit_id}
                      label={t('Unit')} options={item.availableUnits.map((unit)=>({value:unit.id,label:unit.name}))}
                      on:change={(event)=>changeUnit(item,event.detail)} />
                  {:else}
                    <span class="input-group-text"
                      >{item.availableUnits?.[0]?.name || units.find((u) => u.id === item.product_unit_id)?.name || t('Unit')}</span>
                  {/if}
                </div>
              </td>
              <td class="text-center purchase-item-col-price">
                <div class="input-group input-group-sm purchase-unified-input-group purchase-item-cell-group">
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    bind:value={item.calculated_price}
                    on:input={() => recalc(index)} />
                  <span class="input-group-text">{t(item.currency)}</span>
                </div>
                {#if enable_show_buy_price_and_latest_sale_price_in_item}
                  <div class="purchase-item-stock">
                    {#if enable_show_buy_price}
                      {t('Buy Price')}: {Number(item.buy_price || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                      {t(item.buy_price_currency)}
                    {/if}
                    {#if enable_show_latest_sale_price && item.latestPrice}
                      <br />
                      {t('Last Sold Price')}:
                      <button
                        type="button"
                        class="btn btn-link p-0 purchase-item-stock-link"
                        on:click={() => {
                          item.calculated_price = Number(item.latestPrice.price || 0);
                          item.currency = item.latestPrice.currency;
                          recalc(index);
                        }}>
                        {Number(item.latestPrice.price || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        })}
                        {t(item.latestPrice.currency)}
                      </button>
                    {/if}
                  </div>
                {/if}
              </td>
              <td class="text-center purchase-item-col-subtotal">
                <div class="purchase-item-money">
                  {#if item.currency != currency?.code}
                    <strong>{exchangeRate(item.subtotal, item.currency, currency).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}</strong>
                    <small>{t(currency?.code)}</small>
                  {:else}
                    <strong>{Number(item.subtotal || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</strong>
                    <small>{t(item.currency)}</small>
                  {/if}
                </div>
              </td>
              <td class="text-center purchase-item-actions purchase-item-col-actions">
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

    <div class="text-end mt-3 purchase-items-total-row">
      <h5 class="mb-0">
        {t('Total')}:
        <span class="text-primary"
          >{total.toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(currency?.code)}</span>
      </h5>
    </div>
  </div>
</div>

<ProductModal
  bind:this={productModal}
  {categories}
  {units}
  {warehouses}
  type="sale"
  {warehouse_id}
  defaultCurrency="AFN"
  {warehouse_products}
  on:saved={async () => {
    products = await db.products.where('status').equals(1).toArray();

    products = products.filter((product) =>
      product.product_status
        ? product.product_status === 'active'
        : Number(product.status) === 1,
    );

    warehouse_products = await db.warehouse_products
      .where('status')
      .equals(1)
      .toArray();

    refreshAvailableProducts();

    const newProduct = products[products.length - 1];

    if (!newProduct) return;

    const availableStock =
      newProduct.type === 'service'
        ? null
        : getProductStock(newProduct.id);

    if (
      newProduct.type !== 'service' &&
      Number(availableStock || 0) <= 0
    ) {
      toast.warning(
        t('The new product has no stock in the selected warehouse.'),
      );
      return;
    }

    const availableUnits = getUnitHierarchy(
      newProduct.product_unit_id,
    );

    items.push({
      type: newProduct.type || 'good',
      product_id: newProduct.id,
      product_name: newProduct.name,
      product_unit_id: newProduct.product_unit_id,
      currency:
        newProduct.sell_currency ||
        currency?.code ||
        currency ||
        'AFN',
      quantity: 1,
      latestPrice: null,
      buy_price: newProduct.buy_price,
      buy_price_currency:
        newProduct.buy_currency ||
        currency?.code ||
        currency ||
        'AFN',
      unit_price: Number(newProduct.sell_price) || 0,
      calculated_price: Number(newProduct.sell_price) || 0,
      subtotal: Number(newProduct.sell_price) || 0,
      availableUnits,
      warehouse_stock: availableStock,
    });

    items = [...items];
    dispatch('update', { items });
  }} />

<style>
  .purchase-items-card {
    --sale-primary: var(--bs-primary, #2f6fed);
    --sale-primary-dark: #1d4ed8;
    --sale-border: #dfe6ef;
    --sale-border-soft: #edf1f6;
    --sale-text: #172033;
    --sale-muted: #718096;

    position: relative;
    z-index: 35;
    width: 100%;
    margin-top: 1rem !important;
    overflow: visible;
    border: 1px solid var(--sale-border);
    border-radius: 0.875rem;
    background: #ffffff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.055) !important;
  }

  .purchase-items-card :global(.card-body) {
    padding: 0;
    overflow: visible;
  }

  /* Sale Items heading — same visual language as Purchase Items. */
  .purchase-items-card :global(.card-body > .d-flex.align-items-center.mb-3) {
    display: flex !important;
    align-items: center !important;
    min-height: 4.75rem;
    margin: 0 !important;
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--sale-border-soft);
    background: #ffffff;
  }

  .purchase-items-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0;
    color: var(--sale-text);
    font-size: 1rem;
    font-weight: 850;
    line-height: 1.3;
    letter-spacing: -0.015em;
  }

  .purchase-items-title::before {
    content: '\F23D';
    display: inline-grid;
    flex: 0 0 2.5rem;
    width: 2.5rem;
    height: 2.5rem;
    place-items: center;
    border-radius: 0.625rem;
    background: #edf4ff;
    color: var(--sale-primary);
    font-family: 'bootstrap-icons';
    font-size: 1rem;
    font-weight: 400;
  }

  /* Hidden barcode field */
  .purchase-items-card > :global(.position-absolute.opacity-0),
  .purchase-items-card :global(input.position-absolute.opacity-0) {
    width: 1px;
    height: 1px;
    overflow: hidden;
    pointer-events: none;
  }

  /* Add-item row */
  .purchase-items-add-row {
    position: relative;
    z-index: 40;
    display: grid;
    grid-template-columns:
      minmax(18rem, 1fr)
      minmax(7.5rem, max-content)
      minmax(8.5rem, max-content)
      auto;
    align-items: start;
    gap: 0.5rem;
    margin: 0 !important;
    padding: 0.5rem 0.75rem 0.625rem;
    border-bottom: 1px solid var(--sale-border-soft);
    background: #fbfcfe;
  }

  .purchase-items-add-row > [class*='col-'] {
    width: auto;
    max-width: none;
    min-width: 0;
    padding: 0;
  }

  .purchase-items-add-row > :first-child {
    position: relative;
  }

  .purchase-items-add-row > :last-child {
    display: flex;
    align-items: flex-start !important;
  }

  .purchase-unified-input-group {
    display: flex;
    align-items: stretch;
    width: 100%;
    min-width: 0;
    height: 2.375rem;
    min-height: 2.375rem;
    overflow: hidden;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
    box-shadow: none;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .purchase-unified-input-group:hover {
    border-color: #bdcadd;
  }

  .purchase-unified-input-group:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .purchase-unified-input-group :global(.form-control),
  .purchase-unified-input-group :global(.form-select) {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 100% !important;
    min-height: 0 !important;
    padding: 0 0.55rem;
    border: 0 !important;
    border-radius: 0 !important;
    outline: 0;
    background: transparent !important;
    color: #26364b;
    font-size: 0.82rem;
    font-weight: 600;
    box-shadow: none !important;
  }

  .purchase-unified-input-group :global(.form-control:focus),
  .purchase-unified-input-group :global(.form-select:focus) {
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .purchase-unified-input-group :global(.form-control::placeholder) {
    color: #9aa7b8;
    font-weight: 500;
  }

  .purchase-unified-input-group :global(.input-group-text) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    min-width: 2.75rem;
    height: 100%;
    padding: 0 0.5rem;
    border: 0 !important;
    border-inline-start: 1px solid #e3e8ef !important;
    border-radius: 0 !important;
    background: #f7f9fc !important;
    color: #718096;
    font-size: 0.68rem;
    font-weight: 750;
    white-space: nowrap;
  }

  .sale-product-search-icon {
    display: inline-flex !important;
    flex: 0 0 2.35rem !important;
    width: 2.35rem !important;
    min-width: 2.35rem !important;
    padding: 0 !important;
    border: 0 !important;
    border-inline-end: 1px solid #e7ebf1 !important;
    background: #ffffff !important;
    color: #8a99ad !important;
  }

  .purchase-unified-input-group :global(.purchase-input-addon-btn),
  .purchase-unified-input-group :global(.purchase-product-quick-btn),
  .purchase-unified-input-group :global(.btn-info) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    flex: 0 0 auto;
    gap: 0.35rem;
    min-width: auto !important;
    height: 100% !important;
    padding: 0 0.75rem !important;
    border: 0 !important;
    border-inline-start: 1px solid rgba(255, 255, 255, 0.22) !important;
    border-radius: 0 !important;
    background: var(--sale-primary) !important;
    color: #ffffff !important;
    font-size: 0.72rem !important;
    font-weight: 800 !important;
    line-height: 1;
    white-space: nowrap;
    box-shadow: none !important;
  }

  .purchase-unified-input-group :global(.purchase-product-quick-btn:hover),
  .purchase-unified-input-group :global(.purchase-product-quick-btn:focus) {
    background: var(--sale-primary-dark) !important;
    color: #ffffff !important;
  }

  .purchase-items-add-row :global(.btn-primary) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 7.5rem;
    width: 100%;
    height: 2.375rem;
    min-height: 2.375rem;
    padding: 0 1rem;
    border: 0;
    border-radius: 0.625rem;
    background: var(--sale-primary);
    color: #ffffff;
    font-size: 0.78rem;
    font-weight: 800;
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(47, 111, 237, 0.2);
    transition:
      background 0.15s ease,
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .purchase-items-add-row :global(.btn-primary:hover) {
    transform: translateY(-1px);
    background: var(--sale-primary-dark);
    box-shadow: 0 6px 16px rgba(47, 111, 237, 0.25);
  }

  .purchase-items-add-row :global(.form-text) {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.1rem;
    margin-top: 0.2rem !important;
    color: #718096;
    font-size: 0.65rem;
    font-weight: 600;
  }

  .purchase-items-add-row :global(.form-text.text-danger) {
    color: #dc2626 !important;
  }

  /* Product dropdown */
  :global(.purchase-items-dropdown) {
    z-index: 1000 !important;
    overflow-x: hidden;
    overflow-y: auto;
    max-height: 20rem;
    padding: 0.3rem;
    border: 1px solid #dce4ef;
    border-radius: 0.75rem;
    background: #ffffff !important;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.16) !important;
  }

  :global(.purchase-items-dropdown .list-group-item) {
    min-height: 3rem;
    padding: 0.55rem 0.65rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 700;
    text-align: start;
  }

  :global(.purchase-items-dropdown .list-group-item:hover),
  :global(.purchase-items-dropdown .list-group-item:focus) {
    background: #f0f6ff;
    color: var(--sale-primary);
  }

  :global(.purchase-items-dropdown .list-group-item small) {
    color: #8491a4;
    font-size: 0.64rem;
    font-weight: 600;
  }

  /* Table shell */
  .purchase-items-card :global(.table-responsive) {
    width: 100%;
    max-width: 100%;
    min-height: 11rem;
    overflow-x: auto !important;
    overflow-y: visible;
    border: 0;
    background: #ffffff;
    scrollbar-width: thin;
    scrollbar-color: #b9c5d5 transparent;
  }

  .purchase-items-card :global(.table-responsive::-webkit-scrollbar) {
    height: 0.45rem;
  }

  .purchase-items-card :global(.table-responsive::-webkit-scrollbar-track) {
    background: transparent;
  }

  .purchase-items-card :global(.table-responsive::-webkit-scrollbar-thumb) {
    border-radius: 999px;
    background: #b9c5d5;
  }

  .purchase-items-table {
    width: 100%;
    min-width: 44rem;
    margin: 0 !important;
    border: 0;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    color: #42516a;
  }

  .purchase-items-table :global(thead th) {
    position: sticky;
    top: 0;
    z-index: 4;
    height: 2.875rem;
    padding: 0.55rem 0.625rem;
    border: 0;
    border-bottom: 1px solid #dfe5ed;
    background: #f7f9fc !important;
    color: #67768a;
    font-size: 0.68rem;
    font-weight: 850;
    line-height: 1.2;
    letter-spacing: 0;
    text-align: center;
    text-transform: none;
    vertical-align: middle;
    white-space: nowrap;
  }

  .purchase-items-table :global(thead th:first-child) {
    text-align: start;
  }

  .purchase-items-table :global(tbody tr) {
    height: 4.25rem;
    background: #ffffff;
    transition: background 0.12s ease;
  }

  .purchase-items-table :global(tbody tr:nth-child(even)) {
    background: #fbfcfe;
  }

  .purchase-items-table :global(tbody tr:hover) {
    background: #f4f8ff !important;
  }

  .purchase-items-table :global(tbody td) {
    height: 4.25rem;
    padding: 0.45rem 0.25rem;
    border: 0;
    border-bottom: 1px solid #e9eef5;
    background: transparent;
    color: #46566d;
    font-size: 0.74rem;
    text-align: center;
    vertical-align: middle;
  }

  /* Keep product dominant while reserving useful space for editable columns. */
  .purchase-item-col-product {
    width: 58%;
    min-width: 15rem;
  }

  .purchase-item-product-cell {
    position: sticky;
    inset-inline-start: 0;
    z-index: 2;
    padding-inline: 0.625rem !important;
    background: #ffffff !important;
    box-shadow: 1px 0 0 #e9eef5;
  }

  .purchase-items-table tbody tr:nth-child(even) .purchase-item-product-cell {
    background: #fbfcfe !important;
  }

  .purchase-items-table tbody tr:hover .purchase-item-product-cell {
    background: #f4f8ff !important;
  }

  .purchase-items-table :global(thead .purchase-item-col-product) {
    inset-inline-start: 0;
    z-index: 6;
    background: #f7f9fc !important;
    box-shadow: 1px 0 0 #dfe5ed;
  }

  .purchase-item-product {
    display: flex;
    align-items: center;
    min-width: 0;
    max-width: none;
    overflow: visible;
    white-space: normal;
  }

  .purchase-item-product-copy {
    display: grid;
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

  .purchase-item-col-quantity {
    width: 14%;
    min-width: 8.5rem;
    white-space: nowrap;
  }

  .purchase-item-col-price {
    width: 14%;
    min-width: 8.5rem;
    white-space: nowrap;
  }

  .purchase-item-col-subtotal {
    width: 9%;
    min-width: 7rem;
    white-space: nowrap;
  }

  .purchase-item-col-actions {
    width: 5%;
    min-width: 4rem;
    white-space: nowrap;
  }

  /* Editable fields */
  .purchase-items-table .purchase-item-cell-group {
    display: inline-flex;
    align-items: stretch;
    width: fit-content;
    min-width: 0;
    max-width: none;
    height: 2.25rem;
    min-height: 2.25rem;
    overflow: hidden;
    border: 1px solid #dbe3ee;
    border-radius: 0.5rem;
    background: #ffffff;
    box-shadow: none;
    vertical-align: middle;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .purchase-items-table .purchase-item-cell-group:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.08);
  }

  .purchase-items-table .purchase-item-cell-group :global(.form-control) {
    field-sizing: content;
    flex: 0 0 auto;
    inline-size: auto;
    width: auto;
    min-inline-size: 3ch;
    min-width: 3ch;
    max-inline-size: none;
    max-width: none;
    height: 100% !important;
    min-height: 0 !important;
    padding: 0 0.45rem;
    border: 0 !important;
    border-radius: 0 !important;
    outline: 0;
    background: transparent !important;
    color: #26364b;
    font-size: 0.73rem;
    font-weight: 700;
    text-align: center;
    box-shadow: none !important;
  }

  .purchase-items-table .purchase-item-cell-group :global(.input-group-text) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    min-width: 2.75rem;
    height: 100%;
    padding: 0 0.4rem;
    border: 0 !important;
    border-inline-start: 1px solid #e3e8ef !important;
    border-radius: 0 !important;
    background: #f7f9fc !important;
    color: #718096;
    font-size: 0.62rem;
    font-weight: 750;
    white-space: nowrap;
  }

  /* Unit FilterSelect inside quantity cell */
  .purchase-item-col-quantity :global(.filter-select) {
    flex: 0 0 auto;
    width: auto !important;
    min-width: 4.5rem;
    max-width: 8rem !important;
    height: 100%;
    border-inline-start: 1px solid #e3e8ef;
  }

  .purchase-item-col-quantity :global(.filter-select__trigger) {
    width: 100%;
    min-height: 100% !important;
    height: 100% !important;
    padding: 0 0.45rem !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: #f7f9fc !important;
    color: #718096 !important;
    font-size: 0.62rem !important;
    font-weight: 750 !important;
    box-shadow: none !important;
  }

  .purchase-item-stock {
    margin-top: 0.28rem;
    color: #8491a4;
    font-size: 0.63rem;
    font-weight: 600;
    line-height: 1.35;
    text-align: center;
  }

  .purchase-item-stock-link {
    color: var(--sale-primary) !important;
    font-size: 0.63rem !important;
    font-weight: 750 !important;
    line-height: inherit;
    text-decoration: none;
    vertical-align: baseline;
  }

  /* Subtotal */
  .purchase-item-money {
    display: inline-flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.3rem;
    width: fit-content;
    min-width: 0;
    white-space: nowrap;
  }

  .purchase-item-money strong {
    color: #172033;
    font-size: 0.8rem;
    font-weight: 900;
  }

  .purchase-item-money small {
    margin: 0;
    color: #718096;
    font-size: 0.62rem;
    font-weight: 750;
  }

  /* Delete */
  .purchase-item-actions {
    text-align: center !important;
  }

  .purchase-items-table :global(.btn-outline-danger) {
    display: inline-grid;
    width: 2rem !important;
    min-width: 2rem !important;
    height: 2rem !important;
    min-height: 2rem !important;
    padding: 0 !important;
    place-items: center;
    border: 1px solid #f3cccc !important;
    border-radius: 0.5rem !important;
    background: #fff7f7 !important;
    color: #d64545 !important;
    font-size: 0.75rem;
    line-height: 1;
    box-shadow: none !important;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      transform 0.15s ease;
  }

  .purchase-items-table :global(.btn-outline-danger:hover) {
    transform: translateY(-1px);
    border-color: #efaaaa !important;
    background: #feecec !important;
    color: #c53030 !important;
  }

  /* Footer */
  .purchase-items-total-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-height: 4rem;
    margin: 0 !important;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--sale-border-soft);
    border-radius: 0;
    background: #fbfcfe;
  }

  .purchase-items-total-row :global(h5) {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
    margin: 0;
    color: #64748b;
    font-size: 0.75rem;
    font-weight: 750;
    white-space: nowrap;
  }

  .purchase-items-total-row :global(.text-primary) {
    color: var(--sale-primary) !important;
    font-size: 1.05rem;
    font-weight: 900;
  }

  /* RTL */
  :global(html[dir='rtl']) .purchase-item-product-cell {
    box-shadow: -1px 0 0 #e9eef5;
  }

  :global(html[dir='rtl']) .purchase-items-table thead .purchase-item-col-product {
    box-shadow: -1px 0 0 #dfe5ed;
  }

  /* Responsive */
  @media (max-width: 1050px) {
    .purchase-items-add-row {
      grid-template-columns: minmax(16rem, 1fr) 8rem 9rem;
    }

    .purchase-items-add-row > :last-child {
      grid-column: 1 / -1;
    }

    .purchase-items-add-row :global(.btn-primary) {
      width: 100%;
    }
  }

  @media (max-width: 767.98px) {
    .purchase-items-card {
      border-radius: 0.75rem;
    }

    .purchase-items-card :global(.card-body > .d-flex.align-items-center.mb-3) {
      min-height: 4.25rem;
      padding: 0.8rem;
    }

    .purchase-items-add-row {
      grid-template-columns: 1fr;
      padding: 0.8rem;
    }

    .purchase-items-add-row > :last-child {
      grid-column: auto;
    }

    .purchase-items-table {
      min-width: 42rem;
    }

    .purchase-items-card :global(.table-responsive) {
      min-height: 10rem;
    }

    .purchase-items-total-row {
      padding-inline: 0.8rem;
    }
  }


  /* Product search results with available warehouse stock */
  :global(.purchase-items-dropdown .sale-product-option) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    min-width: 0;
  }

  :global(.purchase-items-dropdown .sale-product-option__copy) {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.1rem;
    text-align: start;
  }

  :global(.purchase-items-dropdown .sale-product-option__copy strong) {
    overflow: hidden;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.purchase-items-dropdown .sale-product-option__copy small) {
    overflow: hidden;
    color: #8491a4;
    font-size: 0.63rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.purchase-items-dropdown .sale-product-option__stock) {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: baseline;
    gap: 0.25rem;
    min-height: 1.75rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid #cce9dc;
    border-radius: 0.45rem;
    background: #f2fbf7;
    color: #087a54;
    white-space: nowrap;
  }

  :global(.purchase-items-dropdown .sale-product-option__stock i) {
    font-size: 0.68rem;
  }

  :global(.purchase-items-dropdown .sale-product-option__stock strong) {
    color: #087a54;
    font-size: 0.7rem;
    font-weight: 850;
  }

  :global(.purchase-items-dropdown .sale-product-option__stock small) {
    color: #54806c !important;
    font-size: 0.57rem !important;
    font-weight: 700;
  }

  :global(.purchase-items-dropdown .sale-product-option__service) {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.7rem;
    padding-inline: 0.5rem;
    border: 1px solid #d8e4f8;
    border-radius: 999px;
    background: #f3f7fe;
    color: #2f6fed;
    font-size: 0.6rem;
    font-weight: 750;
    white-space: nowrap;
  }

  :global(.sale-product-empty) {
    display: grid;
    min-height: 7.5rem;
    place-items: center;
    align-content: center;
    gap: 0.3rem;
    padding: 1rem;
    color: #8491a4;
    text-align: center;
  }

  :global(.sale-product-empty__icon) {
    display: inline-grid;
    width: 2.5rem;
    height: 2.5rem;
    place-items: center;
    border-radius: 0.625rem;
    background: #f1f5f9;
    color: #94a3b8;
    font-size: 1rem;
  }

  :global(.sale-product-empty strong) {
    color: #526176;
    font-size: 0.75rem;
    font-weight: 800;
  }

  :global(.sale-product-empty small) {
    color: #8491a4;
    font-size: 0.63rem;
    font-weight: 600;
  }

  #form_product_search:disabled {
    background: #f7f9fc !important;
    color: #94a3b8;
    cursor: not-allowed;
  }

</style>

