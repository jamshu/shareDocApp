// Odoo Documents folders (Odoo 19: folders are documents.document rows with
// type='folder'). Flat list — the client builds the tree from folder_id.
//   GET                      -> { ok, folders: [{ id, name, parentId }] }
//   POST { name, parentId }  -> { ok, id }
import { json } from '@sveltejs/kit';
import { assertConfigured, sessionCallKw } from '$lib/server/odoo.js';
import { requireDocsUser } from '$lib/server/auth.js';
import { clearSessionCookie, refreshSessionCookie } from '$lib/server/session.js';

export const prerender = false;

async function userCall(cookies, sid, ctx, model, method, args, kwargs = {}) {
	const { orgRole, orgStatus, ...odooCtx } = ctx;
	const { result, sessionId } = await sessionCallKw(sid, model, method, args, {
		...kwargs,
		context: odooCtx
	});
	refreshSessionCookie(cookies, sessionId, sid);
	return result;
}

export async function GET({ cookies }) {
	try {
		assertConfigured();
		const { sid, ctx } = await requireDocsUser(cookies);
		const rows = await userCall(cookies, sid, ctx, 'documents.document', 'search_read', [
			[['type', '=', 'folder'], ['active', '=', true]]
		], { fields: ['name', 'folder_id'], order: 'name' });
		return json({
			ok: true,
			folders: rows.map((r) => ({ id: r.id, name: r.name, parentId: r.folder_id?.[0] ?? null }))
		});
	} catch (e) {
		if (e?.status === 401) clearSessionCookie(cookies);
		return json({ ok: false, error: e?.message || 'Failed' }, { status: e?.status || 500 });
	}
}

export async function POST({ request, cookies }) {
	try {
		assertConfigured();
		const { sid, ctx } = await requireDocsUser(cookies);
		const { name, parentId } = await request.json();
		if (!name?.trim()) return json({ ok: false, error: 'name required' }, { status: 400 });
		const id = await userCall(cookies, sid, ctx, 'documents.document', 'create', [{
			name: name.trim(),
			type: 'folder',
			folder_id: parentId ? Number(parentId) : false,
			access_internal: 'edit' // family vault: every internal user can see and add
		}]);
		return json({ ok: true, id });
	} catch (e) {
		if (e?.status === 401) clearSessionCookie(cookies);
		return json({ ok: false, error: e?.message || 'Failed' }, { status: e?.status || 500 });
	}
}
