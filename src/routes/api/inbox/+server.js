// iPhone / Siri Shortcut upload target. The Shortcut's "Get Contents of URL"
// (method POST, Request Body = File) sends the raw file bytes as the body with
// NO session cookie, so auth is a per-user bearer token in the query string:
//   POST /api/inbox?token=<uuid>&name=<filename>   body: raw file bytes
// The file is stored in the user's private "Inbox" folder (created by the app's
// /api/inbox/link endpoint under the user's own session, so create_uid = user).
import { json } from '@sveltejs/kit';
import { assertConfigured, adminExecute } from '$lib/server/odoo.js';
import { requireTokenUser } from '$lib/server/auth.js';
import { bufToB64, extFromMime } from '$lib/server/bytes.js';

export const prerender = false;

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST({ request, url }) {
	try {
		assertConfigured();
		const token =
			url.searchParams.get('token') ||
			(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
		const { uid } = await requireTokenUser(token);

		const buf = await request.arrayBuffer();
		if (!buf.byteLength) return json({ ok: false, error: 'Empty upload' }, { status: 400 });
		if (buf.byteLength > MAX_BYTES) {
			return json({ ok: false, error: 'File too large (max 25MB)' }, { status: 413 });
		}

		const mimetype = (request.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
		const name = url.searchParams.get('name')?.trim() || `inbox-${Date.now()}.${extFromMime(mimetype)}`;

		// The Inbox folder is created by /api/inbox/link (user session) so it's owned
		// by the user and shows in their My Drive. If it's missing the user hasn't
		// opened the app to set up their shortcut yet.
		const folders = await adminExecute('documents.document', 'search', [
			[['type', '=', 'folder'], ['name', '=', 'Inbox'], ['create_uid', '=', uid], ['active', '=', true]]
		]);
		if (!folders.length) {
			return json(
				{ ok: false, error: 'Open the app once (Account → upload shortcut) to set up your inbox' },
				{ status: 409 }
			);
		}

		// owner_id = uid so Odoo's owner record-rule lets the user read the file even
		// though it's created with the admin key.
		const id = await adminExecute('documents.document', 'create', [{
			name,
			type: 'binary',
			folder_id: folders[0],
			mimetype,
			datas: bufToB64(buf),
			owner_id: uid
		}]);

		return json({ ok: true, id, name });
	} catch (e) {
		return json({ ok: false, error: e?.message || 'Upload failed' }, { status: e?.status || 500 });
	}
}
