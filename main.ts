// Entrypoint for token-radar-01 (Node 22 standard library only, zero network calls).
// Reads /input/snapshot.json (or --input <path>), computes empirical-Bayes pre-token launch valuations
// and DeFi farming playbooks, writes /output/board.json and /output/data.js, copies dashboard/ and
// screenshots/ into /output/, and builds /output/dossier.json via vendor/makefun-board.ts.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRadarDataset, parseSnapshot, renderRadarDataScript, validateBoardRows } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const BOARD_MAX_BYTES = 8 * 1024 * 1024;
const DOSSIER_GATE_MAX_BYTES = 1_572_864;
const PLAIN_FILE_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function readCliArg(flag: string, fallback: string): string {
  const exactIdx = process.argv.indexOf(`--${flag}`);
  if (exactIdx >= 0 && exactIdx + 1 < process.argv.length) {
    return process.argv[exactIdx + 1]!;
  }
  const prefix = `--${flag}=`;
  const inline = process.argv.find((item) => item.startsWith(prefix));
  return inline !== undefined ? inline.slice(prefix.length) : fallback;
}

function resolveSnapshotPath(rawInput: string): string {
  if (rawInput.endsWith('.json')) return rawInput;
  if (existsSync(rawInput) && lstatSync(rawInput).isFile()) return rawInput;
  return join(rawInput, 'snapshot.json');
}

function copyTreeClean(srcDir: string, dstDir: string): string[] {
  if (!existsSync(srcDir)) return [];
  const copied: string[] = [];
  const walk = (relDir: string): void => {
    const curSrc = relDir === '' ? srcDir : join(srcDir, relDir);
    const curDst = relDir === '' ? dstDir : join(dstDir, relDir);
    const entries = readdirSync(curSrc, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relPath = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(relPath);
      } else if (entry.isFile()) {
        if (!PLAIN_FILE_RE.test(entry.name)) {
          throw new Error(`Invalid filename in asset tree: ${relPath}`);
        }
        mkdirSync(curDst, { recursive: true });
        copyFileSync(join(curSrc, entry.name), join(curDst, entry.name));
        copied.push(relPath);
      }
    }
  };
  walk('');
  return copied;
}

function main(): void {
  const inputArg = readCliArg('input', '/input/snapshot.json');
  const snapshotPath = resolveSnapshotPath(inputArg);
  if (!existsSync(snapshotPath)) {
    process.stderr.write(`token-radar-bot: snapshot not found at ${snapshotPath}\n`);
    process.exit(2);
  }

  const outDir = readCliArg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  const rawSnapshot = readFileSync(snapshotPath, 'utf8');
  const snapshot = parseSnapshot(rawSnapshot);
  const { boardRows, radarData } = buildRadarDataset(snapshot);

  const validationError = validateBoardRows(boardRows, snapshot);
  if (validationError !== null) {
    process.stderr.write(`token-radar-bot: board validation failed: ${validationError}\n`);
    process.exit(1);
  }

  const boardPayload = `${JSON.stringify({ rows: boardRows })}\n`;
  const dataJsPayload = renderRadarDataScript(radarData);

  if (process.argv.includes('--check')) {
    const secondPass = buildRadarDataset(parseSnapshot(rawSnapshot));
    const hashA = createHash('sha256').update(boardPayload).update(dataJsPayload).digest('hex');
    const hashB = createHash('sha256')
      .update(`${JSON.stringify({ rows: secondPass.boardRows })}\n`)
      .update(renderRadarDataScript(secondPass.radarData))
      .digest('hex');
    if (hashA !== hashB) {
      process.stderr.write(`token-radar-bot: determinism check failed (${hashA} !== ${hashB})\n`);
      process.exit(1);
    }
  }

  mkdirSync(outDir, { recursive: true });
  const boardByteLen = Buffer.byteLength(boardPayload, 'utf8');
  if (boardByteLen > BOARD_MAX_BYTES) {
    process.stderr.write(`token-radar-bot: board.json (${boardByteLen} bytes) exceeds 8 MiB gate cap\n`);
    process.exit(1);
  }
  writeFileSync(join(outDir, 'board.json'), boardPayload, 'utf8');
  writeFileSync(join(outDir, 'data.js'), dataJsPayload, 'utf8');

  const dashFiles = copyTreeClean(join(REPO_ROOT, 'dashboard'), join(outDir, 'dashboard'));
  const shotFiles = copyTreeClean(join(REPO_ROOT, 'screenshots'), join(outDir, 'screenshots'));

  const hasDashboard = dashFiles.includes('index.html');
  if (hasDashboard && shotFiles.length >= 3) {
    const dossierBytes = buildDossier(outDir, {
      text_max_bytes: TEXT_MAX_BYTES,
      screenshots: { max: 4, max_bytes: 524_288 },
      dashboard: { max_files: 400, max_bytes: 4_194_304 },
    });
    if (dossierBytes.byteLength > DOSSIER_GATE_MAX_BYTES) {
      process.stderr.write(
        `token-radar-bot: dossier.json (${dossierBytes.byteLength} bytes) exceeds 1.5 MiB gate cap (${DOSSIER_GATE_MAX_BYTES} bytes)\n`,
      );
      process.exit(1);
    }
    writeFileSync(join(outDir, 'dossier.json'), dossierBytes);
    const parsedDossier = JSON.parse(Buffer.from(dossierBytes).toString('utf8')) as { text: string };
    const textBytes = Buffer.byteLength(parsedDossier.text, 'utf8');
    const wasCut = parsedDossier.text.includes('left out.]');
    process.stdout.write(
      `token-radar-bot: scored ${boardRows.length} pre-token candidates (${radarData.summary.watchlist_covered}/${radarData.summary.watchlist_total} watchlist, ${radarData.summary.early_gem_rows} early gems, ${radarData.summary.traded_peer_rows} traded peers) -> board.json (${boardByteLen}B), data.js, dashboard (${dashFiles.length} files, source=${textBytes}B, truncated=${wasCut}), screenshots (${shotFiles.length} images), dossier.json (${dossierBytes.byteLength}B)\n`,
    );
  } else {
    process.stdout.write(
      `token-radar-bot: staged ${boardRows.length} pre-token candidates (${radarData.summary.watchlist_covered}/${radarData.summary.watchlist_total} watchlist, ${radarData.summary.early_gem_rows} early gems) -> board.json (${boardByteLen}B) & data.js ready (awaiting dashboard=${dashFiles.length} files / screenshots=${shotFiles.length} images for dossier.json)\n`,
    );
  }
}

main();
