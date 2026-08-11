// Android Web Share Target receiver (manifest share_target.action = /api/share).
// The OS share sheet (e.g. WhatsApp) POSTs a multipart form here as a top-level
// navigation, so the SameSite=Lax session cookie rides along. Files land in the
// user's My Drive root (folder_id = false); we then redirect to /docs.
// iOS Safari does not support share_target, so this is Android-only in practice.
import { redirect } from '@sveltejs/kit';
import { assertConfigured, sessionCallKw } from '$lib/server/odoo.js';
import { requireDocsUser } from '$lib/server/auth.js';
import { clearSessionCookie, refreshSessionCookie } from '$lib/server/session.js';
import { bufToB64 } from '$lib/server/bytes.js';

export const prerender = false;

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST({ request, cookies }) {
	try {
		assertConfigured();
		const { sid, ctx } = await requireDocsUser(cookies);
		const { orgRole, orgStatus, ...odooCtx } = ctx;

		const form = await request.formData();
		const files = form.getAll('files').filter((f) => typeof f !== 'string' && f.size > 0);
		if (!files.length) throw redirect(303, '/docs');

		for (const file of files) {
			if (file.size > MAX_BYTES) continue; // skip oversized, keep the rest
			const dataBase64 = bufToB64(await file.arrayBuffer());
			const { sessionId } = await sessionCallKw(
				sid,
				'documents.document',
				'create',
				[{
					name: file.name || 'shared-file',
					type: 'binary',
					folder_id: false, // My Drive root
					mimetype: file.type || 'application/octet-stream',
					datas: dataBase64
				}],
				{ context: odooCtx }
			);
			refreshSessionCookie(cookies, sessionId, sid);
		}

		throw redirect(303, '/docs');
	} catch (e) {
		if (e?.status === 303) throw e; // redirect is control flow, not an error
		if (e?.status === 401) clearSessionCookie(cookies);
		// Share sheet expects a navigation response — send the user to the app.
		throw redirect(303, '/docs');
	}
}
