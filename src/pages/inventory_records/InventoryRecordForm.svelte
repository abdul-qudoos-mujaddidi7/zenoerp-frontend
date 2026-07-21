<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, tick } from 'svelte';
  import InventoryRecordItemsTable from './InventoryRecordItemsTable.svelte';
  import AccountModal from '../accounts/AccountModal.svelte';

  import { toast } from '../../ToastUI/toast.js';
  import { push } from 'svelte-spa-router';
  import AccountView from '../accounts/AccountView.svelte';

  import { calculateProductStock } from '../stocktransactions/calculateStock.js';
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { showDate, setDatePickers } from '../../calendar.js';
  let accountModalRef;

  import { calculateRemainingAndBenefit } from './InventoryRecordsHelper.js';

  $: enable_due_date = $settings_all.find((s) => s.key === 'enable_due_date')?.value == 1;

  $: default_inventory_record_description = $settings_all.find((s) => s.key === 'default_inventory_record_description')?.value || "";
  let date = new Date().toISOString().slice(0, 10);
  let due_date = null;

  $: if (enable_due_date && !due_date) {
    due_date = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  function handleDateChange(inputName, value) {
    if (inputName === 'date') date = value;
    if (inputName === 'due_date') due_date = value;
  }

  export let inventory_recordId = null;
  export let accountId = null;

  $: inventory_recordId = inventory_recordId == 0 ? null : inventory_recordId;

  let showAccountModal = false;

  let apartments = [];
  let customers = [];
  let currencies = [];
  let settings = [];
  let accountTypes = [];
  let record_index = 0;

  let selected_account_id;

  $: if (form.account_id) {
    selected_account_id = form.account_id;
  }
  let record_index_prefix = 'INR-';

  let journals = [];

  let items = [];

  let form = {
    apartment_id: '',
    account_id: '',
    inventory_record_type: '',
    record_number: '',
    record_date: new Date().toISOString().slice(0, 10),

    // set due date 10 days later by default
    due_date: null,
    description: $settings_all.find((s) => s.key === 'default_inventory_record_description')?.value || "",
    currency: '',
    record_status: 'draft',
    status: 1,
  };

  $: if (accountId) {
    form.account_id = Number(accountId);
  }

  $: form.record_date = date;
  $: form.due_date = due_date;

  let loading = false;

  $: paymentAmount = form.account_id === WALKIN?.id ? payableAmount : paymentAmount;
  let paymentDescription = '';
  let paymentCurrency = '';

  let accounts = [];
  let products = [];
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
  let WALKIN = null;
  let units = [];

  $: unitMap = Object.fromEntries(units.map((u) => [u.id, u]));

  // Get full unit chain recursively
  function getUnitHierarchy(unitId) {
    const result = [];

    function traverse(id, multiplier = 1) {
      const unit = unitMap[id];
      if (!unit) return;

      result.push({
        ...unit,
        multiplier,
      });

      if (unit.subunit_id) {
        traverse(unit.subunit_id, multiplier / (unit.subunit_multiple || 1));
      }
    }

    traverse(unitId);
    return result;
  }

  let allJournals = [];
  onMount(async () => {
    units = await db.product_units.where({ status: 1 }).toArray();
    accounts = await db.accounts.where({ status: 1 }).toArray();
    accounts = accounts.filter((a) => (a.account_status ? a.account_status == 'active' : a.status == 1));

    products = await db.products.where({ status: 1 }).toArray();

    allJournals = await db.journals.where({ status: 1 }).toArray();
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
    apartments = await db.apartments.where('status').equals(1).toArray();
    customers = await db.accounts
      .where('account_type_id')
      .equals(4)
      .and((s) => s.status === 1)
      .toArray();

    customers = customers.filter((a) => (a.account_status ? a.account_status == 'active' : a.status == 1));

    WALKIN = customers.find((c) => c.code === 'WALKIN');
    if (accountId) {
      form.account_id = Number(accountId);
    } else {
      form.account_id = WALKIN ? WALKIN.id : '';
    }

    form.apartment_id = apartments.length > 0 ? apartments[0].id : '';

    currencies = await db.currencies.where('status').equals(1).toArray();
    record_index = Number(
      (
        await db.settings
          .where('key')
          .equals('record_index')
          .and((s) => s.status === 1)
          .first()
      )?.value,
    );
    record_index_prefix =
      (
        await db.settings
          .where('key')
          .equals('record_index_prefix')
          .and((s) => s.status === 1)
          .first()
      )?.value || 'INR-';

    form.record_number = record_index_prefix + record_index || '';

    accountTypes = await db.account_types
      .where('id')
      .equals(4)
      .and((s) => s.status === 1)
      .toArray();

    const defaultCurrency = currencies.find((c) => c.isDefault == 1);
    if (defaultCurrency && !form.currency) form.currency = defaultCurrency.code;

    // initialize payment currency to inventory_record currency
    paymentCurrency = form.currency;

    if (inventory_recordId) await loadInventoryRecord(inventory_recordId);
    setDatePickers(handleDateChange, componentRoot); //
  });
	import TiptapEditor from '../../TiptapEditor.svelte';
  let componentRoot;
  async function loadInventoryRecord(id) {
    try {
      const inventory_record = await db.inventory_records.where({ id: Number(id), record_status: 'draft', status: 1 }).first();
      if (!inventory_record) {
        push('/dashboard/inventory_records');
        return;
      }

      form = {
        apartment_id: inventory_record.apartment_id,
        account_id: inventory_record.account_id,
        inventory_record_type: inventory_record.inventory_record_type,
        record_number: inventory_record.record_number,
        due_date: inventory_record.due_date,
        record_date: inventory_record.record_date.slice(0, 10),
        description: inventory_record.description,
        currency: inventory_record.currency,
        record_status: inventory_record.record_status,
        status: inventory_record.status,
      };

      form.record_date = inventory_record.record_date.slice(0, 10);
      discount_amount = Number(inventory_record.discount_amount || 0);
      discount_type = inventory_record.discount_type || 'fixed';
      expense_amount = Number(inventory_record.expense_amount || 0);

      const inventory_recordItems = (
        await db.inventory_record_items
          .where('record_id')
          .equals(Number(id))
          .and((item) => item.status === 1)
          .toArray()
      ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const productIds = inventory_recordItems.map((i) => i.product_id);
      items = inventory_recordItems.map((i) => {
        const product = products.find((p) => p.id === i.product_id);
        const unitHierarchy = getUnitHierarchy(product.product_unit_id);
        return {
          type: i.type || 'good',
          product_id: i.product_id,
          product_name: product?.name || 'Unknown',
          product_unit_id: i.product_unit_id || product?.product_unit_id,
          quantity: Number(i.quantity || 0),
          unit_price: Number(i.unit_price || 0),
          buy_price: Number(i.buy_price || 0),
          buy_price_currency: i.buy_price_currency || product?.buy_currency || i.currency || form.currency,
          calculated_price: Number(i.unit_price || 0),
          currency: i.currency,
          subtotal: Number(i.quantity || 0) * Number(i.unit_price || 0),
          availableUnits: unitHierarchy,
        };
      });

      setTimeout(() => {
        if (window.mdb) {
          document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
        }
      }, 100);
    } catch (err) {
      console.error(err);
      toast.error(t('Error'), t('Failed to load inventory_record. Please try again.'));
    }
  }

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = Number(fromCurrency.exchangeRate || 1);
    const toRate = Number(toCurrency.exchangeRate || 1);
    return (amount / toRate) * fromRate;
  }

  let discount_amount = 0;
  let discount_type = 'fixed'; // or "percent"
  let expense_amount = 0;

  $: total_amount = items.reduce((s, i) => {
    if (i.currency && form.currency && i.currency !== form.currency) {
      let exchangeRateValue = exchangeRate(i.subtotal, i.currency, form.currency);
      console.log(
        `Converting ${i.subtotal} from ${i.currency} to ${form.currency} for total calculation - exchange rate value: ${exchangeRateValue}`,
      );
      return s + exchangeRateValue;
    } else {
      return s + i.subtotal;
    }
  }, 0);

  $: payableAmount =
    total_amount -
    Number((discount_type == 'fixed' ? discount_amount : (total_amount * discount_amount) / 100) || 0) +
    Number(expense_amount || 0);
  // keep paymentCurrency in sync with selected currency
  $: if (form.currency) paymentCurrency = form.currency;

  async function saveInventoryRecord(confirm = false) {
    if (!form.apartment_id || !form.account_id || items.length === 0) {
      toast.error(t('Validation Error'), t('Apartment, Customer and at least one Item are required.'));
      return;
    }

    if (confirm && (paymentAmount === null || paymentAmount === '')) {
      toast.error(t('Validation Error'), t('Payment amount cannot be empty. Enter 0 if no payment.'));
      return;
    }

    loading = true;
    let savedId = null;
    try {
      let addedItems = [];
      await db.transaction(
        'rw',
        [
          'inventory_records',
          'inventory_record_items',
          'journals',
          'accounts',
          'settings',
          'stock_transactions',
          'activity_logs',
          'products',
        ],
        async () => {
          let id = Number(inventory_recordId);

          if (id) {
            savedId = id;
            // Update existing draft
            let oldInventoryRecord = await db.inventory_records.get(id);
            await db.inventory_records.update(id, {
              apartment_id: form.apartment_id,
              account_id: form.account_id,
              inventory_record_type: form.inventory_record_type,
              record_number: form.record_number,
              record_date: form.record_date,
              due_date: form.due_date,
              description: form.description,
              discount_amount: discount_amount || 0,
              discount_type: discount_type || 'fixed',
              currency: form.currency,
              record_status: confirm ? 'confirmed' : 'draft',
              status: form.status,
              total_amount: payableAmount,
              expense_amount: expense_amount || 0,
              items_count:items.length,
              version: oldInventoryRecord.version ? Number(oldInventoryRecord.version) + 1 : 2,
            });
            await db.inventory_record_items
              .where('record_id')
              .equals(id)
              .modify((item) => {
                item.status = 0;
              });

            await logActivity({
              user_id: parseInt(localStorage.getItem('user_id')) || 0,
              action: 'update',
              table_name: 'inventory_records',
              entity_id: id,
              old_values: JSON.stringify(oldInventoryRecord),
              new_values: JSON.stringify({
                apartment_id: form.apartment_id,
                account_id: form.account_id,
                inventory_record_type: form.inventory_record_type,
                record_number: form.record_number,
                record_date: form.record_date,
                due_date: form.due_date,
                discount_amount: discount_amount || 0,
                discount_type: discount_type || 'fixed',
                expense_amount: expense_amount || 0,
                description: form.description,
                currency: form.currency,
                record_status: confirm ? 'confirmed' : 'draft',
                status: form.status,
                total_amount: payableAmount,
              }),
              description: `Updated inventory_record #${id}`,
            });
          } else {
            id = await db.inventory_records.add({
              apartment_id: form.apartment_id,
              account_id: form.account_id,
              inventory_record_type: form.inventory_record_type,
              record_number: form.record_number,
              record_date: form.record_date,
              due_date: form.due_date,
              description: form.description,
              discount_amount: discount_amount || 0,
              discount_type: discount_type || 'fixed',
              expense_amount: expense_amount || 0,
              currency: form.currency,
              record_status: confirm ? 'confirmed' : 'draft',
              status: form.status,
              total_amount: payableAmount,
              items_count:items.length,
              version: 1,
            });

            savedId = id;
            await db.settings
              .where('key')
              .equals('record_index')
              .modify((setting) => {
                setting.value = String(Number(setting.value || 0) + 1);
              });
            await logActivity({
              user_id: parseInt(localStorage.getItem('user_id')) || 0,
              action: 'create',
              table_name: 'inventory_records',
              entity_id: id,
              old_values: null,
              new_values: JSON.stringify({
                apartment_id: form.apartment_id,
                account_id: form.account_id,
                inventory_record_type: form.inventory_record_type,
                record_number: form.record_number,
                record_date: form.record_date,
                due_date: form.due_date,
                description: form.description,
                discount_amount: discount_amount || 0,
                discount_type: discount_type || 'fixed',
                currency: form.currency,
                record_status: confirm ? 'confirmed' : 'draft',
                status: form.status,
                total_amount: payableAmount,
                expense_amount: expense_amount || 0,
              }),
              description: `Created inventory_record #${id}`,
            });
          }
          for (let item of items) {
            await db.inventory_record_items.add({
              record_id: id,
              product_id: item.product_id,
              product_unit_id: item.product_unit_id,
              quantity: item.quantity,
              unit_price: item.calculated_price,
              discount_amount: 0,
              discount_type: 'fixed',
              currency: item.currency,
              subtotal: item.subtotal,
              status: 1,
            });
            if (confirm && (!inventory_recordId || form.record_status !== 'confirmed')) {
              // Only deduct if first time confirming
              
              addedItems.push(item);
              // Add journal entry only once when confirming the record
            }
          }
          
        },
      );

      // Update form state to match the saved record_status
      form.record_status = confirm ? 'confirmed' : 'draft';

      toast.success(t('Success'), confirm ? t('InventoryRecord Confirmed.') : t('Draft Saved.'));
      resetForm();
      push(savedId ? '/dashboard/inventory_records/' + savedId : '/dashboard/inventory_records/');
    } catch (err) {
      console.error(err);
      toast.error(t('Error'), t('Failed to save inventory_record. Please try again.'));
    }

    loading = false;
  }

  function resetForm() {
    date = new Date().toISOString().slice(0, 10);
    due_date = null;
    form = {
      ...form,
      apartment_id: '',
      account_id: '',
      inventory_record_type: '',
      record_number: '',
      record_date: new Date().toISOString().slice(0, 10),
      due_date: null,
      description: $settings_all.find((s) => s.key === 'default_inventory_record_description')?.value || "",
    };
    items = [];
    paymentAmount = null;
    paymentDescription = '';
    paymentCurrency = form.currency;
  }

  let form_account_search = '';
  let form_account_search_input = null;
  let filteredAccounts = [];
  let showAccountDropdown = false;

</script>

<div class="container-fluid mt-4" bind:this={componentRoot}>
  <div class="card shadow-2">
    <div class="card-body">
      <h4 class="mb-4">
      
        {inventory_recordId ? t('Edit Inventory Record') : t('New Inventory Record')}
      </h4>

      <div class="row g-3">
        <div class="col-md-2">
          <select class="form-select form-select-sm" bind:value={form.apartment_id}>
            <option value="">{t('Select Apartment')}</option>
            {#each apartments as w}
              <option value={w.id}>{w.unit_number}</option>
            {/each}
          </select>
        </div>

        <div class="col-md-3">
          <div class="position-relative">
            <div class="input-group input-group-sm w-100">
              {#if form.account_id}
                <span
                  class="input-group-text bg-success text-white fw-bold"
                  style="cursor: pointer;"
                  on:click={() => {
                    showAccountModal = true;
                  }}
                  ><i class="bi bi-person"></i>
                </span>
                <span class="input-group-text badge-success w-100 fw-bold">
                  {getAccountName(form.account_id)}
                </span>

                <button
                  class="btn btn-danger btn-sm pt-1"
                  on:click={async () => {
                    form.account_id = '';
                    form_account_search = '';
                    showAccountDropdown = true;
                    filteredAccounts = customers;

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
                    class="form-control form-control-sm"
                    id="form_account_search"
                    bind:this={form_account_search_input}
                    bind:value={form_account_search}
                    on:input={() => {
                      showAccountDropdown = true;
                      filteredAccounts = customers.filter((acc) => {
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
                        filteredAccounts = customers.filter((acc) => {
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
                        filteredAccounts = customers;
                      }
                    }}
                    on:blur={() => setTimeout(() => (showAccountDropdown = false), 150)}
                    autocomplete="off" />
                  <label class="form-label" for="form_account_search">{t('Select Customer')}</label>
                </div>

                <button
                  class="btn btn-info btn-sm pt-1"
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
                      form.account_id = acc.id;
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
                          document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                        }
                      }, 100);
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
        </div>

        <div class="col-md-2">
          <input
            readonly
            type="text"
            class="form-control form-control-sm"
            value="{t('Record #')}: {form.record_number}" />
        </div>

        <div class="col-md-3">
          <div class="input-group input-group-sm persianDatePicker">
            <input type="date" class="form-control" data-bind="date" required bind:value={form.record_date} />
            <span class="input-group-text persian-date-text"></span>
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
         
          <TiptapEditor bind:value={form.description} />
        </div>

        
      </div>
    </div>
  </div>
  <InventoryRecordItemsTable bind:items currency={form.currency} apartment_id={form.apartment_id} bind:selected_account_id />

  <div class="card shadow-2 mt-4">
    <div class="card-body d-flex justify-content-end align-items-center">
      <div>
        <button class="btn btn-secondary me-2" on:click={() => saveInventoryRecord(false)} disabled={loading}
          >{t('Save Draft')}</button>
        <button class="btn btn-success" on:click={() => saveInventoryRecord(true)} disabled={loading}>{t('Confirm Inventory Record')}</button>
      </div>
    </div>
  </div>
</div>

<AccountModal
  bind:this={accountModalRef}
  {accountTypes}
  on:saved={async (e) => {
    // Reload customers after adding new account
    customers = await db.accounts
      .where('account_type_id')
      .equals(4)
      .and((s) => s.status === 1)
      .toArray();

    customers = customers.filter((a) => (a.account_status ? a.account_status == 'active' : a.status == 1));

    // Automatically select the newly added account
    const newAccount = e.detail.account;
    if (newAccount && newAccount.account_type_id == 4) {
      form.account_id = newAccount.id;
    }
  }} />


{#if form?.account_id}
  {#if showAccountModal}
    <!-- Modal -->
    <div class="modal show d-block" id="accountModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-xl">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              {t('Account')}
            </h5>
            <button
              type="button"
              class="btn-close"
              on:click={() => {
                showAccountModal = false;
              }}></button>
          </div>
          <div class="modal-body overflow-y-auto" style="max-height:480px">
            <AccountView id={form.account_id} />
          </div>
        </div>
      </div>
    </div>
  {/if}
{/if}
