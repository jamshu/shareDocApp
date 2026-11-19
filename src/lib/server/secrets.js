// Secrets vault: the osecret `x_secrets` model on a SEPARATE Odoo DB, accessed with
// its own API key. Values are Fernet-encrypted (see fernet.js) before they reach
// Odoo and decrypted only when one is explicitly requested.
import { env } from '$env/dynamic/private';
import { encrypt, decrypt } from './fernet.js';

const MODEL = 'x_secrets';
const TAG_MODEL = 'x_secrets_tag';

export function assertSecretsConfigured() {
	if (!env.SECRETS_ODOO_URL || !env.SECRETS_ODOO_DB || !env.SECRETS_ODOO_USERNAME ||
		!env.SECRETS_ODOO_API_KEY || !env.SECRETS_ENCRYPTION_KEY) {
		throw new Error(
			'Secrets vault is not configured. Set SECRETS_ODOO_URL, SECRETS_ODOO_DB, SECRETS_ODOO_USERNAME, SECRETS_ODOO_API_KEY, SECRETS_ENCRYPTION_KEY.'
		);
	}
}

async function service(serviceName, method, args) {
	const res = await fetch(`${env.SECRETS_ODOO_URL.replace(/\/$/, '')}/jsonrpc`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			method: 'call',
			params: { service: serviceName, method, args },
			id: Date.now()
		})
	});
	const data = await res.json();
	if (data.error) throw new Error(data.error.data?.message || data.error.message || 'Odoo error');
	return data.result;
}

let uid = null;

async function execute(model, method, args = [], kwargs = {}) {
	if (!uid) {
		uid = await service('common', 'login', [env.SECRETS_ODOO_DB, env.SECRETS_ODOO_USERNAME, env.SECRETS_ODOO_API_KEY]);
		if (!uid) throw new Error('Secrets vault authentication failed');
	}
	return service('object', 'execute_kw', [
		env.SECRETS_ODOO_DB, uid, env.SECRETS_ODOO_API_KEY, model, method, args, kwargs
	]);
}

const key = () => env.SECRETS_ENCRYPTION_KEY;

/** All secrets as { id, name, tags[] } — never the values. */
export async function listSecrets() {
	const rows = await execute(MODEL, 'search_read', [[]], { fields: ['x_name', 'x_studio_tag_ids'] });
	const tagIds = [...new Set(rows.flatMap((r) => r.x_studio_tag_ids || []))];
	const tags = tagIds.length ? await execute(TAG_MODEL, 'read', [tagIds], { fields: ['x_name'] }) : [];
	const tagName = Object.fromEntries(tags.map((t) => [t.id, t.x_name]));
	const out = [];
	for (const r of rows) {
		let name = r.x_name || '';
		// legacy osecret rows stored the description encrypted too
		if (name.startsWith('gAAAAA')) {
			try { name = await decrypt(name, key()); } catch { /* leave as-is */ }
		}
		out.push({ id: r.id, name, tags: (r.x_studio_tag_ids || []).map((id) => tagName[id]).filter(Boolean) });
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSecretValue(id) {
	const [r] = await execute(MODEL, 'read', [[id]], { fields: ['x_studio_secret'] });
	if (!r) { const e = new Error('Secret not found'); e.status = 404; throw e; }
	return decrypt(r.x_studio_secret, key());
}

export async function storeSecret(name, value, tagNames = []) {
	const names = tagNames.length ? tagNames : ['uncategorized'];
	const tagIds = [];
	for (const n of names) {
		const [found] = await execute(TAG_MODEL, 'search', [[['x_name', '=', n]]], { limit: 1 });
		tagIds.push(found ?? (await execute(TAG_MODEL, 'create', [{ x_name: n }])));
	}
	return execute(MODEL, 'create', [{
		x_name: name,
		x_studio_secret: await encrypt(value, key()),
		x_studio_tag_ids: [[6, 0, tagIds]]
	}]);
}

export async function deleteSecret(id) {
	return execute(MODEL, 'unlink', [[id]]);
}
