import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

// The directory that holds this script (the repo root). Dashboard and
// screenshot files are copied from here, so the program works no matter
// which directory it is started from (the grader runs it from elsewhere).
const scriptDir = dirname(fileURLToPath(import.meta.url));

// Return the value of a --name value or --name=value argument, or the fallback.
function arg(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (item === `--${name}` && i + 1 < argv.length) return argv[i + 1];
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3);
  }
  return fallback;
}

// Resolve the snapshot location: a .json path is used as-is, otherwise it is a directory.
function resolveInput(raw: string): string {
  if (raw.endsWith('.json')) return raw;
  return join(raw, 'snapshot.json');
}

// Copy the regular files of one directory into a destination directory.
// Dotfiles are skipped; the list of copied file names is returned.
function copyDir(source: string, destination: string): string[] {
  mkdirSync(destination, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(source).sort()) {
    if (name.startsWith('.')) continue;
    const from = join(source, name);
    if (!statSync(from).isFile()) continue;
    copyFileSync(from, join(destination, name));
    names.push(name);
  }
  return names;
}

function main(): void {
  const input = resolveInput(arg('input', '/input'));
  if (!existsSync(input)) {
    console.error(`input snapshot not found: ${input}`);
    console.error('pass --input <snapshot.json|directory> or mount the sealed /input');
    process.exit(2);
  }
  const output = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  const snapshot = parseSnapshot(readFileSync(input, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    console.error(issue);
    process.exit(1);
  }
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'board.json'), JSON.stringify({ rows: board }) + '\n');
  writeFileSync(join(output, 'data.js'), dataScript(radar));
  const dashboardFiles = copyDir(join(scriptDir, 'dashboard'), join(output, 'dashboard'));
  const screenshotFiles = copyDir(join(scriptDir, 'screenshots'), join(output, 'screenshots'));
  if (screenshotFiles.length < 3) {
    console.error(`expected at least 3 screenshots, found ${screenshotFiles.length}`);
    process.exit(1);
  }
  for (const name of screenshotFiles) {
    if (!/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(name)) {
      console.error(`invalid screenshot name: ${name}`);
      process.exit(1);
    }
  }
  const dossier = buildDossier(output, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  writeFileSync(join(output, 'dossier.json'), dossier);
  const early = board.filter((row: any) => !snapshot.watchlist.includes(row.slug)).length;
  console.log(`protocols: ${radar.rows}, watchlist: ${radar.watchlist_size}, ranked: ${board.length} (early: ${early}, live: ${radar.live_size})`);
  console.log(`benchmark: ${radar.model.benchmark_multiple} from ${radar.model.benchmark_n} live-token protocols`);
  console.log(`wrote: board.json, data.js, dashboard (${dashboardFiles.length} files), screenshots (${screenshotFiles.length} images), dossier.json`);
}

main();
