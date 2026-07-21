<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  const dispatch = createEventDispatcher();
  let productCategories = [];
  let loading = true;
  let productCategoriesModalEl;
  let name = '';
  let code = '';
  let description = '';
  let status = 1;
  let editingId = null;

  async function loadProductCategories() {
    loading = true;
    try {
      productCategories = await db.product_categories.where('status').equals(1).toArray();
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadProductCategories();
  });

  export async function openProductCategoryModal() {
    editingId = null;
    name = '';
    code = '';
    description = '';
    status = 1;
    const modal = window.mdb.Modal.getOrCreateInstance(productCategoriesModalEl);
    modal.show();
  }

  export async function editProductCategory(category) {
    editingId = category.id;
    name = category.name;
    code = category.code;
    description = category.description;
    status = category.status;
    const modal = window.mdb.Modal.getOrCreateInstance(productCategoriesModalEl);
    modal.show();
  }

  async function saveProductCategory() {
    if (!name.trim()) {
      alert('Name is required.');
      return;
    }
    try {
      let newId = null;
      if (editingId) {
        await db.product_categories.update(editingId, {
          name: name.trim(),
          code: code.trim(),
          description,
          status: parseInt(status) || 1,
        });
      } else {
        newId = await db.product_categories.add({
          name: name.trim(),
          code: code.trim(),
          description,
          status: parseInt(status) || 1,
        });
      }
      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: editingId ? 'update' : 'create',
        table_name: 'product_categories',
        entity_id: editingId || newId,
        old_values: editingId ? JSON.stringify(productCategories.find((c) => c.id === editingId)) : null,
        new_values: JSON.stringify({ name, code, description, status }),
        description: `${editingId ? 'Updated' : 'Created'} product category ${name}`,
      });

      await loadProductCategories();

      dispatch('saved', {
        id: newId,
        name: name.trim(),
        code: code.trim(),
        description,
      });
      const modal = window.mdb.Modal.getOrCreateInstance(productCategoriesModalEl);
      modal.hide();
    } catch (err) {
      console.error('Failed to save product category:', err);
      alert('Error saving product category: ' + err.message);
    }
  }

  async function deleteProductCategory(id) {
    if (confirm('Delete this product category?')) {
      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'delete',
        table_name: 'product_categories',
        entity_id: id,
        old_values: JSON.stringify(productCategories.find((c) => c.id === id)),
        new_values: null,
        description: `Deleted product category #${id}`,
      });
      await db.product_categories.update(id, { status: 0 });
      await loadProductCategories();
    }
  }
</script>

<div
  bind:this={productCategoriesModalEl}
  class="modal fade qa-modal"
  dir={t('dir')}
  id="createProductCategoryModal"
  tabindex="-1"
  aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered qa-modal__dialog">
    <div class="modal-content qa-modal__panel">
      <button type="button" class="qa-modal__close" data-mdb-dismiss="modal" aria-label={t('Close')}>
        <i class="bi bi-x-lg"></i>
      </button>

      <div class="qa-modal__header">
        <div class="qa-modal__icon">
          <i class="bi bi-tag"></i>
        </div>
        <div>
          <span class="qa-modal__eyebrow">{t('Category')}</span>
          <h3>{t('Products quick action')}</h3>
        </div>
      </div>

      <div class="qa-modal__intro">
        <h2>{editingId ? t('Update Product Category') : t('Create Product Category')}</h2>
        <p>{editingId ? t('Update category subtitle') : t('Create category subtitle')}</p>
      </div>

      <form class="qa-modal__form" on:submit|preventDefault={saveProductCategory}>
        <label class="qa-modal__field qa-modal__field--full">
          <span>{t('Name')}</span>
          <input type="text" id="cat-name" bind:value={name} autocomplete="off" />
        </label>

        <label class="qa-modal__field qa-modal__field--full">
          <span>{t('Description')}</span>
          <textarea id="cat-description" rows="3" bind:value={description}></textarea>
        </label>

        <button type="submit" class="qa-modal__submit">
          {editingId ? t('Update Product Category') : t('Create Product Category')}
        </button>
      </form>
    </div>
  </div>
</div>
