<script>
  import { onMount,tick } from 'svelte';
  import { db, logActivity } from '../../db.js';
  import ActionButton from '../../components/common/ActionButton.svelte';

  import { toast } from '../../ToastUI/toast.js';

  import { push } from 'svelte-spa-router';
  import JournalReceiptModal from './JournalReceiptModal.svelte';
  let showReceipt = false;
  let selectedJournal = null;

  import { t, lang, translate_org_type, shortID } from '../../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let account_id = null;

  let accounts = [];
  let accountTypes = [];
  let currencies = [];
  let journals = [];

  let sale_payments = [];
  let purchase_payments = [];
  let loading = true;
  let TREASURY_ID = null;

  let modalRef;

  let currency = '';
  import { showDate } from '../../calendar.js';

  import AddJournal from './AddJournal.svelte';
  import QuickEntryModal from '../../components/common/QuickEntryModal.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import EditJournalModal from './EditJournalModal.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import TableActions from '../../components/common/TableActions.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';

  async function loadAccounts() {
    accountTypes = await db.account_types.where('status').equals(1).toArray();
    accounts = await db.accounts.where('status').equals(1).toArray();

    accounts = accounts.filter((a) => (a.account_status ? a.account_status == 'active' : a.status == 1));

    TREASURY_ID =
      (
        await db.accounts
          .where('code')
          .equals('TREASURY')
          .and((acc) => acc.status === 1)
          .first()
      )?.id || null;
  }

  async function loadPayments() {
    sale_payments = await db.sale_payments.where('status').equals(1).toArray();
    purchase_payments = await db.purchase_payments.where('status').equals(1).toArray();
  }

  async function loadCurrencies() {
    currencies = await db.currencies.where('status').equals(1).toArray();
    const defaultCurr = currencies.find((c) => c.isDefault);
    if (defaultCurr) currency = defaultCurr.code;
  }

  async function loadJournals() {
    loading = true;

    journals = await db.journals.where('status').equals(1).toArray();

    if (account_id) {
      const scopedAccountId = Number(account_id);
      journals = journals.filter(
        (journal) =>
          Number(journal.first_entry_account) === scopedAccountId ||
          Number(journal.second_entry_account) === scopedAccountId,
      );
    }

    console.log('accounts', accounts);

    console.log('journals', journals);
    journals = journals.filter((j) => {
      const firstAccount = accounts.find((a) => a.id === parseInt(j.first_entry_account));
      const secondAccount = accounts.find((a) => a.id === parseInt(j.second_entry_account));
      return (
        firstAccount &&
        secondAccount &&
        firstAccount.code !== 'PAYABLE' &&
        firstAccount.code !== 'RECEIVABLE' &&
        secondAccount.code !== 'PAYABLE' &&
        secondAccount.code !== 'RECEIVABLE'
      );
    });
    journals = journals.reverse(); // show latest first
    loading = false;

    journals.forEach((j) => {
      if (!reference_types.includes(j.reference_type)) {
        reference_types = [...reference_types, j.reference_type];
      }
    });
  }

  onMount(async () => {
    await loadPayments();
    await loadAccounts();
    await loadCurrencies();
    await loadJournals();
  });
  // --- Table State (mirrors ProductsIndex design) ---
  let searchTerm = '';
  let filterAccount = 'all';
  let filterStatus = 'active'; // 'all', 'active', 'inactive'
  let currentPage = 1;
  let itemsPerPage = 10;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';
  let reference_type = null;
  let reference_types = [null];

  function getPageNumbers(current, total) {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
        range.push(i);
      }
    }

    for (let i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    return rangeWithDots;
  }
  $: filteredJournals = (() => {
    let result = journals.slice();

    // Status
    if (filterStatus === 'active') {
      result = result.filter((j) => j.status === 1);
    } else if (filterStatus === 'inactive') {
      result = result.filter((j) => j.status === 0);
    }

    if (reference_type != null) {
      result = result.filter((j) => j.reference_type === reference_type);
    }

    // Account filter
    if (filterAccount !== 'all') {
      result = result.filter(
        (j) => j.first_entry_account === parseInt(filterAccount) || j.second_entry_account === parseInt(filterAccount),
      );
    }

    // Search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((j) => {
        const acctName = getAccountName(j.first_entry_account).toLowerCase();
        return (
          (j.description && j.description.toLowerCase().includes(term)) ||
          acctName.includes(term) ||
          (j.id && String(j.id).includes(term))
        );
      });
    }

    // Sort
    result = result.sort((a, b) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];

      if (sortColumn === 'account') {
        valA = getAccountName(a.first_entry_account);
        valB = getAccountName(b.first_entry_account);
      }

      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  })();

  $: paginatedJournals = (() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredJournals.slice(start, end);
  })();

  $: totalPages = Math.ceil(filteredJournals.length / itemsPerPage);

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
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
    await loadJournals();
  }
  function getAccountName(id) {
    const acc = accounts.find((a) => a.id === id) || {};
    if (t('Lang') === 'en') return acc.name || '';
    if (t('Lang') === 'fa') return acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') return acc.name_ps || acc.name || '';
    return acc.name || '';
  }

  function getJournalActions(journal) {
    const actions = [];

    if (journal.reference_type != 'account' && journal.reference_id) {
      if (journal.reference_type === 'stock_transfer') {
        actions.push({
          icon: 'bi-box2',
          label: t('View'),
          tone: 'view',
          onClick: () => push(`/dashboard/stock-transfers/${journal.reference_id}`),
        });
      } else if (journal.reference_type === 'sale') {
        actions.push({
          icon: 'bi-cart',
          label: t('View'),
          tone: 'view',
          onClick: () => push(`/dashboard/sales/${journal.reference_id}`),
        });
      } else if (journal.reference_type === 'sale_payment') {
        actions.push({
          icon: 'bi-cart',
          label: t('View'),
          tone: 'view',
          onClick: () => {
            const payment = sale_payments.find((item) => item.id === journal.reference_id);
            if (payment) push(`/dashboard/sales/${payment.sale_id}`);
          },
        });
      } else if (journal.reference_type === 'purchase') {
        actions.push({
          icon: 'bi-truck',
          label: t('View'),
          tone: 'view',
          onClick: () => push(`/dashboard/purchases/${journal.reference_id}`),
        });
      } else if (journal.reference_type === 'purchase_payment') {
        actions.push({
          icon: 'bi-truck',
          label: t('View'),
          tone: 'view',
          onClick: () => {
            const payment = purchase_payments.find((item) => item.id === journal.reference_id);
            if (payment) push(`/dashboard/purchases/${payment.purchase_id}`);
          },
        });
      } else if (journal.reference_type === 'exchange') {
        actions.push({
          icon: 'bi-currency-exchange',
          label: t('View'),
          tone: 'view',
          onClick: () => push('/dashboard/exchanges/list'),
        });
      }
    } else {
      if (permissions?.some((permission) => permission.code === 'Journals' && permission.edit)) {
        actions.push({
          icon: 'bi-pencil',
          label: t('Edit'),
          tone: 'edit',
          onClick: () => modalRef.openModal(journal.id),
        });
      }

      if (permissions?.some((permission) => permission.code === 'Journals' && permission.delete)) {
        actions.push({
          icon: 'bi-trash',
          label: t('Delete'),
          tone: 'danger',
          onClick: () => {
            toast.confirm(t('Are you sure?'), t("You won't be able to revert this!")).then((ok) => {
              if (ok) deleteJournal(journal.id);
            });
          },
        });
      }
    }

    actions.push({
      icon: 'bi-printer',
      label: t('Print'),
      tone: 'view',
      onClick: () => {
        showReceipt = true;
        selectedJournal = journal;
      },
    });

    return actions;
  }

  // Reset pagination when filters change
  $: if (searchTerm || filterAccount || filterStatus) {
    currentPage = 1;
  }

  function editJournal(j) {}

  let entry_account_search = '';
  let showAccountDropdown = false;
  let filteredAccounts = [];

  function getAccountTypeColor(type) {
    const colors = ['dark', 'danger', 'secondary', 'primary', 'success', 'info', 'warning', 'dark', 'info', 'success'];
    return colors[type];
  }

  import { auth } from '../../auth/authStore';
  $: permissions = $auth.permissions;

  let reloadAddJournal = true;
  let showAddJournal = false;

  async function reloadAddJournalComponent() {
    reloadAddJournal = false;
    await tick(); // wait for the component to unmount
    reloadAddJournal = true; // mount a fresh instance
    showAddJournal = false;
    await loadJournals();
  }

  $: journalToolbarFilters = [
    {
      key: 'account', label: t('Account'), value: filterAccount, visible: !account_id,
      options: [{ value: 'all', label: t('All') }, ...accounts.map((account) => ({ value: account.id, label: getAccountName(account.id) }))],
    },
    {
      key: 'reference', label: t('Reference Type'), value: reference_type ?? 'all',
      options: [{ value: 'all', label: t('All') }, ...reference_types.filter(Boolean).map((type) => ({ value: type, label: t(type) }))],
    },
  ];

  function handleJournalFilterChange(event) {
    if (event.detail.key === 'account') filterAccount = event.detail.value;
    if (event.detail.key === 'reference') reference_type = event.detail.value === 'all' ? null : event.detail.value;
    currentPage = 1;
  }

  function resetJournalFilters() {
    searchTerm = '';
    filterAccount = 'all';
    reference_type = null;
    currentPage = 1;
  }
</script>

<EditJournalModal bind:this={modalRef} on:saved={loadJournals} />

<div class="journals-page">

{#if showAddJournal}
  <QuickEntryModal
    title={t('Add Journal')}
    subtitle=""
    icon="bi-journal-plus"
    appearance="journal"
    dir={t('dir')}
    on:close={() => (showAddJournal = false)}>
    {#if reloadAddJournal}
      <AddJournal selectedAccountID={account_id} on:saved={reloadAddJournalComponent} />
    {/if}
  </QuickEntryModal>
{/if}

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('Journals')}
  toolbarWidth="25rem"
  showFooter={!loading && filteredJournals.length > 0}
  dense={true}
  tablePadding={true}>
  <svelte:fragment slot="actions">
        <ActionButton icon="bi-plus-lg"
         label={t('Add Journal')}
          on:click={() => (showAddJournal = true)} />
  </svelte:fragment>
  <svelte:fragment slot="toolbar">
    <FilterToolbar
      searchValue={searchTerm}
      searchPlaceholder={t('Search journals...')}
      filters={journalToolbarFilters}
      filterLabel={t('Filter')}
      resetLabel={t('Clear Filters')}
      showReset={true}
      on:searchChange={(event) => { searchTerm = event.detail; currentPage = 1; }}
      on:filterChange={handleJournalFilterChange}
      on:reset={resetJournalFilters} />
  </svelte:fragment>

    {#if loading}
      <div class="index-table-state">
        <EmptyState loading message={t('Loading...')} />
      </div>
    {:else if filteredJournals.length === 0}
      <div class="index-table-state">
        <EmptyState icon="bi-inbox" message={t('No journal entries found.')} />
      </div>
    {:else}
      <DataTable
        ariaLabel={t('Journals')}
        minWidth="900px"
        dense={true}
        striped={true}
        hover={false}
        stickyHeader={true}
        layout="fixed"
        scrollbar="thin">
          <svelte:fragment slot="head">
            <tr>
              <th class="ps-4 cursor-pointer" on:click={() => setSort('id')}>
                {t('ID')}
                {#if sortColumn === 'id'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="text-center cursor-pointer" on:click={() => setSort('created_at')}
                >{t('Date')}
                {#if sortColumn === 'created_at'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="text-center cursor-pointer" on:click={() => setSort('account')}
                >{t('Account')}
                {#if sortColumn === 'account'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="text-center">{t('Description')} </th>
              <th class="text-center cursor-pointer">{t('Debit')} </th>
              <th class="text-center cursor-pointer">{t('Credit')} </th>
              <th class="text-center cursor-pointer">{t('Reference')} </th>
              <th class="text-center">{t('Actions')}</th>
            </tr>
          </svelte:fragment>
            {#each paginatedJournals as j}
              <tr>
                <td class="cell-muted">{shortID(j.id)}</td>
                <td>
                  <StatusBadge tone="neutral" ghost ltr={true} stacked>{@html showDate(j.created_at)}</StatusBadge>
                </td>
                <td>
                  <div class="account-pair">
                    <StatusBadge tone={j.first_entry_credit > 0 ? 'positive' : 'negative'}>
                      <button
                        type="button"
                        class="cell-link"
                        on:click={() => push(`/dashboard/account/${j.first_entry_account}`)}>
                        {getAccountName(j.first_entry_account)}
                      </button>
                    </StatusBadge>
                    <StatusBadge tone={j.second_entry_credit > 0 ? 'positive' : 'negative'}>
                      <button
                        type="button"
                        class="cell-link"
                        on:click={() => push(`/dashboard/account/${j.second_entry_account}`)}>
                        {getAccountName(j.second_entry_account)}
                      </button>
                    </StatusBadge>
                  </div>
                </td>
                <td><span class="description-cell" title={j.description || ''}>{j.description || '—'}</span></td>
                <td>
                  {#if j.first_entry_debit != 0}
                    <StatusBadge tone="negative" ltr={true}>
                      {Number(j.first_entry_debit).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {t(j.currency)}
                    </StatusBadge>
                  {:else}
                    <span class="muted-dash">—</span>
                  {/if}
                </td>
                <td>
                  {#if j.first_entry_credit != 0}
                    <StatusBadge tone="positive" ltr={true}>
                      {Number(j.first_entry_credit).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {t(j.currency)}
                    </StatusBadge>
                  {:else}
                    <span class="muted-dash">—</span>
                  {/if}
                </td>
                <td>
                  {#if j.reference_type}
                    <StatusBadge tone="info">{t(j.reference_type)}</StatusBadge>
                  {:else}
                    <span class="muted-dash">—</span>
                  {/if}
                </td>
                <td><TableActions actions={getJournalActions(j)} /></td>
              </tr>
            {/each}
      </DataTable>
    {/if}

  <svelte:fragment slot="footer">
    <PaginationBar
      bind:currentPage
      {totalPages}
      {itemsPerPage}
      totalItems={filteredJournals.length}
      ariaLabel="Pagination"
      rowLabel={t('rows')}
      on:perPageChange={(e) => (itemsPerPage = Number(e.detail))}
      {getPageNumbers} />
  </svelte:fragment>
</IndexPageLayout>
</div>

{#if showReceipt}
  <JournalReceiptModal journal={selectedJournal} on:close={() => (showReceipt = false)} />
{/if}

<style>
  .journals-page {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.65rem;
    width: 100%;
    min-height: 0;
    height: 100%;
    max-height: 100%;
    overflow: hidden;
  }
  .quick-add-button {
    min-height: 2.625rem;
    padding: 0.55rem 1rem;
    border: 0;
    border-radius: 0.65rem;
    background: #2f6fed;
    color: #fff;
    box-shadow: 0 6px 14px rgba(47, 111, 237, 0.2);
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.82rem;
    font-weight: 800;
    white-space: nowrap;
    transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  }

  .quick-add-button:hover { background: #245ed0; box-shadow: 0 8px 18px rgba(47, 111, 237, 0.26); transform: translateY(-1px); }
  .journals-page :global(.filter-toggle) {
    flex-basis: 1.75rem !important;
    width: 1.75rem !important;
    min-width: 1.75rem !important;
    max-width: 1.75rem !important;
    height: 1.75rem !important;
    min-height: 1.75rem !important;
    max-height: 1.75rem !important;
    border-radius: 0.4rem !important;
    background: #0f6efd !important;
    color: #ffffff !important;
    box-shadow: 0 2px 6px rgba(37, 99, 235, 0.18) !important;
  }
  .journals-page :global(.filter-toggle:hover) { background: #1d4ed8 !important; }
  .journals-page :global(.filter-toggle i) {
    color: #ffffff !important;
    opacity: 1;
    -webkit-text-fill-color: #ffffff;
  }
  .journals-heading { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
  .journals-heading-icon { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 10px; background: #eaf2ff; color: #2f6fed; font-size: 1.15rem; }
  .journals-heading small { display: block; color: #94a3b8; font-size: .68rem; font-weight: 800; }
  .journals-heading h2 { margin: 1px 0 0; color: #263244; font-size: 1.15rem; font-weight: 950; }
  .journal-entry-area :global(.card) { border: 1px solid #dfe5ed; border-radius: 12px; background: #fff; box-shadow: 0 4px 16px rgba(30,48,76,.06) !important; }
  .journal-entry-area :global(.card-body) { padding: 0.85rem 1rem; }
  .journals-page :global(.index-page) { flex: 1 1 auto; height: auto; }
  .journals-toolbar { width: 100%; min-width: 0; padding: 0; background: transparent; }
  .journals-toolbar :global(.row) { display: grid; grid-template-columns: minmax(0, 1fr) 9rem; gap: .5rem; width: 100%; margin: 0; }
  .journals-toolbar :global(.col-md-3), .journals-toolbar :global(.col-md-2) { width: 100%; padding: 0; }
  .journals-toolbar :global(.form-outline) {
    position: relative;
    display: flex;
    align-items: center;
    gap: .5rem;
    width: 100%;
    min-height: var(--index-toolbar-control-height, 2.625rem);
    padding-inline: .75rem .375rem;
    border: 1px solid #d6e0ed;
    border-radius: .625rem;
    background: #fff;
    box-shadow: 0 1px 2px rgba(15,23,42,.025);
  }
  .journal-search-icon { flex: 0 0 auto; color: #9aabc0; font-size: 1rem; }
  .journals-toolbar :global(.journal-search-input) { flex: 1 1 auto; min-width: 0; height: 2.5rem; min-height: 2.5rem; margin: 0; padding: 0; border: 0; outline: 0; background: transparent; box-shadow: none; font-size: .875rem; }
  .journals-toolbar :global(.form-select) { height: var(--index-toolbar-control-height, 2.625rem); min-height: var(--index-toolbar-control-height, 2.625rem); border-color: #d6e0ed; border-radius: .625rem; background-color: #fff; font-size: .8125rem; }
  .journal-search-clear { display: inline-grid; place-items: center; flex: 0 0 1.75rem; width: 1.75rem; height: 1.75rem; padding: 0; border: 0; border-radius: .4375rem; background: transparent; color: #94a3b8; font-size: .6875rem; }
  .journal-search-clear:hover { background: #f1f5f9; color: #475569; }
  .account-pair {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: .25rem;
  }
  .cell-link {
    max-width: 100%;
    overflow: hidden;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  .description-cell {
    display: block;
    overflow: hidden;
    color: #64748b;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell-muted,
  .muted-dash { color: #94a3b8; }
  @media (max-width: 767.98px) {
    .journals-toolbar :global(.row) { grid-template-columns: 1fr; }
  }
  .cursor-pointer {
    cursor: pointer;
  }
</style>
