<script>
    import { onMount } from "svelte";
    import { db, logActivity } from "../../../db.js";
    import PatientModal from "./PatientModal.svelte";
    import { push } from "svelte-spa-router";

    import { API_URL } from '../../../config';
    import { showDate, setDatePickers } from "../../../calendar.js";



    let selectedDoctorID = localStorage.getItem('role_id') == 5 ? localStorage.getItem('user_id') : null;




    import { t, lang, translate_org_type,settings_all ,shortID} from "../../../i18n/i18n.js";

    $: enable_account_groups = $settings_all.find((s) => s.key === 'enable_account_groups')?.value == 1;
    // ensure component re-renders when language changes
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    let patients = [];
    let patientTypes = [];
    let accountGroups = [];

    let appointments = [];


    export let loading = true;


    let typeDropdownEl;
    let groupDropdownEl;


    async function loadAppointments() {
        appointments = await db.appointments.where('status').equals(1).toArray();


    }
    async function loadPatients() {

        loading = true;

        await loadAppointments();
        patientTypes = await db.patient_types.where('status').equals(1).toArray();
        patients = await db.accounts.where({ account_type_id: 4, status: 1 }).toArray();

        accountGroups = await db.account_groups.where('status').equals(1).toArray();

        if (selectedDoctorID) {
            appointments = appointments.filter(app => app.doctor_id == selectedDoctorID);
            const patientIDs = new Set(appointments.map(app => app.patient_id));
            patients = patients.filter(p => patientIDs.has(p.id));
        }

        for (let patient of patients) {
            const img = await db.account_images
                .where("account_id")
                .equals(patient.id)
                .and((img) => img.status === 1)
                .first();
            
            if (img?.image) {
            if (img.image.startsWith("{")) {
                let dataJSON = JSON.parse(img?.image);
                patient.imageUrl = API_URL+`/api/sync/loadimage/${dataJSON?.table}/${dataJSON?.fieldName}/${dataJSON?.serveid}/${localStorage.getItem('token')||'none'}`;
            } else {
                patient.imageUrl = img?.image;
            }
            } else {
            patient.imageUrl = null;
            }
        }

        loading = false;
    }

    onMount(() => {

        loading = true;
        loadPatients();
        document.addEventListener("click", handleClickOutside);

        return () => {
            document.removeEventListener("click", handleClickOutside);
        };
    });

    function handleClickOutside(event) {

        if (
            typeDropdownOpen &&
            typeDropdownEl &&
            !typeDropdownEl.contains(event.target)
        ) {
            typeDropdownOpen = false;
        }
        if (
            groupDropdownOpen &&
            groupDropdownEl &&
            !groupDropdownEl.contains(event.target)
        ) {
            groupDropdownOpen = false;
        }

    }


    let filterType = new Set();
    let typeDropdownOpen = false;


    let filterGroup = new Set();
    let groupDropdownOpen = false;



    // --- Table State ---
    let searchTerm = "";
    let filterStatus = "active"; // 'all', 'active', 'inactive'
    let currentPage = 1;
    let itemsPerPage = 10;
    let sortColumn = "id";
    let sortDirection = "desc";

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
        const tObj = patientTypes.find((a) => a.id === id) || {};
        if (t("Lang") === "en") return tObj.name || "";
        if (t("Lang") === "fa") return tObj.name_fa || tObj.name || "";
        if (t("Lang") === "ps") return tObj.name_ps || tObj.name || "";
        return tObj.name || "";
    }

    // --- Computed (filter, sort, paginate) ---
    $: filteredPatients = (() => {
        let result = patients.slice();

        if (filterStatus === "active")
            result = result.filter((a) => a.status === 1);
        else if (filterStatus === "inactive")
            result = result.filter((a) => a.status === 0);

        if (filterType.size > 0) {
            result = result.filter((a) => filterType.has(a.patient_type_id));
        } else {
            // result = result.filter(
            //     (a) => a.code !== "BENEFITS" && a.code !== "EXPENSES",
            // );
        }


        if (filterGroup.size > 0) {
            result = result.filter((a) => filterGroup.has(a.account_group_id));
        } else {
            // result = result.filter(
            //     (a) => a.code !== "BENEFITS" && a.code !== "EXPENSES",
            // );
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

            if (sortColumn === "percentage") {

            valA = Number(a[sortColumn]);
            valB = Number(b[sortColumn]);
            }

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
                valA = getTypeName(a.patient_type_id);
                valB = getTypeName(b.patient_type_id);
            }


            if (sortColumn === "balance") {
                if (a.computedBalances&&a.computedBalances["AFN"]) {
                    valA = Number(a.computedBalances["AFN"]);
                } else {
                    valA = 0;
                }

                if (b.computedBalances&&b.computedBalances["AFN"]) {
                    valB = Number(b.computedBalances["AFN"]);
                } else {
                    valB = 0;
                }

            }
            if (valA === undefined || valA === null) return 1;
            if (valB === undefined || valB === null) return -1;

            if (typeof valA === "string") valA = valA.toLowerCase();
            if (typeof valB === "string") valB = valB.toLowerCase();

            if (valA < valB) return sortDirection === "asc" ? -1 : 1;
            if (valA > valB) return sortDirection === "asc" ? 1 : -1;
            return 0;
        });

        return result;
    })();

    $: paginatedPatients = (() => {
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        return filteredPatients.slice(start, end);
    })();

    $: totalPages = Math.ceil(filteredPatients.length / itemsPerPage);


    $: totalPercentage = filteredPatients
  .reduce((sum, a) => a.patient_type_id==7?sum + (+a.percentage || 0):sum, 0)
  .toFixed(2);


    $: showTotalPercentage = filterType.size==1&&filterType.has(7);


    function setSort(column) {
        if (sortColumn === column)
            sortDirection = sortDirection === "asc" ? "desc" : "asc";
        else {
            sortColumn = column;
            sortDirection = "asc";
        }
    }

    $: if (searchTerm || filterType || filterGroup || filterStatus) currentPage = 1;

    async function deletePatient(id) {
        if (confirm("Delete this patient?")) {
            await logActivity({
                user_id: parseInt(localStorage.getItem("user_id")) || 0,
                action: "delete",
                table_name: "patients",
                entity_id: id,
                old_values: JSON.stringify(patients.find((a) => a.id === id)),
                new_values: null,
                description: `Deleted patient #${id}`,
            });
            await db.accounts.update(id, { status: 0 });

        }
    }

    function openModal(patient = null) {
        modalRef.openModal(patient);
    }

    function showInitials(name) {
        if (!name) return "";
        const parts = name.trim().split(" ");
        return parts[0].charAt(0).toUpperCase();
    }
    
  function getPatientTypeColor(type) {
    const colors = ['dark', 'primary','secondary','danger','success', 'info', 'warning', 'dark','secondary'];
    return colors[type];
  }
</script>

<div class="card shadow-sm">
    <!-- Toolbar -->
    <div class="card-header bg-body-tertiary border-bottom p-3">
        <div class="row g-3 align-items-center">
            <div class="col-md-{enable_account_groups?"3":"5"}">
                <input
                    type="text"
                    class="form-control"
                    placeholder={t("Search patients...")}
                    bind:value={searchTerm}
                />
            </div>

            <div class="col-md-2">
                <div class="dropdown d-inline"  bind:this={typeDropdownEl}>
                    <button
                        class="btn btn-outline-secondary dropdown-toggle"
                        type="button"
                        on:click={() => (typeDropdownOpen = !typeDropdownOpen)}
                    >
                        {#if filterType.size === 0}
                            {t("Patient Types")}
                        {:else}
                            {t("Patient Types")} ({filterType.size})
                        {/if}
                    </button>

                    {#if typeDropdownOpen}
                        <div
                            class="dropdown-menu show p-2 shadow"
                            style="min-width:260px; max-height:320px; overflow:auto;"
                        >
                        
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
                                            patientTypes.map((t) => t.id),
                                        );
                                    }}
                                >
                                    {t("Select All")}
                                </button>
                            </div>

                            <div class="border-top pt-2">
                                {#each patientTypes as type}
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
            </div>

            {#if enable_account_groups}
            <div class="col-md-2">
                <div class="dropdown d-inline"  bind:this={groupDropdownEl}>
                    <button
                        class="btn btn-outline-secondary dropdown-toggle"
                        type="button"
                        on:click={() => (groupDropdownOpen = !groupDropdownOpen)}
                    >
                        {#if filterGroup.size === 0}
                            {t("Patient Groups")}
                        {:else}
                            {t("Patient Groups")} ({filterGroup.size})
                        {/if}
                    </button>

                    {#if groupDropdownOpen}
                        <div
                            class="dropdown-menu show p-2 shadow"
                            style="min-width:260px; max-height:320px; overflow:auto;"
                        >
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
            </div>
            {/if}

            <div class="col-md-2 d-none">
                <select class="form-select" bind:value={filterStatus}>
                    <option value="active">{t("Active")}</option>
                    <option value="inactive">{t("Inactive")}</option>
                    <option value="all">{t("All")}</option>
                </select>
            </div>

            <div class="col-md-2 offset-md-1 text-end">
                <select
                    class="form-select form-select-sm d-inline-block w-auto"
                    bind:value={itemsPerPage}
                >
                    <option value={5}>5 {t("per page")}</option>
                    <option value={10}>10 {t("per page")}</option>
                    <option value={20}>20 {t("per page")}</option>
                    <option value={50}>50 {t("per page")}</option>
                </select>
            </div>
            <div class="col-md-2">
                <button
                    class="btn btn-primary w-100"
                    on:click={() => modalRef?.openModal()}
                >
                    <i class="bi bi-plus-circle"></i>
                    {t("Add Patient")}
                </button>
            </div>
        </div>
    </div>

    <div class="card-body p-0">
        {#if loading}
            <div class="text-center p-4">
                <div class="spinner-border text-primary" role="status"></div>
            </div>
        {:else}
            <div class="table-responsive">
                <table class="table table-sm table-hover mb-0">
                 {#if showTotalPercentage}

                    <thead class="table-light">
                        <tr>
                                <th
                                    colspan="12"
                                    class="text-center fs-5 fw-bold p-3"
                                    >{t("List")}{t("-of-")}{t("Shareholders")}</th
                                >
                            </tr>
                            </thead>
                    {/if}
                    <thead class="table-light">
                        <tr>
                            <th
                                class="ps-4 cursor-pointer"
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
                                class="cursor-pointer"
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
                                class="text-center cursor-pointer"
                                on:click={() => setSort("code")}
                            >
                                {t("Code")}
                                {#if sortColumn === "code"}
                                    <i
                                        class="bi bi-arrow-{sortDirection ===
                                        'asc'
                                            ? 'up'
                                            : 'down'} ms-1"
                                    ></i>
                                {/if}
                            </th>

                                {#if showTotalPercentage}

                                    <th
                                        class="cursor-pointer"
                                        on:click={() => setSort("percentage")}
                                    >
                                        {t("Percentage")}
                                        {#if sortColumn === "percentage"}
                                            <i
                                                class="bi bi-arrow-{sortDirection ===
                                                'asc'
                                                    ? 'up'
                                                    : 'down'} ms-1"
                                            ></i>
                                        {/if}
                                    </th>
                                    {:else}
                            <th
                                class="text-center cursor-pointer"
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
                            {/if}

                            {#if enable_account_groups}


                            <th
                                class="text-center cursor-pointer"
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

                            <th class="text-center">{t("Actions")}</th>
                        </tr>
                    </thead>
                    <tbody>
                    
                        {#each paginatedPatients as acc}
                            <tr>
                                <td class="ps-4 text-muted small"  style="vertical-align:middle">{shortID(acc.id)}</td>
                                <td class="d-flex align-items-center gap-1"  style="vertical-align:middle">
                                    {#if acc.imageUrl}
                                        <img
                                            src={acc.imageUrl ||
                                                "/img/no-image.png"}
                                            width="50"
                                            height="50"
                                            style="object-fit:cover;border-radius:6px;"
                                        />
                                    {:else}
                                        <div
                                            class="me-2 d-flex align-items-center justify-content-center bg-{getPatientTypeColor(
                                                acc.patient_type_id || 0,
                                            )} text-white fw-bold me-2"
                                            style="width:50px;height:50px;border-radius:6px;"
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
                                </td>

                                <td class="text-center"  style="vertical-align:middle">{acc.code}</td>
                                {#if showTotalPercentage}
                                <td style="vertical-align:middle">{#if acc?.patient_type_id==7}<span dir='ltr' class="fw-bold">{Number(acc?.percentage).toLocaleString(undefined,{maximumFractionDigits: 3})}%</span>{/if}
                                        </td>

                                    {:else}
                                <td class="text-center"  style="vertical-align:middle"
                                    >{#if acc.patient_type_id}
                                    <span class="badge bg-{getPatientTypeColor(acc.patient_type_id || 0)}">
                                    {getTypeName(
                                            acc.patient_type_id,
                                        )}
                                        </span>
                                        
                                        
                                        {:else}-{/if}
                                        
                                        </td
                                >

                                {/if}

                            {#if enable_account_groups}


                                <td class="text-center"  style="vertical-align:middle"
                                    >{#if acc.account_group_id}{accountGroups.find(ac=>ac.id==acc.account_group_id)?.name
                                            }{:else}-{/if}</td
                                >
                            {/if}
                                <td class="text-center"  style="vertical-align:middle">
                                    <button
                                        class="btn btn-sm btn-outline-primary me-1"
                                        on:click={() =>
                                            push(
                                                `/dashboard/account/${acc.id}`,
                                            )}
                                        title="View"
                                        ><i class="bi bi-eye"></i></button
                                    >
                                    <button
                                        class="btn btn-sm btn-outline-secondary me-1"
                                        on:click={() => openModal(acc)}
                                        ><i class="bi bi-pencil"></i></button
                                    >
                                    <!-- {#if !acc.main_acc}
                                        <button
                                            class="btn btn-sm btn-outline-danger"
                                            on:click={() =>
                                                deletePatient(acc.id)}
                                            ><i class="bi bi-trash"></i></button
                                        >
                                    {/if} -->
                                </td>
                            </tr>
                        {/each}
                        {#if filteredPatients.length === 0}
                            <tr>
                                <td
                                    colspan="12"
                                    class="text-center text-muted p-4"
                                    >{t("No patients found.")}</td
                                >
                            </tr>
                        {/if}
                        {#if showTotalPercentage}
                        <tr>
                                <td
                                    colspan="12"
                                    class="text-center fw-bold p-4"
                                    >{t("Total")} {t("Percentage")}: <span dir='ltr'>{totalPercentage}%</span></td
                                >
                            </tr>
                            {/if}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>

    {#if !loading && filteredPatients.length > 0}
        <div
            class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3"
        >
            <div class="text-muted small">
                {t("Showing")}
                {(currentPage - 1) * itemsPerPage + 1}
                {t("to")}
                {Math.min(currentPage * itemsPerPage, filteredPatients.length)}
                {t("of")}
                {filteredPatients.length}
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
<PatientModal bind:this={modalRef} {patientTypes} on:saved={loadPatients} />

<style>
    .cursor-pointer {
        cursor: pointer;
    }
    .pagination-circle .page-link {
        border-radius: 50% !important;
        margin-left: 3px;
        margin-right: 3px;
        border: none;
    }
</style>
