import {
  decimal,
  toInventoryDecimal,
  addDecimal,
  subDecimal,
  InventoryMethod,
} from './inventoryCore.js';

const INBOUND_TYPES = new Set([
  'purchase',
  'adjustment_in',
  'sale_return',
  'transfer_in',
  'production_in',
  'inventory_record_return',
]);

const OUTBOUND_TYPES = new Set([
  'sale',
  'purchase_return',
  'waste',
  'transfer_out',
  'production_out',
  'adjustment_out',
]);

export function signedTransactionQuantity(tx) {
  const qty = decimal(tx.quantity || 0);
  if (INBOUND_TYPES.has(tx.transaction_type)) return qty;
  if (OUTBOUND_TYPES.has(tx.transaction_type)) return qty.negated();
  return qty;
}

export async function sumClassicTransactions(table, warehouseId, productId) {
  const txs = await table
    .where({ warehouse_id: warehouseId, product_id: productId, status: 1 })
    .toArray();

  let total = decimal(0);
  for (const tx of txs) {
    total = total.plus(signedTransactionQuantity(tx));
  }
  return toInventoryDecimal(total);
}

export async function upsertWarehouseProductQuantity(
  table,
  { warehouseId, productId, productUnitId, quantity },
) {
  const qty = toInventoryDecimal(quantity);
  const existing = await table
    .where({ warehouse_id: warehouseId, product_id: productId, status: 1 })
    .first();

  if (existing) {
    await table.update(existing.id, { quantity: qty });
    return existing.id;
  }

  return table.add({
    warehouse_id: warehouseId,
    product_id: productId,
    product_unit_id: productUnitId,
    quantity: qty,
    status: 1,
  });
}

export async function adjustWarehouseProductDelta(
  table,
  { warehouseId, productId, productUnitId, deltaQty },
) {
  const existing = await table
    .where({ warehouse_id: warehouseId, product_id: productId, status: 1 })
    .first();

  const delta = decimal(deltaQty);
  if (existing) {
    const next = addDecimal(existing.quantity || 0, delta);
    await table.update(existing.id, { quantity: toInventoryDecimal(next) });
    return existing.id;
  }

  if (delta.lte(0)) {
    throw new Error('Cannot reduce stock for a product with no warehouse balance.');
  }

  return table.add({
    warehouse_id: warehouseId,
    product_id: productId,
    product_unit_id: productUnitId,
    quantity: toInventoryDecimal(delta),
    status: 1,
  });
}

export async function insertStockTransaction(table, record) {
  return table.add({
    status: 1,
    version: 1,
    ...record,
    quantity: toInventoryDecimal(record.quantity),
    unit_cost: record.unit_cost != null ? toInventoryDecimal(record.unit_cost) : null,
    total_cost: record.total_cost != null ? toInventoryDecimal(record.total_cost) : null,
  });
}

export function classicSaleCogs(item, product, exchangeRateFn, saleCurrency) {
  let costPrice = decimal(item.buy_price || product?.buy_price || 0);
  const costCurrency = item.buy_price_currency || product?.buy_currency || saleCurrency;

  if (exchangeRateFn && costCurrency !== saleCurrency) {
    costPrice = decimal(exchangeRateFn(Number(costPrice), costCurrency, saleCurrency));
  }

  const lineCogs = costPrice.times(decimal(item.quantity || 0));
  return {
    cogs: toInventoryDecimal(lineCogs),
    averageUnitCost: toInventoryDecimal(costPrice),
  };
}

export async function recalculateClassicProductStock(db, productId, decomposeQuantityFn) {
  const warehouses = await db.warehouses.where('status').equals(1).toArray();
  const product = await db.products.get(productId);
  if (!product) return;

  let allTotal = decimal(0);
  const balance = {};

  for (const w of warehouses) {
    const qty = await sumClassicTransactions(db.stock_transactions, w.id, productId);
    balance[w.id] = qty;
    allTotal = allTotal.plus(decimal(qty));
    await upsertWarehouseProductQuantity(db.warehouse_products, {
      warehouseId: w.id,
      productId,
      productUnitId: product.product_unit_id,
      quantity: qty,
    });
  }

  const unitParts = decomposeQuantityFn
    ? await decomposeQuantityFn(Number(allTotal), product.product_unit_id)
    : [];

  await db.products.update(productId, {
    quantity: toInventoryDecimal(allTotal),
    benefit: JSON.stringify({
      balance,
      alltotalStock: toInventoryDecimal(allTotal),
      unit_parts: unitParts,
    }),
  });
}

export { InventoryMethod };
