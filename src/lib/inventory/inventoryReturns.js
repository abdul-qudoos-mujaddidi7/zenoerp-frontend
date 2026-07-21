import {
  decimal,
  toInventoryDecimal,
  subDecimal,
  addDecimal,
  minDecimal,
} from './inventoryCore.js';

export async function returnPurchaseToOriginalBatch(tables, { item, purchase, warehouseId, purchaseItemId }) {
  const remaining = decimal(item.return_quantity || item.quantity || 0);
  if (remaining.lte(0)) return;

  const productId = Number(item.product_id);
  const purchaseId = Number(purchase?.id);

  let batches = await tables.stock_batches
    .where({ product_id: productId, warehouse_id: Number(warehouseId) })
    .and((batch) => {
      const samePurchase =
        Number(batch.purchase_id) === purchaseId ||
        (batch.source_type === 'purchase' && Number(batch.source_id) === purchaseId);
      const sameItem =
        purchaseItemId == null ||
        Number(batch.purchase_item_id) === Number(purchaseItemId) ||
        Number(batch.source_item_id) === Number(purchaseItemId);
      return (
        samePurchase &&
        sameItem &&
        batch.status === 1 &&
        decimal(batch.quantity_remaining || 0).gt(0)
      );
    })
    .sortBy('received_at');

  if (!batches.length && purchaseItemId != null) {
    const key = `PURCHASE:${purchaseId}:ITEM:${purchaseItemId}:BATCH`;
    const byKey = await tables.stock_batches.where('idempotency_key').equals(key).first();
    if (byKey) batches = [byKey];
  }

  let availableTotal = decimal(0);
  for (const batch of batches) {
    availableTotal = availableTotal.plus(decimal(batch.quantity_remaining || 0));
  }

  if (availableTotal.lt(remaining)) {
    throw new Error('Not enough stock remains from this purchase batch to return.');
  }

  let left = remaining;
  for (const batch of [...batches].reverse()) {
    if (left.lte(0)) break;
    const available = decimal(batch.quantity_remaining || 0);
    const take = minDecimal(available, left);
    const next = subDecimal(available, take);
    await tables.stock_batches.update(batch.id, {
      quantity_remaining: toInventoryDecimal(next),
      is_closed: next.isZero() ? 1 : 0,
    });
    left = left.minus(take);
  }
}

export async function restoreSaleReturnToOriginalBatches(
  tables,
  { item, sale, warehouseId, saleReturnId, saleReturnItemId, currentReturnId = null, currentReturnQuantity = 0 },
) {
  const remaining = decimal(item.return_quantity || item.quantity || 0);
  if (remaining.lte(0)) return { restoredCogs: '0.000000' };

  const productId = Number(item.product_id);
  const saleId = Number(sale?.id);

  const saleReturns = await tables.sale_returns
    .where({ sale_id: saleId, status: 1 })
    .and((ret) => currentReturnId === null || Number(ret.id) !== Number(currentReturnId))
    .toArray();
  const saleReturnIds = saleReturns.map((ret) => Number(ret.id));

  let alreadyReturned = decimal(currentReturnQuantity || 0);
  if (saleReturnIds.length) {
    const returnItems = await tables.sale_return_items
      .where('sale_return_id')
      .anyOf(saleReturnIds)
      .and((retItem) => Number(retItem.product_id) === productId && retItem.status === 1)
      .toArray();
    for (const retItem of returnItems) {
      alreadyReturned = alreadyReturned.plus(decimal(retItem.quantity || 0));
    }
  }

  const consumptions = await tables.batch_consumptions
    .where({ sale_id: saleId, product_id: productId, status: 1 })
    .sortBy('id');

  let totalConsumed = decimal(0);
  for (const c of consumptions) {
    totalConsumed = totalConsumed.plus(decimal(c.quantity || 0));
  }

  if (alreadyReturned.plus(remaining).gt(totalConsumed)) {
    throw new Error('Sale return quantity is greater than the quantity consumed for this sale.');
  }

  let skip = alreadyReturned;
  let left = remaining;
  let restoredCogs = decimal(0);

  for (const consumption of consumptions) {
    if (left.lte(0)) break;

    const consumedQty = decimal(consumption.quantity || 0);
    if (skip.gte(consumedQty)) {
      skip = skip.minus(consumedQty);
      continue;
    }

    const restorable = consumedQty.minus(skip);
    const restoreQty = minDecimal(restorable, left);
    skip = decimal(0);

    const batch = await tables.stock_batches.get(consumption.stock_batch_id);
    if (!batch || Number(batch.warehouse_id) !== Number(warehouseId)) {
      throw new Error('Original batch for sale return was not found.');
    }

    const nextRemaining = addDecimal(batch.quantity_remaining || 0, restoreQty);
    await tables.stock_batches.update(batch.id, {
      quantity_remaining: toInventoryDecimal(nextRemaining),
      is_closed: 0,
    });

    const unitCost = decimal(consumption.unit_cost || batch.unit_cost || 0);
    const layerCost = restoreQty.times(unitCost);
    restoredCogs = restoredCogs.plus(layerCost);

    const returnKey = `SALE_RETURN:${saleReturnId}:ITEM:${saleReturnItemId}:CONSUMPTION:${consumption.id}`;
    await tables.stock_consumption_returns.add({
      sale_return_id: saleReturnId,
      sale_return_item_id: saleReturnItemId,
      stock_consumption_id: consumption.id,
      stock_batch_id: consumption.stock_batch_id,
      idempotency_key: returnKey,
      quantity: toInventoryDecimal(restoreQty),
      unit_cost: toInventoryDecimal(unitCost),
      total_cost: toInventoryDecimal(layerCost),
      status: 1,
      version: 1,
    });

    left = left.minus(restoreQty);
  }

  return { restoredCogs: toInventoryDecimal(restoredCogs) };
}

export function reverseClassicSaleCogs(item, product, exchangeRateFn, saleCurrency) {
  let costPrice = decimal(item.buy_price || product?.buy_price || 0);
  const costCurrency = item.buy_price_currency || product?.buy_currency || saleCurrency;
  if (exchangeRateFn && costCurrency !== saleCurrency) {
    costPrice = decimal(exchangeRateFn(Number(costPrice), costCurrency, saleCurrency));
  }
  return toInventoryDecimal(costPrice.times(decimal(item.return_quantity || item.quantity || 0)));
}
