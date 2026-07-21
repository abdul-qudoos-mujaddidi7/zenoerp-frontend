import { db } from '../../db';

import { convertUnit, getMultiple } from '../stocktransactions/calculateStock.js';


let currencies = [];
let products = [];
function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
  if (!fromCurrencyCode || !toCurrencyCode) return amount;
  const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
  const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
  if (!fromCurrency || !toCurrency) return amount;
  const fromRate = Number(fromCurrency.exchangeRate || 1);
  const toRate = Number(toCurrency.exchangeRate || 1);
  return (amount / toRate) * fromRate;
}
export async function calculateRemainingAndBenefit(inventory_recordId) {
  currencies = await db.currencies.where('status').equals(1).toArray();
  products = await db.products.where('status').equals(1).toArray();

  const inventory_record = await db.inventory_records.where('id').equals(inventory_recordId).first();
  if (!inventory_record) return;

  const inventory_recordItems = await db.inventory_record_items.where('inventory_record_id').equals(inventory_recordId).and((item) => item.status === 1).toArray();
  let benefit = 0;
  for (const item of inventory_recordItems) {
    const product = products.find((p) => p.id == item.product_id);
    if (!product) continue;
    let costPrice = exchangeRate(Number(item.buy_price || product.buy_price), (item.buy_price_currency || product.buy_currency), inventory_record.currency);
    if (item.product_unit_id != product.product_unit_id) {
        const multiple = await getMultiple(Number(item.product_unit_id), Number(product.product_unit_id));
        costPrice = multiple * costPrice;
    }
    const itemBenefit = (Number(item.unit_price) - costPrice) * Number(item.quantity);
    benefit += itemBenefit;
  }
  
  benefit -= calculateDiscountAmount(inventory_record);
  const inventory_recordPayments = await db.inventory_record_payments
    .where('inventory_record_id')
    .equals(Number(inventory_recordId))
    .and((p) => p.status === 1)
    .toArray();

  let totalPayments = inventory_recordPayments.reduce((sum, p) => {
    if (p.currency === inventory_record.currency) {
      return sum + Number(p.amount);
    }
    return sum;
  }, 0);

  const inventory_recordReturns = await db.inventory_record_returns
    .where('inventory_record_id')
    .equals(Number(inventory_recordId))
    .and((r) => r.status === 1)
    .toArray();

  let totalReturnAmount = 0;

  inventory_recordReturns.forEach((ret) => {
    totalReturnAmount += Number(ret.total_amount);
  });

  const remaining = Number(inventory_record.total_amount) - totalPayments - totalReturnAmount;

  await db.inventory_records.update(inventory_recordId, {
    benefit: benefit,
    remaining: remaining,
    items_count: inventory_recordItems.length,
  });
  console.log('Calculated InventoryRecord id:', inventory_recordId, 'benefit:', benefit, 'Remaining:', remaining);
  return { benefit, remaining };
}

export function calculateDiscountAmount(inventory_record) {
  if (!inventory_record) return 0;
  if (inventory_record.discount_type === 'percent') {
    let dif = 100-Number(inventory_record.discount_amount || 0);
    return (Number(inventory_record.total_amount || 0)-Number(inventory_record.expense_amount || 0))/dif*Number(inventory_record.discount_amount || 0);
  } else {
    return Number(inventory_record.discount_amount || 0);
  }
}

export async function calculateRemainingAndBenefitOfAllInventoryRecords() {
  currencies = await db.currencies.where('status').equals(1).toArray();
  products = await db.products.where('status').equals(1).toArray();
  console.log('Calculating remaining and benefit for all inventory_records...');

  const modalElement = document.getElementById('inventory_recordsCalculationModal');
  const progressBar = document.getElementById('inventory_recordsCalculationProgress');
  const progressText = document.getElementById('inventory_recordsCalculationText');

  progressBar.style.width = `${0}%`;
  const modal = new window.mdb.Modal(modalElement);

  modal.show();

  try {
    const inventory_records = await db.inventory_records.where('status').equals(1).toArray();
    const inventory_recordItems = await db.inventory_record_items.where('status').equals(1).toArray();
    const inventory_recordPayments = await db.inventory_record_payments.where('status').equals(1).toArray();
    const inventory_recordReturns = await db.inventory_record_returns.where('status').equals(1).toArray();

    for (let i = 0; i < inventory_records.length; i++) {
      const inventory_record = inventory_records[i];
      const items = inventory_recordItems.filter((item) => item.inventory_record_id === inventory_record.id);
      let benefit = 0;
      for (const item of items) {
        const product = products.find((p) => p.id == item.product_id);
        if (!product) continue;
        let costPrice = exchangeRate(Number(item.buy_price || product.buy_price), (item.buy_price_currency || product.buy_currency), inventory_record.currency);
        if (item.product_unit_id != product.product_unit_id) {
            const multiple = await getMultiple(Number(item.product_unit_id), Number(product.product_unit_id));
            costPrice = multiple * costPrice;
        }
        const itemBenefit = (Number(item.unit_price) - costPrice) * Number(item.quantity);
        benefit += itemBenefit;
      }
      benefit -= calculateDiscountAmount(inventory_record);
      const payments = inventory_recordPayments.filter((p) => p.inventory_record_id === inventory_record.id);
      let totalPayments = payments.reduce((sum, p) => {
        if (p.currency === inventory_record.currency) {
          return sum + Number(p.amount);
        }
        return sum;
      }, 0);

      const returns = inventory_recordReturns.filter((r) => r.inventory_record_id === inventory_record.id);
      let totalReturnAmount = 0;
      returns.forEach((ret) => {
        totalReturnAmount += Number(ret.total_amount);
      });

      const remaining = Number(inventory_record.total_amount) - totalPayments - totalReturnAmount;
      await db.inventory_records.update(inventory_record.id, {
        benefit: benefit,
        remaining: remaining,
        items_count: items.length,
      });


      const percent = Math.round(((i + 1) / inventory_records.length) * 100);

      progressBar.style.width = `${percent}%`;
      progressBar.innerText = `${percent}%`;
      progressBar.setAttribute('aria-valuenow', percent);

      progressText.innerText =
        `${i + 1} of ${inventory_records.length} | ` +
        `InventoryRecord ID: ${inventory_record.id}`;

      console.log(
        `${i + 1} of ${inventory_records.length} - ` +
        `InventoryRecord ID: ${inventory_record.id}, ` +
        `Benefit: ${inventory_record.benefit}, ` +
        `Remaining: ${inventory_record.remaining}`
      );

      // Allow UI repaint
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    progressText.innerText = 'Calculation completed!';
  } catch (error) {
    console.error(error);
    progressText.innerText = 'Calculation failed!';
  }

  // Small delay so user sees 100%
  setTimeout(() => {
    modal.hide();
  }, 800);
}

