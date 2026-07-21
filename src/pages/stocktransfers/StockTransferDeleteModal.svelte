<script>
    import { db, logActivity } from "../../db.js";
    import { onMount, createEventDispatcher } from "svelte";
    import { t, lang, translate_org_type } from "../../i18n/i18n.js";
    import { on } from "svelte/events";
    import Swal from "sweetalert2";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;
    import { push } from "svelte-spa-router";
    import { calculateProductStock } from "../stocktransactions/calculateStock.js";
    export let stocktransfer;
    const dispatch = createEventDispatcher();
    let saving = false;
    let confirmationText = "";
    let randomNumber = Math.floor(Math.random() * 900) + 100;
    let loading = true;
    let stocktransfer_items = [];
    let stocktransfer_journals = [];
    let stocktransfer_stock_transactions = [];
    onMount(() => {
        loadStockTransferDetails();
    });
    async function loadStockTransferDetails() {
        if (!stocktransfer) return;
        stocktransfer = await db.stock_transfers.where({ id: Number(stocktransfer.id), status: 1 }).first();
        stocktransfer_items = await db.stock_transfer_items
            .where("stock_transfer_id")
            .equals(stocktransfer.id)
            .and((item) => item.status === 1)
            .toArray();
        stocktransfer_journals = await db.journals
            .where("reference_type")
            .equals("stock_transfer")
            .and((j) => j.reference_id === stocktransfer.id && j.status === 1)
            .toArray();
        stocktransfer_stock_transactions = await db.stock_transactions
            .where("reference_type")
            .equals("stock_transfer")
            .and((st) => st.reference_id === stocktransfer.id && st.status === 1)
            .toArray();
        loading = false;
        console.log("Stock Transfer details loaded:", {
            stocktransfer,
            stocktransfer_items,
            stocktransfer_journals,
            stocktransfer_stock_transactions,
        });
    }
    async function doDeleteStockTransfer() {
        saving = true;
        try {
            let deletedStockTransfer = await db.stock_transfers
                .where("id")
                .equals(stocktransfer.id)
                .first();
            await db.stock_transfers.update(stocktransfer.id, { status: 0 });
            let itemsToDelete = await db.stock_transfer_items
                .where("stock_transfer_id")
                .equals(stocktransfer.id)
                .and((item) => item.status === 1)
                .toArray();
            for (const item of itemsToDelete) {
                await db.stock_transfer_items.update(item.id, { status: 0 });
            }
            let journalsToDelete = await db.journals
                .where("reference_type")
                .equals("stock_transfer")
                .and((j) => j.reference_id === stocktransfer.id && j.status === 1)
                .toArray();
            for (const j of journalsToDelete) {
                await db.journals.update(j.id, { status: 0 });
            }
            let stockTransToDelete = await db.stock_transactions
                .where("reference_type")
                .equals("stock_transfer")
                .and((st) => st.reference_id === stocktransfer.id && st.status === 1)
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
                table_name: "stock_transfers",
                entity_id: stocktransfer.id,
                old_values: JSON.stringify({
                    stocktransfer: deletedStockTransfer,
                    items: itemsToDelete.map((i) => i.id),
                    journals: journalsToDelete.map((j) => j.id),
                    stock_transactions: stockTransToDelete.map((st) => st.id),
                }),
                description: `Deleted stock transfer #${stocktransfer.id}`,
            });
            Swal.fire({
                icon: "success",
                title: t("Deleted!"),
                text: t("Stock Transfer deleted successfully."),
            });
            dispatch("close");
            push(`/dashboard/stock-transfers`);
        } catch (e) {
            console.error("Error deleting stock transfer:", e);
            Swal.fire({
                icon: "error",
                title: t("Error"),
                text: t("An error occurred while deleting the stock transfer."),
                confirmButtonText: t("OK"),
            });
        } finally {
            saving = false;
        }
    }
    async function deleteStockTransfer() {
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
                "Are you sure you want to delete this stock transfer? This action cannot be undone.",
            ),
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: t("Yes, delete it!"),
            cancelButtonText: t("No, keep it"),
        }).then((result) => {
            if (result.isConfirmed) {
                doDeleteStockTransfer();
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
                    {t("Delete Stock Transfer")}
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
                        {t("Are you sure you want to delete this stock transfer? This action cannot be undone.")}<br />
                        {t("All associated journals, items and payments will also be deleted.")}
                    </p>
                    <table>
                        <tbody>
                            <tr>
                                <td><strong>{t("Associated Items")}:</strong></td>
                                <td class="fw-bold ps-3">{@html loading
                                ? `<div class="spinner-border spinner-border-sm" role="status">
                                    <span class="visually-hidden">${t("Loading...")}</span>
                                </div>` : stocktransfer_items.length}</td>
                            </tr>
                            <tr>
                                <td><strong>{t("Associated Journals")}:</strong></td>
                                <td class="fw-bold ps-3">{@html loading 
                                ?   `<div class="spinner-border spinner-border-sm" role="status">
                                                            <span class="visually-hidden">${t("Loading...")}</span>
                                                        </div>` : stocktransfer_journals.length}</td>
                            </tr>
                            <tr>
                                <td><strong>{t("Associated Stock Transactions")}:</strong></td>
                                <td class="fw-bold ps-3">{@html loading
                                ? ` <div class="spinner-border spinner-border-sm" role="status">
                                            <span class="visually-hidden">${t("Loading...")}</span>
                                        </div>` : stocktransfer_stock_transactions.length}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="mt-4">
                        <small>
                            {t(`To confirm deletion, please type`)}
                            {randomNumber}
                            {t(`in the box below:`)}
                        </small>
                        <input
                            type="text"
                            class="form-control form-control-sm mt-2 w-50 { confirmationText != randomNumber ? 'is-invalid':'is-valid' }"
                            bind:value={confirmationText}
                            placeholder={t(`To confirm deletion, please type`)}
                        />
                    </div>
                {/if}
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" on:click={() => dispatch("close")}><i class="bi bi-x-lg"></i> {t("Cancel")}</button>
                <button class="btn btn-danger" on:click={deleteStockTransfer} disabled={saving || loading}>
                    <i class="bi bi-trash"></i>{@html saving
                    ? ` <div class="spinner-border spinner-border-sm" role="status">
                            <span class="visually-hidden">${t("Deleting...")}</span>
                        </div>`
                    : t("Delete")}
                </button>
            </div>
        </div>
    </div>
</div>
