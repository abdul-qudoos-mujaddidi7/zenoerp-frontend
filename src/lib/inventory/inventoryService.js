import { db, getCurrentTimestamp } from '../../db.js';
import {
  operationKeys,
  allocateBatchConsumption,
  toInventoryDecimal,
  decimal,
  InventoryMethod,
} from './inventoryCore.js';
import {
  insertStockTransaction,
  adjustWarehouseProductDelta,
  classicSaleCogs,
  recalculateClassicProductStock,
} from './classicInventory.js';
import {
  createStockBatch,
  consumeBatchesLocal,
  getOpenBatches,
  recalculateBatchProductStock,
} from './batchInventory.js';
import {
  returnPurchaseToOriginalBatch,
  restoreSaleReturnToOriginalBatches,
  reverseClassicSaleCogs,
} from './inventoryReturns.js';
import { getInventoryMethod, isBatchMethod, setOrganizationContext, fetchOrganizationInventoryMethod } from '../../stores/organizationStore.js';
import { decomposeQuantity, convertUnitSync, ensureProductUnitsLoaded } from '../../pages/stocktransactions/calculateStock.js';

export const INVENTORY_TX_STORES = [
  'stock_transactions',
  'warehouse_products',
  'stock_batches',
  'batch_consumptions',
  'stock_consumption_returns',
  'inventory_operations',
  'products',
  'product_units',
  'sale_returns',
  'sale_return_items',
];

function tablesFromTx(tx) {
  return {
    stock_transactions: tx.table('stock_transactions'),
    warehouse_products: tx.table('warehouse_products'),
    stock_batches: tx.table('stock_batches'),
    batch_consumptions: tx.table('batch_consumptions'),
    stock_consumption_returns: tx.table('stock_consumption_returns'),
    inventory_operations: tx.table('inventory_operations'),
    products: tx.table('products'),
    sale_returns: tx.table('sale_returns'),
    sale_return_items: tx.table('sale_return_items'),
  };
}

async function ensureOperation(tables, { operationKey, operationType, referenceId, referenceItemId, inventoryMethod }) {
  const existing = await tables.inventory_operations.where('operation_key').equals(operationKey).first();
  if (existing) {
    return { skipped: true, operation: existing };
  }

  const id = await tables.inventory_operations.add({
    operation_key: operationKey,
    operation_type: operationType,
    reference_id: referenceId,
    reference_item_id: referenceItemId,
    inventory_method: inventoryMethod,
    status: 1,
    version: 1,
  });

  return { skipped: false, operationId: id };
}

async function ensureInventoryMethod(methodOverride) {
  if (methodOverride) return methodOverride;

  const cached = getInventoryMethod();
  if (cached) return cached;

  try {
    return await fetchOrganizationInventoryMethod();
  } catch (error) {
    console.warn('Inventory method fetch failed; using CLASSIC for legacy organization.', error);
    setOrganizationContext({ inventoryMethod: InventoryMethod.CLASSIC });
    return InventoryMethod.CLASSIC;
  }
}

function discountedPurchaseUnitCost(item) {
  let price = decimal(item.unit_price || 0);
  if (item.discount_type && item.discount_amount) {
    if (item.discount_type === 'percent') {
      price = price.times(decimal(1).minus(decimal(item.discount_amount).div(100)));
    } else if (item.discount_type === 'fixed') {
      price = price.minus(decimal(item.discount_amount).div(decimal(item.quantity || 1)));
    }
  }
  return toInventoryDecimal(price);
}

async function resolveProductAndBaseQuantity(tables, item, productOverride) {
  let product = productOverride || null;

  if (!product && item?.product_id && tables.products) {
    product = await tables.products.get(item.product_id);
  }

  if (!product) {
    throw new Error(`Product not found for inventory line item #${item?.product_id}`);
  }

  const rawQty = item?.return_quantity ?? item?.quantity ?? 0;
  const lineQty = decimal(rawQty);
  const fromUnitId = Number(item?.product_unit_id || product.product_unit_id);
  const baseUnitId = Number(product.product_unit_id);

  let baseQty = lineQty;
  if (fromUnitId && baseUnitId && fromUnitId !== baseUnitId) {
    await ensureProductUnitsLoaded();
    baseQty = decimal(convertUnitSync(Number(lineQty), fromUnitId, baseUnitId));
  }

  return {
    product,
    lineQty: toInventoryDecimal(lineQty),
    baseQty: toInventoryDecimal(baseQty),
    baseUnitId,
  };
}

function inventoryLineForCost(item, baseQty) {
  return {
    ...item,
    quantity: Number(baseQty),
    return_quantity: Number(baseQty),
  };
}

export async function applyOpeningStock(tx, params) {
  const tables = tablesFromTx(tx);
  const method = await ensureInventoryMethod(params.inventoryMethod);
  const {
    productId,
    warehouseId,
    productUnitId,
    quantity,
    unitCost,
    currency,
    sellPrice,
    sellCurrency,
    batchMeta = {},
    product: productOverride = null,
  } = params;

  const qty = decimal(quantity || 0);
  if (qty.lte(0)) return { skipped: true, reason: 'zero_quantity' };

  const opKey = operationKeys.opening(productId, warehouseId);
  const guard = await ensureOperation(tables, {
    operationKey: opKey,
    operationType: 'OPENING',
    referenceId: productId,
    referenceItemId: warehouseId,
    inventoryMethod: method,
  });
  if (guard.skipped) return guard;

  const { baseQty, baseUnitId, lineQty } = await resolveProductAndBaseQuantity(
    tables,
    { product_id: productId, product_unit_id: productUnitId, quantity },
    productOverride || { id: productId, product_unit_id: productUnitId },
  );
  const openingUnitCost = toInventoryDecimal(unitCost || 0);
  const subtotalDec = decimal(openingUnitCost).times(decimal(lineQty));
  const subtotal = toInventoryDecimal(subtotalDec);
  const baseUnitCost = decimal(baseQty).gt(0)
    ? toInventoryDecimal(subtotalDec.div(decimal(baseQty)))
    : openingUnitCost;

  await insertStockTransaction(tables.stock_transactions, {
    warehouse_id: warehouseId,
    product_id: productId,
    product_unit_id: baseUnitId,
    reference_id: productId,
    reference_type: 'manual_adjustment',
    transaction_type: 'adjustment_in',
    quantity: baseQty,
    unit_cost: baseUnitCost,
    total_cost: subtotal,
    currency,
    peer_price: sellPrice != null ? toInventoryDecimal(sellPrice) : null,
    peer_currency: sellCurrency || currency,
    date: getCurrentTimestamp(),
    description: `Initial stock for product #${productId}`,
    idempotency_key: opKey,
  });

  if (isBatchMethod(method)) {
    await createStockBatch(tables.stock_batches, {
      product_id: productId,
      warehouse_id: warehouseId,
      quantity_in: baseQty,
      unit_cost: baseUnitCost,
      currency,
      received_at: getCurrentTimestamp(),
      source_type: 'OPENING',
      source_id: productId,
      idempotency_key: opKey,
      batch_number: batchMeta.batch || null,
      manufacturing_date: batchMeta.manufacturing_date || null,
      expiry_date: batchMeta.expiry_date || null,
    });
  }

  await adjustWarehouseProductDelta(tables.warehouse_products, {
    warehouseId,
    productId,
    productUnitId: baseUnitId,
    deltaQty: baseQty,
  });

  return { skipped: false, operationId: guard.operationId };
}

export async function applyPurchase(tx, params) {
  const tables = tablesFromTx(tx);
  const method = await ensureInventoryMethod(params.inventoryMethod);
  const { purchaseId, purchaseItemId, item, warehouseId, purchaseDate, purchaseDescription } = params;

  const opKey = operationKeys.purchase(purchaseId, purchaseItemId);
  const guard = await ensureOperation(tables, {
    operationKey: opKey,
    operationType: 'PURCHASE',
    referenceId: purchaseId,
    referenceItemId: purchaseItemId,
    inventoryMethod: method,
  });
  if (guard.skipped) return guard;

  const { product, baseQty, baseUnitId, lineQty } = await resolveProductAndBaseQuantity(
    tables,
    item,
    params.product,
  );
  const lineUnitCost = discountedPurchaseUnitCost(item);
  const subtotalDec = decimal(lineUnitCost).times(decimal(lineQty));
  const subtotal = toInventoryDecimal(subtotalDec);
  const baseUnitCost = decimal(baseQty).gt(0)
    ? toInventoryDecimal(subtotalDec.div(decimal(baseQty)))
    : lineUnitCost;

  await insertStockTransaction(tables.stock_transactions, {
    warehouse_id: warehouseId,
    product_id: item.product_id,
    product_unit_id: baseUnitId,
    reference_id: purchaseId,
    reference_item_id: purchaseItemId,
    reference_type: 'purchase',
    transaction_type: 'purchase',
    quantity: baseQty,
    unit_cost: baseUnitCost,
    total_cost: subtotal,
    currency: item.unit_price_currency || item.currency,
    peer_price: item.sell_price != null ? toInventoryDecimal(item.sell_price) : null,
    peer_currency: item.sell_price_currency || item.currency,
    expiry_date: item.expiry_date || null,
    batch: item.batch || null,
    manufacturing_date: item.manufacturing_date || null,
    heaviness: item.heaviness != null ? item.heaviness : null,
    date: purchaseDate,
    description: purchaseDescription || `Stock added from Purchase #${purchaseId}`,
    idempotency_key: opKey,
  });

  if (isBatchMethod(method)) {
    const batchKey = operationKeys.purchaseBatch(purchaseId, purchaseItemId);
    await createStockBatch(tables.stock_batches, {
      product_id: item.product_id,
      warehouse_id: warehouseId,
      purchase_id: purchaseId,
      purchase_item_id: purchaseItemId,
      quantity_in: baseQty,
      unit_cost: baseUnitCost,
      currency: item.unit_price_currency || item.currency,
      received_at: getCurrentTimestamp(),
      source_type: 'purchase',
      source_id: purchaseId,
      source_item_id: purchaseItemId,
      idempotency_key: batchKey,
      batch_number: item.batch || null,
      manufacturing_date: item.manufacturing_date || null,
      expiry_date: item.expiry_date || null,
    });
  }

  await adjustWarehouseProductDelta(tables.warehouse_products, {
    warehouseId,
    productId: item.product_id,
    productUnitId: baseUnitId,
    deltaQty: baseQty,
  });

  return { skipped: false, operationId: guard.operationId };
}

export async function applySale(tx, params) {
  const tables = tablesFromTx(tx);
  const method = await ensureInventoryMethod(params.inventoryMethod);
  const {
    saleId,
    saleItemId,
    item,
    warehouseId,
    saleDate,
    saleCurrency,
    product,
    exchangeRateFn,
  } = params;

  const opKey = operationKeys.sale(saleId, saleItemId);
  const guard = await ensureOperation(tables, {
    operationKey: opKey,
    operationType: 'SALE',
    referenceId: saleId,
    referenceItemId: saleItemId,
    inventoryMethod: method,
  });
  if (guard.skipped) return { ...guard, cogs: null };

  const { product: resolvedProduct, baseQty, baseUnitId } = await resolveProductAndBaseQuantity(
    tables,
    item,
    product,
  );
  const qty = baseQty;
  const inventoryItem = inventoryLineForCost(item, baseQty);
  let cogs = '0.000000';
  let averageUnitCost = '0.000000';
  let fifoCost = '0.000000';
  let profit = '0.000000';

  if (isBatchMethod(method)) {
    const batches = await getOpenBatches(tables.stock_batches, item.product_id, warehouseId);
    const allocation = allocateBatchConsumption({
      batches,
      quantity: qty,
      inventoryMethod: method,
    });

    await consumeBatchesLocal(tables, {
      allocation,
      operationType: 'SALE',
      operationId: saleId,
      operationItemId: saleItemId,
      saleId,
      saleItemId,
      productId: item.product_id,
      warehouseId,
    });

    cogs = allocation.totalCogs;
    averageUnitCost = allocation.averageUnitCost;
    fifoCost = allocation.totalCogs;
  } else {
    const classic = classicSaleCogs(inventoryItem, resolvedProduct, exchangeRateFn, saleCurrency);
    cogs = classic.cogs;
    averageUnitCost = classic.averageUnitCost;
    fifoCost = '0.000000';
  }

  const revenue = decimal(
    item.subtotal ||
      decimal(item.calculated_price || item.unit_price || 0).times(decimal(item.quantity || 0)),
  );
  profit = toInventoryDecimal(revenue.minus(decimal(cogs)));

  await insertStockTransaction(tables.stock_transactions, {
    warehouse_id: warehouseId,
    product_id: item.product_id,
    product_unit_id: baseUnitId,
    reference_id: saleId,
    reference_item_id: saleItemId,
    reference_type: 'sale',
    transaction_type: 'sale',
    quantity: qty,
    unit_cost: item.calculated_price != null ? toInventoryDecimal(item.calculated_price) : toInventoryDecimal(item.unit_price),
    total_cost: toInventoryDecimal(revenue),
    currency: item.currency || saleCurrency,
    peer_price: item.buy_price != null ? toInventoryDecimal(item.buy_price) : null,
    peer_currency: item.buy_price_currency || item.currency || saleCurrency,
    date: saleDate,
    description: `Stock deducted from Sale #${saleId}`,
    idempotency_key: opKey,
  });

  await adjustWarehouseProductDelta(tables.warehouse_products, {
    warehouseId,
    productId: item.product_id,
    productUnitId: baseUnitId,
    deltaQty: toInventoryDecimal(decimal(qty).negated()),
  });

  return {
    skipped: false,
    operationId: guard.operationId,
    cogs,
    averageUnitCost,
    fifo_cost: fifoCost,
    profit,
    gross_profit: profit,
  };
}

export async function applyPurchaseReturn(tx, params) {
  const tables = tablesFromTx(tx);
  const method = await ensureInventoryMethod(params.inventoryMethod);
  const { purchaseReturnId, purchaseReturnItemId, item, purchase, warehouseId, returnDate } = params;

  const opKey = operationKeys.purchaseReturn(purchaseReturnId, purchaseReturnItemId);
  const guard = await ensureOperation(tables, {
    operationKey: opKey,
    operationType: 'PURCHASE_RETURN',
    referenceId: purchaseReturnId,
    referenceItemId: purchaseReturnItemId,
    inventoryMethod: method,
  });
  if (guard.skipped) return guard;

  const { baseQty, baseUnitId, lineQty } = await resolveProductAndBaseQuantity(tables, item, params.product);
  const lineUnitCost = toInventoryDecimal(item.unit_price || 0);
  const subtotalDec = decimal(lineUnitCost).times(decimal(lineQty));
  const subtotal = toInventoryDecimal(subtotalDec);
  const baseUnitCost = decimal(baseQty).gt(0)
    ? toInventoryDecimal(subtotalDec.div(decimal(baseQty)))
    : lineUnitCost;

  await insertStockTransaction(tables.stock_transactions, {
    warehouse_id: warehouseId,
    product_id: item.product_id,
    product_unit_id: baseUnitId,
    reference_id: purchaseReturnId,
    reference_item_id: purchaseReturnItemId,
    reference_type: 'purchase_return',
    transaction_type: 'purchase_return',
    quantity: baseQty,
    unit_cost: baseUnitCost,
    total_cost: subtotal,
    currency: item.currency,
    date: returnDate,
    description: `Purchase return #${purchaseReturnId}`,
    idempotency_key: opKey,
  });

  if (isBatchMethod(method)) {
    await returnPurchaseToOriginalBatch(tables, {
      item: inventoryLineForCost(item, baseQty),
      purchase,
      warehouseId,
      purchaseItemId: item.purchase_item_id,
    });
  }

  await adjustWarehouseProductDelta(tables.warehouse_products, {
    warehouseId,
    productId: item.product_id,
    productUnitId: baseUnitId,
    deltaQty: toInventoryDecimal(decimal(baseQty).negated()),
  });

  return { skipped: false, operationId: guard.operationId };
}

export async function applySaleReturn(tx, params) {
  const tables = tablesFromTx(tx);
  const method = await ensureInventoryMethod(params.inventoryMethod);
  const {
    saleReturnId,
    saleReturnItemId,
    item,
    sale,
    warehouseId,
    returnDate,
    currentReturnId,
    currentReturnQuantity,
    product,
    exchangeRateFn,
    saleCurrency,
  } = params;

  const opKey = operationKeys.saleReturn(saleReturnId, saleReturnItemId);
  const guard = await ensureOperation(tables, {
    operationKey: opKey,
    operationType: 'SALE_RETURN',
    referenceId: saleReturnId,
    referenceItemId: saleReturnItemId,
    inventoryMethod: method,
  });
  if (guard.skipped) return guard;

  const { product: resolvedProduct, baseQty, baseUnitId, lineQty } = await resolveProductAndBaseQuantity(
    tables,
    item,
    product,
  );
  const qty = baseQty;
  const inventoryItem = inventoryLineForCost(item, baseQty);
  let restoredCogs = '0.000000';

  if (isBatchMethod(method)) {
    const result = await restoreSaleReturnToOriginalBatches(tables, {
      item: inventoryItem,
      sale,
      warehouseId,
      saleReturnId,
      saleReturnItemId,
      currentReturnId,
      currentReturnQuantity,
    });
    restoredCogs = result.restoredCogs;
  } else {
    restoredCogs = reverseClassicSaleCogs(inventoryItem, resolvedProduct, exchangeRateFn, saleCurrency);
  }

  await insertStockTransaction(tables.stock_transactions, {
    warehouse_id: warehouseId,
    product_id: item.product_id,
    product_unit_id: baseUnitId,
    reference_id: saleReturnId,
    reference_item_id: saleReturnItemId,
    reference_type: 'sale_return',
    transaction_type: 'sale_return',
    quantity: qty,
    unit_cost: item.unit_price != null ? toInventoryDecimal(item.unit_price) : restoredCogs,
    total_cost: toInventoryDecimal(decimal(item.unit_price || 0).times(decimal(lineQty))),
    currency: item.currency,
    date: returnDate,
    description: `Sale return #${saleReturnId}`,
    idempotency_key: opKey,
  });

  await adjustWarehouseProductDelta(tables.warehouse_products, {
    warehouseId,
    productId: item.product_id,
    productUnitId: baseUnitId,
    deltaQty: qty,
  });

  return { skipped: false, operationId: guard.operationId, restoredCogs };
}

export async function applyWaste(tx, params) {
  const tables = tablesFromTx(tx);
  const method = await ensureInventoryMethod(params.inventoryMethod);
  const { wasteId, wasteItemId, item, warehouseId, wasteDate } = params;

  const opKey = operationKeys.waste(wasteId, wasteItemId);
  const guard = await ensureOperation(tables, {
    operationKey: opKey,
    operationType: 'WASTE',
    referenceId: wasteId,
    referenceItemId: wasteItemId,
    inventoryMethod: method,
  });
  if (guard.skipped) return guard;

  const { baseQty, baseUnitId, lineQty } = await resolveProductAndBaseQuantity(tables, item, params.product);
  const qty = baseQty;
  let cogs = '0.000000';

  if (isBatchMethod(method)) {
    const batches = await getOpenBatches(tables.stock_batches, item.product_id, warehouseId);
    const allocation = allocateBatchConsumption({
      batches,
      quantity: qty,
      inventoryMethod: method,
    });
    await consumeBatchesLocal(tables, {
      allocation,
      operationType: 'WASTE',
      operationId: wasteId,
      operationItemId: wasteItemId,
      productId: item.product_id,
      warehouseId,
    });
    cogs = allocation.totalCogs;
  }

  await insertStockTransaction(tables.stock_transactions, {
    warehouse_id: warehouseId,
    product_id: item.product_id,
    product_unit_id: baseUnitId,
    reference_id: wasteId,
    reference_item_id: wasteItemId,
    reference_type: 'waste',
    transaction_type: 'waste',
    quantity: qty,
    unit_cost: item.unit_price != null ? toInventoryDecimal(item.unit_price) : cogs,
    total_cost: toInventoryDecimal(decimal(item.unit_price || cogs).times(decimal(lineQty))),
    currency: item.currency,
    date: wasteDate,
    description: `Waste #${wasteId}`,
    idempotency_key: opKey,
  });

  await adjustWarehouseProductDelta(tables.warehouse_products, {
    warehouseId,
    productId: item.product_id,
    productUnitId: baseUnitId,
    deltaQty: toInventoryDecimal(decimal(qty).negated()),
  });

  return { skipped: false, operationId: guard.operationId, cogs };
}

export async function applyStockTransfer(tx, params) {
  const tables = tablesFromTx(tx);
  const method = await ensureInventoryMethod(params.inventoryMethod);
  const { transferId, transferItemId, item, sourceWarehouseId, destWarehouseId, transferDate } = params;

  const outKey = operationKeys.transferOut(transferId, transferItemId);
  const inKey = operationKeys.transferIn(transferId, transferItemId);

  const outGuard = await ensureOperation(tables, {
    operationKey: outKey,
    operationType: 'TRANSFER_OUT',
    referenceId: transferId,
    referenceItemId: transferItemId,
    inventoryMethod: method,
  });
  const inGuard = await ensureOperation(tables, {
    operationKey: inKey,
    operationType: 'TRANSFER_IN',
    referenceId: transferId,
    referenceItemId: transferItemId,
    inventoryMethod: method,
  });

  if (outGuard.skipped && inGuard.skipped) {
    return { skipped: true };
  }

  const { baseQty, baseUnitId, lineQty } = await resolveProductAndBaseQuantity(tables, item, params.product);
  const qty = baseQty;
  const lineUnitCost = toInventoryDecimal(item.unit_price || 0);
  const subtotalDec = decimal(lineUnitCost).times(decimal(lineQty));
  const subtotal = toInventoryDecimal(subtotalDec);
  const baseUnitCost = decimal(baseQty).gt(0)
    ? toInventoryDecimal(subtotalDec.div(decimal(baseQty)))
    : lineUnitCost;

  if (!outGuard.skipped) {
    if (isBatchMethod(method)) {
      const batches = await getOpenBatches(tables.stock_batches, item.product_id, sourceWarehouseId);
      const allocation = allocateBatchConsumption({
        batches,
        quantity: qty,
        inventoryMethod: method,
      });
      await consumeBatchesLocal(tables, {
        allocation,
        operationType: 'TRANSFER',
        operationId: transferId,
        operationItemId: transferItemId,
        productId: item.product_id,
        warehouseId: sourceWarehouseId,
      });

      for (const layer of allocation.layers) {
        const destBatchKey = `${inKey}:LAYER:${layer.batchId}`;
        await createStockBatch(tables.stock_batches, {
          product_id: item.product_id,
          warehouse_id: destWarehouseId,
          quantity_in: layer.quantity,
          unit_cost: layer.unitCost,
          currency: item.currency,
          received_at: getCurrentTimestamp(),
          source_type: 'transfer',
          source_id: transferId,
          source_item_id: transferItemId,
          idempotency_key: destBatchKey,
        });
      }
    }

    await insertStockTransaction(tables.stock_transactions, {
      warehouse_id: sourceWarehouseId,
      product_id: item.product_id,
      product_unit_id: baseUnitId,
      reference_id: transferId,
      reference_item_id: transferItemId,
      reference_type: 'stock_transfer',
      transaction_type: 'transfer_out',
      quantity: qty,
      unit_cost: baseUnitCost,
      total_cost: subtotal,
      currency: item.currency,
      date: transferDate,
      description: `Transfer out #${transferId}`,
      idempotency_key: outKey,
    });

    await adjustWarehouseProductDelta(tables.warehouse_products, {
      warehouseId: sourceWarehouseId,
      productId: item.product_id,
      productUnitId: baseUnitId,
      deltaQty: toInventoryDecimal(decimal(qty).negated()),
    });
  }

  if (!inGuard.skipped) {
    await insertStockTransaction(tables.stock_transactions, {
      warehouse_id: destWarehouseId,
      product_id: item.product_id,
      product_unit_id: baseUnitId,
      reference_id: transferId,
      reference_item_id: transferItemId,
      reference_type: 'stock_transfer',
      transaction_type: 'transfer_in',
      quantity: qty,
      unit_cost: baseUnitCost,
      total_cost: subtotal,
      currency: item.currency,
      date: transferDate,
      description: `Transfer in #${transferId}`,
      idempotency_key: inKey,
    });

    await adjustWarehouseProductDelta(tables.warehouse_products, {
      warehouseId: destWarehouseId,
      productId: item.product_id,
      productUnitId: baseUnitId,
      deltaQty: qty,
    });
  }

  return { skipped: false };
}

export async function recalculateProductStock(productId, methodOverride) {
  const method = await ensureInventoryMethod(methodOverride);
  if (isBatchMethod(method)) {
    await recalculateBatchProductStock(db, productId, decomposeQuantity);
  } else {
    await recalculateClassicProductStock(db, productId, decomposeQuantity);
  }
}

export { InventoryMethod, operationKeys };
