<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, createEventDispatcher } from 'svelte';

  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();


  let departments = [];
  let loading = true;
  let departmentsModal;
  let departmentsModalEl;

  let departmentProducts = [];

  let units = [];
  let products = [];
  let productCategories = [];

  // Form fields
  let name = '';
  let description = '';
  let status = 1;
  let selectedDepartmentId = null;
  // Track editing
  let editingId = null;

  onMount(async () => {
    if (window.mdb) {
      departmentsModal = window.mdb.Modal.getOrCreateInstance(departmentsModalEl);
    }
  });

  export function openDepartmentModal() {
    // Reset form for Add
    editingId = null;
    name = '';
    description = '';
    status = 1;
    departmentsModal = window.mdb.Modal.getOrCreateInstance(departmentsModalEl);
    departmentsModal.show();
  }

  // Open modal to edit existing department
  export function editDepartment(department) {
    editingId = department.id;
    description = department.description || '';
    name = department.name || '';
    status = department.status;
    departmentsModal = window.mdb.Modal.getOrCreateInstance(departmentsModalEl);
    departmentsModal.show();
  }

  async function saveDepartment() {
    if (!name?.trim()) {
      alert('Name is required.');
      return;
    }

    try {
      let newId = Number(editingId);
      if (editingId) {
        let oldDepartment = departments.find((w) => w.id === Number(editingId));
        // Update existing department
        await db.departments.update(Number(editingId), {
          name: (name || '').trim(),
          description: (description || '').trim(),
          status: parseInt(status) || 1,
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'update',
          table_name: 'departments',
          entity_id: Number(editingId),
          old_values: JSON.stringify(oldDepartment),
          new_values: JSON.stringify({
            name: (name || '').trim(),
            description: (description || '').trim(),
            status: parseInt(status) || 1,
          }),
          description: `Updated department ${name}`,
        });
      } else {
        // Add new department
        newId = await db.departments.add({
          name: (name || '').trim(),
          description: description || '',
          status: parseInt(status) || 1,
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'create',
          table_name: 'departments',
          entity_id: newId,
          old_values: null,
          new_values: JSON.stringify({ name, description, status }),
          description: `Created department ${name}`,
        });
      }
      dispatch('saved', {
        id: newId,
        name: name.trim(),
        description,
      });
      departmentsModal.hide();
    } catch (err) {
      console.error('Failed to save department:', err);
      alert('Error saving department: ' + err.message);
    }
  }

  async function deleteDepartment(id) {
    if (confirm('Delete this department?')) {
      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'delete',
        table_name: 'departments',
        entity_id: id,
        old_values: JSON.stringify(departments.find((w) => w.id === id)),
        new_values: null,
        description: `Deleted department #${id}`,
      });
      await db.departments.update(id, { status: 0 });
    }
  }
</script>

<div
  bind:this={departmentsModalEl}
  class="modal fade qa-modal"
  dir={t('dir')}
  id="createDepartmentModal"
  tabindex="-1"
  aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered qa-modal__dialog">
    <div class="modal-content qa-modal__panel">
      <button type="button" class="qa-modal__close" data-mdb-dismiss="modal" aria-label={t('Close')}>
        <i class="bi bi-x-lg"></i>
      </button>

      <div class="qa-modal__header">
        <div class="qa-modal__icon">
          <i class="bi bi-diagram-3"></i>
        </div>
        <div>
          <span class="qa-modal__eyebrow">{t('Department')}</span>
          <h3>{t('Quick action')}</h3>
        </div>
      </div>

      <div class="qa-modal__intro">
        <h2>{editingId ? t('Update Department') : t('New Department')}</h2>
        <p>
          {editingId
            ? t('Update department information')
            : t('Create a department for organizing your organization')}
        </p>
      </div>

      <form class="qa-modal__form" on:submit|preventDefault={saveDepartment}>
        <label class="qa-modal__field qa-modal__field--full">
          <span>{t('Name')}</span>
          <input type="text" id="c-name" bind:value={name} autocomplete="off" />
        </label>

        <label class="qa-modal__field qa-modal__field--full">
          <span>{t('Description')}</span>
          <textarea id="c-description" rows="3" bind:value={description}></textarea>
        </label>

        <button type="submit" class="qa-modal__submit">
          {editingId ? t('Update Department') : t('Save Department')}
        </button>
      </form>
    </div>
  </div>
</div>
