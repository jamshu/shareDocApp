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