<script>
    import { db, logActivity } from "../../db.js";
    import { onMount, createEventDispatcher } from "svelte";

    import { t, lang, translate_org_type } from "../../i18n/i18n.js";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    const dispatch = createEventDispatcher();

    let productBrands = [];
    let loading = true;
    let productBrandsModalEl;

    // Form fields
    let name = "";
    let code = "";
    let description = "";
    let status = 1;

    // Track editing
    let editingId = null;

    async function loadProductBrands() {
        loading = true;
        try {
            productBrands = await db.product_brands
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
        loadProductBrands();
    });

    export async function openProductBrandModal() {
        console.log("OK");
        editingId = null;
        name = "";
        code = "";
        description = "";
        status = 1;
        const modal = window.mdb.Modal.getOrCreateInstance(productBrandsModalEl);
        modal.show();
    }

    export async function editProductBrand(brand) {
        editingId = brand.id;
        name = brand.name;
        code = brand.code;
        description = brand.description;
        status = brand.status;
        const modal = window.mdb.Modal.getOrCreateInstance(productBrandsModalEl);
        modal.show();
    }

    async function saveProductBrand() {
        if (!name.trim()) {
            alert("Name is required.");
            return;
        }

        try {
            let newId = null;
            if (editingId) {
                // Update existing product brand
                await db.product_brands.update(editingId, {
                    name: name.trim(),
                    code: code.trim(),
                    description,
                    status: parseInt(status) || 1,
                });
            } else {
                // Add new product brand
                newId = await db.product_brands.add({
                    name: name.trim(),
                    code: code.trim(),
                    description,
                    status: parseInt(status) || 1,
                });
            }
            await logActivity({
                user_id: parseInt(localStorage.getItem("user_id")) || 0,
                action: editingId ? "update" : "create",
                table_name: "product_brands",
                entity_id: editingId || newId,
                old_values: editingId
                    ? JSON.stringify(
                          productBrands.find((c) => c.id === editingId),
                      )
                    : null,
                new_values: JSON.stringify({ name, code, description, status }),
                description: `${editingId ? "Updated" : "Created"} product brand ${name}`,
            });

            await loadProductBrands();

            dispatch("saved", {
                id: newId,
                name: name.trim(),
                code: code.trim(),
                description,
            });
            const modal = window.mdb.Modal.getOrCreateInstance(productBrandsModalEl);
            modal.hide();
        } catch (err) {
            console.error("Failed to save product brand:", err);
            alert("Error saving product brand: " + err.message);
        }
    }

    async function deleteProductBrand(id) {
        if (confirm("Delete this product brand?")) {
            await logActivity({
                user_id: parseInt(localStorage.getItem("user_id")) || 0,
                action: "delete",
                table_name: "product_brands",
                entity_id: id,
                old_values: JSON.stringify(
                    productBrands.find((c) => c.id === id),
                ),
                new_values: null,
                description: `Deleted product brand #${id}`,
            });
            await db.product_brands.update(id, { status: 0 });
            await loadProductBrands();
        }
    }
</script>

<div
    bind:this={productBrandsModalEl}
    class="modal fade"
    id="createProductBrandModal"
    tabindex="-1"
    aria-hidden="true"
>
    <div class="modal-dialog modal-sm modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="bi bi-plus-circle"></i>
                    {editingId
                        ? t("Update Product Brand")
                        : t("Create Product Brand")}
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

                    <div class="col-md-12 mb-4">
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
                    on:click={saveProductBrand}
                >
                    {editingId
                        ? t("Update Product Brand")
                        : t("Create Product Brand")}
                </button>
            </div>
        </div>
    </div>
</div>
