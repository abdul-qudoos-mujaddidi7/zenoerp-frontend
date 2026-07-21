<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import Swal from 'sweetalert2';
  import AppModal from '../../components/common/AppModal.svelte';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let purchase = null; // parent passes purchase object

  const dispatch = createEventDispatcher();

  import { applyPurchaseReturn, INVENTORY_TX_STORES } from '../../lib/inventory/inventoryService.js';
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
    if (!purchase) return;
    warehouse = await db.warehouses
      .where('id')
      .equals(purchase.warehouse_id)
      .and((w) => w.status === 1)
      .first();
    account = await db.accounts
      .where('id')
      .equals(purchase.account_id)
      .and((a) => a.status === 1)
      .first();
    currencies = await db.currencies.where('status').equals(1).toArray();
    currency = purchase.currency || currencies[0]?.code || 'AFN';
    items = await db.purchase_items
      .where('purchase_id')
      .equals(purchase.id)
      .and((i) => i.status === 1)
      .toArray();
    units = await db.product_units.where('status').equals(1).toArray();
    products = await db.products.where('status').equals(1).toArray();
    returns = await db.purchase_returns
      .where('purchase_id')
      .equals(purchase.id)
      .and((r) => r.status === 1)
      .toArray();
    let tempReturnsWithItems = [];
    for (const r of returns) {
      const items = await db.purchase_return_items
        .where('purchase_return_id')
        .equals(Number(r.id))
        .and((ri) => ri.status === 1)
        .toArray();
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

  $: totalAmount = returnItems.reduce((s, i) => { 
    if (i.currency && currency && i.currency !== currency) {
      let exchangeRateValue = exchangeRate(i.return_subtotal, i.currency, currency);
      console.log(`Converting ${i.return_subtotal} from ${i.currency} to ${currency} for total calculation - exchange rate value: ${exchangeRateValue}`);
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
  

  async function saveReturn() {
    if (saving) return;
    if (!purchase || !warehouse || !account) {
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('Missing purchase, warehouse, or account.'),
        confirmButtonText: t('OK'),
      });
      return;
    }
    const validItems = returnItems.filter((i) => i.return_quantity > 0 && i.return_quantity <= i.quantity);
    if (validItems.length === 0) {
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('Select at least one item to return.'),
        confirmButtonText: t('OK'),
      });
      return;
    }

    saving = true;
    try {
      let addedItems = [];
      await db.transaction(
        'rw',
        [
          db.purchase_returns,
          db.purchase_return_items,
          db.journals,
          db.accounts,
          db.activity_logs,
          ...INVENTORY_TX_STORES,
        ],
        async (tx) => {
          const returnId = await db.purchase_returns.add({
            purchase_id: purchase.id,
            warehouse_id: warehouse.id,
            account_id: account.id,
            return_number: 'PR-' + Date.now(),
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
            table_name: 'purchase_returns',
            entity_id: returnId,
            old_values: null,
            new_values: JSON.stringify({
              purchase_id: purchase.id,
              warehouse_id: warehouse.id,
              account_id: account.id,
              return_number: 'PR-' + Date.now(),
              return_date: returnDate,
              total_amount: totalAmount,
              description,
              currency,
              return_status: 'confirmed',
              status: 1,
              updated_at: new Date().toISOString(),
            }),
            description: `Created purchase return #${returnId}`,
          });
          for (const i of validItems) {
            const purchaseReturnItemId = await db.purchase_return_items.add({
              purchase_return_id: returnId,
              product_id: i.product_id,
              product_unit_id: i.product_unit_id,
              quantity: i.return_quantity,
              unit_price: i.return_unit_price,
              currency,
              subtotal: i.return_subtotal,
              status: 1,
              updated_at: new Date().toISOString(),
            });
            await applyPurchaseReturn(tx, {
              purchaseReturnId: returnId,
              purchaseReturnItemId,
              item: {
                ...i,
                quantity: i.return_quantity,
                unit_price: i.return_unit_price,
                currency,
              },
              purchase,
              warehouseId: warehouse.id,
              returnDate,
            });
            addedItems.push(i);
          }
          const payableAccount = await db.accounts
            .where('code')
            .equals('PAYABLE')
            .and((a) => a.status === 1)
            .first();
          if (!payableAccount) {
            throw new Error('PAYABLE account not found');
          }
          const purchaseAccount = await db.accounts
            .where('code')
            .equals('PURCHASE')
            .and((a) => a.status === 1)
            .first();
          if (!purchaseAccount) {
            throw new Error('PURCHASE account not found');
          }
          const TreasuryAccount = await db.accounts
            .where('code')
            .equals('TREASURY')
            .and((a) => a.status === 1)
            .first();

          if (!TreasuryAccount) {
            throw new Error('TREASURY account not found');
          }

          await db.journals.add({
            date: new Date().toISOString().slice(0, 10),
            reference_id: returnId,
            reference_type: 'purchase_return',
            description: `Purchase Return Transaction for Purchase #${purchase.bill_number}`,
            currency: currency,
            first_entry_account: account.id,
            first_entry_debit: Number(totalAmount || 0),
            first_entry_credit: 0,
            second_entry_account: payableAccount.id,
            second_entry_debit: 0,
            second_entry_credit: Number(totalAmount || 0),
            status: 1,
          });
          // await db.journals.add({
          //     date: new Date().toISOString().slice(0, 10),
          //     reference_id: returnId,
          //     reference_type: "purchase_return",
          //     description: `Adjustment for Purchase Return #${returnId} of Purchase #${purchase.bill_number}`,
          //     currency: currency,
          //     first_entry_account: purchaseAccount.id,
          //     first_entry_debit: 0,
          //     first_entry_credit: Number(totalAmount || 0),
          //     second_entry_account: payableAccount.id,
          //     second_entry_debit: Number(totalAmount || 0),
          //     second_entry_credit: 0,
          //     status: 1,
          // });
          // await db.journals.add({
          //     date: new Date().toISOString().slice(0, 10),
          //     reference_id: returnId,
          //     reference_type: "purchase_return",
          //     description: `Payment/Settlement for Purchase Return #${returnId} of Purchase #${purchase.bill_number}`,
          //     currency: currency,
          //     first_entry_account: account.id,
          //     first_entry_debit: 0,
          //     first_entry_credit: Number(totalAmount || 0),
          //     second_entry_account: TreasuryAccount.id,
          //     second_entry_debit: Number(totalAmount || 0),
          //     second_entry_credit: 0,
          //     status: 1,
          // });
        },
      );
      for (const i of addedItems) {
        await calculateProductStock(Number(i.product_id));
      }

      dispatch('saved');
      Swal.fire({
        icon: 'success',
        title: t('Success'),
        text: t('Purchase return recorded successfully.'),
        confirmButtonText: t('OK'),
      });
      dispatch('close');
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('Error saving purchase return: ') + err.message,
        confirmButtonText: t('OK'),
      });
    } finally {
      saving = false;
    }
  }
</script>

<AppModal
  title={t('Purchase Return')}
  icon="bi-arrow-return-left"
  variant="warning"
  size="xl"
  loading={saving}
  on:close={() => dispatch('close')}>
  <div class="app-modal-field" style="margin-bottom: 14px;">
    <label for="return-date">{t('Return Date')}</label>
    <input id="return-date" type="date" bind:value={returnDate} />
  </div>
  <div class="app-modal-field" style="margin-bottom: 16px;">
    <label for="return-description">{t('Description')}</label>
    <textarea id="return-description" rows="2" bind:value={description}></textarea>
  </div>

  <div class="return-table-wrap">
    <table class="return-table">
      <thead>
        <tr>
          <th>{t('Product')}</th>
          <th>{t('Remaining Qty')}</th>
          <th>{t('Return Qty')}</th>
          <th>{t('Purchased Price')}</th>
          <th>{t('Return Price')}</th>
          <th class="return-table__num">{t('Subtotal')}</th>
        </tr>
      </thead>
      <tbody>
        {#each returnItems as item, idx}
          <tr>
            <td>{products.find((p) => p.id === item.product_id)?.name}</td>
            <td>{item.remaining_qty} {units.find((u) => u.id === item.product_unit_id)?.name}</td>
            <td>
              <div class="return-table__input-group">
                <input
                  type="number"
                  min="0"
                  max={item.remaining_qty}
                  bind:value={item.return_quantity}
                  on:input={() => updateReturnItem(idx)} />
                <span>{units.find((u) => u.id === item.product_unit_id)?.name}</span>
              </div>
            </td>
            <td class="return-table__num">{item.unit_price} {t(item.currency)}</td>
            <td>
              <div class="return-table__input-group">
                <input
                  type="number"
                  min="0"
                  step="any"
                  bind:value={item.return_unit_price}
                  on:input={() => updateReturnItem(idx)} />
                <span>{t(item.currency)}</span>
              </div>
            </td>
            <td class="return-table__num return-table__amount">
              {#if item.currency !== currency}
                {exchangeRate(Number(item.unit_price), item.currency, currency).toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(currency)}
              {:else}
                {item.subtotal} {t(currency)}
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="return-total">
    <strong>{t('Total Return Amount')}:</strong>
    <span dir="ltr">{totalAmount.toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(currency)}</span>
  </div>

  <svelte:fragment slot="footer">
    <button type="button" class="app-modal-btn app-modal-btn--secondary" disabled={saving} on:click={() => dispatch('close')}>
      <i class="bi bi-x-lg"></i>
      {t('Cancel')}
    </button>
    <button type="button" class="app-modal-btn app-modal-btn--primary" on:click={saveReturn} disabled={saving}>
      {#if saving}
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      {:else}
        <i class="bi bi-save"></i>
      {/if}
      {t('Save Return')}
    </button>
  </svelte:fragment>
</AppModal>

<style>
  .return-table-wrap {
    overflow-x: auto;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
  }

  .return-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .return-table th {
    background: #f8fafc;
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
    padding: 10px 12px;
    text-align: start;
    border-bottom: 1px solid #e2e8f0;
  }

  .return-table td {
    padding: 10px 12px;
    border-block-start: 1px solid #f1f5f9;
    font-size: 13px;
    vertical-align: middle;
  }

  .return-table__num,
  .return-table th.return-table__num {
    text-align: end;
  }

  .return-table__amount {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .return-table__input-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .return-table__input-group input {
    flex: 1;
    min-width: 0;
    min-height: 36px;
    padding: 6px 10px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 13px;
  }

  .return-table__input-group span {
    font-size: 12px;
    color: #64748b;
    white-space: nowrap;
  }

  .return-total {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    font-size: 14px;
  }

  .return-total span {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #0f172a;
  }
</style>
