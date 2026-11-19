// Secrets vault (osecret x_secrets on a separate Odoo DB). Docs-company users only.
//   GET                          -> { ok, secrets: [{ id, name, tags }] }   (no values)
//   POST { name, value, tags[] } -> { ok, id }
import { json } from '@sveltejs/kit';
import { requireDocsUser } from '$lib/server/auth.js';
import { clearSessionCookie } from '$lib/server/session.js';
import { assertSecretsConfigured, listSecrets, storeSecret } from '$lib/server/secrets.js';

export const prerender = false;

export async function GET({ cookies }) {
	try {
		assertSecretsConfigured();
		await requireDocsUser(cookies);
		return json({ ok: true, secrets: await listSecrets() });
	} catch (e) {
		if (e?.status === 401) clearSessionCookie(cookies);
		return json({ ok: false, error: e?.message || 'Failed' }, { status: e?.status || 500 });
	}
}

export async function POST({ request, cookies }) {
	try {
		assertSecretsConfigured();
		await requireDocsUser(cookies);
		const { name, value, tags } = await request.json();
		if (!name?.trim() || !value) return json({ ok: false, error: 'name and value required' }, { status: 400 });
		const tagNames = (Array.isArray(tags) ? tags : []).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
		const id = await storeSecret(name.trim(), String(value), tagNames);
		return json({ ok: true, id });
	} catch (e) {
		if (e?.status === 401) clearSessionCookie(cookies);
		return json({ ok: false, error: e?.message || 'Failed' }, { status: e?.status || 500 });
	}
}
