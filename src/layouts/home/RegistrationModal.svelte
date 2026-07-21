<script>
  import { onMount, tick } from 'svelte';

  export let currentLang = 'fa';
  export let packageSelected = null;
  export let packageIcon = { icon: 'bi-gift', tone: 'blue' };
  export let registering = false;
  export let error = '';
  export let orgName = '';
  export let fullName = '';
  export let phone = '';
  export let username = '';
  export let password = '';
  export let confirmPassword = '';
  export let inventoryMethod = 'CLASSIC';
  export let onClose = () => {};
  export let onSubmit = async () => {};
  export let onLogin = () => {};

  let modalPanel;
  let firstInput;
  let showPassword = false;
  let showConfirmPassword = false;

  const copy = {
    en: {
      title: 'Create your ERP account',
      subtitle: 'Create your business account and start using the ERP',
      package: 'Selected package',
      packageFallback: 'Demo package',
      company: 'Business / Company Name',
      fullName: 'Full Name',
      phone: 'Phone Number',
      username: 'Email or Username',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      inventoryMethod: 'Inventory Method', 
      classic: 'Classic — simple stock & average cost',
      fifo: 'FIFO — First In, First Out',
      lifo: 'LIFO — Last In, First Out',
      inventoryHint: 'This applies to all inventory operations for your organization.',
      submit: 'Start Using',
      loginPrefix: 'Already have an account?',
      login: 'Login',
      close: 'Close registration modal',
    },
    fa: {
      title: 'ایجاد حساب ERP',
      subtitle: 'حساب کسب‌وکار خود را بسازید و استفاده از ERP را شروع کنید',
      package: 'پکیج انتخاب شده',
      packageFallback: 'پکیج دمو',
      company: 'نام کسب‌وکار / شرکت',
      fullName: 'نام کامل',
      phone: 'شماره تماس',
      username: 'ایمیل یا نام کاربری',
      password: 'رمز عبور',
      confirmPassword: 'تکرار رمز عبور',
      inventoryMethod: 'روش موجودی انبار',
      classic: 'کلاسیک — موجودی ساده و میانگین قیمت',
      fifo: 'FIFO — اولین ورود، اولین خروج',
      lifo: 'LIFO — آخرین ورود، اولین خروج',
      inventoryHint: 'این انتخاب برای تمام عملیات انبار سازمان شما اعمال می‌شود.',
      submit: 'شروع استفاده',
      loginPrefix: 'قبلاً حساب دارید؟',
      login: 'ورود',
      close: 'بستن فرم ثبت‌نام',
    },
    ps: {
      title: 'د ERP حساب جوړ کړئ',
      subtitle: 'خپل سوداګریز حساب جوړ کړئ او د ERP کارول پیل کړئ',
      package: 'ټاکل شوی پکیج',
      packageFallback: 'ډیمو پکیج',
      company: 'د کاروبار / شرکت نوم',
      fullName: 'بشپړ نوم',
      phone: 'د تلیفون شمېره',
      username: 'ایمیل یا کارن نوم',
      password: 'پټ نوم',
      confirmPassword: 'پټ نوم بیا ولیکئ',
      inventoryMethod: 'د ذخیرې طریقه',
      classic: 'کلاسیک — ساده ذخیره او منځنی قیمت',
      fifo: 'FIFO — لومړی ننوت، لومړی وت',
      lifo: 'LIFO — وروستی ننوت، لومړی وت',
      inventoryHint: 'دا انتخاب ستاسو د سازمان د ټولو ذخیرې عملیاتو لپاره پلي کیږي.',
      submit: 'کارول پیل کړئ',
      loginPrefix: 'مخکې حساب لرئ؟',
      login: 'ننوتل',
      close: 'د ثبت‌نام کړکۍ بنده کړئ',
    },
  };

  $: text = copy[currentLang] || copy.fa;
  $: isRtl = currentLang !== 'en';
  $: inventoryOptions = [
    { value: 'CLASSIC', label: text.classic },
    { value: 'FIFO', label: text.fifo },
    { value: 'LIFO', label: text.lifo },
  ];
  $: inventoryMethodLabel =
    inventoryOptions.find((option) => option.value === inventoryMethod)?.label || text.classic;

  function packageName(plan) {
    if (!plan) return text.packageFallback;
    return currentLang === 'en'
      ? plan.name
      : currentLang === 'fa'
        ? plan.name_fa
        : currentLang === 'ps' && plan.name_ps
          ? plan.name_ps
          : plan.name_fa;
  }

  function setInputState(id, isValid) {
    const input = document.getElementById(id);
    if (!input) return;
    input.classList.toggle('is-valid', isValid);
    input.classList.toggle('is-invalid', !isValid);
  }

  function selectInventoryMethod(method) {
    inventoryMethod = method;
    setInputState('inventory_method_input', ['CLASSIC', 'FIFO', 'LIFO'].includes(method));
  }

  function handleOverlayClick(event) {
    if (event.target === event.currentTarget) onClose();
  }

  function focusableElements() {
    return Array.from(
      modalPanel?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) || [],
    ).filter((element) => !element.disabled && element.offsetParent !== null);
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;

    const items = focusableElements();
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  onMount(async () => {
    await tick();
    firstInput?.focus();

    if (window.mdb) {
      modalPanel?.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
  });
</script>

<div
  class="zeno-registration-modal"
  class:zeno-registration-modal--rtl={isRtl}
  role="presentation"
  on:click={handleOverlayClick}
  on:keydown={handleKeydown}>
  <section
    class="zeno-registration-modal__panel animate__animated animate__fadeInUp faster"
    bind:this={modalPanel}
    role="dialog"
    aria-modal="true"
    aria-labelledby="registration-modal-title"
    dir={isRtl ? 'rtl' : 'ltr'}>
    <button type="button" class="zeno-registration-modal__close" aria-label={text.close} on:click={onClose}>
      <i class="bi bi-x-lg"></i>
    </button>

    <div class="zeno-registration-modal__header">
      <div class="zeno-registration-modal__package-icon zeno-registration-modal__package-icon--{packageIcon.tone}">
        <i class="bi {packageIcon.icon}"></i>
      </div>
      <div>
        <span class="zeno-registration-modal__eyebrow">{text.package}</span>
        <h3>{packageName(packageSelected)}</h3>
      </div>
    </div>

    <div class="zeno-registration-modal__intro">
      <h2 id="registration-modal-title">{text.title}</h2>
      <p>{text.subtitle}</p>
    </div>

    {#if error}
      <div class="zeno-registration-modal__error" role="alert">
        {error}
      </div>
    {/if}

    <form class="zeno-registration-modal__form" on:submit|preventDefault={onSubmit}>
      <label class="zeno-registration-modal__field">
        <span>{text.company}</span>
        <input
          bind:this={firstInput}
          bind:value={orgName}
          id="org_name_input"
          type="text"
          autocomplete="organization"
          on:input={() => setInputState('org_name_input', orgName.trim().length > 0)} />
      </label>

      <label class="zeno-registration-modal__field">
        <span>{text.fullName}</span>
        <input
          bind:value={fullName}
          id="full_name_input"
          type="text"
          autocomplete="name"
          on:input={() => setInputState('full_name_input', fullName.trim().length > 0)} />
      </label>

      <label class="zeno-registration-modal__field">
        <span>{text.phone}</span>
        <input
          bind:value={phone}
          id="phone_input"
          type="tel"
          autocomplete="tel"
          on:input={() => setInputState('phone_input', phone.trim().length > 0)} />
      </label>

      <label class="zeno-registration-modal__field">
        <span>{text.username}</span>
        <input
          bind:value={username}
          id="username_input"
          type="text"
          autocomplete="username"
          on:input={() => setInputState('username_input', username.trim().length >= 4 && username.indexOf(' ') === -1)} />
      </label>

      <div class="zeno-registration-modal__field zeno-registration-modal__field--full">
        <span id="inventory_method_label">{text.inventoryMethod}</span>
        <div class="dropdown zeno-registration-modal__dropdown">
          <button
            id="inventory_method_input"
            class="zeno-registration-modal__dropdown-btn dropdown-toggle hidden-arrow"
            type="button"
            data-mdb-toggle="dropdown"
            aria-expanded="false"
            aria-haspopup="listbox"
            aria-labelledby="inventory_method_label"
            aria-label={text.inventoryMethod}>
            <i class="bi bi-layers" aria-hidden="true"></i>
            <span>{inventoryMethodLabel}</span>
            <i class="bi bi-chevron-down zeno-registration-modal__dropdown-chevron" aria-hidden="true"></i>
          </button>
          <ul
            class="dropdown-menu shadow-sm border-0 rounded-3"
            role="listbox"
            aria-labelledby="inventory_method_label">
            {#each inventoryOptions as option (option.value)}
              <li role="none">
                <button
                  class="dropdown-item rounded-2 {option.value === inventoryMethod ? 'active' : ''}"
                  type="button"
                  role="option"
                  aria-selected={option.value === inventoryMethod}
                  on:click={() => selectInventoryMethod(option.value)}>
                  {option.label}
                </button>
              </li>
            {/each}
          </ul>
        </div>
        <small class="zeno-registration-modal__hint">{text.inventoryHint}</small>
      </div>

      <label class="zeno-registration-modal__field">
        <span>{text.password}</span>
        <div class="zeno-registration-modal__password">
          <input
            bind:value={password}
            id="password_input"
            type={showPassword ? 'text' : 'password'}
            autocomplete="new-password"
            on:input={() => setInputState('password_input', password.length >= 6)} />
          <button type="button" on:click={() => (showPassword = !showPassword)} aria-label={text.password}>
            <i class="bi {showPassword ? 'bi-eye-slash' : 'bi-eye'}"></i>
          </button>
        </div>
      </label>

      <label class="zeno-registration-modal__field">
        <span>{text.confirmPassword}</span>
        <div class="zeno-registration-modal__password">
          <input
            bind:value={confirmPassword}
            id="confirm_password_input"
            type={showConfirmPassword ? 'text' : 'password'}
            autocomplete="new-password"
            on:input={() => setInputState('confirm_password_input', confirmPassword.length > 0 && confirmPassword === password)} />
          <button type="button" on:click={() => (showConfirmPassword = !showConfirmPassword)} aria-label={text.confirmPassword}>
            <i class="bi {showConfirmPassword ? 'bi-eye-slash' : 'bi-eye'}"></i>
          </button>
        </div>
      </label>

      <button type="submit" class="zeno-registration-modal__submit" disabled={registering}>
        {#if registering}
          <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        {:else}
          {text.submit}
        {/if}
      </button>
    </form>

    <p class="zeno-registration-modal__login">
      <span>{text.loginPrefix}</span>
      <button type="button" on:click={onLogin}>{text.login}</button>
    </p>
  </section>
</div>
