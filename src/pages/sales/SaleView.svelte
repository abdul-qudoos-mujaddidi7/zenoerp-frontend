<script>
  import { db } from '../../db.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import PaymentSection from './PaymentSection.svelte';
  import SaleReceiptModal from './SaleReceiptModal.svelte';
  import SaleA4ReceiptModal from './SaleA4ReceiptModal.svelte';
  import WarehouseA4ReceiptModal from './WarehouseA4ReceiptModal.svelte';
  import SaleDeleteModal from './SaleDeleteModal.svelte';
  import SaleMakeDraftModal from './SaleMakeDraftModal.svelte';
  import SaleEditModal from './SaleEditModal.svelte';
  import { showDate } from '../../calendar.js';
  import { toast } from '../../ToastUI/toast.js';
  import { getMultiple } from '../stocktransactions/calculateStock.js';
  import { push } from 'svelte-spa-router';
  import { auth } from '../../auth/authStore';
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  import SaleReturnModal from './SaleReturnModal.svelte';
  import { calculateDiscountAmount } from './SalesHelper.js';

  $: permissions = $auth.permissions;
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  $: enable_due_date = $settings_all.find((s) => s.key === 'enable_due_date')?.value == 1;
  $: enable_bill_of_warehouse = $settings_all.find((s) => s.key === 'enable_bill_of_warehouse')?.value == 1;

  export let saleId;
  const dispatch = createEventDispatcher();

  let paymentSectionKey = 0;
  let sale;
  let products;
  let currencies = [];
  let items = [];
  let showReceipt = false;
  let showA4Receipt = false;
  let showWarehouseReceipt = false;
  let selectedItem = null;
  let customer = null;
  let units = [];
  let showReturn = false;
  let showDelete = false;
  let showDraft = false;
  let showEdit = false;
  let calculatedItems = [];
  let loading = true;

  $: if (currencies.length && products?.length) {
    calculateItems();
  }

  async function calculateItems() {
    if (!sale || !products?.length) return;
    calculatedItems = await Promise.all(
      items.map(async (item) => {
        let product = products.find((p) => p.id === item.product_id);
        if (!product) return item;

        let costPrice = Number(item.buy_price || product.buy_price) || 0;

        if (item.buy_price_currency != sale.currency) {
          costPrice = exchangeRate(costPrice, item.buy_price_currency || product.buy_currency, sale.currency) || 0;
        }

        if (item.product_unit_id != product.product_unit_id) {
          const multiple = await getMultiple(Number(item.product_unit_id), Number(product.product_unit_id));
          costPrice = multiple * costPrice;
        }

        let benefit = (Number(item.unit_price) - costPrice) * Number(item.quantity);
        return {
          ...item,
          calculated_unit_price: costPrice,
          benefit,
        };
      }),
    );
  }

  onMount(async () => {
    sale = await db.sales.where({ id: Number(saleId), status: 1 }).first();
    if (!sale) {
      toast.error(t('Error'), t('Sale not found.'));
      loading = false;
      return;
    }

    const saleItems = (
      await db.sale_items
        .where('sale_id')
        .equals(Number(saleId))
        .and((item) => item.status === 1)
        .toArray()
    ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const productIds = saleItems.map((i) => i.product_id);
    products = await db.products
      .where('id')
      .anyOf(productIds)
      .and((s) => s.status === 1)
      .toArray();

    items = saleItems.map((i) => {
      const product = products.find((p) => p.id === i.product_id);
      return {
        ...i,
        product_name: product?.name || 'Unknown',
        product_buy_price: product?.buy_price || 'Unknown',
        product_buy_currency: product?.buy_currency || 'Unknown',
        product_unit_id: i.product_unit_id || product?.product_unit_id,
      };
    });

    units = await db.product_units.where('status').equals(1).toArray();
    currencies = await db.currencies.where('status').equals(1).toArray();
    customer = await db.accounts.where({ id: sale.account_id, status: 1 }).first();
    loading = false;
  });

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = Number(fromCurrency.exchangeRate || 1);
    const toRate = Number(toCurrency.exchangeRate || 1);
    return (amount / toRate) * fromRate;
  }

  function goBack() {
    push('/dashboard/sales');
  }

  function customerName(acc) {
    if (!acc) return '';
    if (t('Lang') === 'en') return acc.name || '';
    if (t('Lang') === 'fa') return acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') return acc.name_ps || acc.name || '';
    return acc.name || '';
  }

  function unitName(unitId) {
    return units.find((u) => u.id === unitId)?.name || '-';
  }

  function formatAmount(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
</script>

{#if !permissions?.some((p) => p.code === 'Sales' && p.view)}
  <h3 class="text-danger m-3"><i class="bi bi-exclamation-triangle me-2"></i>{t('No access allowed')}</h3>
{:else}
  <div class="purchase-detail-page">
    <div class="purchase-detail-page__inner">
      {#if loading}
        <div class="purchase-detail-card purchase-detail-card--loading">
          <div class="purchase-detail-skeleton"></div>
          <div class="purchase-detail-skeleton purchase-detail-skeleton--short"></div>
        </div>
      {:else if !sale}
        <div class="purchase-detail-card purchase-detail-empty">
          <i class="bi bi-receipt"></i>
          <p>{t('Sale not found.')}</p>
          <button type="button" class="pd-btn pd-btn--neutral" on:click={goBack}>
            <i class="bi bi-arrow-left"></i>
            {t('Back')}
          </button>
        </div>
      {:else}
        <header class="pd-header-card">
          <div class="pd-header-card__top">
            <div class="pd-header-card__title-row">
              <button type="button" class="pd-btn pd-btn--neutral pd-btn--icon" on:click={goBack} title={t('Back')}>
                <i class="bi bi-arrow-left"></i>
              </button>
              <h1 class="pd-header-card__title">
                {t('Sale #')}: {sale?.invoice_number}
              </h1>
              {#if sale?.invoice_status === 'draft'}
                <span class="pd-status-badge pd-status-badge--draft">{t('Draft')}</span>
              {:else if sale?.invoice_status === 'confirmed'}
                <span class="pd-status-badge pd-status-badge--confirmed">{t('confirmed')}</span>
              {/if}
              {#if sale?.version && sale?.version > 1}
                <span class="pd-status-badge pd-status-badge--version">{t('Version')} {sale?.version}</span>
              {/if}
            </div>

            <div class="pd-header-card__actions hide-for-pdf">
              <button type="button" class="pd-btn pd-btn--primary" on:click={() => (showReceipt = true)}>
                <i class="bi bi-printer"></i>
                {t('Print')}
              </button>
              {#if sale?.invoice_status === 'confirmed' && permissions?.some((p) => p.code === 'Sales' && p.edit)}
                <button type="button" class="pd-btn pd-btn--secondary" on:click={() => (showDraft = true)}>
                  <i class="bi bi-file-earmark"></i>
                  {t('Make Draft')}
                </button>
              {:else if permissions?.some((p) => p.code === 'Sales' && p.edit)}
                <button type="button" class="pd-btn pd-btn--secondary" on:click={() => push(`/dashboard/sale-form/${saleId}`)}>
                  <i class="bi bi-pencil"></i>
                  {t('Edit')}
                </button>
              {/if}
              {#if sale?.invoice_status === 'confirmed'}
                <button type="button" class="pd-btn pd-btn--outline" on:click={() => (showReturn = true)}>
                  <i class="bi bi-arrow-return-left"></i>
                  {t('Return')}
                </button>
              {/if}
              {#if permissions?.some((p) => p.code === 'Sales' && p.delete)}
                <button type="button" class="pd-btn pd-btn--danger-outline" on:click={() => (showDelete = true)}>
                  <i class="bi bi-trash"></i>
                  {t('Delete')}
                </button>
              {/if}
            </div>
          </div>

          <dl class="pd-header-meta">
            <div class="pd-header-meta__item">
              <dt>{t('Customer')}</dt>
              <dd>
                {#if customer}
                  <button type="button" class="pd-link" on:click={() => push(`/dashboard/account/${customer.id}`)}>
                    {customerName(customer)}
                  </button>
                {:else}
                  —
                {/if}
              </dd>
            </div>
            <div class="pd-header-meta__item">
              <dt>{t('Invoice Date')}</dt>
              <dd>{@html sale?.invoice_date ? showDate(sale.invoice_date) : '-'}</dd>
            </div>
            {#if enable_due_date}
              <div class="pd-header-meta__item">
                <dt>{t('Due Date')}</dt>
                <dd>{@html sale?.due_date ? showDate(sale.due_date) : '-'}</dd>
              </div>
            {/if}
            {#if sale?.description}
              <div class="pd-header-meta__item">
                <dt>{t('Description')}</dt>
                <dd class="pd-header-meta__desc">{@html sale.description}</dd>
              </div>
            {/if}
          </dl>
        </header>

        {#if sale?.invoice_status === 'confirmed'}
          {#key paymentSectionKey}
            <PaymentSection {saleId}>
              <section class="pd-card pd-items-card">
                <div class="pd-card__head">
                  <h2 class="pd-card__title">
                    <i class="bi bi-box-seam"></i>
                    {t('Sale Items')}
                  </h2>
                </div>
                <div class="pd-card__scroll">
                  <table class="pd-table pd-table--items">
                    <colgroup>
                      <col class="pd-table__col-product" />
                      <col class="pd-table__col-num" />
                      <col class="pd-table__col-num" />
                      <col class="pd-table__col-qty" />
                      {#if permissions?.some((p) => p.code === 'Benefit' && p.view)}
                        <col class="pd-table__col-num" />
                      {/if}
                      <col class="pd-table__col-num pd-table__col-total" />
                      {#if enable_bill_of_warehouse}
                        <col class="pd-table__col-actions" />
                      {/if}
                    </colgroup>
                    <thead>
                      <tr>
                        <th class="pd-table__col-product">{t('Product')}</th>
                        <th class="pd-table__col-num">{t('Buy Price')}</th>
                        <th class="pd-table__col-num">{t('Sell Price')}</th>
                        <th class="pd-table__col-qty">{t('Quantity')}</th>
                        {#if permissions?.some((p) => p.code === 'Benefit' && p.view)}
                          <th class="pd-table__col-num">{t('Benefit')}</th>
                        {/if}
                        <th class="pd-table__col-num pd-table__col-total">{t('Total Price')}</th>
                        {#if enable_bill_of_warehouse}
                          <th class="pd-table__col-actions">{t('Actions')}</th>
                        {/if}
                      </tr>
                    </thead>
                    <tbody>
                      {#each calculatedItems as i}
                        <tr>
                          <td class="pd-table__col-product">
                            <button type="button" class="pd-link pd-link--product" on:click={() => push(`/dashboard/product/${i.product_id}`)}>
                              {i.product_name}
                            </button>
                          </td>
                          <td class="pd-table__amount pd-table__col-num">
                            <span class="pd-table__num" dir="ltr">
                              {formatAmount(i.calculated_unit_price)}
                              <span class="pd-table__currency">{t(i.product_buy_currency)}</span>
                            </span>
                          </td>
                          <td class="pd-table__amount pd-table__col-num">
                            <span class="pd-table__num" dir="ltr">
                              {formatAmount(i.unit_price)}
                              <span class="pd-table__currency">{t(i.currency)}</span>
                            </span>
                          </td>
                          <td class="pd-table__col-qty">
                            <span class="pd-table__qty-cell">
                              <span class="purchase-qty-pill">
                                <span dir="ltr">{formatAmount(i.quantity)}</span>
                              </span>
                              <span class="purchase-qty-unit">{unitName(i.product_unit_id)}</span>
                            </span>
                          </td>
                          {#if permissions?.some((p) => p.code === 'Benefit' && p.view)}
                            <td class="pd-table__amount pd-table__col-num">
                              <span class="pd-benefit-badge pd-benefit-badge--{i.benefit >= 0 ? 'positive' : 'negative'}">
                                <span dir="ltr">{formatAmount(i.benefit)}</span>
                                <span class="pd-table__currency">{t(i.currency)}</span>
                              </span>
                            </td>
                          {/if}
                          <td class="pd-table__amount pd-table__amount--total pd-table__col-num pd-table__col-total">
                            <span class="pd-table__num" dir="ltr">
                              {formatAmount(Number(i.quantity) * Number(i.unit_price))}
                              <span class="pd-table__currency">{t(i.currency)}</span>
                            </span>
                          </td>
                          {#if enable_bill_of_warehouse}
                            <td class="pd-table__col-actions">
                              <button
                                type="button"
                                class="pd-btn pd-btn--outline pd-btn--sm"
                                on:click={() => {
                                  selectedItem = i;
                                  showWarehouseReceipt = true;
                                }}>
                                <i class="bi bi-printer"></i>
                              </button>
                            </td>
                          {/if}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </section>
            </PaymentSection>
          {/key}
        {:else}
          <div class="purchase-detail-summary purchase-detail-summary--sale">
            <div class="purchase-summary-card">
              <div class="purchase-summary-card__icon purchase-summary-card__icon--total">
                <i class="bi bi-receipt"></i>
              </div>
              <div class="purchase-summary-card__body">
                <span class="purchase-summary-card__label">{t('Payable')}</span>
                <span class="purchase-summary-card__value" dir="ltr">
                  {formatAmount(sale?.total_amount)}
                  <small>{t(sale?.currency)}</small>
                </span>
              </div>
            </div>
            {#if permissions?.some((p) => p.code === 'Benefit' && p.view)}
              <div class="purchase-summary-card">
                <div class="purchase-summary-card__icon purchase-summary-card__icon--paid">
                  <i class="bi bi-graph-up-arrow"></i>
                </div>
                <div class="purchase-summary-card__body">
                  <span class="purchase-summary-card__label">{t('Total')} {t('Benefit')}</span>
                  <span class="purchase-summary-card__value purchase-summary-card__value--{sale?.benefit < 0 ? 'overdue' : 'credit'}" dir="ltr">
                    {formatAmount(sale?.benefit)}
                    <small>{t(sale?.currency)}</small>
                  </span>
                </div>
              </div>
            {/if}
            <div class="purchase-summary-card">
              <div class="purchase-summary-card__icon purchase-summary-card__icon--returns">
                <i class="bi bi-percent"></i>
              </div>
              <div class="purchase-summary-card__body">
                <span class="purchase-summary-card__label">{t('Discount')}</span>
                <span class="purchase-summary-card__value" dir="ltr">
                  {formatAmount(calculateDiscountAmount(sale))}
                  <small>{t(sale?.currency)}</small>
                </span>
              </div>
            </div>
            <div class="purchase-summary-card purchase-summary-card--remaining purchase-summary-card--unpaid">
              <div class="purchase-summary-card__icon purchase-summary-card__icon--unpaid">
                <i class="bi bi-clock"></i>
              </div>
              <div class="purchase-summary-card__body">
                <span class="purchase-summary-card__label">{t('Remaining')}</span>
                <span class="purchase-summary-card__value purchase-summary-card__value--unpaid" dir="ltr">
                  {formatAmount(sale?.remaining)}
                  <small>{t(sale?.currency)}</small>
                </span>
              </div>
            </div>
          </div>

          <section class="pd-card pd-items-card">
            <div class="pd-card__head">
              <h2 class="pd-card__title">
                <i class="bi bi-box-seam"></i>
                {t('Sale Items')}
              </h2>
            </div>
            <div class="pd-card__scroll">
              <table class="pd-table pd-table--items">
                <colgroup>
                  <col class="pd-table__col-product" />
                  <col class="pd-table__col-num" />
                  <col class="pd-table__col-num" />
                  <col class="pd-table__col-qty" />
                  {#if permissions?.some((p) => p.code === 'Benefit' && p.view)}
                    <col class="pd-table__col-num" />
                  {/if}
                  <col class="pd-table__col-num pd-table__col-total" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="pd-table__col-product">{t('Product')}</th>
                    <th class="pd-table__col-num">{t('Buy Price')}</th>
                    <th class="pd-table__col-num">{t('Sell Price')}</th>
                    <th class="pd-table__col-qty">{t('Quantity')}</th>
                    {#if permissions?.some((p) => p.code === 'Benefit' && p.view)}
                      <th class="pd-table__col-num">{t('Benefit')}</th>
                    {/if}
                    <th class="pd-table__col-num pd-table__col-total">{t('Total Price')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each calculatedItems as i}
                    <tr>
                      <td class="pd-table__col-product">
                        <button type="button" class="pd-link pd-link--product" on:click={() => push(`/dashboard/product/${i.product_id}`)}>
                          {i.product_name}
                        </button>
                      </td>
                      <td class="pd-table__amount pd-table__col-num">
                        <span class="pd-table__num" dir="ltr">
                          {formatAmount(i.calculated_unit_price)}
                          <span class="pd-table__currency">{t(i.product_buy_currency)}</span>
                        </span>
                      </td>
                      <td class="pd-table__amount pd-table__col-num">
                        <span class="pd-table__num" dir="ltr">
                          {formatAmount(i.unit_price)}
                          <span class="pd-table__currency">{t(i.currency)}</span>
                        </span>
                      </td>
                      <td class="pd-table__col-qty">
                        <span class="pd-table__qty-cell">
                          <span class="purchase-qty-pill">
                            <span dir="ltr">{formatAmount(i.quantity)}</span>
                          </span>
                          <span class="purchase-qty-unit">{unitName(i.product_unit_id)}</span>
                        </span>
                      </td>
                      {#if permissions?.some((p) => p.code === 'Benefit' && p.view)}
                        <td class="pd-table__amount pd-table__col-num">
                          <span class="pd-benefit-badge pd-benefit-badge--{i.benefit >= 0 ? 'positive' : 'negative'}">
                            <span dir="ltr">{formatAmount(i.benefit)}</span>
                            <span class="pd-table__currency">{t(i.currency)}</span>
                          </span>
                        </td>
                      {/if}
                      <td class="pd-table__amount pd-table__amount--total pd-table__col-num pd-table__col-total">
                        <span class="pd-table__num" dir="ltr">
                          {formatAmount(Number(i.quantity) * Number(i.unit_price))}
                          <span class="pd-table__currency">{t(i.currency)}</span>
                        </span>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </section>
        {/if}
      {/if}
    </div>
  </div>

  {#if showReceipt && sale}
    <SaleReceiptModal
      {sale}
      on:showA4={() => ((showA4Receipt = true), (showReceipt = false))}
      on:close={() => (showReceipt = false)} />
  {/if}
  {#if showA4Receipt && sale}
    <SaleA4ReceiptModal {sale} on:close={() => (showA4Receipt = false)} />
  {/if}
  {#if showWarehouseReceipt && sale}
    <WarehouseA4ReceiptModal {sale} {selectedItem} on:close={() => (showWarehouseReceipt = false)} />
  {/if}
  {#if showDelete && sale}
    <SaleDeleteModal {sale} on:close={() => (showDelete = false)} />
  {/if}
  {#if showDraft && sale}
    <SaleMakeDraftModal {sale} on:close={() => (showDraft = false)} />
  {/if}
  {#if showEdit && sale}
    <SaleEditModal {sale} on:close={() => (showEdit = false)} />
  {/if}
  {#if showReturn && sale}
    <SaleReturnModal
      {sale}
      on:close={async () => {
        showReturn = false;
        paymentSectionKey += 1;
      }} />
  {/if}
{/if}

<style>
  .purchase-detail-page {
    width: calc(100% + 1rem);
    margin: -0.5rem;
    min-height: 100%;
    padding-block: 24px;
    background: #f8fafc;
  }

  .purchase-detail-page__inner {
    width: 100%;
    max-width: 1180px;
    margin-inline: auto;
    padding-inline: 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .pd-header-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .pd-header-card__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .pd-header-card__title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
    flex: 1 1 auto;
  }

  .pd-header-card__title {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.3;
  }

  .pd-status-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }

  .pd-status-badge--confirmed {
    background: #ecfdf5;
    color: #10b981;
    border: 1px solid #a7f3d0;
  }

  .pd-status-badge--draft {
    background: #fffbeb;
    color: #f59e0b;
    border: 1px solid #fde68a;
  }

  .pd-status-badge--version {
    background: #eff6ff;
    color: #0f6efd;
    border: 1px solid #bfdbfe;
  }

  .pd-header-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 20px;
    margin: 0;
    padding-block-start: 8px;
    border-block-start: 1px solid #f1f5f9;
  }

  .pd-header-meta__item {
    margin: 0;
  }

  .pd-header-meta__desc :global(p) {
    margin: 0;
    display: inline;
  }

  .pd-header-meta__desc :global(p:not(:last-child))::after {
    content: ' ';
  }

  .pd-header-meta dt {
    margin: 0 0 1px;
    font-size: 11px;
    font-weight: 500;
    color: #64748b;
  }

  .pd-header-meta dd {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
  }

  .pd-header-card__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex-shrink: 0;
  }

  .pd-link {
    background: none;
    border: none;
    padding: 0;
    color: #0f6efd;
    font-weight: 600;
    cursor: pointer;
    text-align: start;
  }

  .pd-link--product {
    font-size: 14px;
  }

  .pd-link:hover {
    text-decoration: underline;
  }

  .pd-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border-radius: 8px;
    padding: 7px 12px;
    font-weight: 600;
    font-size: 12px;
    border: 1px solid transparent;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .pd-btn--primary {
    background: #0f6efd;
    color: #ffffff;
    border-color: #0f6efd;
  }

  .pd-btn--primary:hover {
    background: #1d4ed8;
  }

  .pd-btn--secondary {
    background: #eff6ff;
    color: #0f6efd;
    border-color: #bfdbfe;
  }

  .pd-btn--secondary:hover {
    background: #dbeafe;
  }

  .pd-btn--outline {
    background: #ffffff;
    color: #475569;
    border-color: #e2e8f0;
  }

  .pd-btn--outline:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  .pd-btn--danger-outline {
    background: #ffffff;
    color: #ef4444;
    border-color: #ef4444;
  }

  .pd-btn--danger-outline:hover {
    background: #fef2f2;
  }

  .pd-btn--neutral {
    background: #ffffff;
    color: #475569;
    border-color: #e2e8f0;
  }

  .pd-btn--neutral:hover {
    background: #f8fafc;
  }

  .pd-btn--icon {
    padding: 7px 9px;
    flex-shrink: 0;
  }

  .pd-btn--sm {
    padding: 5px 10px;
    font-size: 11px;
  }

  .pd-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    overflow: hidden;
  }

  .pd-card__head {
    padding: 14px 20px;
    border-bottom: 1px solid #e2e8f0;
  }

  .pd-card__title {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9375rem;
    font-weight: 700;
    color: #0f172a;
  }

  .pd-card__title i {
    color: #0f6efd;
    font-size: 1rem;
  }

  .pd-card__scroll {
    overflow-x: auto;
  }

  .pd-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }

  .pd-table--items col.pd-table__col-product {
    width: 24%;
  }

  .pd-table--items col.pd-table__col-expiry,
  .pd-table--items col.pd-table__col-qty {
    width: 12%;
  }

  .pd-table--items col.pd-table__col-num {
    width: 14%;
  }

  .pd-table--items col.pd-table__col-total {
    width: 14%;
  }

  .pd-table--items col.pd-table__col-actions {
    width: 8%;
  }

  .pd-table th {
    background: #f8fafc;
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
    padding: 12px 16px;
    text-align: start;
    white-space: nowrap;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: middle;
  }

  .pd-table td {
    padding: 12px 16px;
    border-block-start: 1px solid #f1f5f9;
    color: #0f172a;
    text-align: start;
    vertical-align: middle;
    font-size: 14px;
  }

  .pd-table th.pd-table__col-qty,
  .pd-table td.pd-table__col-qty,
  .pd-table th.pd-table__col-num,
  .pd-table td.pd-table__col-num,
  .pd-table th.pd-table__col-actions,
  .pd-table td.pd-table__col-actions {
    text-align: end;
  }

  .pd-table td.pd-table__col-qty {
    white-space: nowrap;
  }

  .pd-table__qty-cell {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    max-width: 100%;
  }

  .pd-table__num {
    display: inline-block;
    direction: ltr;
    unicode-bidi: isolate;
    white-space: nowrap;
    text-align: start;
  }

  .pd-table tbody tr:hover td {
    background: #f8fafc;
  }

  .pd-table__amount {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .pd-table__amount--total {
    font-weight: 800;
  }

  .pd-table__currency {
    margin-inline-start: 4px;
    font-size: 12px;
    color: #64748b;
    font-weight: 500;
  }

  .purchase-qty-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 6px;
    background: #eff6ff;
    color: #0f6efd;
    font-size: 13px;
    font-weight: 600;
  }

  .purchase-qty-unit {
    margin-inline-start: 6px;
    font-size: 12px;
    color: #64748b;
  }

  .pd-benefit-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 700;
  }

  .pd-benefit-badge--positive {
    background: #ecfdf5;
    color: #059669;
  }

  .pd-benefit-badge--negative {
    background: #fef2f2;
    color: #dc2626;
  }

  .purchase-detail-summary--sale {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    align-items: stretch;
  }

  .purchase-summary-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 14px 16px;
    min-height: 72px;
  }

  .purchase-summary-card--remaining.purchase-summary-card--unpaid {
    border-color: #fde68a;
  }

  .purchase-summary-card__icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
  }

  .purchase-summary-card__icon--total {
    background: #eff6ff;
    color: #0f6efd;
  }

  .purchase-summary-card__icon--paid {
    background: #f0fdf4;
    color: #10b981;
  }

  .purchase-summary-card__icon--returns {
    background: #fffbeb;
    color: #f59e0b;
  }

  .purchase-summary-card__icon--unpaid {
    background: #fffbeb;
    color: #f59e0b;
  }

  .purchase-summary-card__body {
    min-width: 0;
  }

  .purchase-summary-card__label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: #64748b;
    margin-bottom: 2px;
  }

  .purchase-summary-card__value {
    display: block;
    font-size: 1.0625rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.2;
  }

  .purchase-summary-card__value small {
    font-size: 12px;
    font-weight: 500;
    color: #64748b;
    margin-inline-start: 4px;
  }

  .purchase-summary-card__value--unpaid {
    font-size: 1.125rem;
    font-weight: 800;
    color: #b45309;
  }

  .purchase-summary-card__value--credit {
    color: #059669;
  }

  .purchase-summary-card__value--overdue {
    color: #ef4444;
  }

  .purchase-detail-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 24px;
  }

  .purchase-detail-card--loading {
    display: grid;
    gap: 12px;
  }

  .purchase-detail-skeleton {
    height: 20px;
    border-radius: 8px;
    background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
    background-size: 200% 100%;
    animation: pd-shimmer 1.2s infinite;
  }

  .purchase-detail-skeleton--short {
    width: 60%;
  }

  @keyframes pd-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .purchase-detail-empty {
    text-align: center;
    padding: 48px 24px;
    color: #64748b;
  }

  .purchase-detail-empty i {
    font-size: 2.5rem;
    margin-bottom: 12px;
    display: block;
    color: #94a3b8;
  }

  .purchase-detail-empty p {
    margin: 0 0 16px;
  }

  @media (max-width: 768px) {
    .purchase-detail-page {
      padding-block: 16px;
    }

    .purchase-detail-page__inner {
      padding-inline: 16px;
      gap: 16px;
    }

    .pd-header-card__top {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
    }

    .pd-header-card__actions {
      justify-content: stretch;
    }

    .pd-header-card__actions .pd-btn {
      flex: 1 1 auto;
      justify-content: center;
    }
  }
</style>
