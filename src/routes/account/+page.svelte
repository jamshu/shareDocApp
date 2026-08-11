<script>
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { user } from '$lib/auth.js';
	import { unsubscribePush } from '$lib/push.js';
	import { toast } from '$lib/toast.js';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import { TriangleAlert, Building2, Mail, Smartphone, Copy } from 'lucide-svelte';

	let password = $state('');
	let busy = $state(false);
	let error = $state('');

	// iPhone/Siri upload shortcut URL (token in the query string).
	let uploadUrl = $state('');
	let linkLoading = $state(true);
	let linkErr = $state('');

	onMount(async () => {
		try {
			const d = await (await fetch(`${base}/api/inbox/link`)).json();
			if (!d.ok) throw new Error(d.error);
			uploadUrl = d.url;
		} catch (e) {
			linkErr = e.message;
		} finally {
			linkLoading = false;
		}
	});

	async function copyUrl() {
		try {
			await navigator.clipboard.writeText(uploadUrl);
			toast.success('Copied');
		} catch {
			toast.error('Copy failed — long-press to select');
		}
	}

	async function regenerate() {
		try {
			const d = await (
				await fetch(`${base}/api/inbox/link`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ rotate: true })
				})
			).json();
			if (!d.ok) throw new Error(d.error);
			uploadUrl = d.url;
			toast.success('New link generated — old one revoked');
		} catch (e) {
			toast.error(e.message);
		}
	}

	async function deleteAccount() {
		if (!password) {
			error = 'Enter your password to confirm.';
			return;
		}
		busy = true;
		error = '';
		try {
			// drop this device's push subscription while the session still works —
			// it survives page reloads and would hide the bell for the next account
			await unsubscribePush().catch(() => {});
			const res = await fetch(`${base}/api/account`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password })
			});
			const d = await res.json();
			if (!d.ok) throw new Error(d.error);
			// full reload clears all client state and lands on login
			location.href = `${base}/login`;
		} catch (e) {
			error = e.message;
			busy = false;
		}
	}
</script>

<div class="head-row">
	<h1>Account</h1>
</div>

<div class="card info-card">
	<div class="avatar">{($user?.name || '?').trim().charAt(0).toUpperCase()}</div>
	<div class="info-lines">
		<strong>{$user?.name}</strong>
		<div class="info-line"><Mail size={14} /> {$user?.email}</div>
		<div class="info-line">
			<Building2 size={14} /> {$user?.companyName}
			<span class="chip chip--accent">{$user?.role === 'admin' ? 'admin' : 'member'}</span>
		</div>
	</div>
</div>

<div class="section-title"><Smartphone size={15} /> iPhone upload shortcut</div>
<div class="card shortcut-card">
	<p class="muted" style="margin:0 0 12px;">
		Upload any file straight to your <strong>Inbox</strong> folder from iPhone. In the Shortcuts
		app: <em>Select File</em> → <em>Get Contents of URL</em> (Method <strong>POST</strong>, Request
		Body → <strong>File</strong>). Use this URL — add <code>&amp;name=</code> then the file's
		<em>Name</em> variable to keep the real filename.
	</p>
	{#if linkLoading}
		<p class="muted">Loading…</p>
	{:else if linkErr}
		<p class="error-text">{linkErr}</p>
	{:else}
		<input
			class="input"
			readonly
			value={uploadUrl}
			onclick={(e) => e.currentTarget.select()}
			aria-label="Upload shortcut URL"
		/>
		<div class="row">
			<button class="btn btn--secondary" onclick={copyUrl}><Copy size={15} /> Copy</button>
			<ConfirmButton
				label="Regenerate"
				confirmLabel="Revoke old link & make new?"
				onconfirm={regenerate}
			/>
		</div>
	{/if}
</div>

<div class="section-title"><TriangleAlert size={15} /> Danger zone</div>
<div class="card danger-card">
	<p class="muted" style="margin:0 0 12px;">
		Deleting your account is permanent. Your notes, the comments on them, your comments on other
		notes, and your groups are all deleted and cannot be recovered.
	</p>
	<input
		class="input"
		type="password"
		placeholder="Confirm with your password"
		bind:value={password}
		autocomplete="current-password"
	/>
	{#if error}<p class="error-text">{error}</p>{/if}
	<div class="row">
		<ConfirmButton
			label={busy ? 'Deleting…' : 'Delete my account'}
			confirmLabel="Permanently delete everything?"
			onconfirm={deleteAccount}
		/>
	</div>
</div>

<style>
	.head-row {
		margin: var(--space-2) 0 var(--space-4);
	}
	.info-card {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-4);
	}
	.avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		flex-shrink: 0;
		border-radius: 50%;
		background: var(--accent);
		color: var(--on-accent);
		font-size: 1.2rem;
		font-weight: 650;
	}
	.info-lines {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
	}
	.info-lines strong {
		font-size: var(--fs-lg);
	}
	.info-line {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: var(--fs-sm);
		color: var(--text-dim);
	}
	.info-line :global(svg) {
		color: var(--text-faint);
	}
	.danger-card {
		padding: var(--space-4);
		border-color: color-mix(in srgb, var(--red) 40%, var(--border));
		background: color-mix(in srgb, var(--red) 4%, var(--surface));
	}
	.row {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.shortcut-card {
		padding: var(--space-4);
	}
	.shortcut-card code {
		font-family: var(--font-mono, monospace);
		font-size: 0.85em;
	}
</style>
