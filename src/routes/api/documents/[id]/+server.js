// One document: download (inline or ?download) and archive.
//   GET    /api/documents/:id[?download]  -> file bytes
//   DELETE /api/documents/:id             -> { ok } (archive, never unlink)
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

export async function GET({ params, cookies, url }) {
	try {
		assertConfigured();
		const { sid, ctx } = await requireDocsUser(cookies);
		const rows = await userCall(cookies, sid, ctx, 'documents.document', 'read', [
			[Number(params.id)], ['name', 'mimetype', 'datas']
		]);
		const doc = rows?.[0];
		if (!doc?.datas) return new Response('Not found', { status: 404 });
		const bytes = Buffer.from(doc.datas, 'base64');
		const disp = url.searchParams.has('download') ? 'attachment' : 'inline';
		return new Response(bytes, {
			headers: {
				'Content-Type': doc.mimetype || 'application/octet-stream',
				'Content-Disposition': `${disp}; filename="${encodeURIComponent(doc.name || 'file')}"`,
				'Cache-Control': 'private, max-age=3600'
			}
		});
	} catch (e) {
		if (e?.status === 401) clearSessionCookie(cookies);
		return new Response(e?.message || 'Failed', { status: e?.status || 500 });
	}
}

export async function DELETE({ params, cookies }) {
	try {
		assertConfigured();
		const { sid, ctx } = await requireDocsUser(cookies);
		// Archive only — the vault holds family originals, hard delete stays in Odoo.
		await userCall(cookies, sid, ctx, 'documents.document', 'write', [
			[Number(params.id)], { active: false }
		]);
		return json({ ok: true });
	} catch (e) {
		if (e?.status === 401) clearSessionCookie(cookies);
		return json({ ok: false, error: e?.message || 'Failed' }, { status: e?.status || 500 });
	}
}
