<script>
  import { onMount } from 'svelte';
  import { db } from '../../db.js';

  import { showDate, setDatePickers } from '../../calendar.js';
  import {calculateCreditDebitOfAllAccounts} from './AccountsHelper.js';

  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import AddJournalModal from './AddJournalModal.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let accounts = [];
  let accountTypes = [];

  let accountGroups = [];
  let loading = true;

  async function loadAccounts() {
      loading = true;
      accountTypes = await db.account_types.where('status').equals(1).toArray();
      accounts = await db.accounts.where('status').equals(1).toArray();
      accounts = accounts.filter((a) => a.code !== "NOTRACK" && a.code !== "RECEIVABLE" && a.code !== "PAYABLE" && a.code !== "SALES" && a.code !== "PURCHASE"&& a.code !== "EXCHANGE");
      accounts = accounts.filter((a) => {
            if (a.account_status) {
                return a.account_status === "active";
            } else {
                return a.status === 1;
            }
      });
      accounts = accounts.map(acc => ({
          ...acc,
          include: true
      }));
      accountGroups = await db.account_groups.where('status').equals(1).toArray();
      let accountBalances = await calculateCreditDebitOfAllAccounts();

      accounts.forEach(acc => {
          if (accountBalances[acc.id]) {
              acc.computedBalances = accountBalances[acc.id];
          }
      });
      accounts = [...accounts];
      loading = false;
  }


  let filterBalState = 0;
  let balStateDropdownOpen = false;

  // --- Table State ---
  let searchTerm = '';
  let filterType = new Set();
  let typeDropdownOpen = false;
  let filterStatus = 'active';
  let currentPage = 1;
  let itemsPerPage = 10;
  let sortColumn = 'created_at';
  let sortDirection = 'asc';

  let products = [];
  let warehouse_products = [];

  let totalPurchaseCostMap = {};
  let totalSaleValueMap = {};
  let totalQuantityCount = 0;

  let quantityMap = {};
  function rebuildQuantityMap() {
    quantityMap = {};
    warehouse_products.forEach((wp) => {
      if (wp.status === 1) {
        quantityMap[wp.product_id] = (quantityMap[wp.product_id] || 0) + Number(wp.quantity);
      }
    });
  }
  let modalRef;

  function calculatePriceMap() {
    totalPurchaseCostMap = {};
    totalSaleValueMap = {};
    totalQuantityCount = 0;
    products.forEach((p) => {
      const buyPrice = parseFloat(p.buy_price) || 0;
      const sellPrice = parseFloat(p.sell_price) || 0;
      const qty = quantityMap[p.id] || 0;
      const buyCurrency = p.buy_currency;
      const sellCurrency = p.sell_currency;
      totalPurchaseCostMap[buyCurrency] = (totalPurchaseCostMap[buyCurrency] || 0) + buyPrice * qty * -1;
      totalSaleValueMap[sellCurrency] = (totalSaleValueMap[sellCurrency] || 0) + sellPrice * qty;
      totalQuantityCount += qty;
    });
  }

  async function loadProducts() {
    console.log('loaded');

    products = await db.products.where({ status: 1 }).toArray();

    warehouse_products = await db.warehouse_products.where({ status: 1 }).toArray();

    rebuildQuantityMap();

    calculatePriceMap();
  }

  onMount(async () => {

    await loadProducts();

    await loadAccounts();

    currencies = await db.currencies.where('status').equals(1).toArray();

    defaultCurrency = currencies.find((c) => c.isDefault == 1)?.code || 'AFN';
  });

  function getPageNumbers(current, total) {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
        range.push(i);
      }
    }

    for (let i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    return rangeWithDots;
  }

  function getTypeName(id) {
    const tObj = accountTypes.find((a) => a.id === id) || {};
    if (t('Lang') === 'en') return tObj.name || '';
    if (t('Lang') === 'fa') return tObj.name_fa || tObj.name || '';
    if (t('Lang') === 'ps') return tObj.name_ps || tObj.name || '';
    return tObj.name || '';
  }


  let overallBalances = {};
  let overallBalanceArray = [];
  let currencies = [];
  let defaultCurrency = null;
  let defaultCurrencyProfit = null;

  let TreasuryBalances = {};
  let AllCustomersBalances = {};
  let AllSupplierBalances = {};
  let AllShareholderBalances = {};

  let checkAll = false;

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = fromCurrency.exchangeRate || 1;
    const toRate = toCurrency.exchangeRate || 1;
    return (amount / toRate) * fromRate;
  }

  let profitArray = [];

  $: filteredAccounts = (() => {
    let result = accounts.slice();

    TreasuryBalances = {};
    AllCustomersBalances = {};
    AllSupplierBalances = {};
    AllShareholderBalances = {};

    result.forEach((a) => {
      if (a.computedBalances) {
        if (a.code == 'TREASURY') {
          Object.entries(a.computedBalances).forEach((b) => {
            let thisBal = b[1].credit - b[1].debit;
            TreasuryBalances[b[0]] = TreasuryBalances[b[0]] ? TreasuryBalances[b[0]] + thisBal : thisBal;
          });
        }
        if (a.account_type_id == 4) {
          Object.entries(a.computedBalances).forEach((b) => {
            let thisBal = b[1].credit - b[1].debit;
            AllCustomersBalances[b[0]] = AllCustomersBalances[b[0]] ? AllCustomersBalances[b[0]] + thisBal : thisBal;
          });
        }
        if (a.account_type_id == 3) {
          Object.entries(a.computedBalances).forEach((b) => {
            let thisBal = b[1].credit - b[1].debit;
            AllSupplierBalances[b[0]] = AllSupplierBalances[b[0]] ? AllSupplierBalances[b[0]] + thisBal : thisBal;
          });
        }
        if (a.account_type_id == 7) {
          Object.entries(a.computedBalances).forEach((b) => {
            let thisBal = b[1].credit - b[1].debit;
            AllShareholderBalances[b[0]] = AllShareholderBalances[b[0]]
              ? AllShareholderBalances[b[0]] + thisBal
              : thisBal;
          });
        }
      }
    });

    profitArray = Object.entries(
      sumRunning([
        TreasuryBalances,
        totalPurchaseCostMap,
        AllCustomersBalances,
        AllSupplierBalances,
        AllShareholderBalances,
      ]),
    );
    defaultCurrencyProfit = 0;
    profitArray.forEach((pa,i)=>{
      if (pa[0] == defaultCurrency) {
        defaultCurrencyProfit += pa[1];
      } else {
        defaultCurrencyProfit += exchangeRate(pa[1], pa[0], defaultCurrency);
      }
    });




    console.log('TreasuryBalances:', TreasuryBalances);
    console.log('AllCustomersBalances:', AllCustomersBalances);
    console.log('AllSupplierBalances:', AllSupplierBalances);
    console.log('AllShareholderBalances:', AllShareholderBalances);

    if (filterStatus === 'active') result = result.filter((a) => a.status === 1);
    else if (filterStatus === 'inactive') result = result.filter((a) => a.status === 0);

    if (filterType.size > 0) {
      result = result.filter((a) => filterType.has(a.account_type_id));
    } else {
      result = result.filter((a) => a.code !== 'BENEFITS' && a.code !== 'EXPENSES');
    }

    if (filterBalState === 0) {
      result = result.filter((a) => {
        if (!a.computedBalances) return false;
        for (const cur in a.computedBalances) {
          a.computedBalances[cur].active = true;
        }
        return true;
      });
    } else if (filterBalState === 1) {
      // creditors
      result = result.filter((a) => {
        if (!a.computedBalances) return false;
        let totalBal = 0;
        for (const cur in a.computedBalances) {
          let curBal = a.computedBalances[cur].credit - a.computedBalances[cur].debit;

          if (curBal > 0) {
            a.computedBalances[cur].active = true;
            totalBal += curBal;
          } else {
            // remove currency from computedBalances in result only make it zero
            a.computedBalances[cur].active = false;
          }
        }
        return totalBal > 0;
      });
    } else if (filterBalState === 2) {
      // debitors
      result = result.filter((a) => {
        if (!a.computedBalances) return false;
        let totalBal = 0;
        for (const cur in a.computedBalances) {
          let curBal = a.computedBalances[cur].credit - a.computedBalances[cur].debit;

          if (curBal < 0) {
            a.computedBalances[cur].active = true;
            totalBal += curBal;
          } else {
            a.computedBalances[cur].active = false;
          }
        }
        return totalBal < 0;
      });
    } else if (filterBalState === 3) {
      // zero balance
      result = result.filter((a) => {
        if (!a.computedBalances) return false;
        let totalBal = 0;
        for (const cur in a.computedBalances) {
          let curBal = a.computedBalances[cur].credit - a.computedBalances[cur].debit;
          if (curBal < 0) {
            totalBal += curBal;
            a.computedBalances[cur].active = false;
          } else if (curBal > 0) {
            totalBal += curBal;
            a.computedBalances[cur].active = false;
          } else {
            a.computedBalances[cur].active = true;
          }
        }
        return totalBal === 0;
      });
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((a) => {
        const name = (t('Lang') === 'en' ? a.name : t('Lang') === 'fa' ? a.name_fa : a.name_ps) || '';
        return (
          (name && name.toLowerCase().includes(term)) ||
          (a.code && String(a.code).toLowerCase().includes(term)) ||
          (a.id && String(a.id).includes(term))
        );
      });
    }

    result = result.sort((a, b) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];

      if (sortColumn === 'name') {
        valA = (t('Lang') === 'en' ? a.name : t('Lang') === 'fa' ? a.name_fa : a.name_ps) || '';
        valB = (t('Lang') === 'en' ? b.name : t('Lang') === 'fa' ? b.name_fa : b.name_ps) || '';
      }
      if (sortColumn === 'type') {
        valA = getTypeName(a.account_type_id);
        valB = getTypeName(b.account_type_id);
      }

      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    overallBalances = { AFN: { debit: 0, credit: 0 } }; // e.g. { AFN: {debit: 12345, credit: 123}, USD: {debit: 100, credit: 200} }
    result.forEach((acc) => {
      if (acc.computedBalances && acc.include) {
        for (const cur in acc.computedBalances) {
          if (acc.computedBalances[cur].active) {
            if (overallBalances[cur] === undefined) overallBalances[cur] = { debit: 0, credit: 0 };

            overallBalances[cur].debit += acc.computedBalances[cur].debit;
            overallBalances[cur].credit += acc.computedBalances[cur].credit;
          }
        }
      }
    });
    overallBalanceArray = Object.entries(overallBalances).map(([cur, bal]) => ({
      currency: cur,
      ...bal,
    }));
    checkAll = checkAll;
    return result;
  })();



  $: paginatedAccounts = (() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredAccounts.slice(start, end);
  })();

  $: totalPages = Math.ceil(filteredAccounts.length / itemsPerPage);

  function setSort(column) {
    if (sortColumn === column) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  $: if (searchTerm || filterType || filterStatus) currentPage = 1;

  function showInitials(name) {
    if (!name) return '';
    const parts = name.trim().split(' ');
    return parts[0].charAt(0).toUpperCase();
  }
  function getAccountTypeColor(type) {
    const colors = ['dark', 'danger', 'secondary', 'primary', 'success', 'info', 'warning', 'dark','info', 'success'];
    return colors[type];
  }

  function sumRunning(inputs) {
    let runningBalance = {};
    inputs.forEach((i) => {
      Object.entries(i).forEach(([cur, bal]) => {
        if (runningBalance[cur] === undefined) runningBalance[cur] = 0;
        runningBalance[cur] += bal;
      });
    });
    return runningBalance;
  }

  let genInp = null;
</script>

<div class="general-report-page" dir={t('dir')}>
<IndexPageLayout dir={t('dir')} ariaLabel={t('General Report')} dense={true} contained={true} tablePadding={true} showFooter={false}>
<div class="general-report-table-wrap">
  <div class="general-report-table-body">

    {#if loading}
        <div class="text-center p-4">
            <div class="spinner-border text-primary" role="status"></div>
        </div>
    {:else}
    <div class="table-responsive">
      <table class="table table-hover general-report-table">
        <thead>
          <tr>
            <th>{t('ID')}</th>
            <th>{t('Name')}</th>
            <th>{t('Current Balance')}</th>

            <th>{t('Balance')}</th>
          </tr>
        </thead>
        <tbody>
          {#if Object.entries(TreasuryBalances).length > 0}
            <tr class="report-data-row">
              <td class="row-index">1</td>
              <td class="row-title"><span class="row-symbol treasury"><i class="bi bi-bank"></i></span>{t('Treasury')}</td>
              <td class="amount-cell"
                >{@html Object.entries(TreasuryBalances)
                  .map(
                    ([currency, amount]) =>
                      `<span dir='ltr'>${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span> ${t(currency)}`,
                  )
                  .join(' <br> ')}</td>

              <td class="amount-cell amount-cell-running"
                >{@html Object.entries(sumRunning([TreasuryBalances]))
                  .map(
                    ([currency, amount]) =>
                      `<span dir='ltr'>${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span> ${t(currency)}`,
                  )
                  .join(' <br> ')}</td>
            </tr>
          {/if}

          {#if Object.entries(totalPurchaseCostMap).length > 0}
            <tr class="report-data-row">
              <td class="row-index">2</td>
              <td class="row-title"><span class="row-symbol purchase"><i class="bi bi-bag-check"></i></span>{t('Total Purchase Cost')}</td>
              <td class="amount-cell"
                >{@html Object.entries(totalPurchaseCostMap)
                  .map(
                    ([currency, amount]) =>
                      `<span dir='ltr'>${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span> ${t(currency)}`,
                  )
                  .join(' <br> ')}</td>
              <td class="amount-cell amount-cell-running"
                >{@html Object.entries(sumRunning([TreasuryBalances, totalPurchaseCostMap]))
                  .map(
                    ([currency, amount]) =>
                      `<span dir='ltr'>${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span> ${t(currency)}`,
                  )
                  .join(' <br> ')}</td>
            </tr>
          {/if}

          {#if Object.entries(AllCustomersBalances).length > 0}
            <tr class="report-data-row">
              <td class="row-index">3</td>
              <td class="row-title"><span class="row-symbol customer"><i class="bi bi-people"></i></span>{t('All Customers Balances')}</td>
              <td class="amount-cell"
                >{@html Object.entries(AllCustomersBalances)
                  .map(
                    ([currency, amount]) =>
                      `<span dir='ltr'>${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span> ${t(currency)}`,
                  )
                  .join(' <br> ')}</td>

              <td class="amount-cell amount-cell-running"
                >{@html Object.entries(sumRunning([TreasuryBalances, totalPurchaseCostMap, AllCustomersBalances]))
                  .map(
                    ([currency, amount]) =>
                      `<span dir='ltr'>${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span> ${t(currency)}`,
                  )
                  .join(' <br> ')}</td>
            </tr>
          {/if}
          {#if Object.entries(AllSupplierBalances).length > 0}
            <tr class="report-data-row">
              <td class="row-index">4</td>
              <td class="row-title"><span class="row-symbol supplier"><i class="bi bi-truck"></i></span>{t('All Supplier Balances')}</td>
              <td class="amount-cell"
                >{@html Object.entries(AllSupplierBalances)
                  .map(
                    ([currency, amount]) =>
                      `<span dir='ltr'>${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span> ${t(currency)}`,
                  )
                  .join(' <br> ')}</td>

              <td class="amount-cell amount-cell-running"
                >{@html Object.entries(
                  sumRunning([TreasuryBalances, totalPurchaseCostMap, AllCustomersBalances, AllSupplierBalances]),
                )
                  .map(
                    ([currency, amount]) =>
                      `<span dir='ltr'>${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span> ${t(currency)}`,
                  )
                  .join(' <br> ')}</td>
            </tr>
          {/if}
          {#if Object.entries(AllShareholderBalances).length > 0}
            <tr class="report-data-row">
              <td class="row-index">5</td>
              <td class="row-title"><span class="row-symbol shareholder"><i class="bi bi-pie-chart"></i></span>{t('All Shareholder Balances')}</td>
              <td class="amount-cell"
                >{@html Object.entries(AllShareholderBalances)
                  .map(
                    ([currency, amount]) =>
                      `<span dir='ltr'>${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span> ${t(currency)}`,
                  )
                  .join(' <br> ')}</td>

              <td class="amount-cell amount-cell-running"
                >{@html Object.entries(
                  sumRunning([
                    TreasuryBalances,
                    totalPurchaseCostMap,
                    AllCustomersBalances,
                    AllSupplierBalances,
                    AllShareholderBalances,
                  ]),
                )
                  .map(
                    ([currency, amount]) =>
                      `<span dir='ltr'>${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span> ${t(currency)}`,
                  )
                  .join(' <br> ')}</td>
            </tr>
          {/if}

          <tr class="report-total-row">
            <td colspan="3" class="text-center row-title">{t('General Report')}</td>

            <td class="amount-cell amount-cell-running">
              {#each profitArray as p}
                <div class="amount-pill">
                  <span dir="ltr"
                    >{p[1].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span>
                  {t(p[0])}
                  <button class="btn btn-sm btn-outline-secondary ms-2 d-none" on:click={() => {
                    modalRef.openModal(p)
                    genInp = p;
                    }}>
                    <i class="bi bi-plus"></i>
                  </button>
                </div>
              {/each}
            </td>
          </tr>


          <tr class="report-final-row">
            <td colspan="3" class="text-center row-title">{t('Balance')}{t('-of-')}{t(defaultCurrency)}</td>

            <td class="amount-cell amount-cell-running">
                <div class="amount-pill amount-pill-final {defaultCurrencyProfit>=0 ? 'amount-positive' : 'amount-negative'}">
                  <span dir="ltr"
                    >{
    defaultCurrencyProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span>
                  {t(defaultCurrency)}
                  <button class="add-journal-btn" title={t('Add Journal')} aria-label={t('Add Journal')} on:click={() => {
                    genInp = [defaultCurrency,defaultCurrencyProfit];
                    modalRef.openModal(genInp);
                    }}>
                    <i class="bi bi-plus"></i>
                  </button>
                </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    {/if}
  </div>
</div>
</IndexPageLayout>
</div>


<AddJournalModal
  bind:this={modalRef}
  {genInp}
  {accounts}
  on:saved={() => {
    loadProducts();
    loadAccounts();
  }}
  on:closed={() => {
    console.log('closed');
    loadProducts();
    loadAccounts();
  }} />

<style>
  .general-report-page{display:flex;flex:1 1 auto;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden}
  .general-report-page :global(.index-page){flex:1 1 auto}
  .general-report-page :global(.index-content){min-height:0}
  .general-report-table-wrap {
    width:100%;
    overflow:visible;
    border:0;
    border-radius:0;
    background:transparent;
    box-shadow:none;
  }

  .report-hero{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.15rem 1.3rem;background:linear-gradient(120deg,#183b82,#2865d7);color:#fff}
  .report-heading{display:flex;align-items:center;gap:.85rem;min-width:0}.report-heading-icon{display:grid;place-items:center;flex:0 0 2.7rem;width:2.7rem;height:2.7rem;border:1px solid rgba(255,255,255,.2);border-radius:.8rem;background:rgba(255,255,255,.12);font-size:1.15rem}.report-kicker{display:block;color:#bfdbfe;font-size:.62rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.report-heading h2{margin:.08rem 0;font-size:1.15rem;font-weight:850}.report-heading p{margin:0;color:rgba(255,255,255,.68);font-size:.7rem}.report-as-of{display:flex;align-items:center;gap:.4rem;flex:0 0 auto;padding:.45rem .65rem;border:1px solid rgba(255,255,255,.18);border-radius:.65rem;background:rgba(255,255,255,.09);font-size:.65rem}.report-as-of span{color:#bfdbfe}.report-as-of strong{font-size:.68rem}
  .executive-summary{display:grid;grid-template-columns:1.5fr repeat(2,minmax(140px,.65fr));gap:.65rem;padding:.75rem .85rem}.executive-card{display:flex;align-items:center;gap:.65rem;min-width:0;padding:.65rem .75rem;border:1px solid #e0e7f1;border-radius:.75rem;background:#fff}.executive-card.primary-card{border-color:#d5e2fb;background:linear-gradient(145deg,#fff,#f5f8ff)}.executive-icon{display:grid;place-items:center;flex:0 0 2rem;width:2rem;height:2rem;border-radius:.62rem;background:#e8f0ff;color:#0f6efd}.accounts-icon{background:#ecfdf5;color:#059669}.currency-icon{background:#fff7ed;color:#ea580c}.executive-card div{display:flex;min-width:0;flex-direction:column}.executive-card small{color:#738198;font-size:.62rem;font-weight:700}.executive-card strong{overflow:hidden;color:#16243b;font-size:.86rem;font-weight:850;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}.executive-card strong.negative{color:#dc3545}.executive-card em{color:#718096;font-size:.58rem;font-style:normal}

  .general-report-table-body {
    min-height:0;margin:0;padding:0;overflow:visible;border:0;border-radius:0;background:transparent;
  }

  .general-report-table {
    margin-bottom: 0;
    color: #334155;
    font-size: 0.84rem;
  }

  .general-report-table thead th {
    padding: 0.85rem 0.9rem;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
    color: #64748b;
    font-size: 0.74rem;
    font-weight: 850;
    letter-spacing: 0.01em;
    vertical-align: middle;
    white-space: nowrap;
  }

  .general-report-table tbody td {
    padding: 0.9rem;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
  }

  .general-report-table tbody tr:last-child td {
    border-bottom: 0;
  }

  .general-report-table tbody tr.report-data-row:nth-child(even) {
    background: #fbfdff;
  }

  .general-report-table tbody tr.report-data-row:hover {
    background: #f0f7ff;
  }

  .row-index {
    width: 72px;
    color: #94a3b8;
    font-size: 0.78rem;
    font-weight: 850;
  }

  .row-title {
    color: #0f172a;
    font-size: 0.88rem;
    font-weight: 850;
    white-space:nowrap;
  }
  .row-symbol{display:inline-grid;place-items:center;width:1.8rem;height:1.8rem;margin-inline-end:.55rem;border-radius:.5rem;background:#eef4ff;color:#0f6efd;font-size:.8rem;vertical-align:middle}.row-symbol.purchase{background:#fff7ed;color:#ea580c}.row-symbol.customer{background:#ecfdf5;color:#059669}.row-symbol.supplier{background:#f5f3ff;color:#7c3aed}.row-symbol.shareholder{background:#fff1f2;color:#e11d48}

  .amount-cell {
    color: #334155;
    font-size: 0.84rem;
    font-weight: 800;
    line-height: 1.75;
  }

  .amount-cell :global(span[dir='ltr']) {
    font-weight: 900;
  }

  .amount-cell-running {
    background: #fbfdff;
  }

  .report-total-row td {
    border-top: 1px solid #dbeafe;
    background: #f8fbff;
  }

  .report-final-row td {
    border-top: 1px solid #bfdbfe;
    background: #eff6ff;
  }

  .amount-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0.2rem;
    padding: 0.42rem 0.65rem;
    border: 1px solid #e2e8f0;
    border-radius: 999px;
    background: #ffffff;
    color: #334155;
    font-size: 0.82rem;
    font-weight: 850;
    white-space: nowrap;
  }

  .amount-pill-final {
    border-radius: 12px;
    padding: 0.55rem 0.75rem;
  }

  .amount-positive {
    border-color: #bbf7d0;
    background: #f0fdf4;
    color: #11875d;
  }

  .amount-negative {
    border-color: #fecdd3;
    background: #fff1f2;
    color: #c83248;
  }

  .add-journal-btn {
    width: 30px;
    height: 30px;
    display: inline-grid;
    place-items: center;
    margin-inline-start: 0.35rem;
    border: 1px solid #bfdbfe;
    border-radius: 9px;
    background: #eff6ff;
    color: #0f6efd;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      transform 0.15s ease;
  }

  .add-journal-btn:hover {
    transform: translateY(-1px);
    border-color: #93c5fd;
    background: #dbeafe;
  }

  @media (max-width: 767.98px) {
    .report-hero{align-items:flex-start;padding:1rem}.report-heading p,.report-as-of span{display:none}.executive-summary{grid-template-columns:1fr 1fr}.executive-card.primary-card{grid-column:1/-1}.general-report-table-body{margin:.6rem}
    .general-report-table thead th,
    .general-report-table tbody td {
      padding: 0.75rem;
    }

    .amount-pill {
      width: 100%;
      justify-content: space-between;
      margin-inline: 0;
    }
  }
</style>
