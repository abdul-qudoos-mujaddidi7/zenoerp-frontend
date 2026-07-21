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
    loadAll();

    products = await db.products.where('status').equals(1).toArray();
    products = products.filter((p) => (p.product_status ? p.product_status == 'active' : p.status == 1));

    filteredProducts = products;
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

  function selectProduct(product) {
    selectedProduct = product;
    const unitHierarchy = getUnitHierarchy(product.product_unit_id);
    search = product.name;
    unit_price = Number(product.sell_price) || 0;
    unit_currency = product.sell_currency || currency.code;
    unit = product.product_unit_id;
    showDropdown = false;
    selectedProduct.availableUnits = unitHierarchy;
    console.log('Refreshing stock for product', product.id, 'in warehouse', warehouse_id);
    // Ensure stock is recalculated and fresh data is loaded before showing available quantity
    (async () => {
      try {
        await calculateProductStock(Number(product.id));
      } catch (e) {
        console.warn('Failed to calculate product stock:', e);
      }
      warehouse_products = await db.warehouse_products.where('status').equals(1).toArray();
      stock =
        warehouse_products.find((wp) => wp.product_id === product.id && wp.warehouse_id === warehouse_id)?.quantity ||
        0;
    })();
    if (enable_show_latest_sale_price) {
      latestPrice = null;
      findLatestSalesPrice(product.id);
    }
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
    const product = await db.products
      .where('code')
      .equals(code)
      .and((p) => (p.product_status ? p.product_status == 'active' : true) && p.status == 1)
      .first();
    if (!product) return;
    selectProduct(product);
    addItem();
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

  function getProductStock(productId) {
    return (
      warehouse_products.find((wp) => wp.product_id === productId && wp.warehouse_id === warehouse_id)?.quantity || 0
    );
  }

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

  $: if (showProductDropdown) tick().then(positionProductDropdown);
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
            on:input={() => {
              showProductDropdown = true;
              filteredProducts = products.filter((prod) => {
                const name = prod.name || '';
                const code = prod.code || '';
                return (
                  name.toLowerCase().includes(search.trim().toLowerCase()) ||
                  code.toLowerCase().includes(search.trim().toLowerCase())
                );
              });
              if (!search.trim()) selectedProduct = null;
            }}
            on:focus={() => {
              showProductDropdown = true;
              if (search.trim()) {
                filteredProducts = products.filter((prod) => {
                  const name = prod.name || '';
                  const code = prod.code || '';
                  return (
                    name.toLowerCase().includes(search.trim().toLowerCase()) ||
                    code.toLowerCase().includes(search.trim().toLowerCase())
                  );
                });
              } else {
                filteredProducts = products;
              }
            }}
            on:blur={() => setTimeout(() => (showProductDropdown = false), 150)}
            placeholder={t('Search product by name, barcode, or SKU...')}
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
            {#each filteredProducts as prod}
              <button
                type="button"
                class="list-group-item list-group-item-action"
                on:mousedown={() => {
                  selectProduct(prod);
                  showProductDropdown = false;
                }}>
                <div class="d-flex justify-content-between">
                  <span>{prod.name}</span>
                  <small>{categories.find((c) => c.id === prod.category_id)?.name || t('Category')}</small>
                </div>
              </button>
            {/each}
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
    products = products.filter((p) => (p.product_status ? p.product_status == 'active' : p.status == 1));
    warehouse_products = await db.warehouse_products.where('status').equals(1).toArray();
    const newProduct = products[products.length - 1];
    if (newProduct) {
      items.push({
        type: newProduct.type || 'good',
        product_id: newProduct.id,
        product_name: newProduct.name,
        product_unit_id: newProduct.product_unit_id,
        currency: newProduct.sell_currency || currency.code,
        quantity: 1,
        latestPrice: null,
        buy_price: newProduct.buy_price,
        buy_price_currency: newProduct.buy_currency || currency.code,
        unit_price: Number(newProduct.sell_price) || 0,
        calculated_price: Number(newProduct.sell_price) || 0,
        subtotal: Number(newProduct.sell_price) || 0,
      });
      items = [...items];
      dispatch('update', { items });
    }
  }} />

<style>
  .purchase-items-card {
    position: relative;
    z-index: 35;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06) !important;
    overflow: visible;
    background: #ffffff;
  }

  .purchase-items-card :global(.card-body) { overflow: visible; }
  .purchase-items-add-row { position: relative; z-index: 40; }
  .purchase-items-dropdown { z-index: 1000 !important; background:#fff !important; }

  .purchase-items-title {
    color: #0f172a;
    font-weight: 800;
    font-size: 1rem;
    letter-spacing: -0.01em;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .purchase-items-title::before {
    content: '';
    width: 4px;
    height: 18px;
    border-radius: 999px;
    background: linear-gradient(180deg, #3b82f6, #0f6efd);
  }

  .purchase-items-add-row {
    padding: 0.85rem;
    background: #ffffff;
    border: 1px solid #eef2f7;
    border-radius: 12px;
  }

  .purchase-unified-input-group {
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

  .purchase-unified-input-group:focus-within {
    border-color: #93c5fd;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  }

  .purchase-unified-input-group :global(.form-control),
  .purchase-unified-input-group :global(.form-select) {
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
  .purchase-unified-input-group :global(.form-select:focus) {
    border: 0 !important;
    box-shadow: none !important;
    background: #ffffff !important;
  }

  .purchase-unified-input-group :global(.input-group-text) {
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

  .purchase-unified-input-group :global(.input-group-text:not(:first-child)) {
    border-inline-start: 1px solid #e2e8f0 !important;
  }

  .purchase-unified-input-group :global(.input-group-text:first-child:not(:last-child)) {
    border-inline-end: 1px solid #e2e8f0 !important;
  }

  .purchase-unified-input-group :global(.form-select) {
    border-inline-start: 1px solid #e2e8f0 !important;
    max-width: 6.5rem;
    flex: 0 1 auto;
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

  .purchase-items-table :global(tbody td) {
    border-bottom: 1px solid #f1f5f9;
    font-size: 0.84rem;
    vertical-align: middle;
    padding: 0.55rem 0.45rem;
  }

  .purchase-items-table :global(tbody tr:nth-child(even)) {
    background: #fbfdff;
  }

  .purchase-items-table :global(tbody tr:hover) {
    background: #f0f7ff !important;
  }

  .purchase-items-table :global(.form-control),
  .purchase-items-table :global(.form-select),
  .purchase-items-table :global(.input-group) {
    min-width: 0;
  }

  .purchase-items-table :global(.form-control),
  .purchase-items-table :global(.form-select) {
    border-radius: 8px;
    border-color: #e2e8f0;
    background-color: #ffffff !important;
    font-size: 0.8rem;
    font-weight: 600;
    height: 32px;
  }

  .purchase-item-product {
    font-weight: 650;
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-item-stock {
    margin-top: 0.28rem;
    font-size: 0.68rem;
    line-height: 1.25;
    color: #94a3b8;
    font-weight: 600;
  }

  .purchase-item-stock.text-danger {
    color: #ef4444;
  }

  .purchase-item-stock-link {
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1.25;
    vertical-align: baseline;
  }

  .purchase-item-actions {
    width: 80px;
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
    padding: 0.75rem 1rem;
    background: #ffffff;
    border-radius: 12px;
  }

  .purchase-items-total-row :global(h5) {
    font-size: 1rem;
    font-weight: 800;
    color: #334155;
    margin: 0;
  }

  .purchase-items-total-row :global(.text-primary) {
    color: #0f6efd !important;
    font-weight: 900;
    font-size: 1.1rem;
  }

  .sale-product-search-icon {
    display: inline-flex;
    width: 38px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0 !important;
    background: #fff !important;
    color: #64748b !important;
  }

  .purchase-items-title::before {
    background: #0f6efd;
  }

  .purchase-items-add-row,
  .purchase-items-card,
  .purchase-items-table,
  .purchase-items-total-row {
    border-color: #e2e8f0;
  }

  .purchase-items-add-row .purchase-unified-input-group,
  .purchase-items-table .purchase-unified-input-group,
  .purchase-items-table :global(.form-control),
  .purchase-items-table :global(.form-select),
  .purchase-items-table :global(.btn-outline-danger) {
    border-radius: 4px !important;
  }

  .purchase-items-table :global(.btn-outline-danger) {
    color: #dc2626;
    border-color: #fecaca;
    background: #fff;
  }

  .purchase-items-card {
    border: 1px solid #dfe6f0;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 5px 18px rgba(15, 23, 42, 0.045) !important;
  }

  .purchase-items-add-row {
    display: grid;
    grid-template-columns: minmax(18rem, 1fr) minmax(7rem, 0.24fr) minmax(7rem, 0.24fr) minmax(7rem, 0.2fr);
    gap: 0.75rem;
    align-items: start;
    padding: 0.8rem;
    border: 0;
    border-radius: 12px;
    background: #fff;
  }

  .purchase-items-add-row > [class*='col-'] {
    width: auto;
    max-width: none;
    min-width: 0;
    padding: 0;
  }

  .purchase-items-add-row .purchase-unified-input-group,
  .purchase-items-add-row :global(.btn-primary) {
    min-height: 38px;
    height: 38px;
    border-radius: 4px !important;
  }

  .purchase-items-add-row .purchase-unified-input-group {
    overflow: hidden !important;
  }

  .purchase-items-add-row .purchase-unified-input-group :global(.form-control),
  .purchase-items-add-row .purchase-unified-input-group :global(.input-group-text),
  .purchase-items-add-row .purchase-unified-input-group :global(.btn) {
    border-radius: 0 !important;
  }

  .purchase-items-add-row :global(.btn-primary) {
    border-radius: 4px !important;
    background: #0f6efd;
    border-color: #0f6efd;
  }

  .purchase-items-table :global(thead th) {
    background: #f8fafc;
    color: #64748b;
  }

  @media (max-width: 991.98px) {
    .purchase-items-add-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .purchase-items-add-row > :first-child {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 575.98px) {
    .purchase-items-add-row {
      grid-template-columns: 1fr;
    }

    .purchase-items-add-row > :first-child {
      grid-column: auto;
    }
  }

  /* Match the Purchase item-search row exactly. */
  .purchase-items-add-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: nowrap;
    gap: 0.75rem;
    padding-block: 0.85rem;
    padding-inline: 0;
    border: 0;
    border-radius: 12px;
  }

  .purchase-items-add-row > [class*='col-'] {
    width: 130px;
    min-width: 110px;
    max-width: none;
    flex: 0 0 130px;
    padding: 0;
  }

  .purchase-items-add-row > :first-child {
    width: auto;
    min-width: 0;
    flex: 1 1 760px;
  }

  .purchase-items-add-row > :last-child {
    width: auto;
    min-width: 110px;
    flex: 0 0 auto;
  }

  .purchase-items-add-row .purchase-unified-input-group,
  .purchase-items-add-row :global(.btn-primary) {
    height: 24px;
    min-height: 24px;
    border-radius: 4px !important;
  }

  .purchase-items-add-row .purchase-unified-input-group {
    border-color: #dbe4ef;
    background: #fff;
  }

  .purchase-items-add-row :global(.form-control),
  .purchase-items-add-row :global(.input-group-text),
  .purchase-items-add-row :global(.btn) {
    min-height: 22px;
    height: 22px;
    padding-block: 0;
    font-size: 0.72rem;
  }

  .purchase-items-add-row :global(.btn-primary) {
    height: 24px;
    min-height: 24px;
    min-width: 110px;
    padding-inline: 0.85rem;
    border: 0;
    border-radius: 4px !important;
    box-shadow: 0 3px 8px rgba(37, 99, 235, 0.18);
  }

  .sale-product-search-icon {
    width: 40px;
    padding: 0;
    background: transparent !important;
  }

  :global([dir='rtl']) .purchase-items-add-row {
    justify-content: flex-start;
  }

  /* PurchaseItemsTable row design. */
  .purchase-item-col-product {
    min-width: 180px;
  }

  .purchase-item-col-quantity,
  .purchase-item-col-price {
    width: 130px;
    min-width: 110px;
  }

  .purchase-item-col-subtotal {
    width: 120px;
    min-width: 100px;
  }

  .purchase-item-col-actions {
    width: 64px;
    min-width: 64px;
  }

  .purchase-item-product {
    display: flex;
    align-items: center;
    max-width: none;
    overflow: visible;
    white-space: normal;
  }

  .purchase-item-product-copy {
    display: grid;
    min-width: 0;
    gap: 0.15rem;
    text-align: start;
  }

  .purchase-item-product-name {
    overflow: hidden;
    color: #0f172a;
    font-size: 0.78rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-item-product-copy small {
    color: #64748b;
    font-size: 0.62rem;
    font-weight: 600;
  }

  .purchase-items-table .purchase-item-col-quantity .purchase-item-cell-group,
  .purchase-items-table .purchase-item-col-price .purchase-item-cell-group,
  .purchase-item-money {
    height: 34px;
    min-height: 34px;
    overflow: hidden;
    flex-direction: column;
    border: 1px solid #e2e8f0;
    border-radius: 4px !important;
    background: #fff;
  }

  .purchase-items-table .purchase-item-col-quantity .purchase-item-cell-group :global(.form-control),
  .purchase-items-table .purchase-item-col-price .purchase-item-cell-group :global(.form-control),
  .purchase-item-money strong {
    width: 100%;
    height: 20px !important;
    min-height: 20px !important;
  }

  .purchase-items-table .purchase-item-col-quantity .purchase-item-cell-group :global(.input-group-text),
  .purchase-items-table .purchase-item-col-price .purchase-item-cell-group :global(.input-group-text),
  .purchase-item-money small {
    display: grid;
    width: 100%;
    height: 13px;
    min-height: 13px;
    place-items: center;
    border-inline-start: 0 !important;
    border-top: 1px solid #e2e8f0 !important;
    background: #f8fafc !important;
    color: #64748b;
    font-size: 0.6rem;
    line-height: 13px;
  }

  .purchase-item-money strong {
    display: grid;
    place-items: center;
    color: #334155;
    font-size: 0.72rem;
  }

  .purchase-item-money small {
    margin: 0;
  }

  .purchase-item-col-quantity :global(.filter-select) {
    width: 100% !important;
    max-width: none !important;
    height: 13px;
  }

  .purchase-item-col-quantity :global(.filter-select__trigger) {
    width: 100%;
    min-height: 13px !important;
    height: 13px !important;
    padding: 0 0.35rem !important;
    border: 0 !important;
    border-top: 1px solid #e2e8f0 !important;
    border-radius: 0 !important;
    background: #f8fafc !important;
    font-size: 0.6rem !important;
  }

  .purchase-items-table :global(tbody td .btn-outline-danger) {
    width: 26px !important;
    min-width: 26px !important;
    height: 26px !important;
    min-height: 26px !important;
    padding: 0 !important;
    border-radius: 4px !important;
    font-size: 0.68rem !important;
    line-height: 1 !important;
  }

  @media (max-width: 767.98px) {
    .purchase-items-add-row {
      flex-wrap: wrap;
    }

    .purchase-items-add-row > :first-child {
      flex-basis: 100%;
    }
  }
</style>
