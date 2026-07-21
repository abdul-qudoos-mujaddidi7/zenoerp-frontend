<script>
    import { db, logActivity } from "../../db.js";
    import { onMount, createEventDispatcher } from "svelte";
    import { t, lang, translate_org_type } from "../../i18n/i18n";
    import { toast } from "../../ToastUI/toast.js";
    import ConfirmActionModal from "../../components/common/ConfirmActionModal.svelte";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    import { push } from "svelte-spa-router";

    import { calculateProductStock } from "../stocktransactions/calculateStock.js";
    export let purchase;

    const dispatch = createEventDispatcher();

    let saving = false;
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

            toast.success(t("Deleted!"), t("Purchase deleted successfully."));

            dispatch("close");

            push(`/dashboard/purchases`);
        } catch (e) {
            console.error("Error deleting purchase:", e);
            toast.error(t("Error"), t("An error occurred while deleting the purchase."));
        } finally {
            saving = false;
        }
    }
</script>

<ConfirmActionModal
    title={t("Delete Purchase")}
    icon="bi-trash"
    variant="danger"
    dangerAlert
    {loading}
    {saving}
    savingLabel={t("Deleting...")}
    warningMessage={t("Are you sure you want to delete this purchase? This action cannot be undone.")}
    warningDetail={t("All associated journals, items and payments will also be deleted.")}
    stats={[
        { label: t("Associated Items"), value: loading ? "…" : purchase_items.length },
        { label: t("Associated Payments"), value: loading ? "…" : purchase_payments.length },
        { label: t("Associated Returns"), value: loading ? "…" : purchase_returns.length },
        { label: t("Associated Return Items"), value: loading ? "…" : purchase_return_items.length },
        { label: t("Associated Journals"), value: loading ? "…" : purchase_journals.length },
        { label: t("Associated Stock Transactions"), value: loading ? "…" : purchase_stock_transactions.length },
    ]}
    actionLabel={t("Delete")}
    actionIcon="bi-trash"
    actionVariant="danger"
    inputId="delete-purchase-confirm-input"
    confirmPrompt={{
        title: t("Are you sure?"),
        message: t("Are you sure you want to delete this purchase? This action cannot be undone."),
        confirmText: t("Yes, delete it!"),
        cancelText: t("No, keep it"),
        variant: "danger",
        icon: "bi-trash",
    }}
    on:confirm={doDeletePurchase}
    on:close={() => dispatch("close")} />
