// One secret: GET -> { ok, value } (decrypted, never cached) ; DELETE -> { ok }
import { json } from '@sveltejs/kit';
import { requireDocsUser } from '$lib/server/auth.js';
import { clearSessionCookie } from '$lib/server/session.js';
import { assertSecretsConfigured, getSecretValue, deleteSecret } from '$lib/server/secrets.js';

export const prerender = false;

function fail(cookies, e) {
	if (e?.status === 401) clearSessionCookie(cookies);
	return json({ ok: false, error: e?.message || 'Failed' }, { status: e?.status || 500 });
}

export async function GET({ params, cookies }) {
	try {
		assertSecretsConfigured();
		await requireDocsUser(cookies);
		const value = await getSecretValue(Number(params.id));
		return json({ ok: true, value }, { headers: { 'Cache-Control': 'no-store' } });
	} catch (e) {
		return fail(cookies, e);
	}
}

export async function DELETE({ params, cookies }) {
	try {
		assertSecretsConfigured();
		await requireDocsUser(cookies);
		await deleteSecret(Number(params.id));
		return json({ ok: true });
	} catch (e) {
		return fail(cookies, e);
	}
}
