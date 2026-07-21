<script>
  import {t, lang, translate_org_type} from "../i18n/i18n";
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import ProductsIndex from "./products/ProductsIndex.svelte";
  import Warehouses from "./products/Warehouses.svelte";
  import Returns from "./settings/Returns.svelte";
  import Wastes from "./Wastes.svelte";

  export let page = "products";
</script>

<section class="stock-page">
  <div class="stock-tab-content">
    {#if page === "products"}
      <ProductsIndex />
    {:else if page === "warehouses"}
      <Warehouses />
    {:else if page === "returns"}
      <Returns />
    {:else if page === "wastes"}
      <Wastes />
    {/if}
  </div>
</section>

<style>
  .stock-page {
    min-width: 0;
  }

  .stock-tab-content {
    min-width: 0;
  }
</style>
