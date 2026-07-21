<script>
  import { db, logActivity } from '../../db.js';
  import { onMount } from 'svelte';
  import StockTransferItemsTable from './StockTransferItemsTable.svelte';
  import AccountModal from '../accounts/AccountModal.svelte';
  import WarehouseModal from '../products/WarehouseModal.svelte';
  import Swal from 'sweetalert2';
  import { push } from 'svelte-spa-router';
  import { applyStockTransfer, INVENTORY_TX_STORES } from '../../lib/inventory/inventoryService.js';
  import { calculateProductStock } from '../stocktransactions/calculateStock.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  import { showDate, setDatePickers } from '../../calendar.js';
  let warehouseModalRef;
  export let stocktransferId = null;
  $: stocktransferId = stocktransferId == 0 ? null : stocktransferId;
  let warehouses = [];
  let currencies = [];
  let settings = [];
  let accountTypes = [];
  let items = [];
  let form = {
    warehouse_id: '',
    to_warehouse_id: '',
    transfer_number: '',
    transfer_date: new Date().toISOString().slice(0, 10),
    description: '',
    currency: '',
    transfer_status: 'draft',
    status: 1,
  };
  let loading = false;
  let paymentAmount = null;
  let paymentDescription = '';
  let paymentCurrency = '';
  let modalRef;
  let accounts = [];
  let allAccountTypes = [];
  let treasury_ID = 0;
  let notrack_ID = 0;
  let track_ID = 0;
  let filteredSecondAccounts = [];
  let second_entry_account_search = '';
  let showTrackModal = false;
  let second_entry_account = null;

  function getAccountTypeColor(type) {
    const colors = ['dark', 'danger', 'secondary', 'primary', 'success', 'info', 'warning', 'dark', 'info', 'success'];
    return colors[type];
  }
  function getAccountName(id) {
    const acc = accounts.find((a) => a.id === id) || {};
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }
  onMount(async () => {
    accounts = await db.accounts.where({ status: 1 }).toArray();
    accounts.forEach((acc) => {
      if (acc.code === 'TREASURY') {
        second_entry_account = acc.id;
        treasury_ID = acc.id;
      }
      if (acc.code === 'NOTRACK') {
        notrack_ID = acc.id;
      }
    });
    accounts = accounts.filter((a) => !['NOTRACK', 'RECEIVABLE', 'PAYABLE', 'SALES', 'PURCHASE'].includes(a.code));
    allAccountTypes = await db.account_types.where({ status: 1 }).toArray();
    warehouses = await db.warehouses.where('status').equals(1).toArray();
    currencies = await db.currencies.where('status').equals(1).toArray();
    settings = await db.settings
      .where('key')
      .equals('transfer_index')
      .and((s) => s.status === 1)
      .toArray();
    form.transfer_number = settings[0]?.value || '';
    accountTypes = await db.account_types
      .where('id')
      .equals(4)
      .and((s) => s.status === 1)
      .toArray();
    const defaultCurrency = currencies.find((c) => c.isDefault == 1);
    if (defaultCurrency && !form.currency) form.currency = defaultCurrency.code;
    paymentCurrency = form.currency;
    if (stocktransferId) await loadStockTransfer(stocktransferId);
    setDatePickers();
  });
  async function loadStockTransfer(id) {
    try {
      const stocktransfer = await db.stock_transfers.where({ id: Number(id), transfer_status: 'draft', status: 1 }).first();
      if (!stocktransfer) {
        push('/dashboard/stock-transfers');
        return;
      }
      form = {
        warehouse_id: stocktransfer.warehouse_id,
        to_warehouse_id: stocktransfer.to_warehouse_id,
        transfer_number: stocktransfer.transfer_number,
        transfer_date: stocktransfer.transfer_date,
        description: stocktransfer.description,
        currency: stocktransfer.currency,
        transfer_status: stocktransfer.transfer_status,
        status: stocktransfer.status,
      };
      const stocktransferItems = await db.stock_transfer_items
        .where('stock_transfer_id')
        .equals(Number(id))
        .and((item) => item.status === 1)
        .toArray();
      const productIds = stocktransferItems.map((i) => i.product_id);
      const products = await db.products
        .where('id')
        .anyOf(productIds)
        .and((s) => s.status === 1)
        .toArray();
      items = stocktransferItems.map((i) => {
        const product = products.find((p) => p.id === i.product_id);
        return {
          product_id: i.product_id,
          product_name: product?.name || 'Unknown',
          product_unit_id: i.product_unit_id || product?.product_unit_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          subtotal: i.subtotal,
        };
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('Failed to load stocktransfer. Please try again.'),
        confirmButtonText: t('OK'),
      });
    }
  }
  $: total_amount = items.reduce((s, i) => s + i.subtotal, 0);
  $: if (form.currency) paymentCurrency = form.currency;
  async function saveStockTransfer(confirm = false) {
    if (!form.warehouse_id || !form.to_warehouse_id) {
      Swal.fire({
        icon: 'error',
        title: t('Validation Error'),
        text: t('From Warehouse, To Warehouse and at least one Item are required.'),
        confirmButtonText: t('OK'),
      });
      return;
    }
    if (form.warehouse_id == form.to_warehouse_id) {
      Swal.fire({
        icon: 'error',
        title: t('Validation Error'),
        text: t('From Warehouse & To Warehouse cannot be the same.'),
        confirmButtonText: t('OK'),
      });
      return;
    }
    if (items.length === 0) {
      Swal.fire({
        icon: 'error',
        title: t('Validation Error'),
        text: t('At least one Item is required.'),
        confirmButtonText: t('OK'),
      });
      return;
    }
    if (confirm && paymentAmount === null) {
      Swal.fire({
        icon: 'error',
        title: t('Validation Error'),
        text: t('Payment amount cannot be empty. Enter 0 if no payment.'),
        confirmButtonText: t('OK'),
      });
      return;
    }
    loading = true;
    try {
      let addedItems = [];
      await db.transaction(
        'rw',
        [
          'stock_transfers',
          'stock_transfer_items',
          'journals',
          'accounts',
          'settings',
          'activity_logs',
          ...INVENTORY_TX_STORES,
        ],
        async (tx) => {
          let id = Number(stocktransferId);
          if (id) {
            let oldStockTransfer = await db.stock_transfers.get(id);
            await db.stock_transfers.update(id, {
              warehouse_id: form.warehouse_id,
              to_warehouse_id: form.to_warehouse_id,
              transfer_number: form.transfer_number,
              transfer_date: form.transfer_date,
              description: form.description,
              currency: form.currency,
              transfer_status: confirm ? 'confirmed' : 'draft',
              status: form.status,
              total_amount: total_amount,
            });
            await db.stock_transfer_items
              .where('stock_transfer_id')
              .equals(id)
              .modify((item) => {
                item.status = 0;
              });
            await logActivity({
              user_id: parseInt(localStorage.getItem('user_id')) || 0,
              action: 'update',
              table_name: 'stock_transfers',
              entity_id: id,
              old_values: JSON.stringify(oldStockTransfer),
              new_values: JSON.stringify({
                warehouse_id: form.warehouse_id,
                to_warehouse_id: form.to_warehouse_id,
                transfer_number: form.transfer_number,
                transfer_date: form.transfer_date,
                description: form.description,
                currency: form.currency,
                transfer_status: confirm ? 'confirmed' : 'draft',
                status: form.status,
                total_amount: total_amount,
              }),
              description: `Updated stock transfer #${id}`,
            });
          } else {
            id = await db.stock_transfers.add({
              warehouse_id: form.warehouse_id,
              to_warehouse_id: form.to_warehouse_id,
              transfer_number: form.transfer_number,
              transfer_date: form.transfer_date,
              description: form.description,
              discount_amount: form.discount_amount || 0,
              discount_type: form.discount_type || 'fixed',
              currency: form.currency,
              transfer_status: confirm ? 'confirmed' : 'draft',
              status: form.status,
              total_amount: total_amount,
            });
            await db.settings
              .where('key')
              .equals('transfer_index')
              .modify((setting) => {
                setting.value = String(Number(setting.value || 0) + 1);
              });
            await logActivity({
              user_id: parseInt(localStorage.getItem('user_id')) || 0,
              action: 'create',
              table_name: 'stock_transfers',
              entity_id: id,
              old_values: null,
              new_values: JSON.stringify({
                warehouse_id: form.warehouse_id,
                to_warehouse_id: form.to_warehouse_id,
                transfer_number: form.transfer_number,
                transfer_date: form.transfer_date,
                description: form.description,
                discount_amount: form.discount_amount || 0,
                discount_type: form.discount_type || 'fixed',
                currency: form.currency,
                transfer_status: confirm ? 'confirmed' : 'draft',
                status: form.status,
                total_amount: total_amount,
              }),
              description: `Created stocktransfer #${id}`,
            });
          }
          for (let item of items) {
            const transferItemId = await db.stock_transfer_items.add({
              stock_transfer_id: id,
              product_id: item.product_id,
              product_unit_id: item.product_unit_id,
              quantity: item.quantity,
              unit_price: item.calculated_price,
              discount_amount: 0,
              discount_type: 'fixed',
              currency: form.currency,
              subtotal: item.subtotal,
              status: 1,
            });
            if (confirm && (!stocktransferId || form.transfer_status !== 'confirmed')) {
              await applyStockTransfer(tx, {
                transferId: id,
                transferItemId,
                item,
                sourceWarehouseId: form.warehouse_id,
                destWarehouseId: form.to_warehouse_id,
                transferDate: form.transfer_date,
              });
              addedItems.push(item);
            }
          }
          if (confirm && paymentAmount && Number(paymentAmount) > 0) {
            const expensesAccount = await db.accounts
              .where('code')
              .equals('EXPENSES')
              .and((s) => s.status === 1)
              .first();
            if (!expensesAccount) throw new Error('EXPENSES account not found');
            await db.journals.add({
              date: new Date().toISOString(),
              reference_id: Number(id),
              reference_type: 'stock_transfer',
              description: `Expense for Stock Transfer #${id} - ${paymentDescription}`,
              currency: paymentCurrency,
              first_entry_account: expensesAccount.id,
              first_entry_debit: 0,
              first_entry_credit: Number(paymentAmount),
              second_entry_account: second_entry_account,
              second_entry_debit: Number(paymentAmount),
              second_entry_credit: 0,
              status: 1,
            });
          }
        },
      );
      for (const item of addedItems) {
        await calculateProductStock(Number(item.product_id));
      }
      form.transfer_status = confirm ? 'confirmed' : 'draft';
      Swal.fire({
        icon: 'success',
        title: t('Success'),
        text: confirm ? t('Stock Transfer Confirmed.') : t('Draft Saved.'),
        confirmButtonText: t('OK'),
      });
      resetForm();
      push('/dashboard/stock-transfers/');
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('Failed to save stock transfer. Please try again.'),
        confirmButtonText: t('OK'),
      });
    }
    loading = false;
  }

  function resetForm() {
    form = {
      ...form,
      warehouse_id: '',
      to_warehouse_id: '',
      transfer_number: '',
      transfer_date: new Date().toISOString().slice(0, 10),
      description: '',
    };
    items = [];
    paymentAmount = null;
    paymentDescription = '';
    paymentCurrency = form.currency;
  }


</script>

<div class="container-fluid mt-4">
  <div class="card shadow-2">
    <div class="card-body">
      <h4 class="mb-4">
        {stocktransferId ? t('Edit Stock Transfer') : t('New Stock Transfer')}
      </h4>
      <div class="row g-3">
        <div class="col-md-2">
          <input
            readonly
            type="text"
            class="form-control form-control-sm"
            value="{t('Transfer #')}: {form.transfer_number}" />
        </div>
        <div class="col-md-3">
          <div class="input-group input-group-sm persianDatePicker">
            <input type="date" class="form-control form-control-sm dater1" required bind:value={form.transfer_date} />
          </div>
        </div>
        <div class="col-md-2">
          <select class="form-select form-select-sm" bind:value={form.warehouse_id}>
            <option value="">{t('Select From Warehouse')}</option>
            {#each warehouses as w}
              <option value={w.id}>{w.name}</option>
            {/each}
          </select>
        </div>
        <div class="col-md-3">
          <div class="input-group">
            <select class="form-select form-select-sm" bind:value={form.to_warehouse_id}>
              <option value="">{t('Select To Warehouse')}</option>
              {#each warehouses as w}
                <option value={w.id}>{w.name}</option>
              {/each}
            </select>
            <button class="btn btn-info btn-sm pt-1 px-2" type="button" on:click={() => warehouseModalRef.openWarehouseModal()}
              ><i class="bi bi-plus-circle"></i></button>
          </div>
        </div>
        <div class="col-md-2">
          <button
            id="showCurrencyDropdown"
            class="btn btn-secondary dropdown-toggle btn-sm w-100"
            type="button"
            data-mdb-toggle="dropdown"
            aria-expanded="false">
            {form.currency ? t(form.currency) : t('AFN')}
          </button>
          <ul class="dropdown-menu dropdown-menu-end">
            {#each currencies as cur}
              <li>
                <button
                  class="dropdown-item"
                  style={form.currency == cur.code
                    ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                    : ''}
                  on:click={() => (form.currency = cur.code)}
                  type="button">
                  {t(cur.code)}
                </button>
              </li>
            {/each}
          </ul>
        </div>
        <div class="col-md-12">
          <textarea
            class="form-control form-control-sm"
            rows="2"
            bind:value={form.description}
            placeholder={t('Description')}></textarea>
        </div>
      </div>
    </div>
  </div>
  <StockTransferItemsTable bind:items currency={form.currency} warehouse_id={form.warehouse_id} />
  <div class="card shadow-2 mt-4 w-50 ms-auto">
    <div class="card-body">
      <p class="mb-3">{t('Transfer Expense')}</p>
      <div class="row g-3 align-items-end">
        <div class="col-md-12">
          <div class="input-group input-group-sm">
            <div class="form-outline" data-mdb-input-init>
              <input
                type="number"
                id="paymentAmount"
                class="form-control form-control-sm {paymentAmount !== null && paymentAmount <= total_amount
                  ? 'is-valid'
                  : paymentAmount == null
                    ? 'is-invalid'
                    : ''}"
                bind:value={paymentAmount}
                on:input={() => {
                  if (paymentAmount === '') {
                    paymentAmount = null;
                  } else if (paymentAmount < 0) {
                    paymentAmount = 0;
                  } else {
                    paymentAmount = Number(paymentAmount);
                  }
                }} />
              <label class="form-label" for="paymentAmount">{t('Amount')}</label>
            </div>
            <button
              id="showCurrencyDropdown"
              class="btn btn-secondary btn-sm dropdown-toggle px-2"
              type="button"
              data-mdb-toggle="dropdown"
              aria-expanded="false"
              aria-label="Currency">
              {paymentCurrency ? t(paymentCurrency) : t(form.currency)}
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              {#each currencies as cur}
                <li>
                  <button class="dropdown-item" on:click={() => (paymentCurrency = cur.code)} type="button">
                    {t(cur.code)}
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        </div>
        <div class="input-group input-group-sm justify-content-end mt-3">
          <input type="text" class="form-control" bind:value={paymentDescription} placeholder={t('Description')} />
          <button
            id="second_entry_account_search"
            class="btn btn-sm py-2 text-center btn-{second_entry_account == track_ID ? 'danger' : 'light'}"
            type="button"
            data-mdb-toggle="dropdown"
            aria-expanded="false"
            on:click={() => {
              filteredSecondAccounts = accounts;
              showTrackModal = true;
            }}
            ><i class="bi bi-check-circle"></i>
            {#if second_entry_account == track_ID}
              {t('Lang') === 'en'
                ? accounts.find((a) => a.id === track_ID)?.name
                : t('Lang') === 'fa'
                  ? accounts.find((a) => a.id === track_ID)?.name_fa
                  : t('Lang') === 'ps'
                    ? accounts.find((a) => a.id === track_ID)?.name_ps
                    : accounts.find((a) => a.id === track_ID)?.name}
            {:else}
              {t('Track')}
            {/if}
          </button>
          <button
            id="second_entry_account_search"
            class="btn btn-sm py-2 text-center btn-{second_entry_account == treasury_ID ? 'success' : 'light'}"
            type="button"
            data-mdb-toggle="dropdown"
            aria-expanded="false"
            on:click={() => {
              second_entry_account = treasury_ID;
            }}><i class="bi bi-box"></i> {t('Treasury')}</button>
        </div>
        {#if showTrackModal}
          <div class="modal-backdrop fade show"></div>
          <div
            class="modal fade show d-block"
            id="trackModal"
            tabindex="-1"
            aria-labelledby="trackModalLabel"
            aria-hidden="true">
            <div class="modal-dialog">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title" id="trackModalLabel">
                    <i class="bi bi-check-circle"></i>
                    {t('Track')}
                  </h5>
                  <button type="button" class="btn-close" aria-label="Close" on:click={() => (showTrackModal = false)}
                  ></button>
                </div>
                <div class="modal-body">
                  <div class="mb-3">
                    <div class="input-group">
                      <input
                        type="text"
                        class="form-control"
                        placeholder={t('Search accounts...')}
                        bind:value={second_entry_account_search}
                        on:input={() => {
                          filteredSecondAccounts = accounts.filter((acc) => {
                            const name =
                              t('Lang') === 'en'
                                ? acc.name
                                : t('Lang') === 'fa'
                                  ? acc.name_fa
                                  : t('Lang') === 'ps'
                                    ? acc.name_ps
                                    : acc.name;
                            return name && name.toLowerCase().includes(second_entry_account_search.toLowerCase());
                          });
                        }} />
                      <button class="btn btn-outline-primary" on:click={() => modalRef?.openModal()}>
                        <i class="bi bi-plus-circle"></i>
                      </button>
                    </div>
                    <div class="mt-3" style="max-height:300px;overflow:auto;">
                      {#each filteredSecondAccounts as acc}
                        <div class="list-group mt-1">
                          <button
                            type="button"
                            class="list-group-item list-group-item-action"
                            on:click={() => {
                              second_entry_account = acc.id;
                              track_ID = acc.id;
                              showTrackModal = false;
                            }}>
                            {#if t('Lang') === 'en' && acc.name}{acc.name}{/if}
                            {#if t('Lang') === 'fa' && acc.name_fa}{acc.name_fa}{/if}
                            {#if t('Lang') === 'ps' && acc.name_ps}{acc.name_ps}{/if}
                            <span class="badge badge-{getAccountTypeColor(acc.account_type_id)} ms-2 float-end">
                              {#if allAccountTypes.find((at) => at.id === acc.account_type_id)?.name}
                                {t('Lang') === 'en'
                                  ? allAccountTypes.find((at) => at.id === acc.account_type_id)?.name
                                  : t('Lang') === 'fa'
                                    ? allAccountTypes.find((at) => at.id === acc.account_type_id)?.name_fa
                                    : t('Lang') === 'ps'
                                      ? allAccountTypes.find((at) => at.id === acc.account_type_id)?.name_ps
                                      : allAccountTypes.find((at) => at.id === acc.account_type_id)?.name}
                              {:else}
                                N/A
                              {/if}
                            </span>
                          </button>
                        </div>
                        {#if filteredSecondAccounts.length === 0}
                          <div class="text-center text-muted mt-3">
                            {t('No accounts found')}
                          </div>
                        {/if}
                      {/each}
                    </div>
                  </div>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" on:click={() => (showTrackModal = false)}
                    ><i class="bi bi-x-lg"></i>
                    {t('Close')}</button>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="card shadow-2 mt-4">
    <div class="card-body d-flex justify-content-end align-items-center">
      <div>
        <button class="btn btn-secondary me-2" on:click={() => saveStockTransfer(false)} disabled={loading}
          >{t('Save Draft')}</button>
        <button class="btn btn-success" on:click={() => saveStockTransfer(true)} disabled={loading}>{t('Confirm Stock Transfer')}</button>
      </div>
    </div>
  </div>
</div>

<WarehouseModal
bind:this={warehouseModalRef}
on:saved={async (e) => {
  warehouses = await db.warehouses
    .where('status')
    .equals(1)
    .toArray();
  const newWarehouse = e.detail;
  if (newWarehouse) {
    form.to_warehouse_id = newWarehouse.id;
  }
}} />

<AccountModal
bind:this={modalRef}
accountTypes={allAccountTypes}
on:saved={async (e) => {
  accounts = await db.accounts.where({ status: 1 }).toArray();
  second_entry_account = e.detail.account.id;
  track_ID = e.detail.account.id;
  showTrackModal = false;
}} />