<script lang="ts">
  import { StatusChip } from '@cii/svelte';
  import Preview from '#lib/Preview.svelte';
</script>

<Preview title="Status chip example">
  <div class="chips">
    <StatusChip>Inactive</StatusChip>
    <StatusChip tone="success">Active</StatusChip>
    <StatusChip tone="warning">Pending</StatusChip>
    <StatusChip tone="danger">Overdue</StatusChip>
    <StatusChip tone="accent">Needs review</StatusChip>
  </div>
</Preview>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
</style>
