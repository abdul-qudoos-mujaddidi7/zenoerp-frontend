<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, createEventDispatcher, tick } from 'svelte';

  import { t, lang, translate_org_type, shortID } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  // leases: "++id,name,address,description,status",

  let leases = [];
  let loading = true;
  let leasesModal;

  export let account_id = null;

  import AccountModal from '../accounts/AccountModal.svelte';

  let accountModalRef;
  import { showDate, setDatePickers } from '../../calendar.js';
  import { toast } from '../../ToastUI/toast.js';

  let accountTypes = [];
  let leaseProducts = [];
  let tenant_account_id = Number(account_id) || '';

  let units = [];
  let products = [];
  let productCategories = [];

  let currencies = [];

  let apartment_id = '';
  let lease_number = '';
  let grace_period_days = '';

  let now = new Date().toISOString().slice(0, 10);
  let start_date = now;
  let end_date = "";

  let payment_cycle = '';
  let payment_cycles = ['monthly', 'quarterly', 'semi-annually', 'annually'];
  let monthly_rent = '';
  let deposit_amount = '';
  let lease_type = 'rent';
  let lease_types = ['rent', 'sale', 'mortgage'];


  let defaultCurrency = 'AFN';
  let currency = 'AFN';
  let auto_renew = '';

  let late_fee_percent = '';
  let terms_conditions = '';

  let description = '';
  let status = 1;
  let selectedLeaseId = null;

  let editingId = null;
  let apartments = [];
  let buildings = [];

  let floors = [];
  let accounts = [];

  function handleDateChange(inputName, value) {
    if (inputName === 'start_date') start_date = value;
    if (inputName === 'end_date') end_date = value;
  }

  async function loadBuildings() {
    buildings = await db.buildings.orderBy('created_at').reverse().toArray();
    buildings = buildings.filter((w) => w.status === 1);
  }
  async function loadFloors() {
    floors = await db.floors.orderBy('created_at').reverse().toArray();
    floors = floors.filter((w) => w.status === 1);
  }

  async function loadApartments() {
    apartments = await db.apartments.orderBy('created_at').reverse().toArray();
    apartments = apartments.filter((w) => w.status === 1);
  }

  async function loadAccounts() {
    accounts = await db.accounts.orderBy('created_at').reverse().toArray();
    accounts = accounts.filter((w) => w.status === 1 && w.account_type_id == 4);

    accountTypes = await db.account_types
      .where('id')
      .equals(4)
      .and((at) => at.status === 1)
      .toArray();
  }

  let componentRoot;

  onMount(async () => {
    currencies = await db.currencies.where('status').equals(1).toArray();
    defaultCurrency = currencies.find((c) => c.isDefault == 1)?.code || 'AFN';
    currency = defaultCurrency;
    const modalEl = document.getElementById('createLeaseModal');
    if (window.mdb) {
      leasesModal = new window.mdb.Modal(modalEl);
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
    loadApartments();
    loadBuildings();
    loadFloors();
    loadAccounts();
    setDatePickers(handleDateChange, componentRoot);
  });

  export async function openLeaseModal() {
    await loadApartments();
    await loadAccounts();

    editingId = null;
    lease_number = '';
    grace_period_days = '';

    apartment_id = '';
    start_date = now;
    end_date = "";

    payment_cycle = '';
    monthly_rent = '';
    deposit_amount = '';

    lease_type = 'rent';

    currency = defaultCurrency;
    auto_renew = '';
    tenant_account_id = Number(account_id) || '';

    console.log(tenant_account_id);
    late_fee_percent = '';
    terms_conditions = '';

    description = '';
    status = 1;
    leasesModal.show();
  }

  // Open modal to edit existing lease
  export function editLease(lease) {
    loadApartments();
    loadAccounts();

    editingId = lease.id;
    description = lease.description || '';
    lease_number = lease.lease_number || '';

    grace_period_days = lease.grace_period_days || '';
    apartment_id = lease.apartment_id || '';
    tenant_account_id = lease.tenant_account_id || '';

    status = lease.status;
    start_date = lease.start_date;
    end_date = lease.end_date;

    payment_cycle = lease.payment_cycle;
    monthly_rent = lease.monthly_rent;
    deposit_amount = lease.deposit_amount;

    
    lease_type = lease.lease_type || 'rent';

    currency = lease.currency;
    auto_renew = lease.auto_renew;
    late_fee_percent = lease.late_fee_percent || '';

    terms_conditions = lease.terms_conditions || '';
    leasesModal.show();
  }

  async function saveLease() {
    if (!apartment_id) {
      toast.error(t('Error'), 'Apartment is required.');
      return;
    }
    if (!tenant_account_id) {
      toast.error(t('Error'), 'Account is required.');
      return;
    }
    if (!lease_number) {
      toast.error(t('Error'), 'lease_number is required.');
      return;
    }
    try {
      let newId = Number(editingId);
      if (editingId) {
        let oldLease = leases.find((w) => w.id === Number(editingId));
        // Update existing lease
        await db.leases.update(Number(editingId), {
          lease_number: parseInt(lease_number) || 0,
          grace_period_days: parseInt(grace_period_days) || 0,
          apartment_id: apartment_id || 0,

          tenant_account_id: tenant_account_id || 0,
          description: (description || '').trim(),
          status: parseInt(status) || 1,
          lease_type: lease_type || 'rent',
          start_date: start_date,
          end_date: end_date,
          payment_cycle: payment_cycle || '',

          monthly_rent: parseFloat(monthly_rent) || 0,
          deposit_amount: parseFloat(deposit_amount) || 0,
          late_fee_percent: late_fee_percent,

          terms_conditions: terms_conditions,
          currency: currency || '',
          auto_renew: auto_renew || '',
        });

        const treasuryAccount = await db.accounts.where('code').equals('TREASURY').first();
        if (!treasuryAccount) {
          throw new Error('TREASURY account not found');
        }

        let oldJournal = await db.journals
          .where({ reference_id: Number(editingId), reference_type: 'lease_deposit' })
          .first();
        if (oldJournal) {
          await db.journals.update(Number(oldJournal.id), {
            date: start_date,
            description: description || `lease_deposit Lease #${parseInt(lease_number)}`,
            currency: currency || '',
            first_entry_account: Number(tenant_account_id),
            first_entry_debit: 0,
            first_entry_credit: parseFloat(deposit_amount) || 0,
            second_entry_account: treasuryAccount.id,
            second_entry_debit: parseFloat(deposit_amount) || 0,
            second_entry_credit: 0,
            status: 1,
          });
        }
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'update',
          table_name: 'leases',
          entity_id: Number(editingId),
          old_values: JSON.stringify(oldLease),
          new_values: JSON.stringify({
            lease_number: parseInt(lease_number) || 0,
            grace_period_days: parseInt(grace_period_days) || 0,
            apartment_id: apartment_id || 0,
            tenant_account_id: tenant_account_id || 0,
            description: (description || '').trim(),
            status: parseInt(status) || 1,
            start_date: start_date,
            end_date: end_date,
            lease_type: lease_type || 'rent',
            payment_cycle: payment_cycle || '',
            monthly_rent: parseFloat(monthly_rent) || 0,
            deposit_amount: parseFloat(deposit_amount) || 0,
            late_fee_percent: late_fee_percent,
            terms_conditions: terms_conditions,
            currency: currency || '',
            auto_renew: auto_renew || '',
          }),
          description: `Updated lease ${name}`,
        });
      } else {
        // Add new lease
        newId = await db.leases.add({
          lease_number: parseInt(lease_number) || 0,
          grace_period_days: parseInt(grace_period_days) || 0,
          apartment_id: apartment_id || 0,
          tenant_account_id: tenant_account_id || 0,
          description: (description || '').trim(),
          status: parseInt(status) || 1,
          start_date: start_date,
          end_date: end_date,
          lease_type:lease_type || 'rent',
          payment_cycle: payment_cycle || '',
          monthly_rent: parseFloat(monthly_rent) || 0,
          deposit_amount: parseFloat(deposit_amount) || 0,
          late_fee_percent: late_fee_percent,
          terms_conditions: terms_conditions,
          currency: currency || '',
          auto_renew: auto_renew || '',
        });

        const treasuryAccount = await db.accounts.where('code').equals('TREASURY').first();

        if (!treasuryAccount) {
          throw new Error('TREASURY account not found');
        }

        await db.journals.add({
          date: start_date,
          reference_id: newId,
          reference_type: 'lease_deposit',
          description: description || `lease_deposit Lease #${parseInt(lease_number)}`,
          currency: currency || '',
          first_entry_account: Number(tenant_account_id),
          first_entry_debit: 0,
          first_entry_credit: parseFloat(deposit_amount) || 0,
          second_entry_account: treasuryAccount.id,
          second_entry_debit: parseFloat(deposit_amount) || 0,
          second_entry_credit: 0,
          status: 1,
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'create',
          table_name: 'leases',
          entity_id: newId,
          old_values: null,
          new_values: JSON.stringify({
            lease_number,
            grace_period_days,
            apartment_id,
            tenant_account_id,
            description,
            status,
            start_date,
            end_date,
            lease_type,
            payment_cycle,
            monthly_rent,
            deposit_amount,
            currency,
            late_fee_percent: late_fee_percent,
            terms_conditions: terms_conditions,
            auto_renew,
          }),
          description: `Created lease ${name}`,
        });
      }
      dispatch('saved', {
        id: newId,
        lease_number: parseInt(lease_number) || 0,
        grace_period_days: parseInt(grace_period_days) || 0,
        apartment_id: apartment_id,
        tenant_account_id: tenant_account_id,
        description: description.trim(),
        status: parseInt(status) || 1,
        start_date: start_date,
        end_date: end_date,
        lease_type: lease_type || 'rent',
        payment_cycle: payment_cycle || '',
        monthly_rent: parseFloat(monthly_rent) || 0,
        deposit_amount: parseFloat(deposit_amount) || 0,
        late_fee_percent: late_fee_percent,
        terms_conditions: terms_conditions,
        currency: currency || '',
        auto_renew: auto_renew || '',
      });
      toast.success(t('Success'), editingId ? t('Lease updated successfully.') : t('Lease created successfully.'));
      leasesModal.hide();
    } catch (err) {
      console.error('Failed to save lease:', err);
      toast.error(t('Error'), t('Error saving lease: ') + err.message);
    }
  }

  async function deleteLease(id) {
    if (confirm('Delete this lease?')) {
      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'delete',
        table_name: 'leases',
        entity_id: id,
        old_values: JSON.stringify(leases.find((w) => w.id === id)),
        new_values: null,
        description: `Deleted lease #${id}`,
      });
      await db.leases.update(id, { status: 0 });
    }
  }

  let form_account_search = '';
  let form_account_search_input = null;
  let filteredAccounts = [];
  let showAccountDropdown = false;

  function getAccountName(id) {
    const acc = accounts.find((a) => Number(a.id) === Number(id)) || {};

    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';

    return out || 'Unknown';
  }
</script>

<div class="modal fade" id="createLeaseModal" tabindex="-1" aria-hidden="true" bind:this={componentRoot}>
  <div class="modal-dialog modal-dialog-centered modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-plus-circle"></i>
          {editingId ? t('Update Lease') : t('New Lease')}
        </h5>
        <button type="button" class="btn-close" data-mdb-dismiss="modal"></button>
      </div>

      <div class="modal-body">
        <div class="row">
          <div class="col-md-9 mb-4">
            <select class="form-select" id="c-lease-type" bind:value={apartment_id} on:change={() => {
              monthly_rent = apartments.find((a) => a.id === apartment_id)?.rent_amount || '';
              currency = apartments.find((a) => a.id === apartment_id)?.currency || defaultCurrency;
              setInterval(() => {
                if (window.mdb) {
                  document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                }
              }, 100);
            }}>
              <option value="" disabled>{t('Select') + ' ' + t('Apartment')}</option>
              {#each apartments as apartment}
                <option value={apartment.id}
                  >{t('Apartment')}: {apartment.unit_number} - {t('Floor')}: {floors.find(
                    (f) => f.id === apartment.floor_id,
                  )?.floor_number || ''} - {t('Building')}: {buildings.find((b) => b.id === apartment.building_id)
                    ?.name || ''} ({buildings.find((b) => b.id === apartment.building_id)?.code || ''})</option>
              {/each}
            </select>
          </div>
          <div class="col-md-3 mb-4">
            <select class="form-select" id="c-lease-type" bind:value={lease_type}>
              <option value="" disabled>{t('Select') + ' ' + t('Lease Type')}</option>
              {#each lease_types as type}
                <option value={type}>{t(type)}</option>
              {/each}
            </select>
          </div>

          <div class="col-md-6 mb-4">
            <div class="position-relative">
              <div class="input-group w-100">
                {#if tenant_account_id}
                  <span class="input-group-text bg-primary text-white fw-bold px-2"><i class="bi bi-person"></i> </span>
                  <span class="input-group-text badge-primary w-100 fw-bold">
                    {getAccountName(tenant_account_id)}
                  </span>

                  <button
                    class="btn btn-danger btn-sm pt-1 px-3"
                    on:click={async () => {
                      tenant_account_id = '';
                      form_account_search = '';
                      showAccountDropdown = true;
                      filteredAccounts = accounts;

                      await tick(); // wait for DOM to update

                      form_account_search_input?.focus();
                      if (window.mdb) {
                        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                      }
                    }}>
                    <i class="bi bi-search"></i>
                  </button>
                {:else}
                  <div class="form-outline" data-mdb-input-init>
                    <input
                      type="text"
                      class="form-control"
                      id="form_account_search"
                      bind:this={form_account_search_input}
                      bind:value={form_account_search}
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
                          return name && name.toLowerCase().includes(form_account_search.trim().toLowerCase());
                        });
                      }}
                      on:focus={() => {
                        showAccountDropdown = true;
                        if (form_account_search.trim()) {
                          filteredAccounts = accounts.filter((acc) => {
                            const name =
                              t('Lang') === 'en'
                                ? acc.name
                                : t('Lang') === 'fa'
                                  ? acc.name_fa
                                  : t('Lang') === 'ps'
                                    ? acc.name_ps
                                    : acc.name;
                            return name && name.toLowerCase().includes(form_account_search.trim().toLowerCase());
                          });
                        } else {
                          filteredAccounts = accounts;
                        }
                      }}
                      on:blur={() => setTimeout(() => (showAccountDropdown = false), 150)}
                      autocomplete="off" />
                    <label class="form-label" for="form_account_search">{t('Select Customer')}</label>
                  </div>

                  <button
                    class="btn btn-info pt-1 px-2"
                    on:click={() => {
                      accountModalRef.openModal();
                    }}>
                    <i class="bi bi-plus-circle"></i>
                  </button>
                {/if}
              </div>
              {#if showAccountDropdown && filteredAccounts.length > 0}
                <ul class="list-group position-absolute w-100 z-3" style="max-height:180px;overflow:auto;">
                  {#each filteredAccounts as acc}
                    <li
                      class="list-group-item list-group-item-action bg-body small px-2 py-1"
                      style="cursor:pointer"
                      on:mousedown={() => {
                        tenant_account_id = acc.id;
                        console.log(tenant_account_id);
                        form_account_search =
                          t('Lang') === 'en'
                            ? acc.name
                            : t('Lang') === 'fa'
                              ? acc.name_fa
                              : t('Lang') === 'ps'
                                ? acc.name_ps
                                : acc.name;
                        showAccountDropdown = false;
                        setTimeout(() => {
                          if (window.mdb) {
                            document
                              .querySelectorAll('[data-mdb-input-init]')
                              .forEach((el) => new window.mdb.Input(el));
                          }
                        }, 100);
                      }}>
                      {#if t('Lang') === 'en' && acc.name}{acc.name}{/if}
                      {#if t('Lang') === 'fa' && acc.name_fa}{acc.name_fa}{/if}
                      {#if t('Lang') === 'ps' && acc.name_ps}{acc.name_ps}{/if}
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-total-leases" class="form-control" bind:value={lease_number} />
              <label class="form-label" for="c-total-leases">{t('Lease Number')}</label>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="input-group input-group-sm persianDatePicker">
              <div class="form-outline" data-mdb-input-init>
                <input
                  type="date"
                  id="c-start_date"
                  class="form-control form-control-sm"
                  data-bind="start_date"
                  bind:value={start_date} />
                <label class="form-label" for="c-start_date">{t('Start Date')}</label>
              </div>
              <span class="input-group-text persian-date-text"></span>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="input-group input-group-sm persianDatePicker">
              <div class="form-outline" data-mdb-input-init>
                <input
                  type="date"
                  id="c-end_date"
                  class="form-control form-control-sm"
                  data-bind="end_date"
                  bind:value={end_date} />
                <label class="form-label" for="c-end_date">{t('End Date')}</label>
              </div>
              <span class="input-group-text persian-date-text"></span>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                <input type="number" id="c-monthly_rent" class="form-control" bind:value={monthly_rent} />
                <label class="form-label" for="c-monthly_rent">{t('Monthly Rent')}</label>
              </div>

              <button
                id="showCurrencyDropdown"
                class="btn btn-secondary dropdown-toggle btn-sm pt-1"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {currency ? t(currency) : ''}
              </button>

              <ul class="dropdown-menu dropdown-menu-end">
                {#each currencies as cur}
                  <li>
                    <button
                      class="dropdown-item"
                      style={currency == cur.code
                        ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                        : ''}
                      on:click={() => {
                        currency = cur.code;
                      }}
                      type="button">
                      {t(cur.code)}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                <input type="number" id="c-deposit_amount" class="form-control" bind:value={deposit_amount} />
                <label class="form-label" for="c-deposit_amount">{t('Deposit Amount')}</label>
              </div>

              <button
                id="showCurrencyDropdown"
                class="btn btn-secondary dropdown-toggle btn-sm pt-1"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {currency ? t(currency) : ''}
              </button>

              <ul class="dropdown-menu dropdown-menu-end">
                {#each currencies as cur}
                  <li>
                    <button
                      class="dropdown-item"
                      style={currency == cur.code
                        ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                        : ''}
                      on:click={() => {
                        currency = cur.code;
                      }}
                      type="button">
                      {t(cur.code)}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          </div>

          <div class="col-md-6 mb-4">
              <select class="form-select" id="c-payment_cycle" bind:value={payment_cycle}>
                <option value="" disabled>{t('Select') + ' ' + t('Payment Cycle')}</option>
                {#each payment_cycles as cycle}
                  <option value={cycle}>{t(cycle)}</option>
                {/each}
              </select>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-area" class="form-control" bind:value={grace_period_days} />
              <label class="form-label" for="c-area">{t('Grace Period (Days)')}</label>
            </div>
          </div>
          <div class="col-md-6 mb-4">
          <select class="form-select" id="c-payment_cycle" bind:value={auto_renew}>
                <option value="" disabled>{t('Select') + ' ' + t('Auto Renew')}</option>
                  <option value=1>{t("Yes")}</option>
                  <option value=0>{t("No")}</option>
              </select>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="text" id="c-late_fee_percent" class="form-control" bind:value={late_fee_percent} />
              <label class="form-label" for="c-late_fee_percent">{t('Late Fee Percent')}</label>
            </div>
          </div>

          <div class="col-md-12 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <textarea id="c-terms_conditions" class="form-control" bind:value={terms_conditions}></textarea>
              <label class="form-label" for="c-terms_conditions">{t('Terms and Conditions')}</label>
            </div>
          </div>

          <div class="col-md-12 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <textarea id="c-description" class="form-control" bind:value={description}></textarea>
              <label class="form-label" for="c-description">{t('Description')}</label>
            </div>
          </div>

          <!-- <div class="col-md-12 mb-4">
                        <div class="form-outline" data-mdb-input-init>
                            <input
                                type="number"
                                step="0.01"
                                id="c-status"
                                class="form-control"
                                bind:value={status}
                            />
                            <label class="form-label" for="c-status"
                                >{t("Status")}</label
                            >
                        </div>
                    </div> -->
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-link text-dark" data-mdb-dismiss="modal">{t('Close')}</button>
        <button type="button" class="btn btn-primary" on:click={saveLease}>
          {editingId ? t('Update Lease') : t('Save Lease')}
        </button>
      </div>
    </div>
  </div>

  <AccountModal
    bind:this={accountModalRef}
    {accountTypes}
    on:saved={async (e) => {
      // Reload accounts after adding new account
      accounts = await db.accounts
        .where('account_type_id')
        .equals(4)
        .and((a) => a.status === 1)
        .toArray();

      // Automatically select the newly added account
      const newAccount = e.detail.account; // Assume AccountModal emits saved account as detail
      if (newAccount && newAccount.account_type_id == 4) {
        tenant_account_id = newAccount.id;
      }
    }} />
</div>
