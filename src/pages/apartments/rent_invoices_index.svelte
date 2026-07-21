<script>
	import { onMount } from 'svelte';

	import { db } from '../../db.js';

	import { t,shortID } from '../../i18n/i18n.js';

	import { push } from 'svelte-spa-router';

	let mode = 'list';

	let rent_invoices = [];

	let rent_invoiceId = null;

	let loading = true;

	let leases = [];

	let accounts = [];

	export let account_id = null;
	
    import RentInvoiceModal from './RentInvoiceModal.svelte';
    
    let rent_invoiceModalRef = null;

	import RentInvoiceA4ReceiptModal from './RentInvoiceA4ReceiptModal.svelte';

	let showA4Receipt = false;

  	let selectedA4Invoice = null;
	
  	let filterLease = 'all';

  	let filterAccount = 'all';
	
	async function loadLeases() {
		leases = await db.leases.orderBy('created_at').reverse().toArray();
		leases = leases.filter(w => w.status === 1);
	}
	
	async function loadAccounts() {
		accounts = await db.accounts.orderBy('created_at').reverse().toArray();
		accounts = accounts.filter(w => w.status === 1);
	}
	
	let searchTerm = '';
	let currentPage = 1;
	let itemsPerPage = 10;
	let sortColumn = 'created_at';
	let sortDirection = 'desc';

	async function load() {
		loading = true;
		await loadLeases();
		await loadAccounts();
		rent_invoices = await db.rent_invoices.orderBy('created_at').reverse().toArray();
		rent_invoices = rent_invoices.filter(w => w.status === 1);
		loading = false;
	}


	onMount(load);

	function setSort(col) {
		if (sortColumn === col) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		else { sortColumn = col; sortDirection = 'asc'; }
	}

	$: filtered = (() => {
		let res = rent_invoices.slice();
		if (searchTerm.trim()) {
			const term = searchTerm.toLowerCase();
			res = res.filter(w => (w.name && String(w.name).toLowerCase().includes(term)) || (w.code && String(w.code).toLowerCase().includes(term)) || (w.description && w.description.toLowerCase().includes(term)) || (w.id && String(w.id).includes(term)));
		}
		
		if (filterLease !== 'all') {
			res = res.filter((p) => p.lease_id === parseInt(filterLease));
		}

		if (account_id) {
			res = res.filter((p) => p.lease_id && leases.find(b => b.id === p.lease_id)?.tenant_account_id === parseInt(account_id));
		}
		
		if (filterAccount !== 'all') {
			res = res.filter((p) => p.tenant_account_id === parseInt(filterAccount));
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

	$: if (searchTerm || filterLease || filterAccount) currentPage = 1;
</script>

{#if mode === 'list'}
	{#if loading}
		<div>Loading...</div>
	{:else}
		<div class="card shadow-2">
			<div class="card-header bg-body-tertiary border-bottom p-3">
				<div class="row g-3 align-items-center">
					<div class="col-md-4">
						<input class="form-control" placeholder={t('Search rent invoices...')} bind:value={searchTerm} />
					</div>
					<div class="col-md-2">
						<select class="form-select form-select-sm me-3" bind:value={filterLease}>
						<option value="all">{t('All')+' '+t('Leases')}</option>
							{#each leases as lease}
								<option value={lease.id}>{lease.lease_number}</option>
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
						<button class="btn btn-primary w-100" on:click={()=>{rent_invoiceModalRef?.openRentInvoiceModal()}}><i class="bi bi-plus-circle me-2"></i>{t('New Rent Invoice')}</button>
					</div>
				</div>
			</div>

			<div class="card-body p-0">
				<div class="table-responsive">
					<table class="table table-hover table-sm align-middle">
						<thead class="table-light">
							<tr>
								<th class="ps-4 cursor-pointer" on:click={() => setSort('id')}>{t('ID')}{#if sortColumn === 'id'}<i
									class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('lease_id')}>{t('Lease')}{#if sortColumn === 'lease_id'}<i
									class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
								>{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('tenant_account_id')}>{t('Account')}{#if sortColumn === 'tenant_account_id'}<i
									class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
								>{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('invoice_number')}>{t('Rent Invoice Number')}{#if sortColumn === 'invoice_number'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('issue_date')}>{t('Issue Date')}{#if sortColumn === 'issue_date'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('due_date')}>{t('Due Date')}{#if sortColumn === 'due_date'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('base_rent')}>{t('Base Rent')}{#if sortColumn === 'base_rent'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('utility_charges')}>{t('Utility Charges')}{#if sortColumn === 'utility_charges'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('other_charges')}>{t('Other Charges')}{#if sortColumn === 'other_charges'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('total_amount')}>{t('Total Amount')}{#if sortColumn === 'total_amount'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('invoice_status')}>{t('Invoice Status')}{#if sortColumn === 'invoice_status'}<i
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
                                    <td class="text-center">{leases.find(b => b.id === w.lease_id)?.lease_number || ''}</td>
                                    <td class="text-center">{accounts.find(b => b.id === leases.find(b => b.id === w.lease_id)?.tenant_account_id)?.name || ""}</td>
                                    <td class="text-center">{w.invoice_number}</td>
                                    <td class="text-center">{w.issue_date}</td>
                                    <td class="text-center">{w.due_date}</td>
                                    <td class="text-center">{Number(w.base_rent || 0).toLocaleString(undefined,{maximumFractionDigits: 3})} {t(w.currency)}</td>
                                    <td class="text-center">{Number(w.utility_charges || 0).toLocaleString(undefined,{maximumFractionDigits: 3})} {t(w.currency)}</td>
                                    <td class="text-center">{Number(w.other_charges || 0).toLocaleString(undefined,{maximumFractionDigits: 3})} {t(w.currency)}</td>
                                    <td class="text-center">{Number(w.total_amount || 0).toLocaleString(undefined,{maximumFractionDigits: 3})} {t(w.currency)}</td>
                                    <td class="text-center">{w.invoice_status}</td>
									<td class="text-center" dir='ltr'>{w.created_at ? new Date(w.created_at).toLocaleString() : ''}</td>
									<td class="text-center">
										
                                          <button
                                                    class="btn btn-sm btn-outline-warning me-1"
                                                    on:click={() =>
                                                        rent_invoiceModalRef?.editRentInvoice(
                                                            w,
                                                        )}
                                                >
                                                    <i class="bi bi-pencil"></i>
                                                </button>

												  <button
    on:click={() => {
      selectedA4Invoice = w;
      showA4Receipt = true;
    }}
    class="btn btn-outline-primary btn-sm me-2 px-2">
    <i class="bi bi-printer"></i>
  </button>
									</td>
								</tr>
							{/each}
							{#if filtered.length === 0}
								<tr><td colspan="15" class="text-center text-muted p-4">{t('No rent_invoices found.')}</td></tr>
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

<RentInvoiceModal bind:this={rent_invoiceModalRef} on:saved={load} />

{#if showA4Receipt}
  <RentInvoiceA4ReceiptModal invoice={selectedA4Invoice} on:close={() => (showA4Receipt = false)} />
{/if}

<style>
	.cursor-pointer { cursor: pointer; }
	.pagination-circle .page-link { border-radius: 50% !important; margin-left: 3px; margin-right: 3px; border: none; }
</style>