// Uso: npm run hash-password  → incolla il risultato in ADMIN_PASSWORD_HASH
import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../src/auth.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question('Nuova password del pannello (min. 10 caratteri): ');
rl.close();
if (password.length < 10) {
  console.error('Password troppo corta.');
  process.exit(1);
}
console.log(`\nADMIN_PASSWORD_HASH=${hashPassword(password)}`);
