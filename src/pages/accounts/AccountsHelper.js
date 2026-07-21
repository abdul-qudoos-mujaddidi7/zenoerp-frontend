import { db } from '../../db';

let accounts = [];
let journals = [];
let accountTypes = [];
let accountGroups = [];

export async function calculateBalancesOfAllAccounts() {
    let startTime = Date.now();
    const journals = await db.journals.where('status').equals(1).toArray();
    let accountBalances = {};

    for (let i = 0; i < journals.length; i++) {
        let j = journals[i];

        if (!accountBalances[j.first_entry_account]) {
            accountBalances[j.first_entry_account] = {};
        }

        let firstEntryBalance = Number(j.first_entry_credit) - Number(j.first_entry_debit);

        accountBalances[j.first_entry_account][j.currency] =
            (accountBalances[j.first_entry_account][j.currency] || 0) + firstEntryBalance;

        if (!accountBalances[j.second_entry_account]) {
            accountBalances[j.second_entry_account] = {};
        }

        let secondEntryBalance = Number(j.second_entry_credit) - Number(j.second_entry_debit);
        accountBalances[j.second_entry_account][j.currency] =
            (accountBalances[j.second_entry_account][j.currency] || 0) + secondEntryBalance;
    }

    console.log(`Calculated Balance of All Accounts and took ${Date.now()-startTime}ms`);
    return accountBalances;
}


export async function calculateCreditDebitOfAllAccounts() {
    let startTime = Date.now();
    const journals = await db.journals.where('status').equals(1).toArray();
    let accountBalances = {};

    for (let i = 0; i < journals.length; i++) {
        let j = journals[i];

        if (!accountBalances[j.first_entry_account]) {
            accountBalances[j.first_entry_account] = {};
        }


        if (!accountBalances[j.first_entry_account][j.currency]) {
            accountBalances[j.first_entry_account][j.currency] = {};
        }
        let firstEntryCredit = Number(j.first_entry_credit);
        if (!accountBalances[j.first_entry_account][j.currency].credit) {
            accountBalances[j.first_entry_account][j.currency].credit = firstEntryCredit;
        } else {
            accountBalances[j.first_entry_account][j.currency].credit += firstEntryCredit;
        }

        let firstEntryDebit = Number(j.first_entry_debit);
        if (!accountBalances[j.first_entry_account][j.currency].debit) {
            accountBalances[j.first_entry_account][j.currency].debit = firstEntryDebit;
        } else {
            accountBalances[j.first_entry_account][j.currency].debit += firstEntryDebit;
        }


        if (!accountBalances[j.second_entry_account]) {
            accountBalances[j.second_entry_account] = {};
        }

        if (!accountBalances[j.second_entry_account][j.currency]) {
            accountBalances[j.second_entry_account][j.currency] = {};
        }
        let secondEntryCredit = Number(j.second_entry_credit);
        if (!accountBalances[j.second_entry_account][j.currency].credit) {
            accountBalances[j.second_entry_account][j.currency].credit = secondEntryCredit;
        } else {
            accountBalances[j.second_entry_account][j.currency].credit += secondEntryCredit;
        }

        let secondEntryDebit = Number(j.second_entry_debit);
        if (!accountBalances[j.second_entry_account][j.currency].debit) {
            accountBalances[j.second_entry_account][j.currency].debit = secondEntryDebit;
        } else {
            accountBalances[j.second_entry_account][j.currency].debit += secondEntryDebit;
        }
    }

    console.log(`Calculated Credit & Debit of All Accounts and took ${Date.now()-startTime}ms`);
    return accountBalances;
}


let currencies  = [];
function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = parseFloat(fromCurrency.exchangeRate) || 1;;
    const toRate = parseFloat(toCurrency.exchangeRate) || 1;
    return (amount / toRate) * fromRate;
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

export async function getGeneralBenefit() {
    let startTime = Date.now();
    let accountBalances = await calculateBalancesOfAllAccounts();
    
    accounts = await db.accounts.where('status').equals(1).toArray();
    accounts = accounts.filter((a) => a.code !== "NOTRACK" && a.code !== "RECEIVABLE" && a.code !== "PAYABLE" && a.code !== "SALES" && a.code !== "PURCHASE"&& a.code !== "EXCHANGE");
    accounts.forEach(acc => {
        if (accountBalances[acc.id]) {
            acc.computedBalances = accountBalances[acc.id];
        }
    });


    let TreasuryBalances = {};
    let AllCustomersBalances = {};
    let AllSupplierBalances = {};
    let AllShareholderBalances = {};

    accounts.forEach((a) => {
      if (a.computedBalances) {
        if (a.code == 'TREASURY') {
          Object.entries(a.computedBalances).forEach((b) => {
            let thisBal = parseFloat(b[1]) || 0;
            TreasuryBalances[b[0]] = TreasuryBalances[b[0]] ? TreasuryBalances[b[0]] + thisBal : thisBal;
          });
        }

        if (a.account_type_id == 4) {
          Object.entries(a.computedBalances).forEach((b) => {
            let thisBal = parseFloat(b[1]) || 0;
            AllCustomersBalances[b[0]] = AllCustomersBalances[b[0]] ? AllCustomersBalances[b[0]] + thisBal : thisBal;
          });
        }

        if (a.account_type_id == 3) {
          Object.entries(a.computedBalances).forEach((b) => {
            let thisBal = parseFloat(b[1]) || 0;
            AllSupplierBalances[b[0]] = AllSupplierBalances[b[0]] ? AllSupplierBalances[b[0]] + thisBal : thisBal;
          });
        }

        if (a.account_type_id == 7) {
          Object.entries(a.computedBalances).forEach((b) => {
            let thisBal = parseFloat(b[1]) || 0;
            AllShareholderBalances[b[0]] = AllShareholderBalances[b[0]]
              ? AllShareholderBalances[b[0]] + thisBal
              : thisBal;
          });
        }
      }
    });


    currencies = await db.currencies.where('status').equals(1).toArray();
    let defaultCurrency = currencies.find((c) => c.isDefault == 1)?.code || 'AFN';

    let totalPurchaseCostMap = {};
    let warehouse_products = await db.warehouse_products.where('status').equals(1).toArray();
    let quantityMap = {};
    warehouse_products.forEach((wp) => {
      if (wp.status === 1) {
        quantityMap[wp.product_id] = (quantityMap[wp.product_id] || 0) + Number(wp.quantity);
      }
    });

    let products = await db.products.where('status').equals(1).toArray();
    products.forEach((p) => {
      const buyPrice = parseFloat(p.buy_price) || 0;
      let qty = quantityMap[p.id] || 0;
      const buyCurrency = p.buy_currency;
      totalPurchaseCostMap[buyCurrency] = (totalPurchaseCostMap[buyCurrency] || 0) + buyPrice * qty * -1;
    });

    let profitArray = Object.entries(
      sumRunning([
        TreasuryBalances,
        totalPurchaseCostMap,
        AllCustomersBalances,
        AllSupplierBalances,
        AllShareholderBalances,
      ]),
    );
    let defaultCurrencyProfit = 0;
    profitArray.forEach((pa,i)=>{
      if (pa[0] == defaultCurrency) {
        defaultCurrencyProfit += pa[1];
      } else {
        defaultCurrencyProfit += exchangeRate(pa[1], pa[0], defaultCurrency);
      }
    });


    console.log(`Calculated Net Benefit and took ${Date.now()-startTime}ms which is ${defaultCurrencyProfit} in ${defaultCurrency}`);

    return[defaultCurrency,defaultCurrencyProfit,accountBalances,totalPurchaseCostMap];
}

export async function calculateBalanceOfAccount(id) {
    let startTime = Date.now();
    const journals = await db.journals.where('status').equals(1).toArray();

    let balance = {};

    for (let i = 0; i < journals.length; i++) {
        let j = journals[i];
        if (j.first_entry_account === id) {
            let amount = Number(j.first_entry_credit) - Number(j.first_entry_debit);
            balance[j.currency] = (balance[j.currency] || 0) + amount;
        }
        if (j.second_entry_account === id) {
            let amount = Number(j.second_entry_credit) - Number(j.second_entry_debit);
            balance[j.currency] = (balance[j.currency] || 0) + amount;
        }
    }
    console.log(`Calculated Balance of Account with ID (${id}) and took ${Date.now()-startTime}ms`,balance);
    return balance;
}


export async function calculateBalanceOfTreasury() {
    let startTime = Date.now();

    let treasuryAccount = await db.accounts.where({code:"TREASURY",status:1}).first();
    const journals = await db.journals.where('status').equals(1).toArray();

    let balance = {};

    for (let i = 0; i < journals.length; i++) {
        let j = journals[i];
        if (j.first_entry_account === treasuryAccount.id) {
            let amount = Number(j.first_entry_credit) - Number(j.first_entry_debit);
            balance[j.currency] = (balance[j.currency] || 0) + amount;
        }
        if (j.second_entry_account === treasuryAccount.id) {
            let amount = Number(j.second_entry_credit) - Number(j.second_entry_debit);
            balance[j.currency] = (balance[j.currency] || 0) + amount;
        }
    }
    console.log(`Calculated Balance of TREASURY with ID (${treasuryAccount.id}) and took ${Date.now()-startTime}ms`,balance);
    return balance;
}