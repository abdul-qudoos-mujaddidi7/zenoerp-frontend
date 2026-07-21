<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import Swal from 'sweetalert2';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { push } from 'svelte-spa-router';

  import { calculateProductStock } from '../stocktransactions/calculateStock.js';
  export let inventory_record;

  import {calculateRemainingAndBenefit} from './InventoryRecordsHelper.js';
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

  let inventory_record_items = [];
  let inventory_record_payments = [];
  let inventory_record_returns = [];
  let inventory_record_return_items = [];

  let inventory_record_journals = [];

  let inventory_record_stock_transactions = [];

  let totalAmount = 0;
  let inventory_record_currency = '';
  let subTotalAmount = 0;

  $: if (inventory_record_items.length > 0) {
    subTotalAmount = inventory_record_items.reduce((s, i) => { 
        if (i.currency && inventory_record_currency && i.currency !== inventory_record_currency) {
            return s + exchangeRate(i.unit_price* i.quantity, i.currency, inventory_record_currency);
        } else {
            return s + i.unit_price * i.quantity;
        }
    }, 0);
  } else {
    subTotalAmount = 0;
  }


  $: if (inventory_record_items.length > 0) {
    totalAmount = inventory_record_items.reduce((s, i) => { 
        if (i.currency && inventory_record_currency && i.currency !== inventory_record_currency) {
            return s + exchangeRate(i.unit_price* i.quantity, i.currency, inventory_record_currency);
        } else {
            return s + i.unit_price * i.quantity;
        }
    }, 0);
    if (inventory_record.discount_amount > totalAmount) {
      inventory_record.discount_amount = totalAmount;
    }
    totalAmount = totalAmount - Number(inventory_record.discount_amount || 0) + Number(inventory_record.expense_amount || 0);
  } else {
    totalAmount = 0;
  }

  onMount(async () => {
    products = await db.products.where('status').equals(1).toArray();
    units = await db.product_units.where('status').equals(1).toArray();
    currencies = await db.currencies.where('status').equals(1).toArray();
    await loadInventoryRecordDetails();
  });

  async function loadInventoryRecordDetails() {
    if (!inventory_record) return;

    inventory_record = await db.inventory_records.where({ id: Number(inventory_record.id), status: 1 }).first();
    inventory_record_currency = inventory_record.currency;
    // Load inventory_record items
 
      inventory_record_items = (await db.inventory_record_items
  .where('inventory_record_id')
  .equals(Number(inventory_record.id))
  .and((item) => item.status === 1)
  .toArray())
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // set inventory_record item currency as default if not available

    inventory_record_items = inventory_record_items.map(si=>{
      if (!si.currency) {
        return {...si, currency: inventory_record_currency}
      }
      return si;
    });

    // Load payments
    inventory_record_payments = await db.inventory_record_payments
      .where('inventory_record_id')
      .equals(inventory_record.id)
      .and((p) => p.status === 1)
      .toArray();

    // Load returns
    inventory_record_returns = await db.inventory_record_returns
      .where('inventory_record_id')
      .equals(inventory_record.id)
      .and((r) => r.status === 1)
      .toArray();

    const returnIds = inventory_record_returns.map((r) => r.id);
    if (returnIds.length > 0) {
      inventory_record_return_items = await db.inventory_record_return_items
        .where('inventory_record_return_id')
        .anyOf(returnIds)
        .and((ri) => ri.status === 1)
        .toArray();
    }

    // Load associated journals
    inventory_record_journals = await db.journals
      .where('reference_type')
      .equals('inventory_record')
      .and((j) => j.reference_id === inventory_record.id && j.status === 1)
      .toArray();

    // Load associated stock transactions
    inventory_record_stock_transactions = await db.stock_transactions
      .where('reference_type')
      .equals('inventory_record')
      .and((st) => st.reference_id === inventory_record.id && st.status === 1)
      .toArray();

    // append inventory_record return transactions to inventory_record stock transactions for unified display
    for (const ret of inventory_record_returns) {
      const retTrans = await db.stock_transactions
        .where('reference_type')
        .equals('inventory_record_return')
        .and((st) => st.reference_id === ret.id && st.status === 1)
        .toArray();
      inventory_record_stock_transactions = inventory_record_stock_transactions.concat(retTrans);
    }

    // append inventory_record_return journals to inventory_record journals for unified display
    for (const ret of inventory_record_returns) {
      const retJournals = await db.journals
        .where('reference_type')
        .equals('inventory_record_return')
        .and((j) => j.reference_id === ret.id && j.status === 1)
        .toArray();
      inventory_record_journals = inventory_record_journals.concat(retJournals);
    }

    for (const p of inventory_record_payments) {
      const paymentJournals = await db.journals
        .where('reference_type')
        .equals('inventory_record_payment')
        .and((j) => j.reference_id === p.id && j.status === 1)
        .toArray();
      inventory_record_journals = inventory_record_journals.concat(paymentJournals);
    }
    loading = false;
  }
  async function doUpdateInventoryRecord() {
    saving = true;
    try {
      let updatedInventoryRecord = await db.inventory_records.where('id').equals(inventory_record.id).first();
      await db.inventory_records.update(inventory_record.id, {
        total_amount: totalAmount,
        description: inventory_record.description,
        discount_amount: inventory_record.discount_amount,
        expense_amount: inventory_record.expense_amount,
        version:Number(inventory_record.version||1)+1,
      });
      for (const item of inventory_record_items) {
        await db.inventory_record_items.update(item.id, item);
      }
      let journalsToUpdate = await db.journals
        .where('reference_type')
        .equals('inventory_record')
        .and((j) => j.reference_id === inventory_record.id && j.status === 1)
        .toArray();
      let updatedJournals = [];
      for (const journal of journalsToUpdate) {
        if (journal.first_entry_debit !== 0) {
          await db.journals.update(journal.id, {
            first_entry_debit: totalAmount,
            second_entry_credit: totalAmount,
            description: `Updated journal from InventoryRecord #${inventory_record.id}`,
          });
          updatedJournals.push(journal);
        }
      }
      let stockTransToUpdate = await db.stock_transactions
        .where('reference_type')
        .equals('inventory_record')
        .and((st) => st.reference_id === inventory_record.id && st.status === 1)
        .toArray();
      for (const st of stockTransToUpdate) {
        let item = inventory_record_items.find((p) => p.product_id === st.product_id);
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
            description: `Updated stock transaction from InventoryRecord #${inventory_record.id}`,
          });
          await calculateProductStock(Number(st.product_id), 'single');
        }
      }
      await calculateRemainingAndBenefit(inventory_record.id);
      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'update',
        table_name: 'inventory_records',
        entity_id: inventory_record.id,
        old_values: JSON.stringify({
          inventory_record: updatedInventoryRecord,
          items: inventory_record_items.map((i) => i.id),
          journals: updatedJournals.map((j) => j.id),
          stock_transactions: stockTransToUpdate.map((st) => st.id),
        }),
        description: `Updated inventory_record #${inventory_record.id}`,
      });
      Swal.fire({
        icon: 'success',
        title: t('Updated!'),
        text: t('InventoryRecord updated successfully.'),
        confirmButtonText: t('OK'),
      });
      dispatch('close');
      push(`/dashboard/inventory_records`);
    } catch (e) {
      console.error('Error updating inventory_record:', e);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('An error occurred while updating the inventory_record.'),
        confirmButtonText: t('OK'),
      });
    } finally {
      saving = false;
    }
  }

  async function updateInventoryRecord() {
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
      text: t('Are you sure you want to update this inventory_record? This action cannot be undone.'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('Yes, update it!'),
      cancelButtonText: t('No, keep it'),
    }).then((result) => {
      if (result.isConfirmed) {
        doUpdateInventoryRecord();

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
            {t('Update InventoryRecord')}
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
                  {t('Are you sure you want to update this inventory_record? This action cannot be undone.')}<br />
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
                          : inventory_record_items.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Payments')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : inventory_record_payments.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Returns')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : inventory_record_returns.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Return Items')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : inventory_record_return_items.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Journals')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : inventory_record_journals.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Stock Transactions')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : inventory_record_stock_transactions.length}</td>
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
                  : {inventory_record.invoice_number}
                </div>

                <div class="mb-3">
                  <strong>{t('Invoice Date')}</strong>
                  : {inventory_record.invoice_date.slice(0, 10)}
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
                      {#each inventory_record_items as item, index}
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
                    {t(inventory_record.currency)}</strong>
                </div>
                <div class="mb-3 d-flex gap-3">
                
                  <div class="input-group">
                    <div class="input-group-text">{t('Expenses')}</div>
                    <input class="form-control" placeholder={t('Expenses')} bind:value={inventory_record.expense_amount} />
                  </div>

                  <div class="input-group">
                    <div class="input-group-text">{t('Discount')}</div>
                    <input class="form-control" placeholder={t('Discount')} bind:value={inventory_record.discount_amount} />
                  </div>
                  
                  
                </div>

                <div class="mb-3">
                  <strong
                    >{t('Total Amount')}
                    : {totalAmount.toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                    {t(inventory_record.currency)}</strong>
                </div>

                <div class="mb-3">
                  <textarea class="form-control" placeholder={t('Description')} bind:value={inventory_record.description}></textarea>
                </div>
              </div>
            </div>
          {/if}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => dispatch('close')}
            ><i class="bi bi-x-lg"></i> {t('Cancel')}</button>
          <button class="btn btn-info" on:click={updateInventoryRecord} disabled={saving || loading}
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
