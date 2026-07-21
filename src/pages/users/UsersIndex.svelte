<script>
  import { onMount } from 'svelte';
  import { db } from '../../db.js';
  import { API_URL } from '../../config';
  import { t, lang, translate_org_type, shortID } from '../../i18n/i18n';
  import UserModal from './UserModal.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let users = [];
  let userRoles = [];
  let departments = [];
  let loading = true;
  let searchQuery = '';
  let selectedRole = 'all';
  let selectedDepartment = 'all';
  let selectedStatus = 'active';
  let currentPage = 1;
  let itemsPerPage = 10;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';
  let showSummaryCards = false;
  let modalRef;

  async function loadUserRoles() {
    userRoles = await db.user_roles.toArray();
  }

  async function loadDepartments() {
    departments = await db.departments.toArray();
  }

  async function loadUsers() {
    loading = true;
    try {
      users = await db.users.toArray();
      for (const user of users) {
        const image = await db.user_images
          .where('user_id')
          .equals(user.id)
          .and((item) => item.status === 1)
          .first();

        if (image?.image?.startsWith('{')) {
          const data = JSON.parse(image.image);
          user.imageUrl =
            `${API_URL}/api/sync/loadimage/${data?.table}/${data?.fieldName}/${data?.serveid}/` +
            `${localStorage.getItem('token') || 'none'}`;
        } else {
          user.imageUrl = image?.image || null;
        }
      }
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadUserRoles();
    loadDepartments();
    loadUsers();
  });

  function openModal(user = null) {
    modalRef?.openModal(user);
  }

  function setSort(column) {
    if (sortColumn === column) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    else {
      sortColumn = column;
      sortDirection = 'asc';
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
      if (previous && page - previous > 1) compact.push(page - previous === 2 ? previous + 1 : '...');
      compact.push(page);
      previous = page;
    }
    return compact;
  }

  function roleName(id) {
    return t(userRoles.find((role) => role.id === id)?.name || 'Unassigned');
  }

  function departmentName(id) {
    return t(departments.find((department) => department.id === id)?.name || 'Unassigned');
  }

  $: filteredUsers = users
    .filter((user) => {
      if (selectedStatus === 'active' && user.status !== 1) return false;
      if (selectedStatus === 'inactive' && user.status === 1) return false;
      if (selectedRole !== 'all' && user.role_id !== Number(selectedRole)) return false;
      if (selectedDepartment !== 'all' && user.department_id !== Number(selectedDepartment)) return false;
      const term = searchQuery.trim().toLowerCase();
      if (!term) return true;
      return [user.username, user.email, user.first_name, user.last_name, user.phone].some((value) =>
        String(value ?? '').toLowerCase().includes(term),
      );
    })
    .sort((a, b) => {
      let left = sortColumn === 'role_id' ? roleName(a.role_id) : sortColumn === 'department_id' ? departmentName(a.department_id) : a[sortColumn];
      let right = sortColumn === 'role_id' ? roleName(b.role_id) : sortColumn === 'department_id' ? departmentName(b.department_id) : b[sortColumn];
      left = String(left ?? '').toLowerCase();
      right = String(right ?? '').toLowerCase();
      if (left === right) return 0;
      const result = left < right ? -1 : 1;
      return sortDirection === 'asc' ? result : -result;
    });

  $: totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  $: if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
  $: paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  $: activeCount = users.filter((user) => user.status === 1).length;
  $: inactiveCount = users.filter((user) => user.status !== 1).length;

  $: userFilters = [
    {
      key: 'role',
      label: t('Role'),
      value: selectedRole,
      icon: 'bi-person-gear',
      options: [
        { value: 'all', label: t('All Roles') },
        ...userRoles.filter((role) => role.status === 1).map((role) => ({ value: role.id, label: t(role.name) })),
      ],
    },
    {
      key: 'department',
      label: t('Department'),
      value: selectedDepartment,
      icon: 'bi-diagram-3',
      options: [
        { value: 'all', label: t('All Departments') },
        ...departments.filter((department) => department.status === 1).map((department) => ({ value: department.id, label: department.name })),
      ],
    },
    {
      key: 'status',
      label: t('Status'),
      value: selectedStatus,
      icon: 'bi-activity',
      options: [
        { value: 'all', label: t('All Statuses') },
        { value: 'active', label: t('Active') },
        { value: 'inactive', label: t('Inactive') },
      ],
    },
  ];

  function handleFilter(event) {
    const { key, value } = event.detail;
    if (key === 'role') selectedRole = value;
    if (key === 'department') selectedDepartment = value;
    if (key === 'status') selectedStatus = value;
    currentPage = 1;
  }

  function resetFilters() {
    selectedRole = 'all';
    selectedDepartment = 'all';
    selectedStatus = 'active';
    currentPage = 1;
  }
</script>

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('User Management')}
  toolbarWidth="25rem"
  showStats={showSummaryCards}
  showFooter={!loading && filteredUsers.length > 0}
  dense={true}
  contained={false}
  contentClass="users-index-content"
  tablePadding={true}>
  <svelte:fragment slot="actions">
    <ActionButton icon="bi-person-plus" label={`+ ${t('Add User')}`} on:click={() => openModal()} />
    <button
      type="button"
      class="index-settings-button"
      class:is-active={showSummaryCards}
      aria-label={t('Summary')}
      aria-expanded={showSummaryCards}
      title={t('Summary')}
      on:click={() => (showSummaryCards = !showSummaryCards)}>
      <i class="bi {showSummaryCards ? 'bi-x-lg' : 'bi-people'}"></i>
    </button>
  </svelte:fragment>

  <svelte:fragment slot="toolbar">
    <FilterToolbar
      searchValue={searchQuery}
      searchPlaceholder={t('Search by username, email, or name...')}
      filters={userFilters}
      filterLabel={t('Filter')}
      resetLabel={t('Clear Filters')}
      on:searchChange={(event) => { searchQuery = event.detail; currentPage = 1; }}
      on:filterChange={handleFilter}
      on:reset={resetFilters} />
  </svelte:fragment>

  <svelte:fragment slot="stats">
    <div class="index-summary-grid">
      <SummaryCard label={t('Users')} icon="bi-people" tone="cyan">{users.length}</SummaryCard>
      <SummaryCard label={t('Active')} icon="bi-person-check" tone="green">{activeCount}</SummaryCard>
      <SummaryCard label={t('Inactive')} icon="bi-person-dash" tone="amber">{inactiveCount}</SummaryCard>
      <SummaryCard label={t('User Roles')} icon="bi-person-gear" tone="purple">{userRoles.filter((role) => role.status === 1).length}</SummaryCard>
    </div>
  </svelte:fragment>

  {#if loading}
    <div class="index-table-state"><EmptyState loading message={t('Loading...')} /></div>
  {:else if filteredUsers.length === 0}
    <div class="index-table-state"><EmptyState icon="bi-people" message={t('No users found.')} /></div>
  {:else}
    <DataTable ariaLabel={t('Users')} minWidth="1050px" dense striped hover={false} stickyHeader layout="fixed" scrollbar="thin">
      <svelte:fragment slot="head">
        <tr>
          <th class="col-start">#</th>
          <th>{t('Image')}</th>
          <th class="col-start cursor-pointer" on:click={() => setSort('username')}>{t('Username')}</th>
          <th class="col-start cursor-pointer" on:click={() => setSort('first_name')}>{t('Name')}</th>
          <th class="col-start">{t('Email')}</th>
          <th>{t('Phone')}</th>
          <th class="cursor-pointer" on:click={() => setSort('role_id')}>{t('Role')}</th>
          <th class="cursor-pointer" on:click={() => setSort('department_id')}>{t('Department')}</th>
          <th>{t('Status')}</th>
          <th>{t('Created At')}</th>
          <th>{t('Actions')}</th>
        </tr>
      </svelte:fragment>

      {#each paginatedUsers as user, index (user.id)}
        <tr>
          <td class="col-start cell-muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>
          <td><img class="user-avatar" src={user.imageUrl || '/img/no-image.png'} alt={user.first_name || user.username} /></td>
          <td class="col-start"><span class="username">{user.username}</span></td>
          <td class="col-start"><strong>{user.first_name} {user.last_name}</strong></td>
          <td class="col-start"><span class="email-cell">{user.email || '—'}</span></td>
          <td>{user.phone || '—'}</td>
          <td><StatusBadge tone="neutral" ghost>{roleName(user.role_id)}</StatusBadge></td>
          <td><StatusBadge tone="neutral" ghost>{departmentName(user.department_id)}</StatusBadge></td>
          <td><StatusBadge tone={user.status === 1 ? 'positive' : 'neutral'}>{user.status === 1 ? t('Active') : t('Inactive')}</StatusBadge></td>
          <td><span class="cell-muted" dir="ltr">{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</span></td>
          <td>
            <div class="visible-table-actions">
              <ActionButton variant="icon" tone="edit" icon="bi-pencil" title={t('Edit')} on:click={() => openModal(user)} />
            </div>
          </td>
        </tr>
      {/each}
    </DataTable>
  {/if}

  <svelte:fragment slot="footer">
    <PaginationBar
      bind:currentPage
      {totalPages}
      {itemsPerPage}
      totalItems={filteredUsers.length}
      ariaLabel={t('Users pagination')}
      rowLabel={t('rows')}
      on:perPageChange={(event) => { itemsPerPage = Number(event.detail); currentPage = 1; }}
      {getPageNumbers} />
  </svelte:fragment>
</IndexPageLayout>

<UserModal bind:this={modalRef} userRoles={userRoles} departments={departments} on:saved={loadUsers} />

<style>
  .cursor-pointer { cursor: pointer; }
  .cell-muted { color: #7b8ba1; font-weight: 650; }
  .user-avatar { width: 2rem; height: 2rem; border: 2px solid #e9eef5; border-radius: 50%; object-fit: cover; }
  .username { color: #0f6efd; font-weight: 800; }
  .email-cell { display: block; overflow: hidden; color: #64748b; text-overflow: ellipsis; white-space: nowrap; }
  .visible-table-actions { display: inline-flex; align-items: center; justify-content: center; }
  .visible-table-actions :global(.action-btn.icon),
  .visible-table-actions :global(.action-btn.icon:hover:not(:disabled)) {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }
</style>
