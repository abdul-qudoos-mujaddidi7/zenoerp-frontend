<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import Journals from '../Journals.svelte';
  import { toast } from '../../ToastUI/toast.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let inventory_record = null; // parent passes inventory_record object

  const dispatch = createEventDispatcher();
  
  import {calculateRemainingAndBenefit} from './InventoryRecordsHelper.js';

  import { calculateProductStock } from '../stocktransactions/calculateStock.js';

  let items = [];
  let units = [];
  let products = [];
  let returnItems = [];
  let warehouse = null;
  let account = null;
  let currencies = [];
  let currency = '';
  let returnDate = new Date().toISOString().slice(0, 10);
  let description = '';
  let totalAmount = 0;
  let saving = false;

  let returns = [];
  let returnsWithItems = [];

  onMount(async () => {
    if (!inventory_record) return;
    warehouse = await db.warehouses.where({ id: inventory_record.warehouse_id, status: 1 }).first();
    account = await db.accounts.where({ id: inventory_record.account_id, status: 1 }).first();
    currencies = await db.currencies.where({ status: 1 }).toArray();
    currency = inventory_record.currency || currencies[0]?.code || 'AFN';
    items = await db.inventory_record_items
      .where('inventory_record_id')
      .equals(inventory_record.id)
      .and((i) => i.status === 1)
      .toArray();
    units = await db.product_units.where({ status: 1 }).toArray();
    products = await db.products.where({ status: 1 }).toArray();
    // Prepare returnItems with default values
    returns = await db.inventory_record_returns.where({ inventory_record_id: inventory_record.id, status: 1 }).toArray();
    let tempReturnsWithItems = [];
    for (const r of returns) {
      // Ensure type match for inventory_record_return_id
      const items = await db.inventory_record_return_items.where({ inventory_record_return_id: Number(r.id), status: 1 }).toArray();
      tempReturnsWithItems.push({
        ...r,
        returns: items,
      });
    }
    returnsWithItems = tempReturnsWithItems;

    returnItems = items.map((i) => ({
      ...i,
      remaining_qty:
        i.quantity -
        returnsWithItems.reduce((sum, r) => {
          const returnItem = r.returns.find(
            (ri) => ri.product_id === i.product_id && ri.product_unit_id === i.product_unit_id,
          );
          return sum + (returnItem ? returnItem.quantity : 0);
        }, 0),
      return_quantity: 0,
      return_unit_price: i.unit_price,
      return_subtotal: 0,
    }));
  });

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    console.log('Exchanging', amount, fromCurrencyCode, 'to', toCurrencyCode);
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = Number(fromCurrency.exchangeRate || 1);
    const toRate = Number(toCurrency.exchangeRate || 1);
    return (amount / toRate) * fromRate;
  }

  $: totalAmount = returnItems.reduce((s, i) => {
    if (i.currency && currency && i.currency !== currency) {
      let exchangeRateValue = exchangeRate(i.return_subtotal, i.currency, currency);
      console.log(
        `Converting ${i.return_subtotal} from ${i.currency} to ${currency} for total calculation - exchange rate value: ${exchangeRateValue}`,
      );
      return s + exchangeRateValue;
    } else {
      return s + i.return_subtotal;
    }
  }, 0);
  function updateReturnItem(idx) {
    let item = returnItems[idx];
    if (item.return_quantity < 0) item.return_quantity = 0;
    if (item.return_quantity > item.remaining_qty) item.return_quantity = item.remaining_qty;
    if (item.return_unit_price < 0) item.return_unit_price = 0;
    item.return_subtotal = item.return_quantity * item.return_unit_price;
    returnItems = [...returnItems];
  }

  async function saveReturn() {
    if (saving) return;
    if (!inventory_record || !warehouse || !account) {
      toast.error(t('Error'), t('Missing inventory_record, warehouse, or account.'));
      return;
    }
    const validItems = returnItems.filter((i) => i.return_quantity > 0 && i.return_quantity <= i.quantity);
    if (validItems.length === 0) {
      toast.error(t('Error'), t('Select at least one item to return.'));
      return;
    }

    saving = true;
    try {
      let addedItems = [];
      await db.transaction(
        'rw',
        [
          db.inventory_record_returns,
          db.inventory_record_return_items,
          db.stock_transactions,
          db.journals,
          db.accounts,
          db.activity_logs,
          db.products,
          db.warehouse_products,
        ],
        async () => {
          // Create inventory_record return record
          const returnId = await db.inventory_record_returns.add({
            inventory_record_id: inventory_record.id,
            warehouse_id: warehouse.id,
            account_id: account.id,
            return_number: 'SR-' + Date.now(),
            return_date: returnDate,
            total_amount: totalAmount,
            description,
            currency,
            return_status: 'confirmed',
            status: 1,
            updated_at: new Date().toISOString(),
          });
          await logActivity({
            user_id: parseInt(localStorage.getItem('user_id')) || 0,
            action: 'create',
            table_name: 'inventory_record_returns',
            entity_id: returnId, // We have the ID here since it's returned by add()
            old_values: null,
            new_values: JSON.stringify({
              inventory_record_id: inventory_record.id,
              warehouse_id: warehouse.id,
              account_id: account.id,
              return_number: 'SR-' + Date.now(),
              return_date: returnDate,
              total_amount: totalAmount,
              description,
              currency,
              return_status: 'confirmed',
              status: 1,
            }),
            description: `Created inventory_record return #SR-${returnId} for inventory_record #${inventory_record.invoice_number}`,
          });

          // Add return items and stock transactions
          for (const i of validItems) {
            await db.inventory_record_return_items.add({
              inventory_record_return_id: returnId,
              product_id: i.product_id,
              product_unit_id: i.product_unit_id,
              quantity: i.return_quantity,
              unit_price: i.return_unit_price,
              currency: i.currency || currency,
              subtotal: i.return_subtotal,
              status: 1,
              updated_at: new Date().toISOString(),
            });

            // Add stock transaction (stock in)
            await db.stock_transactions.add({
              warehouse_id: warehouse.id,
              product_id: i.product_id,
              product_unit_id: i.product_unit_id,
              reference_id: returnId,
              reference_type: 'inventory_record_return',
              transaction_type: 'inventory_record_return',
              quantity: i.return_quantity,
              unit_cost: i.return_unit_price,
              total_cost: i.return_subtotal,
              currency: i.currency || currency,
              date: returnDate,
              expiry_date: null,
              heaviness: null,
              description: `InventoryRecord return for InventoryRecord #${inventory_record.invoice_number}`,
              status: 1,
              updated_at: new Date().toISOString(),
            });
            addedItems.push(i);
          }
          const receivableAccount = await db.accounts
            .where('code')
            .equals('RECEIVABLE')
            .and((s) => s.status === 1)
            .first();

          if (!receivableAccount) {
            throw new Error('RECEIVABLE account not found');
          }

          const inventory_recordsAccount = await db.accounts
            .where('code')
            .equals('SALES')
            .and((s) => s.status === 1)
            .first();

          if (!inventory_recordsAccount) {
            throw new Error('SALES account not found');
          }

          const TreasuryAccount = await db.accounts
            .where('code')
            .equals('TREASURY')
            .and((s) => s.status === 1)
            .first();

          if (!TreasuryAccount) {
            throw new Error('TREASURY account not found');
          }

          const WalkinAccount = await db.accounts
            .where('code')
            .equals('WALKIN')
            .and((s) => s.status === 1)
            .first();

          if (!WalkinAccount) {
            throw new Error('WALKIN account not found');
          }

          await db.journals.add({
            date: new Date().toISOString().slice(0, 10),
            reference_id: returnId,
            reference_type: 'inventory_record_return',
            description: `InventoryRecord Return Transaction for InventoryRecord #${inventory_record.invoice_number}`,
            currency: currency,
            first_entry_account: account.id,
            first_entry_debit: 0,
            first_entry_credit: Number(totalAmount || 0),
            second_entry_account: receivableAccount.id, // Warehouse/Revenue (Credit)
            second_entry_debit: Number(totalAmount || 0),
            second_entry_credit: 0,
            status: 1,
          });
          if (account.id == WalkinAccount.id) {
            // await db.journals.add({
            //     date: new Date().toISOString().slice(0, 10),
            //     reference_id: returnId,
            //     reference_type: "inventory_record_return",
            //     description: `Payment for InventoryRecords Return #${returnId} of InventoryRecord #${inventory_record.invoice_number}`,
            //     currency: currency,
            //     first_entry_account: inventory_recordsAccount.id,
            //     first_entry_debit: Number(totalAmount),
            //     first_entry_credit: 0,
            //     second_entry_account: receivableAccount.id,
            //     second_entry_debit: 0,
            //     second_entry_credit: Number(totalAmount),
            //     status: 1,
            // });
            // await db.journals.add({
            //     date: new Date().toISOString().slice(0, 10),
            //     reference_id: returnId,
            //     reference_type: "inventory_record_return",
            //     description: `Payment for InventoryRecords Return #${returnId} of InventoryRecord #${inventory_record.invoice_number}`,
            //     currency: currency,
            //     first_entry_account: account.id,
            //     first_entry_debit: Number(totalAmount),
            //     first_entry_credit: 0,
            //     second_entry_account: TreasuryAccount.id,
            //     second_entry_debit: 0,
            //     second_entry_credit: Number(totalAmount),
            //     status: 1,
            // });
          }
        },
      );

      for (const i of addedItems) {
        await calculateProductStock(Number(i.product_id), 'single');
      }
      await calculateRemainingAndBenefit(Number(inventory_record.id));
      dispatch('saved');
      toast.success(t('Success'), t('InventoryRecord return recorded successfully.'));
      dispatch('close');
    } catch (err) {
      toast.error(t('Error'), t('Error saving inventory_record return: ') + err.message);
      console.error('Error saving inventory_record return:', err);
    } finally {
      saving = false;
    }
  }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal show d-block" tabindex="-1">
  <div class="modal-dialog modal-xl">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-arrow-return-left"></i>
          {t('InventoryRecords Return')}
        </h5>
        <button type="button" class="btn-close" on:click={() => dispatch('close')}></button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label class="form-label">{t('Return Date')}</label>
          <input type="date" class="form-control" bind:value={returnDate} />
        </div>
        <div class="mb-3">
          <label class="form-label">{t('Description')}</label>
          <textarea class="form-control" rows="2" bind:value={description}></textarea>
        </div>

        <div class="table-responsive">
          <table class="table table-bordered">
            <thead>
              <tr>
                <th>{t('Product')}</th>
                <th>{t('Remaining Qty')}</th>
                <th>{t('Return Qty')}</th>
                <th>{t('Sold Price')}</th>
                <th>{t('Return Price')}</th>
                <th>{t('Subtotal')}</th>
              </tr>
            </thead>
            <tbody>
              {#each returnItems as item, idx}
                <tr>
                  <td>{products.find((p) => p.id === item.product_id)?.name}</td>
                  <td
                    >{item.remaining_qty}
                    {units.find((u) => u.id === item.product_unit_id)?.name}</td>
                  <td>
                    <div class="input-group">
                      <input
                        type="number"
                        class="form-control"
                        min="0"
                        max={item.remaining_qty}
                        bind:value={item.return_quantity}
                        on:input={() => updateReturnItem(idx)} />
                      <span class="input-group-text">{units.find((u) => u.id === item.product_unit_id)?.name}</span>
                    </div>
                  </td>
                  <td>{item.unit_price} {t(item.currency)}</td>
                  <td>
                    <div class="input-group">
                      <input
                        type="number"
                        class="form-control"
                        min="0"
                        step="any"
                        bind:value={item.return_unit_price}
                        on:input={() => updateReturnItem(idx)} />
                      <span class="input-group-text">{t(item.currency)}</span>
                    </div>
                  </td>
                  <td>{item.return_subtotal} {t(item.currency)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="mt-3 text-end">
          <strong
            >{t('Total Return Amount')}: {totalAmount}
            {t(currency)}</strong>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={() => dispatch('close')}
          ><i class="bi bi-x-lg"></i> {t('Cancel')}</button>
        <button class="btn btn-primary" on:click={saveReturn} disabled={saving}
          ><i class="bi bi-save"></i> {t('Save Return')}</button>
      </div>
    </div>
  </div>
</div>
