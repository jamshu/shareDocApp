// Files inside an Odoo Documents folder.
//   GET  ?folderId=N                              -> { ok, files: [...] }
//   POST { folderId, name, mimetype, dataBase64 } -> { ok, id }
// Note: JSON body through Vercel serverless caps uploads around ~4MB.
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

export async function GET({ url, cookies }) {
	try {
		assertConfigured();
		const { sid, ctx } = await requireDocsUser(cookies);
		const folderId = Number(url.searchParams.get('folderId'));
		if (!folderId) return json({ ok: false, error: 'folderId required' }, { status: 400 });
		const rows = await userCall(cookies, sid, ctx, 'documents.document', 'search_read', [
			[['type', '=', 'binary'], ['folder_id', '=', folderId], ['active', '=', true]]
		], { fields: ['name', 'mimetype', 'file_size', 'create_date', 'owner_id'], order: 'name' });
		return json({
			ok: true,
			files: rows.map((r) => ({
				id: r.id,
				name: r.name,
				mimetype: r.mimetype,
				size: r.file_size,
				date: r.create_date,
				owner: r.owner_id?.[1] ?? null
			}))
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
		const { folderId, name, mimetype, dataBase64 } = await request.json();
		if (!folderId || !name || !dataBase64) {
			return json({ ok: false, error: 'folderId, name and dataBase64 required' }, { status: 400 });
		}
		// Verified on this instance (scripts/setup-odoo.js): documents.document
		// accepts base64 'datas' on create — unlike ir.attachment, where Odoo 19
		// silently drops it and 'raw' must be used.
		const id = await userCall(cookies, sid, ctx, 'documents.document', 'create', [{
			name,
			type: 'binary',
			folder_id: Number(folderId),
			mimetype: mimetype || 'application/octet-stream',
			datas: dataBase64
		}]);
		return json({ ok: true, id });
	} catch (e) {
		if (e?.status === 401) clearSessionCookie(cookies);
		return json({ ok: false, error: e?.message || 'Upload failed' }, { status: e?.status || 500 });
	}
}
