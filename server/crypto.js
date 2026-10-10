import forge from 'node-forge';

const KEY = process.env.FORGE_KEY || 'ec2forgekey12345';
const IV = process.env.FORGE_IV || 'ec2forgeiv123456';

export function encrypt(plain) {
  const cipher = forge.cipher.createCipher('AES-CBC', KEY);
  cipher.start({ iv: IV });
  cipher.update(forge.util.createBuffer(String(plain), 'utf8'));
  cipher.finish();
  return forge.util.encode64(cipher.output.getBytes());
}

export function decrypt(enc) {
  try {
    const decipher = forge.cipher.createDecipher('AES-CBC', KEY);
    decipher.start({ iv: IV });
    decipher.update(forge.util.createBuffer(forge.util.decode64(enc)));
    decipher.finish();
    return decipher.output.toString();
  } catch {
    return null;
  }
}