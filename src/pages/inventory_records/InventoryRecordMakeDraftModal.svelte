<script>
    import { db, logActivity } from "../../db.js";
    import { onMount, createEventDispatcher } from "svelte";
    import { t, lang, translate_org_type } from "../../i18n/i18n.js";
    import { on } from "svelte/events";
    import Swal from "sweetalert2";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    import { push } from "svelte-spa-router";
    import { toast } from "../../ToastUI/toast.js";

    import { calculateProductStock } from "../stocktransactions/calculateStock.js";
    export let inventory_record;

    const dispatch = createEventDispatcher();

    let saving = false;
    let confirmationText = "";
    let randomNumber = Math.floor(Math.random() * 900) + 100; // simple random number for confirmation
    let loading = true;

    let inventory_record_items = [];
    let inventory_record_payments = [];
    let inventory_record_returns = [];
    let inventory_record_return_items = [];
    

    let inventory_record_journals = [];

    let inventory_record_stock_transactions = [];

    onMount(() => {
        loadInventoryRecordDetails();
    });

    async function loadInventoryRecordDetails() {
        if (!inventory_record) return;

        inventory_record = await db.inventory_records.where({ id: Number(inventory_record.id), status: 1 }).first();
        // Load inventory_record items
        inventory_record_items = await db.inventory_record_items
            .where("record_id")
            .equals(inventory_record.id)
            .and((item) => item.status === 1)
            .toArray();

        loading = false;
        console.log("InventoryRecord details loaded:", {
            inventory_record,
            inventory_record_items,
        });
    }
    async function doDeleteInventoryRecord() {
        let startTime = Date.now();
        saving = true;
        try {

            // Mark inventory_record as drafted
            let draftedInventoryRecord = await db.inventory_records
                .where("id")
                .equals(inventory_record.id)
                .first();
            
            // Mark associated return items as deleted
            let returnItemsToDelete = [];
          



            await db.inventory_records.update(inventory_record.id, { record_status: "draft" });
            console.log(`InventoryRecord marked as draft in ${Date.now() - startTime}ms`);
            await logActivity({
                user_id: parseInt(localStorage.getItem("user_id")) || 0,
                action: "drafted",
                table_name: "inventory_records",
                entity_id: inventory_record.id,
                old_values: JSON.stringify({
                    inventory_record: draftedInventoryRecord,
                }),
                description: `Drafted inventory_record #${inventory_record.id}`,
            });
            
            console.log(`Activity logged in ${Date.now() - startTime}ms`);

            toast.success(t("Drafted!"), t("Inventory Record drafted successfully."));

            dispatch("close");

            push(`/dashboard/inventory_record-form/${inventory_record.id}`);
        } catch (e) {
            console.error("Error drafting inventory_record:", e);
            toast.error(t("Error"), t("An error occurred while drafting the inventory_record."));
            // alert(t("An error occurred while drafting the inventory_record."));
        } finally {
            saving = false;
        }
    }

    async function draftInventoryRecord() {
        if (confirmationText !== String(randomNumber)) {
            toast.error(t("Confirmation Failed"), t("Confirmation text does not match. Please type the correct number to confirm making the inventory_record a draft."));
            // alert(t("Confirmation text does not match. Please type the correct number to confirm making the inventory_record a draft."));
            return;
        }
        const ok = await toast.confirm(t('Are you sure?'), t('Are you sure you want to make this inventory_record a draft? This action cannot be undone.'));
        if (ok) {
            doDeleteInventoryRecord();
        }
    }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal show d-block" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="bi bi-arrow-return-left"></i>
                    {t("Make Draft")}
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
                        <strong>{t("Making Draft...")}</strong>
                        <div
                            class="spinner-border ms-auto"
                            role="status"
                            aria-hidden="true"
                        ></div>
                    </div>
                {:else}
                    <h1 class="text-info">
                        <i class="bi bi-exclamation-triangle me-2"></i>{t(
                            "Warning!",
                        )}
                    </h1>
                    <p>
                        {t(
                            "Are you sure you want to make this inventory_record a draft? This action cannot be undone.",
                        )}
                    </p>

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
                    class="btn btn-info"
                    on:click={draftInventoryRecord}
                    disabled={saving || loading}
                    ><i class="bi bi-pencil"></i>
                    {@html saving
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t("Making Draft...")}</span>
</div>`
                        : t("Make Draft")}</button
                >
            </div>
        </div>
    </div>
</div>
