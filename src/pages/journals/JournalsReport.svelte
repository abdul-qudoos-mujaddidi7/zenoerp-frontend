<script>
  import { onMount, tick } from 'svelte';
  import { db } from '../../db.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import { push } from 'svelte-spa-router';
  import { showDate, setDatePickers } from '../../calendar.js';
  import { generatePDF } from '../generatePDF.js';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  let generatingPDF = false;
  let loading = true;
  let showBalanceCards = true;
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  let componentRoot = null;
  let accounts = [];
  let account = null;
  let accountType = null;
  let imageUrl = null;
  let journals = [];
  let computedBalance = {};

  function handleDateChange(inputName, value) {
    if (inputName === 'startDate') startDate = value;
    else if (inputName === 'endDate') endDate = value;
  }

  let TREASURY_ID = null;
  let NOTRACK_ID = null;
  onMount(async () => {
    await loadAccounts();
    tick().then(() => setDatePickers(handleDateChange, componentRoot));
  });
  function getAccountName(id) {
    const acc = accounts.find((a) => a.id === id) || {};
    if (t('Lang') === 'en') return acc.name || '';
    if (t('Lang') === 'fa') return acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') return acc.name_ps || acc.name || '';
    return acc.name || '';
  }
  let q = '';
  let page = 1;
  let pageSize = 10;
  const pageSizes = [10, 25, 50, 100];
  async function loadAccounts(id) {
    loading = true;
    accounts = await db.accounts.where('status').equals(1).toArray();
    accounts = accounts.filter((a) => (a.account_status ? a.account_status == 'active' : a.status == 1));
    if (!accounts) return;
    TREASURY_ID =
      (
        await db.accounts
          .where('code')
          .equals('TREASURY')
          .and((a) => a.status === 1)
          .first()
      )?.id || null;
    NOTRACK_ID = (
        await db.accounts
          .where('code')
          .equals('NOTRACK')
          .and((a) => a.status === 1)
          .first()
      )?.id || null;
    startDate = '';
    endDate = '';
    q = '';
    page = 1;
    await loadJournals();
    loading = false;
  }
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
  $: reportFilters = [
    { key: 'startDate', type: 'date', label: t('From Date'), icon: 'bi-calendar3', value: startDate },
    { key: 'endDate', type: 'date', label: t('To Date'), icon: 'bi-calendar3', value: endDate },
  ];

  function handleReportFilter(event) {
    const { key, value } = event.detail;
    if (key === 'startDate') startDate = value;
    if (key === 'endDate') endDate = value;
    page = 1;
  }

  function resetReportFilters() {
    startDate = '';
    endDate = '';
    page = 1;
  }
  $: filtered = journals.filter((j) => {
    const jd = j.date ? new Date(j.date) : null;
    if (startDate && jd && jd < new Date(startDate)) return false;
    if (endDate && jd && jd > new Date(endDate + 'T23:59:59')) return false;
    if (q) {
      const s = q.toLowerCase();
      const hay = (j.description || '') + ' ' + (j.reference_type || '') + ' ' + (j.reference_id || '');
      if (!hay.toLowerCase().includes(s)) return false;
    }
    return true;
  });
  $: {
    const starting = {};
    if (account?.currency && account?.balance != null) {
      starting[account.currency] = 0;
    }
    const asc = [...filtered].slice();
    let lastBal = { ...starting };
    const processedAsc = asc.map((j) => {
      const debit = Number(j.debit || 0);
      const credit = Number(j.credit || 0);
      const cur = j.currency || account?.currency || 'DEFAULT';
      const balObj = { ...lastBal };
      balObj[cur] = (balObj[cur] || 0) + (credit - debit);
      lastBal = balObj;
      return { ...j, debit, credit, running: balObj };
    });
    processedAsc.reverse();
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

  async function loadJournals() {
    let journs = await db.journals.where('status').equals(1).toArray();
    let accountsToExclude = [];
    const specialCodes = ['RECEIVABLE', 'PAYABLE', 'SALES', 'PURCHASE'];
    for (const code of specialCodes) {
      const acc = await db.accounts
        .where('code')
        .equals(code)
        .and((acc) => acc.status === 1)
        .first();
      if (acc) accountsToExclude.push(acc.id);
    }
    console.log('Excluding accounts with IDs', accountsToExclude);
    journs = journs.filter(
      (j) =>
        j.status === 1 &&
        !accountsToExclude.includes(j.first_entry_account) &&
        !accountsToExclude.includes(j.second_entry_account),
    );
    let bal = 0;
    const processedLocal = journs.map((j) => {
      let debit = Number(j.first_entry_debit) + Number(j.second_entry_debit) || 0,
        credit = Number(j.first_entry_credit) + Number(j.second_entry_credit) || 0,
        currency = j.currency;
      if (j.first_entry_account == TREASURY_ID) {
        debit = Number(j.second_entry_debit) || 0;
        credit = Number(j.second_entry_credit) || 0;
      }
      if (j.second_entry_account == TREASURY_ID) {
        debit = Number(j.first_entry_debit) || 0;
        credit = Number(j.first_entry_credit) || 0;
      }
      return { ...j, debit, credit, currency };
    });
    journals = processedLocal.reverse();
    computedBalance = journals.reduce((s, j) => s + (Number(j.credit || 0) - Number(j.debit || 0)), 0);
    journals = journals.reverse();
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
  function exportCsv() {
    const rows = [];
    rows.push(['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance']);
    for (const j of processed) {
      rows.push([
        fmtDate(j.date),
        `${j.reference_type || ''}#${j.reference_id || ''}`,
        j.description || '',
        j.debit || 0,
        j.credit || 0,
        j.running || 0,
      ]);
    }
    const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${account ? account.code : 'account'}-transactions.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  function getPageNumbers(current, total) {
    if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
    const pages = [1];
    if (current > 3) pages.push('...');
    for (let value = Math.max(2, current - 1); value <= Math.min(total - 1, current + 1); value++) pages.push(value);
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
  }

  function formatSummary(type) {
    return getCurrencyInfoArray(computedBalance)
      .map((currency) => `${Number(currency[type] || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${t(currency.code)}`)
      .join('<br />') || '0';
  }

  async function downloadPdf() {
    generatingPDF = true;
    await tick();
    await generatePDF('journals_report', processed, startDate, endDate, processed.length, getCurrencyInfoArray(computedBalance), {});
    generatingPDF = false;
  }
</script>

<div class="journals-report-page" bind:this={componentRoot} dir={t('dir')}>
<IndexPageLayout dir={t('dir')} ariaLabel={t('Journals Report')} toolbarWidth="25rem"
  showStats={showBalanceCards} showFooter={!loading && processed.length > 0} dense tablePadding>
  <svelte:fragment slot="actions">
    <ActionButton variant="secondary" icon="bi-file-pdf-fill" label={t('PDF')} loading={generatingPDF}
      disabled={generatingPDF} on:click={downloadPdf} />
    <button type="button" class="index-settings-button" class:is-active={showBalanceCards}
      aria-label={t('Balance')} title={t('Balance')} on:click={() => (showBalanceCards = !showBalanceCards)}>
      <i class="bi {showBalanceCards ? 'bi-x-lg' : 'bi-wallet2'}"></i>
    </button>
  </svelte:fragment>
  <svelte:fragment slot="toolbar">
    <FilterToolbar searchValue={q} searchPlaceholder={t('Search transactions')} filters={reportFilters}
      filterLabel={t('Filter')} resetLabel={t('Show All')} showReset={true}
      on:searchChange={(event) => { q = event.detail; page = 1; }}
      on:filterChange={handleReportFilter} on:reset={resetReportFilters} />
  </svelte:fragment>
  <svelte:fragment slot="stats">
    <div class="summary-grid">
      <SummaryCard label={t('Credit')} icon="bi-arrow-down-left" tone="green">{@html formatSummary('credit')}</SummaryCard>
      <SummaryCard label={t('Debit')} icon="bi-arrow-up-right" tone="amber">{@html formatSummary('debit')}</SummaryCard>
      <SummaryCard label={t('Balance')} icon="bi-wallet2" tone="cyan">{@html formatSummary('balance')}</SummaryCard>
    </div>
  </svelte:fragment>
  {#if loading}
    <div class="table-state"><EmptyState loading message={t('Loading...')} /></div>
  {:else if processed.length === 0}
    <div class="table-state"><EmptyState icon="bi-journal-x" message={t('No transactions found.')} /></div>
  {:else}
    <DataTable ariaLabel={t('Journals Report')} minWidth="850px" dense striped hover={false} stickyHeader layout="fixed" scrollbar="thin">
      <svelte:fragment slot="head">
        <tr>
          <th>{t('Date')}</th>
          <th>{t('Account')}</th>
          <th>{t('Description')}</th>
          <th>{t('Debit')}</th><th>{t('Credit')}</th><th>{t('Balance')}</th>
        </tr>
      </svelte:fragment>
          {#each paginated as j}
            <tr>
              <td><span class="date-badge">{@html showDate(j.date) || '—'}</span></td>
              <td><div class="account-pair"><span class:positive={j.first_entry_credit > 0} class:negative={j.first_entry_credit <= 0}>{getAccountName(j.first_entry_account)}</span><span class:positive={j.second_entry_credit > 0} class:negative={j.second_entry_credit <= 0}>{getAccountName(j.second_entry_account)}</span></div></td>
              <td><span class="description-cell" title={j.description || ''}>{j.description || '—'}</span></td>
              <td>{#if j.debit}<span class="amount negative">{Number(j.debit).toLocaleString(undefined,{maximumFractionDigits:3})} {t(j.currency || '')}</span>{:else}<span class="dash">—</span>{/if}</td>
              <td>{#if j.credit}<span class="amount positive">{Number(j.credit).toLocaleString(undefined,{maximumFractionDigits:3})} {t(j.currency || '')}</span>{:else}<span class="dash">—</span>{/if}</td>
              <td><span class="running-balance">{@html formatRunningObj(j.running) || '0'}</span></td>
            </tr>
          {/each}
    </DataTable>
  {/if}
  <svelte:fragment slot="footer"><PaginationBar bind:currentPage={page} {totalPages} itemsPerPage={pageSize} totalItems={processed.length} {getPageNumbers} rowLabel={t('rows')} perPageOptions={pageSizes} on:perPageChange={(event) => { pageSize = Number(event.detail); page = 1; }} /></svelte:fragment>
</IndexPageLayout>
</div>

<style>
  .journals-report-page { display:flex; flex-direction:column; width:100%; height:100%; min-height:0; overflow:hidden; }
  .summary-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.75rem; width:100%; }
  .index-settings-button { display:grid; place-items:center; width:2.625rem; height:2.625rem; border:1px solid #dbe4ef; border-radius:.6rem; color:#0f6efd; background:#eff6ff; }
  .index-settings-button.is-active { color:#fff; background:#0f6efd; border-color:#0f6efd; }
  .table-state { display:grid; place-items:center; min-height:18rem; }
  .date-badge { color:#475569; font-size:.8rem; } .account-pair { display:flex; justify-content:center; gap:.35rem; flex-wrap:wrap; }
  .account-pair span,.amount { display:inline; padding:0; border:0; border-radius:0; background:transparent; box-shadow:none; font-size:.75rem; font-weight:700; }
  .positive { color:#047857; background:transparent; } .negative { color:#dc2626; background:transparent; }
  .description-cell { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .running-balance { font-weight:700; line-height:1.5; } .dash { color:#cbd5e1; }
  @media(max-width:700px){ .summary-grid{grid-template-columns:1fr;} }
</style>
