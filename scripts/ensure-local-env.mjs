/**
 * Garante que `src/environments/environment.local.ts` exista antes do
 * `ng serve --configuration local` (o fileReplacements do Angular falha duro
 * se o arquivo não existir). Cria a partir do exemplo uma única vez e avisa
 * onde colar a x-api-key — arquivo ignorado pelo git, então a chave de cada
 * máquina nunca entra no versionamento nem conflita em pull.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'src', 'environments', 'environment.local.ts');
const example = join(root, 'src', 'environments', 'environment.local.example.ts');

if (!existsSync(target)) {
  copyFileSync(example, target);
  console.log('[recruta] src/environments/environment.local.ts criado a partir do exemplo.');
  console.log('[recruta] Abra esse arquivo e cole o API_KEY do .env do backend (sem aspas).');
}
