<script>
  import { db, logActivity } from '../../db.js';

  import { onMount, createEventDispatcher } from 'svelte';

  import { t, lang, translate_org_type } from '../../i18n/i18n.js';

  $: _lang = $lang;

  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  let apartments = [];

  let loading = true;

  let apartmentsModal;

  import { toast } from '../../ToastUI/toast.js';

  let apartmentProducts = [];

  let units = [];

  let products = [];

  let productCategories = [];

  let currencies = [];

  let building_id = '';

  let floor_id = '';

  let unit_number = '';

  let area_sqm = '';

  let bedrooms = '';

  let bathrooms = '';

  let unit_type = '';

  let rent_amount = '';

  let sale_price = '';

  let defaultCurrency = 'AFN';

  let currency = 'AFN';

  let occupancy_status = '';

  let description = '';

  let status = 1;

  let selectedApartmentId = null;
  
  let editingId = null;

  let buildings = [];

  let floors = [];

  async function loadBuildings() {
    buildings = await db.buildings.orderBy('created_at').reverse().toArray();
    buildings = buildings.filter((w) => w.status === 1);
  }

  async function loadFloors() {
    floors = await db.floors.orderBy('created_at').reverse().toArray();
    floors = floors.filter((w) => w.status === 1);
  }
  onMount(async () => {
    currencies = await db.currencies.where('status').equals(1).toArray();
defaultCurrency = currencies.find((c) => c.isDefault == 1)?.code || 'AFN';
    currency = defaultCurrency;
    const modalEl = document.getElementById('createApartmentModal');
    if (window.mdb) {
      apartmentsModal = new window.mdb.Modal(modalEl);
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
    loadBuildings();
    loadFloors();
  });

  export function openApartmentModal() {
    loadBuildings();
    loadFloors();
    editingId = null;
    unit_number = '';
    area_sqm = '';
    building_id = '';
    bedrooms = '';
    bathrooms = '';
    unit_type = '';
    rent_amount = '';
    sale_price = '';
    currency = defaultCurrency;
    occupancy_status = '';
    floor_id = '';
    description = '';
    status = 1;
    apartmentsModal.show();
  }

  // Open modal to edit existing apartment
  export function editApartment(apartment) {
    loadBuildings();
    loadFloors();
    editingId = apartment.id;
    description = apartment.description || '';
    unit_number = apartment.unit_number || '';
    area_sqm = apartment.area_sqm || '';
    building_id = apartment.building_id || '';
    floor_id = apartment.floor_id || '';
    status = apartment.status;
    bedrooms = apartment.bedrooms;
    bathrooms = apartment.bathrooms;
    unit_type = apartment.unit_type;
    rent_amount = apartment.rent_amount;
    sale_price = apartment.sale_price;
    currency = apartment.currency;
    occupancy_status = apartment.occupancy_status;
    apartmentsModal.show();
  }

  async function saveApartment() {
    if (!building_id) {
      toast.error(t('Error'), 'Building is required.');
      return;
    }
    if (!floor_id) {
      toast.error(t('Error'), 'Floor is required.');
      return;
    }
    if (!unit_number) {
      toast.error(t('Error'), 'unit_number is required.');
      return;
    }

    if (!area_sqm) {
      toast.error(t('Error'), 'area_sqm is required.');
      return;
    }
    try {
      let newId = Number(editingId);
      if (editingId) {
        let oldApartment = apartments.find((w) => w.id === Number(editingId));
        // Update existing apartment
        await db.apartments.update(Number(editingId), {
          unit_number: parseInt(unit_number) || 0,
          area_sqm: parseInt(area_sqm) || 0,
          building_id: building_id || 0,
          floor_id: floor_id || 0,
          description: (description || '').trim(),
          status: parseInt(status) || 1,
          bedrooms: parseInt(bedrooms) || 0,
          bathrooms: parseInt(bathrooms) || 0,
          unit_type: unit_type || '',
          rent_amount: parseFloat(rent_amount) || 0,
          sale_price: parseFloat(sale_price) || 0,
          currency: currency || '',
          occupancy_status: occupancy_status || '',
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'update',
          table_name: 'apartments',
          entity_id: Number(editingId),
          old_values: JSON.stringify(oldApartment),
          new_values: JSON.stringify({
            unit_number: parseInt(unit_number) || 0,
            area_sqm: parseInt(area_sqm) || 0,
            building_id: building_id || 0,
            floor_id: floor_id || 0,
            description: (description || '').trim(),
            status: parseInt(status) || 1,
            bedrooms: parseInt(bedrooms) || 0,
            bathrooms: parseInt(bathrooms) || 0,
            unit_type: unit_type || '',
            rent_amount: parseFloat(rent_amount) || 0,
            sale_price: parseFloat(sale_price) || 0,
            currency: currency || '',
            occupancy_status: occupancy_status || '',
          }),
          description: `Updated apartment ${name}`,
        });
      } else {
        // Add new apartment
        newId = await db.apartments.add({
          unit_number: parseInt(unit_number) || 0,
          area_sqm: parseInt(area_sqm) || 0,
          building_id: building_id || 0,
          floor_id: floor_id || 0,
          description: (description || '').trim(),
          status: parseInt(status) || 1,
          bedrooms: parseInt(bedrooms) || 0,
          bathrooms: parseInt(bathrooms) || 0,
          unit_type: unit_type || '',
          rent_amount: parseFloat(rent_amount) || 0,
          sale_price: parseFloat(sale_price) || 0,
          currency: currency || '',
          occupancy_status: occupancy_status || '',
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'create',
          table_name: 'apartments',
          entity_id: newId,
          old_values: null,
          new_values: JSON.stringify({
            unit_number,
            area_sqm,
            building_id,
            floor_id,
            description,
            status,
            bedrooms,
            bathrooms,
            unit_type,
            rent_amount,
            sale_price,
            currency,
            occupancy_status,
          }),
          description: `Created apartment ${name}`,
        });
      }
      dispatch('saved', {
        id: newId,
        unit_number: parseInt(unit_number) || 0,
        area_sqm: parseInt(area_sqm) || 0,
        building_id: building_id,
        floor_id: floor_id,
        description: description.trim(),
        status: parseInt(status) || 1,
        bedrooms: parseInt(bedrooms) || 0,
        bathrooms: parseInt(bathrooms) || 0,
        unit_type: unit_type || '',
        rent_amount: parseFloat(rent_amount) || 0,
        sale_price: parseFloat(sale_price) || 0,
        currency: currency || '',
        occupancy_status: occupancy_status || '',
      });
      toast.success(
        t('Success'),
        editingId ? t('Apartment updated successfully.') : t('Apartment created successfully.'),
      );
      apartmentsModal.hide();
    } catch (err) {
      console.error('Failed to save apartment:', err);
      toast.error(t('Error'), t('Error saving apartment: ') + err.message);
    }
  }

  async function deleteApartment(id) {
    if (confirm('Delete this apartment?')) {
      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'delete',
        table_name: 'apartments',
        entity_id: id,
        old_values: JSON.stringify(apartments.find((w) => w.id === id)),
        new_values: null,
        description: `Deleted apartment #${id}`,
      });
      await db.apartments.update(id, { status: 0 });
    }
  }
</script>

<div class="modal fade" id="createApartmentModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-plus-circle"></i>
          {editingId ? t('Update Apartment') : t('New Apartment')}
        </h5>
        <button type="button" class="btn-close" data-mdb-dismiss="modal"></button>
      </div>

      <div class="modal-body">
        <div class="row">
          <div class="col-md-{building_id?6:12} mb-4">
            <select
              class="form-select"
              id="c-apartment-type"
              bind:value={building_id}
              on:change={() => {
                floor_id = '';
              }}>
              <option value="" disabled>{t('Select') + ' ' + t('Building')}</option>
              {#each buildings as building}
                <option value={building.id}>{building.name} ({building.code})</option>
              {/each}
            </select>
          </div>

            {#if building_id}
          <div class="col-md-6 mb-4">
              <select class="form-select" id="c-apartment-type" bind:value={floor_id}>
                <option value="" disabled>{t('Select') + ' ' + t('Floor')}</option>
                {#each floors as floor}
                  {#if floor.building_id == building_id}
                    <option value={floor.id}>{floor.floor_number}</option>
                  {/if}
                {/each}
              </select>
          </div>
            {/if}

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-total-apartments" class="form-control" bind:value={unit_number} />
              <label class="form-label" for="c-total-apartments">{t('Unit Number')}</label>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-area" class="form-control" bind:value={area_sqm} />
              <label class="form-label" for="c-area">{t('Area (sqm)')}</label>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-bedrooms" class="form-control" bind:value={bedrooms} />
              <label class="form-label" for="c-bedrooms">{t('Bedrooms')}</label>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-bathrooms" class="form-control" bind:value={bathrooms} />
              <label class="form-label" for="c-bathrooms">{t('Bathrooms')}</label>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                <input type="number" id="c-rent_amount" class="form-control" bind:value={rent_amount} />
                <label class="form-label" for="c-rent_amount">{t('Rent Amount')}</label>
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
                <input type="number" id="c-sale_price" class="form-control" bind:value={sale_price} />
                <label class="form-label" for="c-sale_price">{t('Sale Price')}</label>
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
            <div class="form-outline" data-mdb-input-init>
              <input type="text" id="c-unit_type" class="form-control" bind:value={unit_type} />
              <label class="form-label" for="c-unit_type">{t('Unit Type')}</label>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="text" id="c-occupancy_status" class="form-control" bind:value={occupancy_status} />
              <label class="form-label" for="c-occupancy_status">{t('Occupancy Status')}</label>
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
        <button type="button" class="btn btn-primary" on:click={saveApartment}>
          {editingId ? t('Update Apartment') : t('Save Apartment')}
        </button>
      </div>
    </div>
  </div>
</div>
