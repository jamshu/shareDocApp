<script>
	import Modal from './Modal.svelte';
	import { Download } from 'lucide-svelte';
	import { downloadFile } from '$lib/download.js';
	import { toast } from '$lib/toast.js';
	import * as pdfjsLib from 'pdfjs-dist';

	pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

	let { file = $bindable(null), href = '', downloadHref = '' } = $props();
	let canvasEl = $state(null);
	let pdfError = $state('');

	// JSON state
	let jsonContent = $state('');
	let jsonError = $state('');

	async function save() {
		try {
			await downloadFile(downloadHref, file.name);
		} catch (e) {
			toast.error(e.message);
		}
	}

	// PDF Render Effect
	$effect(() => {
		if (file?.mimetype !== 'application/pdf' || !href || !canvasEl) return;
		pdfError = '';
		let cancelled = false;
		let loadingTask;

		(async () => {
			try {
				const response = await fetch(href, { credentials: 'include' });
				if (!response.ok) {
					throw new Error(`Failed to fetch file: ${response.statusText}`);
				}
				const data = await response.arrayBuffer();
				if (cancelled) return;

				loadingTask = pdfjsLib.getDocument({
					data,
					standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`
				});

				const pdfDoc = await loadingTask.promise;
				if (cancelled) return;

				const page = await pdfDoc.getPage(1);
				if (cancelled) return;

				const scale = Math.max(2, window.devicePixelRatio || 1);
				const viewport = page.getViewport({ scale });

				canvasEl.width = viewport.width;
				canvasEl.height = viewport.height;

				await page.render({
					canvasContext: canvasEl.getContext('2d'),
					viewport
				}).promise;
			} catch (e) {
				console.error('PDF.js Error:', e);
				if (!cancelled) pdfError = e.message;
			}
		})();

		return () => {
			cancelled = true;
			loadingTask?.destroy();
		};
	});

	// JSON Fetch and Format Effect
	$effect(() => {
		const isJson = file?.mimetype === 'application/json' || file?.name?.endsWith('.json');
		if (!isJson || !href) return;

		jsonError = '';
		jsonContent = '';
		let cancelled = false;

		(async () => {
			try {
				const res = await fetch(href, { credentials: 'include' });
				if (!res.ok) throw new Error(`Failed to fetch JSON: ${res.statusText}`);

				const rawData = await res.json();
				if (cancelled) return;

				jsonContent = JSON.stringify(rawData, null, 2);
			} catch (e) {
				console.error('JSON Preview Error:', e);
				if (!cancelled) jsonError = e.message;
			}
		})();

		return () => {
			cancelled = true;
		};
	});
</script>

<Modal bind:open={() => !!file, (v) => { if (!v) file = null; }} fullscreen>
	{#snippet header()}
		<span class="name">{file?.name}</span>
		<button class="btn btn--sm btn--secondary" onclick={save}><Download size={15} /> Download</button>
	{/snippet}
	<div class="viewport">
		{#if file?.mimetype === 'application/json' || file?.name?.endsWith('.json')}
			<div class="json-wrapper">
				{#if jsonError}
					<p class="none">Couldn't preview JSON — use Download.</p>
				{:else if jsonContent}
					<div class="json-container">
						<pre><code>{jsonContent}</code></pre>
					</div>
				{:else}
					<p class="none">Loading JSON...</p>
				{/if}
			</div>
		{:else}
			<div class="phone">
				{#if file?.mimetype?.startsWith('image/')}
					<img class="body" src={href} alt={file.name} />
				{:else if file?.mimetype === 'application/pdf'}
					{#if pdfError}
						<p class="none">Couldn't preview this PDF — use Download.</p>
					{:else}
						<canvas class="body" bind:this={canvasEl}></canvas>
					{/if}
				{:else}
					<p class="none">No preview available — use Download.</p>
				{/if}
			</div>
		{/if}
	</div>
</Modal>

<style>
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--fs-md);
		font-weight: 600;
	}

	.viewport {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		align-items: stretch;
		justify-content: center;
		overflow: hidden;
		padding-top: var(--space-2);
		max-height: 100vh;
		max-height: 100svh;
	}

	.phone {
		height: auto;
		min-height: 0;
		max-height: 932px;
		max-height: min(932px, 100svh);
		width: auto;
		max-width: min(430px, 100%);
		aspect-ratio: 9 / 19.5;
		display: flex;
		overflow: hidden;
	}

	@media (max-width: 430px) {
		.phone {
			width: 100%;
			max-width: 100%;
			aspect-ratio: auto;
		}
	}

	img.body,
	canvas.body {
		flex: 1;
		min-width: 0;
		min-height: 0;
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		object-fit: contain;
		display: block;
		margin: auto;
	}

	/* Wide JSON Container Styles */
	.json-wrapper {
		width: 100%;
		max-width: 900px;
		height: 100%;
		display: flex;
		padding: var(--space-2, 0.5rem);
		box-sizing: border-box;
	}

	.json-container {
		flex: 1;
		width: 100%;
		height: 100%;
		overflow: auto;
		padding: var(--space-4, 1rem);
		background: #111827;
		color: #38bdf8;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.875rem;
		line-height: 1.5;
		text-align: left;
		border-radius: 8px;
		box-sizing: border-box;
	}

	.json-container pre {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.none {
		margin: auto;
		padding: var(--space-8);
		color: #fff;
	}
</style>