<!--
  Siri / iPhone Shortcut deep-link: quick-create a note from dictated text.
  Runs under the existing session cookie (the layout redirects guests to /login).
    /note/new?q=<dictated text>&go=1   -> create immediately, open the note
    /note/new?q=<dictated text>        -> prefill, user taps "Create note"
  Static route wins over /note/[id].
-->
<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { user } from '$lib/auth.js';
	import { odooClient } from '$lib/odoo.js';
	import { marked } from 'marked';
	import { PenLine } from 'lucide-svelte';

	// x_name is a short summary; the full dictated text is the markdown body.
	function summarize(t) {
		const base = (t.split('\n')[0].trim() || t.trim());
		const sentence = (base.split(/(?<=[.!?])\s/)[0] || base).trim();
		if (!sentence) return 'Untitled note';
		return sentence.length > 50 ? sentence.slice(0, 50).trim() + '…' : sentence;
	}

	let text = $state('');
	let auto = $state(false);
	let creating = $state(false);
	let error = $state('');
	let started = false;

	onMount(() => {
		const sp = $page.url.searchParams;
		text = (sp.get('q') || '').trim();
		auto = sp.get('go') === '1';
	});

	// Wait for auth to settle ($user: undefined -> value); guests are already
	// bounced to /login by the layout gate. Auto-submit only when ?go=1.
	$effect(() => {
		if ($user && auto && text && !started) {
			started = true;
			create();
		}
	});

	async function create() {
		if (!text.trim()) {
			error = 'Nothing to create';
			return;
		}
		creating = true;
		error = '';
		try {
			const md = text.trim();
			const id = await odooClient.createRecord({
				x_name: summarize(md),
				x_studio_notes_md: md, // markdown source
				x_studio_notes: marked.parse(md), // rendered html for the read view
				x_studio_editor_mode: 'md',
				x_studio_date: new Date().toISOString().slice(0, 10),
				x_studio_permission: 'owner_edit'
			});
			goto(`${base}/note/${id}`);
		} catch (e) {
			error = e.message || 'Could not create note';
			creating = false;
		}
	}
</script>

<div class="head-row">
	<h1><PenLine size={18} /> New note</h1>
</div>

{#if error}<p class="error-text">{error}</p>{/if}

{#if auto && creating}
	<p class="muted">Creating note…</p>
{:else}
	<textarea
		class="input note-text"
		bind:value={text}
		placeholder="Write or dictate your note…"
		rows="8"
	></textarea>
	<div class="actions">
		<button class="btn btn--primary" onclick={create} disabled={creating || !text.trim()}>
			{creating ? 'Creating…' : 'Create note'}
		</button>
		<a class="btn btn--ghost" href="{base}/">Cancel</a>
	</div>
{/if}

<style>
	.head-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: var(--space-2) 0 var(--space-4);
	}
	.head-row h1 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.note-text {
		width: 100%;
		resize: vertical;
		min-height: 160px;
	}
	.actions {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
</style>
