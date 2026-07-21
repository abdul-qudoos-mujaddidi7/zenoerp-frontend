<script>
    import { db, logActivity } from "../../../db.js";
    import { onMount, createEventDispatcher } from "svelte";

    import { t, lang, translate_org_type } from "../../../i18n/i18n";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    const dispatch = createEventDispatcher();

    let labtestCategories = [];
    let loading = true;
    let labtestCategoriesModalEl;

    // Form fields
    let name = "";
    let code = "";
    let description = "";
    let status = 1;

    // Track editing
    let editingId = null;

    async function loadLabTestCategories() {
        loading = true;
        try {
            labtestCategories = await db.labtest_categories
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
        if (window.mdb) {
            document.querySelectorAll("[data-mdb-input-init]").forEach((el) => {
                new window.mdb.Input(el);
            });
        }
        loadLabTestCategories();
    });

    export async function openLabTestCategoryModal() {
        console.log("OK");
        editingId = null;
        name = "";
        code = "";
        description = "";
        status = 1;
        const modal = window.mdb.Modal.getOrCreateInstance(labtestCategoriesModalEl);
        modal.show();
    }

    export async function editLabTestCategory(category) {
        editingId = category.id;
        name = category.name;
        code = category.code;
        description = category.description;
        status = category.status;
        const modal = window.mdb.Modal.getOrCreateInstance(labtestCategoriesModalEl);
        modal.show();

    }

    async function saveLabTestCategory() {
        if (!name.trim()) {
            alert("Name is required.");
            return;
        }

        try {
            let newId = null;
            if (editingId) {
                // Update existing labtest category
                await db.labtest_categories.update(editingId, {
                    name: name.trim(),
                    code: code.trim(),
                    description,
                    status: parseInt(status) || 1,
                });
            } else {
                // Add new labtest category
                newId = await db.labtest_categories.add({
                    name: name.trim(),
                    code: code.trim(),
                    description,
                    status: parseInt(status) || 1,
                });
            }
            await logActivity({
                user_id: parseInt(localStorage.getItem("user_id")) || 0,
                action: editingId ? "update" : "create",
                table_name: "labtest_categories",
                entity_id: editingId || newId,
                old_values: editingId
                    ? JSON.stringify(
                          labtestCategories.find((c) => c.id === editingId),
                      )
                    : null,
                new_values: JSON.stringify({ name, code, description, status }),
                description: `${editingId ? "Updated" : "Created"} labtest category ${name}`,
            });

            await loadLabTestCategories();

            dispatch("saved", {
                id: newId,
                name: name.trim(),
                code: code.trim(),
                description,
            });
            const modal = window.mdb.Modal.getOrCreateInstance(labtestCategoriesModalEl);
            modal.hide();

        } catch (err) {
            console.error("Failed to save labtest category:", err);
            alert("Error saving labtest category: " + err.message);
        }
    }

    async function deleteLabTestCategory(id) {
        if (confirm("Delete this labtest category?")) {
            await logActivity({
                user_id: parseInt(localStorage.getItem("user_id")) || 0,
                action: "delete",
                table_name: "labtest_categories",
                entity_id: id,
                old_values: JSON.stringify(
                    labtestCategories.find((c) => c.id === id),
                ),
                new_values: null,
                description: `Deleted labtest category #${id}`,
            });
            await db.labtest_categories.update(id, { status: 0 });
            await loadLabTestCategories();
        }
    }
</script>



<div
    bind:this={labtestCategoriesModalEl}
    class="modal fade"
    id="createLabTestCategoryModal"
    tabindex="-1"
    aria-hidden="true"
>
    <div class="modal-dialog modal-sm modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="bi bi-plus-circle"></i>
                    {editingId
                        ? t("Update LabTest Category")
                        : t("Create LabTest Category")}
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
                    on:click={saveLabTestCategory}
                >
                    {editingId
                        ? t("Update LabTest Category")
                        : t("Create LabTest Category")}
                </button>
            </div>
        </div>
    </div>
</div>
