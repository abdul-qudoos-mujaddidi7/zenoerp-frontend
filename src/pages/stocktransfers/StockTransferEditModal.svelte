<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang , translate_org_type } from '../../i18n/i18n.js';
  import Swal from 'sweetalert2';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { push } from 'svelte-spa-router';

  import { calculateProductStock } from '../stocktransactions/calculateStock.js';
  export let stocktransfer;

  const dispatch = createEventDispatcher();

  let saving = false;
  let products = [];
  let units = [];
  let currencies = [];
  let warehouses = [];

  let confirmationText = '';
  let randomNumber = Math.floor(Math.random() * 900) + 100; // simple random number for confirmation
  let loading = true;

  let stocktransfer_items = [];
  let stocktransfer_journals = [];
  let stocktransfer_stock_transactions = [];

  let paymentAmount = 0;
  let paymentCurrency = '';

  let totalAmount = 0;
  let subTotalAmount = 0;

  $: if (stocktransfer_items.length > 0) {
    subTotalAmount = stocktransfer_items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  } else {
    subTotalAmount = 0;
  }

  $: if (stocktransfer_items.length > 0) {
    totalAmount = stocktransfer_items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  } else {
    totalAmount = 0;
  }

  onMount(async () => {
    products = await db.products.where('status').equals(1).toArray();
    units = await db.product_units.where('status').equals(1).toArray();
    currencies = await db.currencies.where('status').equals(1).toArray();
    warehouses = await db.warehouses.where('status').equals(1).toArray();
    await loadStockTransferDetails();
  });

  async function loadStockTransferDetails() {
    if (!stocktransfer) return;

    stocktransfer = await db.stock_transfers.where({ id: Number(stocktransfer.id), status: 1 }).first();
    // Load stocktransfer items
    stocktransfer_items = await db.stock_transfer_items
      .where('stock_transfer_id')
      .equals(stocktransfer.id)
      .and((item) => item.status === 1)
      .toArray();

    // Load associated journals
    stocktransfer_journals = await db.journals
      .where('reference_type')
      .equals('stock_transfer')
      .and((j) => j.reference_id === stocktransfer.id && j.status === 1)
      .toArray();

    if (stocktransfer_journals.length == 1) {
      paymentAmount = stocktransfer_journals[0].first_entry_credit;
      paymentCurrency = stocktransfer_journals[0].currency;
    }

    // Load associated stock transactions
    stocktransfer_stock_transactions = await db.stock_transactions
      .where('reference_type')
      .equals('stock_transfer')
      .and((st) => st.reference_id === stocktransfer.id && st.status === 1)
      .toArray();

    loading = false;
  }
  async function doUpdateStockTransfer() {
    saving = true;
    try {
      let updatedStockTransfer = await db.stock_transfers.where('id').equals(stocktransfer.id).first();
      await db.stock_transfers.update(stocktransfer.id, {
        warehouse_id: stocktransfer.warehouse_id,
        to_warehouse_id: stocktransfer.to_warehouse_id,
        total_amount: totalAmount,
        description: stocktransfer.description,
        discount_amount: stocktransfer.discount_amount,
      });

      for (const item of stocktransfer_items) {
        await db.stock_transfer_items.update(item.id, item);
      }

      let journalsToUpdate = await db.journals
        .where('reference_type')
        .equals('stock_transfer')
        .and((j) => j.reference_id === stocktransfer.id && j.status === 1)
        .toArray();

      let updatedJournals = [];

      for (const journal of journalsToUpdate) {
        await db.journals.update(journal.id, {
          first_entry_credit: Number(paymentAmount),
          second_entry_debit: Number(totalAmount),
          description: `Updated Expense Journal from Stock Transfer #${stocktransfer.id}`,
        });
        updatedJournals.push(journal);
      }

      let stockTransToUpdate = await db.stock_transactions
        .where('reference_type')
        .equals('stock_transfer')
        .and((st) => st.reference_id === stocktransfer.id && st.status === 1)
        .toArray();

      for (const st of stockTransToUpdate) {
        let item = stocktransfer_items.find((p) => p.product_id === st.product_id);
        if (!item) {
          alert('Item not found: ' + st.product_id);
        } else {
          let warehouse_id = stocktransfer.warehouse_id;
          if (st.transaction_type === 'transfer_in') {
            warehouse_id = stocktransfer.to_warehouse_id;
          }
          await db.stock_transactions.update(st.id, {
            warehouse_id: warehouse_id,
            quantity: Number(item.quantity),
            currency: item.currency,
            unit_cost: Number(item.unit_price),
            total_cost: Number(item.unit_price) * Number(item.quantity),
            description: `Updated stock transaction from StockTransfer #${stocktransfer.id}`,
          });

          await calculateProductStock(Number(st.product_id), 'single');
        }
      }

      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'update',
        table_name: 'stock_transfers',
        entity_id: stocktransfer.id,
        old_values: JSON.stringify({
          stocktransfer: updatedStockTransfer,
          items: stocktransfer_items.map((i) => i.id),
          journals: updatedJournals.map((j) => j.id),
          stock_transactions: stockTransToUpdate.map((st) => st.id),
        }),
        description: `Updated stocktransfer #${stocktransfer.id}`,
      });

      Swal.fire({
        icon: 'success',
        title: t('Updated!'),
        text: t('Stock Transfer updated successfully.'),
        confirmButtonText: t('OK'),
      });

      dispatch('close');

      push(`/dashboard/stock-transfers`);
    } catch (e) {
      console.error('Error updating stock transfer:', e);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('An error occurred while updating the stock transfer.'),
        confirmButtonText: t('OK'),
      });
    } finally {
      saving = false;
    }
  }

  async function updateStockTransfer() {
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
      text: t('Are you sure you want to update this stock transfer? This action cannot be undone.'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('Yes, update it!'),
      cancelButtonText: t('No, keep it'),
    }).then((result) => {
      if (result.isConfirmed) {
        doUpdateStockTransfer();
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
          {t('Update StockTransfer')}
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
                {t('Are you sure you want to update this stock transfer? This action cannot be undone.')}<br />
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
                        : stocktransfer_items.length}</td>
                  </tr>

                  <tr>
                    <td><strong>{t('Associated Journals')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Loading...')}</span>
</div>`
                        : stocktransfer_journals.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Stock Transactions')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Loading...')}</span>
</div>`
                        : stocktransfer_stock_transactions.length}</td>
                  </tr>
                </tbody>
              </table>

              <!-- create a mini captcha system -->
              <div class="mt-4">
                <small
                  >{t(`To confirm updating, please type`)}
                  {randomNumber}
                  {t(`in the box below:`)}</small>
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
                <strong>{t('Transfer #')}</strong>
                : {stocktransfer.transfer_number}
              </div>

              <div class="mb-3">
                <strong>{t('Transfer Date')}</strong>
                : {stocktransfer.transfer_date.slice(0, 10)}
              </div>
              <div class="row">
                <div class="mb-3 col-md-6">
                  <strong>{t('From Warehouse')}</strong>
                  <select class="form-select form-select-sm" bind:value={stocktransfer.warehouse_id}>
                    <option value="">{t('Select From Warehouse')}</option>
                    {#each warehouses as w}
                      <option value={w.id}>{w.name}</option>
                    {/each}
                  </select>
                </div>

                <div class="mb-3 col-md-6">
                  <strong>{t('To Warehouse')}</strong>
                  <select class="form-select form-select-sm" bind:value={stocktransfer.to_warehouse_id}>
                    <option value="">{t('Select To Warehouse')}</option>
                    {#each warehouses as w}
                      <option value={w.id}>{w.name}</option>
                    {/each}
                  </select>
                </div>
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
                    {#each stocktransfer_items as item, index}
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
                  >{t('Total Amount')}
                  : {totalAmount.toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                  {t(stocktransfer.currency)}</strong>
              </div>

              {#if stocktransfer_journals.length == 1}
                <div class="input-group input-group-sm mb-3">
                  <span class="input-group-text">{t('Transfer Expense')}</span>
                  <input type="number" bind:value={paymentAmount} class="form-control form-control-sm" />
                  <span class="input-group-text">{t(paymentCurrency)}</span>
                </div>
              {/if}

              <div class="mb-3">
                <textarea class="form-control" placeholder={t('Description')} bind:value={stocktransfer.description}
                ></textarea>
              </div>
            </div>
          </div>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={() => dispatch('close')}
          ><i class="bi bi-x-lg"></i> {t('Cancel')}</button>
        <button class="btn btn-info" on:click={updateStockTransfer} disabled={saving || loading}
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
