<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, createEventDispatcher } from 'svelte';

  import { t, lang, translate_org_type } from '../../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  // warehouses: "++id,name,location,description,status",

  let warehouses = [];
  let loading = true;
  let warehousesModal;
  let warehousesModalEl;

  let warehouseProducts = [];

  let units = [];
  let products = [];
  let productCategories = [];

  // Form fields
  let name = '';
  let location = '';
  let description = '';
  let manager_name = "";
  let status = 1;
  let selectedWarehouseId = null;
  // Track editing
  let editingId = null;

  onMount(async () => {
    if (window.mdb) {
      warehousesModal = window.mdb.Modal.getOrCreateInstance(warehousesModalEl);
    }
  });

  export function openWarehouseModal() {
    // Reset form for Add
    editingId = null;
    name = '';
    location = '';
    manager_name = '';
    description = '';
    status = 1;
    warehousesModal = window.mdb.Modal.getOrCreateInstance(warehousesModalEl);
    warehousesModal.show();
  }

  // Open modal to edit existing warehouse
  export function editWarehouse(warehouse) {
    editingId = warehouse.id;
    description = warehouse.description || '';
    location = warehouse.location || '';
    name = warehouse.name || '';
    status = warehouse.status;
    manager_name = warehouse.manager_name || '';
    warehousesModal = window.mdb.Modal.getOrCreateInstance(warehousesModalEl);
    warehousesModal.show();
  }

  async function saveWarehouse() {
    if (!name?.trim()) {
      alert('Name is required.');
      return;
    }

    try {
      let newId = Number(editingId);
      if (editingId) {
        let oldWarehouse = warehouses.find((w) => w.id === Number(editingId));
        // Update existing warehouse
        await db.warehouses.update(Number(editingId), {
          name: (name || '').trim(),
          location: (location || '').trim(),
          manager_name: (manager_name || '').trim(),
          description: (description || '').trim(),
          status: parseInt(status) || 1,
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'update',
          table_name: 'warehouses',
          entity_id: Number(editingId),
          old_values: JSON.stringify(oldWarehouse),
          new_values: JSON.stringify({
            name: (name || '').trim(),
            location: (location || '').trim(),
            manager_name: (manager_name || '').trim(),
            description: (description || '').trim(),
            status: parseInt(status) || 1,
          }),
          description: `Updated warehouse ${name}`,
        });
      } else {
        // Add new warehouse
        newId = await db.warehouses.add({
          name: (name || '').trim(),
          location: (location || '').trim(),
          manager_name: (manager_name || '').trim(),
          description: description || '',
          status: parseInt(status) || 1,
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'create',
          table_name: 'warehouses',
          entity_id: newId,
          old_values: null,
          new_values: JSON.stringify({ name, location, manager_name, description, status }),
          description: `Created warehouse ${name}`,
        });
      }
      dispatch('saved', {
        id: newId,
        name: name.trim(),
        location: location.trim(),
        manager_name: manager_name.trim(),
        description,
      });
      warehousesModal.hide();
    } catch (err) {
      console.error('Failed to save warehouse:', err);
      alert('Error saving warehouse: ' + err.message);
    }
  }

  async function deleteWarehouse(id) {
    if (confirm('Delete this warehouse?')) {
      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'delete',
        table_name: 'warehouses',
        entity_id: id,
        old_values: JSON.stringify(warehouses.find((w) => w.id === id)),
        new_values: null,
        description: `Deleted warehouse #${id}`,
      });
      await db.warehouses.update(id, { status: 0 });
    }
  }
</script>

<div
  bind:this={warehousesModalEl}
  class="modal fade qa-modal"
  dir={t('dir')}
  id="createWarehouseModal"
  tabindex="-1"
  aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered qa-modal__dialog">
    <div class="modal-content qa-modal__panel">
      <button type="button" class="qa-modal__close" data-mdb-dismiss="modal" aria-label={t('Close')}>
        <i class="bi bi-x-lg"></i>
      </button>

      <div class="qa-modal__header">
        <div class="qa-modal__icon">
          <i class="bi bi-building"></i>
        </div>
        <div>
          <span class="qa-modal__eyebrow">{t('Warehouse')}</span>
          <h3>{t('Products quick action')}</h3>
        </div>
      </div>

      <div class="qa-modal__intro">
        <h2>{editingId ? t('Update Warehouse') : t('New Warehouse')}</h2>
        <p>
          {editingId
            ? t('Update warehouse information')
            : t('Create a warehouse for organizing and tracking product stock')}
        </p>
      </div>

      <form class="qa-modal__form" on:submit|preventDefault={saveWarehouse}>
        <label class="qa-modal__field qa-modal__field--full">
          <span>{t('Name')}{t('-of-')}{t('Warehouse')}</span>
          <input type="text" id="c-name" bind:value={name} autocomplete="off" />
        </label>

        <label class="qa-modal__field">
          <span>{t('Location')}</span>
          <input type="text" id="c-location" bind:value={location} autocomplete="off" />
        </label>

        <label class="qa-modal__field">
          <span>{t('Manager Name')}</span>
          <input type="text" id="c-manager-name" bind:value={manager_name} autocomplete="off" />
        </label>

        <label class="qa-modal__field qa-modal__field--full">
          <span>{t('Description')}</span>
          <textarea id="c-description" rows="3" bind:value={description}></textarea>
        </label>

        <button type="submit" class="qa-modal__submit">
          {editingId ? t('Update Warehouse') : t('Save Warehouse')}
        </button>
      </form>
    </div>
  </div>
</div>
