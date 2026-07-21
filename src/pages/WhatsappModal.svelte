<svelte:options runes={false} />

<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { db, logActivity } from '../db.js';

  import { t, lang, translate_org_type, settings_all, shortID } from '../i18n/i18n';


  import { showDate } from '../calendar.js';


  // ensure component re-renders when language changes
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;


  $: account_created_template = $settings_all.find((s) => s.key === 'account_created_template')?.value || '';
  $: patient_created_template = $settings_all.find((s) => s.key === 'patient_created_template')?.value || '';
  $: journal_created_template = $settings_all.find((s) => s.key === 'journal_created_template')?.value || '';
  $: appointment_created_template = $settings_all.find((s) => s.key === 'appointment_created_template')?.value || '';
  $: sale_created_template = $settings_all.find((s) => s.key === 'sale_created_template')?.value || '';


  
  $: company_name = $settings_all.find((s) => s.key === 'company_name')?.value || '';
  $: company_phone = $settings_all.find((s) => s.key === 'company_phone')?.value || '';
  $: company_phone2 = $settings_all.find((s) => s.key === 'company_phone2')?.value || '';
  $: company_address = $settings_all.find((s) => s.key === 'company_address')?.value || '';
  $: company_email = $settings_all.find((s) => s.key === 'company_email')?.value || '';

  export let showWhatsappModal = false;

  export let message = '';
  export let phone = '';

  let readOnlyMessage = true;

  const footer = "\n\n\`تهیه شده توسط زینو ای آر پی\`";
// `*{{نام شرکت}}*
// {{تاریخ}}

// نام حساب: {{اسم حساب}}
// شماره حساب: {{شماره حساب}}
// مقدار پول: {{مقدار پول}}

// {{توضیحات}}`,


let monthNames = [
  'جنوری',
  'فبروری',
  'مارچ',
  'اپریل',
  'می',
  'جون',
  'جولای',
  'اگست',
  'سپتمبر',
  'اکتوبر',
  'نومبر',
  'دسمبر'

]
  export function openModal(temp = 'account_created_template', acc_id = '', accdata = {},firstEntryBalance={},secondAcc={},referenceText="") {
    if (temp == 'patient_created_template') {
        message = patient_created_template
          .split('{{نام شرکت}}')
          .join(company_name)
          .split('{{کد مریض}}')
          .join(accdata.code)
          .split('{{اسم مریض}}')
          .join(accdata.name)
          .split('{{ایمیل شرکت}}')
          .join(company_email)
          .split('{{شماره شرکت}}')
          .join(company_phone)
          .split('{{شماره۲ شرکت}}')
          .join(company_phone2)
          .split('{{آدرس شرکت}}')
          .join(company_address);

      if (accdata.phone) {
        phone = accdata.phone.startsWith('07') ? '+93' + accdata.phone.slice(1) : accdata.phone;
      }
    } else if (temp == 'account_created_template') {
        message = account_created_template
          .split('{{نام شرکت}}')
          .join(company_name)
          .split('{{شماره حساب}}')
          .join(shortID(acc_id))
          .split('{{اسم مشتری}}')
          .join(accdata.name)
          .split('{{ایمیل شرکت}}')
          .join(company_email)
          .split('{{شماره شرکت}}')
          .join(company_phone)
          .split('{{شماره۲ شرکت}}')
          .join(company_phone2)
          .split('{{آدرس شرکت}}')
          .join(company_address);

      if (accdata.phone) {
        phone = accdata.phone.startsWith('07') ? '+93' + accdata.phone.slice(1) : accdata.phone;
      }
    } else if (temp == 'journal_created_template') {
      message = journal_created_template
        .split('{{نام شرکت}}')
        .join(company_name)
        .split('{{تاریخ}}')
        .join(showDate(acc_id.date,"forPDF")[0]+" "+showDate(acc_id.date,"forPDF")[1]+" "+showDate(acc_id.date,"forPDF")[2]+" مطابق "+acc_id.date.slice(8,10)+" "+monthNames[parseInt(acc_id.date.slice(5,7))-1]+" "+acc_id.date.slice(0,4))
        .split('{{مرجع}}')
        .join(referenceText)
        .split('{{اسم حساب}}')
        .join(accdata.name)
        .split('{{حساب همتا}}')
        .join(secondAcc.main_acc == "true"?"":"حساب همتا: "+secondAcc.name)
        .split('{{شماره حساب}}')
        .join(shortID(accdata.id))
        .split('{{مقدار پول}}')
        .join(acc_id.first_entry_debit != 0?t('Debit')+": "+Number(acc_id.first_entry_debit||0).toLocaleString(undefined, { maximumFractionDigits: 3 })+" "+t(acc_id.currency):t('Credit')+": "+Number(acc_id.first_entry_credit||0).toLocaleString(undefined, { maximumFractionDigits: 3 })+" "+t(acc_id.currency))
        .split('{{بیلانس}}')
        .join(Object.entries(firstEntryBalance).map(([k,v],i)=>{return `${v} ${t(k)}`}).join(" | "))
        .split('{{توضیحات}}')
        .join(acc_id.description?"توضیحات: "+acc_id.description:"");
      if (accdata.phone) {
        phone = accdata.phone.startsWith('07') ? '+93' + accdata.phone.slice(1) : accdata.phone;
      }
    }  else if (temp == 'appointment_created_template') {
      message = appointment_created_template
        .split('{{نام شرکت}}')
        .join(company_name)
        .split('{{تاریخ}}')
        .join(showDate(acc_id.date,"forPDF")[0]+" "+showDate(acc_id.date,"forPDF")[1]+" "+showDate(acc_id.date,"forPDF")[2]+" مطابق "+acc_id.date.slice(8,10)+" "+monthNames[parseInt(acc_id.date.slice(5,7))-1]+" "+acc_id.date.slice(0,4))
        .split('{{دیپارتمنت}}')
        .join(referenceText)
        .split('{{اسم مریض}}')
        .join(accdata.name)
        .split('{{داکتر}}')
        .join(secondAcc.first_name+" "+secondAcc.last_name)
        .split('{{کد مریض}}')
        .join(accdata.code)
        .split('{{مقدار پول}}')
        .join(t('Appointment Fee')+": "+Number(acc_id.fee||0).toLocaleString(undefined, { maximumFractionDigits: 3 })+" "+t(acc_id.currency))
        .split('{{شماره نوبت}}')
        .join(acc_id.serial_no)
        .split('{{توضیحات}}')
        .join(acc_id.description?"توضیحات: "+acc_id.description:"");
      if (accdata.phone) {
        phone = accdata.phone.startsWith('07') ? '+93' + accdata.phone.slice(1) : accdata.phone;
      }
    } else if (temp == 'sale_created_template') {

      console.log(acc_id);

      let products = acc_id.items.map((item,i)=>{



        return `\u200F${i+1}. ${item.product_name} - ${Number(item.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${item.unit_name} - ${item.subtotal} ${t(item.currency)}\n`;
      }).join("");

      message = sale_created_template
        .split('{{نام شرکت}}')
        .join(company_name)
        .split('{{تاریخ}}')
        .join(showDate(acc_id.invoice_date,"forPDF")[0]+" "+showDate(acc_id.invoice_date,"forPDF")[1]+" "+showDate(acc_id.invoice_date,"forPDF")[2]+" مطابق "+acc_id.invoice_date.slice(8,10)+" "+monthNames[parseInt(acc_id.invoice_date.slice(5,7))-1]+" "+acc_id.invoice_date.slice(0,4))
        .split('{{اسم حساب}}')
        .join(accdata.name)
        .split('{{شماره حساب}}')
        .join(shortID(accdata.id))
        .split('{{شماره بل}}')
        .join(acc_id.invoice_number)
        .split('{{محصولات}}')
        .join("محصولات:\n"+products)
        .split('{{مجموع بل}}')
        .join(acc_id.bill_subtotal+" "+t(acc_id.currency))
        .split('{{تخفیف}}')
        .join(acc_id.discount_amount+" "+t(acc_id.currency))
        .split('{{رسید بل}}')
        .join(acc_id.paid+" "+t(acc_id.currency))
        .split('{{بیلانس قبلی}}')
        .join(Object.entries(firstEntryBalance).map(([k,v],i)=>{return k==acc_id.currency?`${(v+acc_id.due).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${t(k)}`:`${v.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${t(k)}`}).join(" | "))
        .split('{{بیلانس}}')
        .join(Object.entries(firstEntryBalance).map(([k,v],i)=>{return `${v.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${t(k)}`}).join(" | "))
        .split('{{توضیحات}}')
        .join(acc_id.description?"توضیحات: "+acc_id.description:"");
      if (accdata.phone) {
        phone = accdata.phone.startsWith('07') ? '+93' + accdata.phone.slice(1) : accdata.phone;
      }
    }

    showWhatsappModal = true;

    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 100);
  }

  export function closeModal() {
    showWhatsappModal = false;
  }

  function handleOverlayClick(event) {
    if (event.target === event.currentTarget) closeModal();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && showWhatsappModal) closeModal();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if showWhatsappModal}
  <div
    class="wa-overlay"
    role="presentation"
    on:click={handleOverlayClick}>
    <div
      class="wa-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wa-modal-title">
      <header class="wa-header">
        <div class="wa-header-main">
          <span class="wa-icon" aria-hidden="true">
            <i class="bi bi-whatsapp"></i>
          </span>
          <h2 id="wa-modal-title" class="wa-title">{t('Send Whatsapp Message')}</h2>
        </div>
        <button type="button" class="wa-close" aria-label={t('Close')} on:click={closeModal}>
          <i class="bi bi-x-lg"></i>
        </button>
      </header>

      <div class="wa-body">
        <div class="wa-field">
          <label class="wa-label" for="wa-phone">{t('Whatsapp Number')}</label>
          <div class="wa-phone-row">
            <input
              id="wa-phone"
              type="text"
              class="wa-input"
              readonly={readOnlyMessage}
              bind:value={phone}
              dir="ltr" />
            <button
              type="button"
              class="wa-edit"
              class:active={!readOnlyMessage}
              aria-label={t('Edit')}
              on:click={() => {
                readOnlyMessage = !readOnlyMessage;
              }}>
              <i class="bi bi-pencil"></i>
            </button>
          </div>
        </div>

        <div class="wa-field">
          <label class="wa-label" for="wa-message">{t('Message')}</label>
          <textarea
            id="wa-message"
            class="wa-textarea"
            rows="8"
            readonly={readOnlyMessage}
            bind:value={message}></textarea>
        </div>
      </div>

      <footer class="wa-footer">
        <button type="button" class="wa-btn wa-btn--secondary" on:click={closeModal}>
          {t('Close')}
        </button>
        {#if phone && phone.length >= 10}
          <a
            href={`https://wa.me/${phone}?text=${encodeURIComponent(message + footer)}`}
            target="_blank"
            rel="noopener noreferrer"
            class="wa-btn wa-btn--primary">
            <i class="bi bi-whatsapp" aria-hidden="true"></i>
            {t('Send to Whatsapp')}
          </a>
          <a
            href={`https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message + footer)}`}
            target="_blank"
            rel="noopener noreferrer"
            class="wa-btn wa-btn--outline">
            <i class="bi bi-globe" aria-hidden="true"></i>
            WhatsApp Web
          </a>
        {/if}
      </footer>
    </div>
  </div>
{/if}

<style>
  .wa-overlay {
    position: fixed;
    inset: 0;
    z-index: 20000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .wa-panel {
    width: min(95vw, 28rem);
    max-height: min(90vh, 40rem);
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 1rem;
    background: #ffffff;
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.16);
    overflow: hidden;
    min-width: 0;
  }

  .wa-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid #e2e8f0;
    flex-shrink: 0;
  }

  .wa-header-main {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
  }

  .wa-icon {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: rgba(37, 211, 102, 0.14);
    color: #128c7e;
    font-size: 1.1rem;
  }

  .wa-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.35;
  }

  .wa-close {
    width: 2rem;
    height: 2rem;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #64748b;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;
  }

  .wa-close:hover {
    background: #f8fafc;
    color: #0f172a;
    border-color: #cbd5e1;
  }

  .wa-body {
    padding: 1rem;
    overflow: auto;
    min-height: 0;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .wa-body::-webkit-scrollbar {
    display: none;
  }

  .wa-field {
    display: grid;
    gap: 0.35rem;
  }

  .wa-field + .wa-field {
    margin-top: 0.85rem;
  }

  .wa-label {
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  .wa-phone-row {
    display: flex;
    align-items: stretch;
    gap: 0.45rem;
  }

  .wa-input,
  .wa-textarea {
    width: 100%;
    min-width: 0;
    border: 1px solid #dbe7f3;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #0f172a;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.4;
    padding: 0.55rem 0.7rem;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .wa-input:focus,
  .wa-textarea:focus {
    outline: none;
    border-color: #93c5fd;
    box-shadow: 0 0 0 0.15rem rgba(37, 99, 235, 0.1);
  }

  .wa-input:read-only,
  .wa-textarea:read-only {
    background: #f8fafc;
    color: #334155;
  }

  .wa-textarea {
    min-height: 10rem;
    resize: vertical;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .wa-textarea::-webkit-scrollbar {
    display: none;
  }

  .wa-edit {
    width: 2.5rem;
    flex-shrink: 0;
    border: 1px solid #dbe7f3;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #64748b;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;
  }

  .wa-edit:hover,
  .wa-edit.active {
    background: #f0fdf4;
    border-color: #86efac;
    color: #128c7e;
  }

  .wa-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid #e2e8f0;
    background: #f8fafc;
    flex-shrink: 0;
  }

  .wa-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.25rem;
    padding: 0.4rem 0.85rem;
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.2;
    text-decoration: none;
    cursor: pointer;
    border: 1px solid transparent;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .wa-btn--secondary {
    background: #ffffff;
    border-color: #e2e8f0;
    color: #475569;
  }

  .wa-btn--secondary:hover {
    background: #f1f5f9;
    color: #0f172a;
    border-color: #cbd5e1;
  }

  .wa-btn--primary {
    background: #25d366;
    border-color: #25d366;
    color: #ffffff;
  }

  .wa-btn--primary:hover {
    background: #128c7e;
    border-color: #128c7e;
    color: #ffffff;
  }

  .wa-btn--outline {
    background: #ffffff;
    border-color: #86efac;
    color: #128c7e;
  }

  .wa-btn--outline:hover {
    background: #f0fdf4;
    border-color: #25d366;
    color: #075e54;
  }

  @media (max-width: 480px) {
    .wa-footer {
      flex-direction: column-reverse;
      align-items: stretch;
    }

    .wa-btn {
      width: 100%;
    }
  }
</style>
