<script>
    import { db, logActivity } from "../../../db.js";
    import { onMount, createEventDispatcher } from "svelte";
    import { t, lang, translate_org_type } from "../../../i18n/i18n";
    import Swal from "sweetalert2";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    import { push } from "svelte-spa-router";

    import { calculateProductStock } from "../../stocktransactions/calculateStock.js";
    export let purchase;

    const dispatch = createEventDispatcher();

    let saving = false;
    let confirmationText = "";
    let randomNumber = Math.floor(Math.random() * 900) + 100; // simple random number for confirmation
    let loading = true;

    let purchase_items = [];
    let purchase_payments = [];
    let purchase_returns = [];
    let purchase_return_items = [];

    let purchase_journals = [];

    let purchase_stock_transactions = [];

    onMount(() => {
        loadPurchaseDetails();
    });

    async function loadPurchaseDetails() {
        if (!purchase) return;

        purchase = await db.purchases.where({ id: Number(purchase.id), status: 1 }).first();
        // Load purchase items
        purchase_items = await db.purchase_items
            .where("purchase_id")
            .equals(purchase.id)
            .and((item) => item.status === 1)
            .toArray();

        // Load payments
        purchase_payments = await db.purchase_payments
            .where("purchase_id")
            .equals(purchase.id)
            .and((p) => p.status === 1)
            .toArray();

        // Load returns
        purchase_returns = await db.purchase_returns
            .where("purchase_id")
            .equals(purchase.id)
            .and((r) => r.status === 1)
            .toArray();

        const returnIds = purchase_returns.map((r) => r.id);
        if (returnIds.length > 0) {
            purchase_return_items = await db.purchase_return_items
                .where("purchase_return_id")
                .anyOf(returnIds)
                .and((ri) => ri.status === 1)
                .toArray();
        }

        // Load associated journals
        purchase_journals = await db.journals
            .where("reference_type")
            .equals("purchase")
            .and((j) => j.reference_id === purchase.id && j.status === 1)
            .toArray();

        // Load associated stock transactions
        purchase_stock_transactions = await db.stock_transactions
            .where("reference_type")
            .equals("purchase")
            .and((st) => st.reference_id === purchase.id && st.status === 1)
            .toArray();

        // append purchase return transactions to purchase stock transactions for unified display
        for (const ret of purchase_returns) {
            const retTrans = await db.stock_transactions
                .where("reference_type")
                .equals("purchase_return")
                .and((st) => st.reference_id === ret.id && st.status === 1)
                .toArray();
            purchase_stock_transactions = purchase_stock_transactions.concat(retTrans);
        }

        // append purchase_return journals to purchase journals for unified display
        for (const ret of purchase_returns) {
            const retJournals = await db.journals
                .where("reference_type")
                .equals("purchase_return")
                .and((j) => j.reference_id === ret.id && j.status === 1)
                .toArray();
            purchase_journals = purchase_journals.concat(retJournals);
        }

        for (const p of purchase_payments) {
            const paymentJournals = await db.journals
                .where("reference_type")
                .equals("purchase_payment")
                .and((j) => j.reference_id === p.id && j.status === 1)
                .toArray();
            purchase_journals = purchase_journals.concat(paymentJournals);
        }
        loading = false;
    }
    async function doDeletePurchase() {
        saving = true;
        try {
            // Mark purchase as deleted
            let deletedPurchase = await db.purchases
                .where("id")
                .equals(purchase.id)
                .first();
            await db.purchases.update(purchase.id, { status: 0 });

            // Mark associated purchase items as deleted
            let itemsToDelete = await db.purchase_items
                .where("purchase_id")
                .equals(purchase.id)
                .and((item) => item.status === 1)
                .toArray();
            for (const item of itemsToDelete) {
                await db.purchase_items.update(item.id, { status: 0 });
            }

            // Mark associated payments as deleted

            let paymentsToDelete = await db.purchase_payments
                .where("purchase_id")
                .equals(purchase.id)
                .and((p) => p.status === 1)
                .toArray();
            for (const p of paymentsToDelete) {
                await db.purchase_payments.update(p.id, { status: 0 });
            }

            // Mark associated returns as deleted

            let returnsToDelete = await db.purchase_returns
                .where("purchase_id")
                .equals(purchase.id)
                .and((r) => r.status === 1)
                .toArray();
            for (const r of returnsToDelete) {
                await db.purchase_returns.update(r.id, { status: 0 });
            }

            // Mark associated return items as deleted
            let returnItemsToDelete = [];
            if (returnsToDelete.length > 0) {
                const returnIds = returnsToDelete.map((r) => r.id);
                let returnItemsToDeleteFromReturn = await db.purchase_return_items
                    .where("purchase_return_id")
                    .anyOf(returnIds)
                    .and((ri) => ri.status === 1)
                    .toArray();
                returnItemsToDelete = returnItemsToDelete.concat(
                    returnItemsToDeleteFromReturn,
                );
            }

            for (const ri of returnItemsToDelete) {
                await db.purchase_return_items.update(ri.id, { status: 0 });
            }

            // Mark associated journals as deleted
            let journalsToDelete = await db.journals
                .where("reference_type")
                .equals("purchase")
                .and((j) => j.reference_id === purchase.id && j.status === 1)
                .toArray();

            // Mark purchase_return journals as deleted
            for (const ret of purchase_returns) {
                let retJournalsToDelete = await db.journals
                    .where("reference_type")
                    .equals("purchase_return")
                    .and((j) => j.reference_id === ret.id && j.status === 1)
                    .toArray();
                journalsToDelete = journalsToDelete.concat(retJournalsToDelete);
            }


            // Mark purchase_payment journals as deleted
            for (const p of purchase_payments) {
                let paymentJournalsToDelete = await db.journals
                    .where("reference_type")
                    .equals("purchase_payment")
                    .and((j) => j.reference_id === p.id && j.status === 1)
                    .toArray();
                journalsToDelete = journalsToDelete.concat(paymentJournalsToDelete);
            }

            for (const j of journalsToDelete) {
                await db.journals.update(j.id, { status: 0 });
            }

            // Mark associated stock transactions as deleted

            let stockTransToDelete = await db.stock_transactions
                .where("reference_type")
                .equals("purchase")
                .and((st) => st.reference_id === purchase.id && st.status === 1)
                .toArray();

            // Mark purchase_return stock transactions as deleted
            for (const ret of purchase_returns) {
                let retStockTransToDelete = await db.stock_transactions
                    .where("reference_type")
                    .equals("purchase_return")
                    .and((st) => st.reference_id === ret.id && st.status === 1)
                    .toArray();
                stockTransToDelete = stockTransToDelete.concat(
                    retStockTransToDelete,
                );
            }

            for (const st of stockTransToDelete) {
                await db.stock_transactions.update(st.id, { status: 0 });
                await calculateProductStock(
                    Number(st.product_id),'single'
                );
            }

            await logActivity({
                user_id: parseInt(localStorage.getItem("user_id")) || 0,
                action: "delete",
                table_name: "purchases",
                entity_id: purchase.id,
                old_values: JSON.stringify({
                    purchase: deletedPurchase,
                    items: itemsToDelete.map((i) => i.id),
                    payments: paymentsToDelete.map((p) => p.id),
                    returns: returnsToDelete.map((r) => r.id),
                    return_items: returnItemsToDelete.map((ri) => ri.id),
                    journals: journalsToDelete.map((j) => j.id),
                    stock_transactions: stockTransToDelete.map((st) => st.id),
                }),
                description: `Deleted purchase #${purchase.id}`,
            });

            Swal.fire({
                icon: "success",
                title: t("Deleted!"),
                text: t("Purchase deleted successfully."),
                confirmButtonText: t("OK"),
            });

            dispatch("close");

            push(`/dashboard/purchases`);
        } catch (e) {
            console.error("Error deleting purchase:", e);
            Swal.fire({
                icon: "error",
                title: t("Error"),
                text: t("An error occurred while deleting the purchase."),
                confirmButtonText: t("OK"),
            });
        } finally {
            saving = false;
        }
    }

    async function deletePurchase() {
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
                "Are you sure you want to delete this purchase? This action cannot be undone.",
            ),
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: t("Yes, delete it!"),
            cancelButtonText: t("No, keep it"),
        }).then((result) => {
            if (result.isConfirmed) {
                doDeletePurchase();
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
                    {t("Delete Purchase")}
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
                        <i class="bi bi-exclamation-triangle me-2"></i>{t(
                            "Warning!",
                        )}
                    </h1>
                    <p>
                        {t(
                            "Are you sure you want to delete this purchase? This action cannot be undone.",
                        )}<br />
                        {t(
                            "All associated journals, items and payments will also be deleted.",
                        )}
                    </p>

                    <table>
                        <tbody>
                            <tr>
                                <td
                                    ><strong>{t("Associated Items")}:</strong
                                    ></td
                                >
                                <td class="fw-bold ps-3"
                                    >{@html loading
                                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t("Loading...")}</span>
</div>`
                                        : purchase_items.length}</td
                                >
                            </tr>
                            <tr>
                                <td
                                    ><strong>{t("Associated Payments")}:</strong
                                    ></td
                                >
                                <td class="fw-bold ps-3"
                                    >{@html loading
                                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t("Loading...")}</span>
</div>`
                                        : purchase_payments.length}</td
                                >
                            </tr>
                            <tr>
                                <td
                                    ><strong>{t("Associated Returns")}:</strong
                                    ></td
                                >
                                <td class="fw-bold ps-3"
                                    >{@html loading
                                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t("Loading...")}</span>
</div>`
                                        : purchase_returns.length}</td
                                >
                            </tr>
                            <tr>
                                <td
                                    ><strong
                                        >{t("Associated Return Items")}:</strong
                                    ></td
                                >
                                <td class="fw-bold ps-3"
                                    >{@html loading
                                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t("Loading...")}</span>
</div>`
                                        : purchase_return_items.length}</td
                                >
                            </tr>
                            <tr>
                                <td
                                    ><strong>{t("Associated Journals")}:</strong
                                    ></td
                                >
                                <td class="fw-bold ps-3"
                                    >{@html loading
                                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t("Loading...")}</span>
</div>`
                                        : purchase_journals.length}</td
                                >
                            </tr>
                            <tr>
                                <td
                                    ><strong
                                        >{t(
                                            "Associated Stock Transactions",
                                        )}:</strong
                                    ></td
                                >
                                <td class="fw-bold ps-3"
                                    >{@html loading
                                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t("Loading...")}</span>
</div>`
                                        : purchase_stock_transactions.length}</td
                                >
                            </tr>
                        </tbody>
                    </table>

                    <!-- create a mini captcha system -->
                    <div class="mt-4">
                        <small
                            >{t(`To confirm deletion, please type`)}
                            {randomNumber}
                            {t(`in the box below:`)}</small
                        >
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
                <button
                    class="btn btn-secondary"
                    on:click={() => dispatch("close")}
                    ><i class="bi bi-x-lg"></i> {t("Cancel")}</button
                >
                <button
                    class="btn btn-danger"
                    on:click={deletePurchase}
                    disabled={saving || loading}
                    ><i class="bi bi-trash"></i>
                    {@html saving
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t("Deleting...")}</span>
</div>`
                        : t("Delete")}</button
                >
            </div>
        </div>
    </div>
</div>
