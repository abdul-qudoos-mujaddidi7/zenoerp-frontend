import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const InventoryMethod = Object.freeze({
  CLASSIC: 'CLASSIC',
  FIFO: 'FIFO',
  LIFO: 'LIFO',
});

export function decimal(value) {
  if (value instanceof Decimal) return value;
  if (value === null || value === undefined || value === '') return new Decimal(0);
  return new Decimal(value);
}

export function positiveDecimal(value) {
  const d = decimal(value);
  if (d.lte(0)) throw new Error('Quantity must be positive.');
  return d;
}

export function nonNegativeDecimal(value) {
  const d = decimal(value);
  if (d.lt(0)) throw new Error('Quantity cannot be negative.');
  return d;
}

export function toInventoryDecimal(value) {
  return decimal(value).toFixed(6);
}

export function compareDecimal(a, b) {
  return decimal(a).cmp(decimal(b));
}

export function minDecimal(a, b) {
  const da = decimal(a);
  const db = decimal(b);
  return da.lte(db) ? da : db;
}

export function addDecimal(a, b) {
  return decimal(a).plus(decimal(b));
}

export function subDecimal(a, b) {
  return decimal(a).minus(decimal(b));
}

export function mulDecimal(a, b) {
  return decimal(a).times(decimal(b));
}

export function divDecimal(a, b) {
  const divisor = decimal(b);
  if (divisor.isZero()) throw new Error('Division by zero.');
  return decimal(a).div(divisor);
}

export function sortBatchesForMethod(batches, inventoryMethod) {
  const open = batches.filter(
    (b) =>
      b.status === 1 &&
      compareDecimal(b.quantity_remaining || 0, 0) > 0 &&
      (b.is_closed === undefined || b.is_closed === 0 || b.is_closed === false),
  );

  const sorted = [...open].sort((a, b) => {
    const aTime = new Date(a.received_at || 0).getTime();
    const bTime = new Date(b.received_at || 0).getTime();
    if (inventoryMethod === InventoryMethod.LIFO) {
      if (bTime !== aTime) return bTime - aTime;
      return Number(b.id) - Number(a.id);
    }
    if (aTime !== bTime) return aTime - bTime;
    return Number(a.id) - Number(b.id);
  });

  return sorted;
}

/**
 * Pure allocation — does not touch Dexie.
 */
export function allocateBatchConsumption({ batches, quantity, inventoryMethod }) {
  const qty = positiveDecimal(quantity);
  const ordered = sortBatchesForMethod(batches, inventoryMethod);
  let remaining = qty;
  const layers = [];
  let totalCogs = new Decimal(0);

  for (const batch of ordered) {
    if (remaining.lte(0)) break;

    const available = nonNegativeDecimal(batch.quantity_remaining || 0);
    if (available.isZero()) continue;

    const take = minDecimal(available, remaining);
    const unitCost = decimal(batch.unit_cost || 0);
    const layerCost = mulDecimal(take, unitCost);
    const nextRemaining = subDecimal(available, take);

    layers.push({
      batch,
      batchId: batch.id,
      quantity: toInventoryDecimal(take),
      unitCost: toInventoryDecimal(unitCost),
      layerCost: toInventoryDecimal(layerCost),
      nextQuantityRemaining: toInventoryDecimal(nextRemaining),
      isClosed: nextRemaining.isZero() ? 1 : 0,
    });

    totalCogs = totalCogs.plus(layerCost);
    remaining = remaining.minus(take);
  }

  if (remaining.gt(0)) {
    throw new Error('Not enough stock');
  }

  const averageUnitCost = qty.isZero() ? new Decimal(0) : totalCogs.div(qty);

  return {
    layers,
    totalCogs: toInventoryDecimal(totalCogs),
    averageUnitCost: toInventoryDecimal(averageUnitCost),
  };
}

export const operationKeys = {
  opening: (productId, warehouseId) => `PRODUCT_OPENING:${productId}:${warehouseId}`,
  purchase: (purchaseId, purchaseItemId) => `PURCHASE:${purchaseId}:ITEM:${purchaseItemId}`,
  sale: (saleId, saleItemId) => `SALE:${saleId}:ITEM:${saleItemId}`,
  purchaseReturn: (purchaseReturnId, itemId) =>
    `PURCHASE_RETURN:${purchaseReturnId}:ITEM:${itemId}`,
  saleReturn: (saleReturnId, itemId) => `SALE_RETURN:${saleReturnId}:ITEM:${itemId}`,
  waste: (wasteId, itemId) => `WASTE:${wasteId}:ITEM:${itemId}`,
  transferOut: (transferId, itemId) => `TRANSFER:${transferId}:ITEM:${itemId}:OUT`,
  transferIn: (transferId, itemId) => `TRANSFER:${transferId}:ITEM:${itemId}:IN`,
  purchaseBatch: (purchaseId, purchaseItemId) =>
    `PURCHASE:${purchaseId}:ITEM:${purchaseItemId}:BATCH`,
};
