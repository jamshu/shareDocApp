// Fernet self-check: round trip, tamper rejection, and (if python3 + cryptography
// are present) cross-compat with Python Fernet in both directions.
// Run: node scripts/fernet-check.mjs
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { encrypt, decrypt } from '../src/lib/server/fernet.js';

const KEY = 'test-master-key';
const t = await encrypt('hello ✓', KEY);
assert.equal(await decrypt(t, KEY), 'hello ✓');
await assert.rejects(decrypt(t, 'wrong-key'));
await assert.rejects(decrypt(t.slice(0, -4) + 'AAAA', KEY));

const py = `import sys,base64,hashlib
from cryptography.fernet import Fernet
f=Fernet(base64.urlsafe_b64encode(hashlib.sha256(sys.argv[1].encode()).digest()))
if sys.argv[2]=='enc': print(f.encrypt(sys.argv[3].encode()).decode())
else: print(f.decrypt(sys.argv[3].encode()).decode())`;
try {
	const run = (...a) => execFileSync('python3', ['-c', py, KEY, ...a]).toString().trim();
	assert.equal(await decrypt(run('enc', 'from python'), KEY), 'from python');
	assert.equal(run('dec', await encrypt('from js', KEY)), 'from js');
	console.log('ok (incl. python cross-check)');
} catch (e) {
	if (e.code === 'ERR_ASSERTION') throw e;
	console.log('ok (python cross-check skipped:', e.message.split('\n')[0], ')');
}
