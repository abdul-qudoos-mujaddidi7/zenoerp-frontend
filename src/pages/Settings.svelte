<script>
  import { db } from '../db.js';
  import { onMount } from 'svelte';
  import { link, location } from 'svelte-spa-router';

  import { t, lang, translate_org_type,settings_all } from '../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;


  export let page = 'main';


  $: enable_generics = $settings_all.find((s) => s.key === 'enable_generics')?.value == 1;
  $: enable_brands = $settings_all.find((s) => s.key === 'enable_brands')?.value == 1;
  $: enable_account_groups = $settings_all.find((s) => s.key === 'enable_account_groups')?.value == 1;

  import Warehouses from './products/Warehouses.svelte';
  import Departments from './hospital/Departments.svelte';
  import PrintLabel from './products/PrintLabel.svelte';
  import Currencies from './settings/Currencies.svelte';
  import MainSettings from './settings/MainSettings.svelte';
  import Units from './products/Units.svelte';
  import Categories from './products/Categories.svelte';
  import AccountGroups from './accounts/AccountGroups.svelte';
  import Brands from './settings/Brands.svelte';
  import Generics from './settings/Generics.svelte';
  import Wastes from './Wastes.svelte';
  import StockTransfers from './StockTransfers.svelte';
  import UserRoles from './users/UserRoles.svelte';
  import Users from './Users.svelte';
  import UsersIndex from './users/UsersIndex.svelte';
  import Returns from './settings/Returns.svelte';





</script>

{#if page === 'main'}
  <MainSettings />
{:else}
<div class="system-settings-shell">
  <aside class="system-settings-menu">
  <div class="list-group system-settings-list">
      <a use:link
        href="/dashboard/settings/departments" class="list-group-item list-group-item-action p-2" class:active={page === 'departments'} on:click={() => page = 'departments'}><i class="bi bi-diagram-3"></i>{t('Departments')}</a>
      <a use:link
        href="/dashboard/settings/warehouses" class="list-group-item list-group-item-action p-2" class:active={page === 'warehouses'} on:click={() => page = 'warehouses'}><i class="bi bi-buildings"></i>{t('Warehouses')}</a>
      
      <a use:link
        href="/dashboard/settings/labels" class="list-group-item list-group-item-action p-2" class:active={page === 'labels'} on:click={() => page = 'labels'}><i class="bi bi-upc-scan"></i>{t('Print Labels')}</a>
      <a use:link
        href="/dashboard/settings/wastes" class="list-group-item list-group-item-action p-2" class:active={page === 'wastes'} on:click={() => page = 'wastes'}><i class="bi bi-trash3"></i>{t('Wastes')}</a>
      <a use:link
        href="/dashboard/settings/returns" class="list-group-item list-group-item-action p-2" class:active={page === 'returns'} on:click={() => page = 'returns'}><i class="bi bi-arrow-return-left"></i>{t('Returns')}</a>
      <a use:link
        href="/dashboard/settings/transfers" class="list-group-item list-group-item-action p-2" class:active={page === 'transfers'} on:click={() => page = 'transfers'}><i class="bi bi-arrow-left-right"></i>{t('Stock Transfers')}</a>
      <a use:link
        href="/dashboard/settings/currencies" class="list-group-item list-group-item-action p-2" class:active={page === 'currencies'} on:click={() => page = 'currencies'}><i class="bi bi-currency-exchange"></i>{t('Currencies')}</a>
      <a use:link
        href="/dashboard/settings/units" class="list-group-item list-group-item-action p-2" class:active={page === 'units'} on:click={() => page = 'units'}><i class="bi bi-rulers"></i>{t('Units')}</a>
      <a use:link
        href="/dashboard/settings/categories" class="list-group-item list-group-item-action p-2" class:active={page === 'categories'} on:click={() => page = 'categories'}><i class="bi bi-tags"></i>{t('Categories')}</a>
     
     {#if enable_account_groups}
     
     <a use:link
        href="/dashboard/settings/groups" class="list-group-item list-group-item-action p-2" class:active={page === 'groups'} on:click={() => page = 'groups'}><i class="bi bi-folder2-open"></i>{t('Account Groups')}</a>
        {/if}
      {#if enable_brands}
      <a use:link
        href="/dashboard/settings/brands" class="list-group-item list-group-item-action p-2" class:active={page === 'brands'} on:click={() => page = 'brands'}><i class="bi bi-award"></i>{t('Brands')}</a>
      {/if}
      {#if enable_generics}
      <a use:link
        href="/dashboard/settings/generics" class="list-group-item list-group-item-action p-2" class:active={page === 'generics'} on:click={() => page = 'generics'}><i class="bi bi-capsule"></i>{t('Generics')}</a>
      {/if}
      <a use:link
        href="/dashboard/settings/roles" class="list-group-item list-group-item-action p-2" class:active={page === 'roles'} on:click={() => page = 'roles'}><i class="bi bi-person-gear"></i>{t('User Roles')}</a>
      <a use:link
        href="/dashboard/settings/users" class="list-group-item list-group-item-action p-2" class:active={page === 'users'} on:click={() => page = 'users'}><i class="bi bi-people"></i>{t('Users')}</a>
    </div>
  </aside>
  <section class="system-settings-content">

{#if page === 'warehouses'}
  <Warehouses />
{:else if page === 'departments'}
  <Departments />
{:else if page === 'labels'}
  <PrintLabel />
{:else if page === 'wastes'}
  <Wastes />
{:else if page === 'returns'}
  <Returns />
{:else if page === 'transfers'}
  <StockTransfers />
{:else if page === 'currencies'}
  <Currencies />
{:else if page === 'units'}
  <Units />
{:else if page === 'categories'}
  <Categories />
{:else if page === 'groups'}
  <AccountGroups />
{:else if page === 'brands'}
  <Brands />
{:else if page === 'generics'}
  <Generics />
{:else if page === 'roles'}
  <UserRoles />
{:else if page === 'users'}
  <UsersIndex />
{/if}

  </section>
</div>
{/if}

<style>
  .system-settings-shell {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 1.5rem;
    align-items: stretch;
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .system-settings-menu,
  .system-settings-content {
    min-width: 0;
    min-height: 0;
    border: 1px solid #dfe5ed;
    border-radius: 10px;
    background-color: var(--erp-bg);
    box-shadow: 0 4px 16px rgba(30, 48, 76, 0.1);
  }

  .system-settings-menu {
    align-self: stretch;
    padding: 10px;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .system-settings-list {
    display: grid;
    gap: 2px;
    border: 0 !important;
    background: transparent;
  }

  .system-settings-list :global(.list-group-item) {
    display: flex;
    align-items: center;
    min-height: 52px;
    padding: 8px 12px !important;
    border: 1px solid transparent;
    border-radius: 7px !important;
    background: transparent;
    color: #4d586c;
    font-size: .82rem;
    font-weight: 700;
    transition: background .16s ease, color .16s ease, border-color .16s ease;
  }

  .system-settings-list :global(.list-group-item > i) {
    display: inline-grid;
    width: 24px;
    height: 24px;
    margin-inline-end: 10px;
    place-items: center;
    color: #566176;
    font-size: 1rem;
  }

  .system-settings-list :global(.list-group-item:hover) {
    background: #f6f8fc;
    color: #2f6fed;
  }

  .system-settings-list :global(.list-group-item.active) {
    border-color: transparent;
    background: linear-gradient(90deg, #f0f5ff 0%, #eaf1ff 100%);
    color: var(--erp-primary);
    box-shadow: 0 2px 5px rgba(38, 50, 68, .08);
  }

  .system-settings-list :global(.list-group-item.active > i),
  .system-settings-list :global(.list-group-item:hover > i) { color: #2f6fed; }

  .system-settings-content {
    overflow-x: hidden;
    overflow-y: auto;
    padding: 12px 8px;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .system-settings-menu::-webkit-scrollbar,
  .system-settings-content::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .system-settings-content :global(.my-4:first-child) {
    margin-top: 0 !important;
  }

  .system-settings-content :global(.card) {
    overflow: hidden;
    border-color: #dfe5ed;
    border-radius: 10px;
    box-shadow: none !important;
  }

  .system-settings-content :global(.card-header) {
    padding: 14px 18px;
    border-bottom: 1px solid #e7ecf2;
    background: #f8fafc;
    color: #344155;
    font-size: .82rem;
    font-weight: 850;
  }

  .system-settings-content :global(.form-control),
  .system-settings-content :global(.form-select) {
    min-height: var(--control-height);
    border-color: #d7dee8;
    border-radius: 9px;
    background-color: #fff;
    color: #46536a;
    font-size: .8rem;
  }

  .system-settings-content :global(.form-control:focus),
  .system-settings-content :global(.form-select:focus) {
    border-color: #73a1f8;
    box-shadow: 0 0 0 3px rgba(47,111,237,.08);
  }

  .system-settings-content :global(.form-label) {
    margin-bottom: 7px;
    color: #46536a;
    font-size: .76rem;
    font-weight: 800;
  }

  .system-settings-content :global(.btn) {
    border-radius: 8px;
    font-size: .78rem;
    font-weight: 800;
  }

  .system-settings-content :global(.table) {
    margin-bottom: 0;
  }

  .system-settings-content :global(.table > thead > tr > th) {
    padding: 12px 14px;
    border-bottom: 1px solid #dfe5ed;
    background: #f8fafc;
    color: #64748b;
    font-size: .72rem;
    font-weight: 900;
    white-space: nowrap;
  }

  .system-settings-content :global(.table > tbody > tr > td) {
    padding: 13px 14px;
    border-color: #edf1f6;
    color: #46536a;
    font-size: .78rem;
    vertical-align: middle;
  }

  .system-settings-content :global(.table-hover > tbody > tr:hover > *) {
    --mdb-table-accent-bg: #f6f9ff;
  }

  .system-settings-content :global(.settings-index-table) {
    width: 100%;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
    color: #46536a;
    font-size: .78rem;
  }

  .system-settings-content :global(.settings-index-table > thead > tr > th) {
    height: 3rem;
    padding: .625rem .875rem;
    border-bottom: 1px solid #dfe5ed;
    background: #fff;
    color: #66758a;
    font-size: .78125rem;
    font-weight: 800;
    line-height: 1.25;
    text-align: center;
    vertical-align: middle;
    white-space: nowrap;
  }

  .system-settings-content :global(.settings-index-table > tbody > tr:nth-child(odd)) {
    background: #fff;
  }

  .system-settings-content :global(.settings-index-table > tbody > tr:nth-child(even)) {
    background: #f5f7fa;
  }

  .system-settings-content :global(.settings-index-table > tbody > tr > td) {
    padding: .4rem .875rem;
    border-bottom: 1px solid #e0e0e0;
    background: transparent;
    color: #46536a;
    font-size: .75rem;
    line-height: 1.5;
    text-align: center;
    vertical-align: middle;
  }

  .system-settings-content :global(.settings-index-table > tbody > tr > td:first-child) {
    color: #7b8ba1;
    font-weight: 650;
  }

  .system-settings-content :global(.settings-index-table .btn.btn-sm) {
    width: 2.125rem;
    min-width: 2.125rem;
    height: 2.125rem;
    min-height: 2.125rem;
    margin: 0 .1875rem !important;
    padding: 0;
    border-color: transparent;
    border-radius: .5rem;
    background: transparent;
    box-shadow: none;
  }

  .system-settings-content :global(.settings-index-table .btn.btn-sm:hover) {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }

  /* Keep the Units table treatment consistent across System Settings only. */
  .system-settings-content :global(.data-table),
  .system-settings-content :global(.table:not(.settings-index-table)) {
    width: 100%;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
    color: #46536a;
    font-size: .78rem;
  }

  .system-settings-content :global(.data-table > thead > tr > th),
  .system-settings-content :global(.table:not(.settings-index-table) > thead > tr > th) {
    height: 3rem;
    padding: .625rem .875rem;
    border-bottom: 1px solid #dfe5ed;
    background: #fff;
    color: #66758a;
    font-size: .78125rem;
    font-weight: 800;
    line-height: 1.25;
    text-align: center;
    vertical-align: middle;
    white-space: nowrap;
  }

  .system-settings-content :global(.data-table > tbody > tr:nth-child(odd)),
  .system-settings-content :global(.table:not(.settings-index-table) > tbody > tr:nth-child(odd)) {
    background: #fff;
  }

  .system-settings-content :global(.data-table > tbody > tr:nth-child(even)),
  .system-settings-content :global(.table:not(.settings-index-table) > tbody > tr:nth-child(even)) {
    background: #f5f7fa;
  }

  .system-settings-content :global(.data-table > tbody > tr > td),
  .system-settings-content :global(.table:not(.settings-index-table) > tbody > tr > td) {
    padding: .4rem .875rem;
    border-bottom: 1px solid #e0e0e0;
    background: transparent;
    color: #46536a;
    font-size: .75rem;
    line-height: 1.5;
    text-align: center;
    vertical-align: middle;
  }

  .system-settings-content :global(.data-table > tbody > tr > td:first-child),
  .system-settings-content :global(.table:not(.settings-index-table) > tbody > tr > td:first-child) {
    color: #7b8ba1;
    font-weight: 650;
  }

  .system-settings-content :global(.data-table-wrap),
  .system-settings-content :global(.table-responsive) {
    scrollbar-width: thin;
    scrollbar-color: #b8c4d2 transparent;
  }

  .system-settings-content :global(.visible-table-actions .action-btn.icon),
  .system-settings-content :global(.visible-table-actions .action-btn.icon:hover:not(:disabled)),
  .system-settings-content :global(.table:not(.settings-index-table) .btn.btn-sm),
  .system-settings-content :global(.table:not(.settings-index-table) .btn.btn-sm:hover) {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }

  .system-settings-content :global(.badge) {
    padding: 6px 9px;
    border-radius: 999px;
    font-weight: 800;
  }

  .system-settings-content :global(.pagination .page-link) {
    border: 0;
    border-radius: 50% !important;
    color: #64748b;
  }

  .system-settings-content :global(.pagination .page-item.active .page-link) {
    background: #2f6fed;
    color: #fff;
  }

  @media (max-width: 991px) {
    .system-settings-shell {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 0.75rem;
    }
    .system-settings-menu {
      min-height: auto;
      padding: 0.5rem;
      overflow-x: auto;
      overflow-y: hidden;
    }
    .system-settings-list {
      display: flex;
      width: max-content;
      min-width: 100%;
      overflow: visible;
    }
    .system-settings-list :global(.list-group-item) { min-width: 175px; }
  }

  @media (max-width: 575px) {
    .system-settings-content { padding: 8px 4px; }
    .system-settings-list :global(.list-group-item) {
      min-width: 145px;
      min-height: 44px;
    }
  }
</style>
