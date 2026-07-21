<script>
  import { db, logActivity } from '../../db.js';
  import { onMount, onDestroy } from 'svelte';
  import Swal from 'sweetalert2';
  import { t, lang, translate_org_type, settings_all, setSettingsAll } from '../../i18n/i18n';
  import { toast } from '../../ToastUI/toast.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  $: _settings_all = $settings_all;

  let users = [];
  
	import TiptapEditor from '../../TiptapEditor.svelte';

  import { allOrgTypes, orgTypes, comming_soon } from '../../layouts/OrgTypes.js';
  const defaultSettings = [
    {
      category: 'Company Profile',
      type: 'string',
      key: 'company_name',
      value: 'default_company_name',
    },
    {
      category: 'Company Profile',
      type: 'stable_string',
      key: 'company_type',
      value: localStorage.getItem('org_type') || 'general',
    },
    {
      category: 'Company Profile',
      type: 'image',
      key: 'company_logo',
      value: '',
    },
    {
      category: 'Company Profile',
      type: 'email',
      key: 'company_email',
      value: '',
    },
    {
      category: 'Company Profile',
      type: 'phone',
      key: 'company_phone',
      value: '',
    },
    {
      category: 'Company Profile',
      type: 'phone',
      key: 'company_phone2',
      value: '',
    },
    {
      category: 'Company Profile',
      type: 'textarea',
      key: 'company_address',
      value: '',
    },
    {
      category: 'Company Profile',
      type: 'color',
      key: 'brand_primary_color',
      value: '#3B71CA',
    },
    {
      category: 'Company Profile',
      type: 'color',
      key: 'brand_secondary_color',
      value: '#54B4D3',
    },
    {
      category: 'Miscellaneous',
      type: 'boolean',
      key: 'enable_show_qr_code',
      value: 0,
    },
    {
      category: 'Miscellaneous',
      type: 'boolean',
      key: 'enable_a4_default_print_mode',
      value: 0,
    },
    {
      category: 'Sale',
      type: 'int',
      key: 'invoice_index',
      value: '1',
    },
    {
      category: 'Inventory Record',
      type: 'int',
      key: 'record_index',
      value: '1',
    },
    {
      category: 'Inventory Record',
      type: 'string',
      key: 'record_index_prefix',
      value: 'INR-',
    },
    {
      category: 'Sale',
      type: 'boolean',
      key: 'enable_due_date',
      value: '0',
    },
    {
      category: 'Sale',
      type: 'boolean',
      key: 'enable_smart_description',
      value: '0',
    },
    {
      category: 'Sale',
      type: 'boolean',
      key: 'enable_show_category_in_invoice',
      value: '0',
    },
    {
      category: 'Sale',
      type: 'boolean',
      key: 'enable_vertical_info',
      value: '1',
    },
    {
      category: 'Sale',
      type: 'string',
      key: 'invoice_index_prefix',
      value: 'INV-',
    },
    {
      category: 'Sale',
      type: 'string',
      key: 'pos_index_prefix',
      value: 'POS-',
    },
    {
      category: 'Manufacturing',
      type: 'int',
      key: 'production_index',
      value: '1',
    },
    {
      category: 'Manufacturing',
      type: 'string',
      key: 'production_index_prefix',
      value: 'PRD-',
    },
    {
      category: 'Stock Transfer',
      type: 'int',
      key: 'transfer_index',
      value: '1',
    },
    {
      category: 'Stock Transfer',
      type: 'string',
      key: 'transfer_index_prefix',
      value: 'STR-',
    },
    {
      category: 'Purchase',
      type: 'int',
      key: 'bill_index',
      value: '1',
    },
    {
      category: 'Purchase',
      type: 'string',
      key: 'bill_index_prefix',
      value: 'BILL-',
    },
    {
      category: 'Purchase',
      type: 'boolean',
      key: 'enable_purchase_bill_due_date',
      value: '0',
    },
    {
      category: 'Purchase',
      type: 'boolean',
      key: 'enable_purchase_items_discount',
      value: '0',
    },
    {
      category: 'Product',
      type: 'boolean',
      key: 'enable_heaviness',
      value: 0,
    },
    {
      category: 'Product',
      type: 'boolean',
      key: 'enable_duplicate_product',
      value: 0,
    },
    {
      category: 'Product',
      type: 'boolean',
      key: 'enable_batch',
      value: 0,
    },
    {
      category: 'Product',
      type: 'boolean',
      key: 'enable_require_buy_sell_price',
      value: 1,
    },
    {
      category: 'Product',
      type: 'boolean',
      key: 'enable_manufacturing_date',
      value: 0,
    },
    {
      category: 'Product',
      type: 'boolean',
      key: 'enable_product_benefit_percentage',
      value: 0,
    },
    {
      category: 'Product',
      type: 'int',
      key: 'default_product_benefit_percentage',
      value: 25,
    },
    {
      category: 'Sale',
      type: 'boolean',
      key: 'enable_full_table',
      value: 0,
    },
    {
      category: 'Sale',
      type: 'int',
      key: 'bill_max_items',
      value: 100,
    },
    {
      category: 'Sale',
      type: 'boolean',
      key: 'enable_bill_of_warehouse',
      value: 0,
    },

    {
      category: 'Sale',
      type: 'boolean',
      key: 'enable_show_buy_price',
      value: 0,
    },
    {
      category: 'Sale',
      type: 'html',
      key: 'default_sale_description',
      value: "",
    },
    {
      category: 'Sale',
      type: 'boolean',
      key: 'enable_show_latest_sale_price',
      value: 0,
    },
    {
      category: 'Sale',
      type: 'boolean',
      key: 'enable_show_buy_price_and_latest_sale_price_in_item',
      value: 0,
    },
    {
      category: 'Product',
      type: 'boolean',
      key: 'enable_expiry_date',
      value: 0,
    },
    {
      category: 'Product',
      type: 'boolean',
      key: 'enable_generics',
      value: 0,
    },
    {
      category: 'Product',
      type: 'boolean',
      key: 'enable_services',
      value: 0,
    },
    {
      category: 'Product',
      type: 'boolean',
      key: 'enable_brands',
      value: 0,
    },
    {
      category: 'Journal',
      type: 'boolean',
      key: 'enable_notrack',
      value: 1,
    },
    {
      category: 'Advanced Settings',
      type: 'boolean',
      key: 'enable_master_exchanges',
      value: 0,
    },
    {
      category: 'Accounts',
      type: 'boolean',
      key: 'enable_account_groups',
      value: 0,
    },
    {
      category: 'Patients',
      type: 'int',
      key: 'patient_index',
      value: 1,
    },
    {
      category: 'Patients',
      type: 'string',
      key: 'patient_index_prefix',
      value: "P",
    },
    {
      category: 'Product',
      type: 'boolean',
      key: 'enable_stock_minus',
      value: 0,
    },
    {
      category: 'Prescriptions',
      type: 'int',
      key: 'prescription_index',
      value: 1,
    },
    {
      category: 'Prescriptions',
      type: 'string',
      key: 'prescription_index_prefix',
      value: 'PRE-',
    },
    {
      category: 'Laboratory',
      type: 'user',
      key: 'main_technician',
      value: '',
    },
    {
      category: 'Laboratory',
      type: 'int',
      key: 'labtest_index',
      value: 1,
    },
    {
      category: 'Laboratory',
      type: 'string',
      key: 'labtest_index_prefix',
      value: "LT-",
    },
    {
      category: 'Messaging',
      type: 'textarea',
      key: 'patient_created_template',
      value: `سلام محترم *{{اسم مریض}}*،
حساب شما در سیستم *{{نام شرکت}}* با موفقیت ایجاد شد

از این پس تمام مسایل و گزارشات شما به صورت منظم ثبت و قابل پیگیری خواهد بود.
از اعتماد شما سپاس گذاریم.

کد مریض: {{کد مریض}}

در صورت نیاز به معلومات بیشتر، با ما در تماس شوید.

{{نام شرکت}}
{{ایمیل شرکت}}
{{شماره شرکت}} {{شماره۲ شرکت}}
{{آدرس شرکت}}

تشکر`,
    },
    {
      category: 'Messaging',
      type: 'textarea',
      key: 'account_created_template',
      value: `سلام محترم *{{اسم مشتری}}*،
حساب شما در سیستم *{{نام شرکت}}* با موفقیت ایجاد شد

از این پس تمام معاملات و گزارشات شما به صورت منظم ثبت و قابل پیگیری خواهد بود.
از اعتماد شما سپاس گذاریم.

شماره حساب شما: {{شماره حساب}}

در صورت نیاز به معلومات بیشتر، با ما در تماس شوید.

{{نام شرکت}}
{{ایمیل شرکت}}
{{شماره شرکت}} {{شماره۲ شرکت}}
{{آدرس شرکت}}

تشکر`,
    },
    {
      category: 'Messaging',
      type: 'textarea',
      key: 'journal_created_template',
      value: `*{{نام شرکت}}*
{{تاریخ}}

{{مرجع}}

شماره حساب: {{شماره حساب}}
نام حساب: *{{اسم حساب}}*

*{{مقدار پول}}*

بیلانس: *{{بیلانس}}*

{{حساب همتا}}

{{توضیحات}}`,
    },
    {
      category: 'Messaging',
      type: 'textarea',
      key: 'appointment_created_template',
      value: `*{{نام شرکت}}*
{{تاریخ}}

شماره نوبت: *{{شماره نوبت}}*

کد مریض: {{کد مریض}}
نام مریض: *{{اسم مریض}}*

*{{مقدار پول}}*

داکتر: {{داکتر}}
دیپارتمنت: {{دیپارتمنت}}

{{توضیحات}}`,
    },
    {
      category: 'Messaging',
      type: 'textarea',
      key: 'sale_created_template',
      value: `*{{نام شرکت}}*
{{تاریخ}}

شماره حساب مشتری: {{شماره حساب}}
نام مشتری: *{{اسم حساب}}*

شماره بل: {{شماره بل}}

{{محصولات}}

مجموع بل: *{{مجموع بل}}*
تخفیف: {{تخفیف}}
رسید بل: {{رسید بل}}

بیلانس قبلی: {{بیلانس قبلی}}
بیلانس فعلی: *{{بیلانس}}*

{{توضیحات}}`,
    },
  ];

  async function refreshSettings() {
    let allSettings = await db.settings.where('status').equals(1).toArray();
    setSettingsAll(allSettings); // 🔥 ONLY THIS
  }

  let settings = [];
  let loading = true;
  let settingModal;

  let shiftPressed = false;
  let ctrlPressed = false;

  function handleKeyDown(e) {
    if (e.key === 'Shift') shiftPressed = true;
    if (e.key === 'Control') ctrlPressed = true;
  }
  function handleKeyUp(e) {
    if (e.key === 'Shift') shiftPressed = false;
    if (e.key === 'Control') ctrlPressed = false;
  }

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  });
  // Form fields
  let category = '';
  let categoryOptions = [];
  let selectedCategory = 'Company Profile';
  let type = '';
  let key = '';
  let value = '';
  let description = '';
  let status = 1;
  $: visibleSettingsCount = settings.filter(
    (setting) => setting.category == null || selectedCategory === '' || setting.category === selectedCategory
  ).length;

  function getCategoryIcon(categoryName) {
    const icons = {
      'Company Profile': 'bi-building',
      Sale: 'bi-cart3',
      'Stock Transfer': 'bi-arrow-left-right',
      Purchase: 'bi-basket2',
      Product: 'bi-box',
      Journal: 'bi-book',
      Accounts: 'bi-file-earmark-text',
      Messaging: 'bi-send',
      'Inventory Record': 'bi-safe',
      Manufacturing: 'bi-diagram-3',
      Prescriptions: 'bi-capsule',
      Laboratory: 'bi-prescription2',
      Patients: 'bi-person-hearts',
      Miscellaneous: 'bi-three-dots',
    };

    return icons[categoryName] || 'bi-gear';
  }

  function getCategoryCount(categoryName) {
    return settings.filter((setting) => setting.category === categoryName).length;
  }

  // Track editing
  let editingId = null;

  async function manageDefaultSettings() {
    try {
      settings = await db.settings.where('status').equals(1).toArray();

      if (settings.length > 0) {
        for (const ds of defaultSettings) {
          let setting = settings.find((s) => s.key == ds.key);
          if (setting) {
            // console.log('setting found key:', setting.key);
            if (setting.category != ds.category) {
              console.log('wrong category for key:', setting.key);
              await db.settings.update(setting.id, {
                category: ds.category,
              });
              console.log('Updated category for key:', setting.key);
            }
            if (setting.type != ds.type) {
              console.log('wrong type for key:', setting.key);
              await db.settings.update(setting.id, {
                type: ds.type,
              });

              console.log('updated type for key:', setting.key);
            }

            if (
              setting.key == 'company_type' &&
              localStorage.getItem('org_type') &&
              setting.value != localStorage.getItem('org_type')
            ) {
              console.log('wrong value for company_type key:', setting.value);
              await db.settings.update(setting.id, {
                value: localStorage.getItem('org_type'),
              });
              console.log('updated value for company_type key:', localStorage.getItem('org_type'));
            }
          } else {
            console.log('setting Not Found! Key:', ds.key);
            let newId = await db.settings.add({
              category: ds.category,
              type: ds.type,
              key: ds.key,
              value: ds.value,
              description: ds.description || '',
              status: ds.status || 1,
            });
            console.log('added Setting! Key:', ds.key);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
    }
  }

  async function loadSettings() {
    // loading = true;
    try {
      settings = await db.settings.where('status').equals(1).toArray();
      const orgType = localStorage.getItem('org_type');

      if (orgType !== 'exchange') {
        settings = settings.filter((s) => s.key !== 'enable_master_exchanges');
      }

      if (orgType !== 'manufacturing') {
        settings = settings.filter((s) => s.category !== 'Manufacturing');
      }

      if (orgType !== 'hospital') {
        settings = settings.filter((s) => s.key !== 'patient_created_template');
        settings = settings.filter((s) => s.key !== 'appointment_created_template');
        settings = settings.filter((s) => s.category !== 'Prescriptions');
        settings = settings.filter((s) => s.category !== 'Laboratory');
      }

      if (orgType !== 'hospital' && orgType !== 'barbershop') {

        settings = settings.filter((s) => s.category !== 'Patients');
      

      }

      

      categoryOptions = [];
      settings.forEach((s) => {
        s.showValue = s.type == 'boolean' ? s.value == '1' : s.value;
        s.oldValue = s.value + '';

        s.enableEdit = false;
        if (s.category && !categoryOptions.includes(s.category)) {
          categoryOptions.push(s.category);
        }

        if (s.type == 'image') {
          s.imageBase64 = '';
        }
      });

      // sort the settings so that the company_type comes first
      settings.sort((a, b) => {
        if (a.key === 'company_type') return -1;
        if (b.key === 'company_type') return 1;
        return 0;
      });

      const categoryOrder = [
        'Company Profile', 'Sale', 'Stock Transfer', 'Purchase', 'Product',
        'Journal', 'Accounts', 'Inventory Record', 'Messaging', 'Miscellaneous'
      ];
      categoryOptions.sort((a, b) => {
        const aIndex = categoryOrder.indexOf(a);
        const bIndex = categoryOrder.indexOf(b);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      });
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    const modalEl = document.getElementById('createSettingModal');
    if (window.mdb) {
      settingModal = new window.mdb.Modal(modalEl);
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
    }
    await manageDefaultSettings();
    await loadSettings();

    users = await db.users.where('status').equals(1).toArray();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
  });

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

        const base64 = canvas.toDataURL('image/webp', 0.8);
        resolve(base64);
      };

      reader.readAsDataURL(file);
    });
  }
  async function handleImageSelect(event, key) {
    const setting = settings.find((s) => s.key === key);
    const file = event.target.files[0];
    if (!file) return;
    // if (modalImageUrl) URL.revokeObjectURL(modalImageUrl);

    setting.value = await convertToWebP(file, 800);
    await editSetting(setting, false);
    await saveSetting();
    await loadSettings();
  }
  function openSettingModal() {
    // Reset form for Add
    editingId = null;
    category = '';
    type = '';
    key = '';
    value = '';
    description = '';
    status = 1;
    settingModal.show();
  }

  // Open modal to edit existing setting
  async function editSetting(setting, showModal = true) {
    category = setting.category;
    type = setting.type;
    editingId = setting.id;
    key = setting.key;
    value = setting.value;
    description = setting.description;
    status = setting.status;
    if (showModal) {
      settingModal.show();
    }
  }

  async function saveSetting() {
    if (!key.trim()) {
      alert('Key is required.');
      return;
    }

    try {
      if (editingId) {
        // Update existing setting

        let oldSetting = await db.settings.get(editingId);

        await db.settings.update(editingId, {
          category,
          type,
          key: key.trim(),
          value,
          description,
          status: parseInt(status) || 1,
        });
        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'update',
          table_name: 'settings',
          entity_id: editingId,
          old_values:
            oldSetting.type == 'image'
              ? JSON.stringify({
                  category: oldSetting.category,
                  type: oldSetting.type,
                  key: oldSetting.key,
                  description: oldSetting.description,
                  status: oldSetting.status,
                })
              : JSON.stringify(oldSetting),
          new_values: JSON.stringify({
            category,
            type,
            key: key.trim(),
            value: type == 'image' ? '' : value,
            description,
            status: parseInt(status) || 1,
          }),
          description: `Updated setting ${key.trim()}`,
        });
      } else {
        // Add new setting
        let newId = await db.settings.add({
          category,
          type,
          key: key.trim(),
          value,
          description,
          status: parseInt(status) || 1,
        });

        await logActivity({
          user_id: parseInt(localStorage.getItem('user_id')) || 0,
          action: 'create',
          table_name: 'settings',
          entity_id: newId,
          old_values: null,
          new_values: JSON.stringify({
            category,
            type,
            key: key.trim(),
            value: type == 'image' ? '' : value,
            description,
            status: parseInt(status) || 1,
          }),
          description: `Created setting ${key.trim()}`,
        });
      }

      await loadSettings();
      toast.success(t('Success'),t(`Setting ${editingId ? 'updated' : 'created'} successfully.`));

      console.log('Saved setting:', { key, value, description, status });
      settingModal.hide();

      await refreshSettings();
    } catch (err) {
      console.error('Failed to save setting:', err);
      alert('Error saving setting: ' + err.message);
    }
  }

  async function deleteSetting(id) {
    if (confirm('Delete this setting?')) {
      let oldSetting = await db.settings.get(id);
      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'delete',
        table_name: 'settings',
        entity_id: id,
        old_values:
          oldSetting.type == 'image'
            ? JSON.stringify({
                category: oldSetting.category,
                type: oldSetting.type,
                key: oldSetting.key,
                description: oldSetting.description,
                status: oldSetting.status,
              })
            : JSON.stringify(oldSetting),
        new_values: null,
        description: `Deleted setting with ID ${id}`,
      });
      await db.settings.update(id, { status: 0 });
      await loadSettings();
      await refreshSettings();
    }
  }

  async function toggleEnable(key) {
    const setting = settings.find((s) => s.key === key);
    if (setting) {
      await db.settings.update(setting.id, {
        value: setting.value == 1 ? '0' : '1',
      });

      await logActivity({
        user_id: parseInt(localStorage.getItem('user_id')) || 0,
        action: 'update',
        table_name: 'settings',
        entity_id: setting.id,
        old_values: JSON.stringify(setting),
        new_values: JSON.stringify({ value: setting.value == 1 ? '0' : '1' }),
        description: `Updated setting ${key.trim()}`,
      });
      await loadSettings();

      await refreshSettings();
    } else {
      alert('Setting not found');
    }
  }

  async function saveCompanyProfile(categoryName = 'Company Profile') {
    const profileSettings = settings.filter((setting) => setting.category === categoryName);
    try {
      await Promise.all(
        profileSettings.map((setting) => db.settings.update(setting.id, { value: setting.value }))
      );
      await refreshSettings();
      toast.success(t('Success'), t('Settings saved successfully.'));
    } catch (err) {
      console.error('Failed to save company profile:', err);
      toast.error(t('Error'), t('Failed to save settings.'));
    }
  }
</script>

<div class="main-settings-page">
  <div class="settings-dev-actions {shiftPressed && ctrlPressed ? '' : 'd-none'}">
    <button type="button" class="btn btn-primary" on:click={openSettingModal}>
      <i class="bi bi-plus-circle"></i>
      {t('Create Setting')}
    </button>

    <button
      type="button"
      class="btn btn-outline-primary {selectedCategory === '' ? 'active' : ''}"
      on:click={() => (selectedCategory = '')}>
      <i class="bi bi-list"></i>
      {t('All Settings')}
    </button>
  </div>

  {#if loading}
    <div class="settings-loading">
      <div class="spinner-border text-primary" role="status"></div>
    </div>
  {:else}
    <div class="settings-shell {shiftPressed && ctrlPressed ? 'settings-shell--full' : ''}">
      {#if !(shiftPressed && ctrlPressed)}
        <aside class="settings-tabs-panel" aria-label={t('Settings')}>
          <div class="settings-tabs-list">
          {#each categoryOptions as catop}
            <button
              type="button"
              class="settings-tab {selectedCategory === catop ? 'settings-tab--active' : ''}"
              on:click={() => (selectedCategory = catop)}>
              <span class="settings-tab-icon">
                <i class="bi {getCategoryIcon(catop)}"></i>
              </span>
              <span class="settings-tab-label">{t(catop)}</span>
            </button>
          {/each}
          </div>
        </aside>
      {/if}

      <section class="settings-content-card">
        {#if selectedCategory === 'Company Profile' && !(shiftPressed && ctrlPressed)}
          <div class="company-profile-form">
            <div class="company-profile-body">
              <div class="company-logo-column">
                {#each settings.filter((item) => item.key === 'company_logo') as logoSetting}
                  <input id="company-logo-upload" type="file" accept="image/png,image/jpeg,image/svg+xml" hidden
                    on:change={(event) => handleImageSelect(event, logoSetting.key)} />
                  <label class="company-logo-preview" for="company-logo-upload">
                    {#if logoSetting.value}
                      <img src={logoSetting.value} alt={t('Company Logo')} />
                    {:else}
                      <i class="bi bi-buildings"></i>
                    {/if}
                    <span>{t('Company Logo')}</span>
                  </label>
                {/each}
              </div>

              <div class="company-fields" dir={_lang === 'en' ? 'ltr' : 'rtl'}>
                {#each settings.filter((item) => item.category === 'Company Profile' && item.key !== 'company_logo') as setting}
                  <div class="company-field-row company-field-row--{setting.type}">
                    <label for={'profile-' + setting.key}>{_lang === 'en' ? setting.key.split('_').join(' ').replace(/\b\w/g, (l) => l.toUpperCase()) : t(setting.key)}</label>
                    <div class="company-control">
                      {#if setting.key === 'company_type'}
                        <select id={'profile-' + setting.key} bind:value={setting.value}>
                          {#each allOrgTypes as org}
                            <option value={org.id}>{_lang === 'en' ? org.name_en : org.name}</option>
                          {/each}
                        </select>
                        <span class="status-dot"></span>
                      {:else if setting.type === 'textarea'}
                        <textarea id={'profile-' + setting.key} rows="2" bind:value={setting.value} placeholder={t('Enter company address...')}></textarea>
                      {:else if setting.type === 'color'}
                        <div class="brand-color-control">
                          <div class="color-picker-bar">
                            <input id={'profile-' + setting.key} class="color-strip" type="color" bind:value={setting.value} />
                            <button type="button" class="eyedropper-button" aria-label={t('Select Color')} on:click={() => document.getElementById('profile-' + setting.key)?.click()}><i class="bi bi-eyedropper"></i></button>
                          </div>
                          <span class="color-swatch" style={'background:' + setting.value}></span>
                          <span class="color-value">{setting.value}</span>
                        </div>
                      {:else}
                        <input id={'profile-' + setting.key} type={setting.type === 'email' ? 'email' : 'text'} bind:value={setting.value}
                          placeholder={setting.type === 'email' ? 'example@company.com' : setting.key === 'company_phone2' ? '091.02123456' : ''} />
                      {/if}
                    </div>
                  </div>
                  {#if setting.key === 'company_phone2'}
                    <div class="company-upload-row">
                      <span class="upload-label">{t('Logo')}</span>
                      <label class="logo-dropzone" for="company-logo-upload">
                        <i class="bi bi-cloud-arrow-up"></i>
                        <strong>{t('Click to select a file')}</strong>
                        <small>{t('Example')}: SVG - 2MB - PNG / JPG</small>
                      </label>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
            <div class="company-actions">
              <button type="button" class="save-profile-button" on:click={saveCompanyProfile}><i class="bi bi-floppy"></i>{t('Save Settings')}</button>
              <button type="button" class="cancel-profile-button" on:click={loadSettings}>{t('Cancel')}</button>
            </div>
          </div>
        {:else if (selectedCategory === 'Sale' || selectedCategory === 'Stock Transfer' || selectedCategory === 'Purchase' || selectedCategory === 'Product' || selectedCategory === 'Journal' || selectedCategory === 'Accounts' || selectedCategory === 'Inventory Record' || selectedCategory === 'Messaging' || selectedCategory === 'Miscellaneous') && !(shiftPressed && ctrlPressed)}
          <div class="category-profile-form" dir={_lang === 'en' ? 'ltr' : 'rtl'}>
            <div class="category-profile-body">
              {#each settings.filter((item) => item.category === selectedCategory) as setting}
                <div class="category-field-row">
                  <label for={'category-' + setting.key}>{_lang === 'en' ? setting.key.split('_').join(' ').replace(/\b\w/g, (l) => l.toUpperCase()) : t(setting.key)}</label>
                  <div class="category-control">
                    {#if setting.type === 'boolean'}
                      <div class="category-switch-control">
                        <span class:enabled={setting.showValue}>{setting.showValue ? t('Active') : t('Inactive')}</span>
                        <div class="form-check form-switch custom-switch m-0">
                          <input id={'category-' + setting.key} class="form-check-input" type="checkbox" role="switch"
                            bind:checked={setting.showValue} on:click={() => toggleEnable(setting.key)} />
                        </div>
                      </div>
                    {:else if setting.type === 'html' || setting.type === 'textarea'}
                      <textarea id={'category-' + setting.key} rows="3" bind:value={setting.value}></textarea>
                    {:else}
                      <input id={'category-' + setting.key} type={setting.type === 'int' ? 'number' : 'text'} bind:value={setting.value} />
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
            <div class="company-actions">
              <button type="button" class="save-profile-button" on:click={() => saveCompanyProfile(selectedCategory)}><i class="bi bi-floppy"></i>{t('Save Settings')}</button>
              <button type="button" class="cancel-profile-button" on:click={loadSettings}>{t('Cancel')}</button>
            </div>
          </div>
        {:else}
        <div class="settings-content-head">
          <div>
            <p>{t('Main Settings')}</p>
            <h2>{selectedCategory === '' ? t('All Settings') : t(selectedCategory)}</h2>
          </div>
          <span>{visibleSettingsCount}</span>
        </div>

        <div class="settings-table-wrap table-responsive">
              <table class="table table-hover table-sm mb-0 settings-table">
                <thead>
                  <tr>
                    <th>{t('Key')}</th>
                    <th>{t('Value')}</th>
                    {#if shiftPressed && ctrlPressed}
                      <th>{t('Category')}</th>
                      <th>{t('Type')}</th>
                      <th>{t('Actions')}</th>
                    {/if}
                  </tr>
                </thead>
                <tbody>
                  {#each settings as setting}
                    {#if setting.category == null || selectedCategory === '' || setting.category === selectedCategory}
                      <tr>
                        <td>{_lang=='en' ? setting.key.split('_').join(' ').replace(/\b\w/g, l => l.toUpperCase()) : t(setting.key)}</td>
                        <td
                          ><strong>
                            {#if setting.type && setting.type == 'stable_string'}
                              {#if setting.key == 'company_type'}
                                <span class="badge badge-success"
                                  >{t('Lang') == 'fa' || t('Lang') == 'ps'
                                    ? allOrgTypes.find((t) => t.id === setting.value)?.name ||
                                      t(setting.value)
                                    : allOrgTypes.find((t) => t.id === setting.value)?.name_en ||
                                      t(setting.value)}</span>
                              {:else}
                                <span class="badge badge-success">{t(setting.value)}</span>
                              {/if}
                            {:else if setting.type && setting.type == 'image'}
                              <input
                                id={'image' + setting.id}
                                type="file"
                                accept="image/*"
                                on:change={async (event) => {
                                  await handleImageSelect(event, setting.key);
                                }}
                                style="display:none" />

                              <label for={'image' + setting.id} class="btn btn-success btn-sm px-3 pt-1">
                                <i class="bi bi-image"></i>
                                {t('Select Image')}
                              </label>

                              {#if setting.value && typeof setting.value == 'string' && setting.value.startsWith('data:image/webp')}
                                <img
                                  src={setting.value}
                                  alt=""
                                  class="m-2 shadow-sm float-start"
                                  style="max-width:140px;height:auto;object-fit: cover; border: 2px solid white;border-radius:10px" />

                                <button
                                  class="btn btn-danger btn-sm px-3 pt-1"
                                  on:mousedown={async (e) => {
                                    e.preventDefault();
                                    toast.confirm(t('Are you sure?'), t("You won't be able to revert this!")).then(async (result) => {
                                      if (result) {
                                        setting.value = '';
                                        await editSetting(setting, false);
                                        await saveSetting();
                                      }
                                    });
                                  }}>
                                  <i class="bi bi-trash"></i>
                                  {t('Delete')}
                                </button>
                              {/if}
                            {:else if setting.type && setting.type == 'boolean'}
                              <span class="float-end">
                                <small class={setting.showValue ? 'text-success' : 'text-secondary'}>
                                  {setting.showValue ? t('Active') : t('Inactive')}
                                </small>
                              </span>
                              <div class="form-check form-switch custom-switch small-switch m-0">
                                <input
                                  class="form-check-input"
                                  type="checkbox"
                                  role="switch"
                                  bind:checked={setting.showValue}
                                  on:click={() => toggleEnable(setting.key)} />
                              </div>
                            {:else if setting.type && setting.type == 'textarea'}
                              <div class="input-group input-group-sm">
                                <textarea
                                  class="form-control form-control-sm"
                                  style="height: auto;"
                                  rows={3}
                                  bind:value={setting.value}
                                  on:focus={(e) => (setting.enableEdit = true)}
                                  readonly={!setting.enableEdit}></textarea>
                                {#if setting.enableEdit}
                                  <button
                                    class="btn btn-success btn-sm px-3 pt-1"
                                    on:mousedown={async (e) => {
                                      e.preventDefault();
                                      await editSetting(setting, false);
                                      await saveSetting();
                                      setting.enableEdit = false;
                                    }}>
                                    <i class="bi bi-check"></i>
                                  </button>

                                  <button
                                    class="btn btn-danger btn-sm px-3 pt-1"
                                    on:mousedown={async (e) => {
                                      e.preventDefault();
                                      setting.value = setting.oldValue;
                                      setting.enableEdit = false;
                                    }}>
                                    <i class="bi bi-x-lg"></i>
                                  </button>
                                {/if}
                              </div>
                            {:else if setting.type && setting.type == 'color'}
                            <div class="input-group input-group-sm">
                                <input
                                  class="form-control form-control-sm"
                                  type="color"
                                  bind:value={setting.value}
                                  on:input={
                                    async (e) => {
                                      await editSetting(setting, false);
                                      await saveSetting();
                                      setting.enableEdit = false;
                                    }
                                  }
                                  readonly={!setting.enableEdit} />
                                {#if setting.enableEdit}
                                  <button
                                    class="btn btn-success btn-sm px-3 pt-1"
                                    on:mousedown={async (e) => {
                                      e.preventDefault();
                                      await editSetting(setting, false);
                                      await saveSetting();
                                      setting.enableEdit = false;
                                    }}>
                                    <i class="bi bi-check"></i>
                                  </button>

                                  <button
                                    class="btn btn-danger btn-sm px-3 pt-1"
                                    on:mousedown={async (e) => {
                                      e.preventDefault();
                                      setting.value = setting.oldValue;
                                      setting.enableEdit = false;
                                    }}>
                                    <i class="bi bi-x-lg"></i>
                                  </button>
                                {/if}
                              </div>
                                {:else if setting.type && setting.type == 'html'}


                                
                                {#if setting.enableEdit}
                                
                                  <TiptapEditor bind:value={setting.value} />
                                  <button
                                    class="btn btn-success btn-sm px-3 pt-1"
                                    on:mousedown={async (e) => {
                                      e.preventDefault();
                                      await editSetting(setting, false);
                                      await saveSetting();
                                      setting.enableEdit = false;
                                    }}>
                                    <i class="bi bi-check"></i>
                                  </button>

                                  <button
                                    class="btn btn-danger btn-sm px-3 pt-1"
                                    on:mousedown={async (e) => {
                                      e.preventDefault();
                                      setting.value = setting.oldValue;
                                      setting.enableEdit = false;
                                    }}>
                                    <i class="bi bi-x-lg"></i>
                                  </button>

                                  {:else}
                                  
                                  <button
                                    class="btn btn-warning btn-sm px-3 pt-1"
                                    on:mousedown={async (e) => {
                                      e.preventDefault();
                                      setting.oldValue = setting.value;
                                      setting.enableEdit = true;
                                    }}>
                                    <i class="bi bi-pencil"></i>
                                  </button>

                                {/if}
                              {:else if setting.type && setting.type == 'user'}
                              <div class="input-group input-group-sm">
                                <select
                                  class="form-select form-select-sm"
                                  bind:value={setting.value}
                                  on:change={async (e) => {
                                    await editSetting(setting, false);
                                    await saveSetting();
                                  }}
                                  >
                                  <option value="">{t('Select User')}</option>
                                  {#each users as user}
                                    <option value={user.id}>{user.first_name} {user.last_name} ({user.username})</option>
                                  {/each}
                                </select>
                              </div>
                              
                              
                            {:else}
                              <div class="input-group input-group-sm">
                                <input
                                  class="form-control form-control-sm"
                                  type="text"
                                  bind:value={setting.value}
                                  on:focus={(e) => (setting.enableEdit = true)}
                                  readonly={!setting.enableEdit} />
                                {#if setting.enableEdit}
                                  <button
                                    class="btn btn-success btn-sm px-3 pt-1"
                                    on:mousedown={async (e) => {
                                      e.preventDefault();
                                      await editSetting(setting, false);
                                      await saveSetting();
                                      setting.enableEdit = false;
                                    }}>
                                    <i class="bi bi-check"></i>
                                  </button>

                                  <button
                                    class="btn btn-danger btn-sm px-3 pt-1"
                                    on:mousedown={async (e) => {
                                      e.preventDefault();
                                      setting.value = setting.oldValue;
                                      setting.enableEdit = false;
                                    }}>
                                    <i class="bi bi-x-lg"></i>
                                  </button>
                                {/if}
                              </div>
                            {/if}
                          </strong>
                        </td>
                        {#if shiftPressed && ctrlPressed}
                          <td>
                            {t(setting.category)}
                          </td>
                          <td>
                            {t(setting.type)}
                          </td>
                          <td>
                            <button
                              class="btn btn-sm btn-outline-secondary me-1"
                              on:click={() => editSetting(setting, true)}>
                              <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" on:click={() => deleteSetting(setting.id)}>
                              <i class="bi bi-trash"></i>
                            </button>
                          </td>
                        {/if}
                      </tr>
                    {/if}
                  {/each}
                  {#if settings.length === 0}
                    <tr>
                      <td colspan="8" class="text-center text-muted p-4">No settings found.</td>
                    </tr>
                  {/if}
                </tbody>
              </table>
        </div>
        {/if}
      </section>
    </div>
  {/if}
  <div class="modal fade" id="createSettingModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-gear"></i>
            {editingId ? t('Update Setting') : t('Create Setting')}
          </h5>
          <button type="button" class="btn-close" data-mdb-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="row">
            <div class="col-md-6 mb-4">
              <div class="form-outline" data-mdb-input-init>
                <input type="text" id="c-cat" class="form-control" bind:value={category} />
                <label class="form-label" for="c-cat">{t('Category')}</label>
              </div>
            </div>
            <div class="col-md-6 mb-4">
              <div class="form-outline" data-mdb-input-init>
                <input type="text" id="c-type" class="form-control" bind:value={type} />
                <label class="form-label" for="c-type">{t('Type')}</label>
              </div>
            </div>
            <div class="col-md-6 mb-4">
              <div class="form-outline" data-mdb-input-init>
                <input type="text" id="c-key" class="form-control" bind:value={key} />
                <label class="form-label" for="c-key">{t('Key')}</label>
              </div>
            </div>
            <div class="col-md-6 mb-4">
              <div class="form-outline" data-mdb-input-init>
                <input type="text" id="c-value" class="form-control" bind:value />
                <label class="form-label" for="c-value">{t('Value')}</label>
              </div>
            </div>
            <div class="col-md-12 mb-4">
              <div class="form-outline" data-mdb-input-init>
                <textarea id="c-description" class="form-control" bind:value={description}></textarea>
                <label class="form-label" for="c-description">{t('Description')}</label>
              </div>
            </div>
            <div class="col-md-6 mb-4 d-none">
              <div class="form-outline" data-mdb-input-init>
                <input type="number" step="0.01" id="c-status" class="form-control" bind:value={status} />
                <label class="form-label" for="c-status">{t('Status')}</label>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-link text-dark" data-mdb-dismiss="modal">{t('Close')}</button>
          <button type="button" class="btn btn-primary" on:click={saveSetting}>
            {editingId ? t('Update Setting') : t('Save Setting')}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .main-settings-page {
    width: 100%;
  }

  .settings-dev-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .settings-loading {
    display: grid;
    min-height: 260px;
    place-items: center;
    border: 1px solid var(--erp-border);
    border-radius: 20px;
    background: var(--erp-surface);
  }

  .settings-shell {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 0.65rem;
    align-items: stretch;
  }

  .settings-shell--full {
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-tabs-panel,
  .settings-content-card {
    border: 1px solid #dfe5ed;
    border-radius: 10px;
    background-color: var(--erp-bg);
    box-shadow: 0 4px 16px rgba(30, 48, 76, 0.1);
  }

  .settings-tabs-panel {
    position: sticky;
    top: 1rem;
    align-self: stretch;
    height: 100%;
    min-height: 470px;
    padding: 7px;
    background-color: var(--erp-bg);
  }

  .settings-tabs-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.35rem 0.45rem 0.75rem;
    color: var(--erp-text);
  }

  .settings-tabs-heading span {
    font-size: 0.82rem;
    font-weight: 850;
  }

  .settings-tabs-heading small {
    display: inline-grid;
    min-width: 26px;
    height: 24px;
    place-items: center;
    border: 1px solid var(--erp-border);
    border-radius: 999px;
    background: #f8fafc;
    color: var(--erp-text-soft);
    font-size: 0.72rem;
    font-weight: 850;
  }

  .settings-tabs-list {
    display: grid;
    gap: 2px;
  }

  .settings-tab {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    width: 100%;
    min-height: 43px;
    gap: 8px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: #4d586c;
    padding: 6px 9px;
    text-align: start;
    font-size: 0.82rem;
    font-weight: 650;
    transition:
      background 0.16s ease,
      border-color 0.16s ease,
      color 0.16s ease,
      transform 0.16s ease;
  }

  .settings-tab:hover {
    border-color: transparent;
    background: #f6f8fc;
    color: #2f6fed;
    transform: none;
  }

  .settings-tab--active {
    border-color: transparent;
    background: linear-gradient(90deg, #f0f5ff 0%, #eaf1ff 100%);
    color: var(--erp-primary);
    box-shadow: 0 2px 5px rgba(38, 50, 68, 0.08);
  }

  .settings-tab-icon {
    display: inline-grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border-radius: 0;
    background: transparent;
    color: #566176;
    font-size: 1rem;
  }

  .settings-tab--active .settings-tab-icon {
    background: transparent;
    color: var(--erp-primary);
  }

  .settings-tab-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-tab-count {
    display: inline-grid;
    min-width: 24px;
    height: 24px;
    place-items: center;
    border: 1px solid var(--erp-border);
    border-radius: 999px;
    background: #fff;
    color: #64748b;
    font-size: 0.71rem;
    font-weight: 850;
  }

  .settings-tab--active .settings-tab-count {
    border-color: #d7e5ff;
    color: var(--erp-primary);
  }

  .settings-content-card {
    min-width: 0;
    overflow: hidden;
    min-height: 470px;
  }

  .company-profile-form {
    display: flex;
    min-height: 470px;
    flex-direction: column;
    background-color: var(--erp-bg);
  }

  .category-profile-form {
    display: flex;
    min-height: 470px;
    flex-direction: column;
    background-color: var(--erp-bg);
  }

  .category-profile-body { padding: 14px 20px 12px; }
  .category-field-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 260px;
    align-items: center;
    gap: 12px;
    padding-block: 5px;
    border-bottom: 1px solid #e8edf3;
  }
  :global([dir='rtl']) .category-field-row { grid-template-columns: 260px minmax(0, 1fr); }
  :global([dir='rtl']) .category-field-row > label { grid-column: 1; grid-row: 1; }
  :global([dir='rtl']) .category-field-row > .category-control { grid-column: 2; grid-row: 1; }
  .category-field-row > label { color: #344155; font-size: .82rem; font-weight: 800; }
  .category-control { min-width: 0; }
  .category-control > input,
  .category-control > textarea {
    width: 100%;
    min-height: 36px;
    padding: 6px 10px;
    border: 1px solid #d7dee8;
    border-radius: 9px;
    outline: 0;
    background: #fff;
    color: #455167;
    font-family: inherit;
    font-size: .82rem;
  }
  .category-control > textarea { min-height: 60px; resize: vertical; }
  .category-control > input:focus,
  .category-control > textarea:focus { border-color: #73a1f8; box-shadow: 0 0 0 3px rgba(47,111,237,.08); }
  .category-switch-control { display: flex; min-height: 36px; align-items: center; justify-content: space-between; padding: 0 8px; }
  .category-switch-control > span { color: #94a3b8; font-size: .76rem; font-weight: 750; }
  .category-switch-control > span.enabled { color: #16a34a; }

  .company-profile-body {
    display: grid;
    grid-template-columns: 195px minmax(0, 1fr);
    gap: 14px;
    padding: 16px 20px 18px;
  }

  :global([dir='rtl']) .company-profile-body {
    grid-template-columns: minmax(0, 1fr) 195px;
  }

  :global([dir='rtl']) .company-logo-column { grid-column: 2; }
  :global([dir='rtl']) .company-fields { grid-column: 1; grid-row: 1; }

  .company-logo-preview {
    display: flex;
    width: 100%;
    height: 185px;
    padding: 8px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 6px;
    border: 1px solid #d8dee8;
    border-radius: 8px;
    background: #fff;
    color: #8b96a8;
    cursor: pointer;
    transition: border-color .2s ease, box-shadow .2s ease;
  }

  .company-logo-preview:hover { border-color: #8eb4ff; box-shadow: 0 8px 24px rgba(47,111,237,.08); }
  .company-logo-preview i { color: #2f6fed; font-size: 4rem; line-height: 1; filter: drop-shadow(6px 5px 2px rgba(47,111,237,.12)); }
  .company-logo-preview img { display: block; width: 100%; height: 145px; object-fit: contain; border-radius: 5px; }
  .company-logo-preview span { font-size: .72rem; font-weight: 700; }

  .company-fields { min-width: 0; }
  .company-field-row,
  .company-upload-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 180px;
    gap: 12px;
    align-items: center;
    min-height: 36px;
    padding-block: 5px;
    border-bottom: 1px solid #e8edf3;
  }

  :global([dir='rtl']) .company-field-row,
  :global([dir='rtl']) .company-upload-row { grid-template-columns: 180px minmax(0, 1fr); }
  :global([dir='rtl']) .company-field-row > label,
  :global([dir='rtl']) .company-upload-row > .upload-label { grid-column: 1; grid-row: 1; }
  :global([dir='rtl']) .company-field-row > .company-control,
  :global([dir='rtl']) .company-upload-row > .logo-dropzone { grid-column: 2; grid-row: 1; }

  :global([dir='ltr']) .company-field-row,
  :global([dir='ltr']) .company-upload-row { grid-template-columns: 180px minmax(0, 1fr); }
  .company-field-row > label, .upload-label { color: #3f4b60; font-size: .76rem; font-weight: 800; }
  .company-control { position: relative; min-width: 0; }
  .company-control > input:not([type='color']),
  .company-control > select,
  .company-control > textarea {
    width: 100%;
    min-height: 36px;
    padding: 6px 10px;
    border: 1px solid #d7dee8;
    border-radius: 9px;
    outline: 0;
    background: #fff;
    color: #455167;
    font-family: inherit;
    font-size: .82rem;
    transition: border-color .2s, box-shadow .2s;
  }
  .company-control > textarea { min-height: 50px; resize: vertical; }
  .company-control > input:focus, .company-control > select:focus, .company-control > textarea:focus { border-color: #73a1f8; box-shadow: 0 0 0 3px rgba(47,111,237,.08); }
  .status-dot { position: absolute; top: 50%; inset-inline-end: 10px; width: 10px; height: 10px; border-radius: 50%; background: #58b88d; transform: translateY(-50%); pointer-events: none; }
  .company-control select { appearance: auto; padding-inline-end: 34px; }
  .company-upload-row { min-height: 66px; padding-block: 7px; }
  .logo-dropzone {
    display: flex;
    min-height: 66px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    border: 1.5px dashed #bcc8d9;
    border-radius: 7px;
    color: #657188;
    cursor: pointer;
  }
  .logo-dropzone i { color: #2f6fed; font-size: 1.35rem; }
  .logo-dropzone strong { font-size: .68rem; }
  .logo-dropzone small { color: #a0a9b9; font-size: .62rem; }
  .logo-row-controls {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: stretch;
    gap: 12px;
    flex-wrap: nowrap;
    direction: ltr;
  }
  .logo-row-controls .logo-dropzone { min-width: 0; min-height: 104px; flex: 1; }
  .logo-row-preview {
    display: flex;
    width: 112px;
    height: 104px;
    flex: 0 0 112px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
    justify-self: start;
    border: 1px solid #76a2ff;
    border-radius: 8px;
    background: #fff;
    color: #758197;
    cursor: pointer;
    transition: border-color .2s ease, box-shadow .2s ease;
  }
  .logo-row-preview:hover { border-color: #2f6fed; box-shadow: 0 5px 14px rgba(47, 111, 237, .12); }
  .logo-row-preview img { width: 78px; height: 54px; object-fit: contain; }
  .logo-row-preview i { color: #2f6fed; font-size: 2.7rem; line-height: 1; }
  .logo-row-preview strong { font-size: .7rem; font-weight: 800; }
  .company-field-row--color { min-height: 34px; padding-block: 5px; }
  .brand-color-control { display: grid; grid-template-columns: minmax(0,1fr) 22px 66px; gap: 14px; align-items: center; direction: ltr; }
  .color-picker-bar { display: grid; grid-template-columns: minmax(0, 1fr) 35px; height: 29px; overflow: hidden; border: 1px solid #d7dee8; border-radius: 5px; background: #fff; }
  .color-strip { width: 100%; height: 100%; padding: 3px; border: 0; border-inline-end: 1px solid #d7dee8; border-radius: 0; background: #fff; cursor: pointer; }
  .color-strip::-webkit-color-swatch-wrapper { padding: 0; }
  .color-strip::-webkit-color-swatch { border: 0; border-radius: 1px; }
  .color-strip::-moz-color-swatch { border: 0; border-radius: 1px; }
  .eyedropper-button { height: 100%; padding: 0; border: 0; background: #fff; color: #536177; font-size: .72rem; }
  .eyedropper-button:hover { background: #f4f7fb; color: #2f6fed; }
  .color-swatch { width: 20px; height: 20px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(15, 23, 42, .05); }
  .color-value { direction: ltr; color: #657188; font-size: .68rem; text-align: start; }
  .company-actions { display: flex; gap: 10px; margin-top: auto; padding: 11px 20px; border-top: 1px solid #e7ecf2; }
  .company-actions button { min-height: 31px; border-radius: 6px; padding: 0 15px; font-family: inherit; font-size: .7rem; font-weight: 800; }
  .save-profile-button { display: inline-flex; gap: 10px; align-items: center; border: 0; background: #2f6fed; color: #fff; box-shadow: 0 6px 14px rgba(47,111,237,.2); }
  .cancel-profile-button { border: 1px solid #d8dee8; background: #fff; color: #667085; }

  .settings-content-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.1rem;
    border-bottom: 1px solid var(--erp-border);
    background: linear-gradient(180deg, #fff 0%, #fbfdff 100%);
  }

  .settings-content-head p {
    margin: 0 0 0.25rem;
    color: var(--erp-muted);
    font-size: 0.72rem;
    font-weight: 850;
  }

  .settings-content-head h2 {
    margin: 0;
    color: var(--erp-text);
    font-size: 1.05rem;
    font-weight: 900;
    letter-spacing: -0.015em;
  }

  .settings-content-head > span {
    display: inline-grid;
    min-width: 42px;
    height: 34px;
    place-items: center;
    border: 1px solid #d7e5ff;
    border-radius: 999px;
    background: var(--erp-primary-soft);
    color: var(--erp-primary);
    font-size: 0.82rem;
    font-weight: 900;
  }

  .settings-table-wrap {
    overflow: auto;
  }

  .settings-table {
    min-width: 680px;
  }

  .settings-table > thead > tr > th {
    padding: 0.82rem 1rem;
    background: #f8fafc;
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 900;
    white-space: nowrap;
  }

  .settings-table > tbody > tr > td {
    padding: 0.82rem 1rem;
    border-color: #edf1f6;
    vertical-align: middle;
  }

  .settings-table > tbody > tr:hover > * {
    --mdb-table-accent-bg: #f6f9ff;
  }

  .settings-table > tbody > tr > td:first-child {
    width: 38%;
    color: #334155;
    font-weight: 850;
  }

  .settings-table > tbody > tr > td:nth-child(2) {
    color: #172033;
  }

  .settings-table strong {
    font-weight: 700;
  }

  .settings-table .input-group {
    max-width: 560px;
  }

  .settings-table .form-control,
  .settings-table .form-select {
    border-radius: 10px;
  }

  .settings-table .input-group > .btn {
    min-width: 38px;
  }

  .settings-table .badge,
  .settings-table :global(.badge) {
    border-radius: 999px;
    padding: 0.4rem 0.65rem;
    font-weight: 850;
  }

  .small-switch .form-check-input {
    transform: scale(0.75);
  }

  .custom-switch .form-check-input:checked {
    background-color: var(--erp-primary) !important;
    border-color: var(--erp-primary) !important;
  }

  .custom-switch .form-check-input:checked::after {
    background-color: #fff !important;
  }

  @media (max-width: 991px) {
    .settings-shell {
      grid-template-columns: 1fr;
    }

    .settings-tabs-panel {
      position: static;
    }

    .settings-tabs-list {
      display: flex;
      gap: 0.5rem;
      overflow-x: auto;
      padding-bottom: 0.15rem;
      scrollbar-width: thin;
    }

    .settings-tab {
      min-width: 190px;
    }

    .company-profile-body, :global([dir='rtl']) .company-profile-body { grid-template-columns: 1fr; }
    :global([dir='rtl']) .company-logo-column, :global([dir='rtl']) .company-fields { grid-column: 1; grid-row: auto; }
    .company-logo-preview { width: 215px; margin-inline: auto; }
  }

  @media (max-width: 575px) {
    .settings-content-head {
      align-items: flex-start;
      flex-direction: column;
    }

    .settings-table {
      min-width: 580px;
    }

    .company-profile-body { padding: 20px 16px; }
    .company-field-row, .company-upload-row, :global([dir='ltr']) .company-field-row, :global([dir='ltr']) .company-upload-row { grid-template-columns: 1fr; gap: 7px; padding: 12px 0; }
    :global([dir='rtl']) .company-field-row,
    :global([dir='rtl']) .company-upload-row { grid-template-columns: 1fr; }
    :global([dir='rtl']) .company-field-row > label,
    :global([dir='rtl']) .company-field-row > .company-control,
    :global([dir='rtl']) .company-upload-row > .upload-label,
    :global([dir='rtl']) .company-upload-row > .logo-dropzone { grid-column: 1; grid-row: auto; }
    .brand-color-control { grid-template-columns: minmax(0,1fr) 22px 66px; gap: 8px; }
    .company-actions { padding: 14px 16px; }
    .category-profile-body { padding: 16px; }
    .category-field-row,
    :global([dir='rtl']) .category-field-row { grid-template-columns: 1fr; gap: 7px; }
    :global([dir='rtl']) .category-field-row > label,
    :global([dir='rtl']) .category-field-row > .category-control { grid-column: 1; grid-row: auto; }
  }
</style>
