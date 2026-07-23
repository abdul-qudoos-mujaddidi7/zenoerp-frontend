<script>
  import { onMount } from 'svelte';
  import { db } from '../../db.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import { push } from 'svelte-spa-router';
  export let id;
  import { API_URL } from '../../config';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  let accounts = [];
  let account = null;
  let accountType = null;
  let patientType = null;
  let imageUrl = null;
  let journals = [];
  let currencies = [];
  let computedBalance = {};
  import { auth } from '../../auth/authStore';
  $: permissions = $auth.permissions;
  let accountTypes = [];
  function loadAccounts() {
    return db.accounts.toArray().then((list) => {
      accounts = list;
    });
  }
  function loadCurrencies() {
    return db.currencies.toArray().then((list) => {
      currencies = list;
    });
  }
  onMount(async () => {
    loadAccounts();
    loadCurrencies();
    accountTypes = await db.account_types.where('status').equals(1).toArray();
  });
  let startDate = '';
  let endDate = '';
  let q = '';
  let page = 1;
  let pageSize = 10;
  const pageSizes = [10, 25, 50, 100];
  $: if (id) loadAccount(id);
  let filtered = [];
  let processed = [];
  let paginated = [];
  let totalPages = 1;
  import AccountModal from './AccountModal.svelte';
  let modalRef;
  $: filtered = journals.filter((j) => {
    const jd = j.date ? new Date(j.date) : null;
    if (startDate && jd && jd < new Date(startDate)) return false;
    if (endDate && jd && jd > new Date(endDate + 'T23:59:59')) return false;
    if (q) {
      const s = q.toLowerCase();
      const hay = (j.description || '') + ' ' + (j.reference_type || '') + ' ' + (j.reference_id || '');
      if (!hay.toLowerCase().includes(s)) return false;
    }
    return true;
  });
  $: {
    const starting = {};
    if (account?.currency && account?.balance != null) {
      starting[account.currency] = 0;
    }
    const asc = [...filtered].slice().reverse();
    let lastBal = { ...starting };
    const processedAsc = asc.map((j) => {
      const debit = Number(j.debit || 0);
      const credit = Number(j.credit || 0);
      const cur = j.currency || account?.currency || 'DEFAULT';
      const balObj = { ...lastBal };
      balObj[cur] = (balObj[cur] || 0) + (credit - debit);
      lastBal = balObj;
      return { ...j, debit, credit, running: balObj };
    });
    processed = processedAsc.slice();
    const totals = {};
    for (const j of filtered) {
      const cur = j.currency || account?.currency || 'DEFAULT';
      const debit = Number(j.debit || 0);
      const credit = Number(j.credit || 0);
      if (!totals[cur]) {
        totals[cur] = { debit: 0, credit: 0, balance: 0 };
      }
      totals[cur].debit += debit;
      totals[cur].credit += credit;
      totals[cur].balance += credit - debit;
    }
    computedBalance = totals;
    totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
    if (page > totalPages) page = totalPages;
    paginated = processed.slice((page - 1) * pageSize, page * pageSize);
  }
  async function loadAccount(id) {
    account = await db.accounts.get(Number(id));
    if (!account) return;
    accountType = account.account_type_id ? await db.account_types.get(account.account_type_id) : null;
    patientType = account.patient_type_id ? await db.patient_types.get(account.patient_type_id) : null;
    const img = await db.account_images.where('account_id').equals(account.id).last();
    if (img?.image) {
      if (img.image.startsWith('{')) {
        let dataJSON = JSON.parse(img?.image);
        imageUrl =
          API_URL +
          `/api/sync/loadimage/${dataJSON?.table}/${dataJSON?.fieldName}/${dataJSON?.serveid}/${localStorage.getItem('token') || 'none'}`;
      } else {
        imageUrl = img?.image;
      }
    } else {
      imageUrl = null;
    }
    await loadJournals(account.id);
    startDate = '';
    endDate = '';
    q = '';
    page = 1;
  }
  async function loadJournals(id) {

    const allJournals = await db.journals
        .where('status')
        .equals(1)
        .toArray();


    const processedLocal = [];


    for (const j of allJournals) {

        let debit = 0;
        let credit = 0;


        // Same logic as AccountsHelper first_entry
        if (j.first_entry_account === id) {

            debit += Number(j.first_entry_debit) || 0;
            credit += Number(j.first_entry_credit) || 0;

        }


        // Same logic as AccountsHelper second_entry
        if (j.second_entry_account === id) {

            debit += Number(j.second_entry_debit) || 0;
            credit += Number(j.second_entry_credit) || 0;

        }


        // Only keep journals belonging to this account
        if (debit !== 0 || credit !== 0) {

            processedLocal.push({
                ...j,
                debit,
                credit,
                currency: j.currency
            });

        }
    }


    // same ordering as your old component
    processedLocal.sort(
        (a,b)=>new Date(a.date)-new Date(b.date)
    );


    journals = processedLocal;


    // EXACT same balance logic as AccountsHelper
    computedBalance = {};


    for (const j of journals) {

        const cur = j.currency;


        if (!computedBalance[cur]) {
            computedBalance[cur] = {
                debit: 0,
                credit: 0,
                balance: 0
            };
        }


        computedBalance[cur].debit += j.debit;
        computedBalance[cur].credit += j.credit;


        computedBalance[cur].balance += 
            j.credit - j.debit;
    }


    console.log(
        "Account balance calculated:",
        id,
        computedBalance
    );
}
  function getCurrencyInfoArray(obj) {
    let arr = [];
    for (const k in obj) {
      arr.push({
        code: k,
        debit: obj[k].debit,
        credit: obj[k].credit,
        balance: obj[k].balance,
        color: k === account?.currency ? 'primary' : 'success',
      });
    }
    return arr;
  }
  function goBack() {
    push('/dashboard/accounts/list');
  }
  function showInitials(name) {
    if (!name) return '';
    const parts = name.trim().split(' ');
    return parts[0].charAt(0).toUpperCase();
  }
  function getAccountTypeColor(type) {
    const colors = ['dark', 'danger',  'secondary',  'primary',  'success',  'info', 'warning', 'dark',  'info', 'success'];
    return colors[type];
  }
  function getPatientTypeColor(type) {
    const colors = ['dark', 'primary', 'secondary', 'danger',  'success',  'info', 'warning', 'dark',  'secondary'];
    return colors[type];
  }
  $: displayName = account
    ? t('Lang') === 'fa'
      ? account.name_fa || account.name
      : t('Lang') === 'ps'
        ? account.name_ps || account.name
        : account.name
    : t('Account');
  $: displayType = patientType
    ? t('Lang') === 'fa'
      ? patientType.name_fa || patientType.name
      : t('Lang') === 'ps'
        ? patientType.name_ps || patientType.name
        : patientType.name
    : accountType
      ? t('Lang') === 'fa'
        ? accountType.name_fa || accountType.name
        : t('Lang') === 'ps'
          ? accountType.name_ps || accountType.name
          : accountType.name
      : t('Account');
  $: balanceItems = getCurrencyInfoArray(computedBalance);
</script>

<div class="profile-page">
  <section class="profile-hero">
    <div class="hero-glow"></div>
    <div class="hero-actions">
      <button class="back-button" type="button" on:click={goBack} aria-label={t('Back')}>
        <i class="bi bi-arrow-left"></i>
      </button>
      {#if permissions?.some((p) => p.code === 'Accounts' && p.edit)}
        <button on:click={() => modalRef.openModal(account)} class="edit-button" type="button">
          <i class="bi bi-pencil-square"></i><span>{t('Edit profile')}</span>
        </button>
      {/if}
    </div>
    <div class="profile-identity">
      <div class="avatar-wrap">
      {#if imageUrl}
          <img src={imageUrl} alt={displayName} class="profile-avatar" />
      {:else}
          <div class="profile-avatar avatar-fallback">
            {showInitials(displayName)}
          </div>
        {/if}
        <span class="status-dot" title={t('Active')}></span>
      </div>
      <div class="identity-copy">
      
        <div class="name-row">
          <h1>{displayName}</h1>
          <span class="type-pill">{displayType}</span>
        </div>
        {#if account?.description}
          <p class="profile-description">{account.description}</p>
        {/if}
      </div>
    </div>
    <section class="details-card hero-contact-card">
      <div class="section-heading">
        <div><span class="section-kicker">{t('Profile')}</span><h2>{t('Contact information')}</h2></div>
        <i class="bi bi-person-lines-fill"></i>
      </div>
      <div class="contact-list">
        <div class="contact-item"><span class="contact-icon"><i class="bi bi-telephone"></i></span><div><small>{t('Whatsapp Number')}</small><strong dir="ltr">{account?.phone || '—'}</strong></div></div>
        <div class="contact-item"><span class="contact-icon"><i class="bi bi-phone"></i></span><div><small>{t('Phone 2')}</small><strong dir="ltr">{account?.phone2 || '—'}</strong></div></div>
        <div class="contact-item"><span class="contact-icon"><i class="bi bi-envelope"></i></span><div><small>{t('Email')}</small><strong>{account?.email || '—'}</strong></div></div>
        <div class="contact-item"><span class="contact-icon"><i class="bi bi-geo-alt"></i></span><div><small>{t('Address')}</small><strong>{account?.address || '—'}</strong></div></div>
      </div>
    </section>
  </section>

  <div class="profile-grid">
    <section class="finance-section">
      <div class="section-heading finance-heading">
        <div><span class="section-kicker">{t('Overview')}</span><h2>{t('Financial summary')}</h2></div>
        <span class="currency-count">{balanceItems.length} {t('Currencies')}</span>
      </div>
      {#if balanceItems.length}
        <div class="balance-grid">
          {#each balanceItems as cur}
            <article class="balance-card" class:negative={cur.balance < 0}>
              <div class="balance-top"><span class="currency-badge">{t(cur.code)}</span><i class="bi bi-wallet2"></i></div>
              <small>{t('Current balance')}</small>
              <div class="balance-value" dir="ltr">{cur.balance.toLocaleString()} <em>{t(cur.code)}</em></div>
              <div class="money-details">
                <div><span><i class="bi bi-arrow-down-left"></i> {t('Credit')}</span><strong dir="ltr">{cur.credit.toLocaleString()}</strong></div>
                <div><span><i class="bi bi-arrow-up-right"></i> {t('Debit')}</span><strong dir="ltr">{cur.debit.toLocaleString()}</strong></div>
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <div class="empty-balance"><i class="bi bi-bar-chart"></i><div><strong>{t('No financial activity')}</strong><span>{t('Transactions will appear here')}</span></div></div>
      {/if}
    </section>
  </div>
</div>

<AccountModal
  bind:this={modalRef}
  {accountTypes}
  on:saved={() => {
    loadAccount(id);
  }} />

<style>
  .profile-page{--profile-primary:var(--bs-primary,var(--mdb-primary,#0f6efd));--profile-primary-rgb:var(--bs-primary-rgb,var(--mdb-primary-rgb,15,110,253));padding:0 1px 14px;color:var(--mdb-body-color,#172033)}
  .profile-hero{position:relative;isolation:isolate;overflow:hidden;min-height:0;padding:12px 30px 18px;border-radius:14px;background:linear-gradient(118deg,#3979ed,#1760df 48%,#1b4ebd);color:#fff;display:grid;grid-template-columns:minmax(0,1fr);align-content:start;gap:12px;box-shadow:0 18px 42px rgba(var(--profile-primary-rgb),.18)}
  .hero-glow{position:absolute;z-index:-1;width:520px;height:520px;border-radius:50%;left:-190px;top:-360px;background:rgba(255,255,255,.12)}
  .hero-glow:after{content:"";position:absolute;width:280px;height:280px;border:1px solid rgba(255,255,255,.16);border-radius:50%;right:-180px;bottom:-245px}
  .hero-actions{position:absolute;z-index:2;top:12px;left:24px;display:flex;align-items:center;justify-content:flex-start;gap:10px;direction:ltr}
  .back-button{width:32px;height:32px;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:rgba(255,255,255,.12);color:#fff;display:grid;place-items:center}
  .profile-identity{position:relative;z-index:1;display:flex;align-items:center;gap:18px;min-width:0;margin-top:6px;padding-left:220px;padding-inline-end:0}
  .avatar-wrap{position:relative;flex:0 0 auto}
  .profile-avatar{width:86px;height:86px;border-radius:18px;object-fit:cover;border:2px solid rgba(255,255,255,.7);box-shadow:0 14px 28px rgba(var(--profile-primary-rgb),.26)}
  .avatar-fallback{display:grid;place-items:center;background:#fff;color:var(--profile-primary);font-size:34px;font-weight:800}
  .status-dot{position:absolute;right:-2px;bottom:7px;width:17px;height:17px;border:3px solid color-mix(in srgb,var(--profile-primary) 76%,#0b2466);border-radius:50%;background:#4ade80}
  .eyebrow,.section-kicker{text-transform:uppercase;letter-spacing:.12em;font-size:11px;font-weight:700;opacity:.72}
  .name-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.name-row h1{margin:2px 0;font-size:27px;font-weight:800;letter-spacing:-.02em}.type-pill{padding:5px 10px;border:1px solid rgba(255,255,255,.26);border-radius:999px;background:rgba(255,255,255,.12);font-size:11px;font-weight:750}.profile-description{margin:6px 0 0;max-width:620px;color:rgba(255,255,255,.76);font-size:12px;line-height:1.5}
  .edit-button{border:1px solid rgba(255,255,255,.28);border-radius:9px;padding:8px 12px;background:rgba(255,255,255,.13);color:#fff;font-size:12px;font-weight:750;box-shadow:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);direction:rtl}.edit-button:hover{background:rgba(255,255,255,.2)}.edit-button i{margin-inline-end:6px}
  .profile-grid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px}.details-card,.finance-section{border:1px solid #e3e9f3;border-radius:12px;background:var(--mdb-body-bg,#fff);padding:14px 16px;box-shadow:none}.finance-section{width:100%}
  .hero-contact-card{position:relative;z-index:1;width:100%;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none}
  .hero-contact-card .section-heading{display:none}
  .hero-contact-card .contact-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;border:1px solid rgba(255,255,255,.16);border-radius:12px;overflow:hidden;background:rgba(7,27,78,.22);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
  .hero-contact-card .contact-item{min-height:58px;padding:10px 12px;border:0;border-inline-end:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.07)}
  .hero-contact-card .contact-item:last-child{border:0}
  .hero-contact-card .contact-item:hover{background:rgba(255,255,255,.11)}
  .hero-contact-card .contact-icon{width:30px;height:30px;border-radius:9px;background:rgba(255,255,255,.13);color:#fff;font-size:13px}
  .hero-contact-card .contact-item div{display:grid;gap:2px;align-items:center;justify-content:normal}
  .hero-contact-card .contact-item small{color:rgba(255,255,255,.62);font-size:9px;font-weight:750}
  .hero-contact-card .contact-item strong{color:#fff;font-size:11px;font-weight:750;line-height:1.25}
  .section-heading{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:9px}.section-heading h2{margin:1px 0 0;font-size:14px;font-weight:750}.section-heading>i{font-size:15px;color:#2461db;background:#edf3ff;border-radius:8px;padding:6px 8px}.section-kicker{color:#2461db}.contact-list{display:grid;grid-template-columns:1fr;gap:0;border:1px solid #e1e7f0;border-radius:10px;overflow:hidden}.contact-item{display:flex;align-items:center;gap:9px;min-height:42px;padding:6px 9px;border-radius:0;border-bottom:1px solid #e7ebf2}.contact-item:last-child{border-bottom:0}.contact-item:hover{background:rgba(72,103,170,.035)}.contact-icon{width:27px;height:27px;display:grid;place-items:center;border-radius:7px;background:transparent;color:#2361e7;font-size:14px}.contact-item div{min-width:0;display:flex;flex:1;flex-direction:row;align-items:center;justify-content:space-between;gap:8px}.contact-item small{color:#6f7c94;font-size:10px}.contact-item strong{font-size:10px;font-weight:650;overflow-wrap:anywhere;color:#354258}
  .finance-heading{align-items:center}.currency-count{font-size:10px;font-weight:700;color:#596880;background:#f6f8fb;border:1px solid #e2e8f1;border-radius:8px;padding:5px 8px}.balance-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}.balance-card{padding:10px 12px;border-radius:10px;background:linear-gradient(145deg,#fbfdff,#f5f8ff);border:1px solid #dce6fa}.balance-card.negative{background:linear-gradient(145deg,#fffdfd,#fff7f6);border-color:#f4deda}.balance-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}.currency-badge{padding:3px 7px;border-radius:999px;background:#e7efff;color:#2457bd;font-size:9px;font-weight:800}.negative .currency-badge{background:#ffe9e7;color:#d9473b}.balance-top i{color:#3b6bd3;background:#edf3ff;border-radius:50%;padding:5px}.negative .balance-top i{color:#e24a3e;background:#ffebe9}.balance-card>small{display:block;color:#7a879e;font-size:9px}.balance-value{font-size:18px;font-weight:800;letter-spacing:-.03em;margin:0 0 6px;color:#2052ae}.negative .balance-value{color:#dc443b}.balance-value em{font-size:8px;font-style:normal;letter-spacing:.03em}.money-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;border-top:1px solid rgba(117,137,180,.14);padding-top:7px;direction:rtl}.money-details div{display:grid;grid-template-rows:14px 18px;align-items:start;min-width:0;padding-inline:9px}.money-details div+div{border-inline-start:1px solid rgba(117,137,180,.14)}.money-details span{display:block;height:14px;font-size:8px;line-height:12px;color:#8290a8;white-space:nowrap}.money-details strong{display:block;height:18px;font-size:10px;line-height:18px;margin:0;font-variant-numeric:tabular-nums;white-space:nowrap}.money-details div:first-child i{color:#16a36a}.money-details div:last-child i{color:#e36555}.empty-balance{min-height:76px;display:flex;align-items:center;justify-content:center;gap:10px;border:1px dashed #d8e0ef;border-radius:9px;color:#77859c}.empty-balance>i{font-size:20px}.empty-balance div{display:flex;flex-direction:column}.empty-balance span{font-size:10px}
  @media(max-width:900px){.profile-identity{padding-left:170px;padding-inline-end:0}.hero-contact-card .contact-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:600px){.profile-hero{padding:12px 14px 14px}.hero-actions{left:14px}.profile-identity{align-items:flex-start;margin-top:6px;padding-left:150px;padding-inline-start:0}.profile-avatar{width:68px;height:68px;border-radius:15px}.avatar-fallback{font-size:27px}.name-row h1{font-size:20px}.details-card,.finance-section{padding:14px}.contact-list{grid-template-columns:1fr}.profile-description{font-size:11px}.hero-contact-card .contact-list{grid-template-columns:1fr}.hero-contact-card .contact-item{min-height:44px;border-inline-end:0;border-bottom:1px solid rgba(255,255,255,.13)}}
</style>
