<script>
  import { onMount, tick } from 'svelte';
  import { db } from '../../db.js';
  import ProductModal from './ProductModal.svelte';

  export let productFormId = null;

  let categories = [];
  let units = [];
  let warehouses = [];
  let warehouse_products = [];
  let productModalRef;
  let dataReady = false;

  $: isNew = !productFormId || productFormId === 'new';
  $: formKey = productFormId || 'new';
  $: formKey, (productModalRef = null);

  onMount(async () => {
    categories = await db.product_categories
      .where('status')
      .equals(1)
      .toArray();

    units = await db.product_units
      .where('status')
      .equals(1)
      .toArray();

    warehouses = await db.warehouses
      .where('status')
      .equals(1)
      .toArray();

    warehouse_products = await db.warehouse_products
      .where('status')
      .equals(1)
      .toArray();

    dataReady = true;
  });

  async function getProductByRouteId(id) {
    if (id == null || id === '') return null;

    const routeKey = String(id).trim();
    const products = await db.products.toArray();

    return (
      products.find(
        (product) =>
          String(product.id).trim() === routeKey
      ) || null
    );
  }

  async function loadFormForRoute(id) {
    if (!productModalRef) return;

    await tick();

    if (!id || id === 'new') {
      productModalRef.openModal();
      return;
    }

    const product = await getProductByRouteId(id);

    if (product) {
      await productModalRef.editProduct(product);
    } else {
      productModalRef.openModal();
    }
  }

  $: if (dataReady && productModalRef) {
    loadFormForRoute(productFormId);
  }
</script>

{#if dataReady}
  <div class="container-fluid product-form-page-shell">
    {#key formKey}
      <ProductModal
        bind:this={productModalRef}
        asPage={true}
        {categories}
        {units}
        {warehouses}
        {warehouse_products}
        type="product"
      />
    {/key}
  </div>
{/if}

<style>
  /* ========================================================
     COMPACT PRODUCT FORM — DESKTOP AT 100% ZOOM
     ======================================================== */

  .product-form-page-shell {
    --control-height: 30px;
    --compact-radius: 8px;
    --compact-card-radius: 12px;
    --compact-font: 12px;
    --compact-label: 11px;

    width: 100%;
    max-width: 1480px;
    min-height: 100%;
    margin: 0 auto;
    padding: 6px 8px 10px !important;

    color: #0f172a;
    background: transparent;
  }

  /* ========================================================
     PAGE CONTAINER
     ======================================================== */

  .product-form-page-shell
    :global(.product-form-page) {
    width: 100%;
    padding: 0 0 8px !important;
  }

  .product-form-page-shell
    :global(.product-form-page__body),
  .product-form-page-shell
    :global(.product-form-page__inner),
  .product-form-page-shell
    :global(.product-form-body) {
    width: 100%;
  }

  /* ========================================================
     PAGE HEADER
     ======================================================== */

  .product-form-page-shell
    :global(.product-page-header) {
    min-height: auto !important;
    margin-bottom: 8px !important;
    padding: 8px 10px !important;
    border-radius: 12px !important;
  }

  .product-form-page-shell
    :global(.product-page-header__main) {
    gap: 9px !important;
  }

  .product-form-page-shell
    :global(.product-page-header__icon) {
    width: 34px !important;
    height: 34px !important;
    border-radius: 9px !important;
    font-size: 15px !important;
  }

  .product-form-page-shell
    :global(.product-page-header__title) {
    margin: 0 !important;
    font-size: 16px !important;
    line-height: 1.3 !important;
  }

  .product-form-page-shell
    :global(.product-page-header__subtitle) {
    margin-top: 2px !important;
    font-size: 11px !important;
    line-height: 1.35 !important;
  }

  .product-form-page-shell
    :global(.product-page-header__back) {
    min-height: 30px !important;
    gap: 5px !important;
    padding: 5px 10px !important;
    border-radius: 8px !important;
    font-size: 11px !important;
  }

  /* ========================================================
     MAIN PAGE LAYOUT
     ======================================================== */

  .product-form-page-shell
    :global(.product-page-form) {
    gap: 8px !important;
  }

  .product-form-page-shell
    :global(.product-page-form-layout) {
    gap: 8px !important;
  }

  /* ========================================================
     FORM CARDS
     ======================================================== */

  .product-form-page-shell
    :global(.form-card) {
    padding: 10px !important;
    border-radius: var(--compact-card-radius) !important;
  }

  .product-form-page-shell
    :global(.form-card__title),
  .product-form-page-shell
    :global(.section-title) {
    margin: 0 0 7px !important;
    font-size: 13px !important;
    line-height: 1.3 !important;
  }

  .product-form-page-shell
    :global(.product-form-section-title) {
    gap: 6px !important;
    margin-top: 3px !important;
    font-size: 13px !important;
    line-height: 1.3 !important;
  }

  .product-form-page-shell
    :global(.product-form-section-title::before) {
    width: 6px !important;
    height: 6px !important;
  }

  /* ========================================================
     FORM GRID
     ======================================================== */

  .product-form-page-shell
    :global(.product-form-grid),
  .product-form-page-shell
    :global(.form-grid) {
    column-gap: 8px !important;
    row-gap: 6px !important;
  }

  .product-form-page-shell
    :global(.product-form-grid > .field),
  .product-form-page-shell
    :global(.product-form-grid > [class*='col-']) {
    margin-bottom: 0 !important;
  }

  .product-form-page-shell
    :global(.product-main-row) {
    margin-bottom: 0 !important;
  }

  /* ========================================================
     LABELS
     ======================================================== */

  .product-form-page-shell
    :global(.field-label),
  .product-form-page-shell
    :global(.product-static-label),
  .product-form-page-shell
    :global(.form-outline .form-label) {
    margin: 0 0 3px !important;
    padding: 0 !important;
    font-size: var(--compact-label) !important;
    font-weight: 700 !important;
    line-height: 1.25 !important;
  }

  .product-form-page-shell
    :global(.field-required) {
    font-size: 10px !important;
  }

  /* ========================================================
     STANDARD INPUTS
     ======================================================== */

  .product-form-page-shell
    :global(.input),
  .product-form-page-shell
    :global(.select),
  .product-form-page-shell
    :global(.textarea),
  .product-form-page-shell
    :global(.form-control),
  .product-form-page-shell
    :global(.form-select),
  .product-form-page-shell
    :global(.form-outline .form-control) {
    height: var(--control-height) !important;
    min-height: var(--control-height) !important;
    padding: 4px 8px !important;
    border-radius: var(--compact-radius) !important;
    font-size: var(--compact-font) !important;
    line-height: 1.25 !important;
  }

  .product-form-page-shell
    :global(.input-with-icon__icon) {
    inset-inline-start: 10px !important;
    font-size: 12px !important;
  }

  .product-form-page-shell
    :global(.input-with-icon .input) {
    padding-inline-start: 30px !important;
  }

  /* ========================================================
     INPUT + ACTION CONTROLS
     ======================================================== */

  .product-form-page-shell
    :global(.input-action-control),
  .product-form-page-shell
    :global(.price-control),
  .product-form-page-shell
    :global(.field-currency-group) {
    height: var(--control-height) !important;
    min-height: var(--control-height) !important;
    border-radius: var(--compact-radius) !important;
  }

  .product-form-page-shell
    :global(.input-action-control__input) {
    height: var(--control-height) !important;
    min-height: var(--control-height) !important;
    padding: 4px 8px !important;
    font-size: var(--compact-font) !important;
    line-height: 1.25 !important;
  }

  .product-form-page-shell
    :global(.input-action-control__btn) {
    width: auto !important;
    min-width: 30px !important;
    height: var(--control-height) !important;
    padding: 0 7px !important;
    gap: 4px !important;
    border-radius: 0 !important;
    font-size: 11px !important;
  }

  .product-form-page-shell
    :global(.input-action-control__btn-text) {
    font-size: 10px !important;
  }

  /* Quick-create button inside fields */

  .product-form-page-shell
    :global(.field-quick-create-btn) {
    height: 22px !important;
    min-height: 22px !important;
    padding: 0 6px !important;
    border-radius: 6px !important;
    gap: 3px !important;
    font-size: 10px !important;
  }

  .product-form-page-shell
    :global(.field-quick-create-input) {
    padding-inline-end: 52px !important;
  }

  /* ========================================================
     FILTER SELECT
     ======================================================== */

  .product-form-page-shell
    :global(.filter-select) {
    width: 100%;
    max-width: none;
  }

  .product-form-page-shell
    :global(.filter-select__trigger) {
    min-height: var(--control-height) !important;
    height: var(--control-height) !important;
    padding: 4px 8px !important;
    border-radius: var(--compact-radius) !important;
    font-size: var(--compact-font) !important;
  }

  .product-form-page-shell
    :global(.filter-select__menu) {
    font-size: 12px !important;
  }

  .product-form-page-shell
    :global(.filter-select__option) {
    min-height: 28px !important;
    padding: 5px 8px !important;
  }

  /* ========================================================
     PRICE AND CURRENCY CONTROLS
     ======================================================== */

  .product-form-page-shell
    :global(.price-control-row) {
    gap: 6px !important;
  }

  .product-form-page-shell
    :global(.price-control-row__percent) {
    height: var(--control-height) !important;
    min-height: var(--control-height) !important;
    border-radius: var(--compact-radius) !important;
  }

  .product-form-page-shell
    :global(.price-control-row__percent-input) {
    height: var(--control-height) !important;
    min-height: var(--control-height) !important;
    padding: 4px 6px !important;
    font-size: 11px !important;
  }

  .product-form-page-shell
    :global(.field-currency-btn) {
    flex-basis: 64px !important;
    width: 64px !important;
    min-width: 64px !important;
    padding-inline: 6px !important;
    font-size: 11px !important;
  }

  .product-form-page-shell
    :global(.field-currency-input),
  .product-form-page-shell
    :global(.field-currency-group .form-control) {
    padding-inline: 8px !important;
  }

  /* ========================================================
     BOOTSTRAP INPUT GROUPS
     ======================================================== */

  .product-form-page-shell
    :global(.input-group-text),
  .product-form-page-shell
    :global(.input-group .btn),
  .product-form-page-shell
    :global(.btn-outline-secondary) {
    min-height: var(--control-height) !important;
    padding: 4px 7px !important;
    font-size: 11px !important;
  }

  /* ========================================================
     DROPDOWN RESULTS
     ======================================================== */

  .product-form-page-shell
    :global(.product-picker-menu) {
    margin-top: 3px !important;
    border-radius: 9px !important;
  }

  .product-form-page-shell
    :global(.product-picker-menu .list-group-item) {
    min-height: 28px !important;
    padding: 5px 8px !important;
    font-size: 11px !important;
    line-height: 1.3 !important;
  }

  /* ========================================================
     DESCRIPTION
     ======================================================== */

  .product-form-page-shell
    :global(.description-textarea),
  .product-form-page-shell
    :global(.product-description-field .textarea),
  .product-form-page-shell
    :global(.form-card-extra .description-textarea) {
    height: 76px !important;
    min-height: 76px !important;
    max-height: 110px !important;
    padding: 6px 8px 18px !important;
    font-size: 12px !important;
    resize: vertical;
  }

  .product-form-page-shell
    :global(.field-counter) {
    bottom: 6px !important;
    inset-inline-end: 8px !important;
    font-size: 9px !important;
  }

  /* ========================================================
     IMAGE UPLOAD
     ======================================================== */

  .product-form-page-shell
    :global(.image-upload),
  .product-form-page-shell
    :global(.form-card-extra .image-upload) {
    min-height: 96px !important;
    padding: 8px !important;
    gap: 5px !important;
    border-radius: 11px !important;
  }

  .product-form-page-shell
    :global(.image-upload__icon) {
    font-size: 20px !important;
  }

  .product-form-page-shell
    :global(.image-upload__text) {
    font-size: 11px !important;
    line-height: 1.35 !important;
  }

  .product-form-page-shell
    :global(.image-upload__hint) {
    font-size: 9px !important;
  }

  .product-form-page-shell
    :global(.image-upload__actions) {
    gap: 6px !important;
  }

  .product-form-page-shell
    :global(.image-upload__choose),
  .product-form-page-shell
    :global(.image-upload__search) {
    min-height: 30px !important;
    padding: 5px 9px !important;
    gap: 5px !important;
    border-radius: 7px !important;
    font-size: 10px !important;
  }

  .product-form-page-shell
    :global(.image-upload .preview-image) {
    width: min(100%, 140px) !important;
    height: 86px !important;
    border-radius: 9px !important;
  }

  /* ========================================================
     IMAGE SEARCH RESULTS
     ======================================================== */

  .product-form-page-shell
    :global(.product-image-search-results) {
    gap: 10px !important;
    margin-top: 10px !important;
    padding: 10px !important;
    border-radius: 12px !important;
  }

  /* ========================================================
     TOGGLES, CHECKBOXES AND RADIO INPUTS
     ======================================================== */

  .product-form-page-shell
    :global(.form-check-input) {
    width: 14px !important;
    height: 14px !important;
    margin-top: 0 !important;
  }

  .product-form-page-shell
    :global(.form-check-label) {
    font-size: 11px !important;
  }

  /* ========================================================
     ACTION BAR
     ======================================================== */

  .product-form-page-shell
    :global(.form-actions) {
    position: sticky;
    z-index: 30;
    bottom: 0;

    gap: 7px !important;
    margin-top: 10px !important;
    padding: 8px 10px !important;

    border-radius: 11px !important;

    background: rgba(255, 255, 255, 0.97);
    backdrop-filter: blur(7px);

    box-shadow:
      0 -5px 16px rgba(15, 23, 42, 0.06) !important;
  }

  .product-form-page-shell
    :global(.form-actions button),
  .product-form-page-shell
    :global(.form-actions .btn-primary),
  .product-form-page-shell
    :global(.form-actions .btn-secondary),
  .product-form-page-shell
    :global(.form-actions .btn-neutral) {
    min-height: 32px !important;
    padding: 5px 11px !important;
    border-radius: 8px !important;
    font-size: 11px !important;
    line-height: 1.2 !important;
  }

  /* ========================================================
     MOBILE
     ======================================================== */

  @media (max-width: 768px) {
    .product-form-page-shell {
      max-width: none;
      padding: 6px !important;
    }

    .product-form-page-shell
      :global(.product-form-page) {
      padding: 0 0 12px !important;
    }

    .product-form-page-shell
      :global(.product-page-header) {
      padding: 9px 10px !important;
    }

    .product-form-page-shell
      :global(.product-page-form-layout) {
      grid-template-columns: 1fr !important;
      gap: 8px !important;
    }

    .product-form-page-shell
      :global(.form-card) {
      padding: 10px !important;
    }

    .product-form-page-shell
      :global(.product-form-grid) {
      grid-template-columns: 1fr !important;
    }

    .product-form-page-shell
      :global(.form-actions) {
      align-items: stretch;
      flex-direction: column;
    }

    .product-form-page-shell
      :global(.form-actions button) {
      width: 100%;
    }
  }
</style>
