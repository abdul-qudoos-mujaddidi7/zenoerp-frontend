<script>
  import DatePicker from '@hamedf/svelte-persian-datepicker';
  import { createEventDispatcher } from 'svelte';

  export let value = '';
  export let label = '';
  export let required = false;
  export let disabled = false;
  export let min = '1921-03-22';
  export let max = '2051-03-21';
  export let onChange = () => {};

  const dispatch = createEventDispatcher();

  function handleSubmit() {
    value = value || '';
    onChange(value);
    dispatch('change', value);
  }
</script>

<div class="app-date-field" class:disabled>
  {#if label}
    <label class="date-label">
      {label}
      {#if required}<span class="required">*</span>{/if}
    </label>
  {/if}

  <DatePicker
    bind:model={value}
    mode="single"
    type="date"
    locale="fa,en"
    input_calendar="auto"
    format="YYYY-MM-DD"
    color="blue"
    clearable={false}
    auto_submit={true}
    {disabled}
    from={min}
    to={max}
    submit={handleSubmit}
  />
</div>

<style>
  .app-date-field{display:grid;gap:.4rem;width:100%;min-width:0}.app-date-field.disabled{pointer-events:none;opacity:.55}.date-label{color:#344054;font-size:.78rem;font-weight:650}.required{color:#d92d20}:global(.app-date-field .pdp-icon){display:none!important}:global(.app-date-field input){width:100%;min-height:2.875rem;padding-inline:.5rem!important;color:#172554;background:#fff;border:1px solid #dce4f1;border-radius:.75rem!important;outline:none;text-align:center!important}:global(.app-date-field .pdp.rtl .pdp-group .pdp-icon.pdp-inside + input),:global(.app-date-field .pdp.ltr .pdp-group .pdp-icon.pdp-inside + input){padding-inline:.5rem!important}:global(.app-date-field input:focus){border-color:#2f6fed;box-shadow:0 0 0 3px rgba(47,111,237,.12)}:global(.pdp-container),:global(.pdp-calendar){z-index:100000!important}
</style>
