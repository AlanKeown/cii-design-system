<script lang="ts">
  import { TextField, Button, Alert } from '@cii/svelte';
  import Preview from '#lib/Preview.svelte';
  let name = $state('');
  let error = $state('');
  let saved = $state(false);
  function validate() {
    error = name.trim() ? '' : 'Enter a member name.';
  }
</script>

<Preview title="Text field example">
  <form
    novalidate
    onsubmit={(event) => {
      event.preventDefault();
      validate();
      saved = !error;
    }}
  >
    <TextField
      id="example-member-name"
      label="Member name"
      hint="Use the name the member prefers."
      required
      bind:value={name}
      {error}
      onblur={validate}
      oninput={(event) => {
        saved = false;
        if (error && event.currentTarget.value.trim()) error = '';
      }}
    />
    <Button type="submit">Save member</Button>
    {#if saved}<Alert tone="success" role="status" title="Member saved"
        >Saved {name}.</Alert
      >{/if}
  </form>
</Preview>

<style>
  form {
    display: grid;
    gap: 16px;
  }
</style>
