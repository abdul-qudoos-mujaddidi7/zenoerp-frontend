<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import Swal from 'sweetalert2';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { push } from 'svelte-spa-router';

  import { calculateProductStock } from '../stocktransactions/calculateStock.js';
  export let sale;

  import {calculateRemainingAndBenefit} from './SalesHelper.js';
  const dispatch = createEventDispatcher();

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    console.log('Exchanging', amount, fromCurrencyCode, 'to', toCurrencyCode);
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = Number(fromCurrency.exchangeRate || 1);
    const toRate = Number(toCurrency.exchangeRate || 1);
    return (amount / toRate) * fromRate;
  }


  let saving = false;
  let products = [];
  let units = [];
  let currencies = [];

  let confirmationText = '';
  let randomNumber = Math.floor(Math.random() * 900) + 100; // simple random number for confirmation
  let loading = true;

  let sale_items = [];
  let sale_payments = [];
  let sale_returns = [];
  let sale_return_items = [];

  let sale_journals = [];

  let sale_stock_transactions = [];

  let totalAmount = 0;
  let sale_currency = '';
  let subTotalAmount = 0;

  $: if (sale_items.length > 0) {
    subTotalAmount = sale_items.reduce((s, i) => { 
        if (i.currency && sale_currency && i.currency !== sale_currency) {
            return s + exchangeRate(i.unit_price* i.quantity, i.currency, sale_currency);
        } else {
            return s + i.unit_price * i.quantity;
        }
    }, 0);
  } else {
    subTotalAmount = 0;
  }


  $: if (sale_items.length > 0) {
    totalAmount = sale_items.reduce((s, i) => { 
        if (i.currency && sale_currency && i.currency !== sale_currency) {
            return s + exchangeRate(i.unit_price* i.quantity, i.currency, sale_currency);
        } else {
            return s + i.unit_price * i.quantity;
        }
    }, 0);
    if (sale.discount_amount > totalAmount) {
      sale.discount_amount = totalAmount;
    }
    totalAmount = totalAmount - Number(sale.discount_amount || 0) + Number(sale.expense_amount || 0);
  } else {
    totalAmount = 0;
  }

  onMount(async () => {
    products = await db.products.where('status').equals(1).toArray();
    units = await db.product_units.where('status').equals(1).toArray();
    currencies = await db.currencies.where('status').equals(1).toArray();
    await loadSaleDetails();
  });

  async function loadSaleDetails() {
    if (!sale) return;

    sale = await db.sales.where({ id: Number(sale.id), status: 1 }).first();
    sale_currency = sale.currency;
    // Load sale items
 
      sale_items = (await db.sale_items
  .where('sale_id')
  .equals(Number(sale.id))
  .and((item) => item.status === 1)
  .toArray())
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // set sale item currency as default if not available

    sale_items = sale_items.map(si=>{
      if (!si.currency) {
        return {...si, currency: sale_currency}
      }
      return si;
    });

    // Load payments
    sale_payments = await db.sale_payments
      .where('sale_id')
      .equals(sale.id)
      .and((p) => p.status === 1)
      .toArray();

    // Load returns
    sale_returns = await db.sale_returns
      .where('sale_id')
      .equals(sale.id)
      .and((r) => r.status === 1)
      .toArray();

    const returnIds = sale_returns.map((r) => r.id);
    if (returnIds.length > 0) {
      sale_return_items = await db.sale_return_items
        .where('sale_return_id')
        .anyOf(returnIds)
        .and((ri) => ri.status === 1)
        .toArray();
    }

    // Load associated journals
    sale_journals = await db.journals
      .where('reference_type')
      .equals('sale')
      .and((j) => j.reference_id === sale.id && j.status === 1)
      .toArray();

    // Load associated stock transactions
    sale_stock_transactions = await db.stock_transactions
      .where('reference_type')
      .equals('sale')
      .and((st) => st.reference_id === sale.id && st.status === 1)
      .toArray();

    // append sale return transactions to sale stock transactions for unified display
    for (const ret of sale_returns) {
      const retTrans = await db.stock_transactions
        .where('reference_type')
        .equals('sale_return')
        .and((st) => st.reference_id === ret.id && st.status === 1)
        .toArray();
      sale_stock_transactions = sale_stock_transactions.concat(retTrans);
    }

    // append sale_return journals to sale journals for unified display
    for (const ret of sale_returns) {
      const retJournals = await db.journals
        .where('reference_type')
        .equals('sale_return')
        .and((j) => j.reference_id === ret.id && j.status === 1)
        .toArray();
      sale_journals = sale_journals.concat(retJournals);
    }

    for (const p of sale_payments) {
      const paymentJournals = await db.journals
        .where('reference_type')
        .equals('sale_payment')
        .and((j) => j.reference_id === p.id && j.status === 1)
        .toArray();
      sale_journals = sale_journals.concat(paymentJournals);
    }
    loading = false;
  }
  async function doUpdateSale() {
    saving = true;
    try {
      let updatedSale = await db.sales.where('id').equals(sale.id).first();
      await db.sales.update(sale.id, {
        total_amount: totalAmount,
        description: sale.description,
        discount_amount: sale.discount_amount,
        expense_amount: sale.expense_amount,
        version:Number(sale.version||1)+1,
      });
      for (const item of sale_items) {
        await db.sale_items.update(item.id, item);
      }
      let journalsToUpdate = await db.journals
        .where('reference_type')
        .equals('sale')
        .and((j) => j.reference_id === sale.id && j.status === 1)
        .toArray();
      let updatedJournals = [];
      for (const journal of journalsToUpdate) {
        if (journal.first_entry_debit !== 0) {
          await db.journals.update(journal.id, {
            first_entry_debit: totalAmount,
            second_entry_credit: totalAmount,
            description: `Updated journal from Sale #${sale.id}`,
          });
          updatedJournals.push(journal);
        }
      }
      let stockTransToUpdate = await db.stock_transactions
        .where('reference_type')
        .equals('sale')
        .and((st) => st.reference_id === sale.id && st.status === 1)
        .toArray();
      for (const st of stockTransToUpdate) {
        let item = sale_items.find((p) => p.product_id === st.product_id);
        if (!item) {
          alert('Item not found: ' + st.product_id);
        } else {
          await db.stock_transactions.update(st.id, {
            quantity: Number(item.quantity),
            currency: item.currency,
            peer_price: 0,
            peer_currency: item.currency,
            unit_cost: Number(item.unit_price),
            total_cost: Number(item.unit_price) * Number(item.quantity),
            description: `Updated stock transaction from Sale #${sale.id}`,
          });
          await calculateProductStock(Number(st.product_id), 'single');
        }
      }
      await calculateRemainingAndBenefit(sale.id);
      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'update',
        table_name: 'sales',
        entity_id: sale.id,
        old_values: JSON.stringify({
          sale: updatedSale,
          items: sale_items.map((i) => i.id),
          journals: updatedJournals.map((j) => j.id),
          stock_transactions: stockTransToUpdate.map((st) => st.id),
        }),
        description: `Updated sale #${sale.id}`,
      });
      Swal.fire({
        icon: 'success',
        title: t('Updated!'),
        text: t('Sale updated successfully.'),
        confirmButtonText: t('OK'),
      });
      dispatch('close');
      push(`/dashboard/sales`);
    } catch (e) {
      console.error('Error updating sale:', e);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('An error occurred while updating the sale.'),
        confirmButtonText: t('OK'),
      });
    } finally {
      saving = false;
    }
  }

  async function updateSale() {
    if (confirmationText !== String(randomNumber)) {
      Swal.fire({
        icon: 'error',
        title: t('Confirmation Failed'),
        text: t('Confirmation text does not match. Please type the correct number to confirm updating.'),
        confirmButtonText: t('OK'),
      });
      return;
    }
    Swal.fire({
      title: t('Are you sure?'),
      text: t('Are you sure you want to update this sale? This action cannot be undone.'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('Yes, update it!'),
      cancelButtonText: t('No, keep it'),
    }).then((result) => {
      if (result.isConfirmed) {
        doUpdateSale();

      }
    });
  }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
  <div class="modal show d-block" tabindex="-1">
    <div class="modal-dialog modal-xl">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-arrow-return-left"></i>
            {t('Update Sale')}
          </h5>
          <button type="button" class="btn-close" on:click={() => dispatch('close')}></button>
        </div>
        <div class="modal-body">
          {#if saving}
            <div class="d-flex align-items-center">
              <strong>{t('Updating...')}</strong>
              <div class="spinner-border ms-auto" role="status" aria-hidden="true"></div>
            </div>
          {:else}
            <div class="row">
              <div class="col-md-4">
                <h1 class="text-info">
                  <i class="bi bi-exclamation-triangle me-2"></i>{t('Warning!')}
                </h1>
                <p>
                  {t('Are you sure you want to update this sale? This action cannot be undone.')}<br />
                  {t('All associated journals, items and payments will also be updated.')}
                </p>

                <table>
                  <tbody>
                    <tr>
                      <td><strong>{t('Associated Items')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : sale_items.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Payments')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : sale_payments.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Returns')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : sale_returns.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Return Items')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : sale_return_items.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Journals')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : sale_journals.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Stock Transactions')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : sale_stock_transactions.length}</td>
                    </tr>
                  </tbody>
                </table>

                <!-- create a mini captcha system -->
                <div class="mt-4">
                  <small>
                    {t(`To confirm updating, please type`)}
                    {randomNumber}
                    {t(`in the box below:`)}
                  </small>
                  <input
                    type="text"
                    class="form-control form-control-sm mt-2 w-50 {confirmationText != randomNumber
                      ? 'is-invalid'
                      : 'is-valid'}"
                    bind:value={confirmationText}
                    placeholder={t(`To confirm updating, please type`)} />
                </div>
              </div>
              <div class="col-md-8">
                <div class="mb-3">
                  <strong>{t('Invoice #')}</strong>
                  : {sale.invoice_number}
                </div>

                <div class="mb-3">
                  <strong>{t('Invoice Date')}</strong>
                  : {sale.invoice_date.slice(0, 10)}
                </div>

                <div class="table-responsive">
                  <table class="table table-sm table-bordered">
                    <thead>
                      <tr>
                        <th>{t('Product')}</th>
                        <th>{t('Unit Price')}</th>
                        <th>{t('Quantity')}</th>
                        <th>{t('Subtotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each sale_items as item, index}
                        <tr>
                          <td>{products.find((p) => p.id === item.product_id)?.name}</td>
                          <td>
                            <div class="input-group input-group-sm">
                              <input type="number" bind:value={item.unit_price} class="form-control form-control-sm" />
                              <span class="input-group-text">{t(item.currency)}</span>
                            </div>
                          </td>

                          <td>
                            <div class="input-group input-group-sm">
                              <input type="number" bind:value={item.quantity} class="form-control form-control-sm" />
                              <span class="input-group-text"
                                >{units.find((u) => u.id === item.product_unit_id)?.name}</span>
                            </div>
                          </td>
                          <td>
                            <div class="input-group input-group-sm">
                              {(item.unit_price * item.quantity).toLocaleString(undefined, {
                                maximumFractionDigits: 3,
                              })}&nbsp;{t(item.currency)}
                            </div></td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>

                <div class="mb-3">
                  <strong
                    >{t('Total')}
                    : {subTotalAmount.toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                    {t(sale.currency)}</strong>
                </div>
                <div class="mb-3 d-flex gap-3">
                
                  <div class="input-group">
                    <div class="input-group-text">{t('Expenses')}</div>
                    <input class="form-control" placeholder={t('Expenses')} bind:value={sale.expense_amount} />
                  </div>

                  <div class="input-group">
                    <div class="input-group-text">{t('Discount')}</div>
                    <input class="form-control" placeholder={t('Discount')} bind:value={sale.discount_amount} />
                  </div>
                  
                  
                </div>

                <div class="mb-3">
                  <strong
                    >{t('Total Amount')}
                    : {totalAmount.toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                    {t(sale.currency)}</strong>
                </div>

                <div class="mb-3">
                  <textarea class="form-control" placeholder={t('Description')} bind:value={sale.description}></textarea>
                </div>
              </div>
            </div>
          {/if}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => dispatch('close')}
            ><i class="bi bi-x-lg"></i> {t('Cancel')}</button>
          <button class="btn btn-info" on:click={updateSale} disabled={saving || loading}
            ><i class="bi bi-trash"></i>
            {@html saving
              ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Updating...')}</span>
  </div>`
              : t('Update')}</button>
        </div>
      </div>
    </div>
</div>
