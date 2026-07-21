<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, tick } from 'svelte';
  import SaleItemsTable from './SaleItemsTable.svelte';
  import AccountModal from '../accounts/AccountModal.svelte';
  import { applySale } from '../../lib/inventory/inventoryService.js';
  import FilterSelect from '../../components/common/FilterSelect.svelte';
  import AppDatePicker from '../../components/common/AppDatePicker.svelte';

  import { toast } from '../../ToastUI/toast.js';
  import { push } from 'svelte-spa-router';
  import AccountView from '../accounts/AccountView.svelte';

  import { calculateProductStock } from '../stocktransactions/calculateStock.js';
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { showDate, setDatePickers } from '../../calendar.js';
  let accountModalRef;

  import { calculateRemainingAndBenefit } from './SalesHelper.js';

  $: enable_due_date = $settings_all.find((s) => s.key === 'enable_due_date')?.value == 1;

  $: default_sale_description = $settings_all.find((s) => s.key === 'default_sale_description')?.value || '';
  $: enable_smart_description = $settings_all.find((s) => s.key === 'enable_smart_description')?.value == 1;

  let date = new Date().toISOString().slice(0, 10);
  let due_date = null;

  $: if (enable_due_date && !due_date) {
    due_date = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  function handleDateChange(inputName, value) {
    if (inputName === 'date') date = value;
    if (inputName === 'due_date') due_date = value;
  }

  export let saleId = null;
  export let accountId = null;

  $: saleId = saleId == 0 ? null : saleId;

  let showAccountModal = false;

  let warehouses = [];
  let customers = [];
  let currencies = [];
  let settings = [];
  let accountTypes = [];
  let invoice_index = 0;

  let selected_account_id;

  $: if (form.account_id) {
    selected_account_id = form.account_id;
  }
  let invoice_index_prefix = 'INV-';

  let journals = [];

  let items = [];

  let form = {
    warehouse_id: '',
    account_id: '',
    sale_type: '',
    invoice_number: '',
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: null,
    description: $settings_all.find((s) => s.key === 'default_sale_description')?.value || '',
    currency: '',
    invoice_status: 'draft',
    status: 1,
  };

  $: if (accountId) {
    form.account_id = Number(accountId);
  }

  $: form.invoice_date = date;
  $: form.due_date = due_date;

  let treasury_balance = {};
  async function calculateTreasuryBalance() {
    let treasuryAccount = await db.accounts
      .where('code')
      .equals('TREASURY')
      .and((a) => a.status === 1)
      .first();
    if (!treasuryAccount) return;
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
  }

  let loading = false;

  let paymentAmount = null;
  let paymentDescription = '';
  let paymentCurrency = '';

  let modalRef;
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

  let defaultCurrency = 'AFN';
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
    warehouses = await db.warehouses.where('status').equals(1).toArray();
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
    form.warehouse_id = warehouses.length > 0 ? warehouses[0].id : '';
    currencies = await db.currencies.where('status').equals(1).toArray();
    invoice_index = Number(
      (
        await db.settings
          .where('key')
          .equals('invoice_index')
          .and((s) => s.status === 1)
          .first()
      )?.value,
    );
    invoice_index_prefix =
      (
        await db.settings
          .where('key')
          .equals('invoice_index_prefix')
          .and((s) => s.status === 1)
          .first()
      )?.value || 'INV-';
    form.invoice_number = invoice_index_prefix + invoice_index || '';
    accountTypes = await db.account_types
      .where('id')
      .equals(4)
      .and((s) => s.status === 1)
      .toArray();
    defaultCurrency = currencies.find((c) => c.isDefault == 1);
    if (defaultCurrency && !form.currency) form.currency = defaultCurrency.code;

    if (currencies.length) selectedCurrencyId = currencies.find((c) => c.isDefault)?.id || currencies[0].id;

    paymentCurrency = form.currency;
    if (saleId) await loadSale(saleId);
    await calculateTreasuryBalance();
    setDatePickers(handleDateChange, componentRoot);
    await tick();
    initDropdowns();
  });
  import TiptapEditor from '../../TiptapEditor.svelte';
  let componentRoot;
  async function loadSale(id) {
    try {
      const sale = await db.sales.where({ id: Number(id), invoice_status: 'draft', status: 1 }).first();
      if (!sale) {
        push('/dashboard/sales');
        return;
      }

      form = {
        warehouse_id: sale.warehouse_id,
        account_id: sale.account_id,
        sale_type: sale.sale_type,
        invoice_number: sale.invoice_number,
        due_date: sale.due_date,
        invoice_date: sale.invoice_date.slice(0, 10),
        description: sale.description,
        currency: sale.currency,
        invoice_status: sale.invoice_status,
        status: sale.status,
      };

      date = sale.invoice_date.slice(0, 10);
      form.invoice_date = date;
      discount_amount = Number(sale.discount_amount || 0);
      discount_type = sale.discount_type || 'fixed';
      expense_amount = Number(sale.expense_amount || 0);

      
    selectedCurrency = currencies.find((c) => c.code === sale.currency) || currencies.find((c) => c.isDefault == 1);
    selectedCurrencyId = selectedCurrency?.id;
    paymentCurrency = sale.currency || paymentCurrency;

      const saleItems = (
        await db.sale_items
          .where('sale_id')
          .equals(Number(id))
          .and((item) => item.status === 1)
          .toArray()
      ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const productIds = saleItems.map((i) => i.product_id);
      items = saleItems.map((i) => {
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
      toast.error(t('Error'), t('Failed to load sale. Please try again.'));
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
  let discount_type = 'fixed';
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

  function getMaxPaymentAmount() {
    if (!payableAmount) return 0;
    if (!paymentCurrency || !form.currency || paymentCurrency === form.currency) {
      return payableAmount;
    }
    return exchangeRate(payableAmount, form.currency, paymentCurrency);
  }

  function initDropdowns() {
    if (!window.mdb || !componentRoot) return;
    componentRoot.querySelectorAll('.dropdown-toggle').forEach((el) => {
      const existing = window.mdb.Dropdown.getInstance(el);
      if (existing) existing.dispose();
      new window.mdb.Dropdown(el);
    });
  }

  $: if (form.account_id === WALKIN?.id) {
    paymentAmount = payableAmount;
  }

  async function saveSale(confirm = false) {
    if (!form.warehouse_id || !form.account_id || items.length === 0) {
      toast.error(t('Validation Error'), t('Warehouse, Customer and at least one Item are required.'));
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
          'sales',
          'sale_items',
          'sale_payments',
          'warehouse_products',
          'journals',
          'accounts',
          'stock_batches',
          'batch_consumptions',
          'stock_consumption_returns',
          'inventory_operations',
          'settings',
          'stock_transactions',
          'activity_logs',
          'products',
          'product_units',
        ],
        async (tx) => {
          let id = Number(saleId);

          if (id) {
            savedId = id;
            // Update existing draft
            let oldSale = await db.sales.get(id);
            await db.sales.update(id, {
              warehouse_id: form.warehouse_id,
              account_id: form.account_id,
              sale_type: form.sale_type,
              invoice_number: form.invoice_number,
              invoice_date: form.invoice_date,
              due_date: form.due_date,
              description: form.description,
              discount_amount: discount_amount || 0,
              discount_type: discount_type || 'fixed',
              currency: form.currency,
              invoice_status: confirm ? 'confirmed' : 'draft',
              status: form.status,
              total_amount: payableAmount,
              expense_amount: expense_amount || 0,
              version: oldSale.version ? Number(oldSale.version) + 1 : 2,
            });
            await db.sale_items
              .where('sale_id')
              .equals(id)
              .modify((item) => {
                item.status = 0;
              });

            await logActivity({
              user_id: parseInt(localStorage.getItem('user_id')) || 0,
              action: 'update',
              table_name: 'sales',
              entity_id: id,
              old_values: JSON.stringify(oldSale),
              new_values: JSON.stringify({
                warehouse_id: form.warehouse_id,
                account_id: form.account_id,
                sale_type: form.sale_type,
                invoice_number: form.invoice_number,
                invoice_date: form.invoice_date,
                due_date: form.due_date,
                discount_amount: discount_amount || 0,
                discount_type: discount_type || 'fixed',
                expense_amount: expense_amount || 0,
                description: form.description,
                currency: form.currency,
                invoice_status: confirm ? 'confirmed' : 'draft',
                status: form.status,
                total_amount: payableAmount,
              }),
              description: `Updated sale #${id}`,
            });
          } else {
            id = await db.sales.add({
              warehouse_id: form.warehouse_id,
              account_id: form.account_id,
              sale_type: form.sale_type,
              invoice_number: form.invoice_number,
              invoice_date: form.invoice_date,
              due_date: form.due_date,
              description: form.description,
              discount_amount: discount_amount || 0,
              discount_type: discount_type || 'fixed',
              expense_amount: expense_amount || 0,
              currency: form.currency,
              invoice_status: confirm ? 'confirmed' : 'draft',
              status: form.status,
              total_amount: payableAmount,
              version: 1,
              created_at: new Date().toISOString(),
            });

            savedId = id;
            await db.settings
              .where('key')
              .equals('invoice_index')
              .modify((setting) => {
                setting.value = String(Number(setting.value || 0) + 1);
              });
            await logActivity({
              user_id: parseInt(localStorage.getItem('user_id')) || 0,
              action: 'create',
              table_name: 'sales',
              entity_id: id,
              old_values: null,
              new_values: JSON.stringify({
                warehouse_id: form.warehouse_id,
                account_id: form.account_id,
                sale_type: form.sale_type,
                invoice_number: form.invoice_number,
                invoice_date: form.invoice_date,
                due_date: form.due_date,
                description: form.description,
                discount_amount: discount_amount || 0,
                discount_type: discount_type || 'fixed',
                currency: form.currency,
                invoice_status: confirm ? 'confirmed' : 'draft',
                status: form.status,
                total_amount: payableAmount,
                expense_amount: expense_amount || 0,
              }),
              description: `Created sale #${id}`,
            });
          }
          for (let item of items) {
            const saleItemId = await db.sale_items.add({
              sale_id: id,
              product_id: item.product_id,
              product_unit_id: item.product_unit_id,
              quantity: item.quantity,
              buy_price: Number(item.buy_price || 0),
              buy_price_currency: item.buy_price_currency || item.currency || form.currency,
              unit_price: item.calculated_price,
              discount_amount: 0,
              discount_type: 'fixed',
              currency: item.currency,
              subtotal: item.subtotal,
              fifo_cost: 0,
              profit: 0,
              status: 1,
            });

            if (confirm && (!saleId || form.invoice_status !== 'confirmed')) {
              const product = products.find((p) => p.id == item.product_id);
              const result = await applySale(tx, {
                saleId: id,
                saleItemId,
                item,
                warehouseId: form.warehouse_id,
                saleDate: form.invoice_date,
                saleCurrency: form.currency,
                product,
              });

              if (!result.skipped) {
                await db.sale_items.update(saleItemId, {
                  fifo_cost: Number(result.fifo_cost || result.cogs || 0),
                  profit: Number(result.profit || 0),
                  cogs: result.cogs,
                  average_unit_cost: result.averageUnitCost,
                  gross_profit: result.gross_profit,
                });
              }

              addedItems.push(item);
            }
          }
          if (confirm && (!saleId || form.invoice_status !== 'confirmed')) {
            const receivableAccount = await db.accounts.where('code').equals('RECEIVABLE').first();

            if (!receivableAccount) {
              throw new Error('RECEIVABLE account not found');
            }

            await db.journals.add({
              date: form.invoice_date,
              reference_id: saleId || id,
              reference_type: 'sale',
              description: `Sale Invoice #${form.invoice_number}`,
              currency: form.currency,
              first_entry_account: form.account_id,
              first_entry_debit: payableAmount,
              first_entry_credit: 0,
              second_entry_account: receivableAccount.id,
              second_entry_debit: 0,
              second_entry_credit: payableAmount,
              status: 1,
            });
          }
          if (confirm && paymentAmount && Number(paymentAmount) > 0) {
            console.log(id);
            const mySale = await db.sales.where('id').equals(Number(id)).first();
            console.log(mySale);
            let payId = await db.sale_payments.add({
              sale_id: id,
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
              table_name: 'sale_payments',
              entity_id: payId,
              old_values: null,
              new_values: JSON.stringify({
                sale_id: id,
                account_id: second_entry_account,
                amount: Number(paymentAmount),
                currency: paymentCurrency,
                payment_date: new Date().toISOString(),
                description: paymentDescription,
                status: 1,
              }),
              description: `Added payment of ${paymentAmount} ${paymentCurrency} for sale #${id}`,
            });

            const salesAccount = await db.accounts
              .where('code')
              .equals('SALES')
              .and((s) => s.status === 1)
              .first();
            if (!salesAccount) throw new Error('SALES account not found');
            const receivableAcct = await db.accounts
              .where('code')
              .equals('RECEIVABLE')
              .and((s) => s.status === 1)
              .first();
            if (!receivableAcct) throw new Error('RECEIVABLE account not found');
            const treasuryAcct = await db.accounts
              .where('code')
              .equals('TREASURY')
              .and((s) => s.status === 1)
              .first();
            if (!treasuryAcct) throw new Error('TREASURY account not found');

            // journal for sales/receivable
            await db.journals.add({
              date: new Date().toISOString(),
              reference_id: payId,
              reference_type: 'sale_payment',
              description: `Payment for Sales Invoice`,
              currency: paymentCurrency,
              first_entry_account: salesAccount.id,
              first_entry_debit: 0,
              first_entry_credit: Number(paymentAmount),
              second_entry_account: receivableAcct.id,
              second_entry_debit: Number(paymentAmount),
              second_entry_credit: 0,
              status: 1,
            });

            // journal for customer/treasury
            await db.journals.add({
              date: new Date().toISOString(),
              reference_id: payId,
              reference_type: 'sale_payment',
              description: `Payment for Sales Invoice`,
              currency: paymentCurrency,
              first_entry_account: mySale.account_id,
              first_entry_debit: 0,
              first_entry_credit: Number(paymentAmount),
              second_entry_account: second_entry_account,
              second_entry_debit: Number(paymentAmount),
              second_entry_credit: 0,
              status: 1,
            });
          }
        },
      );

      await calculateRemainingAndBenefit(savedId);
      for (const item of addedItems) {
        await calculateProductStock(Number(item.product_id));
      }
      form.invoice_status = confirm ? 'confirmed' : 'draft';
      toast.success(t('Success'), confirm ? t('Sale Confirmed.') : t('Draft Saved.'));
      resetForm();
      push('/dashboard/sales');
    } catch (err) {
      console.error(err);
      toast.error(t('Error'), t('Failed to save sale. Please try again.'));
    }

    loading = false;
  }

  function resetForm() {
    date = new Date().toISOString().slice(0, 10);
    due_date = null;
    form = {
      ...form,
      warehouse_id: '',
      account_id: '',
      sale_type: '',
      invoice_number: '',
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: null,
      description: $settings_all.find((s) => s.key === 'default_sale_description')?.value || '',
    };
    items = [];
    paymentAmount = null;
    paymentDescription = '';
    paymentCurrency = form.currency;
  }

  async function deductFromWarehouse(item) {
    const warehouseId = Number(form.warehouse_id);
    const productId = Number(item.product_id);
    const productUnitId = Number(item.product_unit_id);

    const existing = await db.warehouse_products
      .where({
        warehouse_id: warehouseId,
        product_id: productId,
        status: 1,
      })
      .first();

    if (existing) {
      await db.warehouse_products.update(existing.id, {
        quantity: Math.max((existing.quantity || 0) - Number(item.quantity), 0),
      });
    } else {
      await db.warehouse_products.add({
        warehouse_id: warehouseId,
        product_id: productId,
        product_unit_id: productUnitId,
        quantity: 0,
        status: 1,
      });
    }
  }

  async function addStockTransaction(item, sale_Id) {
    await db.stock_transactions.add({
      warehouse_id: Number(form.warehouse_id),
      product_id: Number(item.product_id),
      product_unit_id: Number(item.product_unit_id),
      reference_id: sale_Id,
      reference_type: 'sale',
      transaction_type: 'sale',
      quantity: Number(item.quantity),
      unit_cost: Number(item.calculated_price),
      total_cost: Number(item.subtotal),
      currency: item.currency,
      peer_price: Number(item.buy_price || 0),
      peer_currency: item.buy_price_currency || item.currency || form.currency,
      expiry_date: null,
      heaviness: null,
      date: form.invoice_date,
      description: `Stock deducted from Sale #${sale_Id}`,
      status: 1,
    });
  }

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

  let editCurrency = false;

  let selectedCurrency = null;
  let selectedCurrencyId = null;

  $: selectedCurrency = currencies.find((c) => c.id == selectedCurrencyId) || currencies[0];

  $: if (selectedCurrency) {
    form.currency = selectedCurrency.code;
  }
</script>

<svelte:window on:click={handleWindowClick} />

<div class="container-fluid mt-4 purchase-form-page" bind:this={componentRoot}>
  <div class="card shadow-2 purchase-form-card purchase-info-section">
    <div class="card-body">
      <h4 class="mb-4 purchase-form-title">
        <span>{saleId ? t('Edit Sale') : t('New Sale')}</span>
        {#if form.account_id}
          <button
            class="btn btn-link btn-sm purchase-balance-btn"
            on:click={() => {
              showAccountModal = true;
            }}>{@html calculatedBalance}</button>
        {/if}
      </h4>

      <div class="row g-3 purchase-form-fields">
        <div class="col-md-3">
          <FilterSelect variant="outline" label={t('Warehouse')} icon="bi-building"
            value={form.warehouse_id} options={[{value:'',label:t('Select Warehouse')},...warehouses.map((w)=>({value:w.id,label:w.name}))]}
            on:change={(event)=>(form.warehouse_id=event.detail)} />
        </div>
        <div class="col-md-3">
          <div class="position-relative">
            <div class="input-group input-group-sm w-100 purchase-unified-input-group purchase-unified-input-group--account">
              {#if form.account_id}
                <span
                  class="form-control form-control-sm purchase-account-selected-name"
                  role="button"
                  tabindex="0"
                  on:click={async () => {
                    form.account_id = '';
                    form_account_search = '';
                    showAccountDropdown = true;
                    filteredAccounts = customers;
                    await tick();
                    form_account_search_input?.focus();
                  }}
                  on:keydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.currentTarget.click();
                    }
                  }}>
                  {getAccountName(form.account_id)}
                </span>
              {:else}
                <input
                  type="text"
                  class="form-control form-control-sm purchase-account-search-input"
                  id="form_account_search"
                  bind:this={form_account_search_input}
                  bind:value={form_account_search}
                  placeholder={t('Select Customer')}
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
              {/if}
              <button
                class="btn btn-info btn-sm purchase-input-addon-btn purchase-account-quick-btn"
                type="button"
                title={t('Add Account')}
                aria-label={t('Add Account')}
                on:click={() => {
                  accountModalRef.openModal();
                }}>
                <i class="bi bi-plus-lg" aria-hidden="true"></i><span class="purchase-account-quick-btn__text">{t('Add')}</span>
              </button>
            </div>
            {#if showAccountDropdown && filteredAccounts.length > 0}
              <ul use:portal class="list-group purchase-form-dropdown" style={accountDropdownStyle}>
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
          <input readonly type="text" class="form-control form-control-sm" value="{t('Bill #')}: {form.invoice_number}" />
        </div>
        <div class="col-md-2">
          <div class="purchase-app-datepicker">
            <AppDatePicker bind:value={date} required />
          </div>
        </div>
        <div class="col-md-2">
          {#if editCurrency}
            <div class="input-group input-group-sm purchase-unified-input-group">
              <div class="input-group-text">
                1 {t(selectedCurrency?.code) || t('AFN')} =
              </div>
              <input
                type="number"
                class="form-control form-control-sm"
                bind:value={selectedCurrency.exchangeRate}
                min="0"
                step="0.01" />
              <div class="input-group-text">
                {t(defaultCurrency?.code) || t('AFN')}
              </div>
              <button
                class="btn btn-success btn-sm purchase-input-addon-btn"
                type="button"
                on:click={async () => {
                  editCurrency = false;
                  await db.currencies.update(selectedCurrency.id, {
                    exchangeRate: Number(selectedCurrency.exchangeRate),
                  });
                  currencies = await db.currencies.where('status').equals(1).toArray();
                  await tick();
                  initDropdowns();
                }}><i class="bi bi-check"></i></button>
              <button
                class="btn btn-danger btn-sm purchase-input-addon-btn"
                type="button"
                on:click={() => (editCurrency = false)}><i class="bi bi-x"></i></button>
            </div>
          {:else}
            <FilterSelect variant="outline" label={t('Currency')} icon="bi-currency-exchange"
              value={selectedCurrencyId} options={currencies.map((cur)=>({value:cur.id,label:t(cur.code)}))}
              on:change={(event)=>(selectedCurrencyId=event.detail)} />
          {/if}
        </div>
      </div>
    </div>
  </div>

  <SaleItemsTable
    bind:items
    bind:currency={selectedCurrency}
    warehouse_id={form.warehouse_id}
    bind:selected_account_id />

  <div class="row">
    <div class="col-md-6">
      <div class="card shadow-2 mt-4 purchase-form-card sale-description-card">
        <div class="card-body">
          <p class="mb-3 fw-semibold purchase-payment-title"><i class="bi bi-card-text"></i>{t('Description')}</p>
          {#if enable_smart_description}
            <TiptapEditor bind:value={form.description} />
          {:else}
            <textarea
              class="form-control form-control-sm sale-description-input"
              rows="4"
              bind:value={form.description}
              placeholder={t('Description')}></textarea>
          {/if}
        </div>
      </div>
    </div>
    <div class="col-md-6">
      <div class="card shadow-2 mt-4 purchase-form-card purchase-form-card--payment">
        <div class="card-body">
          <p class="mb-3 fw-semibold purchase-payment-title"><i class="bi bi-wallet2"></i>{t('Add Payment')}</p>
          <div class="row g-3 align-items-end">
            <div class="col-md-4">
              <div class="input-group input-group-sm purchase-unified-input-group">
                <button
                  class="btn btn-sm purchase-input-addon-btn btn-{discount_type === 'fixed' ? 'light' : 'success'}"
                  type="button"
                  on:click={() => {
                    if (discount_type === 'percent') {
                      discount_amount = Number(total_amount * (discount_amount / 100)).toFixed(2);
                      discount_type = 'fixed';
                    } else {
                      discount_amount =
                        total_amount > 0 ? Number((discount_amount / total_amount) * 100).toFixed(2) : 0;
                      discount_type = 'percent';
                    }
                  }}><i class="bi bi-{discount_type === 'fixed' ? 'cash-stack' : 'percent'}"></i></button>
                <input
                  type="number"
                  id="discountAmount"
                  class="form-control form-control-sm"
                  placeholder={t('Discount')}
                  bind:value={discount_amount}
                  on:input={() => {
                    if (discount_amount === '') {
                      discount_amount = null;
                    } else if (discount_amount < 0) {
                      discount_amount = 0;
                    } else if (discount_amount > total_amount) {
                      discount_amount = total_amount;
                    } else {
                      discount_amount = Number(discount_amount);
                    }
                  }} />
                <span class="input-group-text">
                  {discount_type == 'fixed' ? '' : Number((total_amount * discount_amount) / 100 || 0).toFixed(2)}
                  {form.currency ? t(form.currency) : t('AFN')}
                </span>
              </div>
            </div>

            <div class="col-md-4">
              <div class="input-group input-group-sm purchase-unified-input-group">
                <input
                  type="number"
                  id="expenseAmount"
                  class="form-control form-control-sm"
                  placeholder={t('Expenses')}
                  bind:value={expense_amount}
                  on:input={() => {
                    if (!expense_amount) {
                      expense_amount = 0;
                    } else if (expense_amount < 0) {
                      expense_amount = 0;
                    } else {
                      expense_amount = Number(expense_amount);
                    }
                  }} />
                <span class="input-group-text">{form.currency ? t(form.currency) : t('AFN')}</span>
              </div>
            </div>

            <div class="col-md-4">
              <div class="input-group input-group-sm purchase-unified-input-group">
                <div class="input-group-text w-100 fw-bold">
                  {@html payableAmount >= 0
                    ? `<span class='text-${payableAmount > 0 ? 'dark' : 'danger'}'>${t('Payable')}: <span dir='ltr'>${payableAmount.toLocaleString(undefined, { maximumFractionDigits: 3 })}</span> ${t(form.currency)}</span>`
                    : `<span class='text-danger'>${t('Invalid discount')}</span>`}
                </div>
              </div>
            </div>

            <div class="col-md-12">
              <div class="purchase-payment-amount-row">
                <div class="input-group input-group-sm purchase-unified-input-group purchase-unified-input-group--inline">
                  <input
                    type="number"
                    id="paymentAmount"
                    readonly={form.account_id === WALKIN?.id}
                    class="form-control form-control-sm"
                    placeholder={t('Amount')}
                    bind:value={paymentAmount}
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
                        let treasury_balance_for_currency = treasury_balance[paymentCurrency] || 0;
                        if (paymentAmount > treasury_balance_for_currency * -1) {
                          paymentAmount = Number(treasury_balance_for_currency * -1).toFixed(2);
                        }
                      }
                    }} />
                </div>
                <div class="payment-currency-picker">
                  <button
                    id="paymentCurrencyDropdown"
                    class="payment-currency-picker__btn"
                    type="button"
                    aria-expanded={showPaymentCurrencyMenu}
                    aria-haspopup="listbox"
                    aria-label={t('Currency')}
                    on:click|stopPropagation={() => (showPaymentCurrencyMenu = !showPaymentCurrencyMenu)}>
                    {paymentCurrency ? t(paymentCurrency) : t(form.currency || 'AFN')}
                    <i class="bi bi-chevron-down" aria-hidden="true"></i>
                  </button>
                  {#if showPaymentCurrencyMenu}
                    <ul class="payment-currency-menu" role="listbox">
                      {#each currencies as cur}
                        <li role="option" aria-selected={paymentCurrency === cur.code}>
                          <button
                            class="payment-currency-menu__item"
                            class:selected={paymentCurrency === cur.code}
                            on:click|stopPropagation={() => selectPaymentCurrency(cur.code)}
                            type="button">
                            {t(cur.code)}
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </div>
              </div>
              <div class="input-group input-group-sm justify-content-end mt-3 purchase-unified-input-group">
                <input type="text" class="form-control" bind:value={paymentDescription} placeholder={t('Description')} />
                <button
                  id="second_entry_account_search"
                  class="btn btn-sm purchase-input-addon-btn text-center btn-{second_entry_account == track_ID ? 'danger' : 'light'}"
                  type="button"
                  on:click={() => {
                    filteredSecondAccounts = accounts;
                    showTrackModal = true;
                  }}><i class="bi bi-check-circle"></i>
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
                  id="second_entry_account_treasury"
                  class="btn btn-sm purchase-input-addon-btn treasury-action-btn text-center btn-{second_entry_account == treasury_ID ? 'success' : 'light'}"
                  type="button"
                  on:click={() => {
                    second_entry_account = treasury_ID;
                  }}><i class="bi bi-box"></i> {t('Treasury')}</button>
              </div>
              <div class="form-text mt-1 text-end mb-3 purchase-treasury-note">
                {#if second_entry_account == treasury_ID}
                  <span dir="ltr"
                    >{Number(treasury_balance[paymentCurrency] || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}</span>
                  {t(paymentCurrency)}
                {/if}
              </div>
              {#if showTrackModal}
              <div class="modal-backdrop fade show"></div>
              <div class="modal fade show d-block track-picker-layer" id="trackModal" tabindex="-1" aria-labelledby="trackModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered track-picker-dialog">
                  <div class="modal-content purchase-form-modal track-picker-modal">
                    <div class="modal-header track-picker-header">
                      <div class="track-picker-heading">
                        <span><i class="bi bi-person-check"></i></span>
                        <div><small>{t('Account')}</small><h5 class="modal-title" id="trackModalLabel">{t('Track')}</h5></div>
                      </div>
                      <button type="button" class="track-picker-close" aria-label="Close" on:click={() => (showTrackModal = false)}><i class="bi bi-x-lg"></i></button>
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
                            <div class="track-empty"><i class="bi bi-person-x"></i><span>{t('No accounts found')}</span></div>
                          {/if}
                        </div>
                      </div>
                    </div>
                    <div class="modal-footer track-picker-footer">
                      <button type="button" class="track-cancel-btn" on:click={() => (showTrackModal = false)}>
                        <i class="bi bi-x-lg"></i>
                        {t('Close')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="card shadow-2 mt-4 purchase-form-card purchase-form-actions-card">
    <div class="card-body d-flex justify-content-end align-items-center">
      <div>
        <button class="btn btn-secondary draft-action-btn me-2" on:click={() => saveSale(false)} disabled={loading}><i class="bi bi-file-earmark-text"></i>{t('Save Draft')}</button>
        <button class="btn btn-success confirm-action-btn" on:click={() => saveSale(true)} disabled={loading}><i class="bi bi-check-circle"></i>{t('Confirm Sale')}</button>
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

<AccountModal
  bind:this={modalRef}
  accountTypes={allAccountTypes}
  on:saved={async (e) => {
    accounts = await db.accounts.where({ status: 1 }).toArray();

    accounts = accounts.filter((a) => (a.account_status ? a.account_status == 'active' : a.status == 1));
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

{#if form?.account_id}
  {#if showAccountModal}
    <!-- Modal -->
    <div class="modal show d-block" id="accountModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-xl">
        <div class="modal-content purchase-form-modal">
          <div class="modal-header">
            <h5 class="modal-title">{t('Account')}</h5>
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

<style>
  .purchase-form-page {
    background: transparent;
    padding-bottom: 1.25rem;
    color: #0f172a;
  }

  .purchase-form-card {
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06) !important;
    overflow: hidden;
    background: #ffffff;
  }

  .purchase-form-card--payment,
  .purchase-form-card--payment :global(.card-body) {
    overflow: visible;
  }

  .purchase-form-title {
    color: #0f172a;
    font-weight: 800;
    font-size: 1.25rem;
    letter-spacing: -0.02em;
    padding-bottom: 0.75rem;
    margin-bottom: 1rem !important;
    border-bottom: 1px solid #f1f5f9;
  }

  .purchase-balance-btn {
    text-decoration: none;
    font-weight: 700;
    font-size: 0.72rem !important;
    color: #0f6efd !important;
    background: #eff6ff;
    border-radius: 6px;
    min-height: 28px !important;
    padding: 0.2rem 0.5rem !important;
    line-height: 1.1;
  }

  .purchase-balance-btn:hover {
    background: #dbeafe;
  }

  .purchase-form-fields :global(.form-control),
  .purchase-form-fields :global(.form-select),
  .purchase-form-page :global(.form-control),
  .purchase-form-page :global(.form-select) {
    border-color: #e2e8f0;
    border-radius: 10px;
    background: #ffffff;
    font-size: 0.84rem;
    font-weight: 600;
    color: #334155;
    min-height: 38px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }

  .purchase-form-fields :global(.form-control:focus),
  .purchase-form-fields :global(.form-select:focus),
  .purchase-form-page :global(.form-control:focus),
  .purchase-form-page :global(.form-select:focus) {
    border-color: #93c5fd;
    background: #ffffff;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
  }

  .purchase-form-fields :global(.input-group) {
    border-radius: 10px;
    overflow: hidden;
  }

  .purchase-unified-input-group.persianDatePicker {
    flex-direction: row !important;
    align-items: stretch !important;
  }

  .purchase-unified-input-group.persianDatePicker :global(.persian-date-text) {
    flex: 1 1 50%;
    min-width: 0;
    width: auto;
    border-inline-start: 1px solid #e2e8f0 !important;
    border-bottom: 0;
    justify-content: center;
    text-align: center;
    background: var(--erp-bg) !important;
    height: var(--erp-date-row-height);
    min-height: var(--erp-date-row-height);
    max-height: var(--erp-date-row-height);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.5;
  }

  .purchase-unified-input-group.persianDatePicker :global(.input-group-text.badge-warning) {
    flex: 0 0 auto;
    width: auto;
    border-inline-start: 0 !important;
    border-bottom: 0;
    border-inline-end: 1px solid #e2e8f0;
    justify-content: center;
    height: var(--erp-date-row-height);
    min-height: var(--erp-date-row-height);
    max-height: var(--erp-date-row-height);
  }

  .purchase-unified-input-group.persianDatePicker :global(.form-control) {
    flex: 1 1 50%;
    min-width: 0;
    width: auto;
    border-top: 0;
    height: var(--erp-date-row-height);
    min-height: var(--erp-date-row-height);
    max-height: var(--erp-date-row-height);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .purchase-unified-input-group {
    display: flex;
    align-items: stretch;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow: hidden;
    background: #ffffff;
  }

  .purchase-payment-amount-row {
    display: flex;
    align-items: stretch;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow: visible;
    background: #ffffff;
  }

  .purchase-payment-amount-row:focus-within {
    border-color: #93c5fd;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
  }

  .purchase-unified-input-group--inline {
    flex: 1;
    min-width: 0;
    border: 0;
    border-radius: 0;
    overflow: hidden;
  }

  .payment-currency-picker {
    position: relative;
    flex-shrink: 0;
    border-inline-start: 1px solid #e2e8f0;
  }

  .payment-currency-picker__btn {
    height: 100%;
    min-height: 31px;
    border: 0;
    background: #ffffff;
    padding: 0 0.75rem;
    font-weight: 700;
    font-size: 0.82rem;
    color: #475569;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    white-space: nowrap;
    cursor: pointer;
  }

  .payment-currency-picker__btn:hover {
    background: #f8fafc;
  }

  .payment-currency-menu {
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

  .payment-currency-menu__item {
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

  .payment-currency-menu__item:hover,
  .payment-currency-menu__item.selected {
    background: #eff6ff;
    color: #0f6efd;
  }

  .purchase-unified-input-group:focus-within {
    border-color: #93c5fd;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
  }

  .purchase-unified-input-group :global(.form-control) {
    border: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    flex: 1 1 auto;
    min-width: 0;
    background: #ffffff !important;
  }

  .purchase-unified-input-group :global(.form-control:focus) {
    border: 0 !important;
    box-shadow: none !important;
    background: #ffffff !important;
  }

  .purchase-unified-input-group :global(.input-group-text) {
    border: 0 !important;
    border-radius: 0 !important;
    background: #ffffff;
  }

  .purchase-unified-input-group :global(.input-group-text:not(:first-child)) {
    border-inline-start: 1px solid #e2e8f0 !important;
  }

  .purchase-unified-input-group :global(.input-group-text:first-child:not(:last-child)) {
    border-inline-end: 1px solid #e2e8f0 !important;
  }

  .purchase-unified-input-group :global(.input-group-text.bg-primary) {
    border-inline-end: 1px solid #0f6efd !important;
  }

  .purchase-unified-input-group :global(.purchase-input-addon-btn),
  .purchase-unified-input-group :global(.btn-info),
  .purchase-unified-input-group :global(.btn-danger),
  .purchase-unified-input-group :global(.btn-primary),
  .purchase-unified-input-group :global(.btn-light),
  .purchase-unified-input-group :global(.btn-success),
  .purchase-unified-input-group :global(.btn-secondary.dropdown-toggle) {
    border: 0 !important;
    border-inline-start: 1px solid #e2e8f0 !important;
    border-radius: 0 !important;
    padding: 0 0.65rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    align-self: stretch;
    box-shadow: none !important;
  }

  .purchase-unified-input-group :global(.btn-info) {
    background: #eff6ff !important;
    color: #0f6efd;
  }

  .purchase-unified-input-group :global(.btn-danger.purchase-input-addon-btn) {
    background: #fef2f2 !important;
    color: #dc2626 !important;
  }

  .purchase-unified-input-group :global(.btn-primary.purchase-input-addon-btn) {
    background: linear-gradient(180deg, #3b82f6 0%, #0f6efd 100%) !important;
    color: #ffffff !important;
    border-inline-start: 1px solid #0f6efd !important;
  }

  .purchase-unified-input-group :global(.purchase-input-addon-btn:first-child),
  .purchase-unified-input-group :global(.btn-info.purchase-input-addon-btn:first-child) {
    border-inline-start: 0 !important;
  }

  .purchase-unified-input-group--account {
    overflow: hidden;
  }

  .purchase-unified-input-group--account :global(.purchase-account-search-input),
  .purchase-unified-input-group--account .purchase-account-selected-name {
    text-align: start;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    border: 0 !important;
    border-inline-end: 1px solid #dbe7f3 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: #ffffff !important;
  }

  .purchase-unified-input-group--account :global(.purchase-account-quick-btn) {
    display: inline-flex !important;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    flex: 0 0 auto;
    width: auto !important;
    min-width: auto !important;
    padding: 0 0.65rem !important;
    border: none !important;
    border-radius: 0 !important;
    background: #0f6efd !important;
    color: #ffffff !important;
    font-size: 0.72rem !important;
    font-weight: 700 !important;
    line-height: 1;
    white-space: nowrap;
    box-shadow: none !important;
  }

  .purchase-unified-input-group--account :global(.purchase-account-quick-btn:hover),
  .purchase-unified-input-group--account :global(.purchase-account-quick-btn:focus) {
    background: #1d4ed8 !important;
    color: #ffffff !important;
  }

  .purchase-unified-input-group--account :global(.purchase-account-quick-btn i),
  .purchase-account-quick-btn__text {
    display: inline-block;
    flex-shrink: 0;
    white-space: nowrap;
    line-height: 1;
    border: none;
  }

  .purchase-account-selected-name {
    display: block;
    padding: 0.375rem 0.75rem;
    font-weight: 700;
    font-size: 0.84rem;
    color: #334155;
    cursor: pointer;
    min-height: 31px;
    line-height: 1.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .purchase-account-selected-name:hover {
    background: #f8fafc !important;
  }

  .purchase-unified-input-group :global(.btn-secondary.dropdown-toggle) {
    background: #ffffff !important;
    color: #475569;
    font-weight: 700;
  }

  .purchase-form-fields :global(.input-group-text:not(.persian-date-text)) {
    border-color: #e2e8f0;
    background: #f1f5f9;
    font-weight: 700;
    font-size: 0.78rem;
    color: #64748b;
  }

  .purchase-form-fields :global(.input-group-text.bg-primary) {
    background: linear-gradient(180deg, #3b82f6 0%, #0f6efd 100%) !important;
    border-color: #0f6efd;
  }

  .purchase-form-fields :global(.btn-info) {
    background: #eff6ff;
    border-color: #bfdbfe;
    color: #0f6efd;
  }

  .purchase-form-fields :global(.btn-secondary.dropdown-toggle) {
    border-radius: 10px;
    font-weight: 700;
    background: #ffffff !important;
    background-color: #ffffff !important;
    border-color: #e2e8f0;
    color: #475569;
  }

  .purchase-form-page :global(textarea.form-control) {
    min-height: 72px;
    resize: vertical;
    background: #ffffff;
  }

  .purchase-form-page :global(input.form-control),
  .purchase-form-page :global(select.form-select),
  .purchase-form-page :global(textarea.form-control),
  .purchase-form-fields :global(input.form-control),
  .purchase-form-fields :global(select.form-select),
  .purchase-form-page :global(.form-outline .form-control),
  .purchase-form-page :global(.form-outline input),
  .purchase-form-page :global(.input-group > .form-control),
  .purchase-form-page :global(.input-group .form-outline .form-control) {
    background-color: #ffffff !important;
    background: #ffffff !important;
  }

  .purchase-form-page :global(.input-group .btn-secondary.dropdown-toggle) {
    background-color: #ffffff !important;
    background: #ffffff !important;
    border-color: #e2e8f0;
    color: #475569;
    font-weight: 700;
  }

  .purchase-form-page :global(.input-group .form-control::placeholder) {
    color: #94a3b8;
  }

  .purchase-form-page :global(.input-group .btn-light) {
    background-color: #ffffff !important;
    background: #ffffff !important;
    border-color: #e2e8f0;
    color: #475569;
    font-weight: 600;
  }

  .purchase-form-page :global(.form-outline .form-control:focus),
  .purchase-form-page :global(.form-outline input:focus) {
    background-color: #ffffff !important;
    background: #ffffff !important;
  }

  .purchase-form-dropdown {
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
  }

  .purchase-form-dropdown :global(.list-group-item) {
    border: 0;
    font-weight: 600;
    font-size: 0.82rem;
  }

  .purchase-form-dropdown :global(.list-group-item:hover) {
    background: #eff6ff;
    color: #0f6efd;
  }

  .purchase-payment-title {
    color: #0f172a;
    font-size: 0.95rem;
    font-weight: 800;
    letter-spacing: -0.01em;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .purchase-payment-title::before {
    content: '';
    width: 4px;
    height: 18px;
    border-radius: 999px;
    background: linear-gradient(180deg, #3b82f6, #0f6efd);
  }

  .purchase-form-page :global(.btn-danger),
  .purchase-form-page :global(.btn-light),
  .purchase-form-page :global(.btn-success.btn-sm) {
    border-radius: 10px;
    font-weight: 700;
  }

  .purchase-form-page :global(.btn-success.btn-sm) {
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    color: #047857;
  }

  .purchase-form-page :global(.btn-danger.btn-sm) {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
  }

  .purchase-form-modal {
    border-radius: 16px;
    border: 1px solid #e2e8f0;
    overflow: hidden;
    box-shadow: 0 24px 48px rgba(15, 23, 42, 0.16);
  }

  .purchase-form-modal :global(.modal-header) {
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
  }

  .purchase-form-modal :global(.modal-title) {
    font-weight: 800;
    color: #0f172a;
  }

  .purchase-form-actions-card :global(.btn-secondary) {
    border-radius: 10px;
    font-weight: 700;
    min-width: 130px;
    background: #fff;
    border-color: #e2e8f0;
    color: #475569;
  }

  .purchase-form-actions-card :global(.btn-success) {
    border-radius: 10px;
    font-weight: 700;
    min-width: 150px;
    background: linear-gradient(180deg, #22c55e 0%, #16a34a 100%);
    border: none;
    box-shadow: 0 4px 14px rgba(22, 163, 74, 0.28);
  }

  .purchase-form-actions-card :global(.btn-success:hover) {
    background: linear-gradient(180deg, #16a34a 0%, #15803d 100%);
  }

  .purchase-form-actions-card :global(.draft-action-btn),
  .purchase-form-actions-card :global(.draft-action-btn:hover),
  .purchase-form-actions-card :global(.draft-action-btn:focus) {
    color: #fff;
    background: #f59e0b;
    border-color: #f59e0b;
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25);
  }

  .purchase-form-actions-card :global(.draft-action-btn:hover) {
    background: #d97706;
    border-color: #d97706;
  }

  .purchase-treasury-note {
    font-size: 0.78rem;
    font-weight: 600;
    color: #64748b;
    background: #ffffff;
    border: 1px solid #eef2f7;
    border-radius: 8px;
    padding: 0.35rem 0.5rem;
  }

  /* Match the compact 100%-zoom density used by purchase and index pages. */
  .purchase-form-page {
    width: 100%;
    max-width: var(--content-max-width);
    margin: 0 auto !important;
    padding: 0 0 var(--section-gap);
    font-size: var(--app-font-sm);
  }
  .purchase-form-card {
    border-radius: var(--card-radius);
    box-shadow: var(--erp-shadow-sm) !important;
  }
  .purchase-form-page > .purchase-form-card:first-child,
  .purchase-form-page > .purchase-form-card:first-child :global(.card-body){position:relative;z-index:30;overflow:visible!important}
  .purchase-form-card :global(.card-body) { padding: var(--card-padding) !important; }
  .purchase-info-section > :global(.card-body) {
    padding: var(--card-padding) !important;
    padding-inline: clamp(0.85rem, 1vw, 1rem) !important;
  }
  .purchase-form-title {
    margin-bottom: var(--section-gap) !important;
    padding-bottom: .5rem;
    font-size: var(--app-heading-sm);
  }
  .purchase-form-fields {
    --bs-gutter-x: var(--section-gap);
    --bs-gutter-y: var(--section-gap);
  }
  .purchase-form-fields > [class*='col-'] { min-width: 0; }
  @media (min-width: 1200px) {
    .purchase-form-fields {
      display: grid;
      grid-template-columns:
        minmax(0, 1.05fr)
        minmax(0, 1.35fr)
        minmax(0, .8fr)
        minmax(0, 1.25fr)
        minmax(0, .75fr);
    }
    .purchase-form-fields > [class*='col-'] {
      width: auto;
      max-width: none;
      padding-inline: calc(var(--section-gap) / 2);
    }
  }
  @media (min-width: 768px) and (max-width: 1199.98px) {
    .purchase-form-fields {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
    .purchase-form-fields > [class*='col-'] {
      width: auto;
      max-width: none;
      padding-inline: calc(var(--section-gap) / 2);
    }
    .purchase-form-fields > :nth-child(1),
    .purchase-form-fields > :nth-child(2) { grid-column: span 3; }
    .purchase-form-fields > :nth-child(3),
    .purchase-form-fields > :nth-child(4),
    .purchase-form-fields > :nth-child(5) { grid-column: span 2; }
  }
  .purchase-form-fields .persianDatePicker :global(.gregorian-date-text),.purchase-form-fields .persianDatePicker :global(.persian-date-text){overflow:hidden;padding-inline:.3rem;font-size:.68rem!important;text-overflow:ellipsis;white-space:nowrap}.purchase-form-fields .persianDatePicker :global(.date-picker-icon){flex-basis:30px;width:30px;min-width:30px}
  .purchase-form-page :global(.form-control), .purchase-form-page :global(.form-select) {
    min-height: var(--control-height);
    height: var(--control-height);
    border-radius: var(--control-radius);
    font-size: var(--control-font);
  }
  .purchase-form-page :global(textarea.form-control) { height: auto; min-height: 3.5rem; }
  .purchase-unified-input-group, .purchase-payment-amount-row { border-radius: .5rem; }
  .purchase-unified-input-group.persianDatePicker :global(.form-control),
  .purchase-unified-input-group.persianDatePicker :global(.persian-date-text),
  .purchase-unified-input-group.persianDatePicker :global(.input-group-text.badge-warning) {
    height: var(--control-height);
    min-height: var(--control-height);
    max-height: var(--control-height);
    font-size: var(--control-font);
  }
  .purchase-form-page :global(.mt-4) { margin-top: var(--section-gap) !important; }
  .purchase-form-page :global(.mt-3) { margin-top: calc(var(--section-gap) * .8) !important; }
  .purchase-form-page :global(table) { font-size: var(--table-font-size); }
  .purchase-form-page :global(th), .purchase-form-page :global(td) { padding-top: .4rem; padding-bottom: .4rem; }
  .purchase-payment-title { margin-bottom: .6rem !important; font-size: .85rem; }
  .purchase-treasury-note { margin-bottom: .5rem !important; padding: .25rem .4rem; font-size: .72rem; }
  .purchase-form-actions-card { position: sticky; bottom: 0; z-index: 60; margin-bottom: .25rem; box-shadow: 0 -6px 18px rgba(15,23,42,.08) !important; }
  .purchase-form-actions-card :global(.card-body) { min-height: 3.4rem; padding: .5rem .75rem !important; }
  .purchase-form-actions-card :global(.btn-secondary), .purchase-form-actions-card :global(.btn-success) { min-width: 7rem; min-height: 2.25rem; padding: .4rem .75rem; border-radius: .5rem; font-size: .78rem; }

  @media (max-width: 767.98px) {
    .purchase-form-page {
      padding-bottom: .65rem;
      font-size: var(--app-font-size);
    }
    .purchase-form-fields > [class*='col-'] { width: 100%; }
    .purchase-info-section > :global(.card-body) {
      padding: 0.75rem !important;
    }
    .purchase-form-page :global(.form-control),
    .purchase-form-page :global(.form-select) {
      min-height: var(--control-height) !important;
      height: var(--control-height) !important;
    }
    .purchase-form-actions-card :global(.card-body) {
      justify-content: stretch !important;
    }
    .purchase-form-actions-card :global(.card-body > div) {
      display: grid;
      width: 100%;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: .5rem;
    }
    .purchase-form-actions-card :global(.btn) {
      width: 100%;
      min-width: 0 !important;
      margin: 0 !important;
    }
  }

  .purchase-form-fields :global(.form-control),
  .purchase-form-fields :global(.form-select),
  .purchase-form-fields :global(.filter-select),
  .purchase-form-fields :global(.filter-select__control),
  .purchase-form-fields .purchase-unified-input-group {
    border-radius: 4px !important;
  }

  .purchase-info-section .purchase-form-fields :global(.filter-select) {
    width: 100% !important;
    max-width: none !important;
    min-width: 0 !important;
  }

  .purchase-info-section .purchase-form-fields :global(.filter-select__control),
  .purchase-info-section .purchase-form-fields :global(.filter-select__trigger) {
    width: 100% !important;
    min-width: 0 !important;
  }

  .purchase-info-section .purchase-form-fields :global(.form-control),
  .purchase-info-section .purchase-form-fields :global(.form-select),
  .purchase-info-section .purchase-form-fields :global(.filter-select),
  .purchase-info-section .purchase-form-fields :global(.filter-select__control),
  .purchase-info-section .purchase-form-fields :global(.filter-select__trigger),
  .purchase-info-section .purchase-form-fields .purchase-unified-input-group,
  .purchase-info-section .purchase-form-fields .purchase-app-datepicker :global(.app-date-field),
  .purchase-info-section .purchase-form-fields .purchase-app-datepicker :global(input) {
    border-radius: 4px !important;
  }

  .purchase-info-section .purchase-form-fields :global(.filter-select__trigger) {
    height: var(--control-height) !important;
    min-height: var(--control-height) !important;
    max-height: var(--control-height) !important;
    padding: 0.45rem 0.75rem !important;
    border-radius: 4px !important;
    box-sizing: border-box;
  }

  .purchase-app-datepicker {
    width: 100%;
    min-width: 0;
  }

  .purchase-app-datepicker :global(.app-date-field) {
    gap: 0.2rem;
    border-radius: 4px !important;
  }

  .purchase-app-datepicker :global(input) {
    width: 100%;
    height: var(--control-height) !important;
    min-height: var(--control-height) !important;
    padding-inline: 0.55rem !important;
    border-radius: 4px !important;
    font-size: var(--control-font) !important;
  }

  .purchase-form-fields .purchase-unified-input-group.persianDatePicker {
    display: flex !important;
    flex-flow: row nowrap !important;
    align-items: stretch !important;
    height: var(--control-height) !important;
    min-height: var(--control-height) !important;
    max-height: var(--control-height) !important;
    border: 0 !important;
    overflow: hidden !important;
  }

  .purchase-form-fields .purchase-unified-input-group.persianDatePicker :global(.form-control),
  .purchase-form-fields .purchase-unified-input-group.persianDatePicker :global(.persian-date-text),
  .purchase-form-fields .purchase-unified-input-group.persianDatePicker :global(.input-group-text) {
    height: 100% !important;
    min-height: 0 !important;
    max-height: 100% !important;
    margin: 0 !important;
    border-radius: 4px !important;
  }

  .purchase-form-title,
  .purchase-payment-title i {
    color: #0f172a;
  }

  .purchase-payment-title i {
    color: #0f6efd;
  }

  .purchase-form-actions-card :global(.btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    border-radius: 4px;
  }

  .purchase-form-actions-card :global(.btn-success) {
    background: #059669;
    border-color: #059669;
  }

  .purchase-form-page {
    width: 100%;
    max-width: none;
    padding-bottom: 1rem;
  }

  .purchase-form-card {
    border: 1px solid #dfe6f0;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 5px 18px rgba(15, 23, 42, 0.045) !important;
  }

  .purchase-form-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom-color: #edf2f7;
  }

  .purchase-form-page > .row {
    --bs-gutter-x: 1rem;
  }

  .sale-description-card,
  .purchase-form-card--payment {
    height: calc(100% - 1rem);
    margin-top: 1rem !important;
  }

  .sale-description-input {
    min-height: 92px !important;
    resize: vertical;
  }

  .sale-description-card .purchase-payment-title::before,
  .purchase-form-card--payment .purchase-payment-title::before {
    background: #0f6efd;
  }

  .purchase-form-actions-card {
    margin-top: 1rem !important;
  }

  .purchase-form-actions-card :global(.card-body) {
    min-height: 64px;
  }

  .purchase-form-actions-card :global(.btn-secondary) {
    background: #fff;
    color: #334155;
  }

  .purchase-form-actions-card :global(.btn-success) {
    background: #059669;
    box-shadow: 0 4px 12px rgba(5, 150, 105, 0.2);
  }

  .purchase-form-actions-card :global(.draft-action-btn) {
    border: 1px solid #a7f3d0 !important;
    border-radius: 0.625rem !important;
    background: #ecfdf5 !important;
    color: #059669 !important;
    box-shadow: none;
  }

  .purchase-form-actions-card :global(.draft-action-btn:hover) {
    background: #d1fae5 !important;
    border-color: #6ee7b7 !important;
    color: #047857 !important;
  }

  .purchase-form-actions-card :global(.confirm-action-btn) {
    color: #fff !important;
    background: var(--bs-primary, #0f6efd) !important;
    border-color: var(--bs-primary, #0f6efd) !important;
    box-shadow: 0 4px 12px rgba(15, 110, 253, 0.22) !important;
  }

  .purchase-form-actions-card :global(.confirm-action-btn:hover) {
    background: #0b5ed7 !important;
    border-color: #0a58ca !important;
  }

  .purchase-form-page :global(.treasury-action-btn) {
    border: 1px solid #a7f3d0 !important;
    border-radius: 0.625rem !important;
    background: #ecfdf5 !important;
    color: #059669 !important;
    box-shadow: none !important;
  }

  .purchase-form-page :global(.treasury-action-btn:hover) {
    background: #d1fae5 !important;
    border-color: #6ee7b7 !important;
    color: #047857 !important;
  }
</style>
