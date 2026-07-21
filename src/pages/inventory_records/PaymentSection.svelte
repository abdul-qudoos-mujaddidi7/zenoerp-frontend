<script>
  import { db, logActivity } from '../../db.js';
  import { onMount } from 'svelte';

  import { t, lang, translate_org_type } from '../../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  import { auth } from '../../auth/authStore';
  $: permissions = $auth.permissions;

  import AccountModal from '../accounts/AccountModal.svelte';

  import { toast } from '../../ToastUI/toast.js';

  import JournalReceiptModal from '../journals/JournalReceiptModal.svelte';

  import {calculateRemainingAndBenefit,calculateDiscountAmount} from './InventoryRecordsHelper.js';
  import JournalA4ReceiptModal from '../journals/JournalA4ReceiptModal.svelte';
  let showReceipt = false;
  let showA4Receipt = false;
  let selectedJournal = null;

  import { convertUnit, getMultiple } from '../stocktransactions/calculateStock.js';
  let currencies = [];
  let defaultCurrency = 'AFN';

  let currency = defaultCurrency;

  let inventory_record = null;
  let products = [];
  let units = [];
  let returns = [];
  let returnsWithItems = [];
  let totalReturnAmount = 0;

  let paymentType = 'Receive'; // or "credit"

  export let inventory_recordId;

  let payments = [];
  let amount = '';
  let description = '';
  let totalPayments = 0;

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

  let modalRef;
  async function load() {
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

    payments = await db.inventory_record_payments
      .where('inventory_record_id')
      .equals(Number(inventory_recordId))
      .and((p) => p.status === 1)
      .toArray();

    console.log('Loaded payments:', payments);

    products = await db.products.where('status').equals(1).toArray();
    units = await db.product_units.where('status').equals(1).toArray();
    // Fetch inventory_record returns and their items
    returns = await db.inventory_record_returns
      .where('inventory_record_id')
      .equals(Number(inventory_recordId))
      .and((r) => r.status === 1)
      .toArray();

    totalReturnAmount = 0;

    returns.forEach((ret) => {
      totalReturnAmount += Number(ret.total_amount);
    });
    let tempReturnsWithItems = [];
    for (const r of returns) {
      // Ensure type match for inventory_record_return_id
      const items = await db.inventory_record_return_items
        .where('inventory_record_return_id')
        .equals(Number(r.id))
        .and((r) => r.status === 1)
        .toArray();
      tempReturnsWithItems.push({
        ...r,
        returns: items,
      });
    }
    returnsWithItems = tempReturnsWithItems;

    inventory_record = await db.inventory_records
      .where('id')
      .equals(Number(inventory_recordId))
      .and((s) => s.status === 1)
      .first();
    currency = inventory_record?.currency || defaultCurrency;

    currencies = await db.currencies.where('status').equals(1).toArray();
    if (window.mdb) {
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
    // calculate total payments if currency matches
    totalPayments = payments.reduce((sum, p) => {
      if (p.currency === currency) {
        return sum + Number(p.amount);
      }
      return sum;
    }, 0);

  }

  async function deletePayment(id) {
    const ok = await toast.confirm(t('Are you sure?'), t("You won't be able to revert this!"));

    if (ok) {
      console.log('User confirmed');
      const payment = await db.inventory_record_payments.where('id').equals(Number(id)).first();
      if (!payment) {
        toast.error(t('Error'), t('Payment not found.'));
        return;
      }

      const journals = await db.journals
        .where('reference_id')
        .equals(Number(id))
        .and((j) => j.reference_type === 'inventory_record_payment' && j.status === 1)
        .toArray();

      await db.inventory_record_payments.update(id, { status: 0 });

      for (const j of journals) {
        await db.journals.update(j.id, { status: 0 });
      }
      await calculateRemainingAndBenefit(Number(inventory_recordId));

      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'delete',
        table_name: 'inventory_record_payments',
        entity_id: id,
        old_values: JSON.stringify({ payment, journals }),
        new_values: null,
        description: `Deleted payment of ${payment.amount} ${payment.currency} for inventory_record #${Number(inventory_recordId)}`,
      });
      load();
      toast.success(t('Deleted!'), t('Payment has been deleted.'));
    } else {
      console.log('User cancelled');
    }
  }

  async function deleteReturn(id) {
    const ok = await toast.confirm(t('Are you sure?'), t("You won't be able to revert this!"));

    if (ok) {
      const inventory_record_return = await db.inventory_record_returns.where('id').equals(Number(id)).first();
      if (!inventory_record_return) {
        toast.error(t('Error'), t('InventoryRecord return not found.'));
        return;
      }
      const ret_items = await db.inventory_record_return_items
        .where('inventory_record_return_id')
        .equals(Number(id))
        .and((r) => r.status === 1)
        .toArray();

      const journals = await db.journals
        .where('reference_id')
        .equals(Number(id))
        .and((j) => j.reference_type === 'inventory_record_return' && j.status === 1)
        .toArray();

      await db.inventory_record_returns.update(id, { status: 0 });

      for (const ri of ret_items) {
        await db.inventory_record_return_items.update(ri.id, { status: 0 });
      }

      for (const j of journals) {
        await db.journals.update(j.id, { status: 0 });
      }
      await calculateRemainingAndBenefit(Number(inventory_recordId));

      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'delete',
        table_name: 'inventory_record_returns',
        entity_id: id,
        old_values: JSON.stringify({ inventory_record_return, journals }),
        new_values: null,
        description: `Deleted return of ${inventory_record_return.total_amount} ${inventory_record_return.currency} for inventory_record #${Number(inventory_recordId)}`,
      });
      load();
      toast.success(t('Deleted!'), t('Return has been deleted.'));
    }
  }

  async function addPayment() {
    if (!amount) return;

    let paymentID = null;
    await db.transaction('rw', ['inventory_record_payments', 'inventory_records', 'accounts', 'journals', 'activity_logs'], async () => {
      const myInventoryRecord = await db.inventory_records
        .where('id')
        .equals(Number(inventory_recordId))
        .and((s) => s.status === 1)
        .first();

      let id = await db.inventory_record_payments.add({
        inventory_record_id: Number(inventory_recordId),
        account_id: second_entry_account,
        amount: paymentType == 'Receive' ? Number(amount) : Number(amount) * -1,
        currency: currency,
        payment_date: new Date().toISOString(),
        description: description,
        status: 1,
      });

      paymentID = id;

      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'create',
        table_name: 'inventory_record_payments',
        entity_id: id,
        old_values: null,
        new_values: JSON.stringify({
          inventory_record_id: Number(inventory_recordId),
          account_id: second_entry_account,
          amount: paymentType == 'Receive' ? Number(amount) : Number(amount) * -1,
          currency,
          payment_date: new Date().toISOString(),
          description,
          status: 1,
        }),
        description: `Added payment of ${amount} ${currency} for inventory_record #${Number(inventory_recordId)}`,
      });

      const receivableAccount = await db.accounts
        .where('code')
        .equals('RECEIVABLE')
        .and((s) => s.status === 1)
        .first();

      if (!receivableAccount) {
        throw new Error('RECEIVABLE account not found');
      }

      const inventory_recordsAccount = await db.accounts
        .where('code')
        .equals('SALES')
        .and((s) => s.status === 1)
        .first();

      if (!inventory_recordsAccount) {
        throw new Error('SALES account not found');
      }

      const TreasuryAccount = await db.accounts
        .where('code')
        .equals('TREASURY')
        .and((s) => s.status === 1)
        .first();

      if (!TreasuryAccount) {
        throw new Error('SALES account not found');
      }

      await db.journals.add({
        date: new Date().toISOString(),
        reference_id: Number(id) || null,
        reference_type: 'inventory_record_payment',
        description: description,
        currency: currency,
        first_entry_account: inventory_recordsAccount.id, // Customer (Debit)
        first_entry_debit: paymentType != 'Receive' ? Number(amount) : 0,
        first_entry_credit: paymentType == 'Receive' ? Number(amount) : 0,
        second_entry_account: receivableAccount.id, // Warehouse/Revenue (Credit)
        second_entry_debit: paymentType == 'Receive' ? Number(amount) : 0,
        second_entry_credit: paymentType != 'Receive' ? Number(amount) : 0,
        status: 1,
      });

      await db.journals.add({
        date: new Date().toISOString(),
        reference_id: Number(id) || null,
        reference_type: 'inventory_record_payment',
        description: description,
        currency: currency,
        first_entry_account: myInventoryRecord.account_id, // Customer (Debit)
        first_entry_debit: paymentType != 'Receive' ? Number(amount) : 0,
        first_entry_credit: paymentType == 'Receive' ? Number(amount) : 0,
        second_entry_account: second_entry_account, // Warehouse/Revenue (Credit)
        second_entry_debit: paymentType == 'Receive' ? Number(amount) : 0,
        second_entry_credit: paymentType != 'Receive' ? Number(amount) : 0,
        status: 1,
      });
    });

    selectedJournal = await db.journals
      .where({
        reference_type: 'inventory_record_payment',
        reference_id: Number(paymentID),
        first_entry_account: inventory_record.account_id,
        status: 1,
      })
      .first();
    showA4Receipt = true;
    amount = '';
    
    await calculateRemainingAndBenefit(Number(inventory_recordId));
    load();
  }

  onMount(load);

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = Number(fromCurrency.exchangeRate || 1);
    const toRate = Number(toCurrency.exchangeRate || 1);
    return (amount / toRate) * fromRate;
  }
  let totalBenefitAmount = {};


</script>

<div class="card shadow-2">
  <div class="card-body">
    <div class="row">
      <div class="col-md-8">
        <h5>{t('Payments')}</h5>

        <div class="table-responsive">
          <table class="table table-striped table-sm">
            <thead class="table-light">
              <tr>
                <th>{t('Date')}</th>
                <th>{t('Description')}</th>
                <th class="text-end">{t('Amount')}</th>
                <th class="text-center">{t('To Account')}</th>
                <th class="text-center">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {#each payments as p}
                <tr>
                  <td>{p.payment_date.slice(0, 10)}</td>
                  <td>{p.description}</td>
                  <td class="text-end"><span dir="ltr">{p.amount}</span> {t(p.currency)}</td>
                  <td class="text-center">{getAccountName(p.account_id)}</td>
                  <td class="text-center">
                    <button class="btn btn-danger btn-sm px-2 me-2" on:click={() => deletePayment(p.id)}
                      ><i class="bi bi-trash"></i> {t('Delete')}</button>

                    <button
                      class="btn btn-sm btn-outline-primary me-1 px-2"
                      on:click={async () => {
                        selectedJournal = await db.journals
                          .where({
                            reference_type: 'inventory_record_payment',
                            reference_id: p.id,
                            first_entry_account: inventory_record.account_id,
                            status: 1,
                          })
                          .first();
                        showA4Receipt = true;
                      }}>
                      <i class="bi bi-printer"></i>
                    </button>


                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <hr />

        <h5>{t('Returns')}</h5>
        {#if returnsWithItems.length === 0}
          <div class="text-muted">{t('No returns found.')}</div>
        {:else}
          {#each returnsWithItems as ret}
            <div class="mb-3">
              <div class="fw-bold">
                <button class="btn btn-danger btn-sm px-2 float-end" on:click={() => deleteReturn(ret.id)}
                  ><i class="bi bi-trash"></i> {t('Delete')}</button>
                {t('Return Number')}: {ret.return_number}
              </div>
              <div>{t('Return Date')}: {ret.return_date}</div>
              {#if ret.description}<div>{t('Description')}: {ret.description}</div>{/if}
              <div class="table-responsive">
                <table class="table table-sm table-striped">
                  <thead class="table-light">
                    <tr>
                      <th>{t('Product')}</th>
                      <th>{t('Return Qty')}</th>
                      <th>{t('Return Price')}</th>
                      <th>{t('Subtotal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each ret.returns as item}
                      <tr>
                        <td>{products.find((p) => p.id === item.product_id)?.name}</td>
                        <td>{item.quantity} {units.find((u) => u.id === item.product_unit_id)?.name}</td>
                        <td>{item.unit_price} {t(currency)}</td>
                        <td>{item.subtotal} {t(currency)}</td>
                      </tr>
                    {/each}
                    <tr style="border-top:2px solid #aaa">
                      <td colspan="3" class="text-end fw-bold">{t('Total')}</td>
                      <td class="fw-bold"
                        >{ret.total_amount.toLocaleString()}
                        {t(currency)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          {/each}
        {/if}
      </div>
      <div class="col-md-4">
      
{#if permissions?.some(p => p.code === "Benefit" && p.view)}
        <div class="mb-4 fs-6 fw-bold float-end">
          <span class="text-dark">
            {t('Total')} {t('Benefit')}: <span class="text-{inventory_record?.benefit < 0 ? 'danger' : 'success'}"><span dir="ltr">{inventory_record?.benefit ? Number(inventory_record?.benefit || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }) : 0}</span>
          {t(inventory_record?.currency)}</span></span>
        </div>
        {/if}
        <div class="mb-4 fs-6 fw-bold">
          {t('Total')}: {(Number(inventory_record?.total_amount || 0) + Number(calculateDiscountAmount(inventory_record) || 0) -  Number(inventory_record?.expense_amount || 0)).toLocaleString(undefined, { maximumFractionDigits: 3 })}
          {t(inventory_record?.currency)}
        </div>
        <div class="mb-4 fs-6 fw-bold text-info">
          {t('Discount')}: 
           {inventory_record?.discount_type=='percent' ? `(${Number(inventory_record?.discount_amount).toLocaleString(undefined, { maximumFractionDigits: 3 })}%)` : ''}
          {inventory_record?.discount_amount ? Number(calculateDiscountAmount(inventory_record) || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }) : 0}
          {t(inventory_record?.currency)}
        </div>
        <div class="mb-4 fs-6 fw-bold text-warning">
          {t('Expenses')}: {inventory_record?.expense_amount ? Number(inventory_record?.expense_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }) : 0}
          {t(inventory_record?.currency)}
        </div>
        <div class="mb-4 fs-6 fw-bold">
          {t('Payable')}: {Number(inventory_record?.total_amount || 0).toLocaleString(undefined, {  maximumFractionDigits: 3 })}
          {t(inventory_record?.currency)}
        </div>
        <div class="mb-4 fs-6 fw-bold">
          {t('Total Payments')}: {totalPayments.toLocaleString(undefined, { maximumFractionDigits: 3 })}
          {t(inventory_record?.currency)}
        </div>
        <div class="mb-4 fs-6 fw-bold">
          {t('Total Returns Amount')}: {Number(totalReturnAmount).toLocaleString(undefined, { maximumFractionDigits: 3 })}
          {t(inventory_record?.currency)}
        </div>
        <div class="mb-4 fs-6 fw-bold text-danger">
          {t('Remaining')}:
          <span dir="ltr"
            >{Number(inventory_record?.remaining || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
          {t(inventory_record?.currency)}
        </div>

        <div class="hide-for-pdf">
          <hr />
          <h5>{t('Add Payment')}</h5>

          <div class="input-group input-group-sm my-3">
            <!-- Floating label input -->
            <button
              class="btn btn-sm pt-1 btn-outline-{paymentType === 'Payment' ? 'danger' : 'primary'} w-50"
              type="button"
              on:click={() => (paymentType = paymentType === 'Payment' ? 'Receive' : 'Payment')}>
              {@html paymentType === 'Payment'
                ? "<i class='bi bi-arrow-up-left-circle'></i>"
                : "<i class='bi bi-arrow-down-right-circle'></i>"}
              {t(paymentType)}
            </button>
            <div class="form-outline flex-grow-1" data-mdb-input-init>
              <input type="number" id="amount" class="form-control form-control-sm" bind:value={amount} />
              <label class="form-label" for="amount">{t('Amount')}</label>
            </div>

            <button
              id="showCurrencyDropdown"
              class="btn btn-secondary btn-sm dropdown-toggle pt-2"
              type="button"
              data-mdb-toggle="dropdown"
              aria-expanded="false">
              {currency ? t(currency) : t(defaultCurrency)}
            </button>

            <ul class="dropdown-menu dropdown-menu-end">
              {#each currencies as cur}
                <li>
                  <button class="dropdown-item" on:click={() => (currency = cur.code)} type="button">
                    {t(cur.code)}
                  </button>
                </li>
              {/each}
            </ul>
          </div>

          <div class="input-group input-group-sm justify-content-end mt-3">
            <input type="text" class="form-control" bind:value={description} placeholder={t('Description')} />
            <button
              id="second_entry_account_search"
              class="btn btn-sm py-2 text-center btn-{second_entry_account == track_ID ? 'danger' : 'light'}"
              type="button"
              data-mdb-toggle="dropdown"
              aria-expanded="false"
              on:click={() => {
                // const modalEl =
                //     document.getElementById("trackModal");
                // if (modalEl) {
                //     const modal = new window.mdb.Modal(modalEl);
                //     modal.show();
                // }
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
                    <!-- This is where all accounts are listed and selectable and searchable -->
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
                                // const modalEl =
                                //     document.getElementById(
                                //         "trackModal",
                                //     );
                                // if (modalEl) {
                                //     const modal =
                                //         window.mdb.Modal.getInstance(
                                //             modalEl,
                                //         );
                                //     modal.hide();
                                // }
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
                    <!-- <button type="button" class="btn btn-primary" data-mdb-ripple-init></button> -->
                  </div>
                </div>
              </div>
            </div>
          {/if}

          <button class="btn btn-success btn-sm w-100 my-3" on:click={addPayment}>
            <i class="bi bi-plus-circle me-2"></i>{t('Add Payment')}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<AccountModal
  bind:this={modalRef}
  accountTypes={allAccountTypes}
  on:saved={async (e) => {
    accounts = await db.accounts.where({ status: 1 }).toArray();
    second_entry_account = e.detail.account.id;
    track_ID = e.detail.account.id;
    // const modalEl =
    //     document.getElementById("trackModal");
    // if (modalEl) {
    //     const modal =
    //         window.mdb.Modal.getInstance(modalEl);
    //     modal.hide();
    // }
    showTrackModal = false;
  }} />

{#if showReceipt}
  <JournalReceiptModal journal={selectedJournal} inventory_recordData={{
    currency: inventory_record?.currency,
    total:(Number(inventory_record?.total_amount || 0) + Number(inventory_record?.discount_amount || 0)).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    discount: inventory_record?.discount_amount ? Number(inventory_record?.discount_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }): 0,
    expenses: inventory_record?.expense_amount ? Number(inventory_record?.expense_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }) : 0,
    payable: Number(inventory_record?.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    totalPayments: totalPayments.toLocaleString(undefined, { maximumFractionDigits: 3 }),
    totalReturns: Number(totalReturnAmount).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    remaining: (Number(inventory_record?.total_amount || 0) - Number(totalPayments) - Number(totalReturnAmount)).toLocaleString(undefined, { maximumFractionDigits: 3 }),
  }} on:close={() => (showReceipt = false)} />
{/if}


{#if showA4Receipt}
  <JournalA4ReceiptModal journal={selectedJournal} inventory_recordData={{
    currency: inventory_record?.currency,
    total:(Number(inventory_record?.total_amount || 0) + Number(inventory_record?.discount_amount || 0)).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    discount: inventory_record?.discount_amount ? Number(inventory_record?.discount_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }): 0,
    expenses: inventory_record?.expense_amount ? Number(inventory_record?.expense_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }) : 0,
    payable: Number(inventory_record?.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    totalPayments: totalPayments.toLocaleString(undefined, { maximumFractionDigits: 3 }),
    totalReturns: Number(totalReturnAmount).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    remaining: (Number(inventory_record?.total_amount || 0) - Number(totalPayments) - Number(totalReturnAmount)).toLocaleString(undefined, { maximumFractionDigits: 3 }),
  }} on:close={() => (showA4Receipt = false)} />
{/if}
