<script>
  import { onMount, tick } from 'svelte';
  import { db, logActivity } from '../../db.js';
  import { t, lang, translate_org_type, shortID } from '../../i18n/i18n';
  import { push } from 'svelte-spa-router';

  import EditJournalModal from '../journals/EditJournalModal.svelte';

  import { showDate, setDatePickers } from '../../calendar.js';
  import { toast } from '../../ToastUI/toast.js';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import TableActions from '../../components/common/TableActions.svelte';
  export let id;

  import JournalReceiptModal from '../journals/JournalReceiptModal.svelte';
  let showReceipt = false;
  let selectedJournal = null;

  import { generatePDF } from '../generatePDF.js';
  let generatingPDF = false;
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  let componentRoot = null;
  let accounts = [];
  let account = null;
  let accountType = null;
  let imageUrl = null;
  let journals = [];
  let computedBalance = {}; // per-currency computed balances

  let modalRef;

  let sale_payments = [];
  let purchase_payments = [];

  async function loadPayments() {
    sale_payments = await db.sale_payments.where('status').equals(1).toArray();
    purchase_payments = await db.purchase_payments.where('status').equals(1).toArray();
  }

  let PAYABLE_ID = null;
  let RECEIVABLE_ID = null;

  function handleDateChange(inputName, value) {
    if (inputName === 'startDate') startDate = value;
    else if (inputName === 'endDate') endDate = value;
  }

  let TREASURY_ID = null;

  async function loadAccounts() {
    accounts = await db.accounts.where('status').equals(1).toArray();
    const payable = accounts.find((a) => a.code === 'PAYABLE');
    const receivable = accounts.find((a) => a.code === 'RECEIVABLE');
    PAYABLE_ID = payable ? payable.id : null;
    RECEIVABLE_ID = receivable ? receivable.id : null;
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
    await loadAccounts();
    await loadPayments();
    tick().then(() => setDatePickers(handleDateChange, componentRoot));
  });
  // Filters & pagination
  let q = '';
  let page = 1;
  let pageSize = 10;
  const pageSizes = [10, 25, 50, 100];

  $: if (id) loadAccount(id);

  // derived lists
  let filtered = [];
  let processed = [];
  let paginated = [];
  let totalPages = 1;

  function getLocalDate() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  }

  let startDate = '';
  let endDate = '';

  $: filtered = journals.filter((j) => {
    const jd = j.date ? new Date(j.created_at) : null;
    if (startDate && jd && jd < new Date(startDate)) return false;
    if (endDate && jd && jd > new Date(endDate + 'T23:59:59')) return false;
    if (q) {
      const s = q.toLowerCase();
      const hay = (j.description || '') + ' ' + (j.reference_type || '') + ' ' + (j.reference_id || '');
      if (!hay.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  // compute running balances per currency
  $: {
    // starting balances per currency (use account.balance only for account.currency)
    const starting = {};
    if (account?.currency && account?.balance != null) {
      starting[account.currency] = 0;
    }

    const asc = [...filtered].slice(); // oldest -> newest

    console.log(asc);

    let lastBal = { ...starting };
    const processedAsc = asc.map((j) => {
      const debit = Number(j.debit || 0);
      const credit = Number(j.credit || 0);
      const cur = j.currency || account?.currency || 'DEFAULT';
      // copy previous
      const balObj = { ...lastBal };
      balObj[cur] = (balObj[cur] || 0) + (credit - debit);
      lastBal = balObj;
      return { ...j, debit, credit, running: balObj };
    });

    processedAsc.reverse(); // newest -> oldest for display
    // chronological (oldest -> newest) for display
    processed = processedAsc.slice();
    const totals = {};

    for (const j of filtered) {
      const cur = j.currency || account?.currency || 'DEFAULT';
      const debit = Number(j.debit || 0);
      const credit = Number(j.credit || 0);

      if (!totals[cur]) {
        totals[cur] = { debit: 0, credit: 0, balance: 0 };
      }

      totals[cur].debit += debit;
      totals[cur].credit += credit;
      totals[cur].balance += credit - debit;
    }

    computedBalance = totals;

    totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
    if (page > totalPages) page = totalPages;
    paginated = processed.slice((page - 1) * pageSize, page * pageSize);
  }

  async function loadAccount(id) {
    account = await db.accounts.get(Number(id));
    if (!account) return;

    TREASURY_ID = (await db.accounts.where('code').equals('TREASURY').first())?.id || null;

    accountType = account.account_type_id ? await db.account_types.get(account.account_type_id) : null;

    const img = await db.account_images.where('account_id').equals(account.id).first();
    if (!img || !img.image) {
      imageUrl = null;
    } else if (typeof img.image === 'string') {
      imageUrl = img.image;
    } else {
      try {
        imageUrl = URL.createObjectURL(img.image);
      } catch (e) {
        imageUrl = null;
      }
    }

    await loadJournals(account.id);
    // reset filters when loading a new account
    startDate = '';
    endDate = '';
    q = '';
    page = 1;
  }

  async function deleteJournal(id) {
    await logActivity({
      user_id: parseInt(localStorage.getItem('user_id')) || 0,
      action: 'delete',
      table_name: 'journals',
      entity_id: id,
      old_values: JSON.stringify(journals.find((j) => j.id === id)),
      new_values: null,
      description: `Deleted journal entry #${id}`,
    });
    await db.journals.update(id, { status: 0 });
    await loadJournals(account.id);
  }

  async function loadJournals(id) {

    const allJournals = await db.journals
        .where('status')
        .equals(1)
        .toArray();


    const processedLocal = [];


    for (const j of allJournals) {

        let debit = 0;
        let credit = 0;


        // Same logic as AccountsHelper first_entry
        if (j.first_entry_account === id) {

            debit += Number(j.first_entry_debit) || 0;
            credit += Number(j.first_entry_credit) || 0;

        }


        // Same logic as AccountsHelper second_entry
        if (j.second_entry_account === id) {

            debit += Number(j.second_entry_debit) || 0;
            credit += Number(j.second_entry_credit) || 0;

        }


        // Only keep journals belonging to this account
        if (debit !== 0 || credit !== 0) {

            processedLocal.push({
                ...j,
                debit,
                credit,
                currency: j.currency
            });

        }
    }


    // same ordering as your old component
    processedLocal.sort(
        (a,b)=>new Date(a.date)-new Date(b.date)
    );


    journals = processedLocal;


    // EXACT same balance logic as AccountsHelper
    computedBalance = {};


    for (const j of journals) {

        const cur = j.currency;


        if (!computedBalance[cur]) {
            computedBalance[cur] = {
                debit: 0,
                credit: 0,
                balance: 0
            };
        }


        computedBalance[cur].debit += j.debit;
        computedBalance[cur].credit += j.credit;


        computedBalance[cur].balance += 
            j.credit - j.debit;
    }


    console.log(
        "Account balance calculated:",
        id,
        computedBalance
    );
}

  function fmtDate(d) {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleString();
    } catch (e) {
      return d;
    }
  }

  function formatRunningObj(obj) {
    console.log(obj);
    if (!obj) return '-';
    return Object.keys(obj)
      .map((k) => `${obj[k].toLocaleString()} ${t(k)}`)
      .join('<br />');
  }

  function goBack() {
    push('/dashboard/accounts');
  }

  function getCurrencyInfoArray(obj) {
    let arr = [];
    for (const k in obj) {
      arr.push({
        code: k,
        debit: obj[k].debit,
        credit: obj[k].credit,
        balance: obj[k].balance,
        color: k === account?.currency ? 'primary' : 'success',
      });
    }
    return arr;
  }

  function formatSummaryValues(type) {
    return getCurrencyInfoArray(computedBalance)
      .map((cur) => `${Number(cur[type] || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${t(cur.code)}`)
      .join('<br />') || '0';
  }

  $: reportToolbarFilters = [
    { key: 'startDate', label: t('From Date'), value: startDate, icon: 'bi-calendar3', type: 'date' },
    { key: 'endDate', label: t('To Date'), value: endDate, icon: 'bi-calendar3', type: 'date' },
  ];

  function handleReportFilterChange(event) {
    if (event.detail.key === 'startDate') startDate = event.detail.value;
    if (event.detail.key === 'endDate') endDate = event.detail.value;
    page = 1;
  }

  function resetReportFilters() {
    q = '';
    startDate = '';
    endDate = '';
    page = 1;
  }

  function getPageNumbers(current, total) {
    const pages = [];
    for (let i = 1; i <= total; i += 1) {
      if (i === 1 || i === total || Math.abs(i - current) <= 2) pages.push(i);
      else if (pages[pages.length - 1] !== '...') pages.push('...');
    }
    return pages;
  }

  async function exportReport() {
    generatingPDF = true;
    await tick();
    await generatePDF(
      'account_financial_report', processed, startDate, endDate, processed.length,
      getCurrencyInfoArray(computedBalance), account,
    );
    generatingPDF = false;
  }

  import { auth } from '../../auth/authStore';
  $: permissions = $auth.permissions;
  let showSummaryCards = false;

  function getReportActions(journal) {
    const actions = [];
    if (journal.reference_type !== 'account' && journal.reference_id) {
      const routes = {
        stock_transfer: `/dashboard/stock-transfers/${journal.reference_id}`,
        sale: `/dashboard/sales/${journal.reference_id}`,
        purchase: `/dashboard/purchases/${journal.reference_id}`,
        exchange: '/dashboard/exchanges/list',
      };
      if (journal.reference_type === 'sale_payment') {
        const payment = sale_payments.find((item) => item.id === journal.reference_id);
        if (payment) routes.sale_payment = `/dashboard/sales/${payment.sale_id}`;
      }
      if (journal.reference_type === 'purchase_payment') {
        const payment = purchase_payments.find((item) => item.id === journal.reference_id);
        if (payment) routes.purchase_payment = `/dashboard/purchases/${payment.purchase_id}`;
      }
      if (routes[journal.reference_type]) actions.push({ icon: 'bi-eye', label: t('View'), tone: 'view', onClick: () => push(routes[journal.reference_type]) });
    } else {
      if (permissions?.some((p) => p.code === 'Journals' && p.edit)) actions.push({ icon: 'bi-pencil', label: t('Edit'), tone: 'edit', onClick: () => modalRef.openModal(journal.id) });
      if (permissions?.some((p) => p.code === 'Journals' && p.delete)) actions.push({ icon: 'bi-trash', label: t('Delete'), tone: 'delete', onClick: async () => {
        const ok = await toast.confirm(t('Are you sure?'), t("You won't be able to revert this!"));
        if (ok) deleteJournal(journal.id);
      }});
    }
    actions.push({ icon: 'bi-printer', label: t('Print'), tone: 'view', onClick: () => { selectedJournal = journal; showReceipt = true; } });
    return actions;
  }
</script>

<!-- Transactions section (full width) -->

<div bind:this={componentRoot} class="account-report-page">
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Account Report')}
    toolbarWidth="25rem"
    showStats={showSummaryCards && getCurrencyInfoArray(computedBalance).length > 0}
    showFooter={processed.length > 0}
    dense={true}
    tablePadding={true}>
    <svelte:fragment slot="actions">
      <ActionButton
        variant="secondary"
        icon="bi-file-pdf-fill"
        label={t('PDF')}
        loading={generatingPDF}
        disabled={generatingPDF}
        on:click={exportReport} />
      <button type="button" class="index-settings-button" class:is-active={showSummaryCards}
        aria-label={t('Financial summary')} aria-expanded={showSummaryCards} title={t('Financial summary')}
        on:click={() => (showSummaryCards = !showSummaryCards)}>
        <i class="bi {showSummaryCards ? 'bi-x-lg' : 'bi-wallet2'}" aria-hidden="true"></i>
      </button>
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={q}
        searchPlaceholder={t('Search transactions')}
        filters={reportToolbarFilters}
        filterLabel={t('Filter')}
        resetLabel={t('Clear Filters')}
        showReset={true}
        on:searchChange={(event) => { q = event.detail; page = 1; }}
        on:filterChange={handleReportFilterChange}
        on:reset={resetReportFilters} />
    </svelte:fragment>

    <svelte:fragment slot="stats">
      <div class="index-summary-grid account-report-summary">
        <SummaryCard label={t('Credit')} icon="bi-arrow-down-left" tone="green">
          <div class="report-summary-values" dir="ltr">{@html formatSummaryValues('credit')}</div>
        </SummaryCard>
        <SummaryCard label={t('Debit')} icon="bi-arrow-up-right" tone="amber">
          <div class="report-summary-values" dir="ltr">{@html formatSummaryValues('debit')}</div>
        </SummaryCard>
        <SummaryCard label={t('Balance')} icon="bi-wallet2" tone="cyan">
          <div class="report-summary-values" dir="ltr">{@html formatSummaryValues('balance')}</div>
        </SummaryCard>
      </div>
    </svelte:fragment>

  {#if false}
  <div class="mb-3 row">
    <div class="col-md-2">
      <input
        class="form-control form-control-sm"
        placeholder={t('Search transactions')}
        bind:value={q}
        on:input={() => (page = 1)}
        style="max-width:320px;" />
    </div>
    <div class="col-md-2">
      <div class="input-group input-group-sm persianDatePicker">
        <input type="date" class="form-control" data-bind="startDate" bind:value={startDate} />

        <span class="input-group-text persian-date-text"></span>
      </div>
    </div>

    <div class="col-md-2">
      <div class="input-group input-group-sm persianDatePicker">
        <input type="date" class="form-control" data-bind="endDate" bind:value={endDate} />

        <span class="input-group-text persian-date-text"></span>
      </div>
    </div>

    <div class="col-md-2">
      <button
        class="btn btn-primary btn-sm w-100"
        on:click={() => {
          startDate = '';
          endDate = '';
        }}><i class="bi bi-list me-2"></i> {t('Show All')}</button>
    </div>

    <div class="col-md-2">
      <button
        on:click={async () => {
          generatingPDF = true;
          await tick();
          await generatePDF(
            'account_financial_report',
            processed,
            startDate,
            endDate,
            processed.length,
            getCurrencyInfoArray(computedBalance),
            account,
          );

          generatingPDF = false;
        }}
        disabled={generatingPDF}
        class="btn btn-outline-danger btn-sm me-2 px-2 float-end">
        {#if generatingPDF}
          <div class="spinner-border spinner-border-sm" role="status">
            <span class="visually-hidden">${t('Generating...')}</span>
          </div>
        {:else}
          <i class="bi bi-file-pdf-fill"></i>
          {t('PDF')}
        {/if}
      </button>
    </div>
  </div>
  <div class="my-3 d-flex justify-content-start align-items-center">
    {#each getCurrencyInfoArray(computedBalance) as cur}
      <div class="card me-4 shadow border-start border-{cur.color} border-5">
        <div class="card-body p-4">
          <div class="d-flex align-items-center">
            <div class="flex-grow-1">
              <p class="text-{cur.color} mb-1 fw-bold">
                {t(cur.code)}
              </p>
              <table>
                <tbody>
                  <tr>
                    <td>{t('Credit')}</td>
                    <td
                      ><small class="ms-2" dir="ltr">{cur.credit.toLocaleString()}</small>
                      <small> {t(cur.code)}</small></td>
                  </tr>
                  <tr>
                    <td>{t('Debit')}</td>
                    <td
                      ><small class="ms-2" dir="ltr">{cur.debit.toLocaleString()}</small>
                      <small> {t(cur.code)}</small></td>
                  </tr>
                  <tr class="fw-bold">
                    <td>{t('Balance')}</td>
                    <td
                      ><small dir="ltr" class="ms-2 {cur.balance > 0 ? '' : 'text-danger'}"
                        >{cur.balance.toLocaleString()}</small>
                      <small class={cur.balance > 0 ? '' : 'text-danger'}>
                        {t(cur.code)}
                      </small></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    {/each}
  </div>
  {/if}

  {#if processed.length === 0}
    <div class="index-table-state">
      <EmptyState icon="bi-inbox" message={t('No transactions found.')} />
    </div>
  {:else}
    <DataTable
      ariaLabel={t('Account Report')}
      minWidth="920px"
      dense={true}
      striped={true}
      hover={false}
      stickyHeader={true}
      layout="fixed"
      scrollbar="thin">
      <svelte:fragment slot="head">
        <tr>
          <th style="width:160px">{t('Date')}</th>
          <th>{t('Peer Account')}</th>
          <th>{t('Reference')}</th>
          <th>{t('Description')}</th>
          <th class="text-end">{t('Debit')}</th>
          <th class="text-end">{t('Credit')}</th>
          <th class="text-end">{t('Balance')}</th>
          <th class="text-center">{t('Actions')}</th>
        </tr>
      </svelte:fragment>
          {#each paginated as j}
            <tr>
              <td style="min-width:140px">{@html showDate(j.date)}</td>
              <td>
                {#if j.first_entry_account == PAYABLE_ID || j.first_entry_account == RECEIVABLE_ID}
                  <span class="badge badge-success">
                    {getAccountName(j.second_entry_account)}
                  </span>
                {:else if j.second_entry_account == PAYABLE_ID || j.second_entry_account == RECEIVABLE_ID}
                  <span class="badge badge-success">
                    {getAccountName(j.first_entry_account)}
                  </span>
                {:else}
                  <span
                    class="badge badge-success"
                    style="cursor: pointer;"
                    on:click={async () => {
                      await push(
                        `/dashboard/account/${j.first_entry_account == account.id ? j.second_entry_account : j.first_entry_account}`,
                      );
                      await loadJournals(); // refresh journals after coming back
                      // window.location.reload(); // force reload to refresh the journals list for the new account
                    }}>
                    {j.first_entry_account == id
                      ? getAccountName(j.second_entry_account)
                      : getAccountName(j.first_entry_account)}</span>
                {/if}
              </td><td>
                {#if j.reference_type != 'account' && j.reference_id}
                  {#if j.reference_type === 'stock_transfer'}
                    <span
                      class="badge badge-success me-1"
                      style="cursor: pointer;"
                      on:click={() => push(`/dashboard/stock-transfers/${j.reference_id}`)}>
                      {t(j.reference_type)}
                      {j.reference_id ? ' ' + shortID(j.reference_id) : ''}
                    </span>
                  {:else if j.reference_type === 'sale'}
                    <span
                      class="badge badge-info me-1"
                      style="cursor: pointer;"
                      on:click={() => push(`/dashboard/sales/${j.reference_id}`)}>
                      {t(j.reference_type)}
                      {j.reference_id ? ' ' + shortID(j.reference_id) : ''}
                    </span>
                  {:else if j.reference_type === 'sale_payment'}
                    <span
                      class="badge badge-success me-1"
                      style="cursor: pointer;"
                      on:click={() => {
                        const sp = sale_payments.find((sp) => sp.id === j.reference_id);
                        if (sp) {
                          push(`/dashboard/sales/${sp.sale_id}`);
                        }
                      }}>
                      {t(j.reference_type)}
                      {j.reference_id
                        ? ' ' + shortID(sale_payments.find((sp) => sp.id === j.reference_id)?.sale_id)
                        : ''}
                    </span>
                  {:else if j.reference_type === 'purchase'}
                    <span
                      class="badge badge-info me-1"
                      style="cursor: pointer;"
                      on:click={() => push(`/dashboard/purchases/${j.reference_id}`)}>
                      {t(j.reference_type)}
                      {j.reference_id ? ' ' + shortID(j.reference_id) : ''}
                    </span>
                  {:else if j.reference_type === 'purchase_payment'}
                    <span
                      class="badge badge-success me-1"
                      style="cursor: pointer;"
                      on:click={() => {
                        const pp = purchase_payments.find((pp) => pp.id === j.reference_id);
                        if (pp) {
                          push(`/dashboard/purchases/${pp.purchase_id}`);
                        }
                      }}>
                      {t(j.reference_type)}
                      {j.reference_id ? ' ' + shortID(j.reference_id) : ''}
                    </span>
                  {/if}
                {:else}{/if}
              </td>
              <td>{j.description || '-'}</td>
              <td class="text-end value-cell"
                ><span class="debit-value"
                  >{#if j.debit || 0}{j.debit.toLocaleString(undefined, { maximumFractionDigits: 3 }) || 0}
                    {t(j.currency || '')}{/if}</span
                ></td>
              <td class="text-end value-cell"
                ><span class="credit-value"
                  >{#if j.credit || 0}{j.credit.toLocaleString(undefined, { maximumFractionDigits: 3 }) || 0}
                    {t(j.currency || '')}{/if}</span
                ></td>
              <td class="text-end fw-bold">{@html formatRunningObj(j.running) || 0}</td>
              <td class="text-center">
                <TableActions actions={getReportActions(j)} />
                {#if false}
                {#if j.reference_type != 'account' && j.reference_id}
                  {#if j.reference_type === 'stock_transfer'}
                    <button
                      class="btn btn-sm btn-outline-success me-1"
                      on:click={() => push(`/dashboard/stock-transfers/${j.reference_id}`)}>
                      <i class="bi bi-box2"></i>
                    </button>
                  {:else if j.reference_type === 'sale'}
                    <button
                      class="btn btn-sm btn-outline-info me-1"
                      on:click={() => push(`/dashboard/sales/${j.reference_id}`)}>
                      <i class="bi bi-cart"></i>
                    </button>
                  {:else if j.reference_type === 'sale_payment'}
                    <button
                      class="btn btn-sm btn-outline-success me-1"
                      on:click={() => {
                        const sp = sale_payments.find((sp) => sp.id === j.reference_id);
                        if (sp) {
                          push(`/dashboard/sales/${sp.sale_id}`);
                        }
                      }}>
                      <i class="bi bi-cart"></i>
                    </button>
                  {:else if j.reference_type === 'purchase'}
                    <button
                      class="btn btn-sm btn-outline-info me-1"
                      on:click={() => push(`/dashboard/purchases/${j.reference_id}`)}>
                      <i class="bi bi-truck"></i>
                    </button>
                  {:else if j.reference_type === 'purchase_payment'}
                    <button
                      class="btn btn-sm btn-outline-success me-1"
                      on:click={() => {
                        const pp = purchase_payments.find((pp) => pp.id === j.reference_id);
                        if (pp) {
                          push(`/dashboard/purchases/${pp.purchase_id}`);
                        }
                      }}>
                      <i class="bi bi-truck"></i>
                    </button>
                  {:else if j.reference_type === 'exchange'}
                    <button class="btn btn-sm btn-outline-info me-1" on:click={() => push(`/dashboard/exchanges/list`)}>
                      <i class="bi bi-currency-exchange"></i>
                    </button>
                  {/if}
                {:else}
                  {#if permissions?.some((p) => p.code === 'Journals' && p.edit)}
                    <button class="btn btn-sm btn-outline-secondary me-1" on:click={() => modalRef.openModal(j.id)}>
                      <i class="bi bi-pencil"></i>
                    </button>
                  {/if}
                  {#if permissions?.some((p) => p.code === 'Journals' && p.delete)}
                    <button
                      class="btn btn-sm btn-outline-danger"
                      on:click={async () => {
                        const ok = await toast.confirm(t('Are you sure?'), t("You won't be able to revert this!"));

                        if (ok) {
                          deleteJournal(j.id);
                        }
                      }}>
                      <i class="bi bi-trash"></i>
                    </button>
                  {/if}
                {/if}

                <button
                  class="btn btn-sm btn-outline-primary me-1 px-2"
                  on:click={() => {
                    showReceipt = true;
                    selectedJournal = j;
                  }}>
                  <i class="bi bi-printer"></i>
                </button>
                {/if}
              </td>
            </tr>
          {/each}
    </DataTable>
  {/if}

    <svelte:fragment slot="footer">
      <PaginationBar
        bind:currentPage={page}
        totalPages={totalPages}
        itemsPerPage={pageSize}
        totalItems={processed.length}
        ariaLabel={t('Account Report pagination')}
        rowLabel={t('rows')}
        perPageOptions={pageSizes}
        on:perPageChange={(event) => { pageSize = event.detail; page = 1; }}
        {getPageNumbers} />
    </svelte:fragment>
  </IndexPageLayout>
</div>

<EditJournalModal bind:this={modalRef} on:saved={loadJournals} />

{#if showReceipt}
  <JournalReceiptModal journal={selectedJournal} on:close={() => (showReceipt = false)} />
{/if}

<style>
  .account-report-page {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .account-report-page :global(.index-page) {
    flex: 1 1 auto;
  }

  .account-report-summary {
    width: 100%;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }

  .account-report-summary :global(.summary-card) {
    min-height: 5rem;
    padding: 0.75rem 0.9rem;
    gap: 0.75rem;
    border-color: #dce6f5;
    border-radius: 0.85rem;
    background: linear-gradient(145deg, #ffffff, #f8faff);
    box-shadow: none;
  }

  .account-report-summary :global(.summary-icon) {
    width: 2.35rem;
    height: 2.35rem;
    border-radius: 0.75rem;
    font-size: 1rem;
  }

  .account-report-summary :global(.summary-content) {
    flex: 1;
  }

  .account-report-summary :global(.summary-label) {
    margin-bottom: 0.2rem;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .report-summary-values {
    color: #13213a;
    font-size: 0.86rem;
    font-weight: 800;
    line-height: 1.45;
    font-variant-numeric: tabular-nums;
  }
  .value-cell span{display:inline;background:transparent;border:0;border-radius:0;padding:0;box-shadow:none;font-size:.75rem;font-weight:750;white-space:nowrap}
  .debit-value{color:#dc3545}.credit-value{color:#11875d}

  @media (max-width: 700px) {
    .account-report-summary { grid-template-columns: 1fr !important; }
    .account-report-summary :global(.summary-card) { min-height: 4.3rem; padding: 0.6rem 0.7rem; }
  }
</style>
