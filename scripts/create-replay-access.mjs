// Generate initial dashboard credentials outside the repository. Never commit these files.
import { randomBytes, scryptSync } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
const directory = tmpdir();
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');
const file = resolve(directory, 'klem-visitor-access-' + Date.now() + '.txt');
await writeFile(file, `Klementina visitor dashboard\nURL: https://klem.co.il/visitors/\nPassword: ${password}\n\nPrivate Netlify environment variables (Functions scope):\nREPLAY_ADMIN_HASH=${salt}:${hash}\nREPLAY_SECRET=${randomBytes(32).toString('hex')}\n\nKeep this file private. Store the password in your password manager.\n`, { mode: 0o600, flag: 'wx' });
console.log('Private access instructions saved to: ' + file);
