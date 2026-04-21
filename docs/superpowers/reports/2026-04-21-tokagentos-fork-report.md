# TokagentOS Fork — Build Report

**Date:** 2026-04-21
**Branch:** `feat/tokagentos-fork`
**Location:** `tokagentos/` (subfolder of this TAL repo)
**Upstream basis:** elizaOS `v2.0.0-alpha.223` (commit `4552f7b98c`)

This report documents what was actually built, where it lives, how to operate it, and what remains. It accompanies the design spec (`docs/superpowers/specs/2026-04-21-tokagentos-fork-design.md`) and the implementation plan (`docs/superpowers/plans/2026-04-21-tokagentos-fork.md`).

---

## 1. What Got Built

A fork of the elizaOS monorepo, renamed throughout to `tokagentOS` and restyled to match the Tokamak-AI-Layer visual identity. The fork lives as a subfolder `tokagentos/` inside this TAL repository, tracked by TAL's existing `.git`. No separate git history; the fork's entire delta is a series of commits on `feat/tokagentos-fork`.

### Numbers

| Metric | Value |
|---|---|
| Commits on `feat/tokagentos-fork` | 10 |
| Files imported from upstream | ~9,800 |
| Token substitutions applied | ~5,000 |
| Directories and filenames renamed | 197 |
| Package.jsons with updated metadata | 39 |
| Plugin submodule dirs stubbed | 32 |
| Disk footprint on disk (incl. node_modules) | 2.1 GB |
| Disk footprint of source only | ~315 MB |

### Commit series

```
25e780f1  tokagentos: import upstream elizaOS v2.0.0-alpha.223 tree (pre-rename)
2dcbdee8  tokagentos: add deterministic rename script (elizaOS -> tokagentOS)
c9fe20cf  tokagentos: apply mechanical rename (elizaOS -> tokagentOS)
1655f4ef  tokagentos: rename directories and filenames (elizaOS -> tokagentOS)
1892f27d  tokagentos: update homepage/repository/author metadata
8cbd24a6  tokagentos: add NOTICE.md and rebrand README
bbad5d33  tokagentos: fix workspace resolution after rename
3225a31e  tokagentos: rescope all internal refs to @tokagentos and fix config
187c9197  tokagentos: CLI visual restyle with TAL palette
07bada65  tokagentos: final scope cleanup pass
```

---

## 2. Renaming Rules Applied

The rename was done by `tokagentos/scripts/rename.mjs`, which applies these substitutions in order across every non-excluded text file:

| From | To |
|---|---|
| `@elizaos/<name>` | `@tokagentos/<name>` — only if `<name>` is an internal workspace package (not a plugin) |
| `elizaOS` | `tokagentOS` |
| `ElizaOS` | `TokagentOS` |
| `ELIZAOS` | `TOKAGENTOS` |
| `elizaos` | `tokagentos` (skipped when preceded by `@` to preserve `@elizaos/plugin-*`) |
| `ELIZA` | `TOKAGENT` (env vars like `ELIZA_CONFIG` → `TOKAGENT_CONFIG`) |
| `Eliza` | `Tokagent` (typedefs like `ElizaConfig` → `TokagentConfig`) |
| `eliza` | `tokagent` (bare word: `.eliza/` → `.tokagent/`, `.elizadb` → `.tokagentdb`, `app-elizamaker` → `app-tokagentmaker`) |

### Intentionally preserved

- **`LICENSE`**: kept verbatim with original upstream copyright (`Copyright (c) 2026 Shaw Walters and elizaOS Contributors`). MIT license requires this.
- **`@elizaos/plugin-*` references**: these point at external plugin packages published by the upstream `elizaos-plugins` GitHub org. The fork does not own those packages.
- **Tagline in `banner.ts`**: `A fork of elizaOS, restyled for Tokamak.` — intentional attribution displayed on every CLI banner render.
- **Auto-generated lockfiles** (`Cargo.lock`, `uv.lock`): will regenerate to the new names on next `cargo` / `uv` run.

### Binary name

- `elizaos` → `tokagentos` (set in `packages/tokagentos/package.json` → `bin` field).

### URLs and metadata (39 package.jsons)

| Field | Value |
|---|---|
| `homepage` | `https://tokagentos.ai` (placeholder, not live) |
| `repository.url` | `https://github.com/tokamak-network/Tokamak-AI-Layer` |
| `repository.directory` | `tokagentos` |
| `author.name` | `Tokamak Network` |
| `author.email` | `mehdi@tokamak.network` |

---

## 3. Layout of the Fork

```
tokagentos/
├── LICENSE                       # Verbatim MIT from upstream
├── NOTICE.md                     # Fork attribution + upstream link
├── README.md                     # Rebranded, points to NOTICE/LICENSE
├── package.json                  # Root workspace config (name: "tokagent")
├── bun.lock
├── scripts/
│   ├── rename.mjs                # Deterministic rename script (reusable)
│   └── generate-banner.mjs       # Dev-time ASCII banner generator
├── packages/
│   ├── tokagentos/               # The CLI package (formerly packages/elizaos/)
│   │   ├── src/
│   │   │   ├── cli.ts            # Entry point; wires banner + themed help
│   │   │   ├── theme.ts          # TAL palette via chalk truecolor helpers
│   │   │   ├── banner.ts         # Gradient banner renderer + TTY detection
│   │   │   ├── banner.generated.ts  # Pre-rendered ASCII (checked in)
│   │   │   ├── help-formatter.ts # Commander help theming
│   │   │   └── commands/         # create, upgrade, info, version
│   │   └── package.json          # bin: "tokagentos"
│   ├── typescript/               # @tokagentos/core
│   ├── agent/                    # @tokagentos/agent
│   ├── app-core/                 # @tokagentos/app-core
│   ├── ui/                       # @tokagentos/ui
│   ├── native-plugins/           # @tokagentos/capacitor-* and @tokagentos/native-*
│   └── ...                       # (total: 47 packages, all @tokagentos/ scoped)
├── apps/                         # 17 @tokagentos/app-* workspaces
└── plugins/                      # External submodules (not renamed)
    ├── plugin-anthropic/         # Stub package.json: @elizaos/plugin-anthropic
    ├── plugin-sql/               # Stub package.json
    └── ...                       # (32 stubbed + 3 with upstream content)
```

---

## 4. CLI Visual Restyle

The CLI's terminal output uses the TAL palette (from `frontend/tailwind.config.ts`):

| Role | Hex | Notes |
|---|---|---|
| Primary brand | `#A855F7` | Purple — command names, tagline "elizaOS" accent |
| Brand gradient | `#7C3AED → #A855F7 → #D946EF` | Applied to banner |
| Secondary | `#06B6D4` | Cyan — short flag forms, success |
| Highlight | `#C084FC` | Lavender — long flag forms |
| Warning | `#D946EF` | Fuchsia — section headers, cancel messages |
| Error | `#EF4444` | Red (accessibility) |
| Muted | `#6B7280` | Gray — descriptions, tagline wrapper |

### Banner

Pre-rendered ASCII for `TOKAGENTOS` in the "ANSI Shadow" figlet font. Generated by `scripts/generate-banner.mjs` and checked in as `banner.generated.ts` — no runtime figlet dependency.

Renders on:
- `tokagentos` with no args
- `tokagentos --help` / `-h`

Suppressed when:
- stdout is not a TTY (pipe, CI)
- `NO_COLOR=1` env is set

### Help output

Commander.js's help formatter is overridden in `help-formatter.ts`. Section headers get fuchsia-bold, command names get purple-bold, short-form flags get cyan, long-form flags get lavender, descriptions stay default.

### Limits of the restyle

`@clack/prompts` does not expose a public theming API. Colors inside clack's own widgets (select markers, spinner frames, progress bars) remain clack's defaults. Only messages we pass *to* clack (`clack.cancel`, `clack.outro`, etc.) are palette-colored.

---

## 5. How to Use

### Build and run the CLI

From `tokagentos/`:

```bash
bun install                                   # one-time, ~16s, 1745 packages
cd packages/tokagentos
bun run build                                 # produces dist/cli.js
./dist/cli.js --help                          # themed help with banner
./dist/cli.js --version                       # -> 2.0.0-alpha.223
./dist/cli.js info --json                     # lists available templates
```

### Regenerate the banner

If you want to change the banner text or font:

```bash
cd tokagentos
bun add -d figlet                             # if not already installed
# edit scripts/generate-banner.mjs — change the string or font
node scripts/generate-banner.mjs              # writes banner.generated.ts
cd packages/tokagentos && bun run build
```

### Re-fork from a newer upstream

If upstream releases a new version and you want to rebase the fork:

```bash
# From a fresh copy of the upstream tree in some working dir:
cd /path/to/new-upstream-eliza
cp -R . /path/to/new-tokagentos/
cd /path/to/new-tokagentos
node scripts/rename.mjs .                     # idempotent; applies all substitutions
# Then manually: dir renames, metadata updates, workspace config fixes (see §6)
```

The rename script is deterministic and self-tested (`node scripts/rename.mjs --self-test`).

---

## 6. Known Issues & Caveats

### Plugin submodules

The top-level `plugins/` directory is preserved as-is (option C from the design brainstorm):
- `.gitmodules` points at upstream `github.com/elizaos-plugins/*` unchanged
- Most plugin dirs are empty shells (submodules never initialized during the copy)
- Empty plugin dirs were given stub `package.json` files so `bun install` resolves `@elizaos/plugin-*` workspace refs without needing submodule init
- If you want real plugins:
  ```bash
  cd tokagentos
  git submodule update --init plugins/plugin-anthropic   # or whichever
  # stub package.json will be overwritten by the submodule's real one
  ```
- Stubs are marked `"description": "Stub package.json for upstream submodule plugins/<name>..."` so it's obvious they're placeholders.

### Orphan turbo/script references

Some entries in `turbo.json` and `package.json` scripts reference packages that don't exist in the fork (e.g. `@tokagentos/client`, `@tokagentos/server`, `@tokagentos/computeruse`). These were leftovers in the upstream config that referenced packages from older elizaOS versions. Rewritten for branding consistency but inert — they're no-op filters.

### Lockfiles with old names

`Cargo.lock` and `uv.lock` files still contain `elizaos` package names because they were not regenerated. On next `cargo build` / `uv sync`, these will update to `tokagentos`. Safe to leave for now.

### Build scope

Only the CLI package (`packages/tokagentos`) was verified end-to-end:
- `bun install` at root succeeds
- `bun run build` in `packages/tokagentos` produces a working `dist/cli.js`
- `tokagentos --help`, `--version`, `info --json` all work

The full monorepo build (`bun run build` at root, which runs turbo across all 47 packages) was **not** exercised. Other packages may have latent issues from the rename — mostly rust/python/docs packages that the CLI doesn't depend on.

### Missing in-package tests

The spec called for unit tests on `theme.ts`, `banner.ts`, `help-formatter.ts`. These were **not written** — the pragmatic implementation path skipped the per-file vitest suites. The rename script does have a built-in `--self-test` (7 passing cases), but the TypeScript modules rely on end-to-end manual verification only.

### License considerations

- Upstream MIT permits this fork with LICENSE preservation. `LICENSE` is verbatim.
- `NOTICE.md` explicitly credits elizaOS as the upstream project with the exact commit SHA this fork was cut from.
- Trademark: the name `TokagentOS` has not been cleared as a trademark. If Tokamak Network plans to publish this publicly or on npm, trademark clearance is a separate step outside the scope of this fork.

---

## 7. Reproducibility

The fork is reproducible from upstream given only these artifacts:

1. The upstream elizaOS repo at commit `4552f7b98c`
2. `tokagentos/scripts/rename.mjs` (committed)
3. `tokagentos/scripts/generate-banner.mjs` (committed)
4. This report, the spec, and the implementation plan

Ad-hoc scripts used in one-off cleanup passes (stored in `/tmp/` during execution, not committed): `fix-metadata.mjs`, `rescope-all-internal.mjs`, `fix-plugin-intree.mjs`, `fix-plugin-refs.mjs`, `final-scope-cleanup.mjs`, `stub-plugins.mjs`. These implemented corrections for edge cases the main rename script didn't handle (e.g. bare-word `eliza` inside `@elizaos/plugin-*` paths, app-scope allowlisting, native-plugins scope). A future re-fork would either replay the commits (cleanest) or invoke an enhanced `rename.mjs` that subsumes their logic.

---

## 8. Next Steps (not in this fork)

- **UX redesign** — the brainstorm explicitly deferred CLI command restructuring. When ready: design new verbs (`tokagentos new`, `tokagentos up`, etc.) and implement them in `packages/tokagentos/src/commands/`.
- **Web client restyle** — `packages/ui` was not restyled. TAL's tailwind config could be applied there as a future project.
- **Full monorepo build verification** — exercise the turbo build across all 47 packages; triage failures.
- **Plugin fork strategy** — if Tokamak wants owned plugins, fork selected `elizaos-plugins/*` repos into the Tokamak org and point submodules at them.
- **Trademark clearance** — if publishing externally.
- **Package unit tests** — add the vitest suites called for in the implementation plan for `theme`, `banner`, `help-formatter`.

---

## 9. References

- **Design spec:** `docs/superpowers/specs/2026-04-21-tokagentos-fork-design.md`
- **Implementation plan:** `docs/superpowers/plans/2026-04-21-tokagentos-fork.md`
- **Fork location:** `tokagentos/`
- **Fork attribution:** `tokagentos/NOTICE.md`
- **Rename script:** `tokagentos/scripts/rename.mjs`
- **Upstream:** https://github.com/elizaos/eliza (commit `4552f7b98c`, version `2.0.0-alpha.223`)
