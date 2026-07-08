<script>
	import { onMount } from 'svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import { downloadFile } from '$lib/download.js';

	let folders = $state([]); // flat: { id, name, parentId }
	let currentId = $state(null); // null = root
	let files = $state([]);
	let loading = $state(true);
	let filesLoading = $state(false);
	let uploading = $state(false);
	let error = $state('');
	let viewerFile = $state(null);

	let children = $derived(folders.filter((f) => f.parentId === currentId));
	let crumbs = $derived.by(() => {
		const byId = new Map(folders.map((f) => [f.id, f]));
		const trail = [];
		for (let f = byId.get(currentId); f; f = byId.get(f.parentId)) trail.unshift(f);
		return trail;
	});

	onMount(loadFolders);

	async function api(path, opts) {
		const res = await fetch(path, opts);
		const data = await res.json();
		if (!data.ok) throw new Error(data.error || 'Request failed');
		return data;
	}

	async function loadFolders() {
		loading = true;
		error = '';
		try {
			folders = (await api('/api/documents/folders')).folders;
		} catch (e) {
			error = e.message;
		} finally {
			loading = false;
		}
	}

	async function open(folderId) {
		currentId = folderId;
		files = [];
		if (!folderId) return;
		filesLoading = true;
		error = '';
		try {
			files = (await api(`/api/documents?folderId=${folderId}`)).files;
		} catch (e) {
			error = e.message;
		} finally {
			filesLoading = false;
		}
	}

	async function newFolder() {
		const name = prompt('Folder name');
		if (!name?.trim()) return;
		try {
			await api('/api/documents/folders', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, parentId: currentId })
			});
			await loadFolders();
		} catch (e) {
			error = e.message;
		}
	}

	const MAX_UPLOAD = 4 * 1024 * 1024; // Vercel serverless JSON body cap

	async function onPick(ev) {
		const picked = [...ev.target.files];
		ev.target.value = '';
		if (!picked.length || !currentId) return;
		uploading = true;
		error = '';
		try {
			for (const file of picked) {
				if (file.size > MAX_UPLOAD) throw new Error(`${file.name} is over 4MB`);
				const dataBase64 = await new Promise((res, rej) => {
					const r = new FileReader();
					r.onload = () => res(r.result.split(',')[1]);
					r.onerror = () => rej(new Error('Could not read file'));
					r.readAsDataURL(file);
				});
				await api('/api/documents', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ folderId: currentId, name: file.name, mimetype: file.type, dataBase64 })
				});
			}
			await open(currentId);
		} catch (e) {
			error = e.message;
		} finally {
			uploading = false;
		}
	}

	async function archive(id) {
		try {
			await api(`/api/documents/${id}`, { method: 'DELETE' });
			files = files.filter((f) => f.id !== id);
		} catch (e) {
			error = e.message;
		}
	}

	async function download(f) {
		try {
			await downloadFile(`/api/documents/${f.id}?download`, f.name);
		} catch (e) {
			error = e.message;
		}
	}

	const icon = (m) =>
		m?.startsWith('image/') ? '🖼️'
		: m === 'application/pdf' ? '📕'
		: m?.startsWith('video/') ? '🎬'
		: m?.startsWith('audio/') ? '🎵'
		: /sheet|excel|csv/.test(m || '') ? '📊'
		: /word|document|text/.test(m || '') ? '📄'
		: '📎';

	const fmtSize = (b) =>
		b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b || 0} B`;

	const fmtDate = (d) =>
		d ? new Date(d + 'Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
</script>

<div class="head-row">
	<h1>Documents</h1>
	<div class="actions">
		<button class="btn" onclick={newFolder}>+ Folder</button>
		{#if currentId}
			<label class="btn btn--primary upload-btn">
				{uploading ? 'Uploading…' : '⬆ Upload'}
				<input type="file" multiple hidden onchange={onPick} disabled={uploading} />
			</label>
		{/if}
	</div>
</div>

<nav class="crumbs">
	<button class="crumb" onclick={() => open(null)}>🏠 All</button>
	{#each crumbs as c (c.id)}
		<span class="muted">/</span>
		<button class="crumb" class:current={c.id === currentId} onclick={() => open(c.id)}>{c.name}</button>
	{/each}
</nav>

{#if error}<p class="error-text">{error}</p>{/if}

{#if loading}
	<p class="muted">Loading…</p>
{:else}
	{#if children.length}
		<div class="folder-grid">
			{#each children as f, i (f.id)}
				<button class="card card--interactive folder-card fade-in" style="--fade-delay: {i * 0.03}s" onclick={() => open(f.id)}>
					<span class="emo">📁</span>
					<span class="folder-name">{f.name}</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if currentId}
		{#if filesLoading}
			<p class="muted">Loading files…</p>
		{:else if files.length}
			<div class="file-list">
				{#each files as f (f.id)}
					<div class="card file-row fade-in">
						<button class="file-main" onclick={() => (viewerFile = f)}>
							<span class="emo">{icon(f.mimetype)}</span>
							<span class="file-info">
								<span class="file-name">{f.name}</span>
								<span class="muted file-meta">{fmtSize(f.size)} · {fmtDate(f.date)}{f.owner ? ` · ${f.owner}` : ''}</span>
							</span>
						</button>
						<button class="btn btn--sm" title="Download" onclick={() => download(f)}>⬇</button>
						<ConfirmButton label="🗑" confirmLabel="Sure?" onconfirm={() => archive(f.id)} />
					</div>
				{/each}
			</div>
		{:else if !children.length}
			<p class="muted">Empty folder — upload something.</p>
		{:else}
			<p class="muted">No files here.</p>
		{/if}
	{:else if !children.length}
		<p class="muted">No folders yet — create one.</p>
	{/if}
{/if}

<svelte:window onkeydown={(e) => e.key === 'Escape' && (viewerFile = null)} />

{#if viewerFile}
	<div
		class="viewer"
		role="dialog"
		aria-label={viewerFile.name}
		onclick={(e) => e.target === e.currentTarget && (viewerFile = null)}
	>
		<div class="viewer-head">
			<span class="viewer-name">{viewerFile.name}</span>
			<button class="btn btn--sm" onclick={() => download(viewerFile)}>⬇ Download</button>
			<button class="btn btn--sm" onclick={() => (viewerFile = null)}>✕</button>
		</div>
		{#if viewerFile.mimetype?.startsWith('image/')}
			<img class="viewer-body" src="/api/documents/{viewerFile.id}" alt={viewerFile.name} />
		{:else if viewerFile.mimetype === 'application/pdf'}
			<!-- ponytail: iOS iframe shows only page 1 of PDFs; Download covers the rest -->
			<iframe class="viewer-body" src="/api/documents/{viewerFile.id}" title={viewerFile.name}
			></iframe>
		{:else}
			<p class="viewer-none">No preview available — use Download.</p>
		{/if}
	</div>
{/if}

<style>
	.viewer {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		padding-top: calc(12px + env(safe-area-inset-top));
		background: rgba(0, 0, 0, 0.85);
	}
	.viewer-head {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.viewer-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: #fff;
		font-size: 0.9rem;
	}
	.viewer-body {
		flex: 1;
		min-height: 0;
		width: 100%;
		object-fit: contain;
		border: none;
		border-radius: 10px;
		background: #fff;
	}
	img.viewer-body {
		background: transparent;
	}
	.viewer-none {
		margin: auto;
		color: #fff;
	}
	.head-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: 18px 0 4px;
		gap: 10px;
		flex-wrap: wrap;
	}
	.actions {
		display: flex;
		gap: 8px;
	}
	.upload-btn {
		cursor: pointer;
	}
	.crumbs {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-wrap: wrap;
		margin: 10px 0 16px;
	}
	.crumb {
		background: none;
		border: none;
		color: var(--text-dim);
		font-weight: 600;
		font-size: 0.92rem;
		padding: 6px 8px;
		border-radius: 999px;
		cursor: pointer;
	}
	.crumb:hover,
	.crumb.current {
		color: var(--text);
		background: var(--surface-2);
	}
	.folder-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 10px;
		margin-bottom: 18px;
	}
	.folder-card {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px;
		font-weight: 600;
		color: var(--text);
		text-align: left;
		cursor: pointer;
	}
	.folder-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.file-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.file-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
	}
	.file-main {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		min-width: 0;
		color: var(--text);
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.file-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.file-name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.file-meta {
		font-size: 0.8rem;
	}
</style>
