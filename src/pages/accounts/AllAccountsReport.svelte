<script>
    import { onMount } from "svelte";
    import { liveQuery } from "dexie";
    import { db, logActivity } from "../../db.js";
    import { showDate, setDatePickers } from "../../calendar.js";
    import {calculateCreditDebitOfAllAccounts} from './AccountsHelper.js';
    import { generatePDF,generatingPDF } from "../generatePDF.js";
    import { push } from "svelte-spa-router";
    import { t, lang, translate_org_type,settings_all ,shortID} from "../../i18n/i18n.js";
    import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
    import FilterToolbar from '../../components/common/FilterToolbar.svelte';
    import ActionButton from '../../components/common/ActionButton.svelte';
    import DataTable from '../../components/common/DataTable.svelte';
    import EmptyState from '../../components/common/EmptyState.svelte';
    import PaginationBar from '../../components/common/PaginationBar.svelte';
    import StatusBadge from '../../components/common/StatusBadge.svelte';
    import SummaryCard from '../../components/common/SummaryCard.svelte';

    $: enable_account_groups = $settings_all.find((s) => s.key === 'enable_account_groups')?.value == 1;

    $: _lang = $lang;

    $: _translate_org_type = $translate_org_type;

    let accounts = [];
    let accountTypes = [];
    let accountGroups = [];
    let loading = true;
    let filterBalState = 0;
    let balStateDropdownOpen = false;
    let filtersOpen = false;
    let typeDropdownEl;
    let balDropdownEl;
    let groupDropdownEl;
    let balanceSubscription = null;



    async function loadAccounts() {
        loading = true;
        accountTypes = await db.account_types.where('status').equals(1).toArray();
        accounts = await db.accounts.where('status').equals(1).toArray();
        accounts = accounts.filter((a) => a.code !== "NOTRACK" && a.code !== "RECEIVABLE" && a.code !== "PAYABLE" && a.code !== "SALES" && a.code !== "PURCHASE"&& a.code !== "EXCHANGE");
        accounts = accounts.filter((a) => {
            if (a.account_status) {
                return a.account_status === "active";
            } else {
                return a.status === 1;
            }
        });
        accounts = accounts.map(acc => ({
            ...acc,
            include: true
        }));
        accountGroups = await db.account_groups.where('status').equals(1).toArray();
        let accountBalances = await calculateCreditDebitOfAllAccounts();
        accounts.forEach(acc => {
            if (accountBalances[acc.id]) {
                acc.computedBalances = accountBalances[acc.id];
            }
        });
        accounts = [...accounts];
        loading = false;
    }

    function applyAccountBalances(accountBalances) {
        accounts = accounts.map((account) => ({
            ...account,
            computedBalances: accountBalances[account.id],
        }));
    }

    function watchAccountBalances() {
        balanceSubscription?.unsubscribe();
        balanceSubscription = liveQuery(() => calculateCreditDebitOfAllAccounts()).subscribe({
            next: applyAccountBalances,
            error: (error) => console.error("Failed to refresh accounts report balances", error),
        });
    }

    onMount(() => {
        let destroyed = false;
        loadAccounts().then(() => {
            if (!destroyed) watchAccountBalances();
        });

        document.addEventListener("click", handleClickOutside);

        return () => {
            destroyed = true;
            balanceSubscription?.unsubscribe();
            document.removeEventListener("click", handleClickOutside);
        };
    });

    function handleClickOutside(event) {
        if (
            groupDropdownOpen &&
            groupDropdownEl &&
            !groupDropdownEl.contains(event.target)
        ) {
            groupDropdownOpen = false;
        }

        if (
            typeDropdownOpen &&
            typeDropdownEl &&
            !typeDropdownEl.contains(event.target)
        ) {
            typeDropdownOpen = false;
        }

        if (
            balStateDropdownOpen &&
            balDropdownEl &&
            !balDropdownEl.contains(event.target)
        ) {
            balStateDropdownOpen = false;
        }
    }

    function toggleFilters() {
        filtersOpen = !filtersOpen;
        if (!filtersOpen) {
            typeDropdownOpen = false;
            groupDropdownOpen = false;
            balStateDropdownOpen = false;
        }
    }
    // --- Table State ---
    let searchTerm = "";
    let filterType = new Set();
    let typeDropdownOpen = false;
    let filterGroup = new Set();
    let groupDropdownOpen = false;
    let filterStatus = "active"; // 'all', 'active', 'inactive'
    let currentPage = 1;
    let itemsPerPage = 10;
    let sortColumn = "id";
    let sortDirection = "asc";

    let modalRef;

    function getPageNumbers(current, total) {
        const delta = 2;
        const range = [];
        const rangeWithDots = [];
        let l;

        for (let i = 1; i <= total; i++) {
            if (
                i === 1 ||
                i === total ||
                (i >= current - delta && i <= current + delta)
            ) {
                range.push(i);
            }
        }

        for (let i of range) {
            if (l) {
                if (i - l === 2) {
                    rangeWithDots.push(l + 1);
                } else if (i - l !== 1) {
                    rangeWithDots.push("...");
                }
            }
            rangeWithDots.push(i);
            l = i;
        }

        return rangeWithDots;
    }

    function getTypeName(id) {
        const tObj = accountTypes.find((a) => a.id === id) || {};
        if (t("Lang") === "en") return tObj.name || "";
        if (t("Lang") === "fa") return tObj.name_fa || tObj.name || "";
        if (t("Lang") === "ps") return tObj.name_ps || tObj.name || "";
        return tObj.name || "";
    }

    let overallBalances = {};
    let overallBalanceArray = [];

    let checkAll = false;
    // --- Computed (filter, sort, paginate) ---
    $: filteredAccounts = (() => {
        let result = accounts.slice();

        if (filterStatus === "active")
            result = result.filter((a) => a.status === 1);
        else if (filterStatus === "inactive")
            result = result.filter((a) => a.status === 0);

        if (filterType.size > 0) {
            result = result.filter((a) => filterType.has(a.account_type_id));
        } else {
            result = result.filter(
                (a) => a.code !== "BENEFITS" && a.code !== "EXPENSES",
            );
        }

        if (filterGroup.size > 0) {
            result = result.filter((a) => filterGroup.has(a.account_group_id));
        } else {
          
        }
        if (filterBalState === 0) {
            result = result.filter((a) => {
                if (!a.computedBalances) return false;
                for (const cur in a.computedBalances) {
                    a.computedBalances[cur].active = true;
                }
                return true;
            });
        } else if (filterBalState === 1) {
            // creditors
            result = result.filter((a) => {
                if (!a.computedBalances) return false;
                let totalBal = 0;
                for (const cur in a.computedBalances) {
                    let curBal =
                        a.computedBalances[cur].credit -
                        a.computedBalances[cur].debit;
                    if (curBal > 0) {
                        a.computedBalances[cur].active = true;
                        totalBal += curBal;
                    } else {
                        a.computedBalances[cur].active = false;
                    }
                }
                return totalBal > 0;
            });
        } else if (filterBalState === 2) {
            // debitors
            result = result.filter((a) => {
                if (!a.computedBalances) return false;
                let totalBal = 0;
                for (const cur in a.computedBalances) {
                    let curBal =
                        a.computedBalances[cur].credit -
                        a.computedBalances[cur].debit;

                    if (curBal < 0) {
                        a.computedBalances[cur].active = true;
                        totalBal += curBal;
                    } else {
                        a.computedBalances[cur].active = false;
                    }
                }
                return totalBal < 0;
            });
        } else if (filterBalState === 3) {
            // zero balance
            result = result.filter((a) => {
                if (!a.computedBalances) return false;
                let totalBal = 0;
                for (const cur in a.computedBalances) {
                    let curBal =
                        a.computedBalances[cur].credit -
                        a.computedBalances[cur].debit;
                    if (curBal < 0) {
                        totalBal += curBal;
                        a.computedBalances[cur].active = false;
                    } else if (curBal > 0) {
                        totalBal += curBal;
                        a.computedBalances[cur].active = false;
                    } else {
                        a.computedBalances[cur].active = true;
                    }
                }
                return totalBal === 0;
            });
        } else if (filterBalState === 4) {
            // zero balance
            result = result.filter((a) => {
                if (!a.computedBalances) return false;
                let totalBal = 0;
                for (const cur in a.computedBalances) {
                    let curBal =
                        a.computedBalances[cur].credit -
                        a.computedBalances[cur].debit;
                    if (curBal < 0) {
                        totalBal += curBal;
                        a.computedBalances[cur].active = true;
                    } else if (curBal > 0) {
                        totalBal += curBal;
                        a.computedBalances[cur].active = true;
                    } else {
                        a.computedBalances[cur].active = false;
                    }
                }
                return totalBal !== 0;
            });
        }

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            result = result.filter((a) => {
                const name =
                    (t("Lang") === "en"
                        ? a.name
                        : t("Lang") === "fa"
                          ? a.name_fa
                          : a.name_ps) || "";
                return (
                    (name && name.toLowerCase().includes(term)) ||
                    (a.code && String(a.code).toLowerCase().includes(term)) ||
                    (a.id && String(a.id).includes(term))
                );
            });
        }

        result = result.sort((a, b) => {
            let valA = a[sortColumn];
            let valB = b[sortColumn];

            if (sortColumn === "name") {
                valA =
                    (t("Lang") === "en"
                        ? a.name
                        : t("Lang") === "fa"
                          ? a.name_fa
                          : a.name_ps) || "";
                valB =
                    (t("Lang") === "en"
                        ? b.name
                        : t("Lang") === "fa"
                          ? b.name_fa
                          : b.name_ps) || "";
            }
            if (sortColumn === "type") {
                valA = getTypeName(a.account_type_id);
                valB = getTypeName(b.account_type_id);
            }

            if (valA === undefined || valA === null) return 1;
            if (valB === undefined || valB === null) return -1;

            if (typeof valA === "string") valA = valA.toLowerCase();
            if (typeof valB === "string") valB = valB.toLowerCase();

            if (valA < valB) return sortDirection === "asc" ? -1 : 1;
            if (valA > valB) return sortDirection === "asc" ? 1 : -1;
            return 0;
        });

        overallBalances = { AFN: { debit: 0, credit: 0 } };
        result.forEach((acc) => {
            if (acc.computedBalances && acc.include) {
                for (const cur in acc.computedBalances) {
                    if (acc.computedBalances[cur].active) {
                        if (overallBalances[cur] === undefined)
                            overallBalances[cur] = { debit: 0, credit: 0 };
                        overallBalances[cur].debit +=
                            acc.computedBalances[cur].debit;
                        overallBalances[cur].credit +=
                            acc.computedBalances[cur].credit;
                    }
                }
            }
        });
        overallBalanceArray = Object.entries(overallBalances).map(
            ([cur, bal]) => ({
                currency: cur,
                ...bal,
            }),
        );
        checkAll = checkAll;
        return result;
    })();

    $: paginatedAccounts = (() => {
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        return filteredAccounts.slice(start, end);
    })();

    $: totalPages = Math.ceil(filteredAccounts.length / itemsPerPage);

    function setSort(column) {
        if (sortColumn === column)
            sortDirection = sortDirection === "asc" ? "desc" : "asc";
        else {
            sortColumn = column;
            sortDirection = "asc";
        }
    }

    $: if (searchTerm || filterType || filterGroup || filterStatus) currentPage = 1;
    $: activeFilterCount =
        filterType.size +
        (enable_account_groups ? filterGroup.size : 0) +
        (filterBalState !== 0 ? 1 : 0);

    function showInitials(name) {
        if (!name) return "";
        const parts = name.trim().split(" ");
        return parts[0].charAt(0).toUpperCase();
    }
    function getAccountTypeColor(type) {
        const colors = [
            "dark",
            "danger",
            "secondary",
            "primary",
            "success",
            "info",
            "warning",
            "dark",
            "info",
            "success",
        ];
        return colors[type];
    }

    function handleCheckAllChange(event) {
        const checked = event.target.checked;
        accounts.forEach((acc) => (acc.include = checked));
        filteredAccounts = [...filteredAccounts]; // trigger reactivity
    }

    let fromDate = '';
    let toDate = '';
    let showBalanceCards = true;

    $: reportFilters = [
        {
            key: 'type', label: t('Account Types'), value: filterType.size === 1 ? [...filterType][0] : 'all', icon: 'bi-diagram-3',
            options: [{ value: 'all', label: t('All') }, ...accountTypes.map((type) => ({ value: type.id, label: getTypeName(type.id) }))],
        },
        {
            key: 'group', label: t('Account Groups'), value: filterGroup.size === 1 ? [...filterGroup][0] : 'all', icon: 'bi-collection',
            visible: enable_account_groups,
            options: [{ value: 'all', label: t('All') }, ...accountGroups.map((group) => ({ value: group.id, label: group.name }))],
        },
        {
            key: 'balance', label: t('Balance'), value: filterBalState || 'all', icon: 'bi-wallet2',
            options: [
                { value: 'all', label: t('All') },
                { value: 1, label: t('Creditors') },
                { value: 2, label: t('Debitors') },
                { value: 3, label: t('Zero Balance') },
                { value: 4, label: t('Non Zero Balance') },
            ],
        },
    ];

    function handleReportFilter(event) {
        const { key, value } = event.detail;
        if (key === 'type') filterType = value === 'all' ? new Set() : new Set([Number(value)]);
        if (key === 'group') filterGroup = value === 'all' ? new Set() : new Set([Number(value)]);
        if (key === 'balance') filterBalState = value === 'all' ? 0 : Number(value);
        currentPage = 1;
    }

    function resetReportFilters() {
        searchTerm = '';
        filterType = new Set();
        filterGroup = new Set();
        filterBalState = 0;
        currentPage = 1;
    }

    function formatOverallSummary(balances, type) {
        if (!balances.length) return '0';
        return balances.map((item) => {
            let value = 0;
            if (type === 'credit') value = Number(item.credit || 0);
            if (type === 'debit') value = Number(item.debit || 0);
            if (type === 'balance') value = Number(item.credit || 0) - Number(item.debit || 0);
            return `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${t(item.currency)}`;
        }).join('<br />');
    }
</script>

<div class="accounts-report-page" dir={t('dir')}>
<IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Accounts Report')}
    toolbarWidth="25rem"
    showStats={showBalanceCards}
    showFooter={!loading && filteredAccounts.length > 0}
    dense={true}
    tablePadding={true}>
    <svelte:fragment slot="actions">
        <ActionButton
            variant="secondary"
            icon="bi-file-pdf-fill"
            label={t('PDF')}
            loading={generatingPDF}
            disabled={generatingPDF}
            on:click={() => generatePDF('accounts', filteredAccounts, fromDate, toDate, filteredAccounts.length, overallBalanceArray, {})} />
        <button
            type="button"
            class="index-settings-button"
            class:is-active={showBalanceCards}
            aria-label={t('Balance')}
            aria-expanded={showBalanceCards}
            title={t('Balance')}
            on:click={() => (showBalanceCards = !showBalanceCards)}>
            <i class="bi {showBalanceCards ? 'bi-x-lg' : 'bi-wallet2'}" aria-hidden="true"></i>
        </button>
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
        <FilterToolbar
            searchValue={searchTerm}
            searchPlaceholder={t('Search accounts...')}
            filters={reportFilters}
            filterLabel={t('Filter')}
            resetLabel={t('Clear Filters')}
            showReset={true}
            on:searchChange={(event) => { searchTerm = event.detail; currentPage = 1; }}
            on:filterChange={handleReportFilter}
            on:reset={resetReportFilters} />
    </svelte:fragment>

    <svelte:fragment slot="stats">
        <div class="index-summary-grid">
            <SummaryCard label={t('Credit')} icon="bi-arrow-down-left" tone="green">
                {@html formatOverallSummary(overallBalanceArray, 'credit')}
            </SummaryCard>
            <SummaryCard label={t('Debit')} icon="bi-arrow-up-right" tone="amber">
                {@html formatOverallSummary(overallBalanceArray, 'debit')}
            </SummaryCard>
            <SummaryCard label={t('Balance')} icon="bi-wallet2" tone="cyan">
                {@html formatOverallSummary(overallBalanceArray, 'balance')}
            </SummaryCard>
        </div>
    </svelte:fragment>
<div class="report-shell">
<div class="report-card">
    <!-- Toolbar -->
    <div class="report-toolbar">
        <div class="filter-toolbar-row">
            <label class="unified-search">
                <i class="bi bi-search" aria-hidden="true"></i>
                <input
                    type="search"
                    class="unified-search-input"
                    placeholder={t("Search accounts...")}
                    bind:value={searchTerm}
                />
            </label>

            <button
                type="button"
                class="filter-toggle {filtersOpen || activeFilterCount > 0 ? 'filter-toggle--active' : ''}"
                aria-expanded={filtersOpen}
                aria-controls="accounts-report-filter-panel"
                on:click={toggleFilters}>
                <i class="bi bi-sliders2"></i>
                <span>{t('Filter')}</span>
                {#if activeFilterCount > 0}
                    <em>{activeFilterCount}</em>
                {/if}
                <i class="bi bi-chevron-down filter-toggle__chevron {filtersOpen ? 'filter-toggle__chevron--open' : ''}"></i>
            </button>

            <div class="toolbar-actions">
                <select class="per-page-select" bind:value={itemsPerPage}>
                    <option value={5}>5 {t("per page")}</option>
                    <option value={10}>10 {t("per page")}</option>
                    <option value={20}>20 {t("per page")}</option>
                    <option value={50}>50 {t("per page")}</option>
                </select>

                <button
                    on:click={() => {
                        generatePDF('accounts', filteredAccounts, fromDate, toDate, filteredAccounts.length, overallBalanceArray, {});
                    }}
                    disabled={generatingPDF}
                    class="report-pdf-btn">
                    {#if generatingPDF}
                        <div class="spinner-border spinner-border-sm" role="status">
                            <span class="visually-hidden">{t('Generating...')}</span>
                        </div>
                    {:else}
                        <i class="bi bi-file-pdf-fill"></i>
                        {t('PDF')}
                    {/if}
                </button>
            </div>
        </div>

        {#if filtersOpen}
            <div class="filter-panel" id="accounts-report-filter-panel">
                <div class="filter-dropdown" bind:this={typeDropdownEl}>
                    <button
                        class="filter-dropdown-btn {filterType.size > 0 ? 'has-value' : ''}"
                        type="button"
                        on:click={() => (typeDropdownOpen = !typeDropdownOpen)}
                    >
                        {#if filterType.size === 0}
                            {t("Account Types")}
                        {:else}
                            {t("Account Types")} ({filterType.size})
                        {/if}
                    </button>

                    {#if typeDropdownOpen}
                        <div class="filter-dropdown-menu">
                            <!-- optional actions -->
                            <div class="d-flex justify-content-between mb-2">
                                <button
                                    class="btn btn-sm btn-link p-0"
                                    on:click={() => {
                                        filterType = new Set();
                                    }}
                                >
                                    {t("Clear")}
                                </button>
                                <button
                                    class="btn btn-sm btn-link p-0"
                                    on:click={() => {
                                        filterType = new Set(
                                            accountTypes.map((t) => t.id),
                                        );
                                    }}
                                >
                                    {t("Select All")}
                                </button>
                            </div>

                            <div class="border-top pt-2">
                                {#each accountTypes as type}
                                    <div class="form-check">
                                        <input
                                            class="form-check-input"
                                            type="checkbox"
                                            id={"type-filter-" + type.id}
                                            checked={filterType.has(type.id)}
                                            on:change={(e) => {
                                                if (e.target.checked) {
                                                    filterType.add(type.id);
                                                } else {
                                                    filterType.delete(type.id);
                                                }
                                                filterType = new Set(
                                                    filterType,
                                                );
                                            }}
                                        />
                                        <label
                                            class="form-check-label"
                                            for={"type-filter-" + type.id}
                                        >
                                            {getTypeName(type.id)}
                                        </label>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>
                {#if enable_account_groups}
            <div class="filter-dropdown" bind:this={groupDropdownEl}>
                    <button
                        class="filter-dropdown-btn {filterGroup.size > 0 ? 'has-value' : ''}"
                        type="button"
                        on:click={() => (groupDropdownOpen = !groupDropdownOpen)}
                    >
                        {#if filterGroup.size === 0}
                            {t("Account Groups")}
                        {:else}
                            {t("Account Groups")} ({filterGroup.size})
                        {/if}
                    </button>

                    {#if groupDropdownOpen}
                        <div class="filter-dropdown-menu">
                            <!-- optional actions -->
                            <div class="d-flex justify-content-between mb-2">
                                <button
                                    class="btn btn-sm btn-link p-0"
                                    on:click={() => {
                                        filterGroup = new Set();
                                    }}
                                >
                                    {t("Clear")}
                                </button>
                                <button
                                    class="btn btn-sm btn-link p-0"
                                    on:click={() => {
                                        filterGroup = new Set(
                                            accountGroups.map((t) => t.id),
                                        );
                                    }}
                                >
                                    {t("Select All")}
                                </button>
                            </div>

                            <div class="border-top pt-2">
                                {#each accountGroups as group}
                                    <div class="form-check">
                                        <input
                                            class="form-check-input"
                                            type="checkbox"
                                            id={"type-filter-" + group.id}
                                            checked={filterGroup.has(group.id)}
                                            on:change={(e) => {
                                                if (e.target.checked) {
                                                    filterGroup.add(group.id);
                                                } else {
                                                    filterGroup.delete(group.id);
                                                }
                                                filterGroup = new Set(
                                                    filterGroup,
                                                );
                                            }}
                                        />
                                        <label
                                            class="form-check-label"
                                            for={"type-filter-" + group.id}
                                        >
                                            {group.name}
                                        </label>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>
                {/if}
                <div class="filter-dropdown" bind:this={balDropdownEl}>
                    <button
                        class="filter-dropdown-btn {filterBalState !== 0 ? 'has-value' : ''}"
                        type="button"
                        on:click={() =>
                            (balStateDropdownOpen = !balStateDropdownOpen)}
                    >
                        {t("Balance")}
                    </button>

                    {#if balStateDropdownOpen}
                        <div class="filter-dropdown-menu filter-dropdown-menu--compact">
                            <div class="form-check">
                                <input
                                    class="form-check-input"
                                    type="checkbox"
                                    id={"bal-filter-credit"}
                                    checked={filterBalState == 1}
                                    on:change={(e) => {
                                        if (e.target.checked) {
                                            filterBalState = 1;
                                        } else {
                                            filterBalState = 0;
                                        }
                                    }}
                                />
                                <label
                                    class="form-check-label"
                                    for={"bal-filter-credit"}
                                >
                                    {t("Creditors")}
                                </label>
                            </div>
                            <div class="form-check">
                                <input
                                    class="form-check-input"
                                    type="checkbox"
                                    id={"bal-filter-debit"}
                                    checked={filterBalState == 2}
                                    on:change={(e) => {
                                        if (e.target.checked) {
                                            filterBalState = 2;
                                        } else {
                                            filterBalState = 0;
                                        }
                                    }}
                                />
                                <label
                                    class="form-check-label"
                                    for={"bal-filter-debit"}
                                >
                                    {t("Debitors")}
                                </label>
                            </div>
                            <div class="form-check">
                                <input
                                    class="form-check-input"
                                    type="checkbox"
                                    id={"bal-filter-zero"}
                                    checked={filterBalState == 3}
                                    on:change={(e) => {
                                        if (e.target.checked) {
                                            filterBalState = 3;
                                        } else {
                                            filterBalState = 0;
                                        }
                                    }}
                                />
                                <label
                                    class="form-check-label"
                                    for={"bal-filter-zero"}
                                >
                                    {t("Zero Balance")}
                                </label>
                            </div>
                              <div class="form-check">
                                <input
                                    class="form-check-input"
                                    type="checkbox"
                                    id={"bal-filter-zero"}
                                    checked={filterBalState == 4}
                                    on:change={(e) => {
                                        if (e.target.checked) {
                                            filterBalState = 4;
                                        } else {
                                            filterBalState = 0;
                                        }
                                    }}
                                />
                                <label
                                    class="form-check-label"
                                    for={"bal-filter-zero"}
                                >
                                    {t("Non Zero Balance")}
                                </label>
                            </div>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
        </div>
    </div>

    <div class="report-card-body">
        {#if loading}
            <div class="index-table-state">
                <EmptyState loading message={t('Loading...')} />
            </div>
        {:else if filteredAccounts.length === 0}
            <div class="index-table-state">
                <EmptyState icon="bi-inbox" message={t('No accounts found.')} />
            </div>
        {:else}
            <DataTable
                ariaLabel={t('Accounts Report')}
                minWidth="760px"
                dense={true}
                striped={true}
                hover={false}
                stickyHeader={true}
                layout="fixed"
                scrollbar="thin">
                <svelte:fragment slot="head">
                        <tr>
                            <th class="text-center report-select-column">
                                <div class="form-check d-inline-block">
                                    <input
                                        class="form-check-input"
                                        type="checkbox"
                                        id="checkAll"
                                        checked={accounts.every(
                                            (acc) => acc.include,
                                        )}
                                        on:change={(event) => {
                                            accounts = accounts.map((acc) => ({
                                                ...acc,
                                                include: event.target.checked,
                                            }));
                                            filteredAccounts = [
                                                ...filteredAccounts,
                                            ];
                                        }}
                                    />
                                </div></th
                            >
                            <th
                                class="col-start cursor-pointer report-id-column"
                                on:click={() => setSort("id")}
                            >
                                {t("ID")}
                                {#if sortColumn === "id"}
                                    <i
                                        class="bi bi-arrow-{sortDirection ===
                                        'asc'
                                            ? 'up'
                                            : 'down'} ms-1"
                                    ></i>
                                {/if}
                            </th>
                            <th
                                class="col-start cursor-pointer report-name-column"
                                on:click={() => setSort("name")}
                            >
                                {t("Name")}
                                {#if sortColumn === "name"}
                                    <i
                                        class="bi bi-arrow-{sortDirection ===
                                        'asc'
                                            ? 'up'
                                            : 'down'} ms-1"
                                    ></i>
                                {/if}
                            </th>
                            <th
                                class="text-center cursor-pointer report-type-column"
                                on:click={() => setSort("type")}
                            >
                                {t("Type")}
                                {#if sortColumn === "type"}
                                    <i
                                        class="bi bi-arrow-{sortDirection ===
                                        'asc'
                                            ? 'up'
                                            : 'down'} ms-1"
                                    ></i>
                                {/if}
                            </th>
                            {#if enable_account_groups}
                            <th
                                class="text-center cursor-pointer report-group-column"
                                on:click={() => setSort("group")}
                            >
                                {t("Group")}
                                {#if sortColumn === "group"}
                                    <i
                                        class="bi bi-arrow-{sortDirection ===
                                        'asc'
                                            ? 'up'
                                            : 'down'} ms-1"
                                    ></i>
                                {/if}
                            </th>

                            {/if}
                            <th
                                class="text-center cursor-pointer report-balance-column"
                                on:click={() => setSort("balance")}
                            >
                                {t("Balance")}
                            </th>
                        </tr>
                </svelte:fragment>
                        {#each paginatedAccounts as acc}
                            <tr class="account-row">
                                <td class="text-center report-select-column"
                                    ><div class="form-check d-inline-block">
                                        <input
                                            class="form-check-input"
                                            type="checkbox"
                                            bind:checked={acc.include}
                                            on:change={() => {
                                                filteredAccounts = [
                                                    ...filteredAccounts,
                                                ];
                                            }}
                                        />
                                    </div></td
                                >
                                <td class="col-start cell-muted report-id-column">{shortID(acc.id)}</td>
                                <td class="col-start report-name-column" on:click={() => push(`/dashboard/account/${acc.id}`)}>
                                  <div class="account-info">
                                    {#if acc.imageUrl}
                                        <img
                                            class="account-avatar"
                                            src={acc.imageUrl ||
                                                "/img/no-image.png"}
                                            alt=""
                                        />
                                    {:else}
                                        <div
                                            class="account-avatar account-avatar-fallback"
                                        >
                                            {showInitials(
                                                t("Lang") === "en"
                                                    ? acc.name
                                                    : t("Lang") === "fa"
                                                      ? acc.name_fa
                                                      : acc.name_ps,
                                            )}
                                        </div>
                                    {/if}

                                    {#if t("Lang") === "en" && acc.name}{acc.name}{/if}
                                    {#if t("Lang") === "fa" && acc.name_fa}{acc.name_fa}{/if}
                                    {#if t("Lang") === "ps" && acc.name_ps}{acc.name_ps}{/if}
                                  </div>
                                </td>
                                <td class="text-center report-type-column"
                                    >{#if acc.account_type_id}{getTypeName(
                                            acc.account_type_id,
                                        )}{:else}-{/if}</td
                                >

                            {#if enable_account_groups}

                                <td class="text-center report-group-column"
                                    >{#if acc.account_group_id}{accountGroups.find(ac=>ac.id==acc.account_group_id)?.name}{:else}-{/if}</td
                                >

                            {/if}
                                <td class="text-center report-balance-column">
                                    {#if acc.computedBalances}
                                        {#each Object.keys(acc.computedBalances) as cur}
                                            {#if acc.computedBalances[cur].active}
                                                {@const accountBalance = acc.computedBalances[cur].credit - acc.computedBalances[cur].debit}
                                                <StatusBadge tone={accountBalance > 0 ? 'positive' : accountBalance < 0 ? 'negative' : 'neutral'} ltr={true}>
                                                    <span dir="ltr"
                                                        >{accountBalance.toLocaleString(
                                                            undefined,
                                                            {
                                                                minimumFractionDigits: 2,
                                                                maximumFractionDigits: 3,
                                                            },
                                                        )}</span
                                                    >
                                                    {t(cur)}
                                                </StatusBadge>
                                            {/if}
                                        {/each}
                                    {:else}
                                        {acc.balance} {t(acc.currency)}
                                    {/if}
                                </td>
                            </tr>
                        {/each}
            </DataTable>
        {/if}
    </div>

    {#if false}
        <div class="card-footer report-card-footer d-flex justify-content-between align-items-center pt-3">
            <div class="text-muted small">
                {t("Showing")}
                {(currentPage - 1) * itemsPerPage + 1}
                {t("to")}
                {Math.min(currentPage * itemsPerPage, filteredAccounts.length)}
                {t("of")}
                {filteredAccounts.length}
                {t("entries")}
            </div>
            <nav>
                <ul class="pagination pagination-circle pagination-sm mb-0">
                    <li class="page-item" class:disabled={currentPage === 1}>
                        <button
                            class="page-link"
                            on:click={() => (currentPage = 1)}
                        >
                            <i
                                class="bi bi-chevron-double-{t('dir') === 'rtl'
                                    ? 'right'
                                    : 'left'}"
                            ></i>
                        </button>
                    </li>
                    <li class="page-item" class:disabled={currentPage === 1}>
                        <button
                            class="page-link"
                            on:click={() => (currentPage -= 1)}
                        >
                            <i
                                class="bi bi-chevron-{t('dir') === 'rtl'
                                    ? 'right'
                                    : 'left'}"
                            ></i>
                        </button>
                    </li>

                    {#each getPageNumbers(currentPage, totalPages) as pageNum, idx (pageNum === "..." ? `dot-${idx}` : pageNum)}
                        {#if pageNum === "..."}
                            <li class="page-item disabled">
                                <span class="page-link">...</span>
                            </li>
                        {:else}
                            <li
                                class="page-item"
                                class:active={currentPage === pageNum}
                            >
                                <button
                                    class="page-link"
                                    on:click={() => (currentPage = pageNum)}
                                    >{pageNum}</button
                                >
                            </li>
                        {/if}
                    {/each}

                    <li
                        class="page-item"
                        class:disabled={currentPage === totalPages ||
                            totalPages === 0}
                    >
                        <button
                            class="page-link"
                            on:click={() => (currentPage += 1)}
                        >
                            <i
                                class="bi bi-chevron-{t('dir') === 'rtl'
                                    ? 'left'
                                    : 'right'}"
                            ></i>
                        </button>
                    </li>
                    <li
                        class="page-item"
                        class:disabled={currentPage === totalPages ||
                            totalPages === 0}
                    >
                        <button
                            class="page-link"
                            on:click={() => (currentPage = totalPages)}
                        >
                            <i
                                class="bi bi-chevron-double-{t('dir') === 'rtl'
                                    ? 'left'
                                    : 'right'}"
                            ></i>
                        </button>
                    </li>
                </ul>
            </nav>
        </div>
    {/if}
</div>
    <svelte:fragment slot="footer">
        <PaginationBar
            bind:currentPage
            {totalPages}
            {itemsPerPage}
            totalItems={filteredAccounts.length}
            ariaLabel={t('Accounts Report pagination')}
            rowLabel={t('rows')}
            on:perPageChange={(event) => { itemsPerPage = Number(event.detail); currentPage = 1; }}
            {getPageNumbers} />
    </svelte:fragment>
</IndexPageLayout>
</div>

<style>
    .accounts-report-page {
        display: flex;
        flex: 1 1 auto;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        padding: 0;
        color: #0f172a;
        overflow: hidden;
    }

    .accounts-report-page :global(.index-page) {
        flex: 1 1 auto;
    }

    .accounts-report-page :global(.index-statistics .index-summary-grid) {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .report-shell {
        display: contents;
    }

    .stock-balance-summary {
        display: grid;
        gap: 0.2rem;
        min-width: 0;
    }

    .stock-balance-summary strong {
        color: #0f766e;
        font-size: 0.95rem;
        font-weight: 850;
    }

    .stock-balance-summary strong.negative {
        color: #dc2626;
    }

    .stock-balance-summary small {
        overflow: hidden;
        color: #64748b;
        font-size: 0.68rem;
        font-weight: 650;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    @media (max-width: 767.98px) {
        .accounts-report-page :global(.index-statistics .index-summary-grid) {
            grid-template-columns: 1fr;
        }
    }

    .report-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 1rem 1.2rem;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        background: #fff;
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);
    }

    .report-header h1 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 800;
        letter-spacing: -0.02em;
    }

    .report-header p {
        margin: 0.2rem 0 0;
        color: #64748b;
        font-size: 0.83rem;
        font-weight: 500;
    }

    .report-pdf-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        min-height: var(--control-height);
        padding: 0.5rem 0.95rem;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #ffffff;
        color: #64748b;
        font-size: 0.84rem;
        font-weight: 700;
        white-space: nowrap;
        transition: background 0.15s ease, border-color 0.15s ease;
    }

    .report-pdf-btn:hover:not(:disabled) {
        border-color: #cbd5e1;
        background: #f8fafc;
        color: #0f172a;
    }

    .report-pdf-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    .balances-grid {
        position: absolute;
        top: 0.5rem;
        inset-inline: 0.5rem;
        z-index: 120;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 0.75rem;
        max-height: calc(100% - 1rem);
        padding: 0.75rem;
        overflow-y: auto;
        border: 1px solid #dbe5f0;
        border-radius: 0.875rem;
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 18px 45px rgba(15, 23, 42, 0.16);
    }

    .balance-card {
        padding: 1rem 1.05rem;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        background: #ffffff;
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
        transition:
            transform 0.15s ease,
            box-shadow 0.15s ease;
    }

    .balance-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 22px rgba(15, 23, 42, 0.07);
    }

    .balance-card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0.85rem;
        color: #0f172a;
        font-size: 0.92rem;
        font-weight: 850;
    }

    .balance-card-head i {
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        border-radius: 12px;
        background: #eff6ff;
        color: #0f6efd;
        font-size: 1rem;
    }

    .balance-lines {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.55rem;
    }

    .balance-line {
        min-height: 42px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        padding: 0.75rem;
        border: 1px solid #eef2f7;
        border-radius: 12px;
        background: #fbfdff;
        text-align: center;
    }

    .balance-line span:first-child {
        color: #64748b;
        font-size: 0.78rem;
        font-weight: 750;
    }

    .balance-line strong {
        color: #0f172a;
        font-size: 0.88rem;
        font-weight: 850;
        white-space: nowrap;
    }

    .balance-line-total {
        margin-top: 0.1rem;
        border-color: #dbeafe;
        background: #f8fbff;
    }

    .balance-line-total span:first-child,
    .balance-line-total strong {
        color: #0f6efd;
    }

    .balance-line-total.is-positive {
        border-color: #bbf7d0;
        background: #f0fdf4;
    }

    .balance-line-total.is-positive span:first-child,
    .balance-line-total.is-positive strong {
        color: #11875d;
    }

    .balance-line-total.is-negative {
        border-color: #fecdd3;
        background: #fff1f2;
    }

    .balance-line-total.is-negative span:first-child,
    .balance-line-total.is-negative strong {
        color: #c83248;
    }

    .report-card {
        display: contents;
    }

    .report-card-body {
        display: contents;
    }

    .report-card-body :global(.data-table-wrap) {
        height: auto;
    }

    .account-row { cursor: pointer; }

    .report-select-column {
        width: 5%;
        min-width: 3.25rem;
    }

    .report-id-column {
        width: 15%;
        text-align: start !important;
    }

    .report-name-column {
        width: 30%;
        text-align: start !important;
    }

    .report-type-column { width: 20%; }
    .report-group-column { width: 15%; }
    .report-balance-column { width: 15%; }

    .report-select-column :global(.form-check),
    .report-select-column :global(.form-check-input) {
        margin: 0;
    }

    .cell-muted {
        color: #94a3b8;
        font-size: 0.78rem;
    }

    .account-info {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        min-width: 0;
        color: #0f172a;
        font-weight: 800;
        text-align: start;
    }

    .account-avatar {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        object-fit: cover;
    }

    .account-avatar-fallback {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #e2e8f0;
        background: #edf2f8;
        color: #8b9bb0;
        font-size: 0.82rem;
        font-weight: 800;
    }

    .report-toolbar {
        display: none;
    }

    .filter-toolbar-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.65rem;
    }

    .unified-search {
        position: relative;
        display: flex;
        align-items: center;
        flex: 1 1 260px;
        min-width: 220px;
        min-height: var(--control-height);
        padding-inline: 0.85rem;
        gap: 0.5rem;
        margin: 0;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #ffffff;
    }

    .unified-search:focus-within {
        border-color: #93c5fd;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
    }

    .unified-search > i {
        flex-shrink: 0;
        color: #94a3b8;
        font-size: 0.9rem;
    }

    .unified-search-input {
        flex: 1;
        min-width: 0;
        height: 38px;
        padding: 0;
        border: 0;
        background: transparent;
        color: #334155;
        font-size: 0.84rem;
        font-weight: 600;
    }

    .unified-search-input:focus {
        outline: none;
    }

    .filter-toggle {
        min-height: var(--control-height);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.45rem;
        padding: 0.55rem 0.9rem;
        border: 1px solid #dbe7f3;
        border-radius: 12px;
        background: #ffffff;
        color: #334155;
        font-size: 0.82rem;
        font-weight: 800;
        line-height: 1;
        transition:
            background 0.16s ease,
            border-color 0.16s ease,
            color 0.16s ease,
            box-shadow 0.16s ease,
            transform 0.16s ease;
    }

    .filter-toggle:hover {
        transform: translateY(-1px);
        border-color: #bfdbfe;
        background: #f8fbff;
        color: #0f6efd;
    }

    .filter-toggle--active {
        border-color: #bfdbfe;
        background: #eff6ff;
        color: #0f6efd;
        box-shadow: 0 8px 18px rgba(37, 99, 235, 0.08);
    }

    .filter-toggle em {
        min-width: 18px;
        height: 18px;
        display: inline-grid;
        place-items: center;
        border-radius: 999px;
        background: #0f6efd;
        color: #ffffff;
        font-size: 0.68rem;
        font-style: normal;
        font-weight: 900;
    }

    .filter-toggle__chevron {
        font-size: 0.72rem;
        transition: transform 0.16s ease;
    }

    .filter-toggle__chevron--open {
        transform: rotate(180deg);
    }

    .toolbar-actions {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.5rem;
    }

    .per-page-select {
        min-height: var(--control-height);
        padding-inline: 0.75rem;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #ffffff;
        color: #334155;
        font-size: 0.82rem;
        font-weight: 700;
    }

    .filter-panel {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 0.75rem;
        margin-top: 0.85rem;
        padding-top: 0.85rem;
        border-top: 1px solid #eef2f7;
    }

    .filter-dropdown {
        position: relative;
        width: 100%;
        min-width: 0;
    }

    .filter-dropdown-btn {
        width: 100%;
        min-height: var(--control-height);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.45rem;
        padding-inline: 0.85rem;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        color: #334155;
        background: #ffffff;
        font-size: 0.82rem;
        font-weight: 700;
        white-space: nowrap;
        cursor: pointer;
    }

    .filter-dropdown-btn:hover,
    .filter-dropdown-btn.has-value {
        border-color: #bfdbfe;
        background: #eff6ff;
        color: #0f6efd;
    }

    .filter-dropdown-menu {
        position: absolute;
        inset-inline-end: 0;
        top: calc(100% + 4px);
        z-index: 120;
        min-width: 260px;
        max-width: 320px;
        max-height: 320px;
        padding: 0.55rem;
        overflow: auto;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #ffffff;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
    }

    .filter-dropdown-menu--compact {
        max-height: 240px;
    }

    .report-card-header {
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
    }

    .report-card-body :global(.table thead th) {
        font-size: 0.76rem;
        font-weight: 800;
        color: #64748b;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
    }

    .report-card-body :global(.table tbody td) {
        vertical-align: middle;
        border-bottom-color: #f1f5f9;
        font-size: 0.84rem;
    }

    .report-card-body :global(.table tbody tr:hover) {
        background: #f8fbff;
    }

    .report-card-footer {
        border-top: 1px solid #e2e8f0;
        background: #fff;
    }

    .cursor-pointer {
        cursor: pointer;
    }
    .pagination-circle .page-link {
        border-radius: 50% !important;
        margin-left: 3px;
        margin-right: 3px;
        border: none;
    }

    @media (max-width: 767.98px) {
        .report-header {
            flex-direction: column;
            align-items: stretch;
        }

        .filter-toolbar-row {
            align-items: stretch;
            flex-direction: column;
        }

        .unified-search,
        .filter-toggle,
        .toolbar-actions,
        .per-page-select,
        .report-pdf-btn {
            width: 100%;
            min-width: 0;
        }

        .toolbar-actions {
            align-items: stretch;
            flex-direction: column;
        }

        .filter-panel {
            grid-template-columns: 1fr;
        }

        .balance-lines {
            grid-template-columns: 1fr;
        }

        .filter-dropdown-menu {
            inset-inline: 0;
            max-width: none;
        }

        .report-pdf-btn {
            width: 100%;
        }
    }
</style>
