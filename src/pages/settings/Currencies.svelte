<script>
    import { db,logActivity } from "../../db.js";
    import { onMount } from "svelte";

    import { t, lang, translate_org_type } from "../../i18n/i18n";
    import IndexPageLayout from "../../lib/components/index/IndexPageLayout.svelte";
    import ActionButton from "../../components/common/ActionButton.svelte";
    import PaginationBar from "../../components/common/PaginationBar.svelte";
    import EmptyState from "../../components/common/EmptyState.svelte";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    let currencies = [];
    let loading = true;
    let currencyModal;
    let currentPage = 1;
    let itemsPerPage = 10;

    import { showDate,setDatePickers } from "../../calendar.js";
    // Form fields
    let name = "";
    let code = "";
    let symbol = "";
    let rate = 1;
    let rateDate = new Date().toISOString().split("T")[0];
    let isDefault = false;

    // Track if editing an existing currency
    let editingId = null;

    async function loadCurrencies() {
        loading = true;
        try {
            currencies = await db.currencies.toArray();
        } catch (err) {
            console.error("Failed to load:", err);
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        const modalEl = document.getElementById("createCurrencyModal");
        if (window.mdb) {
            currencyModal = new window.mdb.Modal(modalEl);
            document.querySelectorAll("[data-mdb-input-init]").forEach((el) => {
                new window.mdb.Input(el);
            });
        }
        loadCurrencies();
    });

    function openCurrencyModal() {
        // Reset form for Add
        editingId = null;
        name = "";
        code = "";
        symbol = "";
        rate = 1;
        rateDate = new Date().toISOString().split("T")[0];
        isDefault = false;
        currencyModal.show();
    }

    // Open modal to edit an existing currency
    function editCurrency(currency) {
        editingId = currency.id;
        name = currency.name;
        code = currency.code;
        symbol = currency.symbol;
        rate = Number(currency.exchangeRate || 0).toLocaleString(undefined,{maximumFractionDigits: 6,minimumFractionDigits: 2});
        rateDate = currency.exchangeRateDate;
        isDefault = currency.isDefault === 1; // convert to boolean
        currencyModal.show();
    }

    async function saveCurrency() {
  if (!name.trim() || !code.trim()) {
    alert('Name and code are required.');
    return;
  }

  try {
    const defaultStatus = isDefault ? 1 : 0;

    // If this currency is selected as default,
    // remove default status from the previous currency.
    if (defaultStatus === 1) {
      const prevDefault = await db.currencies
        .where('isDefault')
        .equals(1)
        .first();

      if (prevDefault && prevDefault.id !== editingId) {
        await db.currencies.update(prevDefault.id, {
          isDefault: 0,
        });
      }
    }

    const currencyData = {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      symbol: symbol.trim(),
      isDefault: defaultStatus,
      exchangeRate: isDefault
        ? 1
        : parseFloat(rate) || 1,
      exchangeRateDate: rateDate,

      // Every saved currency will be active.
      status: 1,
    };

    if (editingId) {
      const oldCurrency =
        await db.currencies.get(editingId);

      await db.currencies.update(
        editingId,
        currencyData
      );

      await logActivity({
        user_id:
          parseInt(
            localStorage.getItem('user_id')
          ) || 0,
        action: 'update',
        table_name: 'currencies',
        entity_id: editingId,
        old_values: JSON.stringify(oldCurrency),
        new_values: JSON.stringify(currencyData),
        description: `Updated currency ${currencyData.code}`,
      });

      const anyDefault = await db.currencies
        .where('isDefault')
        .equals(1)
        .count();

      // Make sure at least one default currency exists.
      if (anyDefault === 0) {
        await db.currencies.update(editingId, {
          isDefault: 1,
          exchangeRate: 1,
          status: 1,
        });
      }
    } else {
      const newId = await db.currencies.add(
        currencyData
      );

      await logActivity({
        user_id:
          parseInt(
            localStorage.getItem('user_id')
          ) || 0,
        action: 'create',
        table_name: 'currencies',
        entity_id: newId,
        old_values: null,
        new_values: JSON.stringify(currencyData),
        description: `Created currency ${currencyData.code}`,
      });
    }

    await loadCurrencies();
    currencyModal.hide();
  } catch (err) {
    console.error('Dexie error:', err);

    alert(
      'Error: ' +
        (err.constraint
          ? 'Currency code already exists!'
          : err.message)
    );
  }
}

    async function deleteCurrency(id) {
        if (confirm("Delete this currency?")) {
            await logActivity({
                user_id: parseInt(localStorage.getItem("user_id")) || 0,
                action: 'delete',
                table_name: 'currencies',
                entity_id: id,
                old_values: JSON.stringify(await db.currencies.get(id)),
                new_values: null,
                description: `Deleted currency with ID ${id}`
            });
            await db.currencies.update(id, { status: 0 });
            await loadCurrencies();
        }
    }

    function getPageNumbers(current, total) {
        const range = [];
        const compact = [];
        let previous;
        for (let page = 1; page <= total; page += 1) {
            if (page === 1 || page === total || (page >= current - 2 && page <= current + 2)) range.push(page);
        }
        for (const page of range) {
            if (previous && page - previous > 1) compact.push(page - previous === 2 ? previous + 1 : "...");
            compact.push(page);
            previous = page;
        }
        return compact;
    }

    $: filteredCurrencies = currencies.slice();
    $: totalPages = Math.ceil(filteredCurrencies.length / itemsPerPage);
    $: if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    $: paginatedCurrencies = filteredCurrencies.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
</script>

<div class="currencies-page-actions">
    <ActionButton icon="bi-plus-lg" label={`+ ${t("Create Currency")}`} on:click={openCurrencyModal} />
</div>

<IndexPageLayout
    dir={t("dir")}
    ariaLabel={t("Currencies")}
    toolbarWidth="25rem"
    showFooter={!loading && filteredCurrencies.length > 0}
    dense={true}
    contained={false}
    contentClass="currencies-index-content"
    tablePadding={true}>
        {#if loading}
            <div class="index-table-state">
                <EmptyState loading message={t("Loading...")} />
            </div>
        {:else if filteredCurrencies.length === 0}
            <div class="index-table-state">
                <EmptyState icon="bi-currency-exchange" message={t("No currencies found.")} />
            </div>
        {:else}
            <div class="table-responsive">
                <table class="table table-hover mb-0 settings-index-table">
                    <thead class="table-light">
                        <tr>
                            <th>{t("Name")}</th>
                            <th>{t("Code")}</th>
                            <th>{t("Symbol")}</th>
                            <th>{t("Rate")}</th>
                            <th>{t("Rate Date")}</th>
                            <th>{t("Actions")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each paginatedCurrencies as currency}
                            <tr>
                                <td>{currency.name} {#if currency.isDefault === 1}
                                        <span class="badge badge-success"
                                            >{t("Default")}</span
                                        >
                                    {/if}</td>
                                <td><strong>{currency.code}</strong></td>
                                <td>{currency.symbol}</td>
                                <td>{Number(currency.exchangeRate || 0).toLocaleString(undefined,{maximumFractionDigits: 6,minimumFractionDigits: 2})}</td>
                                <td>{@html showDate(currency.exchangeRateDate)}</td>
                                <td>
                                    <button
                                        class="btn btn-sm btn-outline-secondary me-1"
                                        on:click={() => editCurrency(currency)}
                                    >
                                        <i class="bi bi-pencil"></i>
                                    </button>
                                    <!-- <button
                                        class="btn btn-sm btn-outline-danger"
                                        on:click={() =>
                                            deleteCurrency(currency.id)}
                                    >
                                        <i class="bi bi-trash"></i>
                                    </button> -->
                                </td>
                            </tr>
                        {/each}
                        {#if currencies.length === 0}
                            <tr>
                                <td
                                    colspan="9"
                                    class="text-center text-muted p-4"
                                    >{t("No currencies found.")}</td
                                >
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        {/if}

    <svelte:fragment slot="footer">
        <PaginationBar
            bind:currentPage
            {totalPages}
            {itemsPerPage}
            totalItems={filteredCurrencies.length}
            ariaLabel={t("Currencies pagination")}
            rowLabel={t("rows")}
            on:perPageChange={(event) => { itemsPerPage = Number(event.detail); currentPage = 1; }}
            {getPageNumbers} />
    </svelte:fragment>
</IndexPageLayout>

<div
    class="modal fade"
    id="createCurrencyModal"
    tabindex="-1"
    aria-hidden="true"
>
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="bi bi-currency-exchange"></i> {editingId ? t("Update Currency") : t("Create Currency")}
                </h5>
                <button type="button" class="btn-close" data-mdb-dismiss="modal"
                ></button>
            </div>

            <div class="modal-body">
                <div class="row">
                    <div class="col-md-6 mb-4">
                        <div class="form-outline" data-mdb-input-init>
                            <input
                                type="text"
                                id="c-name"
                                class="form-control"
                                bind:value={name}
                            />
                            <label class="form-label" for="c-name">{t("Name")}</label
                            >
                        </div>
                    </div>

                    <div class="col-md-6 mb-4">
                        <div class="form-outline" data-mdb-input-init>
                            <input
                                type="text"
                                id="c-code"
                                class="form-control"
                                bind:value={code}
                            />
                            <label class="form-label" for="c-code">{t("Code")}</label
                            >
                        </div>
                    </div>

                    <div class="col-md-6 mb-4">
                        <div class="form-outline" data-mdb-input-init>
                            <input
                                type="text"
                                id="c-symbol"
                                class="form-control"
                                bind:value={symbol}
                            />
                            <label class="form-label" for="c-symbol">{t("Symbol")}</label
                            >
                        </div>
                    </div>
                    <div class="col-md-6 mb-4">
                    <div class="input-group">
                        <div class="form-outline" data-mdb-input-init>
                            {#if isDefault}
                                <input
                                    type="number"
                                    step="0.01"
                                    id="c-rate"
                                    class="form-control"
                                    value="1"
                                    readonly
                                />
                            {:else}
                            <input
                                type="number"
                                step="0.01"
                                id="c-rate"
                                class="form-control"
                                bind:value={rate}
                            />
                            {/if}

                            <label class="form-label" for="c-rate">{t("Rate")}</label>
                        </div>

                        <span class="input-group-text">{t(currencies.find((c) => c.isDefault === 1)?.code || '')}</span>
                    </div>
                       
                    </div>
                    <!-- <div class="col-md-6 mb-4">
                        <div class="form-outline" data-mdb-input-init>
                            <input
                                type="date"
                                id="c-rate-date"
                                class="form-control"
                                bind:value={rateDate}
                            />
                            <label class="form-label" for="c-rate-date"
                                >{t("Rate Date")}</label
                            >
                        </div>
                    </div> -->

                    <div class="col-md-6 mb-4">
                        <div class="form-check form-switch">
                            <input
                                class="form-check-input"
                                type="checkbox"
                                id="c-default"
                                bind:checked={isDefault}
                            />
                            <label class="form-check-label" for="c-default"
                                >{t("Set as Default")}</label
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
                    on:click={saveCurrency}
                >
                    {editingId ? t("Update Currency") : t("Create Currency")}
                </button>
            </div>
        </div>
    </div>
</div>

<style>
    .currencies-page-actions {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        margin-bottom: 0.5rem;
        direction: ltr;
    }
</style>
