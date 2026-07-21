<script>
    import { db, logActivity } from "../../db.js";
    import { onMount, createEventDispatcher } from "svelte";
    import { t, lang, translate_org_type } from "../../i18n/i18n";
    import Swal from "sweetalert2";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    import { push } from "svelte-spa-router";
    import { calculateProductStock } from "../stocktransactions/calculateStock.js";
    export let waste;

    const dispatch = createEventDispatcher();

    let saving = false;
    let confirmationText = "";
    let randomNumber = Math.floor(Math.random() * 900) + 100;
    let loading = true;
    let waste_items = [];
    let waste_stock_transactions = [];

    onMount(() => {
        loadWasteDetails();
    });

    async function loadWasteDetails() {
        if (!waste) return;
        waste = await db.wastes.where({ id: Number(waste.id), status: 1 }).first();
        waste_items = await db.waste_items
            .where("waste_id")
            .equals(waste.id)
            .and((i) => i.status === 1)
            .toArray();
        waste_stock_transactions = await db.stock_transactions
            .where("reference_type")
            .equals("waste")
            .and((st) => st.reference_id === waste.id && st.status === 1)
            .toArray();
        loading = false;
    }

    async function doDeleteWaste() {
        saving = true;
        try {
            let deletedWaste = await db.wastes.where("id").equals(waste.id).first();
            await db.wastes.update(waste.id, { status: 0 });
            let itemsToDelete = await db.waste_items
                .where("waste_id")
                .equals(waste.id)
                .and((i) => i.status === 1)
                .toArray();
            for (const it of itemsToDelete) {
                await db.waste_items.update(it.id, { status: 0 });
            }
            let stockTransToDelete = await db.stock_transactions
                .where("reference_type")
                .equals("waste")
                .and((st) => st.reference_id === waste.id && st.status === 1)
                .toArray();
            for (const st of stockTransToDelete) {
                await db.stock_transactions.update(st.id, { status: 0 });
                await calculateProductStock(
                    Number(st.product_id),'single'
                );
            }
            await logActivity({
                user_id: parseInt(localStorage.getItem("user_id")) || 0,
                action: "delete",
                table_name: "wastes",
                entity_id: waste.id,
                old_values: JSON.stringify({
                    waste: deletedWaste,
                    items: itemsToDelete.map((i) => i.id),
                    stock_transactions: stockTransToDelete.map((st) => st.id),
                }),
                description: `Deleted waste #${waste.id}`,
            });
            Swal.fire({
                icon: "success",
                title: t("Deleted!"),
                text: t("Waste deleted successfully."),
            });
            dispatch("close");
            push(`/dashboard/wastes`);
        } catch (e) {
            console.error("Error deleting waste:", e);
            Swal.fire({
                icon: "error",
                title: t("Error"),
                text: t("An error occurred while deleting the waste."),
                confirmButtonText: t("OK"),
            });
        } finally {
            saving = false;
        }
    }
    async function deleteWaste() {
        if (confirmationText !== String(randomNumber)) {
            Swal.fire({
                icon: "error",
                title: t("Confirmation Failed"),
                text: t(
                    "Confirmation text does not match. Please type the correct number to confirm deletion.",
                ),
                confirmButtonText: t("OK"),
            });
            return;
        }
        Swal.fire({
            title: t("Are you sure?"),
            text: t(
                "Are you sure you want to delete this waste? This action cannot be undone.",
            ),
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: t("Yes, delete it!"),
            cancelButtonText: t("No, keep it"),
        }).then((result) => {
            if (result.isConfirmed) {
                doDeleteWaste();
            }
        });
    }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal show d-block" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="bi bi-arrow-return-left"></i>
                    {t("Delete Waste")}
                </h5>
                <button
                    type="button"
                    class="btn-close"
                    on:click={() => dispatch("close")}
                ></button>
            </div>
            <div class="modal-body">
                {#if saving}
                    <div class="d-flex align-items-center">
                        <strong>{t("Deleting...")}</strong>
                        <div
                            class="spinner-border ms-auto"
                            role="status"
                            aria-hidden="true"
                        ></div>
                    </div>
                {:else}
                    <h1 class="text-danger">
                        <i class="bi bi-exclamation-triangle me-2"></i>{t("Warning!")}
                    </h1>
                    <p>
                        {t("Are you sure you want to delete this waste? This action cannot be undone.")}
                        <br />
                        {t("All associated journals, items and payments will also be deleted.")}
                    </p>
                    <table>
                        <tbody>
                            <tr>
                                <td><strong>{t("Associated Items")}:</strong></td>
                                <td class="fw-bold ps-3">{@html loading ? ` <div class="spinner-border spinner-border-sm" role="status">
                                                                                <span class="visually-hidden">${t("Loading...")}</span>
                                                                            </div>` : waste_items.length}</td>
                            </tr>
                            <tr>
                                <td><strong>{t("Associated Stock Transactions")}:</strong></td>
                                <td class="fw-bold ps-3">{@html loading
                                        ?  `<div class="spinner-border spinner-border-sm" role="status">
                                                <span class="visually-hidden">${t("Loading...")}</span>
                                            </div>`
                                        : waste_stock_transactions.length}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="mt-4">
                        <small>
                            {t(`To confirm deletion, please type`)}
                            {randomNumber}
                            {t(`in the box below:`)}
                        </small>
                        <input type="text" class="form-control form-control-sm mt-2 w-50"
                            bind:value={confirmationText} placeholder={t(`To confirm deletion, please type`)} />
                    </div>
                {/if}
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" on:click={() => dispatch("close")}>
                    <i class="bi bi-x-lg"></i> {t("Cancel")}
                </button>
                <button class="btn btn-danger" on:click={deleteWaste} disabled={saving || loading}>
                    <i class="bi bi-trash"></i>
                    {@html saving
                        ? ` <div class="spinner-border spinner-border-sm" role="status">
                                <span class="visually-hidden">${t("Deleting...")}</span>
                            </div>`
                        : t("Delete")}
                </button>
            </div>
        </div>
    </div>
</div>
