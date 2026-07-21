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
  import { confirmModal } from '../../components/common/confirmModal.js';

  import JournalReceiptModal from '../journals/JournalReceiptModal.svelte';

  import {calculateRemainingAndBenefit,calculateDiscountAmount} from './SalesHelper.js';
  import JournalA4ReceiptModal from '../journals/JournalA4ReceiptModal.svelte';
  let showReceipt = false;
  let showA4Receipt = false;
  let selectedJournal = null;

  import { calculateProductStock, convertUnit, getMultiple } from '../stocktransactions/calculateStock.js';
  let currencies = [];
  let defaultCurrency = 'AFN';

  let currency = defaultCurrency;

  let sale = null;
  let products = [];
  let units = [];
  let returns = [];
  let returnsWithItems = [];
  let totalReturnAmount = 0;

  let paymentType = 'Receive'; // or "credit"

  export let saleId;

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

    payments = await db.sale_payments
      .where('sale_id')
      .equals(Number(saleId))
      .and((p) => p.status === 1)
      .toArray();

    console.log('Loaded payments:', payments);

    products = await db.products.where('status').equals(1).toArray();
    units = await db.product_units.where('status').equals(1).toArray();
    // Fetch sale returns and their items
    returns = await db.sale_returns
      .where('sale_id')
      .equals(Number(saleId))
      .and((r) => r.status === 1)
      .toArray();

    totalReturnAmount = 0;

    returns.forEach((ret) => {
      totalReturnAmount += Number(ret.total_amount);
    });
    let tempReturnsWithItems = [];
    for (const r of returns) {
      // Ensure type match for sale_return_id
      const items = await db.sale_return_items
        .where('sale_return_id')
        .equals(Number(r.id))
        .and((r) => r.status === 1)
        .toArray();
      tempReturnsWithItems.push({
        ...r,
        returns: items,
      });
    }
    returnsWithItems = tempReturnsWithItems;

    sale = await db.sales
      .where('id')
      .equals(Number(saleId))
      .and((s) => s.status === 1)
      .first();
    currency = sale?.currency || defaultCurrency;

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
    const ok = await confirmModal({
      title: t('Are you sure?'),
      message: t("You won't be able to revert this!"),
      confirmText: t('Delete'),
      cancelText: t('Cancel'),
      variant: 'danger',
      icon: 'bi-trash',
    });

    if (ok) {
      const payment = await db.sale_payments.where('id').equals(Number(id)).first();
      if (!payment) {
        toast.error(t('Error'), t('Payment not found.'));
        return;
      }

      const journals = await db.journals
        .where('reference_id')
        .equals(Number(id))
        .and((j) => j.reference_type === 'sale_payment' && j.status === 1)
        .toArray();

      await db.sale_payments.update(id, { status: 0 });

      for (const j of journals) {
        await db.journals.update(j.id, { status: 0 });
      }
      await calculateRemainingAndBenefit(Number(saleId));

      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'delete',
        table_name: 'sale_payments',
        entity_id: id,
        old_values: JSON.stringify({ payment, journals }),
        new_values: null,
        description: `Deleted payment of ${payment.amount} ${payment.currency} for sale #${Number(saleId)}`,
      });
      load();
      toast.success(t('Deleted!'), t('Payment has been deleted.'));
    }
  }

  async function deleteReturn(id) {
    const ok = await confirmModal({
      title: t('Are you sure?'),
      message: t("You won't be able to revert this!"),
      confirmText: t('Delete'),
      cancelText: t('Cancel'),
      variant: 'danger',
      icon: 'bi-trash',
    });

    if (ok) {
      const sale_return = await db.sale_returns.where('id').equals(Number(id)).first();
      if (!sale_return) {
        toast.error(t('Error'), t('Sale return not found.'));
        return;
      }
      const ret_items = await db.sale_return_items
        .where('sale_return_id')
        .equals(Number(id))
        .and((r) => r.status === 1)
        .toArray();

      const journals = await db.journals
        .where('reference_id')
        .equals(Number(id))
        .and((j) => j.reference_type === 'sale_return' && j.status === 1)
        .toArray();

      const stockTransactions = await db.stock_transactions
        .where('reference_type')
        .equals('sale_return')
        .and((transaction) => Number(transaction.reference_id) === Number(id) && transaction.status === 1)
        .toArray();

      await db.sale_returns.update(id, { status: 0 });

      for (const ri of ret_items) {
        await db.sale_return_items.update(ri.id, { status: 0 });
      }

      for (const j of journals) {
        await db.journals.update(j.id, { status: 0 });
      }

      for (const transaction of stockTransactions) {
        await db.stock_transactions.update(transaction.id, { status: 0 });
      }

      const affectedProductIds = [
        ...new Set(stockTransactions.map((transaction) => Number(transaction.product_id))),
      ].filter(Number.isFinite);

      for (const productId of affectedProductIds) {
        await calculateProductStock(productId);
      }

      await calculateRemainingAndBenefit(Number(saleId));

      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'delete',
        table_name: 'sale_returns',
        entity_id: id,
        old_values: JSON.stringify({ sale_return, journals, stock_transactions: stockTransactions }),
        new_values: null,
        description: `Deleted return of ${sale_return.total_amount} ${sale_return.currency} for sale #${Number(saleId)}`,
      });
      load();
      toast.success(t('Deleted!'), t('Return has been deleted.'));
    }
  }

  async function addPayment() {
    if (!amount) return;

    let paymentID = null;
    await db.transaction('rw', ['sale_payments', 'sales', 'accounts', 'journals', 'activity_logs'], async () => {
      const mySale = await db.sales
        .where('id')
        .equals(Number(saleId))
        .and((s) => s.status === 1)
        .first();

      let id = await db.sale_payments.add({
        sale_id: Number(saleId),
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
        table_name: 'sale_payments',
        entity_id: id,
        old_values: null,
        new_values: JSON.stringify({
          sale_id: Number(saleId),
          account_id: second_entry_account,
          amount: paymentType == 'Receive' ? Number(amount) : Number(amount) * -1,
          currency,
          payment_date: new Date().toISOString(),
          description,
          status: 1,
        }),
        description: `Added payment of ${amount} ${currency} for sale #${Number(saleId)}`,
      });

      const receivableAccount = await db.accounts
        .where('code')
        .equals('RECEIVABLE')
        .and((s) => s.status === 1)
        .first();

      if (!receivableAccount) {
        throw new Error('RECEIVABLE account not found');
      }

      const salesAccount = await db.accounts
        .where('code')
        .equals('SALES')
        .and((s) => s.status === 1)
        .first();

      if (!salesAccount) {
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
        reference_type: 'sale_payment',
        description: description,
        currency: currency,
        first_entry_account: salesAccount.id, // Customer (Debit)
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
        reference_type: 'sale_payment',
        description: description,
        currency: currency,
        first_entry_account: mySale.account_id, // Customer (Debit)
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
        reference_type: 'sale_payment',
        reference_id: Number(paymentID),
        first_entry_account: sale.account_id,
        status: 1,
      })
      .first();
    showA4Receipt = true;
    amount = '';
    
    await calculateRemainingAndBenefit(Number(saleId));
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
  let activeLedgerTab = 'payments';
  let showAddPaymentForm = false;

  function formatAmount(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
  }

  $: salePayable = Number(sale?.total_amount || 0);
  $: saleRemaining = Number(sale?.remaining || 0);

  function isOverdue(saleRecord) {
    if (saleRemaining <= 0 || !saleRecord?.due_date) return false;
    const due = new Date(saleRecord.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return due < today;
  }

  $: hasBenefitView = permissions?.some((p) => p.code === 'Benefit' && p.view);

  $: summaryFourthCard = (() => {
    if (hasBenefitView && saleRemaining <= 0) {
      const benefit = Number(sale?.benefit || 0);
      return {
        label: `${t('Total')} ${t('Benefit')}`,
        amount: benefit,
        tone: benefit >= 0 ? 'credit' : 'overdue',
        icon: 'graph-up-arrow',
      };
    }
    if (saleRemaining > 0) {
      return {
        label: t('Remaining'),
        amount: saleRemaining,
        tone: isOverdue(sale) ? 'overdue' : 'unpaid',
        icon: isOverdue(sale) ? 'exclamation-triangle' : 'clock',
      };
    }
    return {
      label: t('Remaining'),
      amount: 0,
      tone: 'settled',
      icon: 'check-circle',
    };
  })();

  async function toggleAddPaymentForm() {
    showAddPaymentForm = !showAddPaymentForm;
  }
</script>

<div class="purchase-payment-section">
  <div class="purchase-detail-summary">
    <div class="purchase-summary-card">
      <div class="purchase-summary-card__icon purchase-summary-card__icon--total">
        <i class="bi bi-receipt"></i>
      </div>
      <div class="purchase-summary-card__body">
        <span class="purchase-summary-card__label">{t('Payable')}</span>
        <span class="purchase-summary-card__value" dir="ltr">
          {formatAmount(salePayable)}
          <small>{t(sale?.currency)}</small>
        </span>
      </div>
    </div>

    <div class="purchase-summary-card">
      <div class="purchase-summary-card__icon purchase-summary-card__icon--paid">
        <i class="bi bi-cash-coin"></i>
      </div>
      <div class="purchase-summary-card__body">
        <span class="purchase-summary-card__label">{t('Total Payments')}</span>
        <span class="purchase-summary-card__value" dir="ltr">
          {formatAmount(totalPayments)}
          <small>{t(sale?.currency)}</small>
        </span>
      </div>
    </div>

    <div class="purchase-summary-card">
      <div class="purchase-summary-card__icon purchase-summary-card__icon--returns">
        <i class="bi bi-arrow-return-left"></i>
      </div>
      <div class="purchase-summary-card__body">
        <span class="purchase-summary-card__label">{t('Total Returns Amount')}</span>
        <span class="purchase-summary-card__value" dir="ltr">
          {formatAmount(totalReturnAmount)}
          <small>{t(sale?.currency)}</small>
        </span>
      </div>
    </div>

    <div class="purchase-summary-card purchase-summary-card--remaining purchase-summary-card--{summaryFourthCard.tone}">
      <div class="purchase-summary-card__icon purchase-summary-card__icon--{summaryFourthCard.tone}">
        <i class="bi bi-{summaryFourthCard.icon}"></i>
      </div>
      <div class="purchase-summary-card__body">
        <span class="purchase-summary-card__label">{summaryFourthCard.label}</span>
        <span class="purchase-summary-card__value purchase-summary-card__value--{summaryFourthCard.tone}" dir="ltr">
          {formatAmount(summaryFourthCard.amount)}
          <small>{t(sale?.currency)}</small>
        </span>
      </div>
    </div>
  </div>

  {#if Number(calculateDiscountAmount(sale) || 0) > 0 || Number(sale?.expense_amount || 0) > 0}
    <div class="sale-payment-meta">
      {#if Number(calculateDiscountAmount(sale) || 0) > 0}
        <span>{t('Discount')}: <strong dir="ltr">{formatAmount(calculateDiscountAmount(sale))} {t(sale?.currency)}</strong></span>
      {/if}
      {#if Number(sale?.expense_amount || 0) > 0}
        <span>{t('Expenses')}: <strong dir="ltr">{formatAmount(sale?.expense_amount)} {t(sale?.currency)}</strong></span>
      {/if}
    </div>
  {/if}

  <slot />

  <section class="pd-ledger-card">
    <div class="pd-ledger-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        class="pd-ledger-tab"
        class:pd-ledger-tab--active={activeLedgerTab === 'payments'}
        on:click={() => (activeLedgerTab = 'payments')}>
        <i class="bi bi-credit-card"></i>
        {t('Payments')}
        {#if payments.length > 0}
          <span class="pd-ledger-tab__count">{payments.length}</span>
        {/if}
      </button>
      <button
        type="button"
        role="tab"
        class="pd-ledger-tab"
        class:pd-ledger-tab--active={activeLedgerTab === 'returns'}
        on:click={() => (activeLedgerTab = 'returns')}>
        <i class="bi bi-arrow-return-left"></i>
        {t('Returns')}
        {#if returnsWithItems.length > 0}
          <span class="pd-ledger-tab__count">{returnsWithItems.length}</span>
        {/if}
      </button>
    </div>

    {#if activeLedgerTab === 'payments'}
      <div class="pd-ledger-panel hide-for-pdf" role="tabpanel">
        <div class="pd-ledger-panel__toolbar">
          <button type="button" class="pd-btn pd-btn--primary pd-btn--sm" on:click={toggleAddPaymentForm}>
            <i class="bi bi-{showAddPaymentForm ? 'x-lg' : 'plus-lg'}"></i>
            {showAddPaymentForm ? t('Close') : t('Add Payment')}
          </button>
        </div>

        {#if showAddPaymentForm}
          <div class="sale-add-payment__body">
            <div class="input-group input-group-sm my-3">
              <button
                class="btn btn-sm pt-1 btn-outline-{paymentType === 'Payment' ? 'danger' : 'primary'}"
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
                on:click={() => {
                  filteredSecondAccounts = accounts;
                  showTrackModal = true;
                }}><i class="bi bi-check-circle"></i>
                {#if second_entry_account == track_ID}
                  {getAccountName(track_ID)}
                {:else}
                  {t('Track')}
                {/if}
              </button>
              <button
                id="second_entry_account_treasury"
                class="btn btn-sm py-2 text-center btn-{second_entry_account == treasury_ID ? 'success' : 'light'}"
                type="button"
                on:click={() => {
                  second_entry_account = treasury_ID;
                }}><i class="bi bi-box"></i> {t('Treasury')}</button>
            </div>

            <button class="btn btn-success btn-sm w-100 my-3" on:click={addPayment}>
              <i class="bi bi-plus-circle me-2"></i>{t('Add Payment')}
            </button>
          </div>
        {/if}

        {#if payments.length === 0}
          <div class="pd-ledger-empty">
            <i class="bi bi-credit-card"></i>
            <p>{t('No payments recorded.')}</p>
          </div>
        {:else}
          <div class="pd-card__scroll">
            <table class="pd-table pd-table--payments">
              <colgroup>
                <col class="pd-table__col-date" />
                <col class="pd-table__col-desc" />
                <col class="pd-table__col-num" />
                <col class="pd-table__col-account" />
                <col class="pd-table__col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>{t('Date')}</th>
                  <th>{t('Description')}</th>
                  <th class="pd-table__col-num">{t('Amount')}</th>
                  <th class="pd-table__col-account">{t('To Account')}</th>
                  <th class="pd-table__col-actions">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {#each payments as p}
                  <tr>
                    <td>{p.payment_date.slice(0, 10)}</td>
                    <td>{p.description || '—'}</td>
                    <td class="pd-table__amount pd-table__col-num">
                      <span class="pd-table__num" dir="ltr">
                        {formatAmount(p.amount)}
                        <span class="pd-table__currency">{t(p.currency)}</span>
                      </span>
                    </td>
                    <td class="pd-table__col-account">{getAccountName(p.account_id)}</td>
                    <td class="pd-table__col-actions">
                      <button type="button" class="pd-btn pd-btn--danger-outline pd-btn--sm" on:click={() => deletePayment(p.id)}>
                        <i class="bi bi-trash"></i>
                        {t('Delete')}
                      </button>
                      <button
                        type="button"
                        class="pd-btn pd-btn--outline pd-btn--sm"
                        on:click={async () => {
                          selectedJournal = await db.journals
                            .where({
                              reference_type: 'sale_payment',
                              reference_id: p.id,
                              first_entry_account: sale.account_id,
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
        {/if}
      </div>
    {:else}
      <div class="pd-ledger-panel" role="tabpanel">
        {#if returnsWithItems.length === 0}
          <div class="pd-ledger-empty">
            <i class="bi bi-arrow-return-left"></i>
            <p>{t('No returns found.')}</p>
          </div>
        {:else}
          <div class="purchase-returns-list">
            {#each returnsWithItems as ret}
              <article class="purchase-return-block">
                <div class="purchase-return-block__head">
                  <div class="purchase-return-block__info">
                    <div class="purchase-return-block__id">
                      <span class="purchase-return-block__id-label">{t('Return Number')}</span>
                      <span class="purchase-return-block__id-value" dir="ltr">{ret.return_number}</span>
                    </div>
                    <span class="purchase-return-block__date">{t('Return Date')}: {ret.return_date}</span>
                    {#if ret.description}
                      <p class="purchase-return-block__desc">{ret.description}</p>
                    {/if}
                  </div>
                  <button type="button" class="pd-btn pd-btn--danger-outline pd-btn--sm" on:click={() => deleteReturn(ret.id)}>
                    <i class="bi bi-trash"></i>
                    {t('Delete')}
                  </button>
                </div>
                <div class="pd-card__scroll">
                  <table class="pd-table pd-table--nested">
                    <thead>
                      <tr>
                        <th>{t('Product')}</th>
                        <th>{t('Return Qty')}</th>
                        <th class="pd-table__col-num">{t('Return Price')}</th>
                        <th class="pd-table__col-num">{t('Subtotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each ret.returns as item}
                        <tr>
                          <td class="pd-table__product">{products.find((p) => p.id === item.product_id)?.name || '—'}</td>
                          <td>{item.quantity} {units.find((u) => u.id === item.product_unit_id)?.name || ''}</td>
                          <td class="pd-table__amount pd-table__col-num">
                            <span class="pd-table__num" dir="ltr">
                              {formatAmount(item.unit_price)}
                              <span class="pd-table__currency">{t(currency)}</span>
                            </span>
                          </td>
                          <td class="pd-table__amount pd-table__col-num">
                            <span class="pd-table__num" dir="ltr">
                              {formatAmount(item.subtotal)}
                              <span class="pd-table__currency">{t(currency)}</span>
                            </span>
                          </td>
                        </tr>
                      {/each}
                      <tr class="pd-table__total-row">
                        <td colspan="3">{t('Total')}</td>
                        <td class="pd-table__amount pd-table__col-num">
                          <span class="pd-table__num" dir="ltr">
                            {formatAmount(ret.total_amount)}
                            <span class="pd-table__currency">{t(currency)}</span>
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </section>
</div>

{#if showTrackModal}
  <div class="modal-backdrop fade show"></div>
  <div class="modal fade show d-block" id="trackModal" tabindex="-1" aria-labelledby="trackModalLabel" aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="trackModalLabel">
            <i class="bi bi-check-circle"></i>
            {t('Track')}
          </h5>
          <button type="button" class="btn-close" aria-label="Close" on:click={() => (showTrackModal = false)}></button>
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
              {/each}
              {#if filteredSecondAccounts.length === 0}
                <div class="text-center text-muted mt-3">{t('No accounts found')}</div>
              {/if}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click={() => (showTrackModal = false)}>
            <i class="bi bi-x-lg"></i>
            {t('Close')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

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
  <JournalReceiptModal journal={selectedJournal} saleData={{
    currency: sale?.currency,
    total:(Number(sale?.total_amount || 0) + Number(sale?.discount_amount || 0)).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    discount: sale?.discount_amount ? Number(sale?.discount_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }): 0,
    expenses: sale?.expense_amount ? Number(sale?.expense_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }) : 0,
    payable: Number(sale?.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    totalPayments: totalPayments.toLocaleString(undefined, { maximumFractionDigits: 3 }),
    totalReturns: Number(totalReturnAmount).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    remaining: (Number(sale?.total_amount || 0) - Number(totalPayments) - Number(totalReturnAmount)).toLocaleString(undefined, { maximumFractionDigits: 3 }),
  }} on:close={() => (showReceipt = false)} />
{/if}


{#if showA4Receipt}
  <JournalA4ReceiptModal journal={selectedJournal} saleData={{
    currency: sale?.currency,
    total:(Number(sale?.total_amount || 0) + Number(sale?.discount_amount || 0)).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    discount: sale?.discount_amount ? Number(sale?.discount_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }): 0,
    expenses: sale?.expense_amount ? Number(sale?.expense_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }) : 0,
    payable: Number(sale?.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    totalPayments: totalPayments.toLocaleString(undefined, { maximumFractionDigits: 3 }),
    totalReturns: Number(totalReturnAmount).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    remaining: (Number(sale?.total_amount || 0) - Number(totalPayments) - Number(totalReturnAmount)).toLocaleString(undefined, { maximumFractionDigits: 3 }),
  }} on:close={() => (showA4Receipt = false)} />
{/if}

<style>
  .purchase-payment-section {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .purchase-detail-summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
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
    min-height: 68px;
  }

  .purchase-summary-card--remaining.purchase-summary-card--unpaid {
    border-color: #fde68a;
  }

  .purchase-summary-card--remaining.purchase-summary-card--overdue {
    border-color: #fca5a5;
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

  .purchase-summary-card__icon--overdue {
    background: #fef2f2;
    color: #ef4444;
  }

  .purchase-summary-card__icon--credit,
  .purchase-summary-card__icon--settled {
    background: #f0fdf4;
    color: #10b981;
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
    font-variant-numeric: tabular-nums;
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

  .purchase-summary-card__value--overdue {
    font-size: 1.125rem;
    font-weight: 800;
    color: #ef4444;
  }

  .purchase-summary-card__value--settled {
    color: #0f172a;
  }

  .purchase-summary-card__value--credit {
    color: #059669;
  }

  .sale-payment-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 24px;
    padding: 12px 16px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    font-size: 13px;
    color: #64748b;
  }

  .sale-add-payment__body {
    padding: 16px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
  }

  .pd-ledger-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    overflow: hidden;
  }

  .pd-ledger-tabs {
    display: flex;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
  }

  .pd-ledger-tab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    justify-content: center;
    padding: 10px 16px;
    border: none;
    background: transparent;
    color: #64748b;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border-block-end: 2px solid transparent;
    margin-block-end: -1px;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }

  .pd-ledger-tab:hover {
    color: #0f172a;
    background: #ffffff;
  }

  .pd-ledger-tab--active {
    color: #0f6efd;
    background: #ffffff;
    border-block-end-color: #0f6efd;
  }

  .pd-ledger-tab__count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding-inline: 6px;
    border-radius: 999px;
    background: #eff6ff;
    color: #0f6efd;
    font-size: 11px;
    font-weight: 700;
  }

  .pd-ledger-panel {
    min-height: 0;
  }

  .pd-ledger-panel__toolbar {
    display: flex;
    justify-content: flex-end;
    padding: 8px 16px;
    border-bottom: 1px solid #f1f5f9;
  }

  .pd-ledger-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 20px 16px;
    text-align: center;
    color: #64748b;
  }

  .pd-ledger-empty i {
    font-size: 1.25rem;
    color: #cbd5e1;
  }

  .pd-ledger-empty p {
    margin: 0;
    font-size: 14px;
  }

  .pd-card__scroll {
    overflow-x: auto;
  }

  .pd-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }

  .pd-table--payments col.pd-table__col-date {
    width: 14%;
  }

  .pd-table--payments col.pd-table__col-desc {
    width: 28%;
  }

  .pd-table--payments col.pd-table__col-num {
    width: 18%;
  }

  .pd-table--payments col.pd-table__col-account {
    width: 22%;
  }

  .pd-table--payments col.pd-table__col-actions {
    width: 18%;
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

  .pd-table th.pd-table__col-date,
  .pd-table td.pd-table__col-date,
  .pd-table th.pd-table__col-num,
  .pd-table td.pd-table__col-num,
  .pd-table th.pd-table__col-actions,
  .pd-table td.pd-table__col-actions {
    text-align: end;
  }

  .pd-table th.pd-table__col-desc,
  .pd-table td.pd-table__col-desc,
  .pd-table th.pd-table__col-account,
  .pd-table td.pd-table__col-account {
    text-align: start;
  }

  .pd-table td.pd-table__col-actions {
    white-space: nowrap;
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

  .pd-table--nested td,
  .pd-table--nested th {
    padding: 10px 14px;
    font-size: 13px;
  }

  .pd-table__amount {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .pd-table__product {
    font-weight: 600;
    color: #0f172a;
  }

  .pd-table__currency {
    margin-inline-start: 4px;
    font-size: 12px;
    color: #64748b;
    font-weight: 500;
  }

  .pd-table__total-row td {
    background: #f8fafc;
    font-weight: 700;
    border-block-start: 1px solid #e2e8f0;
  }

  .pd-table__total-row td:first-child {
    text-align: end;
  }

  .purchase-returns-list {
    padding: 8px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .purchase-return-block {
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
  }

  .purchase-return-block__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
  }

  .purchase-return-block__info {
    min-width: 0;
    flex: 1;
  }

  .purchase-return-block__id {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
    min-width: 0;
  }

  .purchase-return-block__id-label {
    font-size: 11px;
    font-weight: 500;
    color: #64748b;
    flex-shrink: 0;
  }

  .purchase-return-block__id-value {
    font-size: 12px;
    font-weight: 600;
    color: #475569;
    font-family: ui-monospace, monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
  }

  .purchase-return-block__date {
    display: block;
    font-size: 12px;
    color: #64748b;
  }

  .purchase-return-block__desc {
    margin: 6px 0 0;
    font-size: 13px;
    color: #475569;
  }

  .pd-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 10px;
    padding: 8px 14px;
    font-weight: 600;
    font-size: 13px;
    border: 1px solid transparent;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .pd-btn--sm {
    padding: 6px 10px;
    font-size: 12px;
  }

  .pd-btn--primary {
    background: #0f6efd;
    color: #ffffff;
    border-color: #0f6efd;
  }

  .pd-btn--primary:hover {
    background: #1d4ed8;
  }

  .pd-btn--outline {
    background: #ffffff;
    color: #475569;
    border-color: #e2e8f0;
  }

  .pd-btn--outline:hover {
    background: #f8fafc;
  }

  .pd-btn--danger-outline {
    background: #ffffff;
    color: #ef4444;
    border-color: #ef4444;
  }

  .pd-btn--danger-outline:hover {
    background: #fef2f2;
  }

  @media (max-width: 992px) {
    .purchase-detail-summary {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 576px) {
    .purchase-detail-summary {
      grid-template-columns: 1fr;
    }

    .pd-ledger-tab {
      padding: 10px 12px;
      font-size: 12px;
    }
  }
</style>
