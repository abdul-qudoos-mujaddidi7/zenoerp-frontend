<script>
	import { onMount } from 'svelte';
	import { db } from '../../db.js';
	import { t,shortID } from '../../i18n/i18n.js';
	import { push } from 'svelte-spa-router';
	let mode = 'list'; // list | create | view | edit
	let meter_readings = [];
	let meter_readingId = null;
	let loading = true;
	let meters = [];
	let leases = [];
	let buildings = [];
	let floors = [];
	let accounts = [];

    import MeterReadingModal from './MeterReadingModal.svelte';


	
	import MeterReadingA4ReceiptModal from './MeterReadingA4ReceiptModal.svelte';
	let showA4Receipt = false;
  	let selectedA4MeterReading = null;
    
    
    let meter_readingModalRef = null;
    
	
  	let filterMeter = 'all';
	async function loadMeters() {
		meters = await db.utility_meters.orderBy('created_at').reverse().toArray();
		meters = meters.filter(w => w.status === 1);
		leases = await db.leases.orderBy('created_at').reverse().toArray();
		leases = leases.filter(w => w.status === 1);
	}
	
	let searchTerm = '';
	let currentPage = 1;
	let itemsPerPage = 10;
	let sortColumn = 'created_at';
	let sortDirection = 'desc';

	async function load() {
		loading = true;
		await loadMeters();
		meter_readings = await db.meter_readings.orderBy('created_at').reverse().toArray();
		meter_readings = meter_readings.filter(w => w.status === 1);
		loading = false;
	}


	export let account_id = null;

	onMount(load);

	function setSort(col) {
		if (sortColumn === col) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		else { sortColumn = col; sortDirection = 'asc'; }
	}

	$: filtered = (() => {
		let res = meter_readings.slice();
		if (searchTerm.trim()) {
			const term = searchTerm.toLowerCase();
			res = res.filter(w => (w.name && String(w.name).toLowerCase().includes(term)) || (w.code && String(w.code).toLowerCase().includes(term)) || (w.description && w.description.toLowerCase().includes(term)) || (w.id && String(w.id).includes(term)));
		}
		
		if (filterMeter !== 'all') {
			res = res.filter((p) => p.meter_id === parseInt(filterMeter));
		}

		if (account_id) {
			let account_leases = leases.filter(l => l.tenant_account_id === parseInt(account_id));
			if (!account_leases.length) return [];
			let account_meters = meters.filter(m => account_leases.find(l => l.apartment_id === m.apartment_id));
			res = res.filter((p) => p.meter_id && account_meters.find(b => b.id === p.meter_id));
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

	$: if (searchTerm || filterMeter) currentPage = 1;
</script>

{#if mode === 'list'}
	{#if loading}
		<div>Loading...</div>
	{:else}
		<div class="card shadow-2">
			<div class="card-header bg-body-tertiary border-bottom p-3">
				<div class="row g-3 align-items-center">
					<div class="col-md-4">
						<input class="form-control" placeholder={t('Search meter_readings...')} bind:value={searchTerm} />
					</div>
					<div class="col-md-2">
						<select class="form-select form-select-sm me-3" bind:value={filterMeter}>
						<option value="all">{t('All')+' '+t('Meters')}</option>
						{#each meters as meter}
							<option value={meter.id}>{t("Meter")}: {meter.meter_number}</option>
						{/each}
						</select>
					</div>
					<div class="col-md-4 text-end">
						<select class="form-select form-select-sm d-inline-block w-auto" bind:value={itemsPerPage}>
							<option value={5}>5 {t('per page')}</option>
							<option value={10}>10 {t('per page')}</option>
							<option value={20}>20 {t('per page')}</option>
						</select>
					</div>
					<div class="col-md-2">
						<button class="btn btn-primary w-100"                 on:click={()=>{meter_readingModalRef?.openMeterReadingModal()}}><i class="bi bi-plus-circle me-2"></i>{t('New Meter Reading')}</button>
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
								<th class="text-center cursor-pointer" on:click={() => setSort('meter_id')}>{t('Meter')}{#if sortColumn === 'meter_id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th><th class="text-center cursor-pointer" on:click={() => setSort('previous_reading')}>{t('Previous Reading')}{#if sortColumn === 'previous_reading'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  
								<th class="text-center cursor-pointer" on:click={() => setSort('current_reading')}>{t('Current Reading')}{#if sortColumn === 'current_reading'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('consumption')}>{t('Consumption')}{#if sortColumn === 'consumption'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('reading_date')}>{t('Reading Date')}{#if sortColumn === 'reading_date'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('rate_per_unit')}>{t('Rate Per Unit')}{#if sortColumn === 'rate_per_unit'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('calculated_amount')}>{t('Calculated Amount')}{#if sortColumn === 'calculated_amount'}<i
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
                                    <td class="text-center">{meters.find(b => b.id === w.meter_id)?.meter_number || ''}</td>
                                    <td class="text-center">{w.previous_reading}</td>
                                    <td class="text-center">{w.current_reading}</td>
                                    <td class="text-center">{w.consumption}</td>
                                    <td class="text-center">{w.reading_date}</td>
                                    <td class="text-center">{Number(w.rate_per_unit || 0).toLocaleString(undefined,{maximumFractionDigits: 3})} {t(w.currency)}</td>
                                    <td class="text-center">{Number(w.calculated_amount || 0).toLocaleString(undefined,{maximumFractionDigits: 3})} {t(w.currency)}</td>
									<td class="text-center" dir='ltr'>{w.created_at ? new Date(w.created_at).toLocaleString() : ''}</td>
									<td class="text-center">
										
                                          <button class="btn btn-sm btn-outline-secondary me-1" on:click={() =>
                                                        meter_readingModalRef?.editMeterReading(
                                                            w,
                                                        )}
                                                >
                                                    <i class="bi bi-pencil"></i>
											</button>

										<button
											on:click={() => {
											selectedA4MeterReading = w;
											showA4Receipt = true;
											}}
											class="btn btn-outline-primary btn-sm me-2 px-2">
											<i class="bi bi-printer"></i>
										</button>
									</td>
								</tr>
							{/each}
							{#if filtered.length === 0}
								<tr><td colspan="12" class="text-center text-muted p-4">{t('No meter_readings found.')}</td></tr>
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


<MeterReadingModal bind:this={meter_readingModalRef} on:saved={load} />

{#if showA4Receipt}
  <MeterReadingA4ReceiptModal meter_reading={selectedA4MeterReading} on:close={() => (showA4Receipt = false)} />
{/if}
<style>
	.cursor-pointer { cursor: pointer; }
	.pagination-circle .page-link { border-radius: 50% !important; margin-left: 3px; margin-right: 3px; border: none; }
</style>
