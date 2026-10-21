/**
 * SynapseAI Lab — Guardián de secretos (pre-commit)
 *
 * Evita que una contraseña real acabe en el repositorio. Se ejecuta antes de
 * cada commit y bloquea si encuentra credenciales en los archivos preparados.
 *
 * Uso:  git config core.hooksPath .githooks
 *
 * Los patrones se basan en los que usa GitHub Push Protection, que fue lo que
 * bloqueó el push original con:
 *   remote: error: GH013: Repository rule violations found for refs/heads/main.
 *   remote:   - GITHUB PUSH PROTECTION
 *   remote:     - Push cannot contain secrets
 */
'use strict';

const { execSync } = require('child_process');

const PATRONES = [
  { nombre: 'Aiven Service Password', re: /AVNS_[A-Za-z0-9_-]{10,}/ },
  { nombre: 'Clave privada PEM', re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { nombre: 'Token de GitHub', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { nombre: 'Token de OpenAI', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { nombre: 'Clave de Google API', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { nombre: 'Password con valor real', re: /^[^#\n]*\b(PASSWORD|PASSWD|SECRET|TOKEN|API_KEY)\s*=\s*(?!\s*$|tu_|your_|changeme|x{3,}|\$\{)[^\s#]{8,}$/im }
];

/** Archivos que legítimamente contienen ejemplos o placeholders. */
const EXCLUIDOS = [/^\.env\.example$/, /^tests\//, /^README\.md$/, /^DEPLOY\.md$/, /^\.githooks\//, /^scripts\/check-secrets\.js$/];

function archivosPreparados() {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (err) {
    return [];
  }
}

function toText(buf) {
  return buf.toString('utf8');
}

const hallazgos = [];

for (const archivo of archivosPreparados()) {
  if (EXCLUIDOS.some((re) => re.test(archivo))) continue;

  let buf;
  try {
    buf = execSync(`git show ":${archivo}"`, { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 });
  } catch (err) {
    continue;
  }

  const texto = toText(buf);
  for (const { nombre, re } of PATRONES) {
    const m = texto.match(re);
    if (m) {
      hallazgos.push({ archivo, nombre, fragmento: String(m[0]).slice(0, 12) + '…' });
    }
  }
}

if (hallazgos.length) {
  console.error('\n  ╔══════════════════════════════════════════════════════╗');
  console.error('  ║  SECRETO DETECTADO — commit cancelado                    ║');
  console.error('  ╚══════════════════════════════════════════════════════╝\n');
  for (const h of hallazgos) {
    console.error(`  ✖ ${h.archivo}`);
    console.error(`    tipo: ${h.nombre}`);
    console.error(`    valor: ${h.fragmento}\n`);
  }
  console.error('  Qué hacer:');
  console.error('   1. Deja el valor real SOLO en el archivo .env (está en .gitignore).');
  console.error('   2. En .env.example deja un placeholder (tu_valor, xxxxx, etc.).');
  console.error('   3. Vuelve a hacer "git add" y "git commit".\n');
  console.error('  Si el valor ya se publicó, ROTA la contraseña en el proveedor.\n');
  process.exit(1);
}

console.log('[check-secrets] OK: sin secretos en los archivos preparados.');
