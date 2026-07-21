import { db } from '../../db.js';
import { recalculateProductStock as recalculateFromService } from '../../lib/inventory/inventoryService.js';
import { sumClassicTransactions } from '../../lib/inventory/classicInventory.js';
import { sumBatchRemaining } from '../../lib/inventory/batchInventory.js';
import { getInventoryMethod, isBatchMethod, InventoryMethod } from '../../stores/organizationStore.js';
import { decimal, toInventoryDecimal } from '../../lib/inventory/inventoryCore.js';

let differences = [];
let balance = {};
let alltotalStock = 0;
let units = [];
let unitMap = new Map();
let childrenMap = {};

async function loadUnits() {
  units = await db.product_units.where('status').equals(1).toArray();
  buildUnitMaps();
}
loadUnits();

function buildUnitMaps() {
  unitMap = new Map(units.map((u) => [u.id, u]));
  childrenMap = {};
  units.forEach((u) => {
    if (u.subunit_id) {
      if (!childrenMap[u.subunit_id]) childrenMap[u.subunit_id] = [];
      childrenMap[u.subunit_id].push(u);
    }
  });
}

function activeInventoryMethod() {
  return getInventoryMethod() || InventoryMethod.CLASSIC;
}

function convertQuantityBetweenUnits(quantity, fromUnitId, toUnitId) {
  if (fromUnitId === toUnitId) return quantity;
  const visited = new Set();
  function dfs(unitId, value) {
    if (unitId === toUnitId) return value;
    if (visited.has(unitId)) return null;
    visited.add(unitId);
    const unit = unitMap.get(unitId);
    if (unit?.subunit_id && unit.subunit_multiple) {
      const res = dfs(unit.subunit_id, value * unit.subunit_multiple);
      if (res !== null) return res;
    }
    const children = childrenMap[unitId] || [];
    for (const child of children) {
      const res = dfs(child.id, value / child.subunit_multiple);
      if (res !== null) return res;
    }
    return null;
  }
  return dfs(fromUnitId, quantity) ?? quantity;
}

export async function ensureProductUnitsLoaded() {
  await loadUnits();
}

export function convertUnitSync(quantity, fromUnitId, toUnitId) {
  return convertQuantityBetweenUnits(quantity, fromUnitId, toUnitId);
}

export async function getMultiple(fromUnitId, toUnitId) {
  await loadUnits();
  if (fromUnitId === toUnitId) return 1;
  return convertQuantityBetweenUnits(1, fromUnitId, toUnitId);
}

export async function convertUnit(quantity, fromUnitId, toUnitId) {
  await loadUnits();
  return convertQuantityBetweenUnits(quantity, fromUnitId, toUnitId);
}

let products = [];
let stockTxs = [];

export async function decomposeQuantity(quantity, unitId) {
  await loadUnits();
  const chain = [];
  let current = unitMap.get(unitId);
  while (current) {
    chain.push(current);
    if (!current.subunit_id) break;
    current = unitMap.get(current.subunit_id);
  }
  if (chain.length === 1) {
    return [{ unit_id: unitId, unit_name: chain[0].name, quantity }];
  }
  let smallestQty = quantity;
  for (let i = 0; i < chain.length - 1; i++) {
    smallestQty *= chain[i].subunit_multiple;
  }
  smallestQty = Math.round(smallestQty);
  const result = [];
  for (let i = 0; i < chain.length; i++) {
    const unit = chain[i];
    let factor = 1;
    for (let j = i; j < chain.length - 1; j++) {
      factor *= chain[j].subunit_multiple;
    }
    const amount = Math.floor(smallestQty / factor);
    result.push({ unit_id: unit.id, unit_name: unit.name, quantity: amount });
    smallestQty -= amount * factor;
  }
  return result;
}

export async function calculateAllStocks() {
  const modalElement = document.getElementById('salesCalculationModal');
  const progressBar = document.getElementById('salesCalculationProgress');
  const progressText = document.getElementById('salesCalculationText');
  if (modalElement && progressBar) {
    progressBar.style.width = `${0}%`;
    const modal = new window.mdb.Modal(modalElement);
    modal.show();
  }
  await loadUnits();
  try {
  const method = activeInventoryMethod();
  if (!isBatchMethod(method)) {
      const allWarehouseProducts = await db.warehouse_products.toArray();
      for (const wp of allWarehouseProducts) {
        await db.warehouse_products.update(wp.id, { quantity: 0, last_synced_at: null });
      }
    }
  } catch (err) {
    console.error('Failed to clear warehouse_products data:', err);
  }
  products = await db.products.where('status').equals(1).toArray();
  let AllStockTxs = await db.stock_transactions.where({ status: 1 }).toArray();
  let i = 0;
  for (const p of products) {
    stockTxs = AllStockTxs.filter((tx) => tx.product_id === p.id);
    await calculateProductStock(p.id);
    if (progressBar) {
      const percent = Math.round(((i + 1) / products.length) * 100);
      progressBar.style.width = `${percent}%`;
      progressBar.innerText = `${percent}%`;
      progressBar.setAttribute('aria-valuenow', percent);
      if (progressText) {
        progressText.innerText = `${i + 1} of ${products.length} | Product ID: ${p.id}`;
      }
    }
    i++;
  }
  if (modalElement) {
    setTimeout(() => {
      try {
        new window.mdb.Modal(modalElement).hide();
      } catch (e) {
        /* ignore */
      }
    }, 800);
  }
  console.log(differences);
}

export async function calculateProductStock(product_id) {
  await recalculateFromService(product_id);
}

export async function calculateCurrentStock(warehouse_id, product_id) {
  const method = activeInventoryMethod();
  let totalStock;
  if (isBatchMethod(method)) {
    totalStock = await sumBatchRemaining(db.stock_batches, warehouse_id, product_id);
  } else {
    totalStock = await sumClassicTransactions(db.stock_transactions, warehouse_id, product_id);
  }

  alltotalStock += Number(totalStock);

  const product = await db.products.get(product_id);
  if (!product) return;

  const existing = await db.warehouse_products
    .where({ warehouse_id, product_id, status: 1 })
    .first();

  if (!existing) {
    await db.warehouse_products.add({
      warehouse_id,
      product_id,
      product_unit_id: product.product_unit_id,
      quantity: totalStock,
      status: 1,
    });
  } else {
    await db.warehouse_products.update(existing.id, {
      quantity: totalStock,
    });
  }
}

/** @deprecated Use inventoryService.applyPurchase inside a transaction */
export async function addStockBatchFromPurchase(item, purchaseId, warehouseId) {
  console.warn('addStockBatchFromPurchase is deprecated; use inventoryService.applyPurchase');
}

/** @deprecated Use inventoryService.applyPurchaseReturn */
export async function returnPurchaseToSupplierFIFO(item, purchase, warehouseId) {
  console.warn('returnPurchaseToSupplierFIFO is deprecated; use inventoryService.applyPurchaseReturn');
}

/** @deprecated Use inventoryService.applySaleReturn */
export async function restoreSaleReturnFIFO(item, sale, warehouseId, currentReturnId, currentReturnQuantity) {
  console.warn('restoreSaleReturnFIFO is deprecated; use inventoryService.applySaleReturn');
}

/** @deprecated Use inventoryService.applySale */
export async function consumeFIFO(product_id, warehouse_id, quantity, saleId) {
  console.warn('consumeFIFO is deprecated; use inventoryService.applySale');
  return 0;
}
