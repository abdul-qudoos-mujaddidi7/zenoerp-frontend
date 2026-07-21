import {
  allocateBatchConsumption,
  toInventoryDecimal,
  decimal,
  addDecimal,
  subDecimal,
  operationKeys,
} from './inventoryCore.js';
import { upsertWarehouseProductQuantity } from './classicInventory.js';

export async function getOpenBatches(table, productId, warehouseId) {
  return table
    .where({ product_id: productId, warehouse_id: warehouseId })
    .and(
      (b) =>
        b.status === 1 &&
        decimal(b.quantity_remaining || 0).gt(0) &&
        (b.is_closed === undefined || b.is_closed === 0 || b.is_closed === false),
    )
    .toArray();
}

export async function createStockBatch(table, batch) {
  const qty = toInventoryDecimal(batch.quantity_in);
  return table.add({
    status: 1,
    version: 1,
    is_closed: 0,
    quantity_remaining: qty,
    quantity_in: qty,
    unit_cost: toInventoryDecimal(batch.unit_cost),
    received_at: batch.received_at || new Date().toISOString(),
    ...batch,
  });
}

export async function consumeBatchesLocal(
  tables,
  { allocation, operationType, operationId, operationItemId, saleId, saleItemId, productId, warehouseId },
) {
  const { layers } = allocation;
  const consumptions = [];

  for (const layer of layers) {
    await tables.stock_batches.update(layer.batchId, {
      quantity_remaining: layer.nextQuantityRemaining,
      is_closed: layer.isClosed,
    });

    const idempotencyKey = `${operationType}:${operationId}:ITEM:${operationItemId}:BATCH:${layer.batchId}`;
    const consumptionId = await tables.batch_consumptions.add({
      operation_type: operationType,
      operation_id: operationId,
      operation_item_id: operationItemId,
      sale_id: saleId ?? null,
      sale_item_id: saleItemId ?? null,
      product_id: productId,
      warehouse_id: warehouseId,
      stock_batch_id: layer.batchId,
      idempotency_key: idempotencyKey,
      quantity: layer.quantity,
      unit_cost: layer.unitCost,
      total_cost: layer.layerCost,
      status: 1,
      version: 1,
    });

    consumptions.push({ id: consumptionId, ...layer });
  }

  return consumptions;
}

export async function sumBatchRemaining(table, warehouseId, productId) {
  const batches = await getOpenBatches(table, productId, warehouseId);
  let total = decimal(0);
  for (const batch of batches) {
    total = total.plus(decimal(batch.quantity_remaining || 0));
  }
  // include closed batches with remaining > 0 edge case
  const allBatches = await table.where({ warehouse_id: warehouseId, product_id: productId, status: 1 }).toArray();
  total = decimal(0);
  for (const batch of allBatches) {
    total = total.plus(decimal(batch.quantity_remaining || 0));
  }
  return toInventoryDecimal(total);
}

export async function recalculateBatchProductStock(db, productId, decomposeQuantityFn) {
  const warehouses = await db.warehouses.where('status').equals(1).toArray();
  const product = await db.products.get(productId);
  if (!product) return;

  let allTotal = decimal(0);
  const balance = {};

  for (const w of warehouses) {
    const qty = await sumBatchRemaining(db.stock_batches, w.id, productId);
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

export { allocateBatchConsumption, operationKeys };
