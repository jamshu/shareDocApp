<script>
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { toast } from '$lib/toast.js';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { Plus, Copy, Eye, EyeOff, KeyRound } from 'lucide-svelte';

	let secrets = $state([]);
	let loading = $state(true);
	let error = $state('');
	let q = $state('');
	let revealed = $state({}); // id -> decrypted value (only while shown)

	let name = $state('');
	let value = $state('');
	let tags = $state('');
	let saving = $state(false);

	const filtered = $derived.by(() => {
		const words = q.toLowerCase().split(/\s+/).filter(Boolean);
		return secrets.filter((s) => {
			const hay = `${s.name} ${s.tags.join(' ')}`.toLowerCase();
			return words.every((w) => hay.includes(w));
		});
	});

	async function api(path = '', opts) {
		const d = await (await fetch(`${base}/api/secrets${path}`, opts)).json();
		if (!d.ok) throw new Error(d.error);
		return d;
	}

	async function load() {
		secrets = (await api()).secrets;
	}

	onMount(async () => {
		try {
			await load();
		} catch (e) {
			error = e.message;
		} finally {
			loading = false;
		}
	});

	async function copy(s) {
		try {
			// Safari needs the clipboard write tied to the click, so hand it a promise
			const text = api(`/${s.id}`).then((d) => new Blob([d.value], { type: 'text/plain' }));
			if (typeof ClipboardItem !== 'undefined') {
				await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text })]);
			} else {
				await navigator.clipboard.writeText(await (await text).text());
			}
			toast.success(`Copied “${s.name}”`);
		} catch (e) {
			toast.error(e.message || 'Copy failed');
		}
	}

	async function toggle(s) {
		if (revealed[s.id] != null) {
			delete revealed[s.id];
			return;
		}
		try {
			revealed[s.id] = (await api(`/${s.id}`)).value;
		} catch (e) {
			toast.error(e.message);
		}
	}

	async function remove(s) {
		try {
			await api(`/${s.id}`, { method: 'DELETE' });
			secrets = secrets.filter((x) => x.id !== s.id);
			toast.success('Secret deleted');
		} catch (e) {
			toast.error(e.message);
		}
	}

	async function add(e) {
		e.preventDefault();
		if (!name.trim() || !value) {
			toast.error('Enter a name and a value');
			return;
		}
		saving = true;
		try {
			await api('', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, value, tags: tags.split(',') })
			});
			name = value = tags = '';
			await load();
			toast.success('Secret stored (encrypted)');
		} catch (err) {
			toast.error(err.message);
		} finally {
			saving = false;
		}
	}
</script>

<div class="head-row">
	<h1>Secrets</h1>
</div>
<p class="muted">Encrypted credentials vault. Values are decrypted only when you copy or show them.</p>

<form class="card new-secret" onsubmit={add} autocomplete="off">
	<input class="input" placeholder="Name (e.g. OpenAI API key)" bind:value={name} />
	<input class="input" type="password" placeholder="Secret value" bind:value={value} autocomplete="new-password" />
	<input class="input" placeholder="Tags, comma separated (optional)" bind:value={tags} />
	<button class="btn btn--primary" disabled={saving}><Plus size={16} /> {saving ? 'Saving…' : 'Store'}</button>
</form>

{#if error}<p class="error-text">{error}</p>{/if}

{#if loading}
	{#each Array(3) as _}
		<div class="card row"><Skeleton h="1rem" w="45%" /></div>
	{/each}
{:else if !error}
	<input class="input search" type="search" placeholder="Search {secrets.length} secrets…" bind:value={q} />
	{#each filtered as s, i (s.id)}
		<div class="card row fade-in" style="--fade-delay: {Math.min(i, 10) * 0.03}s">
			<div class="info">
				<div class="name"><KeyRound size={14} /> {s.name}</div>
				{#if s.tags.length}
					<div class="tags">{#each s.tags as t}<span class="chip">{t}</span>{/each}</div>
				{/if}
				{#if revealed[s.id] != null}<code class="value">{revealed[s.id]}</code>{/if}
			</div>
			<div class="actions">
				<button class="btn btn--sm" onclick={() => copy(s)} title="Copy" aria-label="Copy {s.name}"><Copy size={15} /></button>
				<button class="btn btn--sm" onclick={() => toggle(s)} title="Show" aria-label="Show {s.name}">
					{#if revealed[s.id] != null}<EyeOff size={15} />{:else}<Eye size={15} />{/if}
				</button>
				<ConfirmButton label="Delete" confirmLabel="Sure?" onconfirm={() => remove(s)} />
			</div>
		</div>
	{:else}
		<p class="muted" style="margin-top:16px;">{q ? 'No matches.' : 'No secrets yet.'}</p>
	{/each}
{/if}

<style>
	.head-row {
		margin: var(--space-2) 0 var(--space-2);
	}
	.new-secret {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding: var(--space-3);
		margin: var(--space-4) 0;
	}
	.new-secret .input {
		flex: 1 1 200px;
	}
	.search {
		width: 100%;
		margin-bottom: var(--space-3);
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		margin-bottom: var(--space-2);
	}
	.info {
		flex: 1;
		min-width: 0;
	}
	.name {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 4px;
	}
	.value {
		display: block;
		margin-top: 6px;
		font-size: var(--fs-sm);
		overflow-wrap: anywhere;
		user-select: all;
	}
	.actions {
		display: flex;
		gap: var(--space-2);
		flex-shrink: 0;
	}
</style>
