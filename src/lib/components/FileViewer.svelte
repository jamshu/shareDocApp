<script>
	import Modal from './Modal.svelte';
	import { Download } from 'lucide-svelte';
	import { downloadFile } from '$lib/download.js';
	import { toast } from '$lib/toast.js';
	// file: { name, mimetype } — set to null to close. href/downloadHref are the
	// caller's api routes, since documents and attachments live behind different ones.
	let { file = $bindable(null), href = '', downloadHref = '' } = $props();
	async function save() {
		try {
			await downloadFile(downloadHref, file.name);
		} catch (e) {
			toast.error(e.message);
		}
	}
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
				<!-- ponytail: iOS iframe shows only page 1 of PDFs; Download covers the rest -->
				<iframe class="body" src={href} title={file.name}></iframe>
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
	/* fills the remaining modal space and centers the phone-shaped box inside it */
	.viewport {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}
	/* locks a portrait phone ratio (~9:19.5, roughly iPhone Pro Max) instead of
	   independently-capped max-width/max-height, which can resolve to a
	   landscape box when the available height is short (e.g. wide desktop window).
	   height drives the size (100% of .viewport, capped at 932px); width is
	   derived from the ratio and separately capped so it never overflows a
	   narrow screen. */
	.phone {
		height: 100%;
		max-height: 932px;
		width: auto;
		max-width: min(430px, 100%);
		aspect-ratio: 9 / 19.5;
		display: flex;
		overflow: hidden;
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
	iframe.body {
		flex: 1;
		min-width: 0;
		min-height: 0;
		width: 100%;
		border: none;
		background: #fff;
	}
	.none {
		margin: auto;
		padding: var(--space-8);
		color: #fff;
	}
</style>