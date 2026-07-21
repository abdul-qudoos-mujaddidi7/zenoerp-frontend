<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, createEventDispatcher,tick } from 'svelte';

  import { t, lang, translate_org_type,shortID } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  // meters: "++id,name,address,description,status",

  let meters = [];
  let loading = true;
  let metersModal;


  import { showDate, setDatePickers } from '../../calendar.js';

  import { toast } from '../../ToastUI/toast.js';
  

  let meterProducts = [];

  let units = [];
  let products = [];
  let productCategories = [];

  let currencies = [];


  // Form fields
  let apartment_id = '';
  let meter_number = '';


  // utility_meters: 'id, apartment_id, meter_number, utility_type, initial_reading, current_reading, installation_date, description, status, version, created_at ,updated_at, last_synced_at',
  let now = new Date().toISOString().slice(0, 10);
  let installation_date = now;
  let utility_type = '';
  let initial_reading = '';
  let current_reading = '';

  let description = '';
  let status = 1;
  let selectedMeterId = null;
  // Track editing
  let editingId = null;
  let apartments = [];
  let buildings = [];
  let floors = [];
  let accounts = [];

  
  function handleDateChange(inputName, value) {
    if (inputName === 'installation_date') installation_date = value;
  }

  async function loadBuildings() {
    buildings = await db.buildings.orderBy('created_at').reverse().toArray();
    buildings = buildings.filter((w) => w.status === 1);
  }
  async function loadFloors() {
    floors = await db.floors.orderBy('created_at').reverse().toArray();
    floors = floors.filter((w) => w.status === 1);
  }

  async function loadApartments() {
    apartments = await db.apartments.orderBy('created_at').reverse().toArray();
    apartments = apartments.filter((w) => w.status === 1);
  }


  
  let componentRoot;

  onMount(async () => {
    const modalEl = document.getElementById('createMeterModal');
    if (window.mdb) {
      metersModal = new window.mdb.Modal(modalEl);
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
    loadApartments();
    loadBuildings();
    loadFloors();
    
    setDatePickers(handleDateChange, componentRoot);
  });

  export function openMeterModal() {
    loadApartments();
    // Reset form for Add
    editingId = null;
    meter_number = '';
    apartment_id = '';

    installation_date = now;
    utility_type = '';
    initial_reading = '';
    current_reading = '';

    
    description = '';
    status = 1;
    metersModal.show();
  }

  // Open modal to edit existing meter
  export function editMeter(meter) {
    loadApartments();
    editingId = meter.id;
    description = meter.description || '';
    meter_number = meter.meter_number || '';
    apartment_id = meter.apartment_id || '';
    status = meter.status;
    installation_date = meter.installation_date;
    utility_type = meter.utility_type;
    initial_reading = meter.initial_reading;
    current_reading = meter.current_reading;
    metersModal.show();
  }

  async function saveMeter() {
    if (!apartment_id) {
      toast.error(t('Error'), 'Apartment is required.');
      return;
    }
    if (!meter_number) {
      toast.error(t('Error'), 'meter_number is required.');
      return;
    }

    try {
      let newId = Number(editingId);
      if (editingId) {
        let oldMeter = meters.find((w) => w.id === Number(editingId));
        // Update existing meter
        await db.utility_meters.update(Number(editingId), {
          meter_number: meter_number || "",
          apartment_id: apartment_id || 0,
          description: (description || '').trim(),
          status: parseInt(status) || 1,
          installation_date: installation_date,
          utility_type: utility_type || '',
          initial_reading: parseFloat(initial_reading) || 0,
          current_reading: parseFloat(current_reading) || 0,
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'update',
          table_name: 'utility_meters',
          entity_id: Number(editingId),
          old_values: JSON.stringify(oldMeter),
          new_values: JSON.stringify({
            meter_number: meter_number || "",
            apartment_id: apartment_id || 0,
            description: (description || '').trim(),
            status: parseInt(status) || 1,
            installation_date: installation_date,
            utility_type: utility_type || '',
            initial_reading: parseFloat(initial_reading) || 0,
            current_reading: parseFloat(current_reading) || 0,
          }),
          description: `Updated meter ${name}`,
        });
      } else {
        // Add new meter
        newId = await db.utility_meters.add({
          meter_number: meter_number || "",
          apartment_id: apartment_id || 0,
          description: (description || '').trim(),
          status: parseInt(status) || 1,
          installation_date: installation_date,
          utility_type: utility_type || '',
          initial_reading: parseFloat(initial_reading) || 0,
          current_reading: parseFloat(current_reading) || 0,
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'create',
          table_name: 'utility_meters',
          entity_id: newId,
          old_values: null,
          new_values: JSON.stringify({
            meter_number,
            apartment_id,
            description,
            status,
            installation_date,
            utility_type,
            initial_reading,
            current_reading,
          }),
          description: `Created meter ${name}`,
        });
      }
      dispatch('saved', {
        id: newId,
        meter_number: meter_number || "",
        apartment_id: apartment_id,
        description: description.trim(),
        status: parseInt(status) || 1,
        installation_date: installation_date,
        utility_type: utility_type || '',
        initial_reading: parseFloat(initial_reading) || 0,
        current_reading: parseFloat(current_reading) || 0,
      });
      toast.success(
        t('Success'),
        editingId ? t('Meter updated successfully.') : t('Meter created successfully.'),
      );
      metersModal.hide();
    } catch (err) {
      console.error('Failed to save meter:', err);
      toast.error(t('Error'), t('Error saving meter: ') + err.message);
    }
  }

  async function deleteMeter(id) {
    if (confirm('Delete this meter?')) {
      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'delete',
        table_name: 'utility_meters',
        entity_id: id,
        old_values: JSON.stringify(meters.find((w) => w.id === id)),
        new_values: null,
        description: `Deleted meter #${id}`,
      });
      await db.utility_meters.update(id, { status: 0 });
    }
  }

</script>

<div class="modal fade" id="createMeterModal" tabindex="-1" aria-hidden="true" bind:this={componentRoot}>
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-plus-circle"></i>
          {editingId ? t('Update Meter') : t('New Meter')}
        </h5>
        <button type="button" class="btn-close" data-mdb-dismiss="modal"></button>
      </div>

      <div class="modal-body">
        <div class="row">
          <div class="col-md-12 mb-4">
            <select
              class="form-select"
              id="c-meter-type"
              bind:value={apartment_id}>
              <option value="" disabled>{t('Select') + ' ' + t('Apartment')}</option>
              {#each apartments as apartment}
                <option value={apartment.id}>{t("Apartment")}: {apartment.unit_number} - {t("Floor")}: {floors.find((f) => f.id === apartment.floor_id)?.floor_number || ''} - {t("Building")}: {buildings.find((b) => b.id === apartment.building_id)?.name || ''} ({buildings.find((b) => b.id === apartment.building_id)?.code || ''})</option>
              {/each}
            </select>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="text" id="c-total-meters" class="form-control" bind:value={meter_number} />
              <label class="form-label" for="c-total-meters">{t('Meter Number')}</label>
            </div>
          </div>


          <div class="col-md-6 mb-4">
            <div class="input-group input-group-sm persianDatePicker">
            
              <div class="form-outline" data-mdb-input-init>
                <input type="date" id="c-installation_date" class="form-control form-control-sm" data-bind="installation_date" bind:value={installation_date} />
                <label class="form-label" for="c-installation_date">{t('Installation Date')}</label>
              </div>
              <span class="input-group-text persian-date-text"></span>
            </div>
          </div>


          <div class="col-md-6 mb-4">
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                <input type="number" id="c-initial_reading" class="form-control" bind:value={initial_reading} />
                <label class="form-label" for="c-initial_reading">{t('Initial Reading')}</label>
              </div>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                <input type="number" id="c-current_reading" class="form-control" bind:value={current_reading} />
                <label class="form-label" for="c-current_reading">{t('Current Reading')}</label>
              </div>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="text" id="c-utility_type" class="form-control" bind:value={utility_type} />
              <label class="form-label" for="c-utility_type">{t('Utility Type')}</label>
            </div>
          </div>


          <div class="col-md-12 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <textarea id="c-description" class="form-control" bind:value={description}></textarea>
              <label class="form-label" for="c-description">{t('Description')}</label>
            </div>
          </div>

        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-link text-dark" data-mdb-dismiss="modal">{t('Close')}</button>
        <button type="button" class="btn btn-primary" on:click={saveMeter}>
          {editingId ? t('Update Meter') : t('Save Meter')}
        </button>
      </div>
    </div>
  </div>
</div>