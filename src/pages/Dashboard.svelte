<script>
  import { db } from '../db';
  import { onMount, onDestroy, tick } from 'svelte';
  import Chart from 'chart.js/auto';
  import { t, lang, settings_all } from '../i18n/i18n';
  import { toGregorian, toJalaali } from 'jalaali-js';
  import { getGeneralBenefit } from './accounts/AccountsHelper.js';
  import DashboardAccentPanel from '../components/DashboardAccentPanel.svelte';
  import AppDatePicker from '../components/common/AppDatePicker.svelte';

  $: _lang = $lang;
  $: enable_expiry_date = $settings_all.find((s) => s.key === 'enable_expiry_date')?.value == 1;

  let loading = true;
  let loadingMetricData = true;
  let error = '';

  let products = [];
  let currencies = [];
  let warehouses = [];
  let categories = [];
  let defaultCurrency = 'AFN';

  let netBenefit = ['-', 0, {}, {}];
  let treasuryBalance = {};
  let totalPurchaseCostMap = {};
  let defaultCurrencyPurchaseCostMap = 0;

  let lowStockProducts = [];
  let expiringProducts = [];
  let plainTopProducts = [];

  let activePeriod = 'today';
  let showPeriodMenu = false;
  let showCustomDates = false;
  let customStartDate = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().slice(0,10);
  let customEndDate = new Date().toISOString().slice(0,10);
  let lastRefreshed = null;

  let salesTrendCanvas = null;
  let charts = {};
  let trendDatasetVisible = [true, true];

  const periods = ['today', 'week', 'month', 'year', 'custom'];
  const topProductColors = ['#0f6efd', '#14a44d', '#f59f00', '#7c3aed', '#64748b', '#0ea5e9'];

  $: periodLabels = {
    today: t('Today'),
    week: t('This Week'),
    month: t('This Month'),
    year: t('This Year'),
    custom: t('Custom'),
  };
  $: if (!periods.includes(activePeriod)) activePeriod = 'today';

  let metricDataTotal = {
    sales: 0,
    purchases: 0,
    benefit: 0,
    expenses: 0,
    saleReturns: 0,
    purchaseReturns: 0,
    wastes: 0,
  };

  let metricDataCount = {
    sales: 0,
    purchases: 0,
    saleReturns: 0,
    purchaseReturns: 0,
    wastes: 0,
  };

  let trendData = {
    labels: [],
    benefit: [],
    expenses: [],
  };

  const chartFont = { family: "'Vazirmatn', 'Roboto', 'Helvetica Neue', Arial, sans-serif" };

  $: treasuryEntries = Object.entries(treasuryBalance || {});
  $: netBenefitValue = Number(netBenefit?.[1]) || 0;
  $: netBenefitCurrency = netBenefit?.[0] || defaultCurrency;

  $: summaryCards = [
    {
      label: t('Inventory Value'),
      value: fmt(defaultCurrencyPurchaseCostMap),
      suffix: t(defaultCurrency),
      detail: t('Purchase cost in default currency'),
      icon: 'bi-cash-stack',
      accent: '#0f6efd',
      soft: '#eaf2ff',
    },
    {
      label: t('Net Benefit'),
      value: fmt(netBenefitValue),
      suffix: t(netBenefitCurrency),
      detail: netBenefitValue < 0 ? t('Needs attention') : t('Current profit position'),
      icon: 'bi-cash-stack',
      accent: '#0f6efd',
      soft: '#eaf2ff'
      
    },
  ];

  $: periodMetrics = [
    {
      key: 'sales',
      label: t('Sales'),
      value: Number(metricDataTotal.sales) || 0,
      count: Number(metricDataCount.sales) || 0,
      icon: 'bi-graph-up-arrow',
      color: '#0f6efd',
    },
    {
      key: 'purchases',
      label: t('Purchases'),
      value: Number(metricDataTotal.purchases) || 0,
      count: Number(metricDataCount.purchases) || 0,
      icon: 'bi-bag-plus',
      color: '#14a44d',
    },
    {
      key: 'saleReturns',
      label: t('Sale Returns'),
      value: Number(metricDataTotal.saleReturns) || 0,
      count: Number(metricDataCount.saleReturns) || 0,
      icon: 'bi-arrow-counterclockwise',
      color: '#f59f00',
    },
    {
      key: 'purchaseReturns',
      label: t('Purchase Returns'),
      value: Number(metricDataTotal.purchaseReturns) || 0,
      count: Number(metricDataCount.purchaseReturns) || 0,
      icon: 'bi-arrow-repeat',
      color: '#6f42c1',
    },
    {
      key: 'wastes',
      label: t('Wastes'),
      value: Number(metricDataTotal.wastes) || 0,
      count: Number(metricDataCount.wastes) || 0,
      icon: 'bi-trash3',
      color: '#64748b',
    },
  ];

  $: revenueMixTotal = periodMetrics.reduce((sum, item) => sum + Math.abs(item.value || 0), 0);
  $: revenueMixGradient = buildMixGradient(periodMetrics, revenueMixTotal);
  $: benefitTotal = Number(metricDataTotal.benefit) || 0;
  $: expenseTotal = Number(metricDataTotal.expenses) || 0;
  $: netProfit = benefitTotal - expenseTotal;
  $: benefitShare =
    benefitTotal + expenseTotal > 0 ? Math.round((benefitTotal / (benefitTotal + expenseTotal)) * 100) : 0;
  $: maxTopProductRevenue = Math.max(1, ...plainTopProducts.map((product) => Number(product.rev) || 0));

  $: if (!loading && salesTrendCanvas && trendData.labels.length) {
    renderTrendChart();
  }

  onMount(() => {
    refresh();
  });

  onDestroy(() => {
    destroyCharts();
  });

  function fmt(n) {
    if (n == null || isNaN(Number(n))) return '0';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(n));
  }

  function formatPersianDay(date) {
    const afghanMonthsMap = {
      فروردین: 'حمل',
      اردیبهشت: 'ثور',
      خرداد: 'جوزا',
      تیر: 'سرطان',
      مرداد: 'اسد',
      شهریور: 'سنبله',
      مهر: 'میزان',
      آبان: 'عقرب',
      آذر: 'قوس',
      دی: 'جدی',
      بهمن: 'دلو',
      اسفند: 'حوت',
    };

    const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      day: 'numeric',
      month: 'long',
    }).formatToParts(date);

    let day = '';
    let month = '';

    parts.forEach((part) => {
      if (part.type === 'day') day = part.value;
      if (part.type === 'month') month = afghanMonthsMap[part.value] || part.value;
    });

    return `${day} ${month}`;
  }

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode || fromCurrencyCode === toCurrencyCode) return Number(amount) || 0;
    const fromCurrency = currencies.find((currency) => currency.code === fromCurrencyCode);
    const toCurrency = currencies.find((currency) => currency.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return Number(amount) || 0;
    const fromRate = parseFloat(fromCurrency.exchangeRate) || 1;
    const toRate = parseFloat(toCurrency.exchangeRate) || 1;
    return ((Number(amount) || 0) / toRate) * fromRate;
  }

  async function activeRows(tableName) {
    try {
      return await db[tableName].where('status').equals(1).toArray();
    } catch (e) {
      console.warn(`Unable to read ${tableName}`, e);
      return [];
    }
  }

  async function refresh() {
    const startTime = Date.now();
    loading = true;
    loadingMetricData = true;
    error = '';

    try {
      lowStockProducts = [];
      expiringProducts = [];

      currencies = await activeRows('currencies');
      defaultCurrency = currencies.find((currency) => currency.isDefault == 1)?.code || currencies[0]?.code || 'AFN';

      netBenefit = (await getGeneralBenefit()) || ['-', 0, {}, {}];

      const treasuryAccount = await db.accounts.where('code').equals('TREASURY').first().catch(() => null);
      treasuryBalance = treasuryAccount ? netBenefit?.[2]?.[treasuryAccount.id] || {} : {};
      totalPurchaseCostMap = netBenefit?.[3] || {};
      defaultCurrencyPurchaseCostMap = Object.entries(totalPurchaseCostMap).reduce((total, [currency, amount]) => {
        return total + exchangeRate(Number(amount) || 0, currency, defaultCurrency);
      }, 0);

      [warehouses, categories, products] = await Promise.all([
        activeRows('warehouses'),
        activeRows('product_categories'),
        activeRows('products'),
      ]);

      buildInventoryAlerts();
      await getData();
      await tick();
      lastRefreshed = new Date().toLocaleString();

      console.log(`Loading Dashboard took ${Date.now() - startTime}ms`);
    } catch (e) {
      console.error(e);
      error = e?.message || String(e);
    } finally {
      loading = false;
      loadingMetricData = false;
    }
  }

  function buildInventoryAlerts() {
    const today = new Date();

    products = products.map((product) => {
      const totalQty = Number(product.quantity || 0);
      const alarm = Number(product.alarm_quantity || 0);
      const nextProduct = { ...product, totalQty };

      if (alarm > 0 && totalQty <= alarm) {
        lowStockProducts.push(nextProduct);
      }

      if (enable_expiry_date && product.expiry_date) {
        const alarmExpiryDays = Number(product.alarm_expiry_days || 30);
        const expiryDate = new Date(product.expiry_date);
        const remainingDays = Math.ceil((expiryDate - today) / 86400000);
        nextProduct.remaining_days = remainingDays;

        if (!isNaN(remainingDays) && remainingDays <= alarmExpiryDays) {
          expiringProducts.push(nextProduct);
        }
      }

      return nextProduct;
    });

    lowStockProducts = lowStockProducts.sort((a, b) => Number(a.totalQty) - Number(b.totalQty));
    expiringProducts = expiringProducts.sort((a, b) => Number(a.remaining_days) - Number(b.remaining_days));
  }

  function getPeriodRange(period) {
    const current = new Date();
    const start = new Date();
    const end = new Date();

    if (period === 'today') {
      start.setHours(0, 0, 0, 0);
      return { start, end: current };
    }

    if (period === 'week') {
      const day = current.getDay();
      const diff = current.getDate() - ((day + 1) % 7);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime() + 7 * 86400000);
      return { start, end };
    }

    if (period === 'prev_week') {
      const day = current.getDay();
      const diff = current.getDate() - ((day + 1) % 7);
      const currentWeekStart = new Date(current);
      currentWeekStart.setDate(diff);
      currentWeekStart.setHours(0, 0, 0, 0);
      start.setTime(currentWeekStart.getTime() - 7 * 86400000);
      end.setTime(currentWeekStart.getTime());
      return { start, end };
    }

    if (period === 'month') {
      return getPersianMonthRange(current);
    }

    if (period === 'year') {
      const { jy } = toJalaali(current.getFullYear(), current.getMonth() + 1, current.getDate());
      const startG = toGregorian(jy, 1, 1);
      const endG = toGregorian(jy + 1, 1, 1);
      return { start: new Date(startG.gy, startG.gm - 1, startG.gd), end: new Date(endG.gy, endG.gm - 1, endG.gd) };
    }

    if (period === 'custom' && customStartDate && customEndDate) {
      const customStart = new Date(`${customStartDate}T00:00:00`);
      const customEnd = new Date(`${customEndDate}T00:00:00`);
      customEnd.setDate(customEnd.getDate() + 1);
      return { start: customStart, end: customEnd };
    }

    if (period === 'prev_month') {
      const { jy, jm } = toJalaali(current.getFullYear(), current.getMonth() + 1, current.getDate());
      let prevJm = jm - 1;
      let prevJy = jy;

      if (prevJm < 1) {
        prevJm = 12;
        prevJy--;
      }

      const startG = toGregorian(prevJy, prevJm, 1);
      start.setFullYear(startG.gy, startG.gm - 1, startG.gd);
      start.setHours(0, 0, 0, 0);

      let nextJm = prevJm + 1;
      let nextJy = prevJy;

      if (nextJm > 12) {
        nextJm = 1;
        nextJy++;
      }

      const endG = toGregorian(nextJy, nextJm, 1);
      end.setFullYear(endG.gy, endG.gm - 1, endG.gd);
      end.setHours(0, 0, 0, 0);

      return { start, end };
    }

    return { start, end: current };
  }

  function getPersianMonthRange(date = new Date()) {
    const { jy, jm } = toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const startG = toGregorian(jy, jm, 1);
    const start = new Date(startG.gy, startG.gm - 1, startG.gd);

    let nextJm = jm + 1;
    let nextJy = jy;

    if (nextJm > 12) {
      nextJm = 1;
      nextJy++;
    }

    const endG = toGregorian(nextJy, nextJm, 1);
    const end = new Date(endG.gy, endG.gm - 1, endG.gd);

    return { start, end };
  }

  function recordDate(record, fields) {
    for (const field of fields) {
      const value = record?.[field];
      if (!value) continue;
      const date = new Date(value);
      if (!isNaN(date.getTime())) return date;
    }
    return null;
  }

  function filterByRange(records, fields, start, end) {
    return records.filter((record) => {
      const date = recordDate(record, fields);
      return date && date >= start && date < end;
    });
  }

  function sumInDefaultCurrency(records, amountField = 'total_amount') {
    return records.reduce((total, record) => {
      return total + exchangeRate(Number(record?.[amountField]) || 0, record?.currency || defaultCurrency, defaultCurrency);
    }, 0);
  }

  function expenseAmountFromJournal(journal, expensesAccountId) {
    if (!expensesAccountId || !journal) return 0;

    if (Number(journal.first_entry_account) === Number(expensesAccountId)) {
      return Number(journal.first_entry_debit || 0) - Number(journal.first_entry_credit || 0);
    }

    if (Number(journal.second_entry_account) === Number(expensesAccountId)) {
      return Number(journal.second_entry_debit || 0) - Number(journal.second_entry_credit || 0);
    }

    return 0;
  }

  function sumExpensesAccountJournals(journals, expensesAccountId) {
    return journals.reduce((total, journal) => {
      const amount = expenseAmountFromJournal(journal, expensesAccountId);
      if (!amount) return total;
      return total + exchangeRate(amount, journal.currency || defaultCurrency, defaultCurrency);
    }, 0);
  }

  async function getData() {
    const { start, end } = getPeriodRange(activePeriod);
    const [allSales, allPurchases, allSaleReturns, allPurchaseReturns, allWastes, allSaleItems, allJournals, expensesAccount] =
      await Promise.all([
      activeRows('sales'),
      activeRows('purchases'),
      activeRows('sale_returns'),
      activeRows('purchase_returns'),
      activeRows('wastes'),
      activeRows('sale_items'),
      activeRows('journals'),
      db.accounts.where('code').equals('EXPENSES').and((account) => account.status === 1).first(),
    ]);

    const expensesAccountId = expensesAccount?.id || null;
    const periodJournals = filterByRange(allJournals, ['date', 'created_at'], start, end);

    const sales = filterByRange(allSales, ['invoice_date', 'created_at'], start, end);
    const confirmedSales = sales.filter((sale) => sale.invoice_status === 'confirmed');
    const purchases = filterByRange(allPurchases, ['bill_date', 'created_at'], start, end);
    const saleReturns = filterByRange(allSaleReturns, ['return_date', 'created_at'], start, end);
    const purchaseReturns = filterByRange(allPurchaseReturns, ['return_date', 'created_at'], start, end);
    const wastes = filterByRange(allWastes, ['date', 'created_at'], start, end);

    metricDataTotal = {
      sales: sumInDefaultCurrency(sales),
      purchases: sumInDefaultCurrency(purchases),
      benefit: sumInDefaultCurrency(confirmedSales, 'benefit'),
      expenses: 0,
      saleReturns: sumInDefaultCurrency(saleReturns),
      purchaseReturns: sumInDefaultCurrency(purchaseReturns),
      wastes: sumInDefaultCurrency(wastes),
    };

    metricDataTotal.expenses = sumExpensesAccountJournals(periodJournals, expensesAccountId);

    metricDataCount = {
      sales: sales.length,
      purchases: purchases.length,
      saleReturns: saleReturns.length,
      purchaseReturns: purchaseReturns.length,
      wastes: wastes.length,
    };

    buildTopProducts(sales, allSaleItems);
    buildTrendData(start, end, confirmedSales, periodJournals, expensesAccountId);
  }

  function buildTopProducts(sales, saleItems) {
    const saleCurrencyMap = {};
    sales.forEach((sale) => {
      saleCurrencyMap[sale.id] = sale.currency || defaultCurrency;
    });

    const productMap = {};
    saleItems
      .filter((item) => saleCurrencyMap[item.sale_id])
      .forEach((item) => {
        if (!productMap[item.product_id]) {
          productMap[item.product_id] = { pid: item.product_id, qty: 0, rev: 0 };
        }

        productMap[item.product_id].qty += Number(item.quantity) || 0;
        productMap[item.product_id].rev += exchangeRate(
          Number(item.subtotal) || 0,
          item.currency || saleCurrencyMap[item.sale_id],
          defaultCurrency,
        );
      });

    plainTopProducts = Object.values(productMap)
      .sort((a, b) => b.rev - a.rev)
      .slice(0, 6)
      .map((topProduct) => {
        const product = products.find((item) => item.id === topProduct.pid);
        return {
          ...topProduct,
          name: product?.name || `#${topProduct.pid}`,
          code: product?.code || '',
        };
      });
  }

  function buildTrendData(start, end, confirmedSales, journals, expensesAccountId) {
    const buckets = buildBuckets(start, end);
    const labels = [];
    const benefitValues = [];
    const expenseValues = [];

    buckets.forEach((bucket) => {
      labels.push(bucket.label);
      const bucketSales = confirmedSales.filter((sale) => {
        const date = recordDate(sale, ['invoice_date', 'created_at']);
        return date && date >= bucket.start && date < bucket.end;
      });
      const bucketJournals = journals.filter((journal) => {
        const date = recordDate(journal, ['date', 'created_at']);
        return date && date >= bucket.start && date < bucket.end;
      });

      benefitValues.push(sumInDefaultCurrency(bucketSales, 'benefit'));
      expenseValues.push(sumExpensesAccountJournals(bucketJournals, expensesAccountId));
    });

    trendData = {
      labels,
      benefit: benefitValues,
      expenses: expenseValues,
    };
  }

  function buildBuckets(start, end) {
    const buckets = [];

    if (activePeriod === 'today') {
      for (let hour = 0; hour < 24; hour += 3) {
        const bucketStart = new Date(start);
        bucketStart.setHours(hour, 0, 0, 0);
        const bucketEnd = new Date(bucketStart);
        bucketEnd.setHours(hour + 3, 0, 0, 0);
        buckets.push({
          start: bucketStart,
          end: bucketEnd,
          label: `${String(hour).padStart(2, '0')}:00`,
        });
      }

      return buckets;
    }

    if (activePeriod === 'week' || activePeriod === 'prev_week') {
      for (let day = 0; day < 7; day++) {
        const bucketStart = new Date(start);
        bucketStart.setDate(start.getDate() + day);
        bucketStart.setHours(0, 0, 0, 0);
        const bucketEnd = new Date(bucketStart);
        bucketEnd.setDate(bucketStart.getDate() + 1);
        buckets.push({
          start: bucketStart,
          end: bucketEnd,
          label: bucketStart.toLocaleDateString(_lang || 'en', { weekday: 'short' }),
        });
      }

      return buckets;
    }

    if (activePeriod === 'year') {
      const startJalaali = toJalaali(start.getFullYear(), start.getMonth() + 1, start.getDate());

      for (let month = 1; month <= 12; month++) {
        const monthStartG = toGregorian(startJalaali.jy, month, 1);
        const nextMonthG =
          month === 12
            ? toGregorian(startJalaali.jy + 1, 1, 1)
            : toGregorian(startJalaali.jy, month + 1, 1);
        const bucketStart = new Date(monthStartG.gy, monthStartG.gm - 1, monthStartG.gd);
        const bucketEnd = new Date(nextMonthG.gy, nextMonthG.gm - 1, nextMonthG.gd);

        buckets.push({
          start: bucketStart,
          end: bucketEnd,
          label: formatPersianDay(bucketStart),
        });
      }

      return buckets;
    }

    const dayCount = Math.max(1, Math.ceil((end - start) / 86400000));
    const step = Math.max(1, Math.ceil(dayCount / 6));
    const cursor = new Date(start);

    while (cursor < end) {
      const bucketStart = new Date(cursor);
      const bucketEnd = new Date(cursor);
      bucketEnd.setDate(bucketEnd.getDate() + step);
      if (bucketEnd > end) bucketEnd.setTime(end.getTime());
      buckets.push({
        start: bucketStart,
        end: bucketEnd,
        label: formatPersianDay(bucketStart),
      });
      cursor.setDate(cursor.getDate() + step);
    }

    return buckets;
  }

  async function setPeriod(period) {
    activePeriod = period;
    showPeriodMenu = false;
    loadingMetricData = true;
    await getData();
    loadingMetricData = false;
    await tick();
  }

  function choosePeriod(period) {
    if (period === 'custom') {
      activePeriod = 'custom';
      showCustomDates = true;
      showPeriodMenu = true;
      return;
    }
    showCustomDates = false;
    setPeriod(period);
  }

  async function applyCustomPeriod() {
    if (!customStartDate || !customEndDate || customStartDate > customEndDate) return;
    showCustomDates = false;
    await setPeriod('custom');
  }

  function togglePeriodMenu() {
    showPeriodMenu = !showPeriodMenu;
  }

  function destroyCharts() {
    Object.values(charts).forEach((chart) => chart?.destroy());
    charts = {};
  }

  function toggleTrendDataset(index) {
    trendDatasetVisible[index] = !trendDatasetVisible[index];
    trendDatasetVisible = [...trendDatasetVisible];

    if (charts.trend) {
      charts.trend.setDatasetVisibility(index, trendDatasetVisible[index]);
      charts.trend.update();
    }
  }

  function getTrendAxisMax() {
    const values = [...(trendData.benefit || []), ...(trendData.expenses || [])].map((value) => Number(value) || 0);
    const maxValue = Math.max(0, ...values);
    return Math.max(12000, Math.ceil(maxValue / 2000) * 2000);
  }

  function renderTrendChart() {
    if (!salesTrendCanvas) return;

    if (charts.trend) {
      charts.trend.destroy();
    }

    charts.trend = new Chart(salesTrendCanvas, {
      type: 'bar',
      data: {
        labels: [...trendData.labels],
        datasets: [
          {
            label: t('Total Benefit Amount'),
            data: [...trendData.benefit],
            hidden: !trendDatasetVisible[0],
            backgroundColor: 'rgba(15, 110, 253, 0.9)',
            borderColor: '#0f6efd',
            borderRadius: 0,
            barPercentage: 1,
            categoryPercentage: 0.14,
          },
          {
            label: t('Expenses'),
            data: [...trendData.expenses],
            hidden: !trendDatasetVisible[1],
            backgroundColor: 'rgba(220, 53, 69, 0.85)',
            borderColor: '#dc3545',
            borderRadius: 0,
            barPercentage: 1,
            categoryPercentage: 0.14,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 450 },
        plugins: {
          legend: {
            display: false,
            position: 'top',
            align: 'end',
            labels: {
              color: '#5f6b7a',
              usePointStyle: true,
              pointStyle: 'rectRounded',
              boxWidth: 8,
              boxHeight: 5,
              padding: 16,
              font: { ...chartFont, size: 10, weight: 600 },
            },
          },
          tooltip: {
            titleFont: chartFont,
            bodyFont: chartFont,
            callbacks: {
              label: (context) => `${context.dataset.label}: ${fmt(context.parsed.y)} ${t(defaultCurrency)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: '#3f4b59',
              padding: 7,
              font: { ...chartFont, size: 10, weight: 500 },
              autoSkip: false,
              maxRotation: 0,
            },
          },
          y: {
            beginAtZero: true,
            max: getTrendAxisMax(),
            border: { display: false },
            grid: { color: '#edf0f3', drawTicks: false },
            ticks: {
              color: '#3f4b59',
              padding: 8,
              stepSize: 2000,
              callback: (value) => fmt(value),
              font: { ...chartFont, size: 10, weight: 500 },
            },
          },
        },
      },
    });
  }

  function buildMixGradient(items, total) {
    if (!total) return '#e8eef8 0% 100%';

    let cursor = 0;
    return items
      .map((item) => {
        const value = Math.abs(item.value || 0);
        const start = cursor;
        cursor += (value / total) * 100;
        return `${item.color} ${start}% ${cursor}%`;
      })
      .join(', ');
  }

</script>

{#if loading}
  <div class="dashboard-loading">
    <div class="loading-card">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">{t('Loading...')}</span>
      </div>
      <span>{t('Loading dashboard data...')}</span>
    </div>
  </div>
{:else if error}
  <div class="dashboard-shell">
    <div class="dashboard-error">
      <i class="bi bi-exclamation-triangle"></i>
      <div>
        <strong>{t('Failed to Load Dashboard')}</strong>
        <p>{error}</p>
      </div>
      <button type="button" class="refresh-button" onclick={refresh}>
        <i class="bi bi-arrow-clockwise"></i>
        <span>{t('Refresh')}</span>
      </button>
    </div>
  </div>
{:else}
  <div class="dashboard-shell">
    <section class="summary-grid">
      <DashboardAccentPanel />
      <article class="metric-card metric-card--benefit summary-metric-card">
        <span class="summary-metric-card__icon"><i class="bi bi-graph-up-arrow"></i></span>
        <div class="summary-metric-card__content">
          <div class="metric-card__value" dir="ltr">
            <strong>{fmt(benefitTotal)}</strong>
            <span class="metric-card__currency">{t(defaultCurrency)}</span>
          </div>
          <span class="metric-card__label">{t('Total Benefit Amount')}</span>
        </div>
      </article>

      <article class="metric-card metric-card--expense summary-metric-card">
        <span class="summary-metric-card__icon"><i class="bi bi-coin"></i></span>
        <div class="summary-metric-card__content">
          <div class="metric-card__value" dir="ltr">
            <strong>{fmt(expenseTotal)}</strong>
            <span class="metric-card__currency">{t(defaultCurrency)}</span>
          </div>
          <span class="metric-card__label">{t('Expenses')}</span>
        </div>
      </article>

      <article class="metric-card metric-card--net summary-metric-card" class:negative={netProfit < 0}>
        <span class="summary-metric-card__icon"><i class="bi bi-wallet2"></i></span>
        <div class="summary-metric-card__content">
          <div class="metric-card__value" dir="ltr">
            <strong>{fmt(netProfit)}</strong>
            <span class="metric-card__currency">{t(defaultCurrency)}</span>
          </div>
          <span class="metric-card__label">{t('Net Profit')}</span>
        </div>
      </article>
    </section>

    <section class="dashboard-grid">
      <article class="panel panel-trend">
        <header class="panel-header">
          <div class="trend-period-label">
            <span>{periodLabels[activePeriod]}</span>
          </div>
          <div class="panel-actions" dir={t('dir')}>
            <div class="trend-header-legend" dir="ltr">
              <button
                type="button"
                class:inactive={!trendDatasetVisible[0]}
                aria-pressed={trendDatasetVisible[0]}
                onclick={() => toggleTrendDataset(0)}>
                <i class="trend-header-legend__benefit"></i>
                {t('Benefit')}
              </button>
              <span class="trend-header-legend__separator">
                {_lang === 'en' ? 'vs' : _lang === 'ps' ? 'په مقابل کې' : 'در مقابل'}
              </span>
              <button
                type="button"
                class:inactive={!trendDatasetVisible[1]}
                aria-pressed={trendDatasetVisible[1]}
                onclick={() => toggleTrendDataset(1)}>
                <i class="trend-header-legend__expense"></i>
                {t('Expenses')}
              </button>
            </div>

            <div class="dashboard-filter-wrap">
              <button
                type="button"
                class="dashboard-filter-pill"
                onclick={togglePeriodMenu}
                aria-haspopup="menu"
                aria-expanded={showPeriodMenu}>
                <i class="bi bi-funnel"></i>
                <span>{periodLabels[activePeriod] || t('Today')}</span>
              </button>

              {#if showPeriodMenu}
                <div class="period-menu" role="menu">
                  {#each periods as period}
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={activePeriod === period}
                      class:active={activePeriod === period}
                      onclick={() => choosePeriod(period)}>
                      {periodLabels[period]}
                    </button>
                  {/each}
                  {#if showCustomDates}
                    <div class="custom-date-panel">
                      <AppDatePicker bind:value={customStartDate} label={t('From Date')} />
                      <AppDatePicker bind:value={customEndDate} label={t('To Date')} min={customStartDate || '1921-03-22'} />
                      <button type="button" class="custom-date-apply" disabled={!customStartDate || !customEndDate || customStartDate > customEndDate} onclick={applyCustomPeriod}>{t('Apply')}</button>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>

            <button type="button" class="icon-button" title={t('Refresh')} onclick={refresh}>
              <i class="bi bi-arrow-clockwise"></i>
            </button>
          </div>
        </header>

        <div class="trend-layout">
          <div class="chart-frame">
            <canvas bind:this={salesTrendCanvas}></canvas>
          </div>
        </div>
      </article>

      <article class="panel mix-panel">
        <header class="panel-header">
          <div>
            <h2>{t('Revenue Mix')}</h2>
            <span>{periodLabels[activePeriod]}</span>
          </div>
          <i class="bi bi-pie-chart-fill panel-mark"></i>
        </header>

        <div class="mix-list">
          {#each periodMetrics as metric}
            <div class="mix-item" style={`--metric-color: ${metric.color}; --metric-width: ${revenueMixTotal ? Math.max(4, Math.abs(metric.value) / revenueMixTotal * 100) : 4}%;`}>
              <div>
                <span><i></i>{metric.label}</span>
                <strong dir="ltr">{fmt(metric.value)}</strong>
              </div>
              <div class="mix-track"><span></span></div>
            </div>
          {/each}
        </div>
      </article>

    </section>

    <section class="support-grid">
      <article class="panel compact-panel">
        <header class="panel-header">
          <div>
            <h2>{t('Treasury')}</h2>
          </div>
          <i class="bi bi-bank2 panel-mark success"></i>
        </header>

        <div class="treasury-list">
          {#if treasuryEntries.length === 0}
            <div class="empty-state">{t('No treasury balance')}</div>
          {:else}
            {#each treasuryEntries as [currency, amount]}
              <div>
                <span>{t(currency)}</span>
                <strong class:negative={Number(amount) < 0}>
                  <span dir="ltr">{fmt(amount)}</span>
                
                </strong>
              </div>
            {/each}
          {/if}
        </div>
      </article>

      <article class="panel products-panel">
        <header class="panel-header">
          <div>
            <h2>{t('Top Products')} — {periodLabels[activePeriod]}</h2>
          </div>
          <i class="bi bi-trophy-fill panel-mark warning"></i>
        </header>

        <div class="product-list">
          {#if plainTopProducts.length === 0}
            <div class="empty-state">{t('No sales recorded')}</div>
          {:else}
            {#each plainTopProducts as product, index}
              <div
                class="product-row"
                data-product={product.name}
                data-revenue={`${t('Revenue')}: ${fmt(product.rev)} ${t(defaultCurrency)}`}
                data-quantity={`${t('qty')}: ${fmt(product.qty)}`}
                style={`--product-color: ${topProductColors[index % topProductColors.length]};`}>
                <div class="rank">{index + 1}</div>
                <div class="product-main">
                  <div>
                    <strong>{product.name}</strong>
                    {#if product.code}<small>{product.code}</small>{/if}
                  </div>
                  <span class="product-bar" style={`--bar-width: ${Math.max(6, (Number(product.rev) || 0) / maxTopProductRevenue * 100)}%;`}></span>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </article>

      <article class="panel compact-panel alert-panel" class:combined-alert-panel={enable_expiry_date}>
        <header class="panel-header">
          <div>
            <h2>
              {t('Low Stock')}
              {#if enable_expiry_date} / {t('Expiry')}{/if}
            </h2>
            <span>{lowStockProducts.length + (enable_expiry_date ? expiringProducts.length : 0)} {t('alerts')}</span>
          </div>
          <div class="panel-mark-stack">
            <i class="bi bi-exclamation-triangle-fill panel-mark danger"></i>
            {#if enable_expiry_date}
              <i class="bi bi-calendar-x-fill panel-mark warning"></i>
            {/if}
          </div>
        </header>

        <div class="alert-sections">
          <section class="alert-section">
            <div class="alert-section-head">
              <span><i class="bi bi-exclamation-triangle-fill danger"></i>{t('Low Stock')}</span>
              <strong>{lowStockProducts.length}</strong>
            </div>

            <div class="alert-list">
              {#if lowStockProducts.length === 0}
                <div class="empty-state success">{t('All products well stocked')}</div>
              {:else}
                {#each lowStockProducts.slice(0, 5) as product}
                    <div>
                      <span>
                        <strong>{product.name}</strong>
                      </span>
                      <em class:danger={Number(product.totalQty) <= 0}>{fmt(product.totalQty)}</em>
                    </div>
                {/each}
              {/if}
            </div>
          </section>

          {#if enable_expiry_date}
            <section class="alert-section">
              <div class="alert-section-head">
                <span><i class="bi bi-calendar-x-fill warning"></i>{t('Expiry')}</span>
                <strong>{expiringProducts.length}</strong>
              </div>

              <div class="alert-list">
                {#if expiringProducts.length === 0}
                  <div class="empty-state success">{t('All expiry dates look good')}</div>
                {:else}
                  {#each expiringProducts.slice(0, 5) as product}
                    <div>
                      <span>
                        <strong>{product.name}</strong>
                        <small>{product.expiry_date}</small>
                      </span>
                      <em class:danger={Number(product.remaining_days) <= 0}>{fmt(product.remaining_days)} {t('days')}</em>
                    </div>
                  {/each}
                {/if}
              </div>
            </section>
          {/if}
        </div>
      </article>
    </section>
  </div>
{/if}

<style>
  .dashboard-shell {
    --section-gap: 0.65rem;
    --card-padding: 0.65rem;
    min-height: calc(100vh - 74px);
    padding: 0;
    background: transparent;
    color: #172033;
  }

  .dashboard-loading {
    min-height: calc(100vh - 74px);
    display: grid;
    place-items: center;
    background: var(--erp-bg);
  }

  .loading-card,
  .dashboard-error {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    border: 1px solid #e6edf7;
    border-radius: 8px;
    background: #fff;
    color: #667391;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
  }

  .loading-card {
    padding: 1rem 1.2rem;
    font-weight: 800;
  }

  .dashboard-error {
    justify-content: space-between;
    padding: 1rem;
    color: #172033;
  }

  .dashboard-error > i {
    color: #dc3545;
    font-size: 1.6rem;
  }

  .dashboard-error p {
    margin: 0.15rem 0 0;
    color: #667391;
  }

  .dashboard-filter-wrap {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
  }

  .dashboard-filter-pill,
  .period-menu button,
  .refresh-button,
  .icon-button {
    border: 0;
    border-radius: 8px;
    font: inherit;
    transition:
      transform 0.2s ease,
      background 0.2s ease,
      color 0.2s ease,
      border-color 0.2s ease;
  }

  .dashboard-filter-pill {
    min-height: 46px;
    display: inline-flex;
    gap: 0.62rem;
    align-items: center;
    justify-content: center;
    padding: 0.62rem 1rem;
    border: 1px solid #dfe9f8;
    background: #fff;
    color: #0f6efd;
    font-size: 0.82rem;
    font-weight: 900;
    line-height: 1;
    box-shadow: 0 10px 22px rgba(15, 110, 253, 0.055);
  }

  .dashboard-filter-pill {
    min-width: 122px;
  }

  .dashboard-filter-pill i {
    color: #0f6efd;
    font-size: 0.98rem;
  }

  .dashboard-filter-pill:hover,
  .dashboard-filter-pill[aria-expanded='true'] {
    border-color: #b8d3ff;
    background: #f7fbff;
    color: #0f6efd;
  }

  .period-menu {
    position: absolute;
    inset-block-start: calc(100% + 0.45rem);
    inset-inline-start: 0;
    z-index: 30;
    min-width: 170px;
    display: grid;
    gap: 0.18rem;
    padding: 0.35rem;
    border: 1px solid #dfe9f8;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 18px 36px rgba(15, 23, 42, 0.12);
  }

  .period-menu button {
    flex: 0 0 auto;
    padding: 0.55rem 0.72rem;
    background: transparent;
    color: #6f7d9a;
    font-size: 0.8rem;
    font-weight: 850;
    text-align: start;
    white-space: nowrap;
  }

  .period-menu button:hover,
  .period-menu button.active {
    background: #0f6efd;
    color: #fff;
  }
  .custom-date-panel{display:grid;gap:.45rem;margin-top:.2rem;padding:.55rem;border-top:1px solid #e8eef7;background:#f8faff;border-radius:0 0 7px 7px}.custom-date-panel label{display:grid;gap:.2rem;color:#65748e;font-size:.65rem;font-weight:800}.custom-date-panel input{width:100%;height:2rem;padding:.25rem .4rem;border:1px solid #d6e0ed;border-radius:6px;background:#fff;color:#22304a;font-size:.7rem;direction:ltr}.period-menu .custom-date-apply{width:100%;padding:.45rem .6rem;border:0;border-radius:6px;background:#0f6efd;color:#fff;text-align:center}.period-menu .custom-date-apply:disabled{opacity:.45;cursor:not-allowed}

  .refresh-button {
    display: inline-flex;
    gap: 0.42rem;
    align-items: center;
    justify-content: center;
    padding: 0.64rem 0.86rem;
    border: 1px solid #dce8fa;
    background: #fff;
    color: #0f6efd;
    font-size: 0.82rem;
    font-weight: 900;
    box-shadow: 0 10px 24px rgba(15, 110, 253, 0.08);
  }

  .refresh-button:hover,
  .icon-button:hover {
    transform: translateY(-1px);
    background: #eef5ff;
  }

  .summary-grid,
  .dashboard-grid,
  .support-grid {
    display: grid;
    gap: var(--section-gap, 0.85rem);
  }

  .summary-grid {
    grid-template-columns: 1.15fr repeat(3, minmax(0, 1fr));
    margin-bottom: var(--section-gap, 0.85rem);
  }

  .summary-metric-card {
    min-width: 0;
    min-height: clamp(4.5rem, 6vw, 5.25rem);
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 0.35rem;
    padding: 0.65rem 0.9rem;
    border-color: #edf0f5;
    border-radius: var(--card-radius, 0.5rem);
    background: #fff;
    box-shadow: 0 14px 34px rgba(33, 55, 93, 0.045);
  }

  .summary-metric-card__icon {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    color: currentColor;
    font-size: 1.35rem;
  }

  .summary-metric-card__content {
    min-width: 0;
    display: grid;
    gap: 0.15rem;
  }

  .summary-metric-card .metric-card__label {
    max-width: none;
    color: #4b5563;
    font-size: 0.74rem;
    font-weight: 650;
    line-height: 1.15;
  }

  .summary-metric-card .metric-card__value {
    justify-content: flex-start;
    gap: 0.32rem;
  }

  .summary-metric-card .metric-card__value strong {
    color: #111827;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: clamp(1.05rem, 1.25vw, 1.25rem);
    font-weight: 950;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  .summary-metric-card .metric-card__currency {
    font-size: 0.7rem;
  }

  .summary-metric-card.metric-card--benefit .metric-card__value strong {
    color: #111827;
  }

  .summary-metric-card.metric-card--expense .metric-card__value strong {
    color: #111827;
  }

  .summary-metric-card.metric-card--net .metric-card__value strong {
    color: #111827;
  }

  .summary-metric-card.metric-card--benefit {
    color: #0f6efd;
  }

  .summary-metric-card.metric-card--expense {
    color: #f59f00;
  }

  .summary-metric-card.metric-card--net {
    color: #7c3aed;
  }

  .summary-card {
    position: relative;
    min-height: clamp(4.5rem, 6vw, 5.25rem);
    display: flex;
    gap: clamp(0.65rem, 1vw, 1rem);
    align-items: center;
    padding: var(--card-padding, 0.9rem) clamp(0.85rem, 1.2vw, 1.15rem);
    border: 1px solid #eaf0f8;
    border-radius: var(--card-radius, 0.5rem);
    background: #fff;
    box-shadow: 0 14px 34px rgba(33, 55, 93, 0.055);
    overflow: hidden;
    min-width: 0;
  }

  .summary-icon {
    width: clamp(2rem, 2.6vw, 2.5rem);
    height: clamp(2rem, 2.6vw, 2.5rem);
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: clamp(1rem, 1.2vw, 1.15rem);
  }

  .summary-content {
    position: relative;
    z-index: 1;
    min-width: 0;
    flex: 1;
  }

  .card-menu {
    position: absolute;
    inset-block-start: -0.75rem;
    inset-inline-end: -0.35rem;
    color: #9aa8c2;
    font-size: 1.14rem;
    line-height: 1;
  }

  .summary-content strong {
    display: flex;
    flex-wrap: wrap;
    gap: 0.32rem;
    align-items: baseline;
    margin-bottom: 0.22rem;
    color: #172033;
    font-size: clamp(1.08rem, 1.5vw, 1.34rem);
    font-weight: 950;
    line-height: 1.15;
  }

  .summary-content strong small {
    color: inherit;
    font-size: 0.68rem;
    font-weight: 850;
  }

  .summary-content > span {
    display: block;
    color: #6f7d9a;
    font-size: 0.84rem;
    font-weight: 800;
  }

  .negative {
    color: #dc3545 !important;
  }

  .dashboard-grid {
    grid-template-columns: minmax(0, 2.1fr) minmax(280px, 0.9fr);
    align-items: stretch;
    margin-bottom: var(--section-gap);
  }

  .panel {
    border: 1px solid #e6edf7;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 14px 32px rgba(15, 23, 42, 0.055);
    overflow: hidden;
  }

  .panel-header {
    min-height: 44px;
    display: flex;
    gap: 0.65rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #edf2f8;
  }

  .dashboard-grid .panel-header {
    min-height: 42px;
    padding: 0.45rem 0.75rem;
  }

  .panel-header h2 {
    margin: 0;
    color: #172033;
    font-size: 0.9rem;
    font-weight: 950;
    letter-spacing: 0;
  }

  .panel-header span {
    display: block;
    margin-top: 0.18rem;
    color: #7a86a3;
    font-size: 0.76rem;
    font-weight: 800;
  }

  .panel-actions {
    display: inline-flex;
    gap: 0.65rem;
    align-items: center;
    justify-content: flex-end;
    flex: 0 0 auto;
  }

  .panel-mark {
    color: #0f6efd;
    font-size: 1.25rem;
  }

  .panel-mark.success {
    color: #14a44d;
  }

  .panel-mark.warning {
    color: #f59f00;
  }

  .panel-mark.danger {
    color: #dc3545;
  }

  .icon-button {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid #dce8fa;
    background: #fff;
    color: #0f6efd;
  }

  .panel-trend {
    grid-column: span 1;
    position: relative;
    z-index: 100;
    border: 0;
    border-radius: 12px;
    box-shadow: none;
    overflow: visible;
  }

  .panel-trend .panel-header {
    position: relative;
    z-index: 110;
    direction: ltr;
    background: #fff;
    border-bottom: 0;
    border-radius: 10px 10px 0 0;
  }

  .panel-trend .panel-actions {
    width: 100%;
    direction: ltr;
    gap: 0.3rem;
    align-items: center;
    justify-content: flex-start;
  }

  .panel-trend .trend-period-label {
    display: none;
  }

  .panel-trend .dashboard-filter-wrap {
    order: 1;
  }

  .panel-trend .icon-button {
    order: 2;
  }

  .panel-trend .trend-header-legend {
    order: 3;
    margin-left: auto;
  }

  .trend-series-title {
    display: inline-flex;
    gap: 0.45rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .trend-series-title__item {
    display: inline-flex;
    gap: 0.3rem;
    align-items: center;
  }

  .trend-series-title__item i {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 2px;
  }

  .trend-series-title__item--benefit i {
    background: #0f6efd;
  }

  .trend-series-title__item--expense i {
    background: #dc3545;
  }

  .trend-series-title b {
    color: #64748b;
    font-weight: 650;
  }

  .trend-header-legend {
    display: inline-flex;
    gap: 0.85rem;
    align-items: center;
    color: #64748b;
    font-size: 0.7rem;
    font-weight: 650;
    white-space: nowrap;
  }

  .trend-header-legend button {
    display: inline-flex;
    gap: 0.32rem;
    align-items: center;
    padding: 0;
    border: 0;
    margin: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: inherit;
    cursor: pointer;
    transition: opacity 0.16s ease;
  }

  .trend-header-legend button.inactive {
    opacity: 0.4;
  }

  .trend-header-legend__separator {
    color: #64748b;
    font-size: inherit;
    font-weight: 650;
  }

  .trend-header-legend i {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 2px;
  }

  .trend-header-legend__benefit {
    background: #0f6efd;
  }

  .trend-header-legend__expense {
    background: #dc3545;
  }

  .panel-trend .dashboard-filter-pill {
    min-width: 78px;
    min-height: 36px;
    gap: 0.3rem;
    padding-inline: 0.4rem;
    padding-block: 0.45rem;
  }

  .panel-trend .icon-button {
    width: 36px;
    height: 36px;
  }
  .panel-trend .period-menu { z-index:120; }

  .panel-trend .period-menu {
    width: 130px;
    min-width: 130px;
    max-width: calc(100vw - 1.5rem);
  }

  .panel-trend .custom-date-panel :global(.app-date-field) {
    min-width: 0;
    width: 100%;
  }

  .trend-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.7rem;
    align-items: stretch;
    padding: 0.45rem 0.75rem 0.55rem;
  }

  .chart-frame {
    height: 160px;
    min-width: 0;
    padding: 0.15rem 0.3rem 0.25rem;
  }

  .share-panel {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    align-items: stretch;
    justify-content: center;
    min-height: 160px;
    border-inline-start: 1px solid #edf2f8;
    padding-inline-start: 0.7rem;
  }

  .share-metrics {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    width: 100%;
  }

  .metric-cards {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    width: 100%;
  }

  .metric-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.65rem;
    padding: 0.42rem 0.58rem;
    border-radius: 12px;
    border: 1px solid transparent;
    min-height: 40px;
  }

  .metric-card__label {
    flex: 0 0 auto;
    max-width: 42%;
    font-size: 0.68rem;
    font-weight: 850;
    line-height: 1.25;
    text-align: start;
  }

  .metric-card__body {
    min-width: 0;
    flex: 1;
    text-align: end;
  }

  .metric-card__value {
    display: inline-flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 0.28rem;
    flex-wrap: wrap;
    max-width: 100%;
  }

  .metric-card__currency {
    font-size: 0.72rem;
    font-weight: 800;
    line-height: 1.1;
    white-space: nowrap;
  }

  .metric-card__body strong {
    font-size: 0.98rem;
    font-weight: 950;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    line-height: 1.1;
    word-break: break-word;
  }

  .metric-card--benefit {
    background: #f3f7ff;
    border-color: #d6e4ff;
  }

  .metric-card--benefit .metric-card__label,
  .metric-card--benefit .metric-card__currency,
  .metric-card--benefit .metric-card__body strong {
    color: #0f6efd;
  }

  .metric-card--expense {
    background: #fff5f5;
    border-color: #fecaca;
  }

  .metric-card--expense .metric-card__label,
  .metric-card--expense .metric-card__currency,
  .metric-card--expense .metric-card__body strong {
    color: #dc3545;
  }

  .metric-card--net {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }

  .metric-card--net .metric-card__label,
  .metric-card--net .metric-card__currency,
  .metric-card--net .metric-card__body strong {
    color: #198754;
  }

  .metric-card--net.negative {
    background: #fff5f5;
    border-color: #fecaca;
  }

  .metric-card--net.negative .metric-card__label,
  .metric-card--net.negative .metric-card__currency,
  .metric-card--net.negative .metric-card__body strong {
    color: #dc3545;
  }

  .share-donut,
  .mix-donut {
    display: grid;
    place-items: center;
    border-radius: 50%;
  }

  .share-donut {
    width: 104px;
    height: 104px;
    margin: 0 auto;
    background: conic-gradient(#0f6efd var(--share), #dc3545 0);
  }

  .share-donut > div,
  .mix-donut > div {
    width: 80px;
    height: 80px;
    display: grid;
    place-items: center;
    align-content: center;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
    text-align: center;
  }

  .share-donut strong,
  .mix-donut strong {
    color: #172033;
    font-size: 1rem;
    font-weight: 950;
  }

  .share-donut span,
  .mix-donut span {
    color: #7a86a3;
    font-size: 0.64rem;
    font-weight: 850;
  }

  .mix-panel {
    min-height: 100%;
  }

  .mix-donut {
    width: 96px;
    height: 96px;
    margin: 0.4rem auto 0.3rem;
    background: conic-gradient(var(--mix-gradient));
  }

  .mix-donut > div {
    width: 74px;
    height: 74px;
  }

  .mix-donut strong {
    max-width: 86px;
    overflow: hidden;
    font-size: 0.95rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mix-list {
    display: grid;
    gap: 0.35rem;
    padding: 0 0.75rem 0.5rem;
  }

  .mix-item > div:first-child {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.2rem;
    color: #65728e;
    font-size: 0.78rem;
    font-weight: 850;
  }

  .mix-item span {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
    min-width: 0;
  }

  .mix-item i {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--metric-color);
  }

  .mix-item strong {
    color: #172033;
    font-size: 0.78rem;
    font-weight: 950;
  }

  .mix-track {
    height: 4px;
    overflow: hidden;
    border-radius: 999px;
    background: #edf2f8;
  }

  .mix-track span {
    width: var(--metric-width);
    height: 100%;
    display: block;
    border-radius: inherit;
    background: var(--metric-color);
  }

  .products-panel {
    min-height: 230px;
  }

  .product-list,
  .treasury-list,
  .alert-list {
    display: grid;
    gap: 0.5rem;
    padding: 0.7rem 0.8rem 0.8rem;
  }

  .product-row {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: center;
  }

  .rank {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: #edf6ff;
    color: #0f6efd;
    font-weight: 950;
  }

  .product-main {
    min-width: 0;
  }

  .product-main strong,
  .alert-list strong {
    display: block;
    min-width: 0;
    overflow: hidden;
    color: #172033;
    font-size: 0.84rem;
    font-weight: 900;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .product-main small,
  .alert-list small {
    display: block;
    color: #8b99b5;
    font-size: 0.7rem;
    font-weight: 750;
  }

  .product-bar {
    position: relative;
    display: block;
    height: 6px;
    margin-top: 0.45rem;
    overflow: hidden;
    border-radius: 999px;
    background: #edf2f8;
  }

  .product-bar::before {
    content: '';
    position: absolute;
    inset: 0;
    width: var(--bar-width);
    border-radius: inherit;
    background: #0f6efd;
  }

  .product-value {
    min-width: 82px;
    text-align: end;
  }

  .product-value strong {
    display: block;
    color: #172033;
    font-size: 0.82rem;
    font-weight: 950;
  }

  .product-value small {
    display: block;
    color: #7a86a3;
    font-size: 0.7rem;
    font-weight: 800;
  }

  .products-panel .product-list {
    align-content: start;
    gap: 0.25rem;
    padding: 0.5rem 0.7rem 0.65rem;
  }

  .products-panel .product-row {
    position: relative;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    padding: 0.18rem 0 0.28rem;
    border-bottom: 1px solid #edf1f6;
  }

  .products-panel .product-row:last-child {
    border-bottom: 0;
  }

  .products-panel .rank {
    display: none;
  }

  .products-panel .product-main {
    display: grid;
    gap: 0.18rem;
  }

  .products-panel .product-main > div {
    min-width: 0;
  }

  .products-panel .product-main strong {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    color: #4b5563;
    font-size: 0.76rem;
    font-weight: 650;
  }

  .products-panel .product-main strong::before {
    content: '';
    width: 9px;
    height: 9px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--product-color);
  }

  .products-panel .product-main small {
    display: none;
  }

  .products-panel .product-bar {
    height: 4px;
    margin-top: 0;
    overflow: visible;
    border-radius: 999px;
    background: #edf2f7;
    outline: 0;
  }

  .products-panel .product-bar::before {
    min-width: 3px;
    border-radius: 999px;
    background: var(--product-color);
    box-shadow: none;
  }

  .products-panel .product-value {
    align-self: end;
    min-width: 70px;
    padding-bottom: 0.05rem;
  }

  .products-panel .product-value strong {
    color: #172033;
    font-size: 0.74rem;
  }

  .products-panel .product-row::after {
    content: attr(data-product) '\A' attr(data-revenue) '\A' attr(data-quantity);
    position: absolute;
    inset-inline-end: 0.25rem;
    inset-block-start: calc(100% + 0.2rem);
    inset-block-end: auto;
    z-index: 20;
    max-width: min(240px, 90%);
    padding: 0.48rem 0.62rem;
    border-radius: 7px;
    background: rgba(20, 24, 30, 0.9);
    color: #fff;
    font-size: 0.68rem;
    font-weight: 650;
    line-height: 1.45;
    white-space: pre-line;
    box-shadow: 0 8px 22px rgba(15, 23, 42, 0.2);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateY(4px);
    transition:
      opacity 0.16s ease,
      transform 0.16s ease,
      visibility 0.16s ease;
  }

  .products-panel .product-row:hover::after {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }

  .products-panel .product-row:nth-last-child(-n + 2)::after {
    inset-block-start: auto;
    inset-block-end: calc(100% + 0.2rem);
  }

  .support-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .support-grid > .panel {
    height: clamp(210px, 29vh, 280px);
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .support-grid > .panel > .panel-header {
    flex: 0 0 auto;
  }

  .support-grid .product-list,
  .support-grid .treasury-list,
  .support-grid .alert-sections {
    min-height: 0;
    flex: 1 1 auto;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
  }

  .support-grid .treasury-list {
    align-content: start;
    gap: 0.3rem;
    padding: 0.5rem 0.65rem;
  }

  .support-grid .treasury-list > div {
    min-height: 34px;
    padding: 0.3rem 0.45rem;
  }

  .support-grid .product-list::-webkit-scrollbar,
  .support-grid .treasury-list::-webkit-scrollbar,
  .support-grid .alert-sections::-webkit-scrollbar {
    width: 5px;
  }

  .support-grid .product-list::-webkit-scrollbar-thumb,
  .support-grid .treasury-list::-webkit-scrollbar-thumb,
  .support-grid .alert-sections::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: #cbd5e1;
  }

  .support-grid .product-list::-webkit-scrollbar-track,
  .support-grid .treasury-list::-webkit-scrollbar-track,
  .support-grid .alert-sections::-webkit-scrollbar-track {
    background: transparent;
  }

  .compact-panel {
    min-height: 0;
  }

  .combined-alert-panel {
    grid-column: span 2;
  }

  .panel-mark-stack {
    display: inline-flex;
    gap: 0.55rem;
    align-items: center;
  }

  .panel-mark-stack .panel-mark {
    font-size: 1.08rem;
  }

  .alert-sections {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem;
    padding: 0.7rem 0.8rem 0.8rem;
  }

  .alert-section {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 0.75rem;
  }

  .alert-section + .alert-section {
    padding-inline-start: 1rem;
    border-inline-start: 1px solid #edf2f8;
  }

  .alert-section-head {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    color: #65728e;
    font-size: 0.78rem;
    font-weight: 900;
  }

  .alert-section-head span {
    display: inline-flex;
    gap: 0.45rem;
    align-items: center;
    min-width: 0;
  }

  .alert-section-head i {
    flex: 0 0 auto;
    color: #0f6efd;
  }

  .alert-section-head i.danger {
    color: #dc3545;
  }

  .alert-section-head i.warning {
    color: #f59f00;
  }

  .alert-section-head strong {
    color: #172033;
    font-size: 0.8rem;
    font-weight: 950;
  }

  .alert-panel .alert-list {
    padding: 0;
  }

  .treasury-list > div,
  .alert-list > div {
    display: flex;
    gap: 0.8rem;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    padding: 0.5rem 0.6rem;
    border-radius: 8px;
    background: #f7faff;
  }

  .treasury-list span {
    color: #65728e;
    font-size: 0.78rem;
    font-weight: 850;
  }

  .treasury-list strong {
    display: flex;
    flex-wrap: wrap;
    gap: 0.28rem;
    align-items: baseline;
    color: #172033;
    font-size: 0.9rem;
    font-weight: 950;
  }

  .treasury-list strong small {
    font-size: 0.66rem;
  }

  .alert-list span {
    min-width: 0;
  }

  .alert-list em {
    flex: 0 0 auto;
    color: #172033;
    font-size: 0.78rem;
    font-style: normal;
    font-weight: 950;
  }

  .alert-list em.danger {
    color: #dc3545;
  }

  .alert-panel .alert-list > div {
    padding-inline: 0;
    border-radius: 0;
    background: transparent;
  }

  .alert-panel .alert-list strong {
    color: #4b5563;
    font-weight: 650;
  }

  .empty-state {
    min-height: 96px;
    display: grid;
    place-items: center;
    border: 1px dashed #dce8fa;
    border-radius: 8px;
    background: #f8fbff;
    color: #7a86a3;
    font-size: 0.82rem;
    font-weight: 850;
    text-align: center;
  }

  .empty-state.success {
    color: #14a44d;
    background: #f4fbf7;
    border-color: #d8f0e2;
  }

  @media (max-width: 1099px) {
    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .summary-grid > :last-child {
      grid-column: 1 / -1;
    }

    .support-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .combined-alert-panel {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 1199px) {
    .dashboard-grid {
      grid-template-columns: 1fr;
    }

    .trend-layout {
      grid-template-columns: minmax(0, 1fr) 230px;
    }
  }

  @media (max-width: 767px) {
    .dashboard-shell {
      padding: 0;
    }

    .dashboard-filter-wrap {
      flex: 0 0 118px;
    }

    .dashboard-filter-pill {
      width: 100%;
    }

    .summary-grid,
    .support-grid {
      grid-template-columns: 1fr;
    }

    .summary-grid > :last-child {
      grid-column: auto;
    }

    .combined-alert-panel {
      grid-column: auto;
    }

    .alert-sections {
      grid-template-columns: 1fr;
    }

    .alert-section + .alert-section {
      padding-block-start: 1rem;
      padding-inline-start: 0;
      border-block-start: 1px solid #edf2f8;
      border-inline-start: 0;
    }

    .summary-card {
      min-height: 112px;
    }

    .trend-layout {
      grid-template-columns: 1fr;
    }

    .share-panel {
      min-height: 0;
      border-inline-start: 0;
      border-top: 1px solid #edf2f8;
      padding: 1rem 0 0;
    }

    .chart-frame {
      height: 220px;
    }

    .panel-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .panel-actions {
      width: 100%;
      justify-content: flex-start;
    }

    .panel-actions .dashboard-filter-wrap {
      flex: 0 0 118px;
    }

    .panel-header .panel-actions .icon-button {
      align-self: auto;
      margin-top: 0;
    }

    .panel-header .icon-button,
    .panel-header .panel-mark {
      align-self: flex-end;
      margin-top: -2.7rem;
    }

    .panel-header .panel-mark-stack {
      align-self: flex-end;
      margin-top: -2.7rem;
    }

    .panel-header .panel-mark-stack .panel-mark {
      align-self: auto;
      margin-top: 0;
    }

    .product-row {
      grid-template-columns: 30px minmax(0, 1fr);
    }

    .product-value {
      grid-column: 2;
      text-align: start;
    }
  }

  @media (max-width: 420px) {
    .dashboard-filter-pill {
      min-height: 42px;
      padding: 0.52rem 0.72rem;
      font-size: 0.74rem;
    }

    .summary-card {
      align-items: flex-start;
      flex-direction: column;
    }

    .summary-icon {
      width: 48px;
      height: 48px;
    }

  }

  .summary-grid .summary-metric-card {
    background: #ffffff;
    border-color: transparent;
    justify-content: flex-start;
    gap: 0.35rem;
  }

  .summary-grid .summary-metric-card__content {
    flex: 0 1 auto;
  }

  .summary-grid .summary-metric-card .metric-card__value strong,
  .summary-grid .summary-metric-card .metric-card__currency,
  .summary-grid .summary-metric-card .metric-card__label {
    color: #111827;
  }

  .summary-grid .summary-metric-card .metric-card__label {
    font-weight: 400;
  }

  @media (min-width: 1100px) {
    .dashboard-shell {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .summary-grid,
    .dashboard-grid {
      flex: 0 0 auto;
    }

    .support-grid {
      min-height: 150px;
      flex: 1 1 0;
      overflow: hidden;
    }

    .support-grid > .panel {
      height: 100%;
      max-height: 100%;
    }
  }

  .support-grid .product-list,
  .support-grid .treasury-list,
  .support-grid .alert-sections {
    scrollbar-width: none;
  }

  .support-grid .product-list::-webkit-scrollbar,
  .support-grid .treasury-list::-webkit-scrollbar,
  .support-grid .alert-sections::-webkit-scrollbar {
    display: none;
  }

</style>
