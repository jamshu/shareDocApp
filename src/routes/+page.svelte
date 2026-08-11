<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { user } from '$lib/auth.js';
	import { odooClient } from '$lib/odoo.js';
	import { toast } from '$lib/toast.js';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { Search, X, Plus, PenLine, Users } from 'lucide-svelte';

	let notes = $state([]);
	let loading = $state(true);
	let error = $state('');
	let query = $state('');
	let sort = $state('recent'); // recent | name

	const FIELDS = ['x_name', 'x_studio_date', 'x_studio_permission', 'create_uid', 'write_date'];

	let mine = $derived(notes.filter((n) => n.create_uid?.[0] === $user?.uid));
	let shared = $derived(notes.filter((n) => n.create_uid?.[0] !== $user?.uid));

	// Siri shortcut: /?q=<dictated text> lands here and runs the search.
	onMount(() => {
		const q = new URLSearchParams(location.search).get('q');
		if (q) query = q.trim();
		load();
	});

	// searches title + rendered html + markdown source server-side
	const searchDomain = (q) => [
		'|', '|',
		['x_name', 'ilike', q],
		['x_studio_notes', 'ilike', q],
		['x_studio_notes_md', 'ilike', q]
	];

	let loadSeq = 0; // drop out-of-order responses from stale searches
	async function load() {
		const seq = ++loadSeq;
		loading = true;
		error = '';
		try {
			// record rules already limit results to own + shared-with-me notes
			const q = query.trim();
			const order = sort === 'name' ? 'x_name asc' : 'write_date desc';
			const results = await odooClient.searchRecords(q ? searchDomain(q) : [], FIELDS, 'notes', {
				order
			});
			if (seq !== loadSeq) return;
			notes = results;
		} catch (e) {
			if (seq !== loadSeq) return;
			error = e.message;
		} finally {
			if (seq === loadSeq) loading = false;
		}
	}

	let searchTimer;
	function onSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(load, 300);
	}

	function clearSearch() {
		query = '';
		load();
	}

	async function newNote() {
		try {
			const id = await odooClient.createRecord({
				x_name: 'Untitled note',
				x_studio_date: new Date().toISOString().slice(0, 10),
				x_studio_permission: 'owner_edit'
			});
			goto(`${base}/note/${id}`);
		} catch (e) {
			toast.error(e.message || 'Could not create note');
		}
	}

	const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
</script>

{#snippet noteList(items)}
	<div class="note-grid">
		{#each items as n, i (n.id)}
			<a class="card card--interactive note-card fade-in" style="--fade-delay: {i * 0.04}s" href="{base}/note/{n.id}">
				<h3>{n.x_name}</h3>
				<div class="note-meta">
					<span class="mono">{fmtDate(n.x_studio_date)}</span>
					{#if n.create_uid?.[0] !== $user?.uid}
						<span class="chip">{n.create_uid?.[1]}</span>
					{/if}
					{#if n.x_studio_permission === 'contribute'}
						<span class="chip chip--green">contribute</span>
					{/if}
				</div>
			</a>
		{/each}
	</div>
{/snippet}

{#snippet skeletonGrid()}
	<div class="note-grid">
		{#each Array(6) as _}
			<div class="card note-card">
				<Skeleton h="1.05rem" w="70%" />
				<div style="margin-top:14px"><Skeleton h="0.8rem" w="45%" /></div>
			</div>
		{/each}
	</div>
{/snippet}

<div class="head-row">
	<h1>Notes</h1>
	<button class="btn btn--primary" onclick={newNote}><Plus size={16} /> New note</button>
</div>

<div class="toolbar">
	<div class="search">
		<Search size={17} class="search-ic" />
		<input
			class="input"
			type="search"
			placeholder="Search notes…"
			bind:value={query}
			oninput={onSearchInput}
		/>
		{#if query}
			<button class="clear" aria-label="Clear search" onclick={clearSearch}><X size={15} /></button>
		{/if}
	</div>
	<select class="select sort" bind:value={sort} onchange={load} aria-label="Sort">
		<option value="recent">Recent</option>
		<option value="name">Name</option>
	</select>
</div>

{#if error}<p class="error-text">{error}</p>{/if}

{#if loading}
	<div class="section-title"><PenLine size={15} /> My notes</div>
	{@render skeletonGrid()}
{:else}
	<div class="section-title"><PenLine size={15} /> My notes</div>
	{#if mine.length}{@render noteList(mine)}{:else}<p class="muted">{query.trim() ? 'No matches.' : 'Nothing yet — create your first note.'}</p>{/if}

	<div class="section-title"><Users size={15} /> Shared with me</div>
	{#if shared.length}{@render noteList(shared)}{:else}<p class="muted">{query.trim() ? 'No matches.' : 'No shared notes yet.'}</p>{/if}
{/if}

<style>
	.head-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: var(--space-2) 0 var(--space-4);
	}
	.toolbar {
		display: flex;
		gap: var(--space-2);
		align-items: center;
	}
	.search {
		position: relative;
		flex: 1;
	}
	.search :global(.search-ic) {
		position: absolute;
		left: 12px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-faint);
		pointer-events: none;
	}
	.search .input {
		padding-left: 38px;
		padding-right: 34px;
	}
	.clear {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
		display: inline-flex;
		padding: 4px;
		border-radius: 6px;
		color: var(--text-faint);
	}
	.clear:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	.sort {
		width: auto;
		flex-shrink: 0;
	}
	.note-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: var(--space-3);
	}
	.note-card {
		display: block;
		padding: var(--space-4);
		text-decoration: none;
		color: var(--text);
	}
	.note-card h3 {
		font-size: var(--fs-lg);
		font-weight: 600;
		margin-bottom: var(--space-3);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.note-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		font-size: var(--fs-xs);
		color: var(--text-dim);
	}
</style>
