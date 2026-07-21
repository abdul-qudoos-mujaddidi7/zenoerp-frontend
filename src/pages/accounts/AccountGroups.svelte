<script>
    import { db,logActivity } from "../../db.js";
    import { onMount } from "svelte";

    import AccountGroupModal from "./AccountGroupModal.svelte";

    import { t, lang, translate_org_type,shortID } from "../../i18n/i18n.js";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;



    let accountGroups = [];
    let loading = true;



    async function loadAccountGroups() {
        loading = true;
        try {
            accountGroups = await db.account_groups.where('status').equals(1).toArray();
        } catch (err) {
            console.error("Failed to load:", err);
        } finally {
            loading = false;
        }
    }

    let modalRef = null;


    onMount(() => {
        loadAccountGroups();
    });
</script>

<div class="my-4 d-flex justify-content-between align-items-center">
    <p class="h5 mb-0">{t("Account Groups")}</p>
    <button type="button" class="btn btn-primary" on:click={()=>{modalRef.openAccountGroupModal()}}>
        <i class="bi bi-plus-circle"></i> {t("Create Account Group")}
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
                            <th>{t("Description")}</th>
                            <th>{t("Actions")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each accountGroups as group}
                            {#if group.status !== 0}
                                <tr>
                                    <td>{shortID(group.id)}</td>
                                    <td>{group.name}</td>
                                    <td><strong>{group.description}</strong></td>
                                
                                    <td>
                                        <button
                                            disabled={group.id==1}
                                            class="btn btn-sm btn-outline-secondary me-1"
                                            on:click={()=>{modalRef?.editAccountGroup(group)}}
                                        >
                                            <i class="bi bi-pencil"></i>
                                        </button>
                                        <!-- <button
                                            class="btn btn-sm btn-outline-danger"
                                            on:click={() =>
                                                deleteAccountGroup(group.id)}
                                        >
                                            <i class="bi bi-trash"></i>
                                        </button> -->
                                    </td>
                                </tr>
                            {/if}
                        {/each}
                        {#if accountGroups.length === 0}
                            <tr>
                                <td
                                    colspan="7"
                                    class="text-center text-muted p-4"
                                    >{t("No account groups found.")}</td
                                >
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
</div>
<AccountGroupModal bind:this={modalRef} on:saved={loadAccountGroups} />