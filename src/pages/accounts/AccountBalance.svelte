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

    <!-- Header actions -->
    <div class="hero-actions">
      <button
        class="back-button"
        type="button"
        on:click={goBack}
        aria-label={t('Back')}
      >
        <i class="bi bi-arrow-left"></i>
      </button>

      {#if permissions?.some((p) => p.code === 'Accounts' && p.edit)}
        <button
          on:click={() => modalRef.openModal(account)}
          class="edit-button"
          type="button"
        >
          <i class="bi bi-pencil-square"></i>
          <span>{t('Edit profile')}</span>
        </button>
      {/if}
    </div>

    <!-- Profile and contact area -->
    <div class="profile-identity">
      <!-- Profile image and name -->
      <div class="profile-main">
        <div class="avatar-wrap">
          {#if imageUrl}
            <img
              src={imageUrl}
              alt={displayName}
              class="profile-avatar"
            />
          {:else}
            <div class="profile-avatar avatar-fallback">
              {showInitials(displayName)}
            </div>
          {/if}

          <span
            class="status-dot"
            title={t('Active')}
          ></span>
        </div>

        <div class="identity-copy">
          <div class="name-row">
            <h1>{displayName}</h1>
            <span class="type-pill">{displayType}</span>
          </div>

          {#if account?.description}
            <p class="profile-description">
              {account.description}
            </p>
          {/if}
        </div>
      </div>

      <!-- Contact information -->
      <section class="hero-contact-card">
        <div class="contact-list">
          <!-- Row 1: WhatsApp and Phone 2 -->
          <div class="contact-item">
            <span class="contact-icon whatsapp-icon">
              <i class="bi bi-whatsapp"></i>
            </span>

            <div class="contact-content">
              <small>{t('Whatsapp Number')}</small>

              <strong dir="ltr">
                {account?.phone || '—'}
              </strong>
            </div>
          </div>

          <div class="contact-item">
            <span class="contact-icon">
              <i class="bi bi-phone"></i>
            </span>

            <div class="contact-content">
              <small>{t('Phone 2')}</small>

              <strong dir="ltr">
                {account?.phone2 || '—'}
              </strong>
            </div>
          </div>

          <!-- Row 2: Email and Address -->
          <div class="contact-item">
            <span class="contact-icon">
              <i class="bi bi-envelope"></i>
            </span>

            <div class="contact-content">
              <small>{t('Email')}</small>

              <strong
                class="contact-value"
                dir="ltr"
                title={account?.email || ''}
              >
                {account?.email || '—'}
              </strong>
            </div>
          </div>

          <div class="contact-item">
            <span class="contact-icon">
              <i class="bi bi-geo-alt"></i>
            </span>

            <div class="contact-content">
              <small>{t('Address')}</small>

              <strong
                class="contact-value"
                title={account?.address || ''}
              >
                {account?.address || '—'}
              </strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  </section>

  <!-- Financial information -->
  <div class="profile-grid">
    <section class="finance-section">
      <div class="section-heading finance-heading">
        <div>
          <span class="section-kicker">
            {t('Overview')}
          </span>

          <h2>{t('Financial summary')}</h2>
        </div>

        <span class="currency-count">
          {balanceItems.length} {t('Currencies')}
        </span>
      </div>

      {#if balanceItems.length}
        <div class="balance-grid">
          {#each balanceItems as cur}
            <article
              class="balance-card"
              class:negative={cur.balance < 0}
            >
              <div class="balance-top">
                <span class="currency-badge">
                  {t(cur.code)}
                </span>

                <i class="bi bi-wallet2"></i>
              </div>

              <small>{t('Current balance')}</small>

              <div class="balance-value" dir="ltr">
                {cur.balance.toLocaleString()}
                <em>{t(cur.code)}</em>
              </div>

              <div class="money-details">
                <div>
                  <span>
                    <i class="bi bi-arrow-down-left"></i>
                    {t('Credit')}
                  </span>

                  <strong dir="ltr">
                    {cur.credit.toLocaleString()}
                  </strong>
                </div>

                <div>
                  <span>
                    <i class="bi bi-arrow-up-right"></i>
                    {t('Debit')}
                  </span>

                  <strong dir="ltr">
                    {cur.debit.toLocaleString()}
                  </strong>
                </div>
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <div class="empty-balance">
          <i class="bi bi-bar-chart"></i>

          <div>
            <strong>{t('No financial activity')}</strong>
            <span>{t('Transactions will appear here')}</span>
          </div>
        </div>
      {/if}
    </section>
  </div>
</div>

<AccountModal
  bind:this={modalRef}
  {accountTypes}
  on:saved={() => {
    loadAccount(id);
  }}
/>

<style>
  .profile-page {
    --profile-primary: var(
      --bs-primary,
      var(--mdb-primary, #0f6efd)
    );

    --profile-primary-rgb: var(
      --bs-primary-rgb,
      var(--mdb-primary-rgb, 15, 110, 253)
    );

    padding: 0 1px 14px;
    color: var(--mdb-body-color, #172033);
  }

  /* ========================================
     Profile hero
  ======================================== */

  .profile-hero {
    position: relative;
    isolation: isolate;
    overflow: hidden;

    min-height: 0;
    padding: 20px 30px;
    border-radius: 14px;

    background:
      linear-gradient(
        118deg,
        #3979ed,
        #1760df 48%,
        #1b4ebd
      );

    color: #ffffff;

    box-shadow:
      0 18px 42px
      rgba(var(--profile-primary-rgb), 0.18);
  }

  .hero-glow {
    position: absolute;
    z-index: -1;
    top: -360px;
    left: -190px;

    width: 520px;
    height: 520px;
    border-radius: 50%;

    background: rgba(255, 255, 255, 0.12);
    pointer-events: none;
  }

  .hero-glow::after {
    position: absolute;
    right: -180px;
    bottom: -245px;

    width: 280px;
    height: 280px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 50%;

    content: "";
  }

  /* ========================================
     Header buttons
  ======================================== */

  .hero-actions {
    position: absolute;
    z-index: 5;
    top: 14px;
    left: 24px;

    display: flex;
    align-items: center;
    gap: 8px;

    direction: ltr;
  }

  .back-button {
    display: grid;
    place-items: center;

    width: 34px;
    height: 34px;
    padding: 0;

    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 9px;

    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;

    cursor: pointer;

    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);

    transition:
      background 160ms ease,
      transform 160ms ease;
  }

  .back-button:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  .edit-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;

    min-height: 34px;
    padding: 7px 12px;

    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 9px;

    background: rgba(255, 255, 255, 0.13);
    color: #ffffff;

    font-size: 11px;
    font-weight: 750;

    cursor: pointer;
    box-shadow: none;

    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);

    transition:
      background 160ms ease,
      transform 160ms ease;
  }

  .edit-button:hover {
    background: rgba(255, 255, 255, 0.21);
    transform: translateY(-1px);
  }

  .edit-button i {
    margin: 0;
    font-size: 13px;
  }

  /* ========================================
     Identity and contact layout
  ======================================== */

  .profile-identity {
    position: relative;
    z-index: 1;

    display: grid;
    grid-template-columns:
      minmax(260px, 0.7fr)
      minmax(500px, 1.3fr);
    align-items: center;
    gap: 30px;

    width: 100%;
    min-width: 0;

    padding-left: 190px;
  }

  .profile-main {
    display: flex;
    align-items: center;
    gap: 17px;

    min-width: 0;
  }

  /* ========================================
     Avatar
  ======================================== */

  .avatar-wrap {
    position: relative;
    flex: 0 0 auto;
  }

  .profile-avatar {
    display: block;

    width: 88px;
    height: 88px;

    border: 2px solid rgba(255, 255, 255, 0.72);
    border-radius: 19px;

    object-fit: cover;

    box-shadow:
      0 14px 28px
      rgba(var(--profile-primary-rgb), 0.26);
  }

  .avatar-fallback {
    display: grid;
    place-items: center;

    background: #ffffff;
    color: var(--profile-primary);

    font-size: 34px;
    font-weight: 800;
  }

  .status-dot {
    position: absolute;
    right: -2px;
    bottom: 7px;

    width: 17px;
    height: 17px;

    border: 3px solid
      color-mix(
        in srgb,
        var(--profile-primary) 76%,
        #0b2466
      );

    border-radius: 50%;
    background: #4ade80;

    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.16);
  }

  /* ========================================
     Identity text
  ======================================== */

  .identity-copy {
    min-width: 0;
  }

  .name-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 9px;
  }

  .name-row h1 {
    margin: 2px 0;

    color: #ffffff;

    font-size: 26px;
    font-weight: 800;
    line-height: 1.25;
    letter-spacing: -0.02em;
  }

  .type-pill {
    display: inline-flex;
    align-items: center;

    padding: 5px 10px;

    border: 1px solid rgba(255, 255, 255, 0.26);
    border-radius: 999px;

    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;

    font-size: 10px;
    font-weight: 750;
    white-space: nowrap;
  }

  .profile-description {
    display: -webkit-box;
    overflow: hidden;

    max-width: 400px;
    margin: 6px 0 0;

    color: rgba(255, 255, 255, 0.76);

    font-size: 11px;
    line-height: 1.55;

    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  /* ========================================
     Contact card
  ======================================== */

  .hero-contact-card {
    width: 100%;
    min-width: 0;

    padding: 0;
    border: 0;

    background: transparent;
    box-shadow: none;
  }

  .contact-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;

    overflow: hidden;

    width: 100%;

    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 12px;

    background: rgba(7, 27, 78, 0.24);

    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.05);

    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .contact-item {
    display: flex;
    align-items: center;
    gap: 11px;

    min-width: 0;
    min-height: 59px;

    padding: 10px 13px;

    border: 0;

    background: rgba(255, 255, 255, 0.07);

    transition:
      background 160ms ease,
      box-shadow 160ms ease;
  }

  /*
   * Creates the vertical and horizontal
   * separation between the four fields.
   */
  .contact-item:nth-child(1),
  .contact-item:nth-child(3) {
    border-inline-end:
      1px solid rgba(255, 255, 255, 0.13);
  }

  .contact-item:nth-child(1),
  .contact-item:nth-child(2) {
    border-bottom:
      1px solid rgba(255, 255, 255, 0.13);
  }

  .contact-item:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .contact-icon {
    display: grid;
    place-items: center;
    flex: 0 0 auto;

    width: 32px;
    height: 32px;

    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 9px;

    background: rgba(255, 255, 255, 0.13);
    color: #ffffff;

    font-size: 13px;
  }

  .contact-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 3px;

    min-width: 0;
  }

  .contact-content small {
    display: block;

    color: rgba(255, 255, 255, 0.62);

    font-size: 9px;
    font-weight: 750;
    line-height: 1.2;
  }

  .contact-content strong {
    display: block;
    overflow: hidden;

    width: 100%;
    max-width: 100%;

    color: #ffffff;

    font-size: 11px;
    font-weight: 750;
    line-height: 1.35;

    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* ========================================
     Financial section
  ======================================== */

  .profile-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;

    margin-top: 10px;
  }

  .finance-section {
    width: 100%;
    padding: 14px 16px;

    border: 1px solid #e3e9f3;
    border-radius: 12px;

    background: var(--mdb-body-bg, #ffffff);

    box-shadow: none;
  }

  .section-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;

    margin-bottom: 9px;
  }

  .section-heading h2 {
    margin: 1px 0 0;

    font-size: 14px;
    font-weight: 750;
  }

  .section-kicker {
    color: #2461db;

    font-size: 10px;
    font-weight: 700;

    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .finance-heading {
    align-items: center;
  }

  .currency-count {
    padding: 5px 8px;

    border: 1px solid #e2e8f1;
    border-radius: 8px;

    background: #f6f8fb;
    color: #596880;

    font-size: 10px;
    font-weight: 700;
  }

  /* ========================================
     Balance cards
  ======================================== */

  .balance-grid {
    display: grid;
    grid-template-columns:
      repeat(auto-fit, minmax(190px, 1fr));
    gap: 8px;
  }

  .balance-card {
    padding: 10px 12px;

    border: 1px solid #dce6fa;
    border-radius: 10px;

    background:
      linear-gradient(
        145deg,
        #fbfdff,
        #f5f8ff
      );
  }

  .balance-card.negative {
    border-color: #f4deda;

    background:
      linear-gradient(
        145deg,
        #fffdfd,
        #fff7f6
      );
  }

  .balance-top {
    display: flex;
    align-items: center;
    justify-content: space-between;

    margin-bottom: 5px;
  }

  .currency-badge {
    padding: 3px 7px;

    border-radius: 999px;

    background: #e7efff;
    color: #2457bd;

    font-size: 9px;
    font-weight: 800;
  }

  .negative .currency-badge {
    background: #ffe9e7;
    color: #d9473b;
  }

  .balance-top i {
    padding: 5px;

    border-radius: 50%;

    background: #edf3ff;
    color: #3b6bd3;
  }

  .negative .balance-top i {
    background: #ffebe9;
    color: #e24a3e;
  }

  .balance-card > small {
    display: block;

    color: #7a879e;

    font-size: 9px;
  }

  .balance-value {
    margin: 0 0 6px;

    color: #2052ae;

    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  .negative .balance-value {
    color: #dc443b;
  }

  .balance-value em {
    font-size: 8px;
    font-style: normal;
    letter-spacing: 0.03em;
  }

  .money-details {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;

    padding-top: 7px;
    border-top: 1px solid rgba(117, 137, 180, 0.14);

    direction: rtl;
  }

  .money-details div {
    display: grid;
    grid-template-rows: 14px 18px;
    align-items: start;

    min-width: 0;
    padding-inline: 9px;
  }

  .money-details div + div {
    border-inline-start:
      1px solid rgba(117, 137, 180, 0.14);
  }

  .money-details span {
    display: block;

    height: 14px;

    color: #8290a8;

    font-size: 8px;
    line-height: 12px;

    white-space: nowrap;
  }

  .money-details strong {
    display: block;

    height: 18px;
    margin: 0;

    font-size: 10px;
    font-variant-numeric: tabular-nums;
    line-height: 18px;

    white-space: nowrap;
  }

  .money-details div:first-child i {
    color: #16a36a;
  }

  .money-details div:last-child i {
    color: #e36555;
  }

  /* ========================================
     Empty financial state
  ======================================== */

  .empty-balance {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;

    min-height: 76px;

    border: 1px dashed #d8e0ef;
    border-radius: 9px;

    color: #77859c;
  }

  .empty-balance > i {
    font-size: 20px;
  }

  .empty-balance div {
    display: flex;
    flex-direction: column;
  }

  .empty-balance span {
    font-size: 10px;
  }

  /* ========================================
     Responsive design
  ======================================== */

  @media (max-width: 1200px) {
    .profile-identity {
      grid-template-columns:
        minmax(240px, 0.65fr)
        minmax(440px, 1.35fr);

      gap: 20px;
      padding-left: 160px;
    }

    .profile-avatar {
      width: 80px;
      height: 80px;
    }

    .name-row h1 {
      font-size: 23px;
    }
  }

  @media (max-width: 1000px) {
    .profile-hero {
      padding-top: 62px;
    }

    .profile-identity {
      grid-template-columns: 1fr;
      gap: 17px;

      padding-left: 0;
    }

    .profile-main {
      width: 100%;
    }

    .hero-contact-card {
      width: 100%;
    }
  }

  @media (max-width: 700px) {
    .profile-hero {
      padding:
        62px
        14px
        15px;
    }

    .hero-actions {
      top: 14px;
      left: 14px;
    }

    .profile-main {
      gap: 13px;
    }

    .profile-avatar {
      width: 70px;
      height: 70px;

      border-radius: 15px;
    }

    .avatar-fallback {
      font-size: 27px;
    }

    .name-row {
      gap: 7px;
    }

    .name-row h1 {
      font-size: 20px;
    }

    .profile-description {
      font-size: 10px;
    }

    .finance-section {
      padding: 14px;
    }
  }

  @media (max-width: 520px) {
    .profile-hero {
      border-radius: 12px;
    }

    .profile-main {
      align-items: flex-start;
    }

    .profile-avatar {
      width: 64px;
      height: 64px;
    }

    .name-row h1 {
      font-size: 18px;
    }

    .type-pill {
      padding: 4px 8px;
      font-size: 9px;
    }

    .contact-list {
      grid-template-columns: 1fr;
    }

    .contact-item {
      min-height: 52px;
    }

    .contact-item:nth-child(1),
    .contact-item:nth-child(2),
    .contact-item:nth-child(3) {
      border-inline-end: 0;
      border-bottom:
        1px solid rgba(255, 255, 255, 0.13);
    }

    .contact-item:nth-child(4) {
      border-bottom: 0;
    }
  }
</style>