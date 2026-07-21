<script>
    import { db,logActivity } from "../../db.js";
    import { onMount } from "svelte";
    import GenericModal from "./GenericModal.svelte";
    import { t, lang, translate_org_type } from "../../i18n/i18n.js";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;
    let productGenerics = [];
    let loading = true;
    async function loadProductGenerics() {
        loading = true;
        try {
            productGenerics = await db.product_generics.where('status').equals(1).toArray();
        } catch (err) {
            console.error("Failed to load:", err);
        } finally {
            loading = false;
        }
    }
    let modalRef = null;
    onMount(() => {
        loadProductGenerics();
    });
</script>
<div class="card generics-card">
    <div class="generics-titlebar">
        <div class="generics-title"><span><i class="bi bi-capsule"></i></span><div><small>{t("System Settings")}</small><h5>{t("Product Generics")}</h5></div></div>
        <button type="button" class="btn btn-primary" on:click={()=>{modalRef.openProductGenericModal()}}><i class="bi bi-plus-circle"></i> {t("Create Product Generic")}</button>
    </div>
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
                        {#each productGenerics as generic}
                            {#if generic.status !== 0}
                                <tr>
                                    <td>{generic.id}</td>
                                    <td>{generic.name}</td>
                                    <td><strong>{generic.code}</strong></td>
                                    <td>
                                        <button
                                            class="btn btn-sm btn-outline-secondary me-1"
                                            on:click={()=>{modalRef?.editProductGeneric(generic)}}
                                        >
                                            <i class="bi bi-pencil"></i>
                                        </button>
                                        <!-- <button
                                            class="btn btn-sm btn-outline-danger"
                                            on:click={() =>
                                                deleteProductGeneric(generic.id)}
                                        >
                                            <i class="bi bi-trash"></i>
                                        </button> -->
                                    </td>
                                </tr>
                            {/if}
                        {/each}
                        {#if productGenerics.length === 0}
                            <tr>
                                <td
                                    colspan="7"
                                    class="text-center text-muted p-4"
                                    >{t("No product generics found.")}</td
                                >
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
</div>
<GenericModal bind:this={modalRef} on:saved={loadProductGenerics} />

<style>
    .generics-card { overflow: hidden; border: 1px solid #dfe5ed; border-radius: 12px; background: var(--erp-bg); box-shadow: 0 4px 16px rgba(30,48,76,.08); }
    .generics-titlebar { display: flex; gap: 18px; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid #e7ecf2; background: linear-gradient(180deg,#fff 0%,#fbfdff 100%); }
    .generics-title { display: flex; gap: 12px; align-items: center; }
    .generics-title > span { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 9px; background: #eaf2ff; color: #2f6fed; }
    .generics-title small { display: block; color: #94a3b8; font-size: .68rem; font-weight: 800; }
    .generics-title h5 { margin: 1px 0 0; color: #263244; font-size: .98rem; font-weight: 900; }
    .generics-titlebar :global(.btn) { min-height: 39px; border-radius: 8px; font-size: .78rem; font-weight: 800; }
    .generics-card :global(thead th) { padding: 12px 16px; background: #f8fafc; color: #64748b; font-size: .72rem; font-weight: 900; }
    .generics-card :global(tbody td) { padding: 13px 16px; border-color: #edf1f6; color: #46536a; font-size: .8rem; vertical-align: middle; }
    .generics-card :global(tbody tr:hover > *) { --mdb-table-accent-bg: #f6f9ff; }
    @media (max-width: 575px) { .generics-titlebar { align-items: stretch; flex-direction: column; } .generics-titlebar :global(.btn) { width: 100%; } }
</style>
