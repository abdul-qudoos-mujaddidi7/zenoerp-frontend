<script>
    import { db, logActivity } from "../../db.js";
    import { onMount, createEventDispatcher } from "svelte";
    import { t, lang, translate_org_type } from "../../i18n/i18n";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    import { push } from "svelte-spa-router";
    import { toast } from "../../ToastUI/toast.js";
    import ConfirmActionModal from "../../components/common/ConfirmActionModal.svelte";
    import { calculateProductStock } from "../stocktransactions/calculateStock.js";
    import {
        fetchOrganizationInventoryMethod,
        getInventoryMethod,
    } from "../../stores/organizationStore.js";

    export let sale;

    const dispatch = createEventDispatcher();

    let saving = false;
    let loading = true;

    let sale_items = [];
    let sale_payments = [];
    let sale_returns = [];
    let sale_return_items = [];

    let sale_journals = [];

    let sale_stock_transactions = [];

    onMount(() => {
        loadSaleDetails();
    });

    async function loadSaleDetails() {
        if (!sale) return;

        sale = await db.sales.where({ id: Number(sale.id), status: 1 }).first();
        // Load sale items
        sale_items = await db.sale_items
            .where("sale_id")
            .equals(sale.id)
            .and((item) => item.status === 1)
            .toArray();

        // Load payments
        sale_payments = await db.sale_payments
            .where("sale_id")
            .equals(sale.id)
            .and((p) => p.status === 1)
            .toArray();



        // Load returns
        sale_returns = await db.sale_returns
            .where("sale_id")
            .equals(sale.id)
            .and((r) => r.status === 1)
            .toArray();

        const returnIds = sale_returns.map((r) => r.id);
        if (returnIds.length > 0) {
            sale_return_items = await db.sale_return_items
                .where("sale_return_id")
                .anyOf(returnIds)
                .and((ri) => ri.status === 1)
                .toArray();
        }

        // Load associated journals
        sale_journals = await db.journals
            .where("reference_type")
            .equals("sale")
            .and((j) => j.reference_id === sale.id)
            .toArray();


        // Load associated stock transactions
        sale_stock_transactions = await db.stock_transactions
            .where("reference_type")
            .equals("sale")
            .and((st) => st.reference_id === sale.id && st.status === 1)
            .toArray();

        // append sale return transactions to sale stock transactions for unified display
        for (const ret of sale_returns) {
            const retTrans = await db.stock_transactions
                .where("reference_type")
                .equals("sale_return")
                .and((st) => st.reference_id === ret.id && st.status === 1)
                .toArray();
            sale_stock_transactions = sale_stock_transactions.concat(retTrans);
        }

        // append sale_return journals to sale journals for unified display
        for (const ret of sale_returns) {
            const retJournals = await db.journals
                .where("reference_type")
                .equals("sale_return")
                .and((j) => j.reference_id === ret.id && j.status === 1)
                .toArray();
            sale_journals = sale_journals.concat(retJournals);
        }

        for (const p of sale_payments) {
            const paymentJournals = await db.journals
                .where("reference_type")
                .equals("sale_payment")
                .and((j) => j.reference_id === p.id && j.status === 1)
                .toArray();
            sale_journals = sale_journals.concat(paymentJournals);
        }

        loading = false;
        console.log("Sale details loaded:", {
            sale,
            sale_items,
            sale_payments,
            sale_returns,
            sale_return_items,
            sale_journals,
            sale_stock_transactions,
        });
    }
    async function doDeleteSale() {
        saving = true;
        try {
            const saleId = Number(sale.id);

            // Avoid a network request from inventory recalculation after the
            // Dexie transaction has started, which would make it auto-commit.
            if (!getInventoryMethod()) {
                await fetchOrganizationInventoryMethod();
            }

            await db.transaction(
                "rw",
                [
                    db.sales,
                    db.sale_items,
                    db.sale_payments,
                    db.sale_returns,
                    db.sale_return_items,
                    db.journals,
                    db.stock_transactions,
                    db.activity_logs,
                    db.warehouses,
                    db.products,
                    db.product_units,
                    db.warehouse_products,
                    db.stock_batches,
                ],
                async () => {
                    const deletedSale = await db.sales.get(saleId);
                    if (!deletedSale || deletedSale.status !== 1) {
                        throw new Error(`Active sale #${saleId} was not found.`);
                    }

                    const itemsToDelete = await db.sale_items
                        .where("sale_id")
                        .equals(saleId)
                        .and((item) => item.status === 1)
                        .toArray();

                    const paymentsToDelete = await db.sale_payments
                        .where("sale_id")
                        .equals(saleId)
                        .and((payment) => payment.status === 1)
                        .toArray();

                    const returnsToDelete = await db.sale_returns
                        .where("sale_id")
                        .equals(saleId)
                        .and((saleReturn) => saleReturn.status === 1)
                        .toArray();

                    let returnItemsToDelete = [];
                    if (returnsToDelete.length > 0) {
                        const returnIds = returnsToDelete.map((saleReturn) => saleReturn.id);
                        returnItemsToDelete = await db.sale_return_items
                            .where("sale_return_id")
                            .anyOf(returnIds)
                            .and((returnItem) => returnItem.status === 1)
                            .toArray();
                    }

                    let journalsToDelete = await db.journals
                        .where("reference_type")
                        .equals("sale")
                        .and((journal) => journal.reference_id === saleId && journal.status === 1)
                        .toArray();

                    for (const saleReturn of returnsToDelete) {
                        const returnJournals = await db.journals
                            .where("reference_type")
                            .equals("sale_return")
                            .and(
                                (journal) =>
                                    journal.reference_id === saleReturn.id && journal.status === 1,
                            )
                            .toArray();
                        journalsToDelete = journalsToDelete.concat(returnJournals);
                    }

                    for (const payment of paymentsToDelete) {
                        const paymentJournals = await db.journals
                            .where("reference_type")
                            .equals("sale_payment")
                            .and(
                                (journal) =>
                                    journal.reference_id === payment.id && journal.status === 1,
                            )
                            .toArray();
                        journalsToDelete = journalsToDelete.concat(paymentJournals);
                    }

                    let stockTransToDelete = await db.stock_transactions
                        .where("reference_type")
                        .equals("sale")
                        .and(
                            (transaction) =>
                                transaction.reference_id === saleId && transaction.status === 1,
                        )
                        .toArray();

                    for (const saleReturn of returnsToDelete) {
                        const returnTransactions = await db.stock_transactions
                            .where("reference_type")
                            .equals("sale_return")
                            .and(
                                (transaction) =>
                                    transaction.reference_id === saleReturn.id &&
                                    transaction.status === 1,
                            )
                            .toArray();
                        stockTransToDelete = stockTransToDelete.concat(returnTransactions);
                    }

                    for (const item of itemsToDelete) {
                        await db.sale_items.update(item.id, { status: 0 });
                    }
                    for (const payment of paymentsToDelete) {
                        await db.sale_payments.update(payment.id, { status: 0 });
                    }
                    for (const saleReturn of returnsToDelete) {
                        await db.sale_returns.update(saleReturn.id, { status: 0 });
                    }
                    for (const returnItem of returnItemsToDelete) {
                        await db.sale_return_items.update(returnItem.id, { status: 0 });
                    }
                    for (const journal of journalsToDelete) {
                        await db.journals.update(journal.id, { status: 0 });
                    }
                    for (const stockTransaction of stockTransToDelete) {
                        await db.stock_transactions.update(stockTransaction.id, { status: 0 });
                    }

                    const affectedProductIds = [
                        ...new Set(
                            stockTransToDelete.map((transaction) => Number(transaction.product_id)),
                        ),
                    ].filter(Number.isFinite);

                    for (const productId of affectedProductIds) {
                        await calculateProductStock(productId);
                    }

                    await db.sales.update(saleId, { status: 0 });

                    const activityLogged = await logActivity({
                        user_id: parseInt(localStorage.getItem("user_id")) || 0,
                        action: "delete",
                        table_name: "sales",
                        entity_id: saleId,
                        old_values: JSON.stringify({
                            sale: deletedSale,
                            items: itemsToDelete.map((item) => item.id),
                            payments: paymentsToDelete.map((payment) => payment.id),
                            returns: returnsToDelete.map((saleReturn) => saleReturn.id),
                            return_items: returnItemsToDelete.map((returnItem) => returnItem.id),
                            journals: journalsToDelete.map((journal) => journal.id),
                            stock_transactions: stockTransToDelete.map(
                                (transaction) => transaction.id,
                            ),
                        }),
                        description: `Deleted sale #${saleId}`,
                    });

                    if (!activityLogged) {
                        throw new Error(`Failed to log deletion of sale #${saleId}.`);
                    }
                },
            );

            toast.success(t("Deleted!"),t("Sale deleted successfully."));

            dispatch("close");

            push(`/dashboard/sales`);
        } catch (e) {
            console.error("Error deleting sale:", e);
            toast.error(t("Error"),t("An error occurred while deleting the sale."));
            // alert(t("An error occurred while deleting the sale."));
        } finally {
            saving = false;
        }
    }
</script>

<ConfirmActionModal
    title={t("Delete Sale")}
    icon="bi-trash"
    variant="danger"
    dangerAlert
    {loading}
    {saving}
    savingLabel={t("Deleting...")}
    warningMessage={t("Are you sure you want to delete this sale? This action cannot be undone.")}
    warningDetail={t("All associated journals, items and payments will also be deleted.")}
    stats={[
        { label: t("Associated Items"), value: loading ? "…" : sale_items.length },
        { label: t("Associated Payments"), value: loading ? "…" : sale_payments.length },
        { label: t("Associated Returns"), value: loading ? "…" : sale_returns.length },
        { label: t("Associated Return Items"), value: loading ? "…" : sale_return_items.length },
        { label: t("Associated Journals"), value: loading ? "…" : sale_journals.length },
        { label: t("Associated Stock Transactions"), value: loading ? "…" : sale_stock_transactions.length },
    ]}
    actionLabel={t("Delete")}
    actionIcon="bi-trash"
    actionVariant="danger"
    inputId="delete-sale-confirm-input"
    confirmPrompt={{
        title: t("Are you sure?"),
        message: t("Are you sure you want to delete this sale? This action cannot be undone."),
        confirmText: t("Yes, delete it!"),
        cancelText: t("No, keep it"),
        variant: "danger",
        icon: "bi-trash",
    }}
    on:confirm={doDeleteSale}
    on:close={() => dispatch("close")} />
