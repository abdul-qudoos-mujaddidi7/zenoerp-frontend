<script>
    import { db,logActivity } from "../../db.js";
    import { onMount } from "svelte";

    import BrandModal from "./BrandModal.svelte";

    import { t, lang, translate_org_type } from "../../i18n/i18n.js";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;



    let productBrands = [];
    let loading = true;



    async function loadProductBrands() {
        loading = true;
        try {
            productBrands = await db.product_brands.where('status').equals(1).toArray();
        } catch (err) {
            console.error("Failed to load:", err);
        } finally {
            loading = false;
        }
    }

    let modalRef = null;


    onMount(() => {
        loadProductBrands();
    });
</script>

<div class="my-4 d-flex justify-content-between align-items-center">
    <p class="h5 mb-0">{t("Product Brands")}</p>
    <button type="button" class="btn btn-primary" on:click={()=>{modalRef.openProductBrandModal()}}>
        <i class="bi bi-plus-circle"></i> {t("Create Product Brand")}
    </button>
</div>

<div class="card shadow-sm">
    <div class="card-body p-0">
        {#if loading}
            <div class="text-center p-4">
                <div class="spinner-border text-primary" role="status"></div>
            </div>
        {:else}
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>{t("ID")}</th>
                            <th>{t("Name")}</th>
                            <th>{t("Code")}</th>
                            <th>{t("Actions")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each productBrands as brand}
                            {#if brand.status !== 0}
                                <tr>
                                    <td>{brand.id}</td>
                                    <td>{brand.name}</td>
                                    <td><strong>{brand.code}</strong></td>
                                
                                    <td>
                                        <button
                                            class="btn btn-sm btn-outline-secondary me-1"
                                            on:click={()=>{modalRef?.editProductBrand(brand)}}
                                        >
                                            <i class="bi bi-pencil"></i>
                                        </button>
                                        <!-- <button
                                            class="btn btn-sm btn-outline-danger"
                                            on:click={() =>
                                                deleteProductBrand(brand.id)}
                                        >
                                            <i class="bi bi-trash"></i>
                                        </button> -->
                                    </td>
                                </tr>
                            {/if}
                        {/each}
                        {#if productBrands.length === 0}
                            <tr>
                                <td
                                    colspan="7"
                                    class="text-center text-muted p-4"
                                    >{t("No product brands found.")}</td
                                >
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
</div>
<BrandModal bind:this={modalRef} on:saved={loadProductBrands} />