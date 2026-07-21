<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  let units = [];
  let loading = true;
  let unitModalEl;

  let name = '';
  let code = '';
  let description = '';
  let subunit_id = null;
  let subunit_multiple = null;
  let status = 1;
  let hasSubunit = false;
  let editingId = null;

  async function loadUnits() {
    loading = true;
    try {
      units = await db.product_units.where({ status: 1 }).toArray();
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadUnits();
  });

  export async function openUnitModal() {
    editingId = null;
    name = '';
    code = '';
    description = '';
    subunit_id = null;
    subunit_multiple = null;
    status = 1;
    hasSubunit = false;
    const unitModal = window.mdb.Modal.getOrCreateInstance(unitModalEl);
    unitModal.show();
  }

  export async function editUnit(unit) {
    editingId = unit.id;
    name = unit.name;
    code = unit.code;
    description = unit.description;
    subunit_id = unit.subunit_id;
    subunit_multiple = unit.subunit_multiple;
    status = unit.status;
    hasSubunit = !!(unit.subunit_id || unit.subunit_multiple);

    const unitModal = window.mdb.Modal.getOrCreateInstance(unitModalEl);
    unitModal.show();
  }

  async function saveUnit() {
    if (!name.trim()) {
      alert('Name is required.');
      return;
    }

    try {
      let newId = editingId;
      if (editingId) {
        let oldUnit = units.find((u) => u.id === editingId);
        await db.product_units.update(editingId, {
          name: name.trim(),
          code: code.trim(),
          description,
          subunit_id: subunit_id || null,
          subunit_multiple: subunit_multiple || null,
          status: parseInt(status) || 1,
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'update',
          table_name: 'product_units',
          entity_id: editingId,
          old_values: JSON.stringify(oldUnit),
          new_values: JSON.stringify({ name, code, description, subunit_id, subunit_multiple, status }),
          description: `Updated unit ${name}`,
        });
      } else {
        newId = await db.product_units.add({
          name: name.trim(),
          code: code.trim(),
          description,
          subunit_id: subunit_id || null,
          subunit_multiple: subunit_multiple || null,
          status: parseInt(status) || 1,
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'create',
          table_name: 'product_units',
          entity_id: newId,
          old_values: null,
          new_values: JSON.stringify({ name, code, description, subunit_id, subunit_multiple, status }),
          description: `Created unit ${name}`,
        });
      }

      dispatch('saved', {
        id: newId,
        name: name.trim(),
        code: code.trim(),
        description,
      });

      await loadUnits();

      const unitModal = window.mdb.Modal.getOrCreateInstance(unitModalEl);
      unitModal.hide();
    } catch (err) {
      console.error('Failed to save unit:', err);
      alert('Error saving unit: ' + err.message);
    }
  }

  async function deleteUnit(id) {
    if (confirm('Delete this unit?')) {
      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'delete',
        table_name: 'product_units',
        entity_id: id,
        old_values: JSON.stringify(units.find((u) => u.id === id)),
        new_values: null,
        description: `Deleted unit #${id}`,
      });
      await db.product_units.update(id, { status: 0 });
      await loadUnits();
    }
  }
</script>

<div bind:this={unitModalEl} class="modal fade qa-modal" dir={t('dir')} id="createUnitModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered qa-modal__dialog">
    <div class="modal-content qa-modal__panel">
      <button type="button" class="qa-modal__close" data-mdb-dismiss="modal" aria-label={t('Close')}>
        <i class="bi bi-x-lg"></i>
      </button>

      <div class="qa-modal__header">
        <div class="qa-modal__icon qa-modal__icon--purple">
          <i class="bi bi-rulers"></i>
        </div>
        <div>
          <span class="qa-modal__eyebrow">{t('Product Units')}</span>
          <h3>{t('Products quick action')}</h3>
        </div>
      </div>

      <div class="qa-modal__intro">
        <h2>{editingId ? t('Update Unit') : t('Create Unit')}</h2>
        <p>{editingId ? t('Update unit subtitle') : t('Create unit subtitle')}</p>
      </div>

      <form class="qa-modal__form" on:submit|preventDefault={saveUnit}>
        <label class="qa-modal__field">
          <span>{t('Name')}</span>
          <input type="text" id="unit-name" bind:value={name} autocomplete="off" />
        </label>

        <label class="qa-modal__field">
          <span>{t('Code')}</span>
          <input type="text" id="unit-code" bind:value={code} autocomplete="off" />
        </label>

        <label class="qa-modal__field qa-modal__field--full">
          <span>{t('Description')}</span>
          <textarea id="unit-description" rows="3" bind:value={description}></textarea>
        </label>

        <div class="qa-modal__switch">
          <input
            class="form-check-input"
            type="checkbox"
            id="hasSubunit"
            bind:checked={hasSubunit}
            on:change={() => {
              if (!hasSubunit) {
                subunit_id = null;
                subunit_multiple = null;
              }
            }} />
          <label class="form-check-label" for="hasSubunit">{t('Has Subunit')}</label>
        </div>

        {#if hasSubunit}
          <div class="qa-modal__subunit">
            <div class="qa-modal__subunit-label">{name || t('Name')}</div>
            <div class="qa-modal__subunit-eq">=</div>
            <input
              type="number"
              id="c-subunit_multiple"
              class="form-control"
              placeholder={t('Subunit Multiple')}
              bind:value={subunit_multiple} />
            <select id="c-subunit" class="form-select" bind:value={subunit_id}>
              <option value="">{t('Select Unit')}</option>
              {#each units as u}
                <option value={u.id}>{u.name}</option>
              {/each}
            </select>
          </div>
        {/if}

        <button type="submit" class="qa-modal__submit">
          {editingId ? t('Update Unit') : t('Create Unit')}
        </button>
      </form>
    </div>
  </div>
</div>
