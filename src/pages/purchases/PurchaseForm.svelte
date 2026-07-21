<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, tick } from 'svelte';
  import PurchaseItemsTable from './PurchaseItemsTable.svelte';
  import AccountView from '../accounts/AccountView.svelte';
  import AccountModal from '../accounts/AccountModal.svelte';
  import { push } from 'svelte-spa-router';
  import Swal from 'sweetalert2';
  import { applyPurchase, INVENTORY_TX_STORES } from '../../lib/inventory/inventoryService.js';
  import FilterSelect from '../../components/common/FilterSelect.svelte';
  import { calculateProductStock } from '../stocktransactions/calculateStock.js';
  import { toast } from '../../ToastUI/toast.js';
  import { showDate } from '../../calendar.js';
  import AppDatePicker from '../../components/common/AppDatePicker.svelte';
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  $: enable_purchase_bill_due_date = $settings_all.find((s) => s.key === 'enable_purchase_bill_due_date')?.value == 1;

  let accountModalRef;
  let date = new Date().toISOString().slice(0, 10);
  let due_date = null;
  $: if (enable_purchase_bill_due_date && !due_date) {
    due_date = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  $: form.bill_date = date;
  $: form.due_date = due_date;
  let treasury_balance = {};
  async function calculateTreasuryBalance() {
    let treasuryAccount = await db.accounts
      .where('code')
      .equals('TREASURY')
      .and((a) => a.status === 1)
      .first();
    if (!treasuryAccount) {
      console.warn('TREASURY account not found for balance calculation');
      return;
    }
    let allMyJournals = await db.journals
      .where('status')
      .equals(1)
      .filter((j) => j.first_entry_account === treasuryAccount.id || j.second_entry_account === treasuryAccount.id)
      .toArray();
    let balance = {};
    allMyJournals.forEach((j) => {
      if (j.first_entry_account === treasuryAccount.id) {
        const currency = j.currency || 'AFN';
        balance[currency] =
          (balance[currency] || 0) + Number(j.first_entry_credit || 0) - Number(j.first_entry_debit || 0);
      }
      if (j.second_entry_account === treasuryAccount.id) {
        const currency = j.currency || 'AFN';
        balance[currency] =
          (balance[currency] || 0) + Number(j.second_entry_credit || 0) - Number(j.second_entry_debit || 0);
      }
    });
    treasury_balance = balance;
    console.log('Calculated treasury balance:', treasury_balance);
  }

  export let purchaseId = null;
  export let accountId = null;

  $: if (accountId) {
    form.account_id = Number(accountId);
  }

  $: purchaseId = purchaseId == 0 ? null : purchaseId;

  let warehouses = [];
  let suppliers = [];
  let currencies = [];
  let settings = [];
  let accountTypes = [];

  let items = [];

  let form = {
    warehouse_id: '',
    account_id: '',
    bill_number: '',
    bill_date: new Date().toISOString().slice(0, 10),
    description: '',
    due_date: null,
    currency: '',
    bill_status: 'draft',
    status: 1,
  };

  let loading = false;

  // payment inputs for new purchase
  let paymentAmount = null;
  let paymentDescription = '';
  let paymentCurrency = '';
  let showPaymentCurrencyMenu = false;

  function selectPaymentCurrency(code) {
    paymentCurrency = code;
    showPaymentCurrencyMenu = false;
  }

  function handleWindowClick(event) {
    if (showPaymentCurrencyMenu && !event.target.closest('.payment-currency-picker')) {
      showPaymentCurrencyMenu = false;
    }
  }

  let accounts = [];
  let allAccountTypes = [];
  let treasury_ID = 0;
  let notrack_ID = 0;
  let track_ID = 0;
  let filteredSecondAccounts = [];
  let second_entry_account_search = '';
  let showTrackModal = false;
  let second_entry_account = null;

  let modalRef; // reference to AccountModal for opening it from journal form

  let allJournals = [];
  onMount(async () => {
    accounts = await db.accounts.where({ status: 1 }).toArray();

    accounts = accounts.filter((a) => (a.account_status ? a.account_status == 'active' : a.status == 1));
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
    warehouses = await db.warehouses.where('status').equals(1).toArray();
    suppliers = await db.accounts
      .where('account_type_id')
      .equals(3)
      .and((a) => a.status === 1)
      .toArray();

    if (accountId) {
      form.account_id = Number(accountId);
    }

    suppliers = suppliers.filter((a) => (a.account_status ? a.account_status == 'active' : a.status == 1));
    currencies = await db.currencies.where('status').equals(1).toArray();
    settings = await db.settings
      .where('key')
      .equals('bill_index')
      .and((s) => s.status === 1)
      .toArray();

    form.bill_number = settings[0].value;

    accountTypes = await db.account_types
      .where('id')
      .equals(3)
      .and((at) => at.status === 1)
      .toArray();

    allAccountTypes = await db.account_types.where('status').equals(1).toArray();

    const defaultCurrency = currencies.find((c) => c.isDefault == 1);
    if (defaultCurrency && !form.currency) form.currency = defaultCurrency.code;

    // initialize payment currency
    paymentCurrency = form.currency;

    if (purchaseId) await loadPurchase(purchaseId);
    await calculateTreasuryBalance();

    await tick();
    initDropdowns();
  });

  let componentRoot;

  async function loadPurchase(id) {
    try {
      const purchase = await db.purchases.where({ id: Number(id), bill_status: 'draft', status: 1 }).first();
      if (!purchase) {
        push('/dashboard/purchases');

        return;
      }

      date = purchase.bill_date.slice(0, 10);
      form = {
        warehouse_id: purchase.warehouse_id,
        account_id: purchase.account_id,
        bill_number: purchase.bill_number,
        bill_date: purchase.bill_date,

        due_date: purchase.due_date,
        description: purchase.description,
        currency: purchase.currency,
        bill_status: purchase.bill_status,
        status: purchase.status,
      };

      const purchaseItems = (
        await db.purchase_items
          .where('purchase_id')
          .equals(Number(id))
          .and((item) => item.status === 1)
          .toArray()
      ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const productIds = purchaseItems.map((i) => i.product_id);
      const products = await db.products
        .where('id')
        .anyOf(productIds)
        .and((p) => p.status === 1)
        .toArray();

      items = purchaseItems.map((i) => {
        const product = products.find((p) => p.id === i.product_id);
        return {
          product_id: i.product_id,
          product_name: product?.name || 'Unknown',
          product_unit_id: i.product_unit_id || product?.product_unit_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          sell_price: i.sell_price,
          unit_price_currency: i.currency,
          sell_price_currency: i.sell_currency,
          discount_type: i.discount_type,
          discount_amount: i.discount_amount,
          subtotal: i.subtotal,
        };
      });

      paymentCurrency = purchase.currency || paymentCurrency;
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('Failed to load purchase. Please try again.'),
        confirmButtonText: t('OK'),
      });
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

  $: total_amount = items.reduce((s, i) => {
    if (i.unit_price_currency && form.currency && i.unit_price_currency !== form.currency) {
      let exchangeRateValue = exchangeRate(i.subtotal, i.unit_price_currency, form.currency);
      console.log(
        `Converting ${i.subtotal} from ${i.unit_price_currency} to ${form.currency} for total calculation - exchange rate value: ${exchangeRateValue}`,
      );
      return s + exchangeRateValue;
    } else {
      return s + i.subtotal;
    }
  }, 0);

  function getMaxPaymentAmount() {
    if (!total_amount) return 0;
    if (!paymentCurrency || !form.currency || paymentCurrency === form.currency) {
      return total_amount;
    }
    return exchangeRate(total_amount, form.currency, paymentCurrency);
  }

  function initDropdowns() {
    if (!window.mdb || !componentRoot) return;
    componentRoot.querySelectorAll('.dropdown-toggle').forEach((el) => {
      const existing = window.mdb.Dropdown.getInstance(el);
      if (existing) existing.dispose();
      new window.mdb.Dropdown(el);
    });
  }

  async function savePurchase(confirm = false) {
    if (!form.warehouse_id || !form.account_id || items.length === 0) {
      Swal.fire({
        icon: 'error',
        title: t('Validation Error'),
        text: t('Warehouse, Supplier and at least one Item are required.'),
        confirmButtonText: t('OK'),
      });
      return;
    }

    if (confirm && (paymentAmount === null || paymentAmount === '')) {
      Swal.fire({
        icon: 'error',
        title: t('Validation Error'),
        text: t('Payment amount cannot be empty. Enter 0 if no payment.'),
        confirmButtonText: t('OK'),
      });
      return;
    }
    loading = true;
    let savedId = null;
    try {
      let addedItems = [];
      await db.transaction(
        'rw',
        [
          'purchases',
          'purchase_items',
          'purchase_payments',
          'accounts',
          'journals',
          'settings',
          'activity_logs',
          ...INVENTORY_TX_STORES,
        ],
        async (tx) => {
          let id = Number(purchaseId);

          if (id) {
            savedId = id;
            // Update existing draft
            let oldPurchase = await db.purchases.get(Number(id));
            await db.purchases.update(id, {
              ...form,
              total_amount,
              items_count: items.length,
              bill_status: confirm ? 'confirmed' : 'draft',
            });
            await db.purchase_items
              .where('purchase_id')
              .equals(id)
              .modify((item) => {
                item.status = 0;
              });
            await logActivity({
              user_id: parseInt(localStorage.getItem('user_id')) || 0,
              action: 'update',
              table_name: 'purchases',
              entity_id: id,
              old_values: JSON.stringify(oldPurchase),
              new_values: JSON.stringify({
                ...form,
                items_count: items.length,
                total_amount,
                bill_status: confirm ? 'confirmed' : 'draft',
              }),
              description: `Updated purchase #${id}`,
            });
          } else {
            id = await db.purchases.add({
              ...form,
              total_amount,
              items_count: items.length,
              bill_status: confirm ? 'confirmed' : 'draft',
              created_at: new Date().toISOString(),
            });

            savedId = id;
            await db.settings
              .where('key')
              .equals('bill_index')
              .modify((setting) => {
                setting.value = String(Number(setting.value || 0) + 1);
              });
            await logActivity({
              user_id: parseInt(localStorage.getItem('user_id')) || 0,
              action: 'create',
              table_name: 'purchases',
              entity_id: id,
              old_values: null,
              new_values: JSON.stringify({
                ...form,
                total_amount,
                items_count: items.length,
                bill_status: confirm ? 'confirmed' : 'draft',
              }),
              description: `Created purchase #${id}`,
            });
          }

          for (let item of items) {
            const purchaseItemId = await db.purchase_items.add({
              purchase_id: id,
              product_id: item.product_id,
              product_unit_id: item.product_unit_id,
              quantity: item.quantity,
              unit_price: item.unit_price,
              sell_price: item.sell_price,
              subtotal: item.subtotal,
              currency: item.unit_price_currency,
              discount_type: item.discount_type,
              discount_amount: item.discount_amount,
              sell_currency: item.sell_price_currency,
              expiry_date: item.expiry_date,
              manufacturing_date: item.manufacturing_date,
              batch: item.batch,
              status: 1,
            });
            if (confirm && (!purchaseId || form.bill_status !== 'confirmed')) {
              await applyPurchase(tx, {
                purchaseId: id,
                purchaseItemId,
                item,
                warehouseId: form.warehouse_id,
                purchaseDate: form.bill_date,
                purchaseDescription: `Stock added from Purchase #${id}`,
              });
              addedItems.push(item);
            }
          }
          if (confirm && (!purchaseId || form.bill_status !== 'confirmed')) {
            const payableAccount = await db.accounts
              .where('code')
              .equals('PAYABLE')
              .and((a) => a.status === 1)
              .first();

            if (!payableAccount) {
              throw new Error('PAYABLE account not found');
            }

            await db.journals.add({
              date: form.bill_date,
              reference_id: purchaseId || id,
              reference_type: 'purchase',
              description: form.description || `Purchase Invoice #${form.invoice_number}`,
              currency: form.currency,
              first_entry_account: form.account_id, // Customer (Debit)
              first_entry_debit: 0,
              first_entry_credit: total_amount,
              second_entry_account: payableAccount.id, // Warehouse/Revenue (Credit)
              second_entry_debit: total_amount,
              second_entry_credit: 0,
              status: 1,
            });

            // Update product prices based on items in the purchase

            for (let item of items) {
              if (!item.unit_price_currency || !item.sell_price_currency) {
                console.error(
                  'From Purchase ' +
                    purchaseId +
                    ' Form: item.unit_price_currency is ' +
                    item.unit_price_currency +
                    ' or sell_currency is ' +
                    item.sell_price_currency +
                    '. Skipping product price update.',
                );
              } else {
                let updatePrice = item.unit_price;
                if (item.discount_type && item.discount_amount) {
                  if (item.discount_type === 'percent') {
                    updatePrice = item.unit_price * (1 - item.discount_amount / 100);
                  } else if (item.discount_type === 'fixed') {
                    updatePrice = item.unit_price - Number(item.discount_amount) / Number(item.quantity);
                  }
                }
                await db.products.update(item.product_id, {
                  buy_price: updatePrice,
                  buy_currency: item.unit_price_currency,
                  expiry_date: item.expiry_date,
                  batch: item.batch,
                  manufacturing_date: item.manufacturing_date,
                  sell_price: item.sell_price,
                  sell_currency: item.sell_price_currency,
                });
              }
            }
          }

          // initial payment when confirming
          if (confirm && paymentAmount && Number(paymentAmount) > 0) {
            const myPurchase = await db.purchases.where('id').equals(id).first();

            let payId = await db.purchase_payments.add({
              purchase_id: id,
              account_id: second_entry_account,
              amount: Number(paymentAmount),
              currency: paymentCurrency,
              payment_date: new Date().toISOString(),
              description: paymentDescription,
              status: 1,
            });

            await logActivity({
              user_id: parseInt(localStorage.getItem('user_id')) || 0,
              action: 'create',
              table_name: 'purchase_payments',
              entity_id: payId,
              old_values: null,
              new_values: JSON.stringify({
                purchase_id: id,
                account_id: second_entry_account,
                amount: Number(paymentAmount),
                currency: paymentCurrency,
                payment_date: new Date().toISOString(),
                description: paymentDescription,
                status: 1,
              }),
              description: `Added payment of ${paymentAmount} ${paymentCurrency} for purchase #${id}`,
            });

            const payableAcct = await db.accounts
              .where('code')
              .equals('PAYABLE')
              .and((a) => a.status === 1)
              .first();
            if (!payableAcct) throw new Error('PAYABLE account not found');
            const purchaseAcct = await db.accounts
              .where('code')
              .equals('PURCHASE')
              .and((a) => a.status === 1)
              .first();
            if (!purchaseAcct) throw new Error('PURCHASE account not found');

            // journal for purchase/payable
            await db.journals.add({
              date: new Date().toISOString(),
              reference_id: payId,
              reference_type: 'purchase_payment',
              description: `Payment for Purchase Invoice`,
              currency: paymentCurrency,
              first_entry_account: purchaseAcct.id,
              first_entry_debit: Number(paymentAmount),
              first_entry_credit: 0,
              second_entry_account: payableAcct.id,
              second_entry_debit: 0,
              second_entry_credit: Number(paymentAmount),
              status: 1,
            });

            // journal for supplier/treasury
            await db.journals.add({
              date: new Date().toISOString(),
              reference_id: payId,
              reference_type: 'purchase_payment',
              description: `Payment for Purchase Invoice`,
              currency: paymentCurrency,
              first_entry_account: myPurchase.account_id,
              first_entry_debit: Number(paymentAmount),
              first_entry_credit: 0,
              second_entry_account: second_entry_account,
              second_entry_debit: 0,
              second_entry_credit: Number(paymentAmount),
              status: 1,
            });
          }
        },
      );

      for (const item of addedItems) {
        await calculateProductStock(Number(item.product_id));
      }

      // Update form state to match the saved bill_status
      form.bill_status = confirm ? 'confirmed' : 'draft';
      toast.success(t('Success'), confirm ? t('Purchase Confirmed.') : t('Draft Saved.'));
      resetForm();
      push('/dashboard/purchases');
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('Failed to save purchase. Please try again.'),
        confirmButtonText: t('OK'),
      });
    }

    loading = false;
  }


  function resetForm() {
    date = new Date().toISOString().slice(0, 10);
    form = {
      ...form,
      warehouse_id: '',
      account_id: '',
      bill_number: '',
      bill_date: new Date().toISOString().slice(0, 10),
      due_date: null,
      description: '',
    };
    items = [];
    paymentAmount = null;
    paymentDescription = '';
    paymentCurrency = form.currency;
  }

  function getAccountTypeColor(type) {
    const colors = ['dark', 'danger', 'secondary', 'primary', 'success', 'info', 'warning', 'dark', 'info', 'success'];
    return colors[type];
  }

  let showAccountModal = false;
  let calculatedBalance = '';
  $: if (form.account_id) {
    calculatedBalance = '';
    calculatedBalance = calculateAccountBalance(form.account_id, form.currency);
  }

  function calculateAccountBalance(accountId, currency) {
    let balance = {};
    // is treasury account, show balance of all linked accounts

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
    console.log('Calculated balance for account', accountId, accounts.length, balance, allJournals.length);
    return balance.toString
      ? Object.entries(balance)
          .map(([cur, amt]) =>
            cur == currency
              ? `<span class='text-${amt > 0 ? 'dark' : 'danger'}'>${t('Balance')}: <span dir='ltr'>${amt.toLocaleString(undefined, { maximumFractionDigits: 3 })}</span> ${t(cur)}</span>`
              : '',
          )
          .join('')
      : '';
  }
  let form_account_search = '';
  let form_account_search_input = null;
  let filteredAccounts = [];
  let showAccountDropdown = false;
  let accountDropdownStyle = '';

  function portal(node) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  function positionAccountDropdown() {
    if (!form_account_search_input) return;
    const rect = form_account_search_input.closest('.position-relative')?.getBoundingClientRect() || form_account_search_input.getBoundingClientRect();
    const maxHeight = Math.min(220, window.innerHeight * .4);
    const openUp = window.innerHeight - rect.bottom < maxHeight + 10;
    accountDropdownStyle = openUp
      ? `position:fixed;left:${rect.left}px;width:${rect.width}px;bottom:${window.innerHeight - rect.top + 5}px;top:auto;max-height:${maxHeight}px;overflow:auto;z-index:100000;`
      : `position:fixed;left:${rect.left}px;width:${rect.width}px;top:${rect.bottom + 5}px;bottom:auto;max-height:${maxHeight}px;overflow:auto;z-index:100000;`;
  }

  $: if (showAccountDropdown) tick().then(positionAccountDropdown);

  function getAccountName(id) {
    const acc = suppliers.find((a) => a.id === id) || {};
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }
</script>

<svelte:window on:click={handleWindowClick} />

<div class="purchase-create-page" bind:this={componentRoot} dir={t('dir')}>

  <section class="purchase-section purchase-details-section">
    <header class="purchase-section-header">
      <div class="purchase-section-heading">
        <span class="purchase-section-icon" aria-hidden="true">
          <i class="bi bi-file-earmark-text"></i>
        </span>
          <h2>{t('New Purchase')}</h2>
      </div>
      <span class="purchase-required-note">
        <i class="bi bi-asterisk" aria-hidden="true"></i>
        {t('Required')}
      </span>
    </header>

    <div class="purchase-details-grid">
      <div class="purchase-field">
        <span class="purchase-field-label">
          <i class="bi bi-building" aria-hidden="true"></i>
          {t('Warehouse')}
        </span>

        <FilterSelect
          variant="outline"
         
          value={form.warehouse_id}
          options={[
            { value: '', label: t('Select Warehouse') },
            ...warehouses.map((w) => ({ value: w.id, label: w.name })),
          ]}
          on:change={(event) => (form.warehouse_id = event.detail)} />
      </div>

      <div class="purchase-field purchase-field--supplier">
        <span class="purchase-field-label">
          <i class="bi bi-person" aria-hidden="true"></i>
          {t('Supplier')}
        </span>

        <div class="purchase-supplier-control position-relative">
          <div class="purchase-supplier-input">
            <span class="purchase-supplier-input__icon" aria-hidden="true">
              <i class="bi bi-person"></i>
            </span>

            {#if form.account_id}
              <button
                type="button"
                class="purchase-selected-supplier"
                on:click={async () => {
                  form.account_id = '';
                  form_account_search = '';
                  showAccountDropdown = true;
                  filteredAccounts = suppliers;
                  await tick();
                  form_account_search_input?.focus();
                }}>
                <span>{getAccountName(form.account_id)}</span>
                <i class="bi bi-pencil-square" aria-hidden="true"></i>
              </button>
            {:else}
              <input
                id="form_account_search"
                bind:this={form_account_search_input}
                type="text"
                bind:value={form_account_search}
                placeholder={t('Select Supplier')}
                autocomplete="off"
                on:input={() => {
                  showAccountDropdown = true;
                  filteredAccounts = suppliers.filter((acc) => {
                    const name =
                      t('Lang') === 'en'
                        ? acc.name
                        : t('Lang') === 'fa'
                          ? acc.name_fa
                          : t('Lang') === 'ps'
                            ? acc.name_ps
                            : acc.name;

                    return (
                      name &&
                      name
                        .toLowerCase()
                        .includes(form_account_search.trim().toLowerCase())
                    );
                  });
                }}
                on:focus={() => {
                  showAccountDropdown = true;

                  if (form_account_search.trim()) {
                    filteredAccounts = suppliers.filter((acc) => {
                      const name =
                        t('Lang') === 'en'
                          ? acc.name
                          : t('Lang') === 'fa'
                            ? acc.name_fa
                            : t('Lang') === 'ps'
                              ? acc.name_ps
                              : acc.name;

                      return (
                        name &&
                        name
                          .toLowerCase()
                          .includes(form_account_search.trim().toLowerCase())
                      );
                    });
                  } else {
                    filteredAccounts = suppliers;
                  }
                }}
                on:blur={() =>
                  setTimeout(() => (showAccountDropdown = false), 150)} />
            {/if}

            <button
              type="button"
              class="purchase-add-supplier"
              title={t('Add Account')}
              aria-label={t('Add Account')}
              on:click={() => accountModalRef?.openModal()}>
              <i class="bi bi-plus-lg" aria-hidden="true"></i>
              <span>{t('Add')}</span>
            </button>
          </div>

          {#if showAccountDropdown && filteredAccounts.length > 0}
            <ul
              use:portal
              class="purchase-supplier-dropdown"
              style={accountDropdownStyle}>
              {#each filteredAccounts as acc (acc.id)}
                <li>
                  <button
                    type="button"
                    class="purchase-supplier-option"
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
                    }}>
                    <span class="purchase-supplier-option__avatar">
                      <i class="bi bi-person" aria-hidden="true"></i>
                    </span>

                    <span class="purchase-supplier-option__copy">
                      <strong>
                        {#if t('Lang') === 'en' && acc.name}{acc.name}{/if}
                        {#if t('Lang') === 'fa' && acc.name_fa}{acc.name_fa}{/if}
                        {#if t('Lang') === 'ps' && acc.name_ps}{acc.name_ps}{/if}
                      </strong>

                      <small>
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
                      </small>
                    </span>

                    <i class="bi bi-chevron-right purchase-supplier-option__arrow" aria-hidden="true"></i>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>

      <div class="purchase-field">
        <span class="purchase-field-label">
          <i class="bi bi-receipt" aria-hidden="true"></i>
          {t('Bill #')}
        </span>

        <div class="purchase-readonly-field">
          <span dir="ltr">{form.bill_number}</span>
          <i class="bi bi-lock-fill" aria-hidden="true"></i>
        </div>
      </div>

      <div class="purchase-field">
        <span class="purchase-field-label">
          <i class="bi bi-calendar3" aria-hidden="true"></i>
          {t('Date')}
        </span>

        <div class="purchase-app-datepicker">
          <AppDatePicker bind:value={date} required />
        </div>
      </div>

      <div class="purchase-field">
        <span class="purchase-field-label">
          <i class="bi bi-currency-exchange" aria-hidden="true"></i>
          {t('Currency')}
        </span>

        <FilterSelect
          variant="outline"
          label={t('Currency')}
          icon="bi-currency-exchange"
          value={form.currency}
          options={currencies.map((cur) => ({
            value: cur.code,
            label: t(cur.code),
          }))}
          on:change={(event) => (form.currency = event.detail)} />
      </div>
    </div>
  </section>

  <PurchaseItemsTable
    bind:items
    warehouse_id={form.warehouse_id}
    currency={form.currency} />

  <div class="purchase-lower-grid">
    <section class="purchase-section purchase-description-section">
      <header class="purchase-section-header purchase-section-header--compact">
        <div class="purchase-section-heading">
          <span class="purchase-section-icon purchase-section-icon--neutral" aria-hidden="true">
            <i class="bi bi-card-text"></i>
          </span>

          <div>
            <h2>{t('Description')}</h2>
            <p>{t('Description')}</p>
          </div>
        </div>
      </header>

      <div class="purchase-description-body">
        <textarea
          bind:value={form.description}
          rows="5"
          placeholder={t('Description')}></textarea>

        <span class="purchase-description-hint">
          <i class="bi bi-info-circle" aria-hidden="true"></i>
          {t('Description')}
        </span>
      </div>
    </section>

    <section class="purchase-section purchase-payment-section">
      <header class="purchase-section-header purchase-section-header--compact">
        <div class="purchase-section-heading">
          <span class="purchase-section-icon purchase-section-icon--green" aria-hidden="true">
            <i class="bi bi-cash-stack"></i>
          </span>

          <div>
            <h2>{t('Add Payment')}</h2>
            <p>{t('Amount')}, {t('Currency')} &amp; {t('Account')}</p>
          </div>
        </div>

        {#if second_entry_account == treasury_ID}
          <span class="purchase-payment-method-badge purchase-payment-method-badge--treasury">
            <i class="bi bi-box" aria-hidden="true"></i>
            {t('Treasury')}
          </span>
        {:else if second_entry_account == track_ID}
          <span class="purchase-payment-method-badge purchase-payment-method-badge--track">
            <i class="bi bi-person-check" aria-hidden="true"></i>
            {t('Track')}
          </span>
        {/if}
      </header>

      <div class="purchase-payment-body">
        <label class="purchase-payment-field">
          <span>{t('Amount')}</span>

          <div class="purchase-payment-amount">
            <i class="bi bi-cash" aria-hidden="true"></i>

            <input
              id="paymentAmount"
              type="number"
              min="0"
              step="any"
              bind:value={paymentAmount}
              placeholder="0.00"
              on:focus={() => {
                if (paymentAmount === null || paymentAmount === 0) {
                  paymentAmount = '';
                }
              }}
              on:input={() => {
                if (paymentAmount === '') {
                  paymentAmount = null;
                } else if (paymentAmount < 0) {
                  paymentAmount = 0;
                } else if (paymentAmount > getMaxPaymentAmount()) {
                  paymentAmount = getMaxPaymentAmount();
                } else {
                  paymentAmount = Number(paymentAmount);
                }

                if (second_entry_account == treasury_ID) {
                  const treasury_balance_for_currency =
                    treasury_balance[paymentCurrency] || 0;

                  if (paymentAmount > treasury_balance_for_currency * -1) {
                    paymentAmount = Number(
                      treasury_balance_for_currency * -1,
                    ).toFixed(2);
                  }
                }
              }} />

            <div class="payment-currency-picker">
              <button
                id="paymentCurrencyDropdown"
                type="button"
                class="payment-currency-picker__btn"
                aria-expanded={showPaymentCurrencyMenu}
                aria-haspopup="listbox"
                aria-label={t('Currency')}
                on:click|stopPropagation={() =>
                  (showPaymentCurrencyMenu = !showPaymentCurrencyMenu)}>
                {paymentCurrency
                  ? t(paymentCurrency)
                  : t(form.currency || 'AFN')}
                <i class="bi bi-chevron-down" aria-hidden="true"></i>
              </button>

              {#if showPaymentCurrencyMenu}
                <ul class="payment-currency-menu" role="listbox">
                  {#each currencies as cur (cur.code)}
                    <li
                      role="option"
                      aria-selected={paymentCurrency === cur.code}>
                      <button
                        type="button"
                        class="payment-currency-menu__item"
                        class:selected={paymentCurrency === cur.code}
                        on:click|stopPropagation={() =>
                          selectPaymentCurrency(cur.code)}>
                        {t(cur.code)}
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </div>
        </label>

        <label class="purchase-payment-field">
          <span>{t('Description')}</span>

          <div class="purchase-payment-description">
            <i class="bi bi-card-text" aria-hidden="true"></i>
            <input
              type="text"
              bind:value={paymentDescription}
              placeholder={t('Description')} />
          </div>
        </label>

        <div class="purchase-payment-methods">
          <button
            type="button"
            class="purchase-payment-method"
            class:is-active={second_entry_account == track_ID}
            on:click={() => {
              filteredSecondAccounts = accounts;
              showTrackModal = true;
            }}>
            <span class="purchase-payment-method__icon purchase-payment-method__icon--track">
              <i class="bi bi-person-check" aria-hidden="true"></i>
            </span>

            <span class="purchase-payment-method__copy">
              <strong>{t('Track')}</strong>
              <small>
                {#if second_entry_account == track_ID}
                  {t('Lang') === 'en'
                    ? accounts.find((a) => a.id === track_ID)?.name
                    : t('Lang') === 'fa'
                      ? accounts.find((a) => a.id === track_ID)?.name_fa
                      : t('Lang') === 'ps'
                        ? accounts.find((a) => a.id === track_ID)?.name_ps
                        : accounts.find((a) => a.id === track_ID)?.name}
                {:else}
                  {t('Account')}
                {/if}
              </small>
            </span>

            <span class="purchase-payment-method__check">
              <i
                class="bi bi-{second_entry_account == track_ID
                  ? 'check-circle-fill'
                  : 'circle'}"
                aria-hidden="true"></i>
            </span>
          </button>

          <button
            type="button"
            class="purchase-payment-method"
            class:is-active={second_entry_account == treasury_ID}
            on:click={() => (second_entry_account = treasury_ID)}>
            <span class="purchase-payment-method__icon purchase-payment-method__icon--treasury">
              <i class="bi bi-box" aria-hidden="true"></i>
            </span>

            <span class="purchase-payment-method__copy">
              <strong>{t('Treasury')}</strong>
              <small>
                {#if second_entry_account == treasury_ID}
                  <span dir="ltr">
                    {Number(
                      treasury_balance[paymentCurrency] || 0,
                    ).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                  </span>
                  {t(paymentCurrency)}
                {:else}
                  {t('Treasury')}
                {/if}
              </small>
            </span>

            <span class="purchase-payment-method__check">
              <i
                class="bi bi-{second_entry_account == treasury_ID
                  ? 'check-circle-fill'
                  : 'circle'}"
                aria-hidden="true"></i>
            </span>
          </button>
        </div>

        {#if second_entry_account == treasury_ID}
          <div class="purchase-treasury-status">
            <i class="bi bi-info-circle" aria-hidden="true"></i>
            <span>
              {t('Treasury')}:
              <strong dir="ltr">
                {Number(
                  treasury_balance[paymentCurrency] || 0,
                ).toLocaleString(undefined, {
                  maximumFractionDigits: 3,
                })}
              </strong>
              {t(paymentCurrency)}
            </span>
          </div>
        {/if}
      </div>
    </section>
  </div>

  <footer class="purchase-actions">
    <div class="purchase-actions__status">
      <span class="purchase-actions__status-icon">
        <i class="bi bi-shield-check" aria-hidden="true"></i>
      </span>

      <span>
        <strong>{t('Purchase')}</strong>
        <small>
          {items.length} {t('Items')} · {t(form.currency || 'AFN')}
        </small>
      </span>
    </div>

    <div class="purchase-actions__buttons">
      <button
        type="button"
        class="purchase-action-button purchase-action-button--draft"
        on:click={() => savePurchase(false)}
        disabled={loading}>
        {#if loading}
          <span class="spinner-border spinner-border-sm" role="status"></span>
        {:else}
          <i class="bi bi-file-earmark-text" aria-hidden="true"></i>
        {/if}

        <span>{t('Save Draft')}</span>
      </button>

      <button
        type="button"
        class="purchase-action-button purchase-action-button--confirm"
        on:click={() => savePurchase(true)}
        disabled={loading}>
        {#if loading}
          <span class="spinner-border spinner-border-sm" role="status"></span>
        {:else}
          <i class="bi bi-check2-circle" aria-hidden="true"></i>
        {/if}

        <span>{t('Confirm Purchase')}</span>
      </button>
    </div>
  </footer>

  <AccountModal
    bind:this={modalRef}
    accountTypes={allAccountTypes}
    on:saved={async (e) => {
      accounts = await db.accounts.where({ status: 1 }).toArray();
      accounts = accounts.filter((a) =>
        a.account_status ? a.account_status == 'active' : a.status == 1,
      );
      second_entry_account = e.detail.account.id;
      track_ID = e.detail.account.id;
      showTrackModal = false;
    }} />
</div>

<AccountModal
  bind:this={accountModalRef}
  {accountTypes}
  on:saved={async (e) => {
    suppliers = await db.accounts
      .where('account_type_id')
      .equals(3)
      .and((a) => a.status === 1)
      .toArray();

    suppliers = suppliers.filter((a) =>
      a.account_status ? a.account_status == 'active' : a.status == 1,
    );

    const newAccount = e.detail.account;

    if (newAccount && newAccount.account_type_id == 3) {
      form.account_id = newAccount.id;
    }
  }} />

{#if showTrackModal}
  <div class="purchase-modal-backdrop" role="presentation"></div>

  <div
    class="purchase-track-layer"
    id="trackModal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="trackModalLabel">
    <div class="purchase-track-dialog">
      <div class="purchase-track-modal">
        <header class="purchase-track-header">
          <div class="purchase-track-heading">
            <span aria-hidden="true">
              <i class="bi bi-person-check"></i>
            </span>

            <div>
              <small>{t('Account')}</small>
              <h2 id="trackModalLabel">{t('Track')}</h2>
            </div>
          </div>

          <button
            type="button"
            class="purchase-track-close"
            aria-label={t('Close')}
            on:click={() => (showTrackModal = false)}>
            <i class="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </header>

        <div class="purchase-track-body">
          <div class="purchase-track-search">
            <i class="bi bi-search" aria-hidden="true"></i>

            <input
              type="text"
              bind:value={second_entry_account_search}
              placeholder={t('Search accounts...')}
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

                  return (
                    name &&
                    name
                      .toLowerCase()
                      .includes(second_entry_account_search.toLowerCase())
                  );
                });
              }} />

            <button
              type="button"
              title={t('Add Account')}
              aria-label={t('Add Account')}
              on:click={() => modalRef?.openModal()}>
              <i class="bi bi-plus-lg" aria-hidden="true"></i>
            </button>
          </div>

          <div class="purchase-track-list">
            {#each filteredSecondAccounts as acc (acc.id)}
              <button
                type="button"
                class="purchase-track-account"
                on:click={() => {
                  second_entry_account = acc.id;
                  track_ID = acc.id;
                  showTrackModal = false;
                }}>
                <span class="purchase-track-account__icon">
                  <i class="bi bi-person" aria-hidden="true"></i>
                </span>

                <span class="purchase-track-account__copy">
                  <strong>
                    {#if t('Lang') === 'en' && acc.name}{acc.name}{/if}
                    {#if t('Lang') === 'fa' && acc.name_fa}{acc.name_fa}{/if}
                    {#if t('Lang') === 'ps' && acc.name_ps}{acc.name_ps}{/if}
                  </strong>

                  <small>
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
                  </small>
                </span>

                <i class="bi bi-chevron-right purchase-track-account__arrow" aria-hidden="true"></i>
              </button>
            {/each}

            {#if filteredSecondAccounts.length === 0}
              <div class="purchase-track-empty">
                <span aria-hidden="true">
                  <i class="bi bi-person-x"></i>
                </span>

                <strong>{t('No accounts found')}</strong>
              </div>
            {/if}
          </div>
        </div>

        <footer class="purchase-track-footer">
          <button type="button" on:click={() => (showTrackModal = false)}>
            <i class="bi bi-x-lg" aria-hidden="true"></i>
            <span>{t('Close')}</span>
          </button>
        </footer>
      </div>
    </div>
  </div>
{/if}

{#if form?.account_id && showAccountModal}
  <div class="purchase-modal-backdrop" role="presentation"></div>

  <div
    class="purchase-account-view-layer"
    role="dialog"
    aria-modal="true"
    aria-labelledby="purchaseAccountViewTitle">
    <div class="purchase-account-view-dialog">
      <div class="purchase-account-view-modal">
        <header>
          <div>
            <span aria-hidden="true">
              <i class="bi bi-person-vcard"></i>
            </span>
            <h2 id="purchaseAccountViewTitle">{t('Account')}</h2>
          </div>

          <button
            type="button"
            aria-label={t('Close')}
            on:click={() => (showAccountModal = false)}>
            <i class="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </header>

        <div class="purchase-account-view-body">
          <AccountView id={form.account_id} />
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .purchase-create-page {
    --purchase-primary: var(--bs-primary, #2f6fed);
    --purchase-primary-dark: #1d4ed8;
    --purchase-green: #059669;
    --purchase-text: #172033;
    --purchase-muted: #718096;
    --purchase-border: #dfe6ef;
    --purchase-border-soft: #edf1f6;
    --purchase-surface: #ffffff;
    --purchase-bg-soft: #f7f9fc;
    --purchase-control-height: 2.625rem;

    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    margin: 0;
    padding: 0 0 1.25rem;
    color: var(--purchase-text);
  }

  /* Page header */

  .purchase-page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-width: 0;
    padding: 0.9rem 1rem;
    border: 1px solid var(--purchase-border);
    border-radius: 0.875rem;
    background: var(--purchase-surface);
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.045);
  }

  .purchase-page-heading {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-width: 0;
  }

  .purchase-page-icon {
    display: inline-grid;
    flex: 0 0 2.75rem;
    width: 2.75rem;
    height: 2.75rem;
    place-items: center;
    border-radius: 0.75rem;
    background: #edf4ff;
    color: var(--purchase-primary);
    font-size: 1.1rem;
  }

  .purchase-page-heading__copy {
    min-width: 0;
  }

  .purchase-page-eyebrow {
    margin-bottom: 0.05rem;
    color: var(--purchase-primary);
    font-size: 0.65rem;
    font-weight: 850;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .purchase-page-heading h1 {
    margin: 0;
    color: var(--purchase-text);
    font-size: 1.15rem;
    font-weight: 900;
    line-height: 1.3;
    letter-spacing: -0.025em;
  }

  .purchase-page-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
    color: #7c899c;
    font-size: 0.68rem;
    font-weight: 600;
  }

  .purchase-page-meta > span {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .purchase-page-meta strong {
    color: #526176;
    font-weight: 800;
  }

  .purchase-page-meta__separator {
    width: 3px;
    height: 3px;
    border-radius: 999px;
    background: #cbd5e1;
  }

  .purchase-page-header__actions {
    display: flex;
    flex-shrink: 0;
  }

  .purchase-supplier-balance {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 11rem;
    min-height: 2.75rem;
    padding: 0.35rem 0.55rem;
    border: 1px solid #d9e6fb;
    border-radius: 0.7rem;
    background: #f5f9ff;
    color: #334155;
    text-align: start;
    cursor: pointer;
  }

  .purchase-supplier-balance:hover {
    border-color: #bed3f8;
    background: #edf4ff;
  }

  .purchase-supplier-balance__icon {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #ffffff;
    color: var(--purchase-primary);
  }

  .purchase-supplier-balance__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.04rem;
  }

  .purchase-supplier-balance__copy small {
    color: #718096;
    font-size: 0.58rem;
    font-weight: 700;
  }

  .purchase-supplier-balance__copy strong {
    overflow: hidden;
    color: #26364b;
    font-size: 0.72rem;
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-supplier-balance__arrow {
    color: #95a3b6;
    font-size: 0.65rem;
  }

  /* Shared sections */

  .purchase-section {
    min-width: 0;
    overflow: visible;
    border: 1px solid var(--purchase-border);
    border-radius: 0.875rem;
    background: var(--purchase-surface);
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.045);
  }

  .purchase-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 4rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--purchase-border-soft);
  }

  .purchase-section-header--compact {
    min-height: 3.75rem;
  }

  .purchase-section-heading {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
  }

  .purchase-section-icon {
    display: inline-grid;
    flex: 0 0 2.2rem;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border-radius: 0.6rem;
    background: #edf4ff;
    color: var(--purchase-primary);
    font-size: 0.9rem;
  }

  .purchase-section-icon--neutral {
    background: #f1f5f9;
    color: #64748b;
  }

  .purchase-section-icon--green {
    background: #ecfdf5;
    color: var(--purchase-green);
  }

  .purchase-section-heading h2 {
    margin: 0;
    color: #26364b;
    font-size: 0.88rem;
    font-weight: 850;
    line-height: 1.25;
  }

  .purchase-section-heading p {
    margin: 0.1rem 0 0;
    color: #8794a7;
    font-size: 0.63rem;
    font-weight: 550;
  }

  .purchase-required-note {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  color: #b42318;
  font-size: 0.62rem;
  font-weight: 700;
}

.purchase-required-note i {
  color: #dc2626;
  font-size: 0.48rem;
}

  /* Details */

  .purchase-details-grid {
    display: grid;
    grid-template-columns:
      minmax(10rem, 1fr)
      minmax(13rem, 1.35fr)
      minmax(8rem, 0.72fr)
      minmax(10rem, 0.9fr)
      minmax(8rem, 0.72fr);
    gap: 0.75rem;
    padding: 0.875rem 1rem 1rem;
  }

  .purchase-field {
    display: grid;
    align-content: start;
    gap: 0.3rem;
    min-width: 0;
  }

  .purchase-field-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 1rem;
    color: #59687c;
    font-size: 0.68rem;
    font-weight: 750;
  }

  .purchase-field-label i {
    color: #8c9aad;
    font-size: 0.72rem;
  }

  .purchase-details-grid :global(.filter-select) {
    width: 100%;
    max-width: none;
    min-width: 0;
  }

  .purchase-details-grid :global(.filter-select__label),
  .purchase-details-grid :global(.filter-label) {
    display: none !important;
  }

  .purchase-details-grid :global(.filter-select__control),
  .purchase-details-grid :global(.filter-select select),
  .purchase-details-grid :global(.filter-select button),
  .purchase-details-grid :global(.form-select) {
    width: 100%;
    min-height: var(--purchase-control-height) !important;
    height: var(--purchase-control-height) !important;
    border-color: #d6dfeb !important;
    border-radius: 0.625rem !important;
    background: #ffffff !important;
    color: #26364b !important;
    font-size: 0.78rem !important;
    font-weight: 650 !important;
    box-shadow: none !important;
  }

  .purchase-details-grid :global(.filter-select__control:hover),
  .purchase-details-grid :global(.filter-select select:hover),
  .purchase-details-grid :global(.form-select:hover) {
    border-color: #bcc9db !important;
  }

  .purchase-details-grid :global(.filter-select__control:focus-within),
  .purchase-details-grid :global(.filter-select select:focus),
  .purchase-details-grid :global(.form-select:focus) {
    border-color: #78a4f5 !important;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1) !important;
  }

  .purchase-supplier-input {
    display: flex;
    align-items: stretch;
    width: 100%;
    height: var(--purchase-control-height);
    overflow: hidden;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .purchase-supplier-input:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .purchase-supplier-input__icon {
    display: inline-grid;
    flex: 0 0 2.25rem;
    width: 2.25rem;
    place-items: center;
    color: #8c9aad;
  }

  .purchase-supplier-input > input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 650;
  }

  .purchase-supplier-input > input::placeholder {
    color: #9aa7b8;
    font-weight: 500;
  }

  .purchase-selected-supplier {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    min-width: 0;
    padding-inline: 0.1rem 0.65rem;
    border: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 750;
    cursor: pointer;
  }

  .purchase-selected-supplier span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-selected-supplier i {
    flex-shrink: 0;
    color: #94a3b8;
    font-size: 0.72rem;
  }

  .purchase-add-supplier {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-width: 4.2rem;
    padding-inline: 0.65rem;
    border: 0;
    border-inline-start: 1px solid #dfe6ef;
    background: var(--purchase-primary);
    color: #ffffff;
    font-size: 0.68rem;
    font-weight: 800;
    cursor: pointer;
  }

  .purchase-add-supplier:hover {
    background: var(--purchase-primary-dark);
  }

  .purchase-supplier-dropdown {
    z-index: 1200;
    max-height: 18rem;
    margin: 0;
    padding: 0.3rem;
    overflow-y: auto;
    list-style: none;
    border: 1px solid #dce4ef;
    border-radius: 0.75rem;
    background: #ffffff;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.16);
  }

  .purchase-supplier-dropdown li {
    margin: 0;
    padding: 0;
  }

  .purchase-supplier-option {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    min-height: 3rem;
    padding: 0.4rem 0.5rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: #26364b;
    text-align: start;
    cursor: pointer;
  }

  .purchase-supplier-option:hover {
    background: #f0f6ff;
  }

  .purchase-supplier-option__avatar {
    display: inline-grid;
    flex: 0 0 1.9rem;
    width: 1.9rem;
    height: 1.9rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #edf4ff;
    color: var(--purchase-primary);
  }

  .purchase-supplier-option__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.05rem;
  }

  .purchase-supplier-option__copy strong {
    overflow: hidden;
    font-size: 0.75rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-supplier-option__copy small {
    overflow: hidden;
    color: #8794a7;
    font-size: 0.61rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-supplier-option__arrow {
    flex-shrink: 0;
    color: #a0acbc;
    font-size: 0.58rem;
  }

  .purchase-readonly-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    height: var(--purchase-control-height);
    padding-inline: 0.75rem;
    border: 1px solid #dfe5ed;
    border-radius: 0.625rem;
    background: #f7f9fc;
    color: #526176;
    font-size: 0.78rem;
    font-weight: 750;
  }

  .purchase-readonly-field i {
    color: #9aa7b8;
    font-size: 0.65rem;
  }

  .purchase-app-datepicker {
    width: 100%;
    min-width: 0;
  }

  .purchase-app-datepicker :global(.app-date-field) {
    width: 100%;
    gap: 0 !important;
  }

  .purchase-app-datepicker :global(.date-label) {
    display: none !important;
  }

  .purchase-app-datepicker :global(input),
  .purchase-app-datepicker :global(.date-picker-control) {
    width: 100%;
    min-width: 0;
    min-height: var(--purchase-control-height) !important;
    height: var(--purchase-control-height) !important;
    border-color: #d6dfeb !important;
    border-radius: 0.625rem !important;
    background: #ffffff !important;
    font-size: 0.78rem !important;
    font-weight: 650 !important;
    box-shadow: none !important;
  }

  .purchase-app-datepicker :global(input:focus),
  .purchase-app-datepicker :global(.date-picker-control:focus-within) {
    border-color: #78a4f5 !important;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1) !important;
  }

  /* Lower cards */

  .purchase-lower-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.85fr) minmax(25rem, 1.15fr);
    gap: 1rem;
    min-width: 0;
  }

  .purchase-description-body,
  .purchase-payment-body {
    padding: 0.875rem 1rem 1rem;
  }

  .purchase-description-body {
    display: grid;
    gap: 0.45rem;
  }

  .purchase-description-body textarea {
    width: 100%;
    min-height: 10rem;
    padding: 0.75rem;
    resize: vertical;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    outline: 0;
    background: #ffffff;
    color: #26364b;
    font: inherit;
    font-size: 0.78rem;
    line-height: 1.55;
  }

  .purchase-description-body textarea:hover {
    border-color: #bcc9db;
  }

  .purchase-description-body textarea:focus {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .purchase-description-body textarea::placeholder {
    color: #9aa7b8;
  }

  .purchase-description-hint {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: #8a97aa;
    font-size: 0.62rem;
    font-weight: 600;
  }

  /* Payment */

  .purchase-payment-method-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.8rem;
    padding-inline: 0.6rem;
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 800;
  }

  .purchase-payment-method-badge--treasury {
    border: 1px solid #bfe9d4;
    background: #effaf5;
    color: #087a54;
  }

  .purchase-payment-method-badge--track {
    border: 1px solid #d5e3fb;
    background: #f3f7fe;
    color: #2f6fed;
  }

  .purchase-payment-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.75rem;
  }

  .purchase-payment-field {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
  }

  .purchase-payment-field > span {
    color: #59687c;
    font-size: 0.68rem;
    font-weight: 750;
  }

  .purchase-payment-amount,
  .purchase-payment-description {
    display: flex;
    align-items: center;
    width: 100%;
    height: var(--purchase-control-height);
    overflow: visible;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .purchase-payment-amount:focus-within,
  .purchase-payment-description:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .purchase-payment-amount > i,
  .purchase-payment-description > i {
    flex: 0 0 2.25rem;
    width: 2.25rem;
    color: #8c9aad;
    text-align: center;
    pointer-events: none;
  }

  .purchase-payment-amount > input,
  .purchase-payment-description > input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 650;
  }

  .purchase-payment-amount > input::placeholder,
  .purchase-payment-description > input::placeholder {
    color: #9aa7b8;
    font-weight: 500;
  }

  .payment-currency-picker {
    position: relative;
    align-self: stretch;
    flex-shrink: 0;
    border-inline-start: 1px solid #dfe6ef;
  }

  .payment-currency-picker__btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: 100%;
    min-width: 4.5rem;
    padding-inline: 0.7rem;
    border: 0;
    background: #f7f9fc;
    color: #526176;
    font-size: 0.68rem;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
  }

  .payment-currency-picker__btn:hover {
    background: #eef3f8;
  }

  .payment-currency-menu {
    position: absolute;
    top: calc(100% + 0.35rem);
    inset-inline-end: 0;
    z-index: 1300;
    min-width: 8rem;
    margin: 0;
    padding: 0.3rem;
    list-style: none;
    border: 1px solid #dce4ef;
    border-radius: 0.65rem;
    background: #ffffff;
    box-shadow: 0 16px 34px rgba(15, 23, 42, 0.14);
  }

  .payment-currency-menu__item {
    width: 100%;
    padding: 0.45rem 0.6rem;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    color: #526176;
    font-size: 0.7rem;
    font-weight: 700;
    text-align: start;
    cursor: pointer;
  }

  .payment-currency-menu__item:hover,
  .payment-currency-menu__item.selected {
    background: #edf4ff;
    color: var(--purchase-primary);
  }

  .purchase-payment-methods {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .purchase-payment-method {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
    min-height: 4rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid #dfe6ef;
    border-radius: 0.7rem;
    background: #ffffff;
    color: #334155;
    text-align: start;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
  }

  .purchase-payment-method:hover {
    transform: translateY(-1px);
    border-color: #c9d7e8;
    background: #fbfcfe;
  }

  .purchase-payment-method.is-active {
    border-color: #99b9f4;
    background: #f4f8ff;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.07);
  }

  .purchase-payment-method__icon {
    display: inline-grid;
    flex: 0 0 2.35rem;
    width: 2.35rem;
    height: 2.35rem;
    place-items: center;
    border-radius: 0.6rem;
    font-size: 0.88rem;
  }

  .purchase-payment-method__icon--track {
    background: #edf4ff;
    color: var(--purchase-primary);
  }

  .purchase-payment-method__icon--treasury {
    background: #ecfdf5;
    color: var(--purchase-green);
  }

  .purchase-payment-method__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.06rem;
  }

  .purchase-payment-method__copy strong {
    overflow: hidden;
    color: #26364b;
    font-size: 0.75rem;
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-payment-method__copy small {
    overflow: hidden;
    color: #8491a4;
    font-size: 0.61rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-payment-method__check {
    flex-shrink: 0;
    color: #a9b4c3;
    font-size: 0.82rem;
  }

  .purchase-payment-method.is-active .purchase-payment-method__check {
    color: var(--purchase-primary);
  }

  .purchase-treasury-status {
    display: flex;
    grid-column: 1 / -1;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.25rem;
    padding-inline: 0.65rem;
    border: 1px solid #cdebdc;
    border-radius: 0.55rem;
    background: #f3fbf7;
    color: #527565;
    font-size: 0.65rem;
    font-weight: 650;
  }

  .purchase-treasury-status i {
    color: var(--purchase-green);
  }

  .purchase-treasury-status strong {
    color: #176a4c;
    font-weight: 850;
  }

  /* Sticky actions */

  .purchase-actions {
    position: sticky;
    bottom: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 4.5rem;
    padding: 0.7rem 0.85rem;
    border: 1px solid #d9e1ec;
    border-radius: 0.875rem;
    background: rgba(255, 255, 255, 0.96);
    box-shadow:
      0 -8px 28px rgba(15, 23, 42, 0.07),
      0 8px 24px rgba(15, 23, 42, 0.05);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }

  .purchase-actions__status {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }

  .purchase-actions__status-icon {
    display: inline-grid;
    flex: 0 0 2.2rem;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border-radius: 0.55rem;
    background: #f1f5f9;
    color: #64748b;
  }

  .purchase-actions__status > span:last-child {
    display: grid;
    min-width: 0;
    gap: 0.03rem;
  }

  .purchase-actions__status strong {
    color: #334155;
    font-size: 0.72rem;
    font-weight: 850;
  }

  .purchase-actions__status small {
    overflow: hidden;
    color: #8a97aa;
    font-size: 0.6rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-actions__buttons {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-shrink: 0;
  }

  .purchase-action-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    min-height: 2.6rem;
    padding-inline: 1rem;
    border-radius: 0.625rem;
    font-size: 0.74rem;
    font-weight: 850;
    white-space: nowrap;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      color 0.15s ease,
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .purchase-action-button:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .purchase-action-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .purchase-action-button--draft {
    border: 1px solid #d5deea;
    background: #ffffff;
    color: #526176;
  }

  .purchase-action-button--draft:hover:not(:disabled) {
    border-color: #becbdb;
    background: #f8fafc;
    color: #26364b;
  }

  .purchase-action-button--confirm {
    min-width: 9rem;
    border: 1px solid var(--purchase-primary);
    background: var(--purchase-primary);
    color: #ffffff;
    box-shadow: 0 5px 14px rgba(47, 111, 237, 0.22);
  }

  .purchase-action-button--confirm:hover:not(:disabled) {
    border-color: var(--purchase-primary-dark);
    background: var(--purchase-primary-dark);
    box-shadow: 0 7px 18px rgba(47, 111, 237, 0.27);
  }

  /* Modals */

  .purchase-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1400;
    background: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(2px);
  }

  .purchase-track-layer,
  .purchase-account-view-layer {
    position: fixed;
    inset: 0;
    z-index: 1410;
    display: grid;
    place-items: center;
    padding: 1rem;
    overflow-y: auto;
  }

  .purchase-track-dialog {
    width: min(94vw, 32rem);
  }

  .purchase-track-modal,
  .purchase-account-view-modal {
    overflow: hidden;
    border: 1px solid #dce4ef;
    border-radius: 0.875rem;
    background: #ffffff;
    box-shadow: 0 26px 70px rgba(15, 23, 42, 0.22);
  }

  .purchase-track-header,
  .purchase-account-view-modal > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 4.25rem;
    padding: 0.75rem 0.85rem;
    border-bottom: 1px solid var(--purchase-border-soft);
    background: #ffffff;
  }

  .purchase-track-heading,
  .purchase-account-view-modal > header > div {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .purchase-track-heading > span,
  .purchase-account-view-modal > header > div > span {
    display: inline-grid;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border-radius: 0.55rem;
    background: #edf4ff;
    color: var(--purchase-primary);
  }

  .purchase-track-heading small {
    display: block;
    color: #8794a7;
    font-size: 0.58rem;
    font-weight: 650;
  }

  .purchase-track-heading h2,
  .purchase-account-view-modal > header h2 {
    margin: 0;
    color: #26364b;
    font-size: 0.9rem;
    font-weight: 850;
  }

  .purchase-track-close,
  .purchase-account-view-modal > header > button {
    display: inline-grid;
    width: 2rem;
    height: 2rem;
    padding: 0;
    place-items: center;
    border: 1px solid #e0e6ee;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #718096;
    cursor: pointer;
  }

  .purchase-track-close:hover,
  .purchase-account-view-modal > header > button:hover {
    background: #f1f5f9;
    color: #334155;
  }

  .purchase-track-body {
    padding: 0.8rem;
  }

  .purchase-track-search {
    display: flex;
    align-items: center;
    height: 2.625rem;
    overflow: hidden;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .purchase-track-search:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .purchase-track-search > i {
    flex: 0 0 2.25rem;
    width: 2.25rem;
    color: #8c9aad;
    text-align: center;
  }

  .purchase-track-search input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.76rem;
    font-weight: 650;
  }

  .purchase-track-search button {
    display: inline-grid;
    flex: 0 0 2.5rem;
    width: 2.5rem;
    height: 100%;
    padding: 0;
    place-items: center;
    border: 0;
    border-inline-start: 1px solid #dfe6ef;
    background: #edf4ff;
    color: var(--purchase-primary);
    cursor: pointer;
  }

  .purchase-track-list {
    display: grid;
    gap: 0.35rem;
    max-height: 22rem;
    margin-top: 0.75rem;
    overflow-y: auto;
  }

  .purchase-track-account {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    min-height: 3.25rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid #e4e9f0;
    border-radius: 0.6rem;
    background: #ffffff;
    color: #26364b;
    text-align: start;
    cursor: pointer;
  }

  .purchase-track-account:hover {
    border-color: #cddbf0;
    background: #f5f9ff;
  }

  .purchase-track-account__icon {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #edf4ff;
    color: var(--purchase-primary);
  }

  .purchase-track-account__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.05rem;
  }

  .purchase-track-account__copy strong {
    overflow: hidden;
    font-size: 0.75rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-track-account__copy small {
    overflow: hidden;
    color: #8794a7;
    font-size: 0.61rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-track-account__arrow {
    flex-shrink: 0;
    color: #a2adbc;
    font-size: 0.58rem;
  }

  .purchase-track-empty {
    display: grid;
    min-height: 10rem;
    place-items: center;
    align-content: center;
    gap: 0.4rem;
    color: #8794a7;
  }

  .purchase-track-empty span {
    display: inline-grid;
    width: 2.8rem;
    height: 2.8rem;
    place-items: center;
    border-radius: 0.7rem;
    background: #f1f5f9;
    font-size: 1rem;
  }

  .purchase-track-empty strong {
    font-size: 0.72rem;
    font-weight: 750;
  }

  .purchase-track-footer {
    display: flex;
    justify-content: flex-end;
    padding: 0.65rem 0.8rem;
    border-top: 1px solid var(--purchase-border-soft);
    background: #fbfcfe;
  }

  .purchase-track-footer button {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 2.2rem;
    padding-inline: 0.75rem;
    border: 1px solid #d8e0ea;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #526176;
    font-size: 0.68rem;
    font-weight: 750;
    cursor: pointer;
  }

  .purchase-account-view-dialog {
    width: min(96vw, 72rem);
  }

  .purchase-account-view-modal {
    display: flex;
    flex-direction: column;
    max-height: calc(100dvh - 2rem);
  }

  .purchase-account-view-body {
    min-height: 0;
    padding: 0.75rem;
    overflow-y: auto;
  }

  /* RTL */

  :global(html[dir='rtl']) .purchase-supplier-balance__arrow,
  :global(html[dir='rtl']) .purchase-supplier-option__arrow,
  :global(html[dir='rtl']) .purchase-track-account__arrow {
    transform: scaleX(-1);
  }

  /* Responsive */

  @media (max-width: 1200px) {
    .purchase-details-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .purchase-field--supplier {
      grid-column: span 2;
    }
  }

  @media (max-width: 991.98px) {
    .purchase-page-header {
      align-items: flex-start;
    }

    .purchase-details-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .purchase-field--supplier {
      grid-column: span 1;
    }

    .purchase-lower-grid {
      grid-template-columns: 1fr;
    }

    .purchase-description-body textarea {
      min-height: 7rem;
    }
  }

  @media (max-width: 767.98px) {
    .purchase-create-page {
      gap: 0.75rem;
      padding-bottom: 0.75rem;
    }

    .purchase-page-header {
      flex-direction: column;
      padding: 0.8rem;
    }

    .purchase-page-header__actions,
    .purchase-supplier-balance {
      width: 100%;
    }

    .purchase-details-grid {
      grid-template-columns: 1fr;
      padding: 0.8rem;
    }

    .purchase-field--supplier {
      grid-column: auto;
    }

    .purchase-section-header {
      padding-inline: 0.8rem;
    }

    .purchase-payment-body {
      grid-template-columns: 1fr;
      padding: 0.8rem;
    }

    .purchase-payment-methods,
    .purchase-treasury-status {
      grid-column: auto;
    }

    .purchase-actions {
      align-items: stretch;
      flex-direction: column;
      padding: 0.65rem;
    }

    .purchase-actions__status {
      display: none;
    }

    .purchase-actions__buttons {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }

    .purchase-action-button {
      width: 100%;
      min-width: 0;
      padding-inline: 0.6rem;
    }
  }

  @media (max-width: 480px) {
    .purchase-page-icon,
    .purchase-section-icon {
      display: none;
    }

    .purchase-page-meta {
      flex-wrap: wrap;
    }

    .purchase-payment-methods {
      grid-template-columns: 1fr;
    }

    .purchase-actions__buttons {
      grid-template-columns: 1fr;
    }

    .purchase-track-layer,
    .purchase-account-view-layer {
      padding: 0.45rem;
    }

    .purchase-account-view-modal {
      max-height: calc(100dvh - 0.9rem);
    }
  }
</style>
