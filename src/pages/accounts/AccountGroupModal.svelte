<script>
    import { db, logActivity } from "../../db.js";
    import { onMount, createEventDispatcher } from "svelte";

    import { t, lang, translate_org_type } from "../../i18n/i18n.js";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    const dispatch = createEventDispatcher();

    let accountGroups = [];
    let loading = true;
    let accountGroupsModal;

    // Form fields
    let name = "";
    let code = "";
    let description = "";
    let status = 1;

    // Track editing
    let editingId = null;

    async function loadAccountGroups() {
        loading = true;
        try {
            accountGroups = await db.account_groups
                .where("status")
                .equals(1)
                .toArray();
        } catch (err) {
            console.error("Failed to load:", err);
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        const modalEl = document.getElementById("createAccountGroupModal");
        if (window.mdb) {
            accountGroupsModal = new window.mdb.Modal(modalEl);
            document.querySelectorAll("[data-mdb-input-init]").forEach((el) => {
                new window.mdb.Input(el);
            });
        }
        loadAccountGroups();
    });

    export async function openAccountGroupModal() {
        console.log("OK");
        editingId = null;
        name = "";
        code = "";
        description = "";
        status = 1;
        accountGroupsModal.show();
    }

    export async function editAccountGroup(group) {
        editingId = group.id;
        name = group.name;
        code = group.code;
        description = group.description;
        status = group.status;
        accountGroupsModal.show();
    }

    async function saveAccountGroup() {
        if (!name.trim()) {
            alert("Name is required.");
            return;
        }

        try {
            let newId = null;
            if (editingId) {
                // Update existing account group
                await db.account_groups.update(editingId, {
                    name: name.trim(),
                    code: code.trim(),
                    description,
                    status: parseInt(status) || 1,
                });
            } else {
                // Add new account group
                newId = await db.account_groups.add({
                    name: name.trim(),
                    code: code.trim(),
                    description,
                    status: parseInt(status) || 1,
                });
            }
            await logActivity({
                user_id: parseInt(localStorage.getItem("user_id")) || 0,
                action: editingId ? "update" : "create",
                table_name: "account_groups",
                entity_id: editingId || newId,
                old_values: editingId
                    ? JSON.stringify(
                          accountGroups.find((c) => c.id === editingId),
                      )
                    : null,
                new_values: JSON.stringify({ name, code, description, status }),
                description: `${editingId ? "Updated" : "Created"} account group ${name}`,
            });

            await loadAccountGroups();

            dispatch("saved", {
                id: newId,
                name: name.trim(),
                code: code.trim(),
                description,
            });
            accountGroupsModal.hide();
        } catch (err) {
            console.error("Failed to save account group:", err);
            alert("Error saving account group: " + err.message);
        }
    }

    async function deleteAccountGroup(id) {
        if (confirm("Delete this account group?")) {
            await logActivity({
                user_id: parseInt(localStorage.getItem("user_id")) || 0,
                action: "delete",
                table_name: "account_groups",
                entity_id: id,
                old_values: JSON.stringify(
                    accountGroups.find((c) => c.id === id),
                ),
                new_values: null,
                description: `Deleted account group #${id}`,
            });
            await db.account_groups.update(id, { status: 0 });
            await loadAccountGroups();
        }
    }
</script>

<div
    class="modal fade"
    id="createAccountGroupModal"
    tabindex="-1"
    aria-hidden="true"
>
    <div class="modal-dialog modal-sm modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="bi bi-plus-circle"></i>
                    {editingId
                        ? t("Update Account Group")
                        : t("Create Account Group")}
                </h5>
                <button type="button" class="btn-close" data-mdb-dismiss="modal"
                ></button>
            </div>

            <div class="modal-body">
                <div class="row">
                    <div class="col-md-12 mb-4">
                        <div class="form-outline" data-mdb-input-init>
                            <input
                                type="text"
                                id="c-name"
                                class="form-control"
                                bind:value={name}
                            />
                            <label class="form-label" for="c-name"
                                >{t("Name")}</label
                            >
                        </div>
                    </div>

                    <div class="col-md-12 mb-4 d-none">
                        <div class="form-outline" data-mdb-input-init>
                            <input
                                type="text"
                                id="c-value"
                                class="form-control"
                                bind:value={code}
                            />
                            <label class="form-label" for="c-code"
                                >{t("Code")}</label
                            >
                        </div>
                    </div>
                    <div class="col-md-12 mb-4">
                        <div class="form-outline" data-mdb-input-init>
                            <textarea
                                id="c-description"
                                class="form-control"
                                bind:value={description}
                            ></textarea>
                            <label class="form-label" for="c-description"
                                >{t("Description")}</label
                            >
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal-footer">
                <button
                    type="button"
                    class="btn btn-link text-dark"
                    data-mdb-dismiss="modal">{t("Close")}</button
                >
                <button
                    type="button"
                    class="btn btn-primary"
                    on:click={saveAccountGroup}
                >
                    {editingId
                        ? t("Update Account Group")
                        : t("Create Account Group")}
                </button>
            </div>
        </div>
    </div>
</div>
