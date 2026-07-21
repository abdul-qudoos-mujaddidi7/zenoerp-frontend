<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  let userRoles = [];
  let userRolesModalEl;

  let name = '';
  let description = '';
  let status = 1;
  let parsedPermissions = [];
  let editingId = null;
  let saving = false;

  const permissionItems = [
    'Products',
    'POS',
    'Sales',
    'Benefit',
    'Purchases',
    'Accounts',
    'Journals',
    'Exchange',
    'Services',
    'Users',
    'Settings',
  ];

  function setDefaultPermissions() {
    parsedPermissions = permissionItems.map((item) => ({
      code: item,
      view: false,
      create: false,
      edit: false,
      approve: false,
      delete: false,
    }));
  }

  function getModalInstance() {
    if (!userRolesModalEl) {
      console.error('User role modal element was not found.');
      return null;
    }

    if (!window.mdb?.Modal) {
      console.error('MDB Modal is not available.');
      return null;
    }

    return window.mdb.Modal.getOrCreateInstance(
      userRolesModalEl
    );
  }

  async function loadUserRoles() {
    try {
      userRoles = await db.user_roles
        .where('status')
        .equals(1)
        .toArray();
    } catch (error) {
      console.error('Failed to load user roles:', error);
      userRoles = [];
    }
  }

  function resetForm() {
    editingId = null;
    name = '';
    description = '';
    status = 1;

    setDefaultPermissions();
  }

  function toggleAll(permission, checked) {
    permission.view = checked;
    permission.create = checked;
    permission.edit = checked;
    permission.approve = checked;
    permission.delete = checked;

    parsedPermissions = [...parsedPermissions];
  }

  function isAllSelected(permission) {
    return (
      permission.view &&
      permission.create &&
      permission.edit &&
      permission.approve &&
      permission.delete
    );
  }

  function parsePermissions(value) {
    if (!value) {
      return [];
    }

    try {
      const parsed =
        typeof value === 'string'
          ? JSON.parse(value)
          : value;

      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to parse permissions:', error);
      return [];
    }
  }

  onMount(() => {
    setDefaultPermissions();
    loadUserRoles();
  });

  export async function openUserRoleModal() {
    resetForm();

    await tick();

    getModalInstance()?.show();

    setTimeout(() => {
      document.getElementById('role-name')?.focus();
    }, 200);
  }

  export async function editUserRole(role) {
    editingId = role.id;
    name = role.name || '';
    description = role.description || '';
    status = Number(role.status ?? 1);

    setDefaultPermissions();

    const savedPermissions = parsePermissions(
      role.permissions
    );

    parsedPermissions = parsedPermissions.map(
      (defaultPermission) => {
        const existingPermission =
          savedPermissions.find(
            (permission) =>
              permission.code === defaultPermission.code
          );

        return existingPermission
          ? {
              ...defaultPermission,
              ...existingPermission,
            }
          : defaultPermission;
      }
    );

    await tick();

    getModalInstance()?.show();

    setTimeout(() => {
      document.getElementById('role-name')?.focus();
    }, 200);
  }

  async function saveUserRole() {
    const cleanName = name.trim();
    const cleanDescription = description.trim();

    if (!cleanName) {
      alert(t('Name is required.'));
      document.getElementById('role-name')?.focus();
      return;
    }

    saving = true;

    try {
      const oldRole = editingId
        ? userRoles.find((role) => role.id === editingId)
        : null;

      const roleData = {
        name: cleanName,
        description: cleanDescription,
        permissions: JSON.stringify(parsedPermissions),
        status: Number(status) || 1,
      };

      let savedId = editingId;

      if (editingId) {
        await db.user_roles.update(
          editingId,
          roleData
        );
      } else {
        savedId = await db.user_roles.add(roleData);
      }

      await logActivity({
        user_id:
          parseInt(localStorage.getItem('user_id')) || 0,
        action: editingId ? 'update' : 'create',
        table_name: 'user_roles',
        entity_id: savedId,
        old_values: oldRole
          ? JSON.stringify(oldRole)
          : null,
        new_values: JSON.stringify(roleData),
        description: `${
          editingId ? 'Updated' : 'Created'
        } user role ${cleanName}`,
      });

      await loadUserRoles();

      dispatch('saved', {
        id: savedId,
        ...roleData,
      });

      getModalInstance()?.hide();
      resetForm();
    } catch (error) {
      console.error('Failed to save user role:', error);

      alert(
        `${t('Error saving user role')}: ${error.message}`
      );
    } finally {
      saving = false;
    }
  }

  async function deleteUserRole(id) {
    if (!confirm(t('Delete this user role?'))) {
      return;
    }

    try {
      const oldRole = userRoles.find(
        (role) => role.id === id
      );

      await logActivity({
        user_id:
          parseInt(localStorage.getItem('user_id')) || 0,
        action: 'delete',
        table_name: 'user_roles',
        entity_id: id,
        old_values: oldRole
          ? JSON.stringify(oldRole)
          : null,
        new_values: null,
        description: `Deleted user role #${id}`,
      });

      await db.user_roles.update(id, {
        status: 0,
      });

      await loadUserRoles();
      dispatch('saved');
    } catch (error) {
      console.error('Failed to delete user role:', error);

      alert(
        `${t('Error deleting user role')}: ${error.message}`
      );
    }
  }
</script>

<div
  bind:this={userRolesModalEl}
  class="modal fade qa-modal"
  dir={t('dir')}
  id="createUserRoleModal"
  tabindex="-1"
  aria-hidden="true"
>
  <div class="modal-dialog modal-lg modal-dialog-centered">
    <div class="modal-content qa-modal__panel">
      <button
        type="button"
        class="qa-modal__close"
        data-mdb-dismiss="modal"
        aria-label={t('Close')}
      >
        <i class="bi bi-x-lg"></i>
      </button>

      <div class="qa-modal__header">
        <div class="qa-modal__icon">
          <i class="bi bi-shield-lock"></i>
        </div>

        <div>
          <span class="qa-modal__eyebrow">
            {t('User Role')}
          </span>

          <h3>{t('Users quick action')}</h3>
        </div>
      </div>

      <div class="qa-modal__intro">
        <h2>
          {editingId
            ? t('Update User Role')
            : t('Create User Role')}
        </h2>

      
      </div>

      <form
        class="qa-modal__form"
        on:submit|preventDefault={saveUserRole}
      >
        <div class="role-fields-row">
          <label class="qa-modal__field">
            <span>{t('Name')}</span>

            <input
              type="text"
              id="role-name"
              bind:value={name}
              autocomplete="off"
            />
          </label>

          <label class="qa-modal__field">
            <span>{t('Description')}</span>

            <textarea
              id="role-description"
              rows="1"
              bind:value={description}
            ></textarea>
          </label>
        </div>

        <div class="permission-card">
          <div class="permission-card__header">
            <h4>{t('Permissions')}</h4>

            <div class="permission-card__icon">
              <i class="bi bi-key"></i>
            </div>
          </div>

          <div class="table-responsive">
            <table
              class="table table-sm table-striped table-hover align-middle mb-0 permission-table"
            >
              <thead class="table-light">
                <tr>
                  <th>{t('Module')}</th>

                  <th class="text-center">
                    {t('All')}
                  </th>

                  <th class="text-center">
                    {t('View')}
                  </th>

                  <th class="text-center">
                    {t('Create')}
                  </th>

                  <th class="text-center">
                    {t('Edit')}
                  </th>

                  <th class="text-center">
                    {t('Approve')}
                  </th>

                  <th class="text-center">
                    {t('Delete')}
                  </th>
                </tr>
              </thead>

              <tbody>
                {#each parsedPermissions as permission}
                  <tr>
                    <td>
                      <strong>
                        {t(permission.code)}
                      </strong>
                    </td>

                    <td class="text-center">
                      <input
                        type="checkbox"
                        class="form-check-input"
                        checked={isAllSelected(permission)}
                        aria-label={`${t(
                          permission.code
                        )} ${t('All')}`}
                        on:change={(event) =>
                          toggleAll(
                            permission,
                            event.currentTarget.checked
                          )}
                      />
                    </td>

                    <td class="text-center">
                      <input
                        type="checkbox"
                        class="form-check-input"
                        bind:checked={permission.view}
                        aria-label={`${t(
                          permission.code
                        )} ${t('View')}`}
                      />
                    </td>

                    <td class="text-center">
                      <input
                        type="checkbox"
                        class="form-check-input"
                        bind:checked={permission.create}
                        aria-label={`${t(
                          permission.code
                        )} ${t('Create')}`}
                      />
                    </td>

                    <td class="text-center">
                      <input
                        type="checkbox"
                        class="form-check-input"
                        bind:checked={permission.edit}
                        aria-label={`${t(
                          permission.code
                        )} ${t('Edit')}`}
                      />
                    </td>

                    <td class="text-center">
                      <input
                        type="checkbox"
                        class="form-check-input"
                        bind:checked={permission.approve}
                        aria-label={`${t(
                          permission.code
                        )} ${t('Approve')}`}
                      />
                    </td>

                    <td class="text-center">
                      <input
                        type="checkbox"
                        class="form-check-input"
                        bind:checked={permission.delete}
                        aria-label={`${t(
                          permission.code
                        )} ${t('Delete')}`}
                      />
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <button
          type="submit"
          class="qa-modal__submit"
          disabled={saving}
        >
          {#if saving}
            <span
              class="spinner-border spinner-border-sm"
              role="status"
              aria-hidden="true"
            ></span>

            <span>{t('Saving')}</span>
          {:else}
            <span>
              {editingId
                ? t('Update User Role')
                : t('Create User Role')}
            </span>
          {/if}
        </button>
      </form>
    </div>
  </div>
</div>

<style>
  /*
   * Bootstrap controls the modal width and responsiveness.
   * Global qa-modal CSS controls the modal header, intro,
   * input fields, close button and submit button.
   */

  .role-fields-row {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: end;
    gap: 14px;
    width: 100%;
  }

  .role-fields-row .qa-modal__field {
    width: 100%;
    min-width: 0;
    margin: 0;
  }

  .role-fields-row input,
  .role-fields-row textarea {
    width: 100%;
    height: 40px;
    min-height: 40px;
    padding: 8px 11px;
    box-sizing: border-box;
  }

  .role-fields-row textarea {
    overflow: hidden;
    resize: none;
  }

  /* Permissions card */

  .permission-card {
    grid-column: 1 / -1;
    width: 100%;
    overflow: hidden;
    border: 1px solid #e2e7ef;
    border-radius: 12px;
    background: #ffffff;
  }

  .permission-card__header {
    display: flex;
    min-height: 40px;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 5px 12px;
    border-bottom: 1px solid #e7ebf1;
    background: #f8fafc;
  }

  .permission-card__header h4 {
    margin: 0;
    color: #263247;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
  }

  .permission-card__icon {
    display: grid;
    flex: 0 0 auto;
    width: 29px;
    height: 29px;
    place-items: center;
    border-radius: 7px;
    color: var(--bs-primary, #2f6fed);
    background: rgba(47, 111, 237, 0.1);
    font-size: 12px;
  }

  .permission-card .table-responsive {
  width: 100%;
  overflow-x: auto;
  overflow-y: visible;
}

.permission-table {
  width: 100%;
  min-width: 580px;
  margin: 0;
  border-collapse: collapse;
  table-layout: fixed;
}

.permission-table thead th {
  height: 24px;
  padding: 3px 2px !important;
  border-bottom: 1px solid #dfe5ed;
  color: #667085;
  background: #fbfcfd;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  text-align: center;
  vertical-align: middle;
  white-space: nowrap;
}

.permission-table tbody tr {
  height: 25px !important;
}

.permission-table tbody td {
  height: 25px !important;
  padding: 2px !important;
  border-bottom: 1px solid #e3e8ef;
  color: #344054;
  font-size: 10px;
  line-height: 1;
  text-align: center;
  vertical-align: middle;
}

/* Smaller module column */
.permission-table th:first-child,
.permission-table td:first-child {
  width: 130px;
  min-width: 130px;
  padding-inline: 8px 4px !important;
  text-align: start !important;
}

.permission-table td:first-child strong {
  display: block;
  width: 100%;
  margin: 0;
  color: #667892;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  text-align: start;
}

/* Keep permission columns close together */
.permission-table th:not(:first-child),
.permission-table td:not(:first-child) {
  width: calc((100% - 130px) / 6);
  padding-inline: 1px !important;
  text-align: center;
}

/* Smaller checkboxes */
.permission-table .form-check-input {
  float: none;
  width: 15px;
  height: 15x;
  min-width: 11px;
  margin: 0;
  padding: 0;
  vertical-align: middle;
  cursor: pointer;
  border-width: 1px;
}

.permission-table .form-check-input:checked {
  border-color: var(--bs-primary, #2f6fed);
  background-color: var(--bs-primary, #2f6fed);
}

.permission-table tbody tr:last-child td {
  border-bottom: 0;
}

.permission-table tbody tr:hover td {
  background: #f8fafc;
}

  /* Module column */

  .permission-table th:first-child,
  .permission-table td:first-child {
    padding-inline-start: 10px !important;
    padding-inline-end: 5px !important;
    text-align: start !important;
  }

  .permission-table td:first-child strong {
    display: block;
    width: 100%;
    margin: 0;
    color: #667892;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    text-align: start;
  }

  /* Permission action columns */

  .permission-table th:not(:first-child),
  .permission-table td:not(:first-child) {
    padding-inline: 3px !important;
    text-align: center;
  }

  

  .permission-table .form-check-input:checked {
    border-color: var(--bs-primary, #2f6fed);
    background-color: var(--bs-primary, #2f6fed);
  }

  .permission-table .form-check-input:focus {
    border-color: var(--bs-primary, #2f6fed);
    box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.13);
  }

  .qa-modal__submit {
    grid-column: 1 / -1;
    width: 100%;
  }

  /* RTL */

  .qa-modal[dir='rtl'] .permission-card__header {
    text-align: right;
  }

  .qa-modal[dir='rtl'] .permission-table th:first-child,
  .qa-modal[dir='rtl'] .permission-table td:first-child,
  .qa-modal[dir='rtl'] .permission-table td:first-child strong {
    text-align: right !important;
  }

  /* LTR */

  .qa-modal[dir='ltr'] .permission-card__header {
    text-align: left;
  }

  .qa-modal[dir='ltr'] .permission-table th:first-child,
  .qa-modal[dir='ltr'] .permission-table td:first-child,
  .qa-modal[dir='ltr'] .permission-table td:first-child strong {
    text-align: left !important;
  }

  @media (max-width: 767.98px) {
    .role-fields-row {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .permission-table {
      min-width: 680px;
    }

    .permission-table th:first-child,
    .permission-table td:first-child {
      width: 145px;
      min-width: 145px;
    }
  }
</style>