<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, createEventDispatcher } from 'svelte';

  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  // floors: "++id,name,address,description,status",

  let floors = [];
  let loading = true;
  let floorsModal;

  import { toast } from '../../ToastUI/toast.js';

  let floorProducts = [];

  let units = [];
  let products = [];
  let productCategories = [];

//   floors: 'id, name, code, address,floor_number, total_units_on_floor, building_id, description, status, version, updated_at, last_synced_at',

  // Form fields
  let building_id = '';
  let floor_number = "";
  let total_units_on_floor = "";
  let description = '';
  let status = 1;
  let selectedFloorId = null;
  // Track editing
  let editingId = null;
  let buildings = [];

  async function loadBuildings() {
    buildings = await db.buildings.orderBy('created_at').reverse().toArray();
		buildings = buildings.filter(w => w.status === 1);
  }

  onMount(async () => {
    const modalEl = document.getElementById('createFloorModal');
    if (window.mdb) {
      floorsModal = new window.mdb.Modal(modalEl);
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
    }
    loadBuildings();
  });

  export function openFloorModal() {
    loadBuildings();
    // Reset form for Add
    editingId = null;
    floor_number = "";
    total_units_on_floor = "";
    building_id = '';
    description = '';
    status = 1;
    floorsModal.show();
  }

  // Open modal to edit existing floor
  export function editFloor(floor) {
    loadBuildings();
    editingId = floor.id;
    description = floor.description || '';
    floor_number = floor.floor_number || "";
    total_units_on_floor = floor.total_units_on_floor || "";
    building_id = floor.building_id || '';
    status = floor.status;
    floorsModal.show();
  }

  async function saveFloor() {
    if (!building_id) {
      toast.error(t("Error"),'Building is required.');
      return;
    }
    if (!floor_number && floor_number !== 0) {
      toast.error(t("Error"),'floor_number is required.');
      return;
    }

    if (!total_units_on_floor) {
      toast.error(t("Error"),'total_units_on_floor is required.');
      return;
    }
    try {
      let newId = Number(editingId);
      if (editingId) {
        let oldFloor = floors.find((w) => w.id === Number(editingId));
        // Update existing floor
        await db.floors.update(Number(editingId), {
          floor_number: parseInt(floor_number) || 0,
          total_units_on_floor: parseInt(total_units_on_floor) || 0,
          building_id: building_id || 0,
          description: (description || '').trim(),
          status: parseInt(status) || 1,
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'update',
          table_name: 'floors',
          entity_id: Number(editingId),
          old_values: JSON.stringify(oldFloor),
          new_values: JSON.stringify({
            floor_number: parseInt(floor_number) || 0,
            total_units_on_floor: parseInt(total_units_on_floor) || 0,
            building_id: building_id || 0,
            description: (description || '').trim(),
            status: parseInt(status) || 1,
          }),
          description: `Updated floor ${name}`,
        });
      } else {
        // Add new floor
        newId = await db.floors.add({
          floor_number: parseInt(floor_number) || 0,
          total_units_on_floor: parseInt(total_units_on_floor) || 0,
          building_id: building_id || 0,
          description: (description || '').trim(),
          status: parseInt(status) || 1,
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'create',
          table_name: 'floors',
          entity_id: newId,
          old_values: null,
          new_values: JSON.stringify({ floor_number, total_units_on_floor, building_id, description, status }),
          description: `Created floor ${name}`,
        });
      }
      dispatch('saved', {
        id: newId,
        floor_number: parseInt(floor_number) || 0,
        total_units_on_floor: parseInt(total_units_on_floor) || 0,
        building_id: building_id,
        description: description.trim(),
        status: parseInt(status) || 1,
      });
      toast.success(t("Success"),editingId ? t('Floor updated successfully.') : t('Floor created successfully.'));
      floorsModal.hide();
    } catch (err) {
      console.error('Failed to save floor:', err);
      toast.error(t('Error'), t('Error saving floor: ') + err.message);
    }
  }

  async function deleteFloor(id) {
    if (confirm('Delete this floor?')) {
      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'delete',
        table_name: 'floors',
        entity_id: id,
        old_values: JSON.stringify(floors.find((w) => w.id === id)),
        new_values: null,
        description: `Deleted floor #${id}`,
      });
      await db.floors.update(id, { status: 0 });
    }
  }
</script>

<div class="modal fade" id="createFloorModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-plus-circle"></i>
          {editingId ? t('Update Floor') : t('New Floor')}
        </h5>
        <button type="button" class="btn-close" data-mdb-dismiss="modal"></button>
      </div>

      <div class="modal-body">
        <div class="row">
         
          <div class="col-md-12 mb-4">
          
              <select class="form-select" id="c-floor-type" bind:value={building_id}>
                <option value="" disabled>{t('Select')+' '+t('Building')}</option>
                {#each buildings as building}
                  <option value={building.id}>{building.name} ({building.code})</option>
                {/each}
              </select>
          </div>


          
          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-total-floors" class="form-control" bind:value={floor_number} />
              <label class="form-label" for="c-total-floors">{t('Floor Number')}</label>
            </div>
          </div>

          
          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-total-units" class="form-control" bind:value={total_units_on_floor} />
              <label class="form-label" for="c-total-units">{t('Total')} {t('Units')}</label>
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
        <button type="button" class="btn btn-primary" on:click={saveFloor}>
          {editingId ? t('Update Floor') : t('Save Floor')}
        </button>
      </div>
    </div>
  </div>
</div>
