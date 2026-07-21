import { writable } from 'svelte/store';
import { db } from '../db.js';

export const stockTransactions = writable([]);

export async function loadStockTransactions() {
  const txs = await db.stock_transactions.toArray();
  stockTransactions.set(txs);
}

export async function addStockTransaction(tx) {
  await db.stock_transactions.add(tx);
  await loadStockTransactions();
}

export async function updateStockTransaction(id, tx) {
  await db.stock_transactions.update(id, tx);
  await loadStockTransactions();
}

export async function deleteStockTransaction(id) {
  await db.stock_transactions.update(id, { status: 0 });
  await loadStockTransactions();
}
