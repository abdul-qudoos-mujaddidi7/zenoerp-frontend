<script>
    import { db,logActivity } from "../../db.js";
    import { onMount } from "svelte";
    import RoleModal from "./RoleModal.svelte";
    import { t, lang, translate_org_type } from "../../i18n/i18n";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;
    let userRoles = [];
    let loading = true;
    async function loadUserRoles() {
        loading = true;
        try {
            userRoles = await db.user_roles.where('status').equals(1).toArray();
        } catch (err) {
            console.error("Failed to load:", err);
        } finally {
            loading = false;
        }
    }
    let modalRef = null;
    onMount(() => {
        loadUserRoles();
    });
</script>

<div class="my-4 d-flex justify-content-between align-items-center">
    <p class="h5 mb-0">{t("User Roles")}</p>
    <button type="button" class="btn btn-primary" on:click={()=>{modalRef.openUserRoleModal()}}>
        <i class="bi bi-plus-circle"></i> {t("Create User Role")}
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
                            <th>{t("Code")}</th>
                            <th>{t("Actions")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each userRoles as role}
                            {#if role.status !== 0}
                                <tr>
                                    <td>{role.id}</td>
                                    <td>{t(role.name)}</td>
                                    <td><strong>{role.code}</strong></td>
                                    <td>
                                        <button
                                            class="btn btn-sm btn-outline-secondary me-1"
                                            on:click={()=>{modalRef?.editUserRole(role)}}
                                        >
                                            <i class="bi bi-pencil"></i>
                                        </button>
                                        <!-- <button
                                            class="btn btn-sm btn-outline-danger"
                                            on:click={() =>
                                                deleteUserRole(role.id)}
                                        >
                                            <i class="bi bi-trash"></i>
                                        </button> -->
                                    </td>
                                </tr>
                            {/if}
                        {/each}
                        {#if userRoles.length === 0}
                            <tr>
                                <td colspan="7" class="text-center text-muted p-4" >{t("No user roles found.")}</td>
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
</div>
<RoleModal bind:this={modalRef} on:saved={loadUserRoles} />
