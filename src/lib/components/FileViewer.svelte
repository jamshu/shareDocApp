<script>
	import Modal from './Modal.svelte';
	import { Download } from 'lucide-svelte';
	import { downloadFile } from '$lib/download.js';
	import { toast } from '$lib/toast.js';
	import * as pdfjsLib from 'pdfjs-dist';

	// import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

	// Remove this line:
// import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Replace with CDN matching your pdfjs-dist version (e.g., version 4.x or 3.x):
	pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

	let { file = $bindable(null), href = '', downloadHref = '' } = $props();
	let canvasEl = $state(null);
	let pdfError = $state('');

	async function save() {
		try {
			await downloadFile(downloadHref, file.name);
		} catch (e) {
			toast.error(e.message);
		}
	}

	// Renders page 1 onto a canvas instead of embedding an iframe. A native
	// PDF viewer in an iframe is its own document — CSS on the iframe box
	// can't reach the page rendering inside it, which is why it ignored the
	// container and showed at native zoom. A canvas is a replaced element
	// like img, so it picks up img.body's object-fit: contain for free.
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

			// Store the loading task reference so we can destroy it on cleanup
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
		// Destroy the loading task if component unmounts or effect reruns
		loadingTask?.destroy();
	};

});
</script>
<Modal bind:open={() => !!file, (v) => { if (!v) file = null; }} fullscreen>
	{#snippet header()}
		<span class="name">{file?.name}</span>
		<button class="btn btn--sm btn--secondary" onclick={save}><Download size={15} /> Download</button>
	{/snippet}
	<div class="viewport">
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
	/* fills the remaining modal space and centers the phone box inside it.
	   align-items: stretch (not center) — a flex item only gets stretched
	   when its cross-size is auto; .phone previously set an explicit
	   height:100%, which opted out of stretch and relied on percentage
	   resolution instead, which was coming up short on iPhone even after
	   width was already correct.
	   max-height is a real-viewport cap: iOS Safari's 100vh is measured with
	   the address bar hidden, taller than what's visible once it's showing;
	   svh always reflects the true visible area. */
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
	/* locks a portrait phone ratio (~9:19.5, roughly iPhone Pro Max) as a
	   simulated frame on larger screens. height:auto (was 100%) lets the
	   align-items:stretch above size this box from real flex layout instead
	   of percentage resolution; max-height still caps it at phone size. */
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
	/* real phone screens: nothing to simulate, so fill the actual available
	   width rather than deriving a narrower one from aspect-ratio. Height
	   still comes from stretch above — only the width formula changes here. */
	@media (max-width: 430px) {
		.phone {
			width: 100%;
			max-width: 100%;
			aspect-ratio: auto;
		}
	}
	/* fit to the phone box in both directions: width:100% would upscale small
	   images, and on a tall one it forces the box wide so max-height squashes it.
	   min-width/min-height: 0 override the flex-item default (min-width: auto),
	   which for a replaced element resolves to its *intrinsic* size — without
	   this, a high-res image forces the flex container (and modal) to grow. */
	img.body {
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
	/* object-fit does nothing on an iframe — it just fills the flex area.
	   Same min-size trap applies: without min-height: 0 a large PDF's
	   rendered content can push the iframe (and its ancestors) taller. */
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
	.none {
		margin: auto;
		padding: var(--space-8);
		color: #fff;
	}
	
</style>