// Cookie-authed companion to /api/inbox: returns (and can rotate) the user's
// upload-shortcut URL, and lazily creates their private "Inbox" folder under
// their own session so create_uid = user (the token endpoint then drops files
// into it as admin).
//   GET                    -> { ok, url, token }
//   POST { rotate: true }  -> { ok, url, token }   (revokes the old token)
import { json } from '@sveltejs/kit';
import { assertConfigured, sessionCallKw, adminExecute } from '$lib/server/odoo.js';
import { requireDocsUser } from '$lib/server/auth.js';
import { clearSessionCookie, refreshSessionCookie } from '$lib/server/session.js';

export const prerender = false;

async function userCall(cookies, sid, ctx, model, method, args, kwargs = {}) {
	const { orgRole, orgStatus, ...odooCtx } = ctx;
	const { result, sessionId } = await sessionCallKw(sid, model, method, args, { ...kwargs, context: odooCtx });
	refreshSessionCookie(cookies, sessionId, sid);
	return result;
}

async function ensureInboxFolder(cookies, sid, ctx, uid) {
	const found = await userCall(cookies, sid, ctx, 'documents.document', 'search', [
		[['type', '=', 'folder'], ['name', '=', 'Inbox'], ['create_uid', '=', uid], ['active', '=', true]]
	]);
	if (found.length) return found[0];
	return userCall(cookies, sid, ctx, 'documents.document', 'create', [{
		name: 'Inbox',
		type: 'folder',
		access_internal: 'none' // private My Drive folder
	}]);
}

async function getToken(uid) {
	const [u] = await adminExecute('res.users', 'read', [[uid], ['x_studio_upload_token']]);
	return u?.x_studio_upload_token || null;
}

async function setToken(uid) {
	const token = crypto.randomUUID();
	await adminExecute('res.users', 'write', [[uid], { x_studio_upload_token: token }]);
	return token;
}

const buildUrl = (origin, token) => `${origin}/api/inbox?token=${token}`;

export async function GET({ cookies, url }) {
	try {
		assertConfigured();
		const { uid, sid, ctx } = await requireDocsUser(cookies);
		await ensureInboxFolder(cookies, sid, ctx, uid);
		const token = (await getToken(uid)) || (await setToken(uid));
		return json({ ok: true, url: buildUrl(url.origin, token), token });
	} catch (e) {
		if (e?.status === 401) clearSessionCookie(cookies);
		return json({ ok: false, error: e?.message || 'Failed' }, { status: e?.status || 500 });
	}
}

export async function POST({ cookies, url, request }) {
	try {
		assertConfigured();
		const { uid, sid, ctx } = await requireDocsUser(cookies);
		const body = await request.json().catch(() => ({}));
		if (!body?.rotate) return json({ ok: false, error: 'Nothing to do' }, { status: 400 });
		await ensureInboxFolder(cookies, sid, ctx, uid);
		const token = await setToken(uid);
		return json({ ok: true, url: buildUrl(url.origin, token), token });
	} catch (e) {
		if (e?.status === 401) clearSessionCookie(cookies);
		return json({ ok: false, error: e?.message || 'Failed' }, { status: e?.status || 500 });
	}
}
