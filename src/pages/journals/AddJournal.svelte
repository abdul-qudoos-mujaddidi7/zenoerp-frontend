<script>
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import { db, logActivity } from '../../db.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import JournalReceiptModal from './JournalReceiptModal.svelte';

  let showReceipt = false;
  let savedJournal = null;

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let componentRoot;
  import AccountModal from '../accounts/AccountModal.svelte';

  import { showDate, setDatePickers } from '../../calendar.js';
  import { toast } from '../../ToastUI/toast.js';

  let accounts = [];
  let accountTypes = [];

  let currencies = [];
  let journals = [];

  let allJournals = [];
  let enable_notrack = false;

  let loading = true;
  let showTrackModal = false;

  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  export let selectedAccountID = null;
  export let journalId = null;

  let general = false;
  export let genInp = null;

  $: if (genInp) {
    general = true;
    let myPercent = accounts.find((a) => a.id == selectedAccountID)?.percentage || 0;

    if (genInp[1] < 0) {
      first_entry_debit = 0;
      first_entry_credit = (genInp[1] / 100) * myPercent * -1;
    } else {
      first_entry_debit = (genInp[1] / 100) * myPercent;
      first_entry_credit = 0;
    }
    description = t('Total') + t('-of-') + t('Dividends') + ': ' +
      (genInp ? Number(genInp[1] || 0).toFixed(2) : '') + ' ' +
      (genInp ? t(genInp[0]) : '') + ' | ' +
      t('Percentage') + ': ' + myPercent + '%';
    second_entry_account = notrack_ID; // this is reactive since it's `let`
    currency = genInp[0];
  }

  export async function modalOpened(id) {
    if (Array.isArray(id)) {
      await loadAccounts();

      general = true;

      accounts = accounts.filter((a) => a.account_type_id === 7);
      filteredAccounts = [...accounts];

      accountTypes = accountTypes.filter((at) => at.id == 7);
      console.log('Filtered accounts:', accounts);

      if (id[0][1] < 0) {
        first_entry_credit = id[0][1] * -1;
      } else {
        first_entry_debit = id[0][1];
      }

      selectedAccountID = id[1];
      first_entry_account = parseInt(selectedAccountID);
      second_entry_account = notrack_ID;
      currency = id[0];
      console.log('second_entry_account', second_entry_account);
    } else {
      journalId = id;
      await loadJournalIfEditing();
    }
  }

  function handleDateChange(inputName, value) {
    if (inputName === 'date') date = value;
  }

  const dispatch = createEventDispatcher();

  let modalRef;
  let modalRefAdd;
  
  let date = new Date().toISOString().slice(0, 10);
  let description = '';
  let currency = '';
  let first_entry_account = '';
  let first_entry_debit = null;
  let first_entry_credit = null;
  let second_entry_account = '';
  let second_entry_debit = null;
  let second_entry_credit = null;
  let reference_id = null;
  let reference_type = null;
  let status = 1;
  let treasury_balance = 0;
  let treasury_ID = 0;
  let notrack_ID = 0;
  let track_ID = 0;
  let account = null;

  if (selectedAccountID) {
    first_entry_account = parseInt(selectedAccountID);
  }

  async function loadAccounts() {
    await loadJournals();
    accountTypes = await db.account_types.where({ status: 1 }).toArray();
    accounts = await db.accounts.where({ status: 1 }).toArray();
    accounts = accounts.filter((a) => (a.account_status ? a.account_status == 'active' : a.status == 1));
    console.log(general);
    accounts.forEach((acc) => {
      if (acc.code === 'TREASURY') {
        second_entry_account = acc.id;
        treasury_ID = acc.id;
      }
      if (acc.code === 'NOTRACK') {
        notrack_ID = acc.id;
      }
    });
    accounts = accounts.filter(
      (a) => !['NOTRACK', 'RECEIVABLE', 'PAYABLE', 'SALES', 'PURCHASE', 'EXCHANGE'].includes(a.code),
    );
    enable_notrack =
      (
        await db.settings
          .where('key')
          .equals('enable_notrack')
          .and((s) => s.status === 1)
          .first()
      )?.value == 1;
    accounts.sort((a, b) => {
      if (a.account_type_id === b.account_type_id) {
        return a.name.localeCompare(b.name);
      }
      return b.account_type_id - a.account_type_id;
    });
    if (general) {
      accounts = accounts.filter((a) => a.account_type_id == 7);
    }
    account = accounts.find((a) => a.id === first_entry_account);
  }

  async function loadCurrencies() {
    currencies = await db.currencies.where({ status: 1 }).toArray();
    const defaultCurr = currencies.find((c) => c.isDefault);
    if (defaultCurr) currency = defaultCurr.code;
  }

  async function loadJournals() {
    loading = true;
    allJournals = await db.journals.where('status').equals(1).toArray();
    journals = allJournals.filter((j) => {
      const firstAccount = accounts.find((a) => a.id === j.first_entry_account);
      const secondAccount = accounts.find((a) => a.id === j.second_entry_account);
      return (
        firstAccount &&
        secondAccount &&
        firstAccount.code !== 'PAYABLE' &&
        firstAccount.code !== 'RECEIVABLE' &&
        secondAccount.code !== 'PAYABLE' &&
        secondAccount.code !== 'RECEIVABLE'
      );
    });
    journals = journals.reverse();
    loading = false;
  }

  async function loadJournalIfEditing() {
    if (journalId) {
      let journal = await db.journals.where({ id: Number(journalId), status: 1 }).first();
      if (journal) {
        date = journal.date.slice(0, 10);
        console.log(date);
        description = journal.description;
        currency = journal.currency;
        first_entry_account = journal.first_entry_account;
        first_entry_debit = journal.first_entry_debit;
        first_entry_credit = journal.first_entry_credit;
        second_entry_account = journal.second_entry_account;
        second_entry_debit = journal.second_entry_debit;
        second_entry_credit = journal.second_entry_credit;
        reference_id = journal.reference_id;
        reference_type = journal.reference_type;
        status = journal.status;
        let first_account = await db.accounts.where({ id: first_entry_account, status: 1 }).first();
        first_entry_account_search = first_account
          ? t('Lang') === 'en'
            ? first_account.name
            : t('Lang') === 'fa'
              ? first_account.name_fa
              : t('Lang') === 'ps'
                ? first_account.name_ps
                : first_account.name
          : first_entry_account;
        if (second_entry_account != treasury_ID && second_entry_account != notrack_ID) {
          track_ID = second_entry_account;
          console.log('Track', second_entry_account);
        }
        console.log('loaded', journal);
      }
    }
  }

  onMount(async () => {
    loadCurrencies();
    await loadAccounts();
    if (window.mdb) {
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
    loadJournalIfEditing();
    await tick();
    setDatePickers(handleDateChange, componentRoot); //
  });

  async function saveJournal() {
  const debitAmount = Number(first_entry_debit ?? 0);
  const creditAmount = Number(first_entry_credit ?? 0);

  if (!first_entry_account || !second_entry_account) {
    toast.error(t('Error'), t('Please select accounts for both entries.'));
    return;
  }

  if (first_entry_account == second_entry_account) {
    toast.error(
      t('Error'),
      t('Please select different accounts for both entries.')
    );
    return;
  }

  // Prevent saving when both debit and credit are null, empty, invalid, or zero
  const hasDebit =
    Number.isFinite(debitAmount) && debitAmount > 0;

  const hasCredit =
    Number.isFinite(creditAmount) && creditAmount > 0;

  if (!hasDebit && !hasCredit) {
    toast.error(
      t('Error'),
      t('Please enter a debit or credit amount greater than zero.')
    );
    return;
  }

  // Extra protection: do not allow both fields at the same time
  if (hasDebit && hasCredit) {
    toast.error(
      t('Error'),
      t('Enter an amount in either debit or credit, not both.')
    );
    return;
  }

  if (first_entry_account == treasury_ID) {
    if (hasCredit && creditAmount > treasury_balance * -1) {
      toast.error(t('Error'), t('Insufficient Funds in Treasury.'));
      return;
    }
  }

  if (second_entry_account == treasury_ID) {
    if (hasDebit && debitAmount > treasury_balance * -1) {
      toast.error(t('Error'), t('Insufficient Funds in Treasury.'));
      return;
    }
  }

  // Generate the second entry safely from the entered amount
  const data = {
    date,
    description,
    reference_id,
    reference_type,
    currency,

    first_entry_account,
    first_entry_debit: hasDebit ? debitAmount : 0,
    first_entry_credit: hasCredit ? creditAmount : 0,

    second_entry_account,
    second_entry_debit: hasCredit ? creditAmount : 0,
    second_entry_credit: hasDebit ? debitAmount : 0,

    status: parseInt(status) || 1,
  };

  try {
    if (!journalId) {
      const newId = await db.journals.add(data);
      data.id = newId;

      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'create',
        table_name: 'journals',
        entity_id: data.id,
        old_values: null,
        new_values: JSON.stringify(data),
        description: 'Created new journal entry',
      });
    } else {
      let oldValues = await db.journals
        .where({
          id: Number(journalId),
          status: 1,
        })
        .first();

      if (!oldValues) {
        oldValues = null;
      }

      await db.journals.update(Number(journalId), data);
      data.id = Number(journalId);

      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'Update',
        table_name: 'journals',
        entity_id: data.id,
        old_values: oldValues,
        new_values: JSON.stringify(data),
        description: 'Updated journal entry',
      });
    }

    savedJournal = { ...data };

    resetForm();
    await loadAccounts();
    await loadJournals();
    await tick();

    dispatch('saved', { journal: data });

    if (!general) {
      showReceipt = true;
    }

    toast.success(t('Success'), t('Journal saved successfully.'));
  } catch (err) {
    console.error('Failed to save journal:', err);

    toast.error(
      t('Error'),
      t('An error occurred while saving the journal. Please try again.')
    );
  }
}
  function resetForm() {
    date = new Date().toISOString().slice(0, 10);
    description = '';
    if (!selectedAccountID) {
      first_entry_account = '';
    } else {
      first_entry_account = parseInt(selectedAccountID);
    }
    first_entry_debit = null;
    first_entry_credit = null;
    first_entry_account_search = '';
    accounts.forEach((acc) => {
      if (acc.code === 'TREASURY') {
        second_entry_account = acc.id;
      }
    });
    currency = currencies.find((c) => c.isDefault)?.code || '';
    second_entry_debit = null;
    second_entry_credit = null;
    status = 1;
  }

  function format(value) {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    });
  }
  function normalize(value) {
    if (!value) return '0';
    value = value.toString().replace(/[^0-9.]/g, '');
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }
    let [integer, decimal] = value.split('.');
    if (integer) {
      integer = integer.replace(/^0+(?=\d)/, '');
      if (integer === '') integer = '0';
    }
    return decimal !== undefined ? integer + '.' + decimal : integer;
  }
  function onFirstDebitInput(value) {
    const amount = normalize(value);
    first_entry_debit = amount;
    first_entry_credit = null;
    second_entry_credit = amount;
    second_entry_debit = null;
  }
  function onFirstCreditInput(value) {
    const amount = normalize(value);
    first_entry_credit = amount;
    first_entry_debit = null;
    second_entry_debit = amount;
    second_entry_credit = null;
  }
  function onSecondDebitInput(value) {
    const amount = normalize(value);
    second_entry_debit = amount;
    second_entry_credit = null;
    first_entry_credit = amount;
    first_entry_debit = null;
  }
  function onSecondCreditInput(value) {
    const amount = normalize(value);
    second_entry_credit = amount;
    second_entry_debit = null;
    first_entry_debit = amount;
    first_entry_credit = null;
  }
  function onlyNumbers(e) {
    const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'];
    if (allowed.includes(e.key)) return;
    if (/[0-9]/.test(e.key)) return;
    if (e.key === '.' && !e.target.value.includes('.')) return;
    e.preventDefault();
  }
  let first_entry_account_search = '';
  let showAccountDropdown = false;
  let filteredAccounts = [];
  let second_entry_account_search = '';
  let filteredSecondAccounts = [];
  let currencyMenuFor = null; // 'debit' | 'credit' | null

  function getAccountName(id) {
    const acc = accounts.find((a) => a.id === id);
    if (!acc) return '';
    if (t('Lang') === 'fa') return acc.name_fa || acc.name;
    if (t('Lang') === 'ps') return acc.name_ps || acc.name;
    return acc.name;
  }

  function selectCurrency(code) {
    currency = code;
    currencyMenuFor = null;
  }

  function toggleCurrencyMenu(which) {
    currencyMenuFor = currencyMenuFor === which ? null : which;
  }

  function handleWindowClick(event) {
    if (currencyMenuFor && !event.target.closest('.journal-currency-picker')) {
      currencyMenuFor = null;
    }
  }
  function calculateAccountBalance(accountId, currency) {
    let balance = {};
    allJournals.forEach((j) => {
      if (j.first_entry_account === accountId) {
        const currency = j.currency || 'AFN';
        balance[currency] =
          (balance[currency] || 0) + (Number(j.first_entry_credit || 0) - Number(j.first_entry_debit || 0));
      }
      if (j.second_entry_account === accountId) {
        const currency = j.currency || 'AFN';
        balance[currency] =
          (balance[currency] || 0) + (Number(j.second_entry_credit || 0) - Number(j.second_entry_debit || 0));
      }
    });
    if (accounts.find((a) => a.id === accountId)?.code === 'TREASURY') {
      treasury_balance = balance[currency] || 0;
    }
    console.log('Calculated balance for account', accountId, accounts.length, balance, allJournals.length);
    return balance.toString
      ? Object.entries(balance)
          .map(([cur, amt]) =>
            cur == currency
              ? t('Balance') +
                `: <span dir='ltr' class='text-${amt > 0 ? 'success' : 'danger'}'>${amt.toFixed(2)}</span> ${t(cur)}`
              : '',
          )
          .join('')
      : '';
  }
  function getAccountTypeColor(type) {
    const colors = ['dark', 'danger', 'secondary', 'primary', 'success', 'info', 'warning', 'dark', 'info', 'success'];
    return colors[type];
  }
  let first_entry_account_search_input = null;
  import { auth } from '../../auth/authStore';
  $: permissions = $auth.permissions;
</script>

<svelte:window on:click={handleWindowClick} />

{#if !permissions?.some((p) => p.code === 'Journals' && p.create)}
  <!-- <h3 class="text-danger m-3"><i class="bi bi-exclamation-triangle me-2"></i>{t('No access allowed')}</h3> -->
{:else}
  <div class="journal-form-page" bind:this={componentRoot}>
    <div class="card shadow-sm journal-form-card">
      <div class="card-body journal-form-fields">
        <div class="row g-2 journal-form-row">
        <div class="col-md-3 journal-customer-field">
            <label class="journal-field-label">{t('Select Customer')}</label>
            <div class="position-relative">
              <div
                class="input-group input-group-sm w-100 journal-unified-input-group journal-unified-input-group--account">
                <button
                  class="btn btn-info btn-sm journal-input-addon-btn journal-account-quick-btn"
                  type="button"
                  on:click={() => modalRefAdd.openModal()}>
                  <i class="bi bi-plus"></i>
                </button>
                {#if first_entry_account}
                  <span
                    class="form-control form-control-sm journal-account-selected-name"
                    role={!selectedAccountID ? 'button' : undefined}
                    tabindex={!selectedAccountID ? 0 : undefined}
                    on:click={async () => {
                      if (selectedAccountID) return;
                      first_entry_account = '';
                      first_entry_account_search = '';
                      showAccountDropdown = true;
                      filteredAccounts = accounts;
                      await tick();
                      first_entry_account_search_input?.focus();
                    }}
                    on:keydown={(e) => {
                      if (selectedAccountID) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.currentTarget.click();
                      }
                    }}>
                    {getAccountName(first_entry_account)}
                  </span>
                {:else}
                  <input
                    type="text"
                    class="form-control form-control-sm journal-account-search-input"
                    id="form_account_search"
                    bind:this={first_entry_account_search_input}
                    bind:value={first_entry_account_search}
                    placeholder={t('Select Customer')}
                    on:input={() => {
                      showAccountDropdown = true;
                      filteredAccounts = accounts.filter((acc) => {
                        const name =
                          t('Lang') === 'en'
                            ? acc.name
                            : t('Lang') === 'fa'
                              ? acc.name_fa
                              : t('Lang') === 'ps'
                                ? acc.name_ps
                                : acc.name;
                        return name && name.toLowerCase().includes(first_entry_account_search.trim().toLowerCase());
                      });
                    }}
                    on:focus={() => {
                      showAccountDropdown = true;
                      if (first_entry_account_search.trim()) {
                        filteredAccounts = accounts.filter((acc) => {
                          const name =
                            t('Lang') === 'en'
                              ? acc.name
                              : t('Lang') === 'fa'
                                ? acc.name_fa
                                : t('Lang') === 'ps'
                                  ? acc.name_ps
                                  : acc.name;
                          return name && name.toLowerCase().includes(first_entry_account_search.trim().toLowerCase());
                        });
                      } else {
                        filteredAccounts = accounts;
                      }
                    }}
                    on:blur={() => setTimeout(() => (showAccountDropdown = false), 150)}
                    autocomplete="off" />
                {/if}
              </div>
              <AccountModal
                bind:this={modalRefAdd}
                {accountTypes}
                on:saved={async (e) => {
                  await loadAccounts();
                  first_entry_account = e.detail.account.id;
                  first_entry_account_search = '';
                }} />
              {#if showAccountDropdown && filteredAccounts.length > 0}
                <ul
                  class="list-group position-absolute w-100 z-3 journal-form-dropdown"
                  style="max-height:180px;overflow:auto;">
                  {#each filteredAccounts as acc}
                    <li
                      class="list-group-item list-group-item-action bg-body small px-2 py-1"
                      style="cursor:pointer"
                      on:mousedown={() => {
                        first_entry_account = acc.id;
                        first_entry_account_search =
                          t('Lang') === 'en'
                            ? acc.name
                            : t('Lang') === 'fa'
                              ? acc.name_fa
                              : t('Lang') === 'ps'
                                ? acc.name_ps
                                : acc.name;
                        showAccountDropdown = false;
                      }}>
                      <span class="badge badge-{getAccountTypeColor(acc.account_type_id)} ms-2 float-end">
                        {#if accountTypes.find((at) => at.id === acc.account_type_id)?.name}
                          {t('Lang') === 'en'
                            ? accountTypes.find((at) => at.id === acc.account_type_id)?.name
                            : t('Lang') === 'fa'
                              ? accountTypes.find((at) => at.id === acc.account_type_id)?.name_fa
                              : t('Lang') === 'ps'
                                ? accountTypes.find((at) => at.id === acc.account_type_id)?.name_ps
                                : accountTypes.find((at) => at.id === acc.account_type_id)?.name}
                        {:else}
                          N/A
                        {/if}
                      </span>
                      {#if t('Lang') === 'en' && acc.name}{acc.name}{/if}
                      {#if t('Lang') === 'fa' && acc.name_fa}{acc.name_fa}{/if}
                      {#if t('Lang') === 'ps' && acc.name_ps}{acc.name_ps}{/if}
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
            {#if first_entry_account}
              <div class="form-text mt-0 text-start journal-balance-text">
                {@html calculateAccountBalance(first_entry_account, currency)}
              </div>
            {/if}
          </div>
          <div class="col-md-3 journal-date-field">
            <label class="journal-field-label">{t('Date')}</label>
            <div class="input-group input-group-sm persianDatePicker journal-unified-input-group">
              <input type="date" class="form-control form-control-sm" data-bind="date" bind:value={date} />
              <span class="input-group-text persian-date-text"></span>
            </div>
          </div>
          
          <div class="col-md-3 journal-debit-field">
            <label class="journal-field-label">{t('Debit')}</label>
            <div
              class="journal-amount-row journal-amount-row--debit"
              style="border-color: #e2e8f0 !important; box-shadow: none !important; outline: none !important;">
              <div
                class="input-group input-group-sm journal-unified-input-group journal-unified-input-group--inline"
                style="border-color: transparent !important; box-shadow: none !important; outline: none !important;">
                <input
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9,]*"
                  id="first_entry_debit"
                  class="form-control form-control-sm {second_entry_account == treasury_ID &&
                  parseFloat(treasury_balance) > parseFloat(first_entry_debit) * -1
                    ? 'is-invalid'
                    : ''}"
                  style="background: #feecec !important; background-color: #feecec !important; color: #b91c1c; border-color: transparent !important; box-shadow: none !important; outline: none !important;"
                  placeholder={t('Debit')}
                  value={format(first_entry_debit)}
                  on:keydown={onlyNumbers}
                  on:input={(e) => onFirstDebitInput(normalize(e.target.value))} />
              </div>
              <div class="journal-currency-picker">
                <button
                  id="journalCurrencyDropdown"
                  class="journal-currency-picker__btn"
                  type="button"
                  aria-expanded={currencyMenuFor === 'debit'}
                  aria-haspopup="listbox"
                  aria-label={t('Currency')}
                  on:click|stopPropagation={() => toggleCurrencyMenu('debit')}>
                  {t(currency)}
                  <i class="bi bi-chevron-down" aria-hidden="true"></i>
                </button>
                {#if currencyMenuFor === 'debit'}
                  <ul class="journal-currency-menu" role="listbox">
                    {#each currencies as cur}
                      <li role="option" aria-selected={currency === cur.code}>
                        <button
                          class="journal-currency-menu__item"
                          class:selected={currency === cur.code}
                          on:click|stopPropagation={() => selectCurrency(cur.code)}
                          type="button">
                          {t(cur.code)}
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            </div>
            {#if second_entry_account == treasury_ID &&
            parseFloat(treasury_balance) > parseFloat(first_entry_debit) * -1}
              <div class="journal-invalid-feedback">
                {t("Treasury Account doesn't have enough funds.")}
              </div>
            {/if}
          </div>
          <div class="col-md-3 journal-credit-field">
            <label class="journal-field-label">{t('Credit')}</label>
            <div
              class="journal-amount-row journal-amount-row--credit"
              style="border-color: #e2e8f0 !important; box-shadow: none !important; outline: none !important;">
              <div
                class="input-group input-group-sm journal-unified-input-group journal-unified-input-group--inline"
                style="border-color: transparent !important; box-shadow: none !important; outline: none !important;">
                <input
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9,]*"
                  id="first_entry_credit"
                  class="form-control form-control-sm {first_entry_account == treasury_ID &&
                  parseFloat(treasury_balance) > parseFloat(first_entry_credit) * -1
                    ? 'is-invalid'
                    : ''}"
                  style="background: #e9f9ef !important; background-color: #e9f9ef !important; color: #047857; border-color: transparent !important; box-shadow: none !important; outline: none !important;"
                  placeholder={t('Credit')}
                  value={format(first_entry_credit)}
                  on:keydown={onlyNumbers}
                  on:input={(e) => onFirstCreditInput(normalize(e.target.value))} />
              </div>
              <div class="journal-currency-picker">
                <button
                  class="journal-currency-picker__btn"
                  type="button"
                  aria-expanded={currencyMenuFor === 'credit'}
                  aria-haspopup="listbox"
                  aria-label={t('Currency')}
                  on:click|stopPropagation={() => toggleCurrencyMenu('credit')}>
                  {t(currency)}
                  <i class="bi bi-chevron-down" aria-hidden="true"></i>
                </button>
                {#if currencyMenuFor === 'credit'}
                  <ul class="journal-currency-menu" role="listbox">
                    {#each currencies as cur}
                      <li role="option" aria-selected={currency === cur.code}>
                        <button
                          class="journal-currency-menu__item"
                          class:selected={currency === cur.code}
                          on:click|stopPropagation={() => selectCurrency(cur.code)}
                          type="button">
                          {t(cur.code)}
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            </div>
            {#if first_entry_account == treasury_ID &&
            parseFloat(treasury_balance) > parseFloat(first_entry_credit) * -1}
              <div class="journal-invalid-feedback">
                {t("Treasury Account doesn't have enough funds.")}
              </div>
            {/if}
          </div>
          <div class="col-md-4 journal-description-field">
            <label class="journal-field-label">{t('Description')}</label>
            <div class="journal-unified-input-group">
              <input
                id="c-description"
                class="form-control form-control-sm"
                placeholder={t('Description')}
                bind:value={description} />
            </div>
          </div>
          <div class="col-md-5 journal-mode-field">
            <div class="journal-mode-actions">
              {#if !general}
                <button
                  id="second_entry_account_search"
                  class="journal-mode-btn"
                  class:journal-mode-btn--active={second_entry_account == track_ID}
                  class:journal-mode-btn--track={second_entry_account == track_ID}
                  type="button"
                  on:click={() => {
                    filteredSecondAccounts = accounts;
                    showTrackModal = true;
                  }}>
                  <i class="bi bi-check-circle"></i>
                  {#if second_entry_account == track_ID}
                    {getAccountName(track_ID)}
                  {:else}
                    {t('Track')}
                  {/if}
                </button>
              {/if}
              {#if enable_notrack || general}
                <button
                  class="journal-mode-btn"
                  class:journal-mode-btn--active={second_entry_account == notrack_ID}
                  class:journal-mode-btn--notrack={second_entry_account == notrack_ID}
                  type="button"
                  on:click={() => {
                    second_entry_account = notrack_ID;
                  }}>
                  <i class="bi bi-x-circle"></i>
                  {t('No Track')}
                </button>
              {/if}
              {#if !general}
                <button
                  class="journal-mode-btn"
                  class:journal-mode-btn--active={second_entry_account == treasury_ID}
                  class:journal-mode-btn--treasury={second_entry_account == treasury_ID}
                  type="button"
                  on:click={() => {
                    second_entry_account = treasury_ID;
                  }}>
                  <i class="bi bi-box"></i>
                  {t('Treasury')}
                </button>
              {/if}
            </div>
            <div class="form-text mt-0 text-end journal-balance-text">
              {@html second_entry_account != notrack_ID ? calculateAccountBalance(second_entry_account, currency) : ''}
            </div>
            {#if showTrackModal}
              <div
                use:portal
                class="modal fade show d-block track-picker-layer"
                id="trackModal"
                tabindex="-1"
                role="dialog"
                aria-modal="true"
                aria-labelledby="trackModalLabel"
                on:click|self={() => (showTrackModal = false)}>
                <div class="modal-dialog modal-dialog-centered track-picker-dialog">
                  <div class="modal-content track-picker-modal">
                    <div class="modal-header track-picker-header">
                      <div class="track-picker-heading">
                        <span><i class="bi bi-person-check"></i></span>
                        <div><small>{t('Account')}</small><h5 class="modal-title" id="trackModalLabel">{t('Track')}</h5></div>
                      </div>
                      <button
                        type="button"
                        class="track-picker-close"
                        aria-label="Close"
                        on:click={() => (showTrackModal = false)}><i class="bi bi-x-lg"></i></button>
                    </div>
                    <div class="modal-body track-picker-body">
                      <div class="mb-3">
                        <div class="input-group track-search-group">
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
                            <i class="bi bi-plus"></i>
                          </button>
                        </div>
                        <div class="mt-3 track-account-list">
                          {#each filteredSecondAccounts as acc}
                            <div class="list-group mt-1 track-account-group">
                              <button
                                type="button"
                                class="list-group-item list-group-item-action track-account-row"
                                on:click={() => {
                                  second_entry_account = acc.id;
                                  track_ID = acc.id;
                                  showTrackModal = false;
                                }}>
                                {getAccountName(acc.id)}
                                <span class="badge badge-{getAccountTypeColor(acc.account_type_id)} ms-2 float-end">
                                  {#if accountTypes.find((at) => at.id === acc.account_type_id)?.name}
                                    {t('Lang') === 'en'
                                      ? accountTypes.find((at) => at.id === acc.account_type_id)?.name
                                      : t('Lang') === 'fa'
                                        ? accountTypes.find((at) => at.id === acc.account_type_id)?.name_fa
                                        : t('Lang') === 'ps'
                                          ? accountTypes.find((at) => at.id === acc.account_type_id)?.name_ps
                                          : accountTypes.find((at) => at.id === acc.account_type_id)?.name}
                                  {:else}
                                    N/A
                                  {/if}
                                </span>
                              </button>
                            </div>
                            {#if filteredSecondAccounts.length === 0}
                              <div class="track-empty">
                                <i class="bi bi-person-x"></i><span>{t('No accounts found')}</span>
                              </div>
                            {/if}
                          {/each}
                        </div>
                      </div>
                    </div>
                    <div class="modal-footer track-picker-footer">
                      <button type="button" class="track-cancel-btn" on:click={() => (showTrackModal = false)}
                        ><i class="bi bi-x-lg"></i>
                        {t('Close')}</button>
                    </div>
                  </div>
                </div>
              </div>
            {/if}
            <AccountModal
              bind:this={modalRef}
              {accountTypes}
              on:saved={async (e) => {
                await loadAccounts();
                second_entry_account = e.detail.account.id;
                track_ID = e.detail.account.id;
                showTrackModal = false;
                setTimeout(() => {
                  if (window.mdb) {
                    document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                  }
                }, 100);
              }} />
          </div>
          <div class="col-md-3 d-none">
            <label class="form-label">Debit</label>
            <input
              readonly
              type="number"
              class="form-control"
              bind:value={second_entry_debit}
              on:input={(e) => onSecondDebitInput(e.target.value)} />
          </div>
          <div class="col-md-3 d-none">
            <label class="form-label">Credit</label>
            <input
              readonly
              type="number"
              class="form-control"
              bind:value={second_entry_credit}
              on:input={(e) => onSecondCreditInput(e.target.value)} />
          </div>
          <div class="col-md-3 d-flex align-items-start gap-2 journal-submit-field">
            <button class="btn btn-primary btn-sm w-100 journal-submit-btn" on:click={saveJournal}>
              <i class="bi bi-check-circle"></i>
              {journalId ? t('Update Journal') : t('Add Journal')}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  {#if showReceipt}
    <JournalReceiptModal journal={savedJournal} on:close={() => (showReceipt = false)} />
  {/if}
{/if}

<style>
  .journal-form-page {
    --journal-control-height: 2rem;
    --journal-label-offset: 1.05rem;
    background: transparent;
    padding-bottom: 0;
    color: #0f172a;
  }

  .journal-form-card {
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.045) !important;
    overflow: hidden;
    background: #ffffff;
  }

  .journal-form-card :global(.card-body) {
    padding: 0.85rem 1rem;
    overflow: visible;
  }

  .journal-field-label {
    display: block;
    margin-bottom: 0.25rem;
    color: #64748b;
    font-size: 0.68rem;
    font-weight: 750;
    line-height: 1.2;
  }

  .journal-form-fields :global(.form-control),
  .journal-form-fields :global(.form-select),
  .journal-form-page :global(.form-control),
  .journal-form-page :global(.form-select) {
    border-color: #e2e8f0;
    border-radius: 8px;
    background: #ffffff;
    font-size: 0.8125rem;
    font-weight: 600;
    color: #334155;
    min-height: var(--journal-control-height) !important;
    height: var(--journal-control-height);
    padding-block: 0.25rem;
    padding-inline: 0.625rem;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }

  .journal-form-fields :global(.form-control-sm),
  .journal-form-page :global(.form-control-sm) {
    min-height: var(--journal-control-height) !important;
    height: var(--journal-control-height);
    font-size: 0.8125rem;
    padding-block: 0.25rem;
    padding-inline: 0.625rem;
  }

  .journal-form-fields :global(.form-control:focus),
  .journal-form-fields :global(.form-select:focus),
  .journal-form-page :global(.form-control:focus),
  .journal-form-page :global(.form-select:focus) {
    border-color: #93c5fd;
    background: #ffffff;
    box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.1);
  }

  .journal-unified-input-group.persianDatePicker {
    flex-direction: row !important;
    align-items: stretch !important;
  }

  .journal-unified-input-group.persianDatePicker :global(.persian-date-text) {
    flex: 1 1 50%;
    min-width: 0;
    width: auto;
    border-inline-start: 1px solid #e2e8f0 !important;
    border-bottom: 0;
    justify-content: center;
    text-align: center;
    background: var(--erp-bg) !important;
    height: var(--journal-control-height);
    min-height: var(--journal-control-height);
    max-height: var(--journal-control-height);
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.2;
    padding: 0 0.45rem;
  }

  .journal-unified-input-group.persianDatePicker :global(.input-group-text.badge-warning) {
    flex: 0 0 auto;
    width: auto;
    border-inline-start: 0 !important;
    border-bottom: 0;
    border-inline-end: 1px solid #e2e8f0;
    justify-content: center;
    height: var(--journal-control-height);
    min-height: var(--journal-control-height);
    max-height: var(--journal-control-height);
  }

  .journal-unified-input-group.persianDatePicker :global(.form-control) {
    flex: 1 1 50%;
    min-width: 0;
    width: auto;
    border-top: 0;
    height: var(--journal-control-height);
    min-height: var(--journal-control-height);
    max-height: var(--journal-control-height);
    font-size: 0.78rem;
    line-height: 1.2;
    padding: 0.25rem 0.45rem;
  }

  .journal-unified-input-group {
    display: flex;
    align-items: stretch;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    background: #ffffff;
    min-height: var(--journal-control-height);
  }

  .journal-amount-row {
    display: flex;
    align-items: stretch;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: visible;
    background: #ffffff;
    min-height: var(--journal-control-height);
  }

  .journal-amount-row:focus-within {
    border-color: #93c5fd;
    box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.1);
  }

  .journal-amount-row--debit {
    border-color: #fecaca;
    background: #feecec;
  }

  .journal-amount-row--debit:focus-within {
    border-color: #f87171;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.1);
  }

  .journal-amount-row--credit {
    border-color: #bbf7d0;
    background: #e9f9ef;
  }

  .journal-amount-row--credit:focus-within {
    border-color: #4ade80;
    box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.1);
  }

  .journal-amount-row--debit:hover,
  .journal-amount-row--credit:hover {
    border-color: #e2e8f0;
  }

  .journal-amount-row--debit :global(.form-control),
  .journal-amount-row--debit :global(.form-control:focus),
  .journal-amount-row--debit .journal-currency-picker__btn {
    background: #feecec !important;
    color: #b91c1c;
  }

  .journal-amount-row--credit :global(.form-control),
  .journal-amount-row--credit :global(.form-control:focus),
  .journal-amount-row--credit .journal-currency-picker__btn {
    background: #e9f9ef !important;
    color: #047857;
  }

  .journal-amount-row--debit .journal-currency-picker {
    border-inline-start-color: #fecaca;
  }

  .journal-amount-row--credit .journal-currency-picker {
    border-inline-start-color: #bbf7d0;
  }

  .journal-unified-input-group--inline {
    flex: 1;
    min-width: 0;
    border: 0;
    border-radius: 0;
    overflow: hidden;
  }

  .journal-currency-picker {
    position: relative;
    flex-shrink: 0;
    border-inline-start: 1px solid #e2e8f0;
  }

  .journal-currency-picker__btn {
    height: 100%;
    min-height: var(--journal-control-height);
    border: 0;
    background: #ffffff;
    padding: 0 0.55rem;
    font-weight: 700;
    font-size: 0.75rem;
    color: #475569;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    white-space: nowrap;
    cursor: pointer;
  }

  .journal-currency-picker__btn:hover {
    background: #f8fafc;
  }

  .journal-currency-menu {
    position: absolute;
    top: calc(100% + 4px);
    inset-inline-end: 0;
    z-index: 1050;
    min-width: 130px;
    margin: 0;
    padding: 0.35rem 0;
    list-style: none;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
  }

  .journal-currency-menu__item {
    display: block;
    width: 100%;
    border: 0;
    background: transparent;
    padding: 0.45rem 0.85rem;
    text-align: start;
    font-size: 0.82rem;
    font-weight: 600;
    color: #334155;
    cursor: pointer;
  }

  .journal-currency-menu__item:hover,
  .journal-currency-menu__item.selected {
    background: #eff6ff;
    color: #0f6efd;
  }

  .journal-unified-input-group:focus-within {
    border-color: #93c5fd;
    box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.1);
  }

  .journal-unified-input-group :global(.form-control) {
    border: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    flex: 1 1 auto;
    min-width: 0;
    background: #ffffff !important;
    min-height: var(--journal-control-height) !important;
    height: var(--journal-control-height);
  }

  .journal-unified-input-group :global(.form-control:focus) {
    border: 0 !important;
    box-shadow: none !important;
    background: #ffffff !important;
  }

  .journal-amount-row--debit .journal-unified-input-group :global(.form-control),
  .journal-amount-row--debit .journal-unified-input-group :global(.form-control:hover),
  .journal-amount-row--debit .journal-unified-input-group :global(.form-control:focus),
  .journal-amount-row--debit .journal-currency-picker__btn,
  .journal-amount-row--debit .journal-currency-picker__btn:hover {
    background-color: #feecec !important;
    color: #b91c1c;
  }

  .journal-amount-row--credit .journal-unified-input-group :global(.form-control),
  .journal-amount-row--credit .journal-unified-input-group :global(.form-control:hover),
  .journal-amount-row--credit .journal-unified-input-group :global(.form-control:focus),
  .journal-amount-row--credit .journal-currency-picker__btn,
  .journal-amount-row--credit .journal-currency-picker__btn:hover {
    background-color: #e9f9ef !important;
    color: #047857;
  }

  .journal-amount-row--debit,
  .journal-amount-row--debit:hover,
  .journal-amount-row--debit:focus-within,
  .journal-amount-row--credit,
  .journal-amount-row--credit:hover,
  .journal-amount-row--credit:focus-within {
    border-color: #e2e8f0 !important;
    box-shadow: none !important;
  }

  .journal-amount-row--debit .journal-unified-input-group,
  .journal-amount-row--debit .journal-unified-input-group:focus-within,
  .journal-amount-row--credit .journal-unified-input-group,
  .journal-amount-row--credit .journal-unified-input-group:focus-within {
    border-color: transparent !important;
    box-shadow: none !important;
  }

  .journal-amount-row--debit :global(.form-control:focus),
  .journal-amount-row--credit :global(.form-control:focus) {
    outline: none !important;
    box-shadow: none !important;
  }

  .journal-unified-input-group :global(.input-group-text) {
    border: 0 !important;
    border-radius: 0 !important;
    background: #ffffff;
  }

  .journal-unified-input-group :global(.input-group-text:not(:first-child)) {
    border-inline-start: 1px solid #e2e8f0 !important;
  }

  .journal-unified-input-group :global(.input-group-text:first-child:not(:last-child)) {
    border-inline-end: 1px solid #e2e8f0 !important;
  }

  .journal-unified-input-group :global(.journal-input-addon-btn),
  .journal-unified-input-group :global(.btn-info) {
    border: 0 !important;
    border-inline-start: 1px solid #e2e8f0 !important;
    border-radius: 0 !important;
    padding: 0 0.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    align-self: stretch;
    box-shadow: none !important;
    min-height: var(--journal-control-height);
  }

  .journal-unified-input-group :global(.btn-info) {
    background: #eff6ff !important;
    color: #0f6efd;
  }

  .journal-unified-input-group :global(.journal-input-addon-btn:first-child),
  .journal-unified-input-group :global(.btn-info.journal-input-addon-btn:first-child) {
    border-inline-start: 0 !important;
  }

  .journal-unified-input-group--account {
    direction: ltr;
  }

  .journal-unified-input-group--account :global(.journal-account-search-input),
  .journal-unified-input-group--account .journal-account-selected-name {
    direction: rtl;
    text-align: right;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: #ffffff !important;
    min-height: var(--journal-control-height) !important;
    height: var(--journal-control-height);
  }

  .journal-unified-input-group--account :global(.journal-account-quick-btn) {
    border-inline-start: 0 !important;
    border-inline-end: 1px solid #e2e8f0 !important;
    flex-shrink: 0;
    background: #0f6efd !important;
    color: #ffffff !important;
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1;
    min-width: var(--journal-control-height);
    width: var(--journal-control-height);
    padding: 0;
  }

  .journal-unified-input-group--account :global(.journal-account-quick-btn:hover),
  .journal-unified-input-group--account :global(.journal-account-quick-btn:focus) {
    background: #1d4ed8 !important;
    color: #ffffff !important;
  }

  .journal-account-selected-name {
    display: flex;
    align-items: center;
    padding: 0 0.625rem;
    font-weight: 650;
    font-size: 0.8125rem;
    color: #334155;
    cursor: pointer;
    min-height: var(--journal-control-height);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .journal-account-selected-name:hover {
    background: #f8fafc !important;
  }

  .journal-form-dropdown {
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
    z-index: 1050;
  }

  .journal-form-dropdown :global(.list-group-item) {
    border: 0;
    font-weight: 600;
    font-size: 0.82rem;
  }

  .journal-form-dropdown :global(.list-group-item:hover) {
    background: #eff6ff;
    color: #0f6efd;
  }

  .journal-form-page :global(.btn) {
    min-height: var(--journal-control-height);
  }

  .journal-form-page :global(.form-control::placeholder) {
    color: #94a3b8;
    font-weight: 500;
  }

  .journal-invalid-feedback {
    margin-top: 4px;
    font-size: 0.7rem;
    color: #dc2626;
    font-weight: 600;
  }

  .journal-balance-text {
    font-size: 0.68rem !important;
    line-height: 1.25;
  }

  .journal-mode-field,
  .journal-submit-field {
    padding-top: var(--journal-label-offset);
  }

  .journal-mode-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.35rem;
  }

  .journal-mode-btn {
    min-height: var(--journal-control-height);
    padding: 0.25rem 0.75rem;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    background: #ffffff;
    box-shadow: none;
    font-size: 0.72rem;
    font-weight: 750;
    color: #475569;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .journal-mode-btn:hover {
    background: #f8fafc;
  }

  .journal-mode-btn--active.journal-mode-btn--track {
    background: #fef2f2;
    border-color: #fecaca;
    color: #dc2626;
  }

  .journal-mode-btn--active.journal-mode-btn--notrack {
    background: #1e293b;
    border-color: #1e293b;
    color: #ffffff;
  }

  .journal-mode-btn--active.journal-mode-btn--treasury {
    background: #ecfdf5;
    border-color: #a7f3d0;
    color: #059669;
  }

  .journal-submit-btn {
    min-height: var(--journal-control-height);
    padding: 0.25rem 0.75rem;
    border-radius: 8px;
    border-color: #2f6fed !important;
    background: #2f6fed !important;
    color: #fff !important;
    box-shadow: 0 4px 10px rgba(47, 111, 237, 0.18);
    font-size: 0.78rem;
    font-weight: 800;
    line-height: 1.2;
  }

  @media (max-width: 767px) {
    .journal-mode-field,
    .journal-submit-field {
      padding-top: 0;
    }
  }
</style>
