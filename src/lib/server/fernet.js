// Fernet (AES-128-CBC + HMAC-SHA256) via WebCrypto — byte-compatible with Python
// cryptography.fernet as used by the osecret CLI. Key = base64url(sha256(rawKey)).
// Token: 0x80 | ts(8, BE) | iv(16) | ciphertext | hmac(32), base64url.
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64uEncode = (bytes) =>
	btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
const b64uDecode = (s) =>
	Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function keys(rawKey) {
	const k = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(rawKey)));
	const [sign, aes] = await Promise.all([
		crypto.subtle.importKey('raw', k.slice(0, 16), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']),
		crypto.subtle.importKey('raw', k.slice(16), 'AES-CBC', false, ['encrypt', 'decrypt'])
	]);
	return { sign, aes };
}

export async function encrypt(text, rawKey) {
	const { sign, aes } = await keys(rawKey);
	const iv = crypto.getRandomValues(new Uint8Array(16));
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aes, enc.encode(text)));
	const body = new Uint8Array(25 + ct.length);
	body[0] = 0x80;
	new DataView(body.buffer).setBigUint64(1, BigInt(Math.floor(Date.now() / 1000)));
	body.set(iv, 9);
	body.set(ct, 25);
	const mac = new Uint8Array(await crypto.subtle.sign('HMAC', sign, body));
	const out = new Uint8Array(body.length + 32);
	out.set(body);
	out.set(mac, body.length);
	return b64uEncode(out);
}

export async function decrypt(token, rawKey) {
	const { sign, aes } = await keys(rawKey);
	const data = b64uDecode(String(token));
	if (data.length < 57 || data[0] !== 0x80) throw new Error('Invalid token');
	const body = data.slice(0, -32);
	if (!(await crypto.subtle.verify('HMAC', sign, data.slice(-32), body))) throw new Error('Invalid token');
	const pt = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: body.slice(9, 25) }, aes, body.slice(25));
	return dec.decode(pt);
}
