// iOS standalone PWAs have no download manager — a plain <a download> navigates
// the app window with no way back. There: fetch the file and hand it to the
// share sheet (user picks "Save to Files"). Android PWAs and regular browsers
// get a normal object-URL download (Android WebAPKs have a real download manager).
export async function downloadFile(url, name) {
	const ios = 'standalone' in window.navigator; // property exists only on iOS WebKit
	const standalone =
		window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
	const res = await fetch(url);
	if (!res.ok) throw new Error('Download failed');
	const blob = await res.blob();
	if (ios && standalone && navigator.canShare) {
		const file = new File([blob], name || 'file', { type: blob.type });
		if (navigator.canShare({ files: [file] })) {
			try {
				await navigator.share({ files: [file] });
				return;
			} catch (e) {
				if (e.name === 'AbortError') return; // user closed the sheet
				// share failed (e.g. lost user-gesture window) — fall through to anchor
			}
		}
	}
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = name || 'file';
	a.click();
	URL.revokeObjectURL(a.href);
}
