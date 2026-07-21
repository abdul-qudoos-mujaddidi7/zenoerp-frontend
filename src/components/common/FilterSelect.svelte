<script>
  import { createEventDispatcher } from 'svelte';

  export let label = '';
  export let icon = '';
  export let value = '';
  export let options = [];
  export let compact = false;
  export let variant = 'default';

  const dispatch = createEventDispatcher();

  let open = false;
  let triggerEl;
  let menuEl;
  let menuStyle = '';

  $: isOutline = variant === 'outline';
  $: selectedOption = options.find((option) => option.value === value);
  $: selectedLabel = selectedOption?.label ?? (isOutline ? '' : label);

  function portal(node) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  function toggle() {
    if (open) { open = false; return; }
    const rect = triggerEl.getBoundingClientRect();
    const width = Math.max(rect.width, 150);
    const maxHeight = Math.min(224, window.innerHeight * 0.45);
    const openUp = window.innerHeight - rect.bottom < Math.min(maxHeight, options.length * 36 + 12);
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));
    menuStyle = openUp
      ? `left:${left}px;width:${width}px;bottom:${window.innerHeight - rect.top + 5}px;top:auto;max-height:${maxHeight}px;`
      : `left:${left}px;width:${width}px;top:${rect.bottom + 5}px;bottom:auto;max-height:${maxHeight}px;`;
    open = true;
  }

  function selectOption(optionValue) {
    open = false;
    dispatch('change', optionValue);
  }

  function closeOnEscape(event) {
    if (event.key === 'Escape' && open) open = false;
  }

  function clickOutside(node) {
    function onClick(event) {
      if (!open) return;
      if (!node.contains(event.target) && !menuEl?.contains(event.target)) open = false;
    }

    window.addEventListener('click', onClick);
    return {
      destroy() {
        window.removeEventListener('click', onClick);
      }
    };
  }
</script>

<svelte:window on:keydown={closeOnEscape} />

<div
  class="filter-select"
  class:compact
  class:outline={isOutline}
  class:is-open={open}
  class:has-value={!!selectedOption}
  use:clickOutside>
  {#if !compact && !isOutline}
    <span class="filter-select__label">
      {#if icon}<i class="bi {icon}"></i>{/if}
      {label}
    </span>
  {/if}

  <div class="filter-select__control">
    {#if isOutline && label}
      <span class="filter-select__notch" aria-hidden="true">
        {#if icon}<i class="bi {icon}"></i>{/if}
        {label}
      </span>
    {/if}

    <button
      bind:this={triggerEl}
      type="button"
      class="filter-select__trigger"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={label || selectedLabel}
      on:click={toggle}>
      {#if icon && !isOutline}<i class="bi {icon}" aria-hidden="true"></i>{/if}
      <span class="filter-select__value">{selectedLabel}</span>
      <i class="bi bi-chevron-down filter-select__chevron" aria-hidden="true"></i>
    </button>

    {#if open}
      <ul bind:this={menuEl} use:portal class="filter-select__menu" role="listbox" style={menuStyle}>
        {#each options as option (option.value)}
          <li role="option" aria-selected={option.value === value}>
            <button
              type="button"
              class="filter-select__option"
              class:active={option.value === value}
              on:click={() => selectOption(option.value)}>
              {option.label}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .filter-select {
    display: grid;
    gap: 0.18rem;
    flex: 0 1 auto;
    min-width: 0;
    width: min(100%, 8.5rem);
    margin: 0;
    position: relative;
  }

  .filter-select.is-open {
    z-index: 40;
  }

  .filter-select__label {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    color: #64748b;
    font-size: var(--app-font-xs, 0.68rem);
    font-weight: 800;
    white-space: nowrap;
  }

  .filter-select__control {
    position: relative;
    width: 100%;
    min-width: 0;
  }

  .filter-select__trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    min-height: var(--control-height-sm);
    padding: 0.35rem 0.55rem;
    border: 1px solid #d6e0ed;
    border-radius: 8px;
    background: #ffffff;
    color: #64748b;
    font-size: 0.8rem;
    font-weight: 500;
    line-height: 1.2;
    text-align: start;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .filter-select__trigger:hover {
    border-color: #d6e0ed;
    background: #f8fbff;
    color: #334155;
  }

  .filter-select__trigger:focus-visible {
    outline: none;
    border-color: #d6e0ed;
    box-shadow: 0 0 0 0.15rem rgba(37, 99, 235, 0.1);
  }

  .filter-select__value {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: inherit;
  }

  .filter-select__chevron {
    flex: 0 0 auto;
    font-size: 0.6rem;
    opacity: 0.6;
    transition: transform 0.16s ease;
  }

  .filter-select.is-open .filter-select__chevron {
    transform: rotate(180deg);
  }

  .filter-select__menu {
    position: fixed;
    z-index: 100000;
    max-height: 14rem;
    margin: 0;
    padding: 0.35rem;
    list-style: none;
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 0.75rem;
    background: #ffffff;
    box-shadow: 0 14px 32px rgba(15, 23, 42, 0.12);
  }

  .filter-select__menu::-webkit-scrollbar {
    display: none;
  }

  .filter-select__option {
    display: block;
    width: 100%;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: #0f172a;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.42rem 0.6rem;
    text-align: start;
    cursor: pointer;
  }

  .filter-select__option:hover {
    background: rgba(59, 130, 246, 0.06);
    color: #0f6efd;
  }

  .filter-select__option.active {
    background: rgba(59, 130, 246, 0.1);
    color: #0f6efd;
  }

  .compact {
    width: min(100%, 7.5rem);
  }

  /* MDB-style outline / floating notch label */
  .filter-select.outline {
    width: 100%;
    gap: 0;
    padding-top: 0.2rem;
  }

  .filter-select__notch {
    position: absolute;
    top: 0;
    inset-inline-start: 0.7rem;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    max-width: calc(100% - 1.4rem);
    padding: 0 0.3rem;
    transform: translateY(-50%);
    background: #ffffff;
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }

  .filter-select__notch i {
    font-size: 0.7rem;
  }

  .filter-select.outline .filter-select__trigger {
    min-height: var(--control-height-sm, 2.125rem);
    padding: 0.45rem 0.75rem;
    border-radius: 0.5rem;
    border-color: #d6e0ed;
    color: #0f172a;
    font-weight: 600;
  }

  .filter-select.outline.has-value .filter-select__trigger,
  .filter-select.outline.is-open .filter-select__trigger,
  .filter-select.outline .filter-select__trigger:hover,
  .filter-select.outline .filter-select__trigger:focus-visible {
    border-color: #d6e0ed;
  }

  .filter-select.outline.is-open .filter-select__trigger,
  .filter-select.outline .filter-select__trigger:focus-visible {
    box-shadow: 0 0 0 0.12rem rgba(37, 99, 235, 0.08);
  }

  .filter-select.outline.is-open .filter-select__notch,
  .filter-select.outline:focus-within .filter-select__notch,
  .filter-select.outline.has-value .filter-select__notch {
    color: #0f6efd;
  }

  .filter-select.outline .filter-select__value:empty::before {
    content: '\00a0';
  }
</style>
