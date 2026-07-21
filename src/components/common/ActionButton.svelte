<script>
  import { createEventDispatcher } from 'svelte';

  export let label = '';
  export let icon = '';
  export let variant = 'primary';
  export let tone = 'default';
  export let disabled = false;
  export let loading = false;
  export let title = '';
  export let type = 'button';
  export let compact = false;
  export let extraClass = '';

  const dispatch = createEventDispatcher();
</script>

<button
  class="action-btn {variant} tone-{tone} {extraClass}"
  class:compact
  class:icon-only={variant === 'icon' && !label}
  {disabled}
  {type}
  title={title || label}
  aria-label={title || label}
  on:click={() => dispatch('click')}>
  {#if loading}
    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
  {:else if icon}
    <i class="bi {icon}"></i>
  {/if}
  {#if label && variant !== 'icon'}
    <span>{label}</span>
  {/if}
</button>

<style>
  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-height: var(--button-height-sm, 2rem);
    padding: 0.25rem 0.55rem;
    border: 1px solid transparent;
    border-radius: var(--control-radius, 0.4rem);
    font-size: var(--control-font, 0.78rem);
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease,
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .action-btn:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .action-btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .primary {
    color: #ffffff;
    background: #0f6efd;
    border-color: #0f6efd;
    box-shadow: 0 8px 18px rgba(37, 99, 235, 0.18);
  }

  .primary:hover:not(:disabled) {
    background: #1d4ed8;
    border-color: #1d4ed8;
  }

  .secondary {
    color: #334155;
    background: #ffffff;
    border-color: #e5e7eb;
  }

  .secondary:hover:not(:disabled) {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  .ghost {
    color: #64748b;
    background: transparent;
    border-color: transparent;
  }

  .ghost:hover:not(:disabled) {
    background: #f8fafc;
    color: #0f172a;
  }

  .icon {
    width: var(--control-height-sm, 2.125rem);
    min-height: var(--button-height-sm, var(--control-height-sm));
    padding: 0;
    border-radius: 10px;
    background: #ffffff;
    border-color: #e5e7eb;
    color: #64748b;
  }

  .icon.tone-view {
    color: #0f6efd;
    background: #eff6ff;
    border-color: #bfdbfe;
  }

  .icon.tone-edit {
    color: #475569;
    background: #f8fafc;
    border-color: #e5e7eb;
  }

  .icon.tone-danger {
    color: #dc2626;
    background: #fef2f2;
    border-color: #fecaca;
  }

  .icon.tone-muted {
    color: #64748b;
    background: #ffffff;
    border-color: #e5e7eb;
  }

  .compact {
    min-height: var(--button-height-sm, var(--control-height-sm));
    padding: 0.22rem 0.5rem;
    font-size: var(--app-font-sm, 0.74rem);
  }

  .icon-only {
    width: var(--control-height-sm, 2.125rem);
    padding: 0;
  }
</style>
