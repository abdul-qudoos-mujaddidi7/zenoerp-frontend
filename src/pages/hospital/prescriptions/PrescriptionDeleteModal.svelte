<script>
    import { db, logActivity } from "../../../db.js";
    import { onMount, createEventDispatcher } from "svelte";
    import { t, lang, translate_org_type } from "../../../i18n/i18n.js";
    import { on } from "svelte/events";
    import Swal from "sweetalert2";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    import { push } from "svelte-spa-router";

    import { calculateProductStock } from "../../stocktransactions/calculateStock.js";
    export let prescription;

    const dispatch = createEventDispatcher();

    let saving = false;
    let confirmationText = "";
    let randomNumber = Math.floor(Math.random() * 900) + 100; // simple random number for confirmation
    let loading = true;

    let prescription_items = [];
    let prescription_payments = [];
    let prescription_returns = [];
    let prescription_return_items = [];

    let prescription_journals = [];

    let prescription_stock_transactions = [];

    onMount(() => {
        loadPrescriptionDetails();
    });

    async function loadPrescriptionDetails() {
        if (!prescription) return;

        prescription = await db.prescriptions.where({ id: Number(prescription.id), status: 1 }).first();
        // Load prescription items
        prescription_items = await db.prescription_items
            .where("prescription_id")
            .equals(prescription.id)
            .and((item) => item.status === 1)
            .toArray();

        // Load payments
        prescription_payments = await db.prescription_payments
            .where("prescription_id")
            .equals(prescription.id)
            .and((p) => p.status === 1)
            .toArray();



        // Load returns
        prescription_returns = await db.prescription_returns
            .where("prescription_id")
            .equals(prescription.id)
            .and((r) => r.status === 1)
            .toArray();

        const returnIds = prescription_returns.map((r) => r.id);
        if (returnIds.length > 0) {
            prescription_return_items = await db.prescription_return_items
                .where("prescription_return_id")
                .anyOf(returnIds)
                .and((ri) => ri.status === 1)
                .toArray();
        }

        // Load associated journals
        prescription_journals = await db.journals
            .where("reference_type")
            .equals("prescription")
            .and((j) => j.reference_id === prescription.id && j.status === 1)
            .toArray();


        // Load associated stock transactions
        prescription_stock_transactions = await db.stock_transactions
            .where("reference_type")
            .equals("prescription")
            .and((st) => st.reference_id === prescription.id && st.status === 1)
            .toArray();

        // append prescription return transactions to prescription stock transactions for unified display
        for (const ret of prescription_returns) {
            const retTrans = await db.stock_transactions
                .where("reference_type")
                .equals("prescription_return")
                .and((st) => st.reference_id === ret.id && st.status === 1)
                .toArray();
            prescription_stock_transactions = prescription_stock_transactions.concat(retTrans);
        }

        // append prescription_return journals to prescription journals for unified display
        for (const ret of prescription_returns) {
            const retJournals = await db.journals
                .where("reference_type")
                .equals("prescription_return")
                .and((j) => j.reference_id === ret.id && j.status === 1)
                .toArray();
            prescription_journals = prescription_journals.concat(retJournals);
        }

        for (const p of prescription_payments) {
            const paymentJournals = await db.journals
                .where("reference_type")
                .equals("prescription_payment")
                .and((j) => j.reference_id === p.id && j.status === 1)
                .toArray();
            prescription_journals = prescription_journals.concat(paymentJournals);
        }

        loading = false;
        console.log("Prescription details loaded:", {
            prescription,
            prescription_items,
            prescription_payments,
            prescription_returns,
            prescription_return_items,
            prescription_journals,
            prescription_stock_transactions,
        });
    }
    async function doDeletePrescription() {
        saving = true;
        try {
            // Mark prescription as deleted
            let deletedPrescription = await db.prescriptions
                .where("id")
                .equals(prescription.id)
                .first();
            await db.prescriptions.update(prescription.id, { status: 0 });

            // Mark associated prescription items as deleted
            let itemsToDelete = await db.prescription_items
                .where("prescription_id")
                .equals(prescription.id)
                .and((item) => item.status === 1)
                .toArray();
            for (const item of itemsToDelete) {
                await db.prescription_items.update(item.id, { status: 0 });
            }

            // Mark associated payments as deleted

            let paymentsToDelete = await db.prescription_payments
                .where("prescription_id")
                .equals(prescription.id)
                .and((p) => p.status === 1)
                .toArray();
            for (const p of paymentsToDelete) {
                await db.prescription_payments.update(p.id, { status: 0 });
            }

            // Mark associated returns as deleted

            let returnsToDelete = await db.prescription_returns
                .where("prescription_id")
                .equals(prescription.id)
                .and((r) => r.status === 1)
                .toArray();
            for (const r of returnsToDelete) {
                await db.prescription_returns.update(r.id, { status: 0 });
            }

            // Mark associated return items as deleted
            let returnItemsToDelete = [];
            if (returnsToDelete.length > 0) {
                const returnIds = returnsToDelete.map((r) => r.id);
                let returnItemsToDeleteFromReturn = await db.prescription_return_items
                    .where("prescription_return_id")
                    .anyOf(returnIds)
                    .and((ri) => ri.status === 1)
                    .toArray();
                returnItemsToDelete = returnItemsToDelete.concat(
                    returnItemsToDeleteFromReturn,
                );
            }

            for (const ri of returnItemsToDelete) {
                await db.prescription_return_items.update(ri.id, { status: 0 });
            }

            // Mark associated journals as deleted
            let journalsToDelete = await db.journals
                .where("reference_type")
                .equals("prescription")
                .and((j) => j.reference_id === prescription.id && j.status === 1)
                .toArray();

            // Mark prescription_return journals as deleted
            for (const ret of prescription_returns) {
                let retJournalsToDelete = await db.journals
                    .where("reference_type")
                    .equals("prescription_return")
                    .and((j) => j.reference_id === ret.id && j.status === 1)
                    .toArray();
                journalsToDelete = journalsToDelete.concat(retJournalsToDelete);
            }

            // Mark prescription_payment journals as deleted
            for (const p of paymentsToDelete) {
                let paymentJournalsToDelete = await db.journals
                    .where("reference_type")
                    .equals("prescription_payment")
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
                .equals("prescription")
                .and((st) => st.reference_id === prescription.id && st.status === 1)
                .toArray();

            // Mark prescription_return stock transactions as deleted
            for (const ret of prescription_returns) {
                let retStockTransToDelete = await db.stock_transactions
                    .where("reference_type")
                    .equals("prescription_return")
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
                table_name: "prescriptions",
                entity_id: prescription.id,
                old_values: JSON.stringify({
                    prescription: deletedPrescription,
                    items: itemsToDelete.map((i) => i.id),
                    payments: paymentsToDelete.map((p) => p.id),
                    returns: returnsToDelete.map((r) => r.id),
                    return_items: returnItemsToDelete.map((ri) => ri.id),
                    journals: journalsToDelete.map((j) => j.id),
                    stock_transactions: stockTransToDelete.map((st) => st.id),
                }),
                description: `Deleted prescription #${prescription.id}`,
            });

            Swal.fire({
                icon: "success",
                title: t("Deleted!"),
                text: t("Prescription deleted successfully."),
            });

            dispatch("close");

            push(`/dashboard/prescriptions`);
        } catch (e) {
            console.error("Error deleting prescription:", e);
            Swal.fire({
                icon: "error",
                title: t("Error"),
                text: t("An error occurred while deleting the prescription."),
                confirmButtonText: t("OK"),
            });
            // alert(t("An error occurred while deleting the prescription."));
        } finally {
            saving = false;
        }
    }

    async function deletePrescription() {
        if (confirmationText !== String(randomNumber)) {
            Swal.fire({
                icon: "error",
                title: t("Confirmation Failed"),
                text: t(
                    "Confirmation text does not match. Please type the correct number to confirm deletion.",
                ),
                confirmButtonText: t("OK"),
            });
            // alert(t("Confirmation text does not match. Please type the correct number to confirm deletion."));
            return;
        }
        Swal.fire({
            title: t("Are you sure?"),
            text: t(
                "Are you sure you want to delete this prescription? This action cannot be undone.",
            ),
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: t("Yes, delete it!"),
            cancelButtonText: t("No, keep it"),
        }).then((result) => {
            if (result.isConfirmed) {
                doDeletePrescription();
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
                    {t("Delete Prescription")}
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
                            "Are you sure you want to delete this prescription? This action cannot be undone.",
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
                                        : prescription_items.length}</td
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
                                        : prescription_payments.length}</td
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
                                        : prescription_returns.length}</td
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
                                        : prescription_return_items.length}</td
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
                                        : prescription_journals.length}</td
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
                                        : prescription_stock_transactions.length}</td
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
                    on:click={deletePrescription}
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
