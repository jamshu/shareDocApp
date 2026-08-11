// Binary helpers for file uploads. Workers-safe (btoa/atob, no Buffer).

// ArrayBuffer -> base64 for Odoo's `datas`. Chunked: String.fromCharCode on the
// whole array blows the call-stack limit for large files.
export function bufToB64(buf) {
	const bytes = new Uint8Array(buf);
	let bin = '';
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(bin);
}

const MIME_EXT = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/heic': 'heic',
	'application/pdf': 'pdf',
	'text/plain': 'txt',
	'text/csv': 'csv',
	'application/zip': 'zip',
	'audio/mpeg': 'mp3',
	'audio/mp4': 'm4a',
	'video/mp4': 'mp4',
	'application/msword': 'doc',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/vnd.ms-excel': 'xls',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
};

// Extension for a fallback filename when the upload carries no name. Falls back
// to the subtype (e.g. 'application/foo' -> 'foo') or 'bin'.
export function extFromMime(mime) {
	const m = String(mime || '').split(';')[0].trim().toLowerCase();
	return MIME_EXT[m] || m.split('/')[1] || 'bin';
}
