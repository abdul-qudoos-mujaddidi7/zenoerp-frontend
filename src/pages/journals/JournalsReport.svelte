<script>
  import { onMount, tick } from 'svelte';
  import { db } from '../../db.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n';
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
  let loadError = '';
  let showBalanceCards = true;

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let componentRoot = null;
  let accounts = [];
  let account = null;
  let journals = [];

  // Always keep this value as an object grouped by currency.
  let computedBalance = {};
  let currencyInfo = [];
  let creditSummary = '0';
  let debitSummary = '0';
  let balanceSummary = '0';

  let TREASURY_ID = null;
  let NOTRACK_ID = null;

  let q = '';
  let page = 1;
  let pageSize = 10;
  const pageSizes = [10, 25, 50, 100];

  let startDate = '';
  let endDate = '';

  let filtered = [];
  let processed = [];
  let paginated = [];
  let totalPages = 1;

  onMount(async () => {
    await loadAccounts();
    await tick();

    if (componentRoot) {
      setDatePickers(handleDateChange, componentRoot);
    }
  });

  function handleDateChange(inputName, value) {
    if (inputName === 'startDate') startDate = value;
    if (inputName === 'endDate') endDate = value;
    page = 1;
  }

  function getAccountName(id) {
    const acc = accounts.find((item) => item.id === id) || {};

    if (_lang === 'fa') return acc.name_fa || acc.name || '';
    if (_lang === 'ps') return acc.name_ps || acc.name || '';

    return acc.name || '';
  }

  async function loadAccounts() {
    loading = true;
    loadError = '';

    try {
      const loadedAccounts = await db.accounts.where('status').equals(1).toArray();

      accounts = loadedAccounts.filter((item) =>
        item.account_status
          ? item.account_status === 'active'
          : item.status === 1,
      );

      const [treasuryAccount, noTrackAccount] = await Promise.all([
        db.accounts
          .where('code')
          .equals('TREASURY')
          .and((item) => item.status === 1)
          .first(),
        db.accounts
          .where('code')
          .equals('NOTRACK')
          .and((item) => item.status === 1)
          .first(),
      ]);

      TREASURY_ID = treasuryAccount?.id ?? null;
      NOTRACK_ID = noTrackAccount?.id ?? null;

      startDate = '';
      endDate = '';
      q = '';
      page = 1;

      await loadJournals();
    } catch (error) {
      console.error('Failed to load journals report:', error);
      loadError = error?.message || t('Failed to load data.');
      accounts = [];
      journals = [];
      computedBalance = {};
    } finally {
      loading = false;
    }
  }

  async function loadJournals() {
    const [loadedJournals, ...specialAccounts] = await Promise.all([
      db.journals.where('status').equals(1).toArray(),
      ...['RECEIVABLE', 'PAYABLE', 'SALES', 'PURCHASE'].map((code) =>
        db.accounts
          .where('code')
          .equals(code)
          .and((item) => item.status === 1)
          .first(),
      ),
    ]);

    const accountsToExclude = specialAccounts
      .filter(Boolean)
      .map((item) => item.id);

    const activeJournals = loadedJournals.filter(
      (journal) =>
        journal.status === 1 &&
        !accountsToExclude.includes(journal.first_entry_account) &&
        !accountsToExclude.includes(journal.second_entry_account),
    );

    journals = activeJournals.map((journal) => {
      let debit =
        Number(journal.first_entry_debit || 0) +
        Number(journal.second_entry_debit || 0);

      let credit =
        Number(journal.first_entry_credit || 0) +
        Number(journal.second_entry_credit || 0);

      if (journal.first_entry_account == TREASURY_ID) {
        debit = Number(journal.second_entry_debit || 0);
        credit = Number(journal.second_entry_credit || 0);
      }

      if (journal.second_entry_account == TREASURY_ID) {
        debit = Number(journal.first_entry_debit || 0);
        credit = Number(journal.first_entry_credit || 0);
      }

      return {
        ...journal,
        debit,
        credit,
        currency: journal.currency || account?.currency || 'DEFAULT',
      };
    });
  }

  $: reportFilters = [
    {
      key: 'startDate',
      type: 'date',
      label: t('From Date'),
      icon: 'bi-calendar3',
      value: startDate,
    },
    {
      key: 'endDate',
      type: 'date',
      label: t('To Date'),
      icon: 'bi-calendar3',
      value: endDate,
    },
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

  $: filtered = journals.filter((journal) => {
    const journalDate = journal.date ? new Date(journal.date) : null;

    if (
      startDate &&
      journalDate &&
      journalDate < new Date(`${startDate}T00:00:00`)
    ) {
      return false;
    }

    if (
      endDate &&
      journalDate &&
      journalDate > new Date(`${endDate}T23:59:59.999`)
    ) {
      return false;
    }

    if (q.trim()) {
      const search = q.trim().toLowerCase();
      const searchableText = [
        journal.description,
        journal.reference_type,
        journal.reference_id,
        getAccountName(journal.first_entry_account),
        getAccountName(journal.second_entry_account),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!searchableText.includes(search)) return false;
    }

    return true;
  });

  // Calculate running balances from oldest to newest, then display newest first.
  $: {
    const sortedAscending = [...filtered].sort(compareJournalsAscending);
    const runningByCurrency = {};
    const totals = {};

    const processedAscending = sortedAscending.map((journal) => {
      const debit = Number(journal.debit || 0);
      const credit = Number(journal.credit || 0);
      const currency = journal.currency || account?.currency || 'DEFAULT';

      runningByCurrency[currency] =
        Number(runningByCurrency[currency] || 0) + credit - debit;

      if (!totals[currency]) {
        totals[currency] = {
          debit: 0,
          credit: 0,
          balance: 0,
        };
      }

      totals[currency].debit += debit;
      totals[currency].credit += credit;
      totals[currency].balance += credit - debit;

      return {
        ...journal,
        debit,
        credit,
        currency,
        running: { ...runningByCurrency },
      };
    });

    processed = processedAscending.reverse();
    computedBalance = totals;

    totalPages = Math.max(1, Math.ceil(processed.length / pageSize));

    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;

    paginated = processed.slice(
      (page - 1) * pageSize,
      page * pageSize,
    );
  }

  // Explicit reactive dependencies fix the first-load summary-card issue.
  $: currencyInfo = buildCurrencyInfo(computedBalance, account?.currency);
  $: creditSummary = buildSummary(currencyInfo, 'credit', _lang);
  $: debitSummary = buildSummary(currencyInfo, 'debit', _lang);
  $: balanceSummary = buildSummary(currencyInfo, 'balance', _lang);

  function compareJournalsAscending(a, b) {
    const aTime = a?.date ? new Date(a.date).getTime() : 0;
    const bTime = b?.date ? new Date(b.date).getTime() : 0;

    if (aTime !== bTime) return aTime - bTime;

    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''), undefined, {
      numeric: true,
    });
  }

  function buildCurrencyInfo(balanceObject, accountCurrency) {
    if (!balanceObject || typeof balanceObject !== 'object') return [];

    return Object.entries(balanceObject).map(([code, values]) => ({
      code,
      debit: Number(values?.debit || 0),
      credit: Number(values?.credit || 0),
      balance: Number(values?.balance || 0),
      color: code === accountCurrency ? 'primary' : 'success',
    }));
  }

  function buildSummary(rows, type, currentLanguage) {
    // currentLanguage is intentionally used as a reactive dependency.
    void currentLanguage;

    if (!Array.isArray(rows) || rows.length === 0) return '0';

    return rows
      .map((currency) => {
        const amount = Number(currency[type] || 0).toLocaleString(undefined, {
          maximumFractionDigits: 3,
        });

        return `${amount} ${t(currency.code)}`;
      })
      .join('<br />');
  }

  function fmtDate(value) {
    if (!value) return '-';

    try {
      return new Date(value).toLocaleString();
    } catch (error) {
      return value;
    }
  }

  function formatRunningObj(balanceObject) {
    if (!balanceObject || typeof balanceObject !== 'object') return '0';

    const entries = Object.entries(balanceObject);
    if (entries.length === 0) return '0';

    return entries
      .map(([currency, amount]) => {
        const formattedAmount = Number(amount || 0).toLocaleString(undefined, {
          maximumFractionDigits: 3,
        });

        return `${formattedAmount} ${t(currency)}`;
      })
      .join('<br />');
  }

  function exportCsv() {
    const rows = [
      ['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'],
    ];

    for (const journal of processed) {
      rows.push([
        fmtDate(journal.date),
        `${journal.reference_type || ''}#${journal.reference_id || ''}`,
        journal.description || '',
        journal.debit || 0,
        journal.credit || 0,
        JSON.stringify(journal.running || {}),
      ]);
    }

    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `${account?.code || 'journals'}-transactions.csv`;
    anchor.click();

    URL.revokeObjectURL(url);
  }

  function getPageNumbers(current, total) {
    if (total <= 5) {
      return Array.from({ length: total }, (_, index) => index + 1);
    }

    const pages = [1];

    if (current > 3) pages.push('...');

    for (
      let value = Math.max(2, current - 1);
      value <= Math.min(total - 1, current + 1);
      value += 1
    ) {
      pages.push(value);
    }

    if (current < total - 2) pages.push('...');

    pages.push(total);
    return pages;
  }

  async function downloadPdf() {
    if (generatingPDF) return;

    generatingPDF = true;

    try {
      await tick();

      await generatePDF(
        'journals_report',
        processed,
        startDate,
        endDate,
        processed.length,
        currencyInfo,
        {},
      );
    } catch (error) {
      console.error('Failed to generate journals PDF:', error);
    } finally {
      generatingPDF = false;
    }
  }
</script>

<div
  class="journals-report-page"
  bind:this={componentRoot}
  dir={t('dir')}
>
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Journals Report')}
    toolbarWidth="25rem"
    showStats={showBalanceCards}
    showFooter={!loading && processed.length > 0}
    dense
    tablePadding
  >
    <svelte:fragment slot="actions">
      <ActionButton
        variant="secondary"
        icon="bi-file-pdf-fill"
        label={t('PDF')}
        loading={generatingPDF}
        disabled={generatingPDF || loading || processed.length === 0}
        on:click={downloadPdf}
      />

      <button
        type="button"
        class="index-settings-button"
        class:is-active={showBalanceCards}
        aria-label={t('Balance')}
        title={t('Balance')}
        on:click={() => (showBalanceCards = !showBalanceCards)}
      >
        <i class="bi {showBalanceCards ? 'bi-x-lg' : 'bi-wallet2'}"></i>
      </button>
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={q}
        searchPlaceholder={t('Search transactions')}
        filters={reportFilters}
        filterLabel={t('Filter')}
        resetLabel={t('Show All')}
        showReset={true}
        on:searchChange={(event) => {
          q = event.detail;
          page = 1;
        }}
        on:filterChange={handleReportFilter}
        on:reset={resetReportFilters}
      />
    </svelte:fragment>

    <svelte:fragment slot="stats">
      <div class="summary-grid">
        <SummaryCard
          label={t('Credit')}
          icon="bi-arrow-down-left"
          tone="green"
        >
          {@html creditSummary}
        </SummaryCard>

        <SummaryCard
          label={t('Debit')}
          icon="bi-arrow-up-right"
          tone="amber"
        >
          {@html debitSummary}
        </SummaryCard>

        <SummaryCard
          label={t('Balance')}
          icon="bi-wallet2"
          tone="cyan"
        >
          {@html balanceSummary}
        </SummaryCard>
      </div>
    </svelte:fragment>

    {#if loading}
      <div class="table-state">
        <EmptyState loading message={t('Loading...')} />
      </div>
    {:else if loadError}
      <div class="table-state">
        <EmptyState icon="bi-exclamation-triangle" message={loadError} />
      </div>
    {:else if processed.length === 0}
      <div class="table-state">
        <EmptyState
          icon="bi-journal-x"
          message={t('No transactions found.')}
        />
      </div>
    {:else}
      <DataTable
        ariaLabel={t('Journals Report')}
        minWidth="850px"
        dense
        striped
        hover={false}
        stickyHeader
        layout="fixed"
        scrollbar="thin"
      >
        <svelte:fragment slot="head">
          <tr>
            <th>{t('Date')}</th>
            <th>{t('Account')}</th>
            <th>{t('Description')}</th>
            <th>{t('Debit')}</th>
            <th>{t('Credit')}</th>
            <th>{t('Balance')}</th>
          </tr>
        </svelte:fragment>

        {#each paginated as journal (journal.id)}
          <tr>
            <td>
              <span class="date-badge">
                {@html showDate(journal.date) || '—'}
              </span>
            </td>

            <td>
              <div class="account-pair">
                <span
                  class:positive={Number(journal.first_entry_credit || 0) > 0}
                  class:negative={Number(journal.first_entry_credit || 0) <= 0}
                >
                  {getAccountName(journal.first_entry_account)}
                </span>

                <span
                  class:positive={Number(journal.second_entry_credit || 0) > 0}
                  class:negative={Number(journal.second_entry_credit || 0) <= 0}
                >
                  {getAccountName(journal.second_entry_account)}
                </span>
              </div>
            </td>

            <td>
              <span
                class="description-cell"
                title={journal.description || ''}
              >
                {journal.description || '—'}
              </span>
            </td>

            <td>
              {#if journal.debit}
                <span class="amount negative">
                  {Number(journal.debit).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                  {t(journal.currency || '')}
                </span>
              {:else}
                <span class="dash">—</span>
              {/if}
            </td>

            <td>
              {#if journal.credit}
                <span class="amount positive">
                  {Number(journal.credit).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                  {t(journal.currency || '')}
                </span>
              {:else}
                <span class="dash">—</span>
              {/if}
            </td>

            <td>
              <span class="running-balance">
                {@html formatRunningObj(journal.running)}
              </span>
            </td>
          </tr>
        {/each}
      </DataTable>
    {/if}

    <svelte:fragment slot="footer">
      <PaginationBar
        bind:currentPage={page}
        {totalPages}
        itemsPerPage={pageSize}
        totalItems={processed.length}
        {getPageNumbers}
        rowLabel={t('rows')}
        perPageOptions={pageSizes}
        on:perPageChange={(event) => {
          pageSize = Number(event.detail);
          page = 1;
        }}
      />
    </svelte:fragment>
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
