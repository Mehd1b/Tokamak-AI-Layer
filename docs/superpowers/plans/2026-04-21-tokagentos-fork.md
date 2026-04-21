# TokagentOS Fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork the elizaOS monorepo into `TAL/tokagentos/`, rename every elizaOS reference to tokagentOS, and restyle the CLI output with TAL's visual palette.

**Architecture:** Copy the elizaOS tree into a subfolder of the Tokamak-AI-Layer repository, run a deterministic rename script that rewrites strings/package names/URLs (while excluding external plugin submodules), then add a gradient banner and palette-aware output to the renamed CLI. The fork lives under TAL's existing `.git`.

**Tech Stack:** Bun workspaces, Turborepo, TypeScript 6, `commander`, `@clack/prompts`, `picocolors`, new deps `chalk@^5` + `gradient-string@^3`.

**Spec:** `docs/superpowers/specs/2026-04-21-tokagentos-fork-design.md`

---

## File Structure

New files (inside `TAL/tokagentos/` after copy):

- `NOTICE.md` — fork attribution
- `README.md` — rebranded (overwrites copied upstream README)
- `scripts/rename.mjs` — deterministic rename script (reused for future upstream pulls)
- `scripts/generate-banner.mjs` — dev-time ASCII banner generator (run once, output checked in)
- `packages/tokagentos/src/theme.ts` — TAL palette + chalk helpers
- `packages/tokagentos/src/banner.ts` — banner string constant + renderer
- `packages/tokagentos/src/banner.generated.ts` — checked-in output of generate-banner.mjs
- `packages/tokagentos/src/help-formatter.ts` — Commander.js help theming
- `packages/tokagentos/__tests__/theme.test.ts`
- `packages/tokagentos/__tests__/banner.test.ts`
- `packages/tokagentos/__tests__/help-formatter.test.ts`

Modified files:

- Every file in the copied tree containing `elizaos`/`elizaOS`/etc. (rewritten by rename.mjs)
- `packages/tokagentos/src/cli.ts` — wire banner + themed help
- `packages/tokagentos/package.json` — add chalk, gradient-string, rename
- `package.json` (root) — name, scripts referencing `eliza`
- `.gitmodules` — kept as-is (documented, not modified)
- `LICENSE` — copied verbatim from upstream

---

## Phase A: Fork + Mechanical Rename

### Task 1: Create destination directory and copy source tree

**Files:**
- Create: `tokamak/TAL/Tokamak-AI-Layer/tokagentos/` (entire subtree from `elizaOS/eliza/`)

- [ ] **Step 1: Verify source and destination state**

Run:
```bash
test -d /Users/mehdiberiane/Documents/elizaOS/eliza && echo "source OK"
test ! -e /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos && echo "dest clean"
```
Expected: both `OK`.

- [ ] **Step 2: Copy the tree, excluding build artifacts and git internals**

Run:
```bash
rsync -a \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='.turbo/' \
  --exclude='target/' \
  --exclude='build/' \
  --exclude='.next/' \
  --exclude='bun.lock' \
  --exclude='package-lock.json' \
  --exclude='tsconfig.tsbuildinfo' \
  /Users/mehdiberiane/Documents/elizaOS/eliza/ \
  /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos/
```
Expected: command exits 0. `du -sh .../tokagentos` shows ~50-200MB (source size).

- [ ] **Step 3: Verify plugins/ submodule directories are empty shells**

Run:
```bash
ls -la /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos/plugins/ | head -5
```
Expected: plugin directories are present but likely empty (since we excluded `.git/` and the user hadn't run `git submodule update`). `.gitmodules` file present in the fork root.

- [ ] **Step 4: Commit placeholder so subsequent diffs are minimal**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/
git commit -m "tokagentos: import upstream elizaOS v2.0.0-alpha.223 tree (pre-rename)"
```
Expected: commit succeeds.

---

### Task 2: Write the rename script

**Files:**
- Create: `tokagentos/scripts/rename.mjs`

- [ ] **Step 1: Write the failing test**

Create `tokagentos/scripts/__tests__/rename.test.mjs`:
```javascript
import { describe, it, expect } from 'vitest';
import { substitute, shouldSkipPath, buildAllowlist } from '../rename.mjs';

describe('substitute', () => {
  it('rewrites all case variants', () => {
    expect(substitute('elizaos', new Set(['core']))).toBe('tokagentos');
    expect(substitute('ElizaOS', new Set(['core']))).toBe('TokagentOS');
    expect(substitute('elizaOS', new Set(['core']))).toBe('tokagentOS');
    expect(substitute('ELIZAOS', new Set(['core']))).toBe('TOKAGENTOS');
  });

  it('rewrites @elizaos/<name> only when name is in allowlist', () => {
    const allow = new Set(['core', 'client']);
    expect(substitute('@elizaos/core', allow)).toBe('@tokagentos/core');
    expect(substitute('@elizaos/client', allow)).toBe('@tokagentos/client');
    expect(substitute('@elizaos/plugin-anthropic', allow)).toBe('@elizaos/plugin-anthropic');
  });

  it('preserves tagline attribution string', () => {
    const tagline = 'A fork of elizaOS, restyled for Tokamak.';
    // tagline is handled by shouldSkipPath for the banner file, not by substitute
    expect(substitute(tagline, new Set())).toBe('A fork of tokagentOS, restyled for Tokamak.');
  });
});

describe('shouldSkipPath', () => {
  it('skips build artifacts and external plugins', () => {
    expect(shouldSkipPath('plugins/plugin-anthropic/src/index.ts')).toBe(true);
    expect(shouldSkipPath('node_modules/foo/index.js')).toBe(true);
    expect(shouldSkipPath('packages/core/src/index.ts')).toBe(false);
  });

  it('skips LICENSE', () => {
    expect(shouldSkipPath('LICENSE')).toBe(true);
  });

  it('skips binary files by extension', () => {
    expect(shouldSkipPath('public/logo.png')).toBe(true);
    expect(shouldSkipPath('docs/foo.pdf')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
bun add -d vitest
npx vitest run scripts/__tests__/rename.test.mjs
```
Expected: FAIL — module `../rename.mjs` does not exist.

- [ ] **Step 3: Implement rename.mjs**

Create `tokagentos/scripts/rename.mjs`:
```javascript
#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.turbo', 'target', 'build', '.next',
  '.git', 'plugins',
]);
const SKIP_FILES = new Set(['LICENSE', 'bun.lock', 'package-lock.json']);
const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.pdf', '.zip',
  '.tar', '.gz', '.wasm', '.so', '.dylib', '.dll', '.lock',
]);

export function shouldSkipPath(rel) {
  const parts = rel.split('/');
  if (parts.some((p) => SKIP_DIRS.has(p))) return true;
  const base = parts[parts.length - 1];
  if (SKIP_FILES.has(base)) return true;
  if (BINARY_EXTS.has(extname(base).toLowerCase())) return true;
  return false;
}

export function buildAllowlist(root) {
  const pkgDir = join(root, 'packages');
  if (!existsSync(pkgDir)) return new Set();
  const names = new Set();
  for (const entry of readdirSync(pkgDir)) {
    const pkgJson = join(pkgDir, entry, 'package.json');
    if (!existsSync(pkgJson)) continue;
    try {
      const parsed = JSON.parse(readFileSync(pkgJson, 'utf8'));
      const name = parsed.name ?? '';
      const m = name.match(/^@elizaos\/(.+)$/);
      if (m) names.add(m[1]);
    } catch {}
  }
  return names;
}

export function substitute(input, allowlist) {
  let out = input;
  out = out.replace(/@elizaos\/([a-zA-Z0-9_.-]+)/g, (match, name) =>
    allowlist.has(name) ? `@tokagentos/${name}` : match
  );
  out = out.replace(/elizaOS/g, 'tokagentOS');
  out = out.replace(/ElizaOS/g, 'TokagentOS');
  out = out.replace(/ELIZAOS/g, 'TOKAGENTOS');
  out = out.replace(/elizaos/g, 'tokagentos');
  return out;
}

function walk(dir, root, onFile) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(root, full);
    if (shouldSkipPath(rel)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, root, onFile);
    else if (st.isFile()) onFile(full, rel);
  }
}

function main() {
  const root = process.argv[2] ?? process.cwd();
  const dryRun = process.argv.includes('--dry-run');
  const allowlist = buildAllowlist(root);
  console.error(`[rename] allowlist: ${[...allowlist].join(', ')}`);
  let changed = 0;
  walk(root, root, (full, rel) => {
    const before = readFileSync(full, 'utf8');
    const after = substitute(before, allowlist);
    if (before !== after) {
      changed += 1;
      if (!dryRun) writeFileSync(full, after);
      console.log(`${dryRun ? '[DRY]' : '[WRITE]'} ${rel}`);
    }
  });
  console.error(`[rename] ${changed} files ${dryRun ? 'would be' : ''} changed`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 4: Run the test again**

Run:
```bash
npx vitest run scripts/__tests__/rename.test.mjs
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/scripts/rename.mjs tokagentos/scripts/__tests__/ tokagentos/package.json
git commit -m "tokagentos: add deterministic rename script with tests"
```

---

### Task 3: Dry-run the rename to eyeball the diff

**Files:** none modified; output inspected only.

- [ ] **Step 1: Dry-run and capture output**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
node scripts/rename.mjs . --dry-run 2>&1 | tee /tmp/rename-dryrun.log
```
Expected: log lists every file that WOULD be modified; no files actually changed on disk.

- [ ] **Step 2: Verify allowlist is non-empty and looks right**

Run:
```bash
head -n 2 /tmp/rename-dryrun.log
```
Expected: first line is `[rename] allowlist: core, client, server, ...` (a set of internal package names from `packages/*`).

- [ ] **Step 3: Confirm `plugins/` is fully excluded**

Run:
```bash
grep -c 'plugins/' /tmp/rename-dryrun.log || echo "no plugin paths - good"
```
Expected: `0` or `no plugin paths - good`.

- [ ] **Step 4: Sanity-check a representative file**

Run:
```bash
grep -E 'packages/.+/package\.json' /tmp/rename-dryrun.log | head -5
```
Expected: several internal package `package.json` files listed.

---

### Task 4: Apply the rename for real

**Files:** every non-excluded file containing `elizaos`/`elizaOS`/etc.

- [ ] **Step 1: Run the rename script**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
node scripts/rename.mjs . 2>&1 | tee /tmp/rename-applied.log
```
Expected: `[rename] N files changed` where N matches the dry-run count.

- [ ] **Step 2: Spot-check a changed file**

Run:
```bash
grep -n 'tokagentos\|tokagentOS' package.json | head -10
```
Expected: root `package.json` now contains `tokagentos` / `tokagentOS` tokens.

- [ ] **Step 3: Confirm plugin refs stayed as @elizaos/plugin-***

Run:
```bash
grep -rE '@elizaos/plugin-' packages/*/package.json 2>/dev/null | head -5 || echo "none"
```
Expected: either `@elizaos/plugin-*` references shown (they're intentionally preserved), or `none` if no package depends on plugins directly.

- [ ] **Step 4: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/
git commit -m "tokagentos: apply mechanical rename (elizaOS -> tokagentOS)"
```

---

### Task 5: Rename `packages/elizaos` directory → `packages/tokagentos`

**Files:**
- Rename: `tokagentos/packages/elizaos/` → `tokagentos/packages/tokagentos/`
- Modify: `tokagentos/packages/tokagentos/package.json` (bin name)

- [ ] **Step 1: Verify source directory exists and target doesn't**

Run:
```bash
test -d /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos/packages/elizaos && echo "src OK"
test ! -e /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos/packages/tokagentos && echo "dst OK"
```
Expected: both `OK`.

- [ ] **Step 2: Rename the directory via git mv**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git mv tokagentos/packages/elizaos tokagentos/packages/tokagentos
```
Expected: command exits 0.

- [ ] **Step 3: Confirm `bin` field in package.json is already `tokagentos`**

Run:
```bash
cat tokagentos/packages/tokagentos/package.json | grep -A1 '"bin"'
```
Expected: `"bin": { "tokagentos": "./dist/cli.js" }` (the rename script rewrote the key). If not, edit manually.

- [ ] **Step 4: Verify workspace references in root package.json still point at the new path**

Workspace globs are `"packages/*"`, so no update needed. Verify:
```bash
grep -A5 '"workspaces"' tokagentos/package.json
```
Expected: globs include `packages/*` or the equivalent; `packages/tokagentos` resolves.

- [ ] **Step 5: Commit**

```bash
git add tokagentos/
git commit -m "tokagentos: rename packages/elizaos dir to packages/tokagentos"
```

---

### Task 6: Update URLs, author, email, repository metadata

**Files:**
- Modify: `tokagentos/package.json` (root)
- Modify: `tokagentos/packages/tokagentos/package.json`
- Modify: any other `package.json` files containing the upstream URLs

- [ ] **Step 1: List every package.json with upstream URLs**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
grep -lE '(elizaos\.ai|github\.com/elizaos/eliza|"elizaOS Team")' $(find . -name package.json -not -path '*/node_modules/*' -not -path '*/plugins/*')
```
Expected: a short list of package.json files (likely 1-5).

- [ ] **Step 2: Update each package.json identified**

For each file above, set:
```json
{
  "homepage": "https://tokagentos.ai",
  "repository": {
    "type": "git",
    "url": "https://github.com/tokamak-network/Tokamak-AI-Layer",
    "directory": "tokagentos"
  },
  "author": {
    "name": "Tokamak Network",
    "email": "mehdi@tokamak.network"
  }
}
```

Do this via:
```bash
node -e '
const fs = require("fs");
const files = process.argv.slice(1);
for (const f of files) {
  const p = JSON.parse(fs.readFileSync(f, "utf8"));
  if (p.homepage) p.homepage = "https://tokagentos.ai";
  if (p.repository) p.repository = { type: "git", url: "https://github.com/tokamak-network/Tokamak-AI-Layer", directory: "tokagentos" };
  if (p.author) p.author = { name: "Tokamak Network", email: "mehdi@tokamak.network" };
  fs.writeFileSync(f, JSON.stringify(p, null, 2) + "\n");
}
' package.json packages/tokagentos/package.json
```
(Add more files to the list if Step 1 returned them.)

- [ ] **Step 3: Verify**

Run:
```bash
grep -E '(homepage|repository|author)' package.json packages/tokagentos/package.json
```
Expected: all three fields show the new values.

- [ ] **Step 4: Commit**

```bash
git add tokagentos/
git commit -m "tokagentos: update URLs, author, email, repository metadata"
```

---

### Task 7: Write NOTICE.md, preserve LICENSE, rebrand README

**Files:**
- Create: `tokagentos/NOTICE.md`
- Verify unchanged: `tokagentos/LICENSE`
- Rewrite: `tokagentos/README.md`

- [ ] **Step 1: Verify LICENSE is untouched (the rename script should have skipped it)**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
head -5 LICENSE
```
Expected: original MIT license text with upstream copyright line, no `tokagentos` substring.

- [ ] **Step 2: Write NOTICE.md**

Create `tokagentos/NOTICE.md`:
```markdown
# NOTICE

TokagentOS is a fork of [elizaOS](https://github.com/elizaos/eliza), based on upstream version `v2.0.0-alpha.223` (commit `4552f7b98c`).

The upstream project is licensed under the MIT License. The original `LICENSE` file in this directory preserves the upstream copyright notice in full, as required.

This fork restyles the CLI and renames the product and package identifiers for use within the Tokamak ecosystem. No elizaOS source code is vendored beyond the copy in this subfolder; external plugin repositories at `github.com/elizaos-plugins/*` remain as their own projects and are referenced via git submodules.

## Maintainer

Tokamak Network <mehdi@tokamak.network>

## Upstream

- Source: https://github.com/elizaos/eliza
- Homepage: https://elizaos.ai
- License: MIT
```

- [ ] **Step 3: Rebrand README**

Replace `tokagentos/README.md` contents:
```markdown
# TokagentOS

> A fork of [elizaOS](https://github.com/elizaos/eliza), restyled for Tokamak.

TokagentOS is the Tokamak Network's fork of the elizaOS agent framework and CLI. It preserves the upstream codebase's structure and functionality, renamed throughout and restyled to match the Tokamak visual identity.

## Getting started

```bash
bun install
bun run build
./packages/tokagentos/dist/cli.js --help
```

## What changed from upstream

- Product and package namespace renamed (`@elizaos/*` → `@tokagentos/*` for packages maintained in this fork)
- CLI binary renamed (`elizaos` → `tokagentos`)
- CLI visual output restyled (gradient banner, TAL palette)
- Plugin submodules still reference upstream `github.com/elizaos-plugins/*`

## Attribution

See [`NOTICE.md`](./NOTICE.md) and [`LICENSE`](./LICENSE).

## License

MIT, inherited from upstream elizaOS.
```

- [ ] **Step 4: Commit**

```bash
git add tokagentos/NOTICE.md tokagentos/README.md
git commit -m "tokagentos: add NOTICE, rebrand README, keep LICENSE verbatim"
```

---

### Task 8: Regenerate lockfile

**Files:**
- Delete (if present): `tokagentos/bun.lock`
- Generate: `tokagentos/bun.lock`

- [ ] **Step 1: Ensure no stale lockfile**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
rm -f bun.lock package-lock.json
```

- [ ] **Step 2: Run bun install**

Run:
```bash
bun install 2>&1 | tee /tmp/bun-install.log
```
Expected: exits 0. Any warnings about `@elizaos/plugin-*` not being in the workspace are acceptable (those are upstream-published plugins, not local). Errors about `@tokagentos/*` resolution are bugs — fix before continuing.

- [ ] **Step 3: Verify lockfile was created**

Run:
```bash
test -f bun.lock && echo "lockfile OK"
```
Expected: `lockfile OK`.

- [ ] **Step 4: Commit**

```bash
git add tokagentos/bun.lock
git commit -m "tokagentos: regenerate bun.lock with @tokagentos/* scope"
```

---

### Task 9: Build, typecheck, lint until green

**Files:** none created; fixes applied in-place if anything breaks.

- [ ] **Step 1: Attempt the monorepo build**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
bun run build 2>&1 | tee /tmp/build.log
```
Expected: turbo runs all builds, exits 0.

If the build fails, the most likely causes are:
- A string-substitution artifact in a test fixture that expected the literal `elizaos` — fix by updating the fixture
- A TypeScript file that references `@elizaos/plugin-*` in a way the allowlist didn't catch — inspect, decide case-by-case
- Submodule code referenced from a non-plugin path — rare, but fix the import

Fix and retry until build passes.

- [ ] **Step 2: Typecheck**

Run:
```bash
bun run typecheck 2>&1 | tee /tmp/typecheck.log
```
Expected: exit 0.

- [ ] **Step 3: Lint**

Run:
```bash
bun run lint:check 2>&1 | tee /tmp/lint.log
```
Expected: exit 0.

- [ ] **Step 4: Commit any fixes**

```bash
git add tokagentos/
git diff --cached --quiet || git commit -m "tokagentos: post-rename build/typecheck/lint fixes"
```

---

### Task 10: Run verification gate 11 (completeness grep)

**Files:** none modified; verification only.

- [ ] **Step 1: Run the rename-completeness grep**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
grep -rE 'elizaOS|elizaos|ElizaOS|ELIZAOS' \
  --exclude-dir=plugins \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude-dir=.turbo \
  --exclude-dir=target \
  --exclude-dir=build \
  --exclude-dir=.next \
  --exclude=LICENSE \
  --exclude=NOTICE.md \
  --exclude=bun.lock \
  . | grep -vE '@elizaos/plugin-' \
    | grep -v 'A fork of elizaOS, restyled for Tokamak' \
    | tee /tmp/grep-remaining.log
```
Expected: zero lines of output.

- [ ] **Step 2: Triage remaining hits (if any)**

For each line that slipped through:
- Is it a test fixture that intentionally contains a known upstream string? → allowlist the specific file in the rename script's SKIP list and re-run.
- Is it in a binary file that the extension filter missed? → add the extension to `BINARY_EXTS`.
- Is it a genuine miss (e.g., in a `.env.example`)? → rewrite manually.

- [ ] **Step 3: Re-run the grep until empty**

Repeat Step 1 until output is empty.

- [ ] **Step 4: Commit any triage fixes**

```bash
git diff --quiet || { git add tokagentos/; git commit -m "tokagentos: rename gate 11 triage fixes"; }
```

---

## Phase B: CLI Visual Restyle

### Task 11: Add chalk + gradient-string dependencies

**Files:**
- Modify: `tokagentos/packages/tokagentos/package.json`

- [ ] **Step 1: Add runtime deps**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos/packages/tokagentos
bun add chalk@^5 gradient-string@^3
bun add -d @types/gradient-string
```
Expected: `package.json` shows `chalk` and `gradient-string` in `dependencies`, `@types/gradient-string` in `devDependencies`. Lockfile updated.

- [ ] **Step 2: Verify install is clean**

Run:
```bash
cd ../..
bun install
```
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/
git commit -m "tokagentos: add chalk and gradient-string for CLI theming"
```

---

### Task 12: Create theme palette module (TDD)

**Files:**
- Create: `tokagentos/packages/tokagentos/src/theme.ts`
- Create: `tokagentos/packages/tokagentos/__tests__/theme.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tokagentos/packages/tokagentos/__tests__/theme.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { palette, c } from '../src/theme.js';

describe('palette', () => {
  it('exposes TAL-sourced hex values', () => {
    expect(palette.brand).toBe('#A855F7');
    expect(palette.gradientStart).toBe('#7C3AED');
    expect(palette.gradientEnd).toBe('#D946EF');
    expect(palette.secondary).toBe('#06B6D4');
    expect(palette.highlight).toBe('#C084FC');
    expect(palette.error).toBe('#EF4444');
    expect(palette.muted).toBe('#6B7280');
  });
});

describe('c helpers', () => {
  it('applies truecolor when chalk reports level >= 3', () => {
    // chalk.hex returns a function that wraps a string with ANSI.
    // Non-empty output proves the helper is wired.
    expect(c.brand('x').length).toBeGreaterThan(1);
    expect(c.secondary('x').length).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos/packages/tokagentos
bun test __tests__/theme.test.ts
```
Expected: FAIL — `../src/theme.js` does not exist.

- [ ] **Step 3: Implement theme.ts**

Create `tokagentos/packages/tokagentos/src/theme.ts`:
```typescript
import chalk from 'chalk';

export const palette = {
  brand: '#A855F7',
  gradientStart: '#7C3AED',
  gradientMid: '#A855F7',
  gradientEnd: '#D946EF',
  secondary: '#06B6D4',
  highlight: '#C084FC',
  warning: '#D946EF',
  error: '#EF4444',
  muted: '#6B7280',
} as const;

export const c = {
  brand: chalk.hex(palette.brand),
  brandBold: chalk.hex(palette.brand).bold,
  secondary: chalk.hex(palette.secondary),
  highlight: chalk.hex(palette.highlight),
  warning: chalk.hex(palette.warning),
  warningBold: chalk.hex(palette.warning).bold,
  error: chalk.hex(palette.error),
  muted: chalk.hex(palette.muted),
} as const;
```

- [ ] **Step 4: Run test**

Run:
```bash
bun test __tests__/theme.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/packages/tokagentos/
git commit -m "tokagentos: add theme palette module with TAL colors"
```

---

### Task 13: Generate banner ASCII art and check it in

**Files:**
- Create: `tokagentos/scripts/generate-banner.mjs`
- Create: `tokagentos/packages/tokagentos/src/banner.generated.ts` (output of the script, checked in)

- [ ] **Step 1: Install figlet as a dev-only tool**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
bun add -d figlet @types/figlet
```

- [ ] **Step 2: Write the generator script**

Create `tokagentos/scripts/generate-banner.mjs`:
```javascript
#!/usr/bin/env node
import figlet from 'figlet';
import { writeFileSync } from 'node:fs';

const ascii = figlet.textSync('TOKAGENTOS', { font: 'ANSI Shadow' });
const lines = ascii.split('\n').filter((l) => l.length > 0);

const content = `// AUTO-GENERATED by scripts/generate-banner.mjs
// Re-run with: bun run scripts/generate-banner.mjs
// Do not edit by hand.

export const BANNER_LINES: readonly string[] = ${JSON.stringify(lines, null, 2)} as const;
`;

const outPath = 'packages/tokagentos/src/banner.generated.ts';
writeFileSync(outPath, content);
console.log(`[generate-banner] wrote ${lines.length} lines to ${outPath}`);
```

- [ ] **Step 3: Run the generator**

Run:
```bash
node scripts/generate-banner.mjs
```
Expected: `packages/tokagentos/src/banner.generated.ts` created with ~6 lines of ASCII art in a string array.

- [ ] **Step 4: Verify the output**

Run:
```bash
cat packages/tokagentos/src/banner.generated.ts | head -15
```
Expected: the file starts with the AUTO-GENERATED header and has a `BANNER_LINES` export with an array of ASCII strings.

- [ ] **Step 5: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/scripts/generate-banner.mjs tokagentos/packages/tokagentos/src/banner.generated.ts tokagentos/package.json tokagentos/bun.lock
git commit -m "tokagentos: generate TOKAGENTOS ASCII banner (ANSI Shadow)"
```

---

### Task 14: Create banner renderer with TTY detection (TDD)

**Files:**
- Create: `tokagentos/packages/tokagentos/src/banner.ts`
- Create: `tokagentos/packages/tokagentos/__tests__/banner.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tokagentos/packages/tokagentos/__tests__/banner.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderBanner, shouldShowBanner } from '../src/banner.js';

describe('shouldShowBanner', () => {
  const origIsTTY = process.stdout.isTTY;
  const origNoColor = process.env.NO_COLOR;

  afterEach(() => {
    // @ts-expect-error - test-only reassignment
    process.stdout.isTTY = origIsTTY;
    if (origNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = origNoColor;
  });

  it('returns true when TTY and NO_COLOR unset', () => {
    // @ts-expect-error - test-only reassignment
    process.stdout.isTTY = true;
    delete process.env.NO_COLOR;
    expect(shouldShowBanner()).toBe(true);
  });

  it('returns false when stdout is not a TTY', () => {
    // @ts-expect-error - test-only reassignment
    process.stdout.isTTY = false;
    delete process.env.NO_COLOR;
    expect(shouldShowBanner()).toBe(false);
  });

  it('returns false when NO_COLOR is set', () => {
    // @ts-expect-error - test-only reassignment
    process.stdout.isTTY = true;
    process.env.NO_COLOR = '1';
    expect(shouldShowBanner()).toBe(false);
  });
});

describe('renderBanner', () => {
  it('returns empty string when banner should be suppressed', () => {
    // @ts-expect-error
    process.stdout.isTTY = false;
    expect(renderBanner()).toBe('');
    // @ts-expect-error
    process.stdout.isTTY = true;
  });

  it('includes the tagline when banner is shown', () => {
    // @ts-expect-error
    process.stdout.isTTY = true;
    delete process.env.NO_COLOR;
    const out = renderBanner();
    expect(out).toContain('A fork of');
    expect(out).toContain('elizaOS');
    expect(out).toContain('restyled for Tokamak');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos/packages/tokagentos
bun test __tests__/banner.test.ts
```
Expected: FAIL — module missing.

- [ ] **Step 3: Implement banner.ts**

Create `tokagentos/packages/tokagentos/src/banner.ts`:
```typescript
import gradient from 'gradient-string';
import { BANNER_LINES } from './banner.generated.js';
import { c, palette } from './theme.js';

export function shouldShowBanner(): boolean {
  if (process.env.NO_COLOR) return false;
  if (!process.stdout.isTTY) return false;
  return true;
}

export function renderBanner(): string {
  if (!shouldShowBanner()) return '';
  const g = gradient([palette.gradientStart, palette.gradientMid, palette.gradientEnd]);
  const banner = BANNER_LINES.map((line) => g(line)).join('\n');
  const tagline = `${c.muted('A fork of ')}${c.brand('elizaOS')}${c.muted(', restyled for Tokamak.')}`;
  return `\n${banner}\n\n${tagline}\n\n`;
}
```

- [ ] **Step 4: Run test**

Run:
```bash
bun test __tests__/banner.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/packages/tokagentos/
git commit -m "tokagentos: add banner renderer with TTY + NO_COLOR detection"
```

---

### Task 15: Wire banner into CLI entry

**Files:**
- Modify: `tokagentos/packages/tokagentos/src/cli.ts`

- [ ] **Step 1: Read the current entry point**

Run:
```bash
cat /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos/packages/tokagentos/src/cli.ts
```
Expected: current shebang + commander setup ending with `await program.parseAsync();`.

- [ ] **Step 2: Add banner import and print call**

Edit `tokagentos/packages/tokagentos/src/cli.ts` — add import near the other imports:
```typescript
import { renderBanner } from "./banner.js";
```

And replace the final section with:
```typescript
const argv = process.argv.slice(2);
const wantsBanner = argv.length === 0 || argv.includes('--help') || argv.includes('-h');
if (wantsBanner) {
  process.stdout.write(renderBanner());
}

program.action(defaultAction);

await program.parseAsync();
```

- [ ] **Step 3: Build and run the CLI**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos/packages/tokagentos
bun run build
./dist/cli.js --help
```
Expected: gradient TOKAGENTOS banner appears above the help text, tagline visible under the banner.

- [ ] **Step 4: Verify suppression in non-TTY context**

Run:
```bash
./dist/cli.js --help | cat
```
Expected: help text printed; banner is absent (no ASCII art, no gradient escapes).

- [ ] **Step 5: Verify NO_COLOR suppression**

Run:
```bash
NO_COLOR=1 ./dist/cli.js --help
```
Expected: help text printed; banner is absent.

- [ ] **Step 6: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/packages/tokagentos/src/cli.ts
git commit -m "tokagentos: render gradient banner on bare invocation and --help"
```

---

### Task 16: Theme status messages and clack prompt output

**Files:**
- Modify: `tokagentos/packages/tokagentos/src/cli.ts`
- Modify: `tokagentos/packages/tokagentos/src/commands/upgrade.ts`
- Modify: `tokagentos/packages/tokagentos/src/commands/create.ts`

Note: `@clack/prompts` does not expose a public theming API; colors inside its prompt widgets are fixed by the library. Theming is scoped to (a) messages we pass to `clack.cancel/outro/note`, and (b) our own status output around clack calls.

- [ ] **Step 1: Theme the cancel message in cli.ts**

In `tokagentos/packages/tokagentos/src/cli.ts`, locate:
```typescript
if (clack.isCancel(choice)) {
  clack.cancel("Operation cancelled.");
  process.exit(0);
}
```

Replace with:
```typescript
import { c } from "./theme.js";
// ...
if (clack.isCancel(choice)) {
  clack.cancel(c.warning("Operation cancelled."));
  process.exit(0);
}
```

- [ ] **Step 2: Theme status output in create.ts**

In `tokagentos/packages/tokagentos/src/commands/create.ts`, find any `console.log` / `clack.note` / `clack.outro` calls that print status text. For each one, wrap the user-facing label in the appropriate palette helper:
- Success/completion → `c.secondary(...)`
- Error → `c.error(...)`
- Branded prompt/header → `c.brandBold(...)`

Example:
```typescript
// Before
clack.outro("Project created.");
// After
import { c } from "../theme.js";
clack.outro(c.secondary("✓ Project created."));
```

Audit all `console.log`, `clack.cancel`, `clack.outro`, `clack.note` call sites in `create.ts` and apply palette helpers consistently.

- [ ] **Step 3: Theme status output in upgrade.ts**

Apply the same treatment to `tokagentos/packages/tokagentos/src/commands/upgrade.ts`. Audit `console.log`, `clack.cancel`, `clack.outro`, `clack.note` call sites.

- [ ] **Step 4: Build and eyeball**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos/packages/tokagentos
bun run build
./dist/cli.js
```
Interact with the default-action prompt (`Ctrl+C` to cancel). Expected: cancel message renders in fuchsia.

- [ ] **Step 5: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/packages/tokagentos/src/
git commit -m "tokagentos: apply palette to CLI status and cancel messages"
```

---

### Task 17: Override Commander.js help formatter (TDD)

**Files:**
- Create: `tokagentos/packages/tokagentos/src/help-formatter.ts`
- Create: `tokagentos/packages/tokagentos/__tests__/help-formatter.test.ts`
- Modify: `tokagentos/packages/tokagentos/src/cli.ts`

- [ ] **Step 1: Write the failing test**

Create `tokagentos/packages/tokagentos/__tests__/help-formatter.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { applyHelpTheme } from '../src/help-formatter.js';

describe('applyHelpTheme', () => {
  it('returns the same Command instance (chainable)', () => {
    const cmd = new Command();
    expect(applyHelpTheme(cmd)).toBe(cmd);
  });

  it('produces help text containing known section headers', () => {
    const cmd = new Command().name('foo').description('does stuff');
    cmd.command('bar').description('bar cmd');
    applyHelpTheme(cmd);
    const help = cmd.helpInformation();
    // Descriptions and section headers should still be present (theming wraps, doesn't remove).
    expect(help).toContain('Commands');
    expect(help).toContain('bar');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos/packages/tokagentos
bun test __tests__/help-formatter.test.ts
```
Expected: FAIL — module missing.

- [ ] **Step 3: Implement help-formatter.ts**

Create `tokagentos/packages/tokagentos/src/help-formatter.ts`:
```typescript
import type { Command } from 'commander';
import { c } from './theme.js';

export function applyHelpTheme<T extends Command>(cmd: T): T {
  cmd.configureHelp({
    commandUsage: (command) => c.brandBold(command.name()) + ' ' + command.usage(),
    subcommandTerm: (sub) => {
      const name = c.brand(sub.name());
      const args = sub.registeredArguments.map((a) => c.muted(a.name())).join(' ');
      return args ? `${name} ${args}` : name;
    },
    optionTerm: (opt) => {
      // Commander's default optionTerm is "-x, --long <value>"; recolor each piece.
      const flags = opt.flags;
      return flags
        .split(/(\s*,\s*)/)
        .map((part) => {
          if (/^-[^-]/.test(part.trim())) return c.secondary(part);
          if (/^--/.test(part.trim())) return c.highlight(part);
          return part;
        })
        .join('');
    },
  });
  // Section headers — commander prefixes them in helpInformation, wrap via post-process.
  const origHelp = cmd.helpInformation.bind(cmd);
  cmd.helpInformation = () => {
    const text = origHelp();
    return text
      .replace(/^(Commands):/gm, c.warningBold('$1:'))
      .replace(/^(Options):/gm, c.warningBold('$1:'))
      .replace(/^(Usage):/gm, c.warningBold('$1:'));
  };
  return cmd;
}
```

- [ ] **Step 4: Run test**

Run:
```bash
bun test __tests__/help-formatter.test.ts
```
Expected: PASS.

- [ ] **Step 5: Wire into cli.ts**

Edit `tokagentos/packages/tokagentos/src/cli.ts`, add import:
```typescript
import { applyHelpTheme } from "./help-formatter.js";
```

Apply to the root program and each subcommand. After:
```typescript
const program = new Command();
```
Add:
```typescript
applyHelpTheme(program);
```

For each `.command(...)` block, chain `applyHelpTheme` after the command builder completes. Example:
```typescript
// Before
program
  .command("create")
  .description("...")
  .action(create);

// After
applyHelpTheme(
  program
    .command("create")
    .description("...")
    .action(create)
);
```

- [ ] **Step 6: Build and eyeball help output**

Run:
```bash
bun run build
./dist/cli.js --help
./dist/cli.js create --help
```
Expected: section headers appear in bold fuchsia; command names in purple bold; flag short forms in cyan, long forms in lavender; descriptions in default terminal color.

- [ ] **Step 7: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/packages/tokagentos/
git commit -m "tokagentos: theme Commander help output with TAL palette"
```

---

### Task 18: Run final verification gates

**Files:** none modified; verification only.

- [ ] **Step 1: Build gates**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
bun install && bun run build && bun run typecheck && bun run lint:check
```
Expected: all four exit 0.

- [ ] **Step 2: Runtime gates**

Run:
```bash
./packages/tokagentos/dist/cli.js --help
./packages/tokagentos/dist/cli.js --version
./packages/tokagentos/dist/cli.js --help | cat   # no banner
NO_COLOR=1 ./packages/tokagentos/dist/cli.js --help   # no color
```
Expected:
- Gradient banner appears on the first (TTY) invocation.
- Version prints a version string.
- Piped output has no banner and no escape codes.
- NO_COLOR output has no banner and no escape codes.

- [ ] **Step 3: Rename-completeness gate (gate 11)**

Run:
```bash
grep -rE 'elizaOS|elizaos|ElizaOS|ELIZAOS' \
  --exclude-dir=plugins --exclude-dir=node_modules --exclude-dir=dist \
  --exclude-dir=.turbo --exclude-dir=target --exclude-dir=build --exclude-dir=.next \
  --exclude=LICENSE --exclude=NOTICE.md --exclude=bun.lock \
  . | grep -vE '@elizaos/plugin-' \
    | grep -v 'A fork of elizaOS, restyled for Tokamak'
```
Expected: zero lines of output.

- [ ] **Step 4: End-to-end CLI smoke (scaffold a project in a tmp dir)**

Run:
```bash
TMP=$(mktemp -d)
cd "$TMP"
/Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos/packages/tokagentos/dist/cli.js info --json
```
Expected: JSON output listing available templates; exit 0.

- [ ] **Step 5: Commit any last fixes**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git diff --quiet || { git add tokagentos/; git commit -m "tokagentos: final verification-gate fixes"; }
```

---

### Task 19: Final summary commit

**Files:** none modified; logical marker.

- [ ] **Step 1: Check git log**

Run:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git log --oneline --all -- tokagentos/ | head -20
```
Expected: a series of commits from Tasks 1–18, all prefixed `tokagentos:`.

- [ ] **Step 2: Announce done**

Nothing to commit — the fork is complete. Report summary to user:
- Fork location
- Upstream version basis
- Number of commits made under `tokagentos/`
- Banner and verification-gate screenshots (if interactively reviewed)

---

## Self-Review

- **Spec coverage:**
  - §1 Approach → Tasks 1 (copy), 2–4 (rename), 5 (dir rename), 11–17 (restyle) ✓
  - §2 Rename matrix → Tasks 2, 4, 6 ✓
  - §3 Submodules → Task 1 step 3 (kept empty), Task 10 (excluded in grep) ✓
  - §4 Palette + banner + theming → Tasks 11–17 ✓
  - §5 Verification gates → Task 18 ✓
  - §6 Deliverables → Task 7 (NOTICE, LICENSE, README), Task 2 (rename script), this plan ✓

- **Placeholder scan:** every step has concrete commands or code. No "TBD" / "implement later". Task 16 audits existing call sites rather than prescribing exact edits because the current source has only a handful of clack calls (cancel, possibly outro/note) — the step lists the call-site categories to inspect and shows the substitution pattern.

- **Type consistency:** `renderBanner`, `shouldShowBanner`, `applyHelpTheme`, `palette`, `c` — all consistent between definition task and usage task. Banner `BANNER_LINES` exported as `readonly string[]` from generator, imported with that type in `banner.ts`. No naming drift found.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-21-tokagentos-fork.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session, batch execution with checkpoints.

Which approach?
