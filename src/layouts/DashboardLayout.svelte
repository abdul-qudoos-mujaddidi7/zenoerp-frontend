<script>
  import { location } from 'svelte-spa-router';
  import Sidebar from '../components/Sidebar.svelte';
  import Topbar from '../components/Topbar.svelte';
  import Dashboard from '../pages/Dashboard.svelte';
  import Accounts from '../pages/Accounts.svelte';
  import AccountTypes from '../pages/accounts/AccountTypes.svelte';
  import Patients from '../pages/Patients.svelte';
  import Apartments from '../pages/Apartments.svelte';
  import PatientTypes from '../pages/hospital/patients/PatientTypes.svelte';
  import AccountView from '../pages/accounts/AccountView.svelte';
  import AppointmentView from '../pages/hospital/appointments/AppointmentView.svelte';
  import Journals from '../pages/Journals.svelte';
  import Exchanges from '../pages/Exchanges.svelte';
  import Currencies from '../pages/settings/Currencies.svelte';
  import Sales from '../pages/Sales.svelte';
  import WarehouseView from '../pages/products/WarehouseView.svelte';
  import Prescriptions from '../pages/hospital/Prescriptions.svelte';
  import PrescriptionView from '../pages/hospital/prescriptions/PrescriptionView.svelte';
  import PrescriptionForm from '../pages/hospital/prescriptions/PrescriptionForm.svelte';
  import ServicesIndex from '../pages/products/ServicesIndex.svelte';
  import DepartmentView from '../pages/hospital/DepartmentView.svelte';
  import Productions from '../pages/manufacturing/Productions.svelte';
  import ProductionView from '../pages/manufacturing/productions/ProductionView.svelte';
  import ProductionForm from '../pages/manufacturing/productions/ProductionForm.svelte';
  import SaleView from '../pages/sales/SaleView.svelte';
  import InventoryRecordView from '../pages/inventory_records/InventoryRecordView.svelte';
  import StockTransfers from '../pages/StockTransfers.svelte';
  import StockTransferView from '../pages/stocktransfers/StockTransferView.svelte';
  import StockTransferForm from '../pages/stocktransfers/StockTransferForm.svelte';
  import POS from '../pages/POS.svelte';
  import Purchases from '../pages/Purchases.svelte';
  import PurchaseView from '../pages/purchases/PurchaseView.svelte';
  import Stock from '../pages/Stock.svelte';
  import Product from '../pages/Product.svelte';
  import StockTransactions from '../pages/StockTransactions.svelte';
  import Settings from '../pages/Settings.svelte';
  import Subscription from '../pages/Subscription.svelte';
  import Users from '../pages/Users.svelte';
  import Backup from '../pages/Backup.svelte';
  import ActivityLogs from '../pages/ActivityLogs.svelte';
  import Wastes from '../pages/Wastes.svelte';
  import WorkCenters from '../pages/manufacturing/WorkCenters.svelte';
  import WasteView from '../pages/wastes/WasteView.svelte';
  import Treasury from '../pages/Treasury.svelte';
  import Reports from '../pages/Reports.svelte';
  import PurchaseForm from '../pages/purchases/PurchaseForm.svelte';
  import LabTests from '../pages/hospital/LabTests.svelte';
  import SaleForm from '../pages/sales/SaleForm.svelte';
  import InventoryRecordForm from '../pages/inventory_records/InventoryRecordForm.svelte';
  import { auth } from '../auth/authStore';
  import { push } from 'svelte-spa-router';
  import { onMount } from 'svelte';
  import { setLanguage, isRTL, lang } from '../i18n/i18n';
  import { runSync } from '../sync/syncService';
  import MasterExchanges from '../pages/MasterExchanges.svelte';
  import MoneyTransfers from '../pages/MoneyTransfers.svelte';
  import Tables from '../pages/Tables.svelte';
  import Boms from '../pages/manufacturing/Boms.svelte';
  import BOMView from '../pages/manufacturing/boms/BOMView.svelte';
  import BOMForm from '../pages/manufacturing/boms/BOMForm.svelte';
  import Dashboard2 from '../pages/Dashboard2.svelte';
  import App from '../App.svelte';
  import Appointments from '../pages/Appointments.svelte';
  import InventoryRecords from '../pages/InventoryRecords.svelte';
  import ProductForm from '../pages/products/ProductForm.svelte';


  function applyLanguageDirection(code) {
    if (typeof document === 'undefined') return;
    const shouldRtl = isRTL(code);
    document.documentElement.dir = shouldRtl ? 'rtl' : 'ltr';
    const mdbCss = document.getElementById('mdb-css');
    const mdbRtlCss = document.getElementById('mdb-rtl-css');
    if (mdbCss && mdbRtlCss) {
      mdbCss['disabled'] = shouldRtl;
      mdbRtlCss['disabled'] = !shouldRtl;
    }
  }

  onMount(() => {
    if (!$auth || !$auth.isAuthenticated) {
      push('/login');
    }
    try {
      const storedLang = localStorage.getItem('lang') || 'en';
      setLanguage(storedLang);
      applyLanguageDirection(storedLang);
    } catch (e) {}
    try {
      const theme = localStorage.getItem('theme') || 'light';
      document.documentElement.dataset.mdbTheme = theme;
    } catch (e) {}
  });

  $: loc = $location ? $location.replace(/\/+$/g, '') : '';
  $: locPath = loc.split('?')[0];
  $: currentLang = $lang;
  $: applyLanguageDirection(currentLang);

  $: accountId = locPath && locPath.startsWith('/dashboard/account/') ? locPath.split('/').pop() : null;

  $: appointmentID = loc && loc.startsWith('/dashboard/appointment/') ? loc.split('/').pop() : null;

  $: accountPage = loc && loc.startsWith('/dashboard/accounts/') ? loc.split('/').pop() : null;

  $: patientId = loc && loc.startsWith('/dashboard/patient/') ? loc.split('/').pop() : null;

  $: patientPage = loc && loc.startsWith('/dashboard/patients/') ? loc.split('/').pop() : null;

  $: apartmentPage = loc && loc.startsWith('/dashboard/apartments/') ? loc.split('/').pop() : null;

  $: journalPage = loc && loc.startsWith('/dashboard/journals/') ? loc.split('/').pop() : null;

  $: appointmentPage = loc && loc.startsWith('/dashboard/appointments/') ? loc.split('/').pop() : null;

  $: masterExchangePage = loc && loc.startsWith('/dashboard/master-exchanges/') ? loc.split('/').pop() : null;

  $: tablePage = loc && loc.startsWith('/dashboard/tables/') ? loc.split('/').pop() : null;

  $: transferPage = loc && loc.startsWith('/dashboard/transfers/') ? loc.split('/').pop() : null;

  $: exchangePage = loc && loc.startsWith('/dashboard/exchanges/') ? loc.split('/').pop() : null;

  $: settingPage = loc && loc.startsWith('/dashboard/settings/') ? loc.split('/').pop() : null;

  $: stockPage = loc && loc.startsWith('/dashboard/stock/') ? loc.split('/').pop() : 'products';

  $: productRouteParts = loc && loc.startsWith('/dashboard/product/') ? loc.split('/') : [];
  $: productId = productRouteParts[3] || null;
  $: productPage = productRouteParts[4] || 'overview';

  $: stocktransferId = loc && loc.startsWith('/dashboard/stock-transfers/') ? loc.split('/').pop() : null;

  $: purchaseId = loc && loc.startsWith('/dashboard/purchases/') ? loc.split('/').pop() : null;

  $: purchaseFormId = loc && loc.startsWith('/dashboard/purchase-form/') ? loc.split('/').pop() : null;

  $: purchaseFormAccountId = loc && loc.startsWith('/dashboard/account-purchase-form/') ? loc.split('/').pop() : null;

  $: bomId = loc && loc.startsWith('/dashboard/boms/') ? loc.split('/').pop() : null;

  $: bomFormId = loc && loc.startsWith('/dashboard/bom-form/') ? loc.split('/').pop() : null;

  $: saleId = loc && loc.startsWith('/dashboard/sales/') ? loc.split('/').pop() : null;

  $: saleFormId = loc && loc.startsWith('/dashboard/sale-form/') ? loc.split('/').pop() : null;

  $: saleFormAccountId = loc && loc.startsWith('/dashboard/account-sale-form/') ? loc.split('/').pop() : null;

  $: inventory_recordId = loc && loc.startsWith('/dashboard/inventory_records/') ? loc.split('/').pop() : null;

  $: inventory_recordFormId = loc && loc.startsWith('/dashboard/inventory_record-form/') ? loc.split('/').pop() : null;

  $: inventory_recordFormAccountId = loc && loc.startsWith('/dashboard/account-inventory_record-form/') ? loc.split('/').pop() : null;

  $: prescriptionId = loc && loc.startsWith('/dashboard/prescriptions/') ? loc.split('/').pop() : null;

  $: prescriptionFormId = loc && loc.startsWith('/dashboard/prescription-form/') ? loc.split('/').pop() : null;

  $: prescriptionAppointmentId = loc && loc.startsWith('/dashboard/prescription-appointment-form/') ? loc.split('/').pop() : null;

  $: productionId = loc && loc.startsWith('/dashboard/productions/') ? loc.split('/').pop() : null;

  $: productionFormId = loc && loc.startsWith('/dashboard/production-form/') ? loc.split('/').pop() : null;

  $: stockTransferFormId = loc && loc.startsWith('/dashboard/stock-transfer-form/') ? loc.split('/').pop() : null;

  $: wasteId = loc && loc.startsWith('/dashboard/wastes/') ? loc.split('/').pop() : null;

  $: selectedWarehouseId = loc && loc.startsWith('/dashboard/warehouse/') ? loc.split('/').pop() : null;

  $: selectedDepartmentId = loc && loc.startsWith('/dashboard/department/') ? loc.split('/').pop() : null;

  $: productFormId = loc && loc.startsWith('/dashboard/product-form/') ? loc.split('/').pop() : null;

  let sidebarOpen = false;
  let sidebarCollapsed = false;
  let lastSidebarLocation = loc;

  $: if (loc !== lastSidebarLocation) {
    sidebarOpen = false;
    lastSidebarLocation = loc;
  }

  
</script>


<div class="d-flex">
  {#if sidebarOpen}
    <button
      type="button"
      class="sidebar-backdrop"
      aria-label="Close navigation"
      on:click={() => (sidebarOpen = false)}></button>
  {/if}

  {#key currentLang}
    <Sidebar bind:sidebarOpen bind:sidebarCollapsed />
  {/key}

  <div class="flex-grow-1 content-wrapper" class:sidebar-collapsed={sidebarCollapsed} class:dashboard-surface={loc === '/dashboard'}>
    {#key currentLang}
      <Topbar on:toggleSidebar={() => (sidebarOpen = !sidebarOpen)} />
    {/key}

    <main
      class="erp-page-main"
      class:erp-form-route={loc.startsWith('/dashboard/sale-form/') ||
        loc.startsWith('/dashboard/account-sale-form/') ||
        loc.startsWith('/dashboard/purchase-form/') ||
        loc.startsWith('/dashboard/account-purchase-form/')}>
      {#key currentLang}
      {#if loc === '/dashboard'}
        <Dashboard />
      {:else if loc === '/dashboard/2'}
        <Dashboard2 />
      {:else if loc === '/dashboard/treasury'}
        <Treasury />
      {:else if loc.startsWith('/dashboard/account/')}
        <AccountView id={accountId} />
      {:else if loc.startsWith('/dashboard/appointment/')}
        <AppointmentView id={appointmentID} />
      {:else if loc.startsWith('/dashboard/accounts/')}
        <Accounts page={accountPage} />
      {:else if loc === '/dashboard/account-types'}
        <AccountTypes />
      {:else if loc.startsWith('/dashboard/patients/')}
        <Patients page={patientPage} />
      {:else if loc.startsWith('/dashboard/apartments/')}
        <Apartments page={apartmentPage} />
      {:else if loc === '/dashboard/patient-types'}
        <PatientTypes />
      {:else if loc.startsWith('/dashboard/journals/')}
        <Journals page={journalPage} />
      {:else if loc.startsWith('/dashboard/appointments/')}
        <Appointments page={appointmentPage} />
      {:else if loc.startsWith('/dashboard/exchanges/')}
        <Exchanges page={exchangePage} />
      {:else if loc.startsWith('/dashboard/master-exchanges/')}
        <MasterExchanges page={masterExchangePage} />
      {:else if loc.startsWith('/dashboard/tables/')}
        <Tables page={tablePage} />
      {:else if loc.startsWith('/dashboard/transfers/')}
        <MoneyTransfers page={transferPage} />
      {:else if loc.startsWith('/dashboard/currencies/')}
        <Currencies />
      {:else if loc === '/dashboard/sales'}
        <Sales />
      {:else if loc.startsWith('/dashboard/sales/')}
        <SaleView {saleId} />
      {:else if loc.startsWith('/dashboard/inventory_records/')}
        <InventoryRecordView {inventory_recordId} />
      {:else if loc.startsWith('/dashboard/sale-form/')}
        <SaleForm saleId={saleFormId || null} />
      {:else if loc.startsWith('/dashboard/account-sale-form/')}
        <SaleForm saleId={0} accountId={saleFormAccountId || null} />
      {:else if loc.startsWith('/dashboard/inventory_record-form/')}
        <InventoryRecordForm inventory_recordId={inventory_recordFormId || null} />
      {:else if loc.startsWith('/dashboard/account-inventory_record-form/')}
        <InventoryRecordForm inventory_recordId={0} accountId={inventory_recordFormAccountId || null} />
      {:else if loc === '/dashboard/prescriptions'}
        <Prescriptions />
      {:else if loc === '/dashboard/labtests'}
        <LabTests />
      {:else if loc.startsWith('/dashboard/prescriptions/')}
        <PrescriptionView {prescriptionId} />
      {:else if loc.startsWith('/dashboard/prescription-form/')}
        <PrescriptionForm prescriptionId={prescriptionFormId || null} />
      {:else if loc.startsWith('/dashboard/prescription-appointment-form/')}
        <PrescriptionForm prescriptionId={0} {prescriptionAppointmentId} />
      {:else if loc === '/dashboard/productions'}
        <Productions />
      {:else if loc.startsWith('/dashboard/productions/')}
        <ProductionView {productionId} />
      {:else if loc.startsWith('/dashboard/production-form/')}
        <ProductionForm productionId={productionFormId || null} />
      {:else if loc.startsWith('/dashboard/warehouse/')}
        <WarehouseView {selectedWarehouseId} />
      {:else if loc.startsWith('/dashboard/department/')}
        <DepartmentView {selectedDepartmentId} />
      {:else if loc === '/dashboard/stock-transfers'}
        <StockTransfers />
      {:else if loc.startsWith('/dashboard/stock-transfers/')}
        <StockTransferView {stocktransferId} />
      {:else if loc.startsWith('/dashboard/stock-transfer-form/')}
        <StockTransferForm stocktransferId={stockTransferFormId || null} />
      {:else if loc === '/dashboard/pos'}
        <POS />
      {:else if loc === '/dashboard/purchases'}
        <Purchases />
      {:else if loc.startsWith('/dashboard/purchases/')}
        <PurchaseView {purchaseId} />
      {:else if loc.startsWith('/dashboard/purchase-form/')}
        <PurchaseForm purchaseId={purchaseFormId || null} />
      {:else if loc.startsWith('/dashboard/account-purchase-form/')}
        <PurchaseForm purchaseId={0} accountId={purchaseFormAccountId || null} />
      {:else if loc === '/dashboard/wastes'}
        <Wastes />
      {:else if loc.startsWith('/dashboard/wastes/')}
        <WasteView {wasteId} />
        {:else if loc === '/dashboard/stock'}
        <div class="route-fill">
          <Stock page="products" />
        </div>
      {:else if loc.startsWith('/dashboard/stock/')}
        <div class="route-fill">
          <Stock page={stockPage} />
        </div>
      {:else if loc === '/dashboard/services'}
        <ServicesIndex />
      {:else if loc === '/dashboard/stock-transactions'}
        <StockTransactions />
      {:else if loc.startsWith('/dashboard/product-form/')}
        <ProductForm {productFormId} />
      {:else if loc.startsWith('/dashboard/product/')}
        <Product id={productId} page={productPage} />
      {:else if loc === '/dashboard/reports'}
        <Reports />
        {:else if loc.startsWith('/dashboard/settings/')}
        <div class="route-fill">
          <Settings page={settingPage} />
        </div>
      {:else if loc === '/dashboard/subscription'}
        <Subscription />
      {:else if loc === '/dashboard/users'}
        <Users />
      {:else if loc === '/dashboard/backup'}
        <Backup />
      {:else if loc === '/dashboard/activity-logs'}
        <ActivityLogs />
      {:else if loc === '/dashboard/work-centers'}
        <WorkCenters />
      {:else if loc === '/dashboard/boms'}
        <Boms />
      {:else if loc.startsWith('/dashboard/boms/')}
        <BOMView {bomId} />
      {:else if loc.startsWith('/dashboard/bom-form/')}
        <BOMForm bomId={bomFormId || null} />
      {/if}
      {/key}
    </main>
  </div>
</div>

<style>
  .sidebar-backdrop {
    display: none;
  }

  .content-wrapper {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    min-height: 100dvh;
    max-height: 100dvh;
    min-width: 0 !important;
    overflow: hidden;
    transition: margin 0.3s ease;
    background: var(--erp-bg);
  }

  .content-wrapper.dashboard-surface {
    background: var(--erp-bg);
  }

  main {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .erp-page-main {
    width: 100%;
    max-width: var(--content-max-width);
    margin-inline: auto;
    padding: var(--page-padding) var(--page-padding-x);
    min-width: 0;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  

  .route-fill {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

  /* Non-list form pages still need to scroll the whole page */
  .erp-page-main:not(:has([class*='-table-card'])):not(:has(.table-card)):not(:has(.journals-card)):not(:has(.exchanges-card)):not(:has(.card > .card-body.p-0)):not(:has(.card > .card-body .table-responsive)) {
    overflow: auto;
  }

  .erp-page-main.erp-form-route {
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
  }

  :global(html[dir='ltr']) .content-wrapper {
    min-width: 0 !important;
    margin-left: var(--sidebar-width);
  }
  :global(html[dir='rtl']) .content-wrapper {
    min-width: 0 !important;
    margin-right: var(--sidebar-width);
    margin-left: 0;
  }
  @media (max-width: 991px) {
    .sidebar-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1040;
      display: block;
      padding: 0;
      border: 0;
      background: rgba(23, 32, 51, 0.42);
      backdrop-filter: blur(2px);
    }

    .content-wrapper {
      margin: 0 !important;
    }
  }
</style>
