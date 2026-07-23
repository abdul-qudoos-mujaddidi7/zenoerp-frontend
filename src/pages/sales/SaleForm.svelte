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

  $: if (form.currency) {
    paymentCurrency = form.currency;
    paymentAmount = Math.max(0, Number(payableAmount || 0));
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

  let calculatedBalance = null;
  $: if (form.account_id && form.currency && allJournals) {
    calculatedBalance = calculateAccountBalance(form.account_id, form.currency);
  } else {
    calculatedBalance = null;
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
    return {
      amount: Number(balance[currency] || 0),
      currency,
    };
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
    const rect =
      form_account_search_input.closest('.sale-customer-input')?.getBoundingClientRect() ||
      form_account_search_input.getBoundingClientRect();
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

<div class="sale-create-page" bind:this={componentRoot} dir={t('dir')}>
 

  <section class="sale-section sale-details-section">
    <header class="sale-section-header">
      <div class="sale-section-heading">
        <span class="sale-section-icon" aria-hidden="true">
          <i class="bi bi-file-earmark-text"></i>
        </span>

        <div>
          <h2>{t('Sale Details')}</h2>
        </div>
      </div>

      <span class="sale-required-note">
        <i class="bi bi-asterisk" aria-hidden="true"></i>
        {t('Required')}
      </span>
    </header>

    <div class="sale-details-grid">
      <div class="sale-field">
        <span class="sale-field-label">
          <i class="bi bi-building" aria-hidden="true"></i>
          {t('Warehouse')}
        </span>

        <FilterSelect
          variant="outline"
          label={t('Warehouse')}
          icon="bi-building"
          value={form.warehouse_id}
          options={[
            { value: '', label: t('Select Warehouse') },
            ...warehouses.map((w) => ({ value: w.id, label: w.name })),
          ]}
          on:change={(event) => (form.warehouse_id = event.detail)} />
      </div>

      <div class="sale-field sale-field--customer">
        <span class="sale-field-label">
          <i class="bi bi-person" aria-hidden="true"></i>
          {t('Customer')}
        </span>

        <div class="sale-customer-control position-relative">
          <div class="sale-customer-input">
            <span class="sale-customer-input__icon" aria-hidden="true">
              <i class="bi bi-person"></i>
            </span>

            {#if form.account_id}
              <button
                type="button"
                class="sale-selected-customer"
                on:click={async () => {
                  form.account_id = '';
                  form_account_search = '';
                  showAccountDropdown = true;
                  filteredAccounts = customers;
                  await tick();
                  form_account_search_input?.focus();
                }}>
                <span class="sale-selected-customer__identity">
                  <span class="sale-selected-customer__name">
                    {getAccountName(form.account_id)}
                  </span>

                  {#if calculatedBalance}
                    <span class="sale-selected-customer__divider" aria-hidden="true"></span>
                    <span
                      class="sale-selected-customer__balance"
                      class:is-negative={calculatedBalance.amount < 0}>
                      <b dir="ltr">
                        {calculatedBalance.amount.toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        })}
                      </b>
                      <small>{t(calculatedBalance.currency)}</small>
                    </span>
                  {/if}
                </span>
                <i class="bi bi-pencil-square" aria-hidden="true"></i>
              </button>
            {:else}
              <input
                id="form_account_search"
                bind:this={form_account_search_input}
                type="text"
                bind:value={form_account_search}
                placeholder={t('Select Customer')}
                autocomplete="off"
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
                    filteredAccounts = customers.filter((acc) => {
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
                    filteredAccounts = customers;
                  }
                }}
                on:blur={() =>
                  setTimeout(() => (showAccountDropdown = false), 150)} />
            {/if}

            <button
              type="button"
              class="sale-add-customer"
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
              class="sale-customer-dropdown"
              style={accountDropdownStyle}>
              {#each filteredAccounts as acc (acc.id)}
                <li>
                  <button
                    type="button"
                    class="sale-customer-option"
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
                    <span class="sale-customer-option__avatar">
                      <i class="bi bi-person" aria-hidden="true"></i>
                    </span>

                    <span class="sale-customer-option__copy">
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

                    <i class="bi bi-chevron-right sale-customer-option__arrow" aria-hidden="true"></i>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>

      <div class="sale-field">
        <span class="sale-field-label">
          <i class="bi bi-receipt" aria-hidden="true"></i>
          {t('Bill #')}
        </span>

        <div class="sale-readonly-field">
          <span dir="ltr">{form.invoice_number}</span>
          <i class="bi bi-lock-fill" aria-hidden="true"></i>
        </div>
      </div>

      <div class="sale-field">
        <span class="sale-field-label">
          <i class="bi bi-calendar3" aria-hidden="true"></i>
          {t('Date')}
        </span>

        <div class="sale-app-datepicker">
          <AppDatePicker bind:value={date} required />
        </div>
      </div>

      <div class="sale-field">
        <div class="sale-field-label-row">
          <span class="sale-field-label">
            <i class="bi bi-currency-exchange" aria-hidden="true"></i>
            {t('Currency')}
          </span>

          {#if !editCurrency && selectedCurrency}
            <button
              type="button"
              class="sale-currency-edit"
              title={t('Edit')}
              aria-label={t('Edit')}
              on:click={() => (editCurrency = true)}>
              <i class="bi bi-pencil-square" aria-hidden="true"></i>
            </button>
          {/if}
        </div>

        {#if editCurrency}
          <div class="sale-exchange-editor">
            <span>1 {t(selectedCurrency?.code || 'AFN')} =</span>

            <input
              type="number"
              bind:value={selectedCurrency.exchangeRate}
              min="0"
              step="0.01"
              aria-label={t('Exchange Rate')} />

            <span>{t(defaultCurrency?.code || 'AFN')}</span>

            <button
              type="button"
              class="sale-exchange-editor__save"
              aria-label={t('Save')}
              on:click={async () => {
                editCurrency = false;
                await db.currencies.update(selectedCurrency.id, {
                  exchangeRate: Number(selectedCurrency.exchangeRate),
                });
                currencies = await db.currencies.where('status').equals(1).toArray();
                await tick();
                initDropdowns();
              }}>
              <i class="bi bi-check-lg" aria-hidden="true"></i>
            </button>

            <button
              type="button"
              class="sale-exchange-editor__cancel"
              aria-label={t('Cancel')}
              on:click={() => (editCurrency = false)}>
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>
        {:else}
          <FilterSelect
            variant="outline"
            label={t('Currency')}
            icon="bi-currency-exchange"
            value={selectedCurrencyId}
            options={currencies.map((cur) => ({
              value: cur.id,
              label: t(cur.code),
            }))}
            on:change={(event) => (selectedCurrencyId = event.detail)} />
        {/if}
      </div>
    </div>
  </section>

  <SaleItemsTable
    bind:items
    bind:currency={selectedCurrency}
    warehouse_id={form.warehouse_id}
    bind:selected_account_id />

  <div class="sale-lower-grid">
    <section class="sale-section sale-description-section">
      <header class="sale-section-header sale-section-header--compact">
        <div class="sale-section-heading">
          <span class="sale-section-icon sale-section-icon--neutral" aria-hidden="true">
            <i class="bi bi-card-text"></i>
          </span>

          <div>
            <h2>{t('Description')}</h2>
            <p>{t('Description')}</p>
          </div>
        </div>
      </header>

      <div class="sale-description-body">
        {#if enable_smart_description}
          <div class="sale-rich-editor">
            <TiptapEditor bind:value={form.description} />
          </div>
        {:else}
          <textarea
            bind:value={form.description}
            rows="5"
            placeholder={t('Description')}></textarea>
        {/if}

        <span class="sale-description-hint">
          <i class="bi bi-info-circle" aria-hidden="true"></i>
          {t('Description')}
        </span>
      </div>
    </section>

    <section class="sale-section sale-payment-section">
      <header class="sale-section-header sale-section-header--compact">
        <div class="sale-section-heading">
          <span class="sale-section-icon sale-section-icon--green" aria-hidden="true">
            <i class="bi bi-wallet2"></i>
          </span>

       
            <h2>{t('Add Payment')}</h2>
         
        </div>

        {#if second_entry_account == treasury_ID}
          <span class="sale-payment-method-badge sale-payment-method-badge--treasury">
            <i class="bi bi-box" aria-hidden="true"></i>
            {t('Treasury')}
          </span>
        {:else if second_entry_account == track_ID}
          <span class="sale-payment-method-badge sale-payment-method-badge--track">
            <i class="bi bi-person-check" aria-hidden="true"></i>
            {t('Track')}
          </span>
        {/if}
      </header>

      <div class="sale-payment-body">
        <section class="sale-payment-panel sale-payment-details-panel">
          <header class="sale-payment-panel__header">
            <span class="sale-payment-panel__icon sale-payment-panel__icon--details">
              <i class="bi bi-receipt" aria-hidden="true"></i>
            </span>

            <div>
              <h3>{t('Payment Amount')}</h3>
              <p>{t('Discount')}, {t('Expenses')} &amp; {t('Description')}</p>
            </div>
          </header>

          <div class="sale-payment-summary-grid">
            <div class="sale-payment-adjustments">
            <label class="sale-payment-field">
              <span>{t('Discount')}</span>

              <div class="sale-payment-control sale-discount-control">
                <button
                  type="button"
                  class="sale-payment-toggle"
                  class:is-active={discount_type === 'percent'}
                  title={t('Discount')}
                  aria-label={t('Discount')}
                  on:click={() => {
                    if (discount_type === 'percent') {
                      discount_amount = Number(
                        total_amount * (discount_amount / 100),
                      ).toFixed(2);
                      discount_type = 'fixed';
                    } else {
                      discount_amount =
                        total_amount > 0
                          ? Number((discount_amount / total_amount) * 100).toFixed(2)
                          : 0;
                      discount_type = 'percent';
                    }
                  }}>
                  <i
                    class="bi bi-{discount_type === 'fixed'
                      ? 'cash-stack'
                      : 'percent'}"
                    aria-hidden="true"></i>
                </button>

                <input
                  id="discountAmount"
                  type="number"
                  min="0"
                  step="any"
                  bind:value={discount_amount}
                  placeholder="0.00"
                  on:input={() => {
                    if (discount_amount === '') {
                      discount_amount = null;
                    } else if (discount_amount < 0) {
                      discount_amount = 0;
                    } else if (
                      discount_type === 'fixed' &&
                      discount_amount > total_amount
                    ) {
                      discount_amount = total_amount;
                    } else if (
                      discount_type === 'percent' &&
                      discount_amount > 100
                    ) {
                      discount_amount = 100;
                    } else {
                      discount_amount = Number(discount_amount);
                    }
                  }} />

                <span class="sale-payment-suffix">
                  {#if discount_type === 'percent'}
                    {Number(
                      (total_amount * Number(discount_amount || 0)) / 100,
                    ).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  {/if}
                  {t(form.currency || 'AFN')}
                </span>
              </div>
            </label>

            <label class="sale-payment-field">
              <span>{t('Expenses')}</span>

              <div class="sale-payment-control">
                <i class="bi bi-receipt-cutoff sale-payment-control__icon" aria-hidden="true"></i>

                <input
                  id="expenseAmount"
                  type="number"
                  min="0"
                  step="any"
                  bind:value={expense_amount}
                  placeholder="0.00"
                  on:input={() => {
                    if (!expense_amount) {
                      expense_amount = 0;
                    } else if (expense_amount < 0) {
                      expense_amount = 0;
                    } else {
                      expense_amount = Number(expense_amount);
                    }
                  }} />

                <span class="sale-payment-suffix">
                  {t(form.currency || 'AFN')}
                </span>
              </div>
            </label>
          </div>

        </div>

        <label class="sale-payment-field">
          <span>{t('Description')}</span>

          <div class="sale-payment-description">
            <i class="bi bi-card-text" aria-hidden="true"></i>

            <input
              type="text"
              bind:value={paymentDescription}
              placeholder={t('Description')} />
          </div>
        </label>
        </section>

        <section class="sale-payment-panel sale-payment-method-panel">
          <header class="sale-payment-panel__header">
            <span class="sale-payment-panel__icon sale-payment-panel__icon--method">
              <i class="bi bi-credit-card" aria-hidden="true"></i>
            </span>

            <div>
              <h3>{t('Payment')}</h3>
              <p>{t('Treasury')} / {t('Track')}</p>
            </div>
          </header>

        <div class="sale-payment-methods">
          <button
            type="button"
            class="sale-payment-method"
            class:is-active={second_entry_account == track_ID}
            on:click={() => {
              filteredSecondAccounts = accounts;
              showTrackModal = true;
            }}>
            <span class="sale-payment-method__icon sale-payment-method__icon--track">
              <i class="bi bi-person-check" aria-hidden="true"></i>
            </span>

            <span class="sale-payment-method__copy">
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

            <span class="sale-payment-method__check">
              <i
                class="bi bi-{second_entry_account == track_ID
                  ? 'check-circle-fill'
                  : 'circle'}"
                aria-hidden="true"></i>
            </span>
          </button>

          <button
            type="button"
            class="sale-payment-method"
            class:is-active={second_entry_account == treasury_ID}
            on:click={() => (second_entry_account = treasury_ID)}>
            <span class="sale-payment-method__icon sale-payment-method__icon--treasury">
              <i class="bi bi-box" aria-hidden="true"></i>
            </span>

            <span class="sale-payment-method__copy">
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

            <span class="sale-payment-method__check">
              <i
                class="bi bi-{second_entry_account == treasury_ID
                  ? 'check-circle-fill'
                  : 'circle'}"
                aria-hidden="true"></i>
            </span>
          </button>
        </div>

        {#if second_entry_account == treasury_ID}
          <div class="sale-treasury-status">
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
        </section>

        <div class="sale-payable-card" class:is-invalid={payableAmount < 0}>
          <div class="sale-payable-card__overview">
            <span class="sale-payable-card__copy">
              <strong>{payableAmount >= 0 ? t('Payable') : t('Invalid discount')}</strong>
              <small>{t('Payment Amount')}</small>
            </span>

            {#if payableAmount >= 0}
              <span class="sale-payable-card__total">
                <span class="sale-payable-card__icon">
                  <i class="bi bi-calculator" aria-hidden="true"></i>
                </span>

                <strong dir="ltr">
                  {Number(payableAmount || 0).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                </strong>
                <em>{t(form.currency || 'AFN')}</em>
              </span>
            {:else}
              <span class="sale-payable-card__total">
                <span class="sale-payable-card__icon">
                  <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
                </span>
                <strong>{t('Invalid discount')}</strong>
              </span>
            {/if}
          </div>

          {#if payableAmount >= 0}
            <label class="sale-payable-card__amount">
              <span>{t('Amount')}</span>

              <div class="sale-payment-amount">
                <i class="bi bi-cash" aria-hidden="true"></i>

                <input
                  id="paymentAmount"
                  type="number"
                  min="0"
                  step="any"
                  readonly={form.account_id === WALKIN?.id}
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
          {/if}
        </div>

      </div>
    </section>
  </div>

  <footer class="sale-actions">
    <div class="sale-actions__status">
      <span class="sale-actions__status-icon">
        <i class="bi bi-shield-check" aria-hidden="true"></i>
      </span>

      <span>
        <strong>{t('Sale')}</strong>
        <small>
          {items.length} {t('Items')} · {t(form.currency || 'AFN')}
        </small>
      </span>
    </div>

    <div class="sale-actions__buttons">
      <button
        type="button"
        class="sale-action-button sale-action-button--draft"
        on:click={() => saveSale(false)}
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
        class="sale-action-button sale-action-button--confirm"
        on:click={() => saveSale(true)}
        disabled={loading}>
        {#if loading}
          <span class="spinner-border spinner-border-sm" role="status"></span>
        {:else}
          <i class="bi bi-check2-circle" aria-hidden="true"></i>
        {/if}

        <span>{t('Confirm Sale')}</span>
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
    customers = await db.accounts
      .where('account_type_id')
      .equals(4)
      .and((s) => s.status === 1)
      .toArray();

    customers = customers.filter((a) =>
      a.account_status ? a.account_status == 'active' : a.status == 1,
    );

    const newAccount = e.detail.account;

    if (newAccount && newAccount.account_type_id == 4) {
      form.account_id = newAccount.id;
    }
  }} />

{#if showTrackModal}
  <div class="sale-modal-backdrop" role="presentation"></div>

  <div
    class="sale-track-layer"
    id="trackModal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="trackModalLabel">
    <div class="sale-track-dialog">
      <div class="sale-track-modal">
        <header class="sale-track-header">
          <div class="sale-track-heading">
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
            class="sale-track-close"
            aria-label={t('Close')}
            on:click={() => (showTrackModal = false)}>
            <i class="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </header>

        <div class="sale-track-body">
          <div class="sale-track-search">
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

          <div class="sale-track-list">
            {#each filteredSecondAccounts as acc (acc.id)}
              <button
                type="button"
                class="sale-track-account"
                on:click={() => {
                  second_entry_account = acc.id;
                  track_ID = acc.id;
                  showTrackModal = false;
                }}>
                <span class="sale-track-account__icon">
                  <i class="bi bi-person" aria-hidden="true"></i>
                </span>

                <span class="sale-track-account__copy">
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

                <i class="bi bi-chevron-right sale-track-account__arrow" aria-hidden="true"></i>
              </button>
            {/each}

            {#if filteredSecondAccounts.length === 0}
              <div class="sale-track-empty">
                <span aria-hidden="true">
                  <i class="bi bi-person-x"></i>
                </span>
                <strong>{t('No accounts found')}</strong>
              </div>
            {/if}
          </div>
        </div>

        <footer class="sale-track-footer">
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
  <div class="sale-modal-backdrop" role="presentation"></div>

  <div
    class="sale-account-view-layer"
    role="dialog"
    aria-modal="true"
    aria-labelledby="saleAccountViewTitle">
    <div class="sale-account-view-dialog">
      <div class="sale-account-view-modal">
        <header>
          <div>
            <span aria-hidden="true">
              <i class="bi bi-person-vcard"></i>
            </span>
            <h2 id="saleAccountViewTitle">{t('Account')}</h2>
          </div>

          <button
            type="button"
            aria-label={t('Close')}
            on:click={() => (showAccountModal = false)}>
            <i class="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </header>

        <div class="sale-account-view-body">
          <AccountView id={form.account_id} />
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .sale-create-page {
    --sale-primary: var(--bs-primary, #2f6fed);
    --sale-primary-dark: #1d4ed8;
    --sale-green: #059669;
    --sale-green-dark: #047857;
    --sale-text: #172033;
    --sale-muted: #718096;
    --sale-border: #dfe6ef;
    --sale-border-soft: #edf1f6;
    --sale-surface: #ffffff;
    --sale-bg-soft: #f7f9fc;
    --sale-control-height: 2.625rem;

    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    margin: 0;
    padding: 0 0 1.25rem;
    color: var(--sale-text);
  }

  /* Page header */

  .sale-page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-width: 0;
    padding: 0.9rem 1rem;
    border: 1px solid var(--sale-border);
    border-radius: 0.875rem;
    background: var(--sale-surface);
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.045);
  }

  .sale-page-heading {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-width: 0;
  }

  .sale-page-icon {
    display: inline-grid;
    flex: 0 0 2.75rem;
    width: 2.75rem;
    height: 2.75rem;
    place-items: center;
    border-radius: 0.75rem;
    background: #eafaf3;
    color: var(--sale-green);
    font-size: 1.1rem;
  }

  .sale-page-heading__copy {
    min-width: 0;
  }

  .sale-page-eyebrow {
    margin-bottom: 0.05rem;
    color: var(--sale-green);
    font-size: 0.65rem;
    font-weight: 850;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .sale-page-heading h1 {
    margin: 0;
    color: var(--sale-text);
    font-size: 1.15rem;
    font-weight: 900;
    line-height: 1.3;
    letter-spacing: -0.025em;
  }

  .sale-page-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
    color: #7c899c;
    font-size: 0.68rem;
    font-weight: 600;
  }

  .sale-page-meta > span {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .sale-page-meta strong {
    color: #526176;
    font-weight: 800;
  }

  .sale-page-meta__separator {
    width: 3px;
    height: 3px;
    border-radius: 999px;
    background: #cbd5e1;
  }

  .sale-page-header__actions {
    display: flex;
    flex-shrink: 0;
  }

  .sale-customer-balance {
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

  .sale-customer-balance:hover {
    border-color: #bed3f8;
    background: #edf4ff;
  }

  .sale-customer-balance__icon {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #ffffff;
    color: var(--sale-primary);
  }

  .sale-customer-balance__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.04rem;
  }

  .sale-customer-balance__copy small {
    color: #718096;
    font-size: 0.58rem;
    font-weight: 700;
  }

  .sale-customer-balance__copy strong {
    overflow: hidden;
    color: #26364b;
    font-size: 0.72rem;
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-customer-balance__arrow {
    color: #95a3b6;
    font-size: 0.65rem;
  }

  /* Shared sections */

  .sale-section {
    min-width: 0;
    overflow: visible;
    border: 1px solid var(--sale-border);
    border-radius: 0.875rem;
    background: var(--sale-surface);
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.045);
  }

  .sale-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 4rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--sale-border-soft);
  }

  .sale-section-header--compact {
    min-height: 3.75rem;
  }

  .sale-section-heading {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
  }

  .sale-section-icon {
    display: inline-grid;
    flex: 0 0 2.2rem;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border-radius: 0.6rem;
    background: #edf4ff;
    color: var(--sale-primary);
    font-size: 0.9rem;
  }

  .sale-section-icon--neutral {
    background: #f1f5f9;
    color: #64748b;
  }

  .sale-section-icon--green {
    background: #ecfdf5;
    color: var(--sale-green);
  }

  .sale-section-heading h2 {
    margin: 0;
    color: #26364b;
    font-size: 0.88rem;
    font-weight: 850;
    line-height: 1.25;
  }

  .sale-section-heading p {
    margin: 0.1rem 0 0;
    color: #8794a7;
    font-size: 0.63rem;
    font-weight: 550;
  }

  .sale-required-note {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    color: #b42318;
    font-size: 0.62rem;
    font-weight: 700;
  }

  .sale-required-note i {
    color: #dc2626;
    font-size: 0.48rem;
  }

  /* Details */

  .sale-details-grid {
    --sale-control-height: 2.375rem;

    display: grid;
    grid-template-columns:
      minmax(10rem, 1fr)
      minmax(13rem, 1.35fr)
      minmax(8rem, 0.72fr)
      minmax(10rem, 0.9fr)
      minmax(9rem, 0.82fr);
    gap: 0.5rem;
    padding: 0.5rem 0.75rem 0.625rem;
  }

  .sale-field {
    display: grid;
    grid-template-rows: 1rem auto;
    align-content: start;
    gap: 0.15rem;
    min-width: 0;
  }

  .sale-field-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    height: 1rem;
    min-height: 1rem;
  }

  .sale-field-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 1rem;
    color: #59687c;
    font-size: 0.68rem;
    font-weight: 750;
  }

  .sale-field-label i {
    display: none;
  }

  .sale-currency-edit {
    display: inline-grid;
    width: 1rem;
    height: 1rem;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 0.3rem;
    background: transparent;
    color: #8c9aad;
    font-size: 0.62rem;
    cursor: pointer;
  }

  .sale-currency-edit:hover {
    background: #edf4ff;
    color: var(--sale-primary);
  }

  .sale-details-grid :global(.filter-select) {
    width: 100%;
    max-width: none;
    min-width: 0;
  }

  .sale-details-grid :global(.filter-select__label),
  .sale-details-grid :global(.filter-label),
  .sale-details-grid :global(.filter-select__notch) {
    display: none !important;
  }

  .sale-details-grid :global(.filter-select.outline) {
    padding-top: 0 !important;
  }

  .sale-details-grid :global(.filter-select__control),
  .sale-details-grid :global(.filter-select select),
  .sale-details-grid :global(.filter-select button),
  .sale-details-grid :global(.form-select) {
    width: 100%;
    min-height: var(--sale-control-height) !important;
    height: var(--sale-control-height) !important;
    border-color: #d6dfeb !important;
    border-radius: 0.625rem !important;
    background: #ffffff !important;
    color: #26364b !important;
    font-size: 0.78rem !important;
    font-weight: 650 !important;
    box-shadow: none !important;
  }

  .sale-details-grid :global(.filter-select__control:hover),
  .sale-details-grid :global(.filter-select select:hover),
  .sale-details-grid :global(.form-select:hover) {
    border-color: #bcc9db !important;
  }

  .sale-details-grid :global(.filter-select__control:focus-within),
  .sale-details-grid :global(.filter-select select:focus),
  .sale-details-grid :global(.form-select:focus) {
    border-color: #78a4f5 !important;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1) !important;
  }

  .sale-customer-input {
    display: flex;
    align-items: stretch;
    width: 100%;
    height: var(--sale-control-height);
    overflow: hidden;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .sale-customer-input:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .sale-customer-input__icon {
    display: inline-grid;
    flex: 0 0 2.25rem;
    width: 2.25rem;
    place-items: center;
    color: #8c9aad;
  }

  .sale-customer-input > input {
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

  .sale-customer-input > input::placeholder {
    color: #9aa7b8;
    font-weight: 500;
  }

  .sale-selected-customer {
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

  .sale-selected-customer__identity {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    overflow: hidden;
  }

  .sale-selected-customer__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-selected-customer__divider {
    flex: 0 0 1px;
    width: 1px;
    height: 1rem;
    background: #d6dfeb;
  }

  .sale-selected-customer__balance {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: baseline;
    gap: 0.22rem;
    color: var(--sale-primary);
    font-size: 0.68rem;
    font-weight: 850;
    white-space: nowrap;
  }

  .sale-selected-customer__balance.is-negative {
    color: #dc2626;
  }

  .sale-selected-customer__balance b {
    font: inherit;
  }

  .sale-selected-customer__balance small {
    font-size: 0.58rem;
    font-weight: 750;
  }

  .sale-selected-customer i {
    flex-shrink: 0;
    color: #94a3b8;
    font-size: 0.72rem;
  }

  .sale-add-customer {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-width: 4.2rem;
    padding-inline: 0.65rem;
    border: 0;
    border-inline-start: 1px solid #dfe6ef;
    background: var(--sale-primary);
    color: #ffffff;
    font-size: 0.68rem;
    font-weight: 800;
    cursor: pointer;
  }

  .sale-add-customer:hover {
    background: var(--sale-primary-dark);
  }

  .sale-customer-dropdown {
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
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .sale-customer-dropdown::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .sale-customer-dropdown li {
    margin: 0;
    padding: 0;
  }

  .sale-customer-option {
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

  .sale-customer-option:hover {
    background: #f0f6ff;
  }

  .sale-customer-option__avatar {
    display: inline-grid;
    flex: 0 0 1.9rem;
    width: 1.9rem;
    height: 1.9rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #edf4ff;
    color: var(--sale-primary);
  }

  .sale-customer-option__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.05rem;
  }

  .sale-customer-option__copy strong {
    overflow: hidden;
    font-size: 0.75rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-customer-option__copy small {
    overflow: hidden;
    color: #8794a7;
    font-size: 0.61rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-customer-option__arrow {
    flex-shrink: 0;
    color: #a0acbc;
    font-size: 0.58rem;
  }

  .sale-readonly-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    height: var(--sale-control-height);
    padding-inline: 0.75rem;
    border: 1px solid #dfe5ed;
    border-radius: 0.625rem;
    background: #f7f9fc;
    color: #526176;
    font-size: 0.78rem;
    font-weight: 750;
  }

  .sale-readonly-field i {
    color: #9aa7b8;
    font-size: 0.65rem;
  }

  .sale-app-datepicker {
    width: 100%;
    min-width: 0;
  }

  .sale-app-datepicker :global(.app-date-field) {
    width: 100%;
    gap: 0 !important;
  }

  .sale-app-datepicker :global(.date-label) {
    display: none !important;
  }

  .sale-app-datepicker :global(input),
  .sale-app-datepicker :global(.date-picker-control) {
    width: 100%;
    min-width: 0;
    min-height: var(--sale-control-height) !important;
    height: var(--sale-control-height) !important;
    border-color: #d6dfeb !important;
    border-radius: 0.625rem !important;
    background: #ffffff !important;
    font-size: 0.78rem !important;
    font-weight: 650 !important;
    box-shadow: none !important;
  }

  .sale-app-datepicker :global(input:focus),
  .sale-app-datepicker :global(.date-picker-control:focus-within) {
    border-color: #78a4f5 !important;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1) !important;
  }

  .sale-exchange-editor {
    display: flex;
    align-items: stretch;
    width: 100%;
    height: var(--sale-control-height);
    overflow: hidden;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .sale-exchange-editor:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .sale-exchange-editor > span {
    display: inline-flex;
    align-items: center;
    padding-inline: 0.45rem;
    border-inline-end: 1px solid #e2e8f0;
    background: #f7f9fc;
    color: #64748b;
    font-size: 0.58rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .sale-exchange-editor > input {
    flex: 1 1 auto;
    min-width: 2.5rem;
    padding-inline: 0.35rem;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.68rem;
    font-weight: 750;
    text-align: center;
  }

  .sale-exchange-editor__save,
  .sale-exchange-editor__cancel {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    padding: 0;
    place-items: center;
    border: 0;
    border-inline-start: 1px solid #e2e8f0;
    cursor: pointer;
  }

  .sale-exchange-editor__save {
    background: #ecfdf5;
    color: var(--sale-green);
  }

  .sale-exchange-editor__cancel {
    background: #fef2f2;
    color: #dc2626;
  }

  /* Lower cards */

  .sale-lower-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.82fr) minmax(29rem, 1.18fr);
    gap: 1rem;
    min-width: 0;
  }

  .sale-description-body,
  .sale-payment-body {
    padding: 0.875rem 1rem 1rem;
  }

  .sale-description-body {
    display: grid;
    gap: 0.45rem;
  }

  .sale-description-body textarea {
    width: 100%;
    min-height: 12rem;
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

  .sale-description-body textarea:hover {
    border-color: #bcc9db;
  }

  .sale-description-body textarea:focus {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .sale-description-body textarea::placeholder {
    color: #9aa7b8;
  }

  .sale-rich-editor {
    min-height: 12rem;
    overflow: hidden;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .sale-rich-editor:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .sale-rich-editor :global(.tiptap),
  .sale-rich-editor :global(.ProseMirror) {
    min-height: 9rem;
  }

  .sale-description-hint {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: #8a97aa;
    font-size: 0.62rem;
    font-weight: 600;
  }

  /* Payment */

  .sale-payment-method-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.8rem;
    padding-inline: 0.6rem;
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 800;
  }

  .sale-payment-method-badge--treasury {
    border: 1px solid #bfe9d4;
    background: #effaf5;
    color: #087a54;
  }

  .sale-payment-method-badge--track {
    border: 1px solid #d5e3fb;
    background: #f3f7fe;
    color: #2f6fed;
  }

  .sale-payment-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.85rem;
    padding: 1rem;
    background: #fbfcfe;
  }

  .sale-payment-panel {
    display: grid;
    align-content: start;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.85rem;
    border: 1px solid #dfe6ef;
    border-radius: 0.75rem;
    background: #ffffff;
  }

  .sale-payment-panel__header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 2.5rem;
    padding-bottom: 0.65rem;
    border-bottom: 1px solid #edf1f6;
  }

  .sale-payment-panel__icon {
    display: inline-grid;
    flex: 0 0 2.15rem;
    width: 2.15rem;
    height: 2.15rem;
    place-items: center;
    border-radius: 0.55rem;
    font-size: 0.85rem;
  }

  .sale-payment-panel__icon--details {
    background: #f1f5f9;
    color: #64748b;
  }

  .sale-payment-panel__icon--method {
    background: #edf4ff;
    color: var(--sale-primary);
  }

  .sale-payment-panel__header h3 {
    margin: 0;
    color: #26364b;
    font-size: 0.82rem;
    font-weight: 850;
    line-height: 1.25;
  }

  .sale-payment-panel__header p {
    margin: 0.12rem 0 0;
    color: #8794a7;
    font-size: 0.6rem;
    font-weight: 600;
  }

  .sale-payment-summary-grid {
    display: block;
    min-width: 0;
    direction: rtl;
  }

  .sale-payment-adjustments {
    display: grid;
    align-content: start;
    gap: 0.65rem;
    min-width: 0;
    direction: rtl;
  }

  .sale-payment-field {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
  }

  .sale-payment-field > span {
    color: #59687c;
    font-size: 0.68rem;
    font-weight: 750;
  }

  .sale-payment-control,
  .sale-payment-amount,
  .sale-payment-description {
    display: flex;
    align-items: center;
    width: 100%;
    height: var(--sale-control-height);
    overflow: visible;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .sale-payment-control:focus-within,
  .sale-payment-amount:focus-within,
  .sale-payment-description:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .sale-payment-control__icon,
  .sale-payment-amount > i,
  .sale-payment-description > i {
    flex: 0 0 2.25rem;
    width: 2.25rem;
    color: #8c9aad;
    text-align: center;
    pointer-events: none;
  }

  .sale-payment-control > input,
  .sale-payment-amount > input,
  .sale-payment-description > input {
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

  .sale-payment-control > input::placeholder,
  .sale-payment-amount > input::placeholder,
  .sale-payment-description > input::placeholder {
    color: #9aa7b8;
    font-weight: 500;
  }

  .sale-payment-toggle {
    display: inline-grid;
    flex: 0 0 2.25rem;
    width: 2.25rem;
    height: 100%;
    padding: 0;
    place-items: center;
    border: 0;
    border-inline-end: 1px solid #dfe6ef;
    background: #f7f9fc;
    color: #64748b;
    cursor: pointer;
  }

  .sale-payment-toggle.is-active {
    background: #fff7df;
    color: #b7791f;
  }

  .sale-payment-suffix {
    display: inline-flex;
    align-items: center;
    align-self: stretch;
    min-width: 4rem;
    padding-inline: 0.55rem;
    border-inline-start: 1px solid #dfe6ef;
    background: #f7f9fc;
    color: #64748b;
    font-size: 0.62rem;
    font-weight: 750;
    white-space: nowrap;
  }

  .sale-payable-card {
    display: grid;
    grid-column: 1 / -1;
    gap: 0;
    padding: 0.65rem 0.75rem;
    border: 1px solid #cdddf8;
    border-radius: 0.75rem;
    background: #f4f8ff;
    direction: rtl;
  }

  .sale-payable-card__overview {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 2.9rem;
  }

  .sale-payable-card__amount {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    margin-top: 0.65rem;
    padding-top: 0.65rem;
    border-top: 1px solid #dbe7fa;
  }

  .sale-payable-card__amount > span {
    flex: 0 0 auto;
    min-width: 3.5rem;
    color: #526b92;
    font-size: 0.68rem;
    font-weight: 800;
  }

  .sale-payable-card__amount .sale-payment-amount {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: var(--sale-control-height);
    border-color: #cbdaf2;
    background: #ffffff;
  }

  .sale-payable-card.is-invalid {
    border-color: #fecaca;
    background: #fef2f2;
  }

  .sale-payable-card__icon {
    display: inline-grid;
    flex: 0 0 2.3rem;
    width: 2.3rem;
    height: 2.3rem;
    place-items: center;
    border-radius: 0.65rem;
    background: #e5efff;
    color: var(--sale-primary);
    font-size: 0.95rem;
  }

  .sale-payable-card.is-invalid .sale-payable-card__icon {
    color: #dc2626;
  }

  .sale-payable-card__copy {
    display: grid;
    min-width: 0;
    gap: 0.12rem;
  }

  .sale-payable-card__copy small {
    color: #6d7f9c;
    font-size: 0.62rem;
    font-weight: 650;
  }

  .sale-payable-card__copy strong {
    color: #26364b;
    font-size: 0.9rem;
    font-weight: 850;
    white-space: nowrap;
  }

  .sale-payable-card__total {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
    direction: ltr;
  }

  .sale-payable-card__total > strong {
    overflow: hidden;
    color: var(--sale-primary);
    font-size: 1.35rem;
    font-weight: 900;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-payable-card__total > em {
    color: #5e7191;
    font-size: 0.68rem;
    font-style: normal;
    font-weight: 800;
    white-space: nowrap;
  }

  .sale-payable-card.is-invalid .sale-payable-card__copy small,
  .sale-payable-card.is-invalid .sale-payable-card__copy strong,
  .sale-payable-card.is-invalid .sale-payable-card__total > strong {
    color: #b42318;
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
    color: var(--sale-primary);
  }

  .sale-payment-methods {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.65rem;
  }

  .sale-payment-method {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
    min-height: 4.5rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid #dfe6ef;
    border-radius: 0.65rem;
    background: #ffffff;
    color: #334155;
    text-align: start;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
  }

  .sale-payment-method:hover {
    transform: translateY(-1px);
    border-color: #c9d7e8;
    background: #fbfcfe;
  }

  .sale-payment-method.is-active {
    border-color: #5f94f3;
    background: #f4f8ff;
    box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.06);
  }

  .sale-payment-method__icon {
    display: inline-grid;
    flex: 0 0 2.6rem;
    width: 2.6rem;
    height: 2.6rem;
    place-items: center;
    border-radius: 0.6rem;
    font-size: 0.88rem;
  }

  .sale-payment-method__icon--track {
    background: #edf4ff;
    color: var(--sale-primary);
  }

  .sale-payment-method__icon--treasury {
    background: #ecfdf5;
    color: var(--sale-green);
  }

  .sale-payment-method__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.06rem;
  }

  .sale-payment-method__copy strong {
    overflow: hidden;
    color: #26364b;
    font-size: 0.75rem;
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-payment-method__copy small {
    overflow: hidden;
    color: #8491a4;
    font-size: 0.61rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-payment-method__check {
    flex-shrink: 0;
    color: #a9b4c3;
    font-size: 0.82rem;
  }

  .sale-payment-method.is-active .sale-payment-method__check {
    color: var(--sale-primary);
  }

  .sale-treasury-status {
    display: flex;
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

  .sale-treasury-status i {
    color: var(--sale-green);
  }

  .sale-treasury-status strong {
    color: #176a4c;
    font-weight: 850;
  }

  /* Sticky actions */

  .sale-actions {
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

  .sale-actions__status {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }

  .sale-actions__status-icon {
    display: inline-grid;
    flex: 0 0 2.2rem;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border-radius: 0.55rem;
    background: #f1f5f9;
    color: #64748b;
  }

  .sale-actions__status > span:last-child {
    display: grid;
    min-width: 0;
    gap: 0.03rem;
  }

  .sale-actions__status strong {
    color: #334155;
    font-size: 0.72rem;
    font-weight: 850;
  }

  .sale-actions__status small {
    overflow: hidden;
    color: #8a97aa;
    font-size: 0.6rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-actions__buttons {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-shrink: 0;
  }

  .sale-action-button {
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

  .sale-action-button:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .sale-action-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .sale-action-button--draft {
    border: 1px solid #d5deea;
    background: #ffffff;
    color: #526176;
  }

  .sale-action-button--draft:hover:not(:disabled) {
    border-color: #becbdb;
    background: #f8fafc;
    color: #26364b;
  }

  .sale-action-button--confirm {
    min-width: 9rem;
    border: 1px solid var(--sale-green);
    background: var(--sale-green);
    color: #ffffff;
    box-shadow: 0 5px 14px rgba(5, 150, 105, 0.22);
  }

  .sale-action-button--confirm:hover:not(:disabled) {
    border-color: var(--sale-green-dark);
    background: var(--sale-green-dark);
    box-shadow: 0 7px 18px rgba(5, 150, 105, 0.27);
  }

  /* Modals */

  .sale-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1400;
    background: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(2px);
  }

  .sale-track-layer,
  .sale-account-view-layer {
    position: fixed;
    inset: 0;
    z-index: 1410;
    display: grid;
    place-items: center;
    padding: 1rem;
    overflow-y: auto;
  }

  .sale-track-dialog {
    width: min(94vw, 32rem);
  }

  .sale-track-modal,
  .sale-account-view-modal {
    overflow: hidden;
    border: 1px solid #dce4ef;
    border-radius: 0.875rem;
    background: #ffffff;
    box-shadow: 0 26px 70px rgba(15, 23, 42, 0.22);
  }

  .sale-track-header,
  .sale-account-view-modal > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 4.25rem;
    padding: 0.75rem 0.85rem;
    border-bottom: 1px solid var(--sale-border-soft);
    background: #ffffff;
  }

  .sale-track-heading,
  .sale-account-view-modal > header > div {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .sale-track-heading > span,
  .sale-account-view-modal > header > div > span {
    display: inline-grid;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border-radius: 0.55rem;
    background: #edf4ff;
    color: var(--sale-primary);
  }

  .sale-track-heading small {
    display: block;
    color: #8794a7;
    font-size: 0.58rem;
    font-weight: 650;
  }

  .sale-track-heading h2,
  .sale-account-view-modal > header h2 {
    margin: 0;
    color: #26364b;
    font-size: 0.9rem;
    font-weight: 850;
  }

  .sale-track-close,
  .sale-account-view-modal > header > button {
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

  .sale-track-close:hover,
  .sale-account-view-modal > header > button:hover {
    background: #f1f5f9;
    color: #334155;
  }

  .sale-track-body {
    padding: 0.8rem;
  }

  .sale-track-search {
    display: flex;
    align-items: center;
    height: 2.625rem;
    overflow: hidden;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .sale-track-search:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .sale-track-search > i {
    flex: 0 0 2.25rem;
    width: 2.25rem;
    color: #8c9aad;
    text-align: center;
  }

  .sale-track-search input {
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

  .sale-track-search button {
    display: inline-grid;
    flex: 0 0 2.5rem;
    width: 2.5rem;
    height: 100%;
    padding: 0;
    place-items: center;
    border: 0;
    border-inline-start: 1px solid #dfe6ef;
    background: #edf4ff;
    color: var(--sale-primary);
    cursor: pointer;
  }

  .sale-track-list {
    display: grid;
    gap: 0.35rem;
    max-height: 22rem;
    margin-top: 0.75rem;
    overflow-y: auto;
  }

  .sale-track-account {
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

  .sale-track-account:hover {
    border-color: #cddbf0;
    background: #f5f9ff;
  }

  .sale-track-account__icon {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #edf4ff;
    color: var(--sale-primary);
  }

  .sale-track-account__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.05rem;
  }

  .sale-track-account__copy strong {
    overflow: hidden;
    font-size: 0.75rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-track-account__copy small {
    overflow: hidden;
    color: #8794a7;
    font-size: 0.61rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-track-account__arrow {
    flex-shrink: 0;
    color: #a2adbc;
    font-size: 0.58rem;
  }

  .sale-track-empty {
    display: grid;
    min-height: 10rem;
    place-items: center;
    align-content: center;
    gap: 0.4rem;
    color: #8794a7;
  }

  .sale-track-empty span {
    display: inline-grid;
    width: 2.8rem;
    height: 2.8rem;
    place-items: center;
    border-radius: 0.7rem;
    background: #f1f5f9;
    font-size: 1rem;
  }

  .sale-track-empty strong {
    font-size: 0.72rem;
    font-weight: 750;
  }

  .sale-track-footer {
    display: flex;
    justify-content: flex-end;
    padding: 0.65rem 0.8rem;
    border-top: 1px solid var(--sale-border-soft);
    background: #fbfcfe;
  }

  .sale-track-footer button {
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

  .sale-account-view-dialog {
    width: min(96vw, 72rem);
  }

  .sale-account-view-modal {
    display: flex;
    flex-direction: column;
    max-height: calc(100dvh - 2rem);
  }

  .sale-account-view-body {
    min-height: 0;
    padding: 0.75rem;
    overflow-y: auto;
  }

  /* RTL */

  :global(html[dir='rtl']) .sale-customer-balance__arrow,
  :global(html[dir='rtl']) .sale-customer-option__arrow,
  :global(html[dir='rtl']) .sale-track-account__arrow {
    transform: scaleX(-1);
  }

  /* Responsive */

  @media (max-width: 1200px) {
    .sale-details-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .sale-field--customer {
      grid-column: span 2;
    }

    .sale-payable-card {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 991.98px) {
    .sale-page-header {
      align-items: flex-start;
    }

    .sale-details-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .sale-field--customer {
      grid-column: span 1;
    }

    .sale-lower-grid {
      grid-template-columns: 1fr;
    }

    .sale-description-body textarea,
    .sale-rich-editor {
      min-height: 7rem;
    }
  }

  @media (max-width: 767.98px) {
    .sale-create-page {
      gap: 0.75rem;
      padding-bottom: 0.75rem;
    }

    .sale-page-header {
      flex-direction: column;
      padding: 0.8rem;
    }

    .sale-page-header__actions,
    .sale-customer-balance {
      width: 100%;
    }

    .sale-details-grid {
      grid-template-columns: 1fr;
      padding: 0.8rem;
    }

    .sale-field--customer {
      grid-column: auto;
    }

    .sale-section-header {
      padding-inline: 0.8rem;
    }

    .sale-payment-body {
      grid-template-columns: 1fr;
      padding: 0.8rem;
    }

    .sale-payment-summary-grid {
      padding: 0;
    }

    .sale-payment-panel {
      padding: 0.75rem;
    }

    .sale-payable-card {
      grid-column: 1;
      padding: 0.65rem 0.75rem;
    }

    .sale-payable-card__amount {
      align-items: stretch;
      flex-direction: column;
      gap: 0.35rem;
    }

    .sale-payable-card__amount .sale-payment-amount {
      flex-basis: auto;
      width: 100%;
    }

    .sale-actions {
      align-items: stretch;
      flex-direction: column;
      padding: 0.65rem;
    }

    .sale-actions__status {
      display: none;
    }

    .sale-actions__buttons {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }

    .sale-action-button {
      width: 100%;
      min-width: 0;
      padding-inline: 0.6rem;
    }
  }

  @media (max-width: 480px) {
    .sale-page-icon,
    .sale-section-icon {
      display: none;
    }

    .sale-page-meta {
      flex-wrap: wrap;
    }

    .sale-payment-methods {
      grid-template-columns: 1fr;
    }

    .sale-actions__buttons {
      grid-template-columns: 1fr;
    }

    .sale-track-layer,
    .sale-account-view-layer {
      padding: 0.45rem;
    }

    .sale-account-view-modal {
      max-height: calc(100dvh - 0.9rem);
    }
  }

</style>
