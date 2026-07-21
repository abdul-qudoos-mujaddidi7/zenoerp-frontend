<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { db, logActivity } from '../../db.js';
  import { hashPassword, validatePasswordStrength, generateTemporaryPassword } from '../../utils/passwordHelper.js';
  import { lang } from '../../i18n/i18n.js';

  import { t } from '../../i18n/i18n.js';
  $: _lang = $lang;
  export let userRoles = [];
  export let departments = [];
  export let user = null;

  const dispatch = createEventDispatcher();

  let org_id = 'z' + localStorage.getItem('org_id') || null;

  // Form fields
  let role_id = '';
  let department_id = '';
  let username = '';
  let email = '';
  let first_name = '';
  let last_name = '';
  let phone = '';
  let address = '';
  let description = '';
  let permissions = '';

  let parsedPermissions = [];

  const permission_items = ['Products', 'POS','Sales','Benefit', 'Purchases', 'Accounts', 'Journals','Exchange','Services', 'Users', 'Settings'];

  function setDefaultPermissions() {
    parsedPermissions = permission_items.map((item) => ({
      code: item,
      view: false,
      create: false,
      edit: false,
      approve: false,
      delete: false,
    }));
  }

  setDefaultPermissions();
  function toggleAll(permission, checked) {
    permission.view = checked;
    permission.create = checked;
    permission.edit = checked;
    permission.approve = checked;
    permission.delete = checked;
    parsedPermissions = [...parsedPermissions];
  }
  let password = '';
  let confirmPassword = '';
  let status = 1;
  let showPassword = false;
  let passwordStrength = null;
  let modal;
  let imageBase64 = null;
  let modalImageUrl = null;
  const passwordHelper = { hashPassword, validatePasswordStrength, generateTemporaryPassword };
  onMount(() => {
    const modalEl = document.getElementById('userModal');
    if (window.mdb) {
      modal = new window.mdb.Modal(modalEl);
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
    }
    if (user) loadUser(user);
  });

  $: if (user) loadUser(user);

  function loadUser(usr) {
    if (usr) {
      role_id = usr.role_id || '';
      department_id = usr.department_id || '';
      username = usr.username.startsWith(org_id) ? usr.username.slice(org_id.length) : usr.username || '';
      email = usr.email || '';
      first_name = usr.first_name || '';
      last_name = usr.last_name || '';
      phone = usr.phone || '';
      address = usr.address || '';
      description = usr.description || '';
      permissions = usr.permissions || '';
      status = usr.status || 1;
      password = '';
      confirmPassword = '';
      modalImageUrl = usr.imageUrl;
      imageBase64 = null;
      user = usr;
      if (usr.permissions) {
        const savedPermissions = JSON.parse(usr.permissions);
        parsedPermissions = parsedPermissions.map((defaultPermission) => {
          const existing = savedPermissions.find((p) => p.code === defaultPermission.code);
          return existing ? { ...defaultPermission, ...existing } : defaultPermission;
        });
      } else {
        setDefaultPermissions();
      }
    } else {
      resetForm();
    }
  }
  function resetForm() {
    role_id = '';
    department_id = '';
    username = '';
    email = '';
    first_name = '';
    last_name = '';
    phone = '';
    address = '';
    description = '';
    permissions = '';
    password = '';
    confirmPassword = '';
    status = 1;
    passwordStrength = null;
    modalImageUrl = null;
    imageBase64 = null;
    user = null;
    showPassword = false;
    setDefaultPermissions();
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    imageBase64 = await convertToWebP(file, 400, 400);
    modalImageUrl = imageBase64;
  }

  function convertToWebP(file, maxWidth = 800, fixedSize = null) {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => (img.src = e.target.result);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let width = img.width;
        let height = img.height;
        if (fixedSize) {
          const canvasSize = fixedSize;
          const scale = Math.min(canvasSize / width, canvasSize / height);
          const drawWidth = width * scale;
          const drawHeight = height * scale;
          const x = (canvasSize - drawWidth) / 2;
          const y = (canvasSize - drawHeight) / 2;
          canvas.width = canvasSize;
          canvas.height = canvasSize;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, x, y, drawWidth, drawHeight);
        } else {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
        }
        resolve(canvas.toDataURL('image/webp', 0.8));
      };
      reader.readAsDataURL(file);
    });
  }

  function checkPasswordStrength() {
    passwordStrength = validatePasswordStrength(password);
  }

  function generatePassword() {
    password = generateTemporaryPassword();
    confirmPassword = password;
    checkPasswordStrength();
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      }
    }, 100);
  }

  async function saveUser() {
    const usernameTrimmed = (username || '').trim();
    const emailTrimmed = (email || '').trim();
    if (!usernameTrimmed || !first_name.trim()) {
      alert('Username and First Name are required.');
      return;
    }
    if (!department_id) {
      alert('Department is required.');
      return;
    }
    if (!role_id) {
      alert('Role is required.');
      return;
    }
    const existingUser = await db.users.where('username').equals(usernameTrimmed).first();
    if (existingUser && existingUser.id !== user?.id) {
      alert('Username already exists!');
      return;
    }
    if (!emailTrimmed) {
      alert('Email is required.');
      return;
    }
    if (emailTrimmed) {
      const existingEmail = await db.users.where('email').equals(emailTrimmed).first();
      if (existingEmail && existingEmail.id !== user?.id) {
        alert('Email already exists!');
        return;
      }
    }
    if (!user?.id) {
      if (!password.trim()) {
        alert('Password is required for new users.');
        return;
      }
      if (password !== confirmPassword) {
        alert('Passwords do not match!');
        return;
      }
      if (password.length < 8) {
        alert('Password must be at least 8 characters long.');
        return;
      }
    } else if (password.trim()) {
      if (password !== confirmPassword) {
        alert('Passwords do not match!');
        return;
      }
      if (password.length < 8) {
        alert('Password must be at least 8 characters long.');
        return;
      }
    }

    try {
      let userId;
      if (user?.id) {
        let oldUser = await db.users.get(user.id);
        const updateData = {
          department_id: parseInt(department_id) || 0,
          role_id: parseInt(role_id) || 0,
          username: org_id + '' + usernameTrimmed,
          email: emailTrimmed,
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          description: description.trim(),
          permissions: JSON.stringify(parsedPermissions),
          language: 'en',
          theme: 'light',
          status: parseInt(status) || 1,
        };
        if (password.trim()) {
          updateData.password_hash = await hashPassword(password);
        }
        await db.users.update(user.id, updateData);
        userId = user.id;
        let accountId = await db.accounts.update(userId, {
          name: first_name.trim() + ' ' + last_name.trim(),
          name_fa: first_name.trim() + ' ' + last_name.trim(),
          name_ps: first_name.trim() + ' ' + last_name.trim(),
          description: description.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'update',
          table_name: 'users',
          entity_id: userId,
          old_values: JSON.stringify(oldUser),
          new_values: JSON.stringify({ ...oldUser, ...updateData }),
          description: `Updated user ${usernameTrimmed}`,
        });
      } else {
        userId = await db.users.add({
          department_id: parseInt(department_id) || 0,
          role_id: parseInt(role_id) || 0,
          username: org_id + '' + usernameTrimmed,
          email: emailTrimmed,
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          description: description.trim(),
          permissions: JSON.stringify(parsedPermissions),
          language: 'en',
          theme: 'light',
          password_hash: await hashPassword(password),
          status: parseInt(status) || 1,
        });
        let accountId = await db.accounts.add({
          id: userId,
          account_type_id: 8,
          account_group_id: 1,
          code: userId,
          name: first_name.trim() + ' ' + last_name.trim(),
          main_acc: 'false',
          name_fa: first_name.trim() + ' ' + last_name.trim(),
          name_ps: first_name.trim() + ' ' + last_name.trim(),
          balance: 0,
          currency: 'AFN',
          description: description.trim(),
          percentage: 0,
          phone: phone.trim(),
          phone2: '',
          email: email.trim(),
          address: address.trim(),
          status: parseInt(status) || 1,
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'create',
          table_name: 'users',
          entity_id: userId,
          old_values: null,
          new_values: JSON.stringify({
            department_id: parseInt(department_id) || 0,
            role_id: parseInt(role_id) || 0,
            username: usernameTrimmed,
            email: emailTrimmed,
            first_name: first_name.trim(),
            last_name: last_name.trim(),
            phone: phone.trim(),
            address: address.trim(),
            description: description.trim(),
            permissions: JSON.stringify(parsedPermissions),
            language: 'en',
            theme: 'light',
            status: parseInt(status) || 1,
          }),
          description: `Created user ${usernameTrimmed}`,
        });
      }
      if (imageBase64) {
        await db.user_images.add({
          user_id: userId,
          image: imageBase64,
          status: 1,
        });
        await db.account_images.add({
          account_id: userId,
          image: imageBase64,
          status: 1,
        });
      }
      resetForm();
      modal.hide();
      dispatch('saved');
    } catch (err) {
      console.error('Error saving user:', err);
      alert('Error saving user: ' + err.message);
    }
  }
  export function openModal(usr = null) {
    if (usr) {
      loadUser(usr);
    } else {
      resetForm();
    }
    modal?.show();
  }
  function loadPermissions() {
    if (!role_id) {
      alert('Please select a role first.');
      return;
    }
    const selectedRole = userRoles.find((r) => r.id === parseInt(role_id));
    if (selectedRole && selectedRole.permissions) {
      const rolePermissions = JSON.parse(selectedRole.permissions);
      parsedPermissions = parsedPermissions.map((defaultPermission) => {
        const existing = rolePermissions.find((p) => p.code === defaultPermission.code);
        return existing ? { ...defaultPermission, ...existing } : defaultPermission;
      });
    } else {
      setDefaultPermissions();
    }
  }
</script>
<div class="modal fade" id="userModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-scrollable modal-xl">
    <div class="modal-content border-0 shadow-lg">
      <div class="modal-header bg-primary text-white border-0">
        <h5 class="modal-title">
          <i class="bi bi-person-check me-2"></i>
          {user?.id ? 'Edit User' : 'Create New User'}
        </h5>
        <button type="button" class="btn-close btn-close-white" data-mdb-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="row">
          <div class="col-md-5">
            <div class="h3">{t('Personal Information')}</div>
            <div class="text-center mb-4 pb-3 border-bottom">
              <div class="mb-3">
                <img
                  src={modalImageUrl || '/img/no-image.png'}
                  alt="User Profile"
                  width="100"
                  height="100"
                  style="object-fit: cover; border-radius: 50%; border: 3px solid #e9ecef;" />
              </div>
              <div class="d-flex justify-content-center">
                <label class="btn btn-outline-primary btn-sm">
                  <i class="bi bi-camera"></i>
                  {t('Upload Photo')}
                  <input type="file" accept="image/*" on:change={handleImageUpload} hidden />
                </label>
              </div>
            </div>
            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-outline" data-mdb-input-init>
                  <input type="text" id="first-name" class="form-control form-control-sm" bind:value={first_name} />
                  <label class="form-label" for="first-name">{t('First Name')}*</label>
                </div>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-outline" data-mdb-input-init>
                  <input type="text" id="last-name" class="form-control form-control-sm" bind:value={last_name} />
                  <label class="form-label" for="last-name">{t('Last Name')}</label>
                </div>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-outline" data-mdb-input-init>
                  <input type="email" id="email" class="form-control form-control-sm" bind:value={email} />
                  <label class="form-label" for="email">{t('Email')}*</label>
                </div>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-outline" data-mdb-input-init>
                  <input type="tel" id="phone" class="form-control form-control-sm" bind:value={phone} />
                  <label class="form-label" for="phone">{t('Phone')}</label>
                </div>
              </div>
              <div class="col-md-12 mb-3">
                <div class="form-outline" data-mdb-input-init>
                  <textarea id="address" class="form-control form-control-sm" bind:value={address}></textarea>
                  <label class="form-label" for="address">{t('Address')}</label>
                </div>
              </div>
              <div class="col-md-12 mb-3">
                <div class="form-outline" data-mdb-input-init>
                  <textarea id="description" class="form-control form-control-sm" bind:value={description}></textarea>
                  <label class="form-label" for="description">{t('Description')}</label>
                </div>
              </div>
              <div class="col-md-12 mb-3"></div>
            </div>
            <div class="mb-4">
              <div class="row">
                <div class="col-md-6 mb-3">
                  <select id="department-select" class="form-select form-select-sm" bind:value={department_id}>
                    <option value="">{t('Select a department...')}</option>
                    {#each departments as department}
                      {#if department.status === 1}
                        <option value={department.id}>{t(department.name)}</option>
                      {/if}
                    {/each}
                  </select>
                </div>
                <div class="col-md-12 mb-3">
                  <div class="input-group input-group-sm">
                    <div class="input-group-text">
                      {org_id}
                    </div>
                    <div class="form-outline" data-mdb-input-init>
                      <input type="text" id="username" class="form-control form-control-sm" bind:value={username} />
                      <label class="form-label" for="username">{t('Username')}*</label>
                    </div>
                  </div>
                </div>
                <div class="col-md-6 mb-3">
                  <div class="form-outline position-relative" data-mdb-input-init>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      class="form-control form-control-sm"
                      bind:value={password}
                      on:input={checkPasswordStrength}
                      placeholder="••••••••" />
                    <label class="form-label" for="password">{t('Password')} {user?.id ? '' : '*'}</label>
                    <button
                      type="button"
                      class="btn btn-link position-absolute end-0 top-50 translate-middle-y"
                      on:click={() => (showPassword = !showPassword)}
                      style="z-index: 10;">
                      <i class={`bi bi-eye${showPassword ? '-slash' : ''}`}></i>
                    </button>
                  </div>
                </div>
                <div class="col-md-6 mb-3">
                  <div class="form-outline" data-mdb-input-init>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="confirm-password"
                      class="form-control form-control-sm"
                      bind:value={confirmPassword}
                      placeholder="••••••••" />
                    <label class="form-label" for="confirm-password"
                      >{t('Confirm Password')} {user?.id ? '' : '*'}</label>
                  </div>
                </div>
              </div>
              {#if password && passwordStrength}
                <div class="mt-3 p-3 rounded bg-body-tertiary">
                  <div class="mb-2">
                    <small class="text-muted">{t('Password Strength')}:</small>
                    <span
                      class="badge ms-2 {passwordStrength.score <= 2
                        ? 'bg-danger'
                        : passwordStrength.score <= 4
                          ? 'bg-warning'
                          : 'bg-success'}">
                      {passwordStrength.strength}
                    </span>
                  </div>
                  <div class="progress" style="height: 5px;">
                    <div
                      class="progress-bar {passwordStrength.score <= 2
                        ? 'bg-danger'
                        : passwordStrength.score <= 4
                          ? 'bg-warning'
                          : 'bg-success'}"
                      style="width: {Math.min((passwordStrength.score / 6) * 100, 100)}%">
                    </div>
                  </div>
                  {#if passwordStrength.feedback.length > 0}
                    <div class="mt-2 small">
                      {#each passwordStrength.feedback as item}
                        <div class="text-muted">
                          <i class="bi bi-info-circle me-1"></i>{item}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
              <button type="button" class="btn btn-outline-secondary btn-sm mt-3" on:click={generatePassword}>
                <i class="bi bi-arrow-repeat me-2"></i>{t('Generate Password')}
              </button>
            </div>
            <div class="mb-4 d-none">
              <label class="form-label" for="status">{t('Status')}</label>
              <select id="status" class="form-select form-select-sm" bind:value={status}>
                <option value={1}>{t('Active')}</option>
                <option value={0}>{t('Inactive')}</option>
              </select>
            </div>
          </div>
          <div class="col-md-7">
            <div class="input-group mb-3">
              <select id="role-select" class="form-select" bind:value={role_id}>
                <option value="">{t('Select a role...')}</option>
                {#each userRoles as role}
                  {#if role.status === 1}
                    <option value={role.id}>{t(role.name)}</option>
                  {/if}
                {/each}
              </select>
              <button class="btn btn-primary" on:click={loadPermissions}>
                <i class="bi bi-arrow-clockwise me-2"></i>{t("Load Permissions")}
              </button>
            </div>
            <label class="form-label fw-bold mb-2">
              {t('Permissions')}
            </label>
            <div class="table-responsive">
              <table class="table table-sm table-striped align-middle">
                <thead class="table-light">
                  <tr>
                    <th>{t('Module')}</th>
                    <th class="text-center">{t('All')}</th>
                    <th class="text-center">{t('View')}</th>
                    <th class="text-center">{t('Create')}</th>
                    <th class="text-center">{t('Edit')}</th>
                    <th class="text-center">{t('Approve')}</th>
                    <th class="text-center">{t('Delete')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each parsedPermissions as permission}
                    <tr>
                      <td>
                        <strong>{t(permission.code)}</strong>
                      </td>
                      <td class="text-center">
                        <input
                          type="checkbox"
                          checked={permission.view &&
                            permission.create &&
                            permission.edit &&
                            permission.approve &&
                            permission.delete}
                          on:change={(e) => toggleAll(permission, e.target.checked)} />
                      </td>
                      <td class="text-center">
                        <input type="checkbox" bind:checked={permission.view} />
                      </td>
                      <td class="text-center">
                        <input type="checkbox" bind:checked={permission.create} />
                      </td>
                      <td class="text-center">
                        <input type="checkbox" bind:checked={permission.edit} />
                      </td>
                      <td class="text-center">
                        <input type="checkbox" bind:checked={permission.approve} />
                      </td>
                      <td class="text-center">
                        <input type="checkbox" bind:checked={permission.delete} />
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer border-0 pt-0">
        <button type="button" class="btn btn-outline-secondary" data-mdb-dismiss="modal"> {t('Cancel')} </button>
        <button type="button" class="btn btn-primary" on:click={saveUser}>
          <i class="bi bi-check-circle me-2"></i>{user?.id ? t('Update User') : t('Create User')}
        </button>
      </div>
    </div>
  </div>
</div>
<style>
  :global(.form-outline input:focus ~ label),
  :global(.form-outline textarea:focus ~ label) {
    color: #0d6efd;
  }
  :global(.position-relative) {
    position: relative;
  }
  :global(.btn-link) {
    text-decoration: none;
    color: #0d6efd;
  }
</style>
