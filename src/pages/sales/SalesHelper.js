import { db } from '../../db';

import { convertUnit, getMultiple } from '../stocktransactions/calculateStock.js';
import { getInventoryMethod, isBatchMethod } from '../../stores/organizationStore.js';

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

function resolveItemCostPrice(item, product, sale) {
  if (isBatchMethod(getInventoryMethod()) && item.fifo_cost != null && Number(item.fifo_cost) > 0) {
    return Number(item.fifo_cost) / Number(item.quantity || 1);
  }
  return exchangeRate(
    Number(item.buy_price || product.buy_price),
    item.buy_price_currency || product.buy_currency,
    sale.currency,
  );
}

export async function calculateRemainingAndBenefit(saleId) {
  currencies = await db.currencies.where('status').equals(1).toArray();
  products = await db.products.where('status').equals(1).toArray();

  const sale = await db.sales.where('id').equals(saleId).first();
  if (!sale) return;

  const saleItems = await db.sale_items.where('sale_id').equals(saleId).and((item) => item.status === 1).toArray();
  let benefit = 0;
  for (const item of saleItems) {
    const product = products.find((p) => p.id == item.product_id);
    if (!product) continue;
    let costPrice = resolveItemCostPrice(item, product, sale);
    if (item.product_unit_id != product.product_unit_id) {
        const multiple = await getMultiple(Number(item.product_unit_id), Number(product.product_unit_id));
        costPrice = multiple * costPrice;
    }
    let itemBenefit = (Number(item.unit_price) - costPrice) * Number(item.quantity);
    if (item.currency !== sale.currency) {
      itemBenefit = exchangeRate(itemBenefit, item.currency, sale.currency);
    }
    benefit += itemBenefit;
  }
  
  benefit -= calculateDiscountAmount(sale);
  const salePayments = await db.sale_payments
    .where('sale_id')
    .equals(Number(saleId))
    .and((p) => p.status === 1)
    .toArray();

  let totalPayments = salePayments.reduce((sum, p) => {
    if (p.currency === sale.currency) {
      return sum + Number(p.amount);
    }
    return sum + Number(exchangeRate(Number(p.amount), p.currency, sale.currency));
  }, 0);

  const saleReturns = await db.sale_returns
    .where('sale_id')
    .equals(Number(saleId))
    .and((r) => r.status === 1)
    .toArray();

  let totalReturnAmount = 0;

  saleReturns.forEach((ret) => {
    totalReturnAmount += Number(ret.total_amount);
  });

  const remaining = Number(sale.total_amount) - totalPayments - totalReturnAmount;

  await db.sales.update(saleId, {
    benefit: benefit,
    remaining: remaining,
    items_count: saleItems.length,
  });
  console.log('Calculated Sale id:', saleId, 'benefit:', benefit, 'Remaining:', remaining);
  return { benefit, remaining };
}

export function calculateDiscountAmount(sale) {
  if (!sale) return 0;
  if (sale.discount_type === 'percent') {
    let dif = 100-Number(sale.discount_amount || 0);
    return (Number(sale.total_amount || 0)-Number(sale.expense_amount || 0))/dif*Number(sale.discount_amount || 0);
  } else {
    return Number(sale.discount_amount || 0);
  }
}

export async function calculateRemainingAndBenefitOfAllSales() {
  currencies = await db.currencies.where('status').equals(1).toArray();
  products = await db.products.where('status').equals(1).toArray();
  console.log('Calculating remaining and benefit for all sales...');

  const modalElement = document.getElementById('salesCalculationModal');
  const progressBar = document.getElementById('salesCalculationProgress');
  const progressText = document.getElementById('salesCalculationText');

  progressBar.style.width = `${0}%`;
  const modal = new window.mdb.Modal(modalElement);

  modal.show();

  try {
    const sales = await db.sales.where('status').equals(1).toArray();
    const saleItems = await db.sale_items.where('status').equals(1).toArray();
    const salePayments = await db.sale_payments.where('status').equals(1).toArray();
    const saleReturns = await db.sale_returns.where('status').equals(1).toArray();

    for (let i = 0; i < sales.length; i++) {
      const sale = sales[i];
      const items = saleItems.filter((item) => item.sale_id === sale.id);
      let benefit = 0;
      for (const item of items) {
        const product = products.find((p) => p.id == item.product_id);
        if (!product) continue;
        let costPrice = resolveItemCostPrice(item, product, sale);
        if (item.product_unit_id != product.product_unit_id) {
            const multiple = await getMultiple(Number(item.product_unit_id), Number(product.product_unit_id));
            costPrice = multiple * costPrice;
        }
        let itemBenefit = (Number(item.unit_price) - costPrice) * Number(item.quantity);
        if (item.currency !== sale.currency) {
          itemBenefit = exchangeRate(itemBenefit, item.currency, sale.currency);
        }
        benefit += itemBenefit;
      }
      benefit -= calculateDiscountAmount(sale);
      const payments = salePayments.filter((p) => p.sale_id === sale.id);
      let totalPayments = payments.reduce((sum, p) => {
        if (p.currency === sale.currency) {
          return sum + Number(p.amount);
        }
        return sum + Number(exchangeRate(Number(p.amount), p.currency, sale.currency));
      }, 0);

      const returns = saleReturns.filter((r) => r.sale_id === sale.id);
      let totalReturnAmount = 0;
      returns.forEach((ret) => {
        totalReturnAmount += Number(ret.total_amount);
      });

      const remaining = Number(sale.total_amount) - totalPayments - totalReturnAmount;
      await db.sales.update(sale.id, {
        benefit: benefit,
        remaining: remaining,
        items_count: items.length,
      });


      const percent = Math.round(((i + 1) / sales.length) * 100);

      progressBar.style.width = `${percent}%`;
      progressBar.innerText = `${percent}%`;
      progressBar.setAttribute('aria-valuenow', percent);

      progressText.innerText =
        `${i + 1} of ${sales.length} | ` +
        `Sale ID: ${sale.id}`;

      console.log(
        `${i + 1} of ${sales.length} - ` +
        `Sale ID: ${sale.id}, ` +
        `Benefit: ${sale.benefit}, ` +
        `Remaining: ${sale.remaining}`
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

