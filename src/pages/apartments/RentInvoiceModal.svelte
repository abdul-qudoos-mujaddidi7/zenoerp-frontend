<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, createEventDispatcher } from 'svelte';

  import { t, lang, translate_org_type,shortID } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();
  import { showDate, setDatePickers } from '../../calendar.js';

  // rent_invoices: "++id,name,address,description,status",

  let rent_invoices = [];
  let loading = true;
  let rent_invoicesModal;

  import { toast } from '../../ToastUI/toast.js';

  let rent_invoiceProducts = [];

  let units = [];
  let products = [];
  let productCategories = [];

  let currencies = [];

  let componentRoot = null;

  // Form fields
  let lease_id = '';
  let invoice_number = '';

  


  function handleDateChange(inputName, value) {
    if (inputName === 'issue_date') issue_date = value;
    if (inputName === 'due_date') due_date = value;
    if (inputName === 'billing_period_start') billing_period_start = value;
    if (inputName === 'billing_period_end') billing_period_end = value;
  }



// rent_invoices: 'id, lease_id, invoice_number, issue_date, due_date, billing_period_start, billing_period_end,base_rent,late_fee,utility_charges,other_charges,total_amount,paid_amount,currency, invoice_status, description, status, version, created_at ,updated_at, last_synced_at',
  let now = new Date().toISOString().slice(0, 10);

  let issue_date = now;
  let due_date = now;
  
  let billing_period_start = now;
  let billing_period_end = now;
  let total_amount = '';
  let invoice_status = '';
  let base_rent = '';
  let utility_charges = '';
  let defaultCurrency = 'AFN';
  let currency = 'AFN';
  let late_fee = '';


  $: total_amount = (parseFloat(base_rent) || 0) + (parseFloat(utility_charges) || 0) + (parseFloat(late_fee) || 0) + (parseFloat(other_charges) || 0);

  
  let other_charges = '';
  let paid_amount = '';

  let description = '';
  let status = 1;
  let selectedRentInvoiceId = null;
  // Track editing
  let editingId = null;
  let leases = [];
  let apartments = [];
  let floors = [];
  let buildings = [];
  let accounts = [];

  async function loadApartments() {
    apartments = await db.apartments.orderBy('created_at').reverse().toArray();
    apartments = apartments.filter((w) => w.status === 1);
    floors = await db.floors.orderBy('created_at').reverse().toArray();
    floors = floors.filter((w) => w.status === 1);
    buildings = await db.buildings.orderBy('created_at').reverse().toArray();
    buildings = buildings.filter((w) => w.status === 1);
  }

  async function loadLeases() {
    leases = await db.leases.orderBy('created_at').reverse().toArray();
    leases = leases.filter((w) => w.status === 1);
  }

  async function loadAccounts() {
    accounts = await db.accounts.orderBy('created_at').reverse().toArray();
    accounts = accounts.filter((w) => w.status === 1 && w.account_type_id == 4);
  }
  onMount(async () => {
    currencies = await db.currencies.where('status').equals(1).toArray();
defaultCurrency = currencies.find((c) => c.isDefault == 1)?.code || 'AFN';
    currency = defaultCurrency;
    const modalEl = document.getElementById('createRentInvoiceModal');
    if (window.mdb) {
      rent_invoicesModal = new window.mdb.Modal(modalEl);
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
    loadLeases();
    loadApartments();
    loadAccounts();
    setDatePickers(handleDateChange, componentRoot);
  });

  export function openRentInvoiceModal() {
    loadLeases();
    loadAccounts();
    // Reset form for Add
    editingId = null;
    invoice_number = '';
    lease_id = '';

    
    billing_period_start = now;
    billing_period_end = now;
    total_amount = '';

    issue_date = now;
    due_date = now;
    invoice_status = '';
    base_rent = '';
    utility_charges = '';
    currency = defaultCurrency;
    late_fee = '';

    
    other_charges = '';
    paid_amount = '';
    description = '';
    status = 1;
    rent_invoicesModal.show();
  }

  // Open modal to edit existing rent_invoice
  export function editRentInvoice(rent_invoice) {
    loadLeases();
    loadAccounts();
    editingId = rent_invoice.id;
    description = rent_invoice.description || '';
    invoice_number = rent_invoice.invoice_number || '';
    lease_id = rent_invoice.lease_id || '';
    status = rent_invoice.status;
    issue_date = rent_invoice.issue_date;
    due_date = rent_invoice.due_date;
    invoice_status = rent_invoice.invoice_status;
    base_rent = rent_invoice.base_rent;
    utility_charges = rent_invoice.utility_charges;
    currency = rent_invoice.currency;
    late_fee = rent_invoice.late_fee;
    other_charges = rent_invoice.other_charges || '';
    paid_amount = rent_invoice.paid_amount || '';
    
    
    billing_period_start = rent_invoice.billing_period_start;
    billing_period_end = rent_invoice.billing_period_end;
    total_amount = rent_invoice.total_amount;
    rent_invoicesModal.show();
  }

  async function saveRentInvoice() {
    if (!lease_id) {
      toast.error(t('Error'), 'Lease is required.');
      return;
    }
    if (!invoice_number) {
      toast.error(t('Error'), 'invoice_number is required.');
      return;
    }

    try {
      let newId = Number(editingId);
      if (editingId) {
        let oldRentInvoice = rent_invoices.find((w) => w.id === Number(editingId));
        // Update existing rent_invoice
        await db.rent_invoices.update(Number(editingId), {
          invoice_number: invoice_number || "",
          lease_id: lease_id || 0,
          description: (description || '').trim(),
          status: parseInt(status) || 1,
          issue_date: issue_date,
          due_date: due_date,
          billing_period_start:billing_period_start,
          billing_period_end:billing_period_end,
          total_amount:parseFloat(total_amount) || 0,
          invoice_status: invoice_status || '',
          base_rent: parseFloat(base_rent) || 0,
          utility_charges: parseFloat(utility_charges) || 0,
          other_charges:parseFloat(other_charges) || 0,
          paid_amount:parseFloat(paid_amount) || 0,
          currency: currency || '',
          late_fee: parseFloat(late_fee) || 0,
        });



        const receivableAccount = await db.accounts.where('code').equals('RECEIVABLE').first();

        if (!receivableAccount) {
          throw new Error('RECEIVABLE account not found');
        }

        const customerAccount = leases.find((l) => l.id === lease_id)?.tenant_account_id;

        let oldJournal = await db.journals.where({ reference_id: Number(editingId), reference_type: 'rent_invoice' }).first();
        if (oldJournal) {
          await db.journals.update(oldJournal.id, {
            date: issue_date,
            description: description || `rent_invoice Invoice #${parseInt(invoice_number)}`,
            currency: currency || '',
            first_entry_account: customerAccount, // Customer (Debit)
            first_entry_debit: parseFloat(total_amount) || 0,
            first_entry_credit: 0,
            second_entry_account: receivableAccount.id, // Warehouse/Revenue (Credit)
            second_entry_debit: 0,
            second_entry_credit: parseFloat(total_amount) || 0,
            status: 1,
          });
        }
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'update',
          table_name: 'rent_invoices',
          entity_id: Number(editingId),
          old_values: JSON.stringify(oldRentInvoice),
          new_values: JSON.stringify({
            invoice_number: parseInt(invoice_number) || 0,
            lease_id: lease_id || 0,
            description: (description || '').trim(),
            status: parseInt(status) || 1,
            issue_date: issue_date,
            due_date: due_date,
            
          billing_period_start:billing_period_start,
          billing_period_end:billing_period_end,
          total_amount:parseFloat(total_amount) || 0,
            invoice_status: invoice_status || '',
            base_rent: parseFloat(base_rent) || 0,
            utility_charges: parseFloat(utility_charges) || 0,
          other_charges:parseFloat(other_charges) || 0,
          paid_amount:parseFloat(paid_amount) || 0,
            currency: currency || '',
            late_fee: parseFloat(late_fee) || 0,
          }),
          description: `Updated rent_invoice ${name}`,
        });
      } else {
        // Add new rent_invoice
        newId = await db.rent_invoices.add({
          invoice_number: invoice_number || "",
          lease_id: lease_id || 0,
          description: (description || '').trim(),
          status: parseInt(status) || 1,
          issue_date: issue_date,
          due_date: due_date,
          
          billing_period_start:billing_period_start,
          billing_period_end:billing_period_end,
          total_amount:parseFloat(total_amount) || 0,
          invoice_status: invoice_status || '',
          base_rent: parseFloat(base_rent) || 0,
          utility_charges: parseFloat(utility_charges) || 0,
          other_charges:parseFloat(other_charges) || 0,
          paid_amount:parseFloat(paid_amount) || 0,
          currency: currency || '',
          late_fee: parseFloat(late_fee) || 0,
        });

        const receivableAccount = await db.accounts.where('code').equals('RECEIVABLE').first();

        if (!receivableAccount) {
          throw new Error('RECEIVABLE account not found');
        }

        const customerAccount = leases.find((l) => l.id === lease_id)?.tenant_account_id;

        await db.journals.add({
          date: issue_date,
          reference_id: newId,
          reference_type: 'rent_invoice',
          description: description || `rent_invoice Invoice #${parseInt(invoice_number)}`,
          currency: currency || '',
          first_entry_account: customerAccount, // Customer (Debit)
          first_entry_debit: parseFloat(total_amount) || 0,
          first_entry_credit: 0,
          second_entry_account: receivableAccount.id, // Warehouse/Revenue (Credit)
          second_entry_debit: 0,
          second_entry_credit: parseFloat(total_amount) || 0,
          status: 1,
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'create',
          table_name: 'rent_invoices',
          entity_id: newId,
          old_values: null,
          new_values: JSON.stringify({
            invoice_number,
            lease_id,
            description,
            status,
            issue_date,
            due_date,
            billing_period_start:billing_period_start,
            billing_period_end:billing_period_end,
            total_amount:parseFloat(total_amount) || 0,
            invoice_status,
            base_rent,
            utility_charges,
            currency,
          other_charges:other_charges,
          paid_amount:paid_amount,
            late_fee,
          }),
          description: `Created rent_invoice ${name}`,
        });
      }
      dispatch('saved', {
        id: newId,
        invoice_number: invoice_number || "",
        lease_id: lease_id,
        description: description.trim(),
        status: parseInt(status) || 1,
        issue_date: issue_date,
        due_date: due_date,
        billing_period_start:billing_period_start,
        billing_period_end:billing_period_end,
        total_amount:parseFloat(total_amount) || 0,
        invoice_status: invoice_status || '',
        base_rent: parseFloat(base_rent) || 0,
        utility_charges: parseFloat(utility_charges) || 0,
          other_charges:parseFloat(other_charges) || 0,
          paid_amount:parseFloat(paid_amount) || 0,
        currency: currency || '',
        late_fee: parseFloat(late_fee) || 0,
      });
      toast.success(
        t('Success'),
        editingId ? t('Rent Invoice updated successfully.') : t('Rent Invoice created successfully.'),
      );
      rent_invoicesModal.hide();
    } catch (err) {
      console.error('Failed to save rent_invoice:', err);
      toast.error(t('Error'), t('Error saving rent_invoice: ') + err.message);
    }
  }

  async function deleteRentInvoice(id) {
    if (confirm('Delete this rent_invoice?')) {
      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'delete',
        table_name: 'rent_invoices',
        entity_id: id,
        old_values: JSON.stringify(rent_invoices.find((w) => w.id === id)),
        new_values: null,
        description: `Deleted rent_invoice #${id}`,
      });
      await db.rent_invoices.update(id, { status: 0 });
    }
  }

  $: if (lease_id) {
    base_rent = leases.find((l) => l.id === lease_id)?.monthly_rent || 0;
    if (window.mdb) {
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
  }
</script>

<div class="modal fade" id="createRentInvoiceModal" tabindex="-1" aria-hidden="true" bind:this={componentRoot}>
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-plus-circle"></i>
          {editingId ? t('Update Rent Invoice') : t('New Rent Invoice')}
        </h5>
        <button type="button" class="btn-close" data-mdb-dismiss="modal"></button>
      </div>

      <div class="modal-body">
        <div class="row">
          <div class="col-md-12 mb-4">
            <select
              class="form-select"
              id="c-rent_invoice-type"
              bind:value={lease_id}>
              <option value="" disabled>{t('Select') + ' ' + t('Lease')}</option>
              {#each leases as lease}
                <option value={lease.id}>{t('Lease')} {lease.lease_number} - {t('Apartment')}: {apartments.find((b) => b.id === lease.apartment_id)?.unit_number || ''} - {t('Floor')}: {floors.find((b) => b.id === apartments.find((a) => a.id === lease.apartment_id)?.floor_id)?.floor_number || 0} - {t('Building')}: {buildings.find((b) => b.id === apartments.find((a) => a.id === lease.apartment_id)?.building_id)?.name || ''}</option>
              {/each}
            </select>
          </div>


          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-invoice_number" class="form-control" bind:value={invoice_number} />
              <label class="form-label" for="c-invoice_number">{t('Rent Invoice Number')}</label>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="text" id="c-invoice_status" class="form-control" bind:value={invoice_status} />
              <label class="form-label" for="c-invoice_status">{t('Invoice Status')}</label>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="input-group input-group-sm persianDatePicker">
            
              <div class="form-outline" data-mdb-input-init>
                <input type="date" id="c-issue_date" class="form-control form-control-sm" data-bind="issue_date" bind:value={issue_date} />
                <label class="form-label" for="c-issue_date">{t('Issue Date')}</label>
              </div>
              <span class="input-group-text persian-date-text"></span>
            </div>
          </div>

          
          <div class="col-md-6 mb-4">
            <div class="input-group input-group-sm persianDatePicker">
            
              <div class="form-outline" data-mdb-input-init>
                <input type="date" id="c-due_date" class="form-control form-control-sm" data-bind="due_date" bind:value={due_date} />
                <label class="form-label" for="c-due_date">{t('Due Date')}</label>
              </div>
              <span class="input-group-text persian-date-text"></span>
            </div>
          </div>


          

          <div class="col-md-6 mb-4">
            <div class="input-group input-group-sm persianDatePicker">
              <div class="form-outline" data-mdb-input-init>
                <input type="date" id="c-billing_period_start" class="form-control form-control-sm" data-bind="billing_period_start" bind:value={billing_period_start} />
                <label class="form-label" for="c-billing_period_start">{t('Billing Period Start')}</label>
              </div>
              <span class="input-group-text persian-date-text"></span>
            </div>
          </div>


          
          <div class="col-md-6 mb-4">
            <div class="input-group input-group-sm persianDatePicker">
              <div class="form-outline" data-mdb-input-init>
                <input type="date" id="c-billing_period_end" class="form-control form-control-sm" data-bind="billing_period_end" bind:value={billing_period_end} />
                <label class="form-label" for="c-billing_period_end">{t('Billing Period End')}</label>
              </div>
              <span class="input-group-text persian-date-text"></span>
            </div>
          </div>


          

          <div class="col-md-6 mb-4">
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                <input type="number" id="c-base_rent" class="form-control" bind:value={base_rent} />
                <label class="form-label" for="c-base_rent">{t('Base Rent')}</label>
              </div>

              <button
                id="showCurrencyDropdown"
                class="btn btn-secondary dropdown-toggle btn-sm pt-1"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {currency ? t(currency) : ''}
              </button>

              <ul class="dropdown-menu dropdown-menu-end">
                {#each currencies as cur}
                  <li>
                    <button
                      class="dropdown-item"
                      style={currency == cur.code
                        ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                        : ''}
                      on:click={() => {
                        currency = cur.code;
                      }}
                      type="button">
                      {t(cur.code)}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                <input type="number" id="c-late_fee" class="form-control" bind:value={late_fee} />
                <label class="form-label" for="c-late_fee">{t('Late Fee')}</label>
              </div>

              
              <button
                id="showCurrencyDropdown"
                class="btn btn-secondary dropdown-toggle btn-sm pt-1"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {currency ? t(currency) : ''}
              </button>

              <ul class="dropdown-menu dropdown-menu-end">
                {#each currencies as cur}
                  <li>
                    <button
                      class="dropdown-item"
                      style={currency == cur.code
                        ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                        : ''}
                      on:click={() => {
                        currency = cur.code;
                      }}
                      type="button">
                      {t(cur.code)}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          </div>
          <div class="col-md-6 mb-4">
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                <input type="number" id="c-utility_charges" class="form-control" bind:value={utility_charges} />
                <label class="form-label" for="c-utility_charges">{t('Utility Charges')}</label>
              </div>

              
              <button
                id="showCurrencyDropdown"
                class="btn btn-secondary dropdown-toggle btn-sm pt-1"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {currency ? t(currency) : ''}
              </button>

              <ul class="dropdown-menu dropdown-menu-end">
                {#each currencies as cur}
                  <li>
                    <button
                      class="dropdown-item"
                      style={currency == cur.code
                        ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                        : ''}
                      on:click={() => {
                        currency = cur.code;
                      }}
                      type="button">
                      {t(cur.code)}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          </div>

          


          <div class="col-md-6 mb-4">
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                
              <input type="text" id="c-other_charges" class="form-control" bind:value={other_charges} />
              <label class="form-label" for="c-other_charges">{t('Other Charges')}</label>
              </div>

              
              <button
                id="showCurrencyDropdown"
                class="btn btn-secondary dropdown-toggle btn-sm pt-1"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {currency ? t(currency) : ''}
              </button>

              <ul class="dropdown-menu dropdown-menu-end">
                {#each currencies as cur}
                  <li>
                    <button
                      class="dropdown-item"
                      style={currency == cur.code
                        ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                        : ''}
                      on:click={() => {
                        currency = cur.code;
                      }}
                      type="button">
                      {t(cur.code)}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          </div>
          
          
          <div class="col-md-6 mb-4">
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                
              <input type="text" id="c-total_amount" class="form-control" readonly bind:value={total_amount} />
              <label class="form-label" for="c-total_amount">{t('Total Amount')}</label>
              </div>

              
              <button
                id="showCurrencyDropdown"
                class="btn btn-secondary dropdown-toggle btn-sm pt-1"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {currency ? t(currency) : ''}
              </button>

              <ul class="dropdown-menu dropdown-menu-end">
                {#each currencies as cur}
                  <li>
                    <button
                      class="dropdown-item"
                      style={currency == cur.code
                        ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                        : ''}
                      on:click={() => {
                        currency = cur.code;
                      }}
                      type="button">
                      {t(cur.code)}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          </div>
          
          
          <div class="col-md-6 mb-4 d-none">
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                
              <input type="text" id="c-paid_amount" class="form-control" bind:value={paid_amount} />
              <label class="form-label" for="c-paid_amount">{t('Paid Amount')}</label>
              </div>

              
              <button
                id="showCurrencyDropdown"
                class="btn btn-secondary dropdown-toggle btn-sm pt-1"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {currency ? t(currency) : ''}
              </button>

              <ul class="dropdown-menu dropdown-menu-end">
                {#each currencies as cur}
                  <li>
                    <button
                      class="dropdown-item"
                      style={currency == cur.code
                        ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                        : ''}
                      on:click={() => {
                        currency = cur.code;
                      }}
                      type="button">
                      {t(cur.code)}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          </div>
          
          



          <div class="col-md-12 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <textarea id="c-description" class="form-control" bind:value={description}></textarea>
              <label class="form-label" for="c-description">{t('Description')}</label>
            </div>
          </div>

          <!-- <div class="col-md-12 mb-4">
                        <div class="form-outline" data-mdb-input-init>
                            <input
                                type="number"
                                step="0.01"
                                id="c-status"
                                class="form-control"
                                bind:value={status}
                            />
                            <label class="form-label" for="c-status"
                                >{t("Status")}</label
                            >
                        </div>
                    </div> -->
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-link text-dark" data-mdb-dismiss="modal">{t('Close')}</button>
        <button type="button" class="btn btn-primary" on:click={saveRentInvoice}>
          {editingId ? t('Update Rent Invoice') : t('Save Rent Invoice')}
        </button>
      </div>
    </div>
  </div>
</div>
