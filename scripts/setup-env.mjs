import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
const exists = fs.existsSync('.env');
if (exists && fs.readFileSync('.env', 'utf8').trim()) {
  console.log('Existing .env preserved. No credentials changed.');
} else {
  let content = fs.readFileSync('.env.example', 'utf8');
  content = content.replaceAll('GENERATE_WITH_SETUP_SCRIPT', () => randomBytes(32).toString('hex'));
  fs.writeFileSync('.env', content, { flag: exists ? 'w' : 'wx', mode: 0o600 });
  fs.chmodSync('.env', 0o600);
  console.log('Local configuration generated in .env. Passwords were not printed.');
}
