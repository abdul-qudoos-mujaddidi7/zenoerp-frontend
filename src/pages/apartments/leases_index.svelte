<script>
	import { onMount } from 'svelte';
	import { db } from '../../db.js';
	import { t,shortID } from '../../i18n/i18n.js';
	import { push } from 'svelte-spa-router';
	let mode = 'list'; // list | create | view | edit
	let leases = [];
	let leaseId = null;
	let loading = true;
	let apartments = [];
	let buildings = [];
	let floors = [];
	let accounts = [];

    import LeaseModal from './LeaseModal.svelte';


	
	import LeaseA4ReceiptModal from './LeaseA4ReceiptModal.svelte';
	let showA4Receipt = false;
  	let selectedA4Lease = null;
    
    export let account_id = null;
    let leaseModalRef = null;
    
	
  	let filterApartment = 'all';
  	let filterAccount = 'all';
	async function loadApartments() {
		apartments = await db.apartments.orderBy('created_at').reverse().toArray();
		apartments = apartments.filter(w => w.status === 1);
		buildings = await db.buildings.orderBy('created_at').reverse().toArray();
		buildings = buildings.filter(w => w.status === 1);
		floors = await db.floors.orderBy('created_at').reverse().toArray();
		floors = floors.filter(w => w.status === 1);
	}
	
	async function loadAccounts() {
		accounts = await db.accounts.orderBy('created_at').reverse().toArray();
		accounts = accounts.filter(w => w.status === 1);
	}
//   leases: 'id, name, code, address,lease_number, grace_period_days, apartment_id, description, status, version, updated_at, last_synced_at',

	// Table state
	let searchTerm = '';
	let currentPage = 1;
	let itemsPerPage = 10;
	let sortColumn = 'created_at';
	let sortDirection = 'desc';

	async function load() {
		loading = true;
		await loadApartments();
		await loadAccounts();
		leases = await db.leases.orderBy('created_at').reverse().toArray();
		leases = leases.filter(w => w.status === 1);
		loading = false;
	}


	onMount(load);

	function setSort(col) {
		if (sortColumn === col) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		else { sortColumn = col; sortDirection = 'asc'; }
	}

	$: filtered = (() => {
		let res = leases.slice();
		if (searchTerm.trim()) {
			const term = searchTerm.toLowerCase();
			res = res.filter(w => (w.name && String(w.name).toLowerCase().includes(term)) || (w.code && String(w.code).toLowerCase().includes(term)) || (w.description && w.description.toLowerCase().includes(term)) || (w.id && String(w.id).includes(term)));
		}
		
		if (filterApartment !== 'all') {
			res = res.filter((p) => p.apartment_id === parseInt(filterApartment));
		}
		
		if (filterAccount !== 'all') {
			res = res.filter((p) => p.tenant_account_id === parseInt(filterAccount));
		}
		if (account_id) {
			res = res.filter((p) => p.tenant_account_id === parseInt(account_id));
		}
		res = res.sort((a,b)=>{
			let A = a[sortColumn]; let B = b[sortColumn];
			if (A === undefined || A === null) return 1;
			if (B === undefined || B === null) return -1;
			if (typeof A === 'string') A = A.toLowerCase(); if (typeof B === 'string') B = B.toLowerCase();
			if (A < B) return sortDirection === 'asc' ? -1 : 1;
			if (A > B) return sortDirection === 'asc' ? 1 : -1;
			return 0;
		});
		return res;
	})();

	$: paginated = (()=>{ const s=(currentPage-1)*itemsPerPage; return filtered.slice(s, s+itemsPerPage); })();
	$: totalPages = Math.ceil(filtered.length / itemsPerPage);

	$: if (searchTerm || filterApartment || filterAccount) currentPage = 1;
</script>

{#if mode === 'list'}
	{#if loading}
		<div>Loading...</div>
	{:else}
		<div class="card shadow-2">
			<div class="card-header bg-body-tertiary border-bottom p-3">
				<div class="row g-3 align-items-center">
					<div class="col-md-4">
						<input class="form-control" placeholder={t('Search leases...')} bind:value={searchTerm} />
					</div>
					<div class="col-md-2">
						<select class="form-select form-select-sm me-3" bind:value={filterApartment}>
						<option value="all">{t('All')+' '+t('Apartments')}</option>
						{#each apartments as apartment}
							<option value={apartment.id}>{t("Apartment")}: {apartment.unit_number} - {t("Floor")}: {floors.find((f) => f.id === apartment.floor_id)?.floor_number || ''} - {t("Building")}: {buildings.find((b) => b.id === apartment.building_id)?.name || ''} ({buildings.find((b) => b.id === apartment.building_id)?.code || ''})</option>
						{/each}
						</select>
					</div>
					<div class="col-md-2">
					
						<select class="form-select form-select-sm me-3" bind:value={filterAccount}>
						<option value="all">{t('All')+' '+t('Accounts')}</option>
							{#each accounts as account}
								<option value={account.id}>{account.name}</option>
							{/each}
						</select>
					</div>
					<div class="col-md-2 text-end">
						<select class="form-select form-select-sm d-inline-block w-auto" bind:value={itemsPerPage}>
							<option value={5}>5 {t('per page')}</option>
							<option value={10}>10 {t('per page')}</option>
							<option value={20}>20 {t('per page')}</option>
						</select>
					</div>
					<div class="col-md-2">
						<button class="btn btn-primary w-100"                 on:click={()=>{leaseModalRef?.openLeaseModal()}}><i class="bi bi-plus-circle me-2"></i>{t('New Lease')}</button>
					</div>
				</div>
			</div>

			<div class="card-body p-0">
				<div class="table-responsive">
					<table class="table table-hover table-sm align-middle">
						<thead class="table-light">
							<tr>
								<th class="ps-4 cursor-pointer" on:click={() => setSort('id')}>{t('ID')}{#if sortColumn === 'id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('lease_number')}>{t('Lease Number')}{#if sortColumn === 'lease_number'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('apartment_id')}>{t('Apartment')}{#if sortColumn === 'apartment_id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th><th class="text-center cursor-pointer" on:click={() => setSort('tenant_account_id')}>{t('Account')}{#if sortColumn === 'tenant_account_id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('grace_period_days')}>{t('Grace Period (Days)')}{#if sortColumn === 'grace_period_days'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('start_date')}>{t('Start Date')}{#if sortColumn === 'start_date'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('end_date')}>{t('End Date')}{#if sortColumn === 'end_date'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('monthly_rent')}>{t('Monthly Rent')}{#if sortColumn === 'monthly_rent'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('deposit_amount')}>{t('Deposit Amount')}{#if sortColumn === 'deposit_amount'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('payment_cycle')}>{t('Payment Cycle')}{#if sortColumn === 'payment_cycle'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('auto_renew')}>{t('Auto Renew')}{#if sortColumn === 'auto_renew'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('lease_type')}>{t('Lease Type')}{#if sortColumn === 'lease_type'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  
								<th class="text-center cursor-pointer" on:click={() => setSort('created_at')}>{t('Created')}{#if sortColumn === 'created_at'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>

								<th width="150" class="text-center">{t('Actions')}</th>
							</tr>
						</thead>
						<tbody>
							{#each paginated as w}
								<tr>
									<td class="ps-4 text-muted small">{shortID(w.id)}</td>
                                    <td class="text-center">{w.lease_number}</td>
                                    <td class="text-center">{apartments.find(b => b.id === w.apartment_id)?.unit_number || ''}</td>
                                    <td class="text-center">{accounts.find(b => b.id === w.tenant_account_id)?.name || ""}</td>
                                    <td class="text-center">{w.grace_period_days}</td>
                                    <td class="text-center">{w.start_date}</td>
                                    <td class="text-center">{w.end_date}</td>
                                    <td class="text-center">{Number(w.monthly_rent || 0).toLocaleString(undefined,{maximumFractionDigits: 3})} {t(w.currency)}</td>
                                    <td class="text-center">{Number(w.deposit_amount || 0).toLocaleString(undefined,{maximumFractionDigits: 3})} {t(w.currency)}</td>
                                    <td class="text-center">{t(w.payment_cycle)}</td>
                                    <td class="text-center">{w.auto_renew==1?t("Yes"):t("No")}</td>
                                    <td class="text-center">{t(w.lease_type)}</td>
									<td class="text-center" dir='ltr'>{w.created_at ? new Date(w.created_at).toLocaleString() : ''}</td>
									<td class="text-center">
										
                                          <button
											class="btn btn-sm btn-outline-secondary me-1"
											on:click={() =>
												leaseModalRef?.editLease(
													w,
												)}
										>
											<i class="bi bi-pencil"></i>
										</button>

										<button
											on:click={() => {
											selectedA4Lease = w;
											showA4Receipt = true;
											}}
											class="btn btn-outline-primary btn-sm me-2 px-2">
											<i class="bi bi-printer"></i>
										</button>
									</td>
								</tr>
							{/each}
							{#if filtered.length === 0}
								<tr><td colspan="14" class="text-center text-muted p-4">{t('No leases found.')}</td></tr>
							{/if}
						</tbody>
					</table>
				</div>
			</div>

			{#if !loading && filtered.length > 0}
				<div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3">
					<div class="text-muted small">{t('Showing')} {(currentPage-1)*itemsPerPage+1} {t('to')} {Math.min(currentPage*itemsPerPage, filtered.length)} {t('of')} {filtered.length} {t('entries')}</div>
					<nav>
						<ul class="pagination pagination-circle pagination-sm mb-0">
							<li class="page-item" class:disabled={currentPage === 1}><button class="page-link" on:click={() => (currentPage = 1)}>&laquo;</button></li>
							<li class="page-item" class:disabled={currentPage === 1}><button class="page-link" on:click={() => (currentPage -= 1)}>&lt;</button></li>
							{#each Array(totalPages) as _, i}
								<li class="page-item" class:active={currentPage === i+1}><button class="page-link" on:click={() => (currentPage = i+1)}>{i+1}</button></li>
							{/each}
							<li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}><button class="page-link" on:click={() => (currentPage += 1)}>&gt;</button></li>
							<li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}><button class="page-link" on:click={() => (currentPage = totalPages)}>&raquo;</button></li>
						</ul>
					</nav>
				</div>
			{/if}
		</div>
	{/if}
{/if}


<LeaseModal bind:this={leaseModalRef} account_id={account_id} on:saved={load} />

{#if showA4Receipt}
  <LeaseA4ReceiptModal lease={selectedA4Lease} on:close={() => (showA4Receipt = false)} />
{/if}
<style>
	.cursor-pointer { cursor: pointer; }
	.pagination-circle .page-link { border-radius: 50% !important; margin-left: 3px; margin-right: 3px; border: none; }
</style>
