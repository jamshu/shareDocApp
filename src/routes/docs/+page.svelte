<script>
	import { onMount } from 'svelte';
	import FileViewer from '$lib/components/FileViewer.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { downloadFile } from '$lib/download.js';
	import { toast } from '$lib/toast.js';
	import {
		Folder,
		FolderPlus,
		Upload,
		Home,
		MoreVertical,
		Pencil,
		Lock,
		LockOpen,
		Download,
		Trash2,
		Image as ImageIc,
		FileText,
		FileSpreadsheet,
		Film,
		Music,
		Paperclip,
		File as FileIc
	} from 'lucide-svelte';

	let folders = $state([]); // flat: { id, name, parentId }
	let currentId = $state(null); // null = root
	let files = $state([]);
	let loading = $state(true);
	let filesLoading = $state(false);
	let uploading = $state(false);
	let dragActive = $state(false); // OS files dragged over (external upload)
	let draggingFileId = $state(null); // internal file being dragged to a folder
	let dropFolderId = $state(null); // folder card currently hovered during a move
	let error = $state('');
	let viewerFile = $state(null);
	// folder and file ids are separate spaces, so the open menu is namespaced: d:<id> / f:<id>
	let menuId = $state(null);
	let renaming = $state(null); // item ({id,name}) being renamed
	let renameValue = $state('');
	let renameSaving = $state(false);
	let deleting = $state(null); // file pending delete confirmation

	let children = $derived(folders.filter((f) => f.parentId === currentId));
	let myFolders = $derived(children.filter((f) => !f.shared)); // private = My Drive
	let sharedFolders = $derived(children.filter((f) => f.shared)); // company-wide
	let crumbs = $derived.by(() => {
		const byId = new Map(folders.map((f) => [f.id, f]));
		const trail = [];
		for (let f = byId.get(currentId); f; f = byId.get(f.parentId)) trail.unshift(f);
		return trail;
	});

	onMount(async () => {
		await loadFolders();
		await open(null); // load My Drive root files
	});

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
		filesLoading = true;
		error = '';
		try {
			files = (await api(`/api/documents?folderId=${folderId ?? 'root'}`)).files;
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
			toast.error(e.message);
		}
	}

	const MAX_UPLOAD = 25 * 1024 * 1024; // 25MB — Workers body limit is far higher; capped for Worker memory

	function onPick(ev) {
		const picked = [...ev.target.files];
		ev.target.value = '';
		processFiles(picked);
	}

	function onDrop(ev) {
		ev.preventDefault();
		dragActive = false;
		// Internal file-move drags carry no OS files — ignore them here.
		if (!ev.dataTransfer.files?.length) return;
		if (!currentId) {
			toast.error('Open a folder first, then drop files into it');
			return;
		}
		processFiles([...ev.dataTransfer.files]);
	}

	// --- Drag a file onto a folder to move it there ---
	async function moveFile(fileId, folderId) {
		draggingFileId = null;
		dropFolderId = null;
		if (!fileId || folderId === currentId) return; // no-op if already here
		try {
			await api(`/api/documents/${fileId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ folder_id: folderId })
			});
			files = files.filter((f) => f.id !== fileId); // it left the current view
			toast.success('Moved');
		} catch (e) {
			toast.error(e.message);
		}
	}

	async function processFiles(picked) {
		if (!picked.length || !currentId) return;
		uploading = true;
		error = '';
		try {
			for (const file of picked) {
				if (file.size > MAX_UPLOAD) throw new Error(`${file.name} is over 25MB`);
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
			toast.success(picked.length > 1 ? `${picked.length} files uploaded` : 'File uploaded');
		} catch (e) {
			toast.error(e.message);
		} finally {
			uploading = false;
		}
	}

	async function archive() {
		const id = deleting?.id;
		deleting = null;
		if (!id) return;
		try {
			await api(`/api/documents/${id}`, { method: 'DELETE' });
			files = files.filter((f) => f.id !== id);
			toast.success('File deleted');
		} catch (e) {
			toast.error(e.message);
		}
	}

	function rename(item) {
		renaming = item;
		renameValue = item.name;
	}

	async function submitRename() {
		const name = renameValue.trim();
		if (!name || !renaming) return;
		if (name === renaming.name) {
			renaming = null;
			return;
		}
		renameSaving = true;
		error = '';
		try {
			await api(`/api/documents/${renaming.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name })
			});
			renaming.name = name; // $state array items are reactive
			renaming = null;
			toast.success('Renamed');
		} catch (e) {
			toast.error(e.message);
		} finally {
			renameSaving = false;
		}
	}

	async function toggleShare(f) {
		const next = f.shared ? 'none' : 'edit';
		try {
			await api(`/api/documents/${f.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ access_internal: next })
			});
			f.shared = !f.shared;
			toast.success(f.shared ? 'Folder shared' : 'Folder made private');
		} catch (e) {
			toast.error(e.message);
		}
	}

	async function download(f) {
		try {
			await downloadFile(`/api/documents/${f.id}?download`, f.name);
		} catch (e) {
			toast.error(e.message);
		}
	}

	const fileIcon = (m) =>
		m?.startsWith('image/') ? ImageIc
		: m === 'application/pdf' ? FileText
		: m?.startsWith('video/') ? Film
		: m?.startsWith('audio/') ? Music
		: /sheet|excel|csv/.test(m || '') ? FileSpreadsheet
		: /word|document|text/.test(m || '') ? FileText
		: Paperclip;

	const fmtSize = (b) =>
		b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b || 0} B`;

	const fmtDate = (d) =>
		d ? new Date(d + 'Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
</script>

<div class="head-row">
	<h1>Documents</h1>
	<div class="actions">
		<button class="btn btn--secondary" onclick={newFolder}><FolderPlus size={16} /> Folder</button>
		{#if currentId}
			<label class="btn btn--primary upload-btn">
				<Upload size={16} /> {uploading ? 'Uploading…' : 'Upload'}
				<input type="file" multiple hidden onchange={onPick} disabled={uploading} />
			</label>
		{/if}
	</div>
</div>

<nav class="crumbs" aria-label="Breadcrumb">
	<button
		class="crumb"
		class:crumb-drop={dropFolderId === 'root'}
		onclick={() => open(null)}
		ondragover={(e) => { if (draggingFileId) { e.preventDefault(); dropFolderId = 'root'; } }}
		ondragleave={() => { if (dropFolderId === 'root') dropFolderId = null; }}
		ondrop={(e) => { if (draggingFileId) { e.preventDefault(); moveFile(draggingFileId, null); } }}
	><Home size={15} /> All</button>
	{#each crumbs as c (c.id)}
		<span class="sep">/</span>
		<button
			class="crumb"
			class:current={c.id === currentId}
			class:crumb-drop={dropFolderId === c.id}
			onclick={() => open(c.id)}
			ondragover={(e) => { if (draggingFileId) { e.preventDefault(); dropFolderId = c.id; } }}
			ondragleave={() => { if (dropFolderId === c.id) dropFolderId = null; }}
			ondrop={(e) => { if (draggingFileId) { e.preventDefault(); moveFile(draggingFileId, c.id); } }}
		>{c.name}</button>
	{/each}
</nav>

{#if error}<p class="error-text">{error}</p>{/if}

{#snippet folderCard(f, i)}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="card card--interactive folder-card fade-in"
		class:menu-open={menuId === `d:${f.id}`}
		class:drop-target={dropFolderId === f.id}
		style="--fade-delay: {i * 0.03}s"
		ondragover={(e) => { if (draggingFileId) { e.preventDefault(); dropFolderId = f.id; } }}
		ondragleave={(e) => { if (dropFolderId === f.id && !e.currentTarget.contains(e.relatedTarget)) dropFolderId = null; }}
		ondrop={(e) => { if (draggingFileId) { e.preventDefault(); e.stopPropagation(); moveFile(draggingFileId, f.id); } }}
	>
		<button class="folder-main" onclick={() => open(f.id)}>
			<Folder size={19} class="folder-ic" />
			<span class="folder-name">{f.name}</span>
			{#if f.shared}<LockOpen size={13} class="shared-badge" />{/if}
		</button>
		<div class="folder-actions">
			<button
				class="kebab"
				title="More"
				aria-label="More actions"
				onclick={(e) => {
					e.stopPropagation();
					menuId = menuId === `d:${f.id}` ? null : `d:${f.id}`;
				}}><MoreVertical size={17} /></button>
			{#if menuId === `d:${f.id}`}
				<div class="menu" role="menu">
					<button class="menu-item" onclick={(e) => { e.stopPropagation(); menuId = null; rename(f); }}><Pencil size={15} /> Rename</button>
					{#if f.mine}
						<button class="menu-item" onclick={(e) => { e.stopPropagation(); menuId = null; toggleShare(f); }}>
							{#if f.shared}<Lock size={15} /> Make private{:else}<LockOpen size={15} /> Share{/if}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet fileRow(f)}
	{@const Icon = fileIcon(f.mimetype)}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="card card--interactive file-row fade-in"
		class:menu-open={menuId === `f:${f.id}`}
		class:dragging={draggingFileId === f.id}
		draggable="true"
		ondragstart={(e) => {
			draggingFileId = f.id;
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(f.id));
		}}
		ondragend={() => { draggingFileId = null; dropFolderId = null; }}
	>
		<button class="file-main" onclick={() => (viewerFile = f)}>
			<span class="file-ic"><Icon size={18} /></span>
			<span class="file-info">
				<span class="file-name">{f.name}</span>
				<span class="file-meta mono">{fmtSize(f.size)} · {fmtDate(f.date)}{f.owner ? ` · ${f.owner}` : ''}</span>
			</span>
		</button>
		<button class="row-btn" title="Download" aria-label="Download" onclick={() => download(f)}><Download size={16} /></button>
		<div class="file-actions">
			<button
				class="kebab"
				title="More"
				aria-label="More actions"
				onclick={(e) => {
					e.stopPropagation();
					menuId = menuId === `f:${f.id}` ? null : `f:${f.id}`;
				}}><MoreVertical size={17} /></button>
			{#if menuId === `f:${f.id}`}
				<div class="menu" role="menu">
					<button class="menu-item" onclick={(e) => { e.stopPropagation(); menuId = null; rename(f); }}><Pencil size={15} /> Rename</button>
					<button class="menu-item menu-item--danger" onclick={(e) => { e.stopPropagation(); menuId = null; deleting = f; }}><Trash2 size={15} /> Delete</button>
				</div>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet folderSkeletons()}
	<div class="folder-grid">
		{#each Array(4) as _}
			<div class="card folder-card"><Skeleton h="19px" w="19px" radius="6px" /><Skeleton h="0.9rem" w="60%" /></div>
		{/each}
	</div>
{/snippet}

{#snippet fileSkeletons()}
	<div class="file-list">
		{#each Array(3) as _}
			<div class="card file-row"><Skeleton h="18px" w="18px" radius="6px" /><div style="flex:1"><Skeleton h="0.9rem" w="45%" /></div></div>
		{/each}
	</div>
{/snippet}

{#if loading}
	{@render folderSkeletons()}
	{@render fileSkeletons()}
{:else if currentId}
	<!-- Inside a folder: all children folders + all files, regardless of owner.
	     Drop zone for desktop drag-and-drop upload. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="drop-zone"
		class:drag-active={dragActive}
		role="region"
		aria-label="Drop files here to upload"
		ondragover={(e) => {
			if (!e.dataTransfer.types.includes('Files')) return; // internal move, not an OS file
			e.preventDefault();
			dragActive = true;
		}}
		ondragleave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) dragActive = false; }}
		ondrop={onDrop}
	>
		{#if children.length}
			<div class="folder-grid">
				{#each children as f, i (f.id)}{@render folderCard(f, i)}{/each}
			</div>
		{/if}
		{#if filesLoading}
			{@render fileSkeletons()}
		{:else if files.length}
			<div class="file-list">
				{#each files as f (f.id)}{@render fileRow(f)}{/each}
			</div>
		{:else if !children.length}
			<p class="muted">Empty folder — upload or drag files here (max 25MB per file).</p>
		{/if}
		{#if dragActive}<div class="drop-overlay">Drop to upload</div>{/if}
	</div>
{:else}
	<!-- Root: My Drive (mine, private by default) + Shared with me -->
	<div class="section-title"><Folder size={15} /> My Drive</div>
	{#if myFolders.length}
		<div class="folder-grid">
			{#each myFolders as f, i (f.id)}{@render folderCard(f, i)}{/each}
		</div>
	{/if}
	{#if filesLoading}
		{@render fileSkeletons()}
	{:else if files.length}
		<div class="file-list">
			{#each files as f (f.id)}{@render fileRow(f)}{/each}
		</div>
	{/if}
	{#if !myFolders.length && !files.length}
		<p class="muted">Empty — create a folder or add files.</p>
	{/if}

	{#if sharedFolders.length}
		<div class="section-title"><LockOpen size={15} /> Shared with me</div>
		<div class="folder-grid">
			{#each sharedFolders as f, i (f.id)}{@render folderCard(f, i)}{/each}
		</div>
	{/if}
{/if}

<svelte:window
	onkeydown={(e) => e.key === 'Escape' && (menuId = null)}
	onclick={() => (menuId = null)}
/>

<Modal bind:open={() => !!renaming, (v) => { if (!v) renaming = null; }} title="Rename">
	<!-- svelte-ignore a11y_autofocus -->
	<input
		class="input"
		value={renameValue}
		oninput={(e) => (renameValue = e.currentTarget.value)}
		autofocus
		onkeydown={(e) => e.key === 'Enter' && submitRename()}
	/>
	<div class="modal-actions">
		<button class="btn btn--secondary" onclick={() => (renaming = null)}>Cancel</button>
		<button class="btn btn--primary" disabled={renameSaving || !renameValue.trim()} onclick={submitRename}>
			{renameSaving ? 'Saving…' : 'Save'}
		</button>
	</div>
</Modal>

<Modal bind:open={() => !!deleting, (v) => { if (!v) deleting = null; }} title="Delete file">
	<p>Delete <strong>{deleting?.name}</strong>?</p>
	<div class="modal-actions">
		<button class="btn btn--secondary" onclick={() => (deleting = null)}>Cancel</button>
		<button class="btn btn--danger" onclick={archive}>Delete</button>
	</div>
</Modal>

<FileViewer
	bind:file={viewerFile}
	href="/api/documents/{viewerFile?.id}"
	downloadHref="/api/documents/{viewerFile?.id}?download"
/>

<style>
	.drop-zone {
		position: relative;
		border: 2px dashed transparent;
		border-radius: var(--radius-lg, 12px);
		transition: border-color 0.15s, background 0.15s;
		min-height: 120px;
	}
	.drop-zone.drag-active {
		border-color: var(--accent);
		background: var(--accent-soft, rgba(120, 120, 255, 0.08));
	}
	.drop-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		color: var(--accent);
		background: var(--accent-soft, rgba(120, 120, 255, 0.12));
		border-radius: var(--radius-lg, 12px);
		pointer-events: none;
	}
	/* Drag a file onto a folder / breadcrumb to move it there */
	.file-row[draggable='true'] {
		cursor: grab;
	}
	.file-row.dragging {
		opacity: 0.4;
	}
	.folder-card.drop-target {
		border-color: var(--accent);
		background: var(--accent-soft, rgba(120, 120, 255, 0.12));
		box-shadow: 0 0 0 2px var(--accent) inset;
	}
	.crumb.crumb-drop {
		background: var(--accent);
		color: var(--on-accent, #fff);
		border-radius: var(--radius-sm, 6px);
	}
	.head-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: var(--space-2) 0 var(--space-4);
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.actions {
		display: flex;
		gap: var(--space-2);
	}
	.upload-btn {
		cursor: pointer;
	}
	.crumbs {
		display: flex;
		align-items: center;
		gap: 2px;
		flex-wrap: wrap;
		margin: var(--space-3) 0 var(--space-5);
	}
	.crumb {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		background: none;
		border: none;
		color: var(--text-dim);
		font-weight: 550;
		font-size: var(--fs-sm);
		padding: 5px 9px;
		border-radius: 6px;
		cursor: pointer;
	}
	.crumb:hover,
	.crumb.current {
		color: var(--text);
		background: var(--surface-2);
	}
	.sep {
		color: var(--text-faint);
	}
	.folder-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: var(--space-2);
		margin-bottom: var(--space-5);
	}
	.folder-card {
		position: relative;
		display: flex;
		align-items: center;
		padding: var(--space-3);
	}
	.folder-card.menu-open {
		z-index: 30; /* lift above sibling grid cards so the menu isn't covered */
	}
	.folder-main {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		min-width: 0;
		padding-right: 28px; /* room for the top-right kebab */
		font-weight: 550;
		font-size: var(--fs-sm);
		color: var(--text);
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
	}
	.folder-main :global(.folder-ic) {
		color: var(--accent);
	}
	.folder-main :global(.shared-badge) {
		color: var(--text-faint);
	}
	.folder-actions {
		position: absolute;
		top: 6px;
		right: 6px;
	}
	.kebab {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 6px;
		color: var(--text-dim);
	}
	.kebab:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	.menu {
		position: absolute;
		top: 100%;
		right: 0;
		z-index: 20;
		display: flex;
		flex-direction: column;
		min-width: 160px;
		margin-top: 4px;
		padding: 4px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-lg);
	}
	.menu-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: 8px 10px;
		border: none;
		border-radius: 6px;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: var(--fs-sm);
		text-align: left;
		cursor: pointer;
	}
	.menu-item :global(svg) {
		color: var(--text-dim);
	}
	.menu-item:hover {
		background: var(--surface-2);
	}
	.menu-item--danger,
	.menu-item--danger :global(svg) {
		color: var(--red);
	}
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}
	.folder-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}
	.file-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.file-row {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3);
	}
	.file-row.menu-open {
		z-index: 30; /* later flex siblings paint above earlier ones */
	}
	.file-actions {
		position: relative;
		flex-shrink: 0;
	}
	.file-main {
		display: flex;
		align-items: center;
		gap: var(--space-3);
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
	.file-ic {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		color: var(--text-dim);
	}
	.file-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.file-name {
		font-weight: 550;
		font-size: var(--fs-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.file-meta {
		font-size: var(--fs-xs);
		color: var(--text-dim);
	}
	.row-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		border-radius: var(--radius-sm);
		color: var(--text-dim);
		border: 1px solid transparent;
	}
	.row-btn:hover {
		background: var(--surface-2);
		border-color: var(--border);
		color: var(--text);
	}
</style>
