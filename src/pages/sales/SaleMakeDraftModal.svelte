<script>
    import { db, logActivity } from "../../db.js";
    import { onMount, createEventDispatcher } from "svelte";
    import { t, lang, translate_org_type } from "../../i18n/i18n.js";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    import { push } from "svelte-spa-router";
    import { toast } from "../../ToastUI/toast.js";
    import ConfirmActionModal from "../../components/common/ConfirmActionModal.svelte";
    import { calculateProductStock } from "../stocktransactions/calculateStock.js";

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
                .where('[reference_type+reference_id+status]')
                .equals(['sale', sale.id, 1])
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
    async function doDraftSale() {
        let startTime = Date.now();
        saving = true;
        try {

            // Mark sale as drafted
            let draftedSale = await db.sales
                .where("id")
                .equals(sale.id)
                .first();
            

            // Mark associated payments as deleted

            let paymentsToDelete = await db.sale_payments
                .where("sale_id")
                .equals(sale.id)
                .and((p) => p.status === 1)
                .toArray();

            await db.sale_payments.bulkUpdate(
                paymentsToDelete.map(p => ({
                    key: p.id,
                    changes: { status: 0 }
                }))
            );

            console.log(`Payments marked as deleted in ${Date.now() - startTime}ms`);

            // Mark associated returns as deleted

            let returnsToDelete = await db.sale_returns
                .where("sale_id")
                .equals(sale.id)
                .and((r) => r.status === 1)
                .toArray();
            
            await db.sale_returns.bulkUpdate(
                returnsToDelete.map(r => ({
                    key: r.id,
                    changes: { status: 0 }
                }))
            );

            console.log(`Returns marked as deleted in ${Date.now() - startTime}ms`);

            // Mark associated return items as deleted
            let returnItemsToDelete = [];
            if (returnsToDelete.length > 0) {
                const returnIds = returnsToDelete.map((r) => r.id);
                let returnItemsToDeleteFromReturn = await db.sale_return_items
                    .where("sale_return_id")
                    .anyOf(returnIds)
                    .and((ri) => ri.status === 1)
                    .toArray();
                returnItemsToDelete = returnItemsToDelete.concat(
                    returnItemsToDeleteFromReturn,
                );
            }

            await db.sale_return_items.bulkUpdate(
                returnItemsToDelete.map(ri => ({
                    key: ri.id,
                    changes: { status: 0 }
                }))
            );

            console.log(`Return items marked as deleted in ${Date.now() - startTime}ms`);

            // Mark associated journals as deleted
            let journalsToDelete = await db.journals
                .where("reference_type")
                .equals("sale")
                .and((j) => j.reference_id == sale.id)
                .toArray();


            // Mark sale_return journals as deleted
            for (const ret of sale_returns) {
                let retJournalsToDelete = await db.journals
                    .where("reference_type")
                    .equals("sale_return")
                    .and((j) => j.reference_id === ret.id && j.status === 1)
                    .toArray();
                journalsToDelete = journalsToDelete.concat(retJournalsToDelete);
            }

            // Mark sale_payment journals as deleted
            for (const p of paymentsToDelete) {
                let paymentJournalsToDelete = await db.journals
                    .where("reference_type")
                    .equals("sale_payment")
                    .and((j) => j.reference_id === p.id && j.status === 1)
                    .toArray();
                journalsToDelete = journalsToDelete.concat(paymentJournalsToDelete);
            }


            await db.journals.bulkUpdate(
                journalsToDelete.map(j => ({
                    key: j.id,
                    changes: { status: 0 }
                }))
            );

            console.log(`Journals marked as deleted in ${Date.now() - startTime}ms`);

            // Mark associated stock transactions as deleted

            let stockTransToDelete = await db.stock_transactions
                .where('[reference_type+reference_id+status]')
                .equals(['sale', sale.id, 1])
                .toArray();

            // Mark sale_return stock transactions as deleted
            for (const ret of sale_returns) {
                let retStockTransToDelete = await db.stock_transactions
                    .where("reference_type")
                    .equals("sale_return")
                    .and((st) => st.reference_id === ret.id && st.status === 1)
                    .toArray();
                stockTransToDelete = stockTransToDelete.concat(
                    retStockTransToDelete,
                );
            }

            await db.stock_transactions.bulkUpdate(
                stockTransToDelete.map(st => ({
                    key: st.id,
                    changes: { status: 0 }
                }))
            );



            console.log(`Stock transactions marked as deleted in ${Date.now() - startTime}ms`);

            for (const st of stockTransToDelete) {
                await calculateProductStock(
                    Number(st.product_id),'single'
                );
            }

            console.log(`Product stock recalculated in ${Date.now() - startTime}ms`);

            



            await db.sales.update(sale.id, { invoice_status: "draft" });
            console.log(`Sale marked as draft in ${Date.now() - startTime}ms`);
            await logActivity({
                user_id: parseInt(localStorage.getItem("user_id")) || 0,
                action: "drafted",
                table_name: "sales",
                entity_id: sale.id,
                old_values: JSON.stringify({
                    sale: draftedSale,
                    payments: paymentsToDelete.map((p) => p.id),
                    returns: returnsToDelete.map((r) => r.id),
                    return_items: returnItemsToDelete.map((ri) => ri.id),
                    journals: journalsToDelete.map((j) => j.id),
                    stock_transactions: stockTransToDelete.map((st) => st.id),
                }),
                description: `Drafted sale #${sale.id}`,
            });
            
            console.log(`Activity logged in ${Date.now() - startTime}ms`);

            toast.success(t("Drafted!"), t("Sale drafted successfully."));

            dispatch("close");

            push(`/dashboard/sale-form/${sale.id}`);
        } catch (e) {
            console.error("Error drafting sale:", e);
            toast.error(t("Error"), t("An error occurred while drafting the sale."));
            // alert(t("An error occurred while drafting the sale."));
        } finally {
            saving = false;
        }
    }
</script>

<ConfirmActionModal
    title={t("Make Draft")}
    icon="bi-file-earmark"
    variant="warning"
    {loading}
    {saving}
    savingLabel={t("Making Draft...")}
    warningMessage={t("Are you sure you want to make this sale a draft? This action cannot be undone.")}
    warningDetail={t("All associated journals, items and payments will also be deleted.")}
    stats={[
        { label: t("Associated Payments"), value: loading ? "…" : sale_payments.length },
        { label: t("Associated Returns"), value: loading ? "…" : sale_returns.length },
        { label: t("Associated Return Items"), value: loading ? "…" : sale_return_items.length },
        { label: t("Associated Journals"), value: loading ? "…" : sale_journals.length },
        { label: t("Associated Stock Transactions"), value: loading ? "…" : sale_stock_transactions.length },
    ]}
    actionLabel={t("Make Draft")}
    actionIcon="bi-file-earmark"
    actionVariant="warning"
    inputId="draft-sale-confirm-input"
    confirmPrompt={{
        title: t("Are you sure?"),
        message: t("Are you sure you want to make this sale a draft? This action cannot be undone."),
        confirmText: t("Yes, draft it!"),
        cancelText: t("No, keep it"),
        variant: "warning",
        icon: "bi-file-earmark",
    }}
    on:confirm={doDraftSale}
    on:close={() => dispatch("close")} />

