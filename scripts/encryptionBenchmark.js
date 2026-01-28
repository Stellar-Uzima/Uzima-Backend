import { encrypt, decrypt } from '../src/utils/encryptionUtils.js';

process.env.ENCRYPTION_KEY_SECRET_v1 =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.ENCRYPTION_KEY_CURRENT_VERSION = 'v1';

const iterations = 10000;
const text =
  'This is a sample text to be encrypted and decrypted repeatedly for benchmarking purposes.';

console.log(`Running benchmark with ${iterations} iterations...`);

const startEncrypt = process.hrtime.bigint();
for (let i = 0; i < iterations; i++) {
  encrypt(text);
}
const endEncrypt = process.hrtime.bigint();

const encrypted = encrypt(text);
const startDecrypt = process.hrtime.bigint();
for (let i = 0; i < iterations; i++) {
  decrypt(encrypted);
}
const endDecrypt = process.hrtime.bigint();

const encryptTime = Number(endEncrypt - startEncrypt) / 1e6; // ms
const decryptTime = Number(endDecrypt - startDecrypt) / 1e6; // ms

console.log(`Encryption Total Time: ${encryptTime.toFixed(2)}ms`);
console.log(`Encryption Avg Time: ${(encryptTime / iterations).toFixed(4)}ms`);
console.log(`Decryption Total Time: ${decryptTime.toFixed(2)}ms`);
console.log(`Decryption Avg Time: ${(decryptTime / iterations).toFixed(4)}ms`);

if (encryptTime / iterations < 10) {
  console.log('PASS: Encryption overhead is < 10ms per operation');
} else {
  console.log('FAIL: Encryption overhead is > 10ms');
}
