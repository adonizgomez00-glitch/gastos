/** El cliente no usa rutas absolutas: debe funcionar detras del prefijo /gastos/ (AGENT.md 10.3).
 * Falla si algun .js o .html del cliente referencia '/api/...', 'src="/', 'href="/' o 'url(/'. */
import fs from 'node:fs';
import path from 'node:path';
import { ok } from '../helpers/assert.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const CLIENT_DIRS = ['src', 'assets'];
const CLIENT_FILES = ['index.html'];
const FORBIDDEN = [
  /fetch\(\s*['"`]\/api\//,
  /['"`]\/api\//,
  /src=["']\//,
  /href=["']\//,
  /url\(\//
];

function collect(dir) {
  const found = [];
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...collect(full));
    else if (/\.(js|html|css)$/.test(entry.name)) found.push(full);
  }
  return found;
}

export async function noAbsolutePaths() {
  const files = [
    ...CLIENT_FILES.map((f) => path.join(ROOT, f)),
    ...CLIENT_DIRS.flatMap((d) => collect(path.join(ROOT, d)))
  ];
  // Fase C todavia no existe: el test queda registrado y se activa al crear el cliente.
  if (!files.some((f) => fs.existsSync(f))) {
    ok(true, 'cliente aun no implementado (Fase C): test registrado, pendiente de activacion');
    return;
  }
  const violations = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    FORBIDDEN.forEach((re, index) => {
      if (re.test(content)) violations.push(`${path.relative(ROOT, file)} viola la regla #${index + 1}`);
    });
  }
  ok(violations.length === 0, `rutas absolutas prohibidas: ${violations.join('; ')}`);
}
