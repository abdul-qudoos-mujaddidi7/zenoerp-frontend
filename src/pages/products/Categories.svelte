<script>
    import { db,logActivity } from "../../db.js";

    import { onMount } from "svelte";

    import CategoryModal from "./CategoryModal.svelte";

    import { t, lang, translate_org_type,shortID } from "../../i18n/i18n";

    $: _lang = $lang;

    $: _translate_org_type = $translate_org_type;

    let productCategories = [];

    let loading = true;

    async function loadProductCategories() {
        loading = true;
        try {
            productCategories = await db.product_categories.where('status').equals(1).toArray();
        } catch (err) {
            console.error("Failed to load:", err);
        } finally {
            loading = false;
        }
    }

    let modalRef = null;

    onMount(() => {
        loadProductCategories();
    });
</script>

<div class="my-4 d-flex justify-content-between align-items-center">
    <p class="h5 mb-0">{t("Product Categories")}</p>
    <button type="button" class="btn btn-primary" on:click={()=>{modalRef.openProductCategoryModal()}}>
        <i class="bi bi-plus-circle"></i> {t("Create Product Category")}
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
                <table class="table table-hover mb-0 settings-index-table">
                    <thead class="table-light">
                        <tr>
                            <th>{t("ID")}</th>
                            <th>{t("Name")}</th>
                            <th>{t("Description")}</th>
                            <th>{t("Actions")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each productCategories as category}
                            {#if category.status !== 0}
                                <tr>
                                    <td>{shortID(category.id)}</td>
                                    <td>{category.name}</td>
                                    <td><strong>{category.description}</strong></td>
                                
                                    <td>
                                        <button
                                            class="btn btn-sm btn-outline-secondary me-1"
                                            on:click={()=>{modalRef?.editProductCategory(category)}}
                                        >
                                            <i class="bi bi-pencil"></i>
                                        </button>
                                        <!-- <button
                                            class="btn btn-sm btn-outline-danger"
                                            on:click={() =>
                                                deleteProductCategory(category.id)}
                                        >
                                            <i class="bi bi-trash"></i>
                                        </button> -->
                                    </td>
                                </tr>
                            {/if}
                        {/each}
                        {#if productCategories.length === 0}
                            <tr>
                                <td
                                    colspan="7"
                                    class="text-center text-muted p-4"
                                    >{t("No product categories found.")}</td
                                >
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
</div>
<CategoryModal bind:this={modalRef} on:saved={loadProductCategories} />
