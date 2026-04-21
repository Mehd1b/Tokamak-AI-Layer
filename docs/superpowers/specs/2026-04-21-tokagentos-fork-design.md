# TokagentOS — Fork of elizaOS with TAL Restyle

**Date:** 2026-04-21
**Author:** mehdi@tokamak.network
**Status:** Design approved; awaiting implementation plan

## Summary

Fork the `elizaOS/eliza` monorepo into a new subfolder of the Tokamak-AI-Layer repository, renamed to "tokagentOS" throughout, and restyled to match TAL's visual palette. The fork keeps the full monorepo structure, preserves upstream elizaOS's MIT license and attribution, and excludes plugin submodules from the rename pass (they remain external dependencies pointing at upstream `elizaos-plugins`).

The work is split into two phases: (A) mechanical rename and build-green, (B) CLI visual restyle to TAL palette. UX changes (new commands, restructured verbs) are explicitly out of scope and deferred.

## Context

- **Source:** `/Users/mehdiberiane/Documents/elizaOS/eliza/`, currently on `develop` branch at `v2.0.0-alpha.223`
- **Destination:** `/Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos/` — a subfolder inside the existing TAL repo, governed by TAL's single `.git`
- **License basis:** elizaOS is MIT-licensed; fork with preserved `LICENSE` + new `NOTICE.md` is permitted and is how MIT forks are normally attributed
- **Style reference:** `Tokamak-AI-Layer/frontend/tailwind.config.ts` — purple primary, fuchsia accent, cyan secondary, dark-first

## Scope

### In scope
- Copy of the eliza monorepo into `TAL/tokagentos/`
- Deterministic text substitution across every non-excluded file (see §2)
- Package renames (npm scope `@elizaos/*` → `@tokagentos/*`, root package, binary name)
- Config dir renames at runtime (`.eliza/` → `.tokagent/`, `.elizadb` → `.tokagentdb`)
- URL and metadata updates (homepage, repo, author, email)
- CLI visual restyle: gradient banner, palette-aware prompts, themed help output, cyan spinners
- Reproducible rename script committed alongside the fork
- Build/typecheck/lint green on the full monorepo

### Out of scope (explicitly)
- Renaming or vendoring plugin submodules (`plugins/*`) — they stay pointing at `github.com/elizaos-plugins/*`
- Web client (`packages/ui`) restyle — separate project, future
- CLI UX redesign (new commands, restructured verbs) — deferred
- npm publishing
- Any port or rewrite of elizaOS source logic

## Design

### §1 — Approach (two phases)

**Phase A: Fork + mechanical rename**

1. Copy the current `eliza/` tree (excluding `.git/`, `node_modules/`, `dist/`, build caches) to `TAL/tokagentos/`
2. Do not initialize submodules during the copy — `plugins/*` stays as empty submodule pointers
3. Run the deterministic substitution pass (see §2)
4. Rewrite `package.json` fields — names, bin entries, dependency keys, workspace globs, turbo refs
5. Rename the binary: `elizaos` → `tokagentos`
6. Regenerate lockfile from scratch (`bun install`)
7. Build, typecheck, lint until green
8. Commit the entire `tokagentos/` subfolder into TAL's existing git history in one logical commit

**Phase B: CLI visual restyle**

9. Add gradient banner to `tokagentos` bare invocation and `--help` output
10. Theme `@clack/prompts` with TAL palette
11. Override Commander.js help formatter to color-code commands, flags, sections
12. Replace spinner frames and success/error glyphs with palette-matched equivalents
13. Verify TTY detection and `NO_COLOR` fallback

### §2 — Rename matrix

**Case-sensitive substitutions, applied in this order:**

| From | To |
|---|---|
| `@elizaos/` | `@tokagentos/` — **but only for packages defined inside this monorepo** (see package allowlist below) |
| `elizaOS` | `tokagentOS` |
| `ElizaOS` | `TokagentOS` |
| `ELIZAOS` | `TOKAGENTOS` |
| `elizaos` | `tokagentos` |

**`@elizaos/` scope rule:** A reference `@elizaos/<name>` is rewritten to `@tokagentos/<name>` if and only if `<name>` corresponds to a package in the fork's own `packages/` directory (e.g., `@elizaos/core`, `@elizaos/client`, `@elizaos/server`). References to plugin packages published by the upstream `elizaos-plugins` org (e.g., `@elizaos/plugin-anthropic`, `@elizaos/plugin-discord`) **stay as `@elizaos/*`** because that is the actual published name on npm — the fork does not re-publish those plugins.

Implementation: the rename script builds the package allowlist from `tokagentos/packages/*/package.json` name fields, then rewrites `@elizaos/<name>` → `@tokagentos/<name>` only when `<name>` appears in the allowlist.

**Contextual substitutions** (applied only where the token stands for the product, not the historical ELIZA chatbot):

| From | To | Scope |
|---|---|---|
| `eliza` (standalone) | `tokagent` | Root `package.json` `name` field, shell scripts, `start:eliza` script name, config dir names |
| `.eliza/` | `.tokagent/` | Runtime config dir (user reconfigures once after migration) |
| `.elizadb` | `.tokagentdb` | Runtime DB path |
| `ELIZA_*` | `TOKAGENT_*` | Environment variable prefixes (verified by grep during execution) |

**Preserved verbatim:**

- Any occurrence inside `LICENSE` (original copyright + permission notice)
- The tagline string `A fork of elizaOS, restyled for Tokamak.` (see §4)
- Documentation prose referring to the historical 1960s ELIZA chatbot (if present; verified during execution)

**Excluded paths (not rewritten at all):**

- `plugins/**` — external submodules we do not own
- `node_modules/**`, `dist/**`, `.turbo/**`, `target/**`, `build/**`, `.next/**` — build artifacts
- `LICENSE` — legal attribution preserved verbatim
- Lockfiles (`bun.lock`, `package-lock.json`) — regenerated after rename, not string-substituted

**URLs and metadata:**

| Field | From | To |
|---|---|---|
| `package.json` → `homepage` | `https://elizaos.ai` | `https://tokagentos.ai` (placeholder, not live yet) |
| `package.json` → `repository.url` | `https://github.com/elizaos/eliza` | `https://github.com/tokamak-network/Tokamak-AI-Layer/tree/main/tokagentos` |
| `package.json` → `author` | `elizaOS Team` | `Tokamak Network` |
| `package.json` → author email (where present) | varies | `mehdi@tokamak.network` |
| `.gitmodules` submodule URLs | `github.com/elizaos-plugins/*` | unchanged (external repos) |

### §3 — Plugin submodules

`plugins/*` contains ~30 git submodules pointing at `github.com/elizaos-plugins/*` (plugin-anthropic, plugin-discord, plugin-evm, plugin-openai, etc.). The fork keeps these as external dependencies.

Consequences accepted by this design:

- `.gitmodules` is kept as-is with upstream `elizaos-plugins` URLs
- Code inside `plugins/*` is excluded from the rename pass
- Cross-references in the main monorepo to plugin packages (e.g., `"@elizaos/plugin-anthropic": "workspace:*"`) stay using the `@elizaos/` scope because that is the plugin's actual published name
- A developer who runs `git submodule update --init` inside the fork pulls the upstream elizaOS plugins unchanged
- Future work (not part of this spec) could fork selected plugins into the Tokamak org and rewrite the references

### §4 — CLI visual restyle

**Palette (TAL → CLI role):**

| CLI role | Hex | TAL source |
|---|---|---|
| Primary brand | `#A855F7` | `accent.primary` |
| Brand gradient start | `#7C3AED` | `accent.secondary` |
| Brand gradient end | `#D946EF` | `fuchsia.accent` |
| Secondary accent / success | `#06B6D4` | `cyan.accent` |
| Highlight light | `#C084FC` | `primary.light` |
| Warning | `#D946EF` | `fuchsia.accent` |
| Error | `#EF4444` | neutral (accessibility) |
| Muted / secondary text | `#6B7280` | neutral |

Colors are emitted as truecolor ANSI escapes via `chalk`. `picocolors` remains the fallback for `NO_COLOR` and non-TTY environments.

**Banner:**

- Text: `TOKAGENTOS` in ANSI block-letter style (6-row figlet render), pre-generated at build time and stored as a string constant — no runtime figlet dependency.
- Applied with a left-to-right purple→fuchsia gradient (`#7C3AED` → `#A855F7` → `#D946EF`) via `gradient-string`.
- Tagline below the banner: `A fork of elizaOS, restyled for Tokamak.` — muted gray, with the word `elizaOS` in primary purple as visible attribution.
- Shown on `tokagentos` bare invocation and `tokagentos --help`.
- Suppressed when stdout is not a TTY (pipes, CI) and when `NO_COLOR` is set.

**Prompt theming (`@clack/prompts`):**

- Prompt marker glyph → primary purple
- Spinner frames → cyan
- Success glyph `◆` → cyan
- Error glyph `■` → red
- Cancel glyph → fuchsia

**Help output (Commander.js):**

- Commander's help formatter is overridden to apply:
  - Command names → purple bold
  - Flag short forms (`-h`) → cyan
  - Flag long forms (`--help`) → lavender
  - Section headers (`Commands:`, `Options:`) → fuchsia bold
  - Descriptions → default terminal color

**New dependencies added to `packages/tokagentos/package.json`:**

- `chalk@^5` — truecolor hex support
- `gradient-string@^3` — banner gradient

No `figlet` runtime dependency — banner text is pre-rendered at build time and imported as a TypeScript string constant.

### §5 — Verification gates

The fork is not considered complete until all of these pass:

**Build:**

1. `bun install` resolves the new `@tokagentos/*` lockfile without errors
2. `bun run build` succeeds across the whole monorepo
3. `bun run typecheck` clean
4. `bun run lint:check` clean
5. `packages/tokagentos/` produces a working CLI binary

**Runtime:**

6. `tokagentos --help` runs; gradient banner renders; exits 0
7. `tokagentos --version` returns the current version
8. At least one end-to-end CLI command (the main scaffold command) runs successfully
9. `NO_COLOR=1 tokagentos --help` renders with no escape codes
10. `tokagentos --help | cat` suppresses the banner (TTY detection works)

**Rename completeness:**

11. `grep -rE "elizaOS|elizaos|ElizaOS|ELIZAOS"` across the fork — excluding `plugins/`, `node_modules/`, `dist/`, `target/`, `LICENSE`, `NOTICE.md`, the tagline string, and any reference matching `@elizaos/plugin-*` (which legitimately stays per §2 and §3) — returns zero matches.

**Visual:**

12. Manual eyeball check confirms banner gradient, palette-coloured prompts, cyan spinner, red errors, themed help output.

Failure modes: in-place fixes and re-run gates. Structural failures (e.g., undetected cross-package coupling that breaks under scope change) are surfaced before continuing.

### §6 — Deliverables

1. `TAL/tokagentos/` — the renamed and restyled fork
2. `TAL/tokagentos/LICENSE` — copied verbatim from elizaOS (MIT requires preserving original attribution)
3. `TAL/tokagentos/NOTICE.md` — fork attribution with upstream link and version basis
4. `TAL/tokagentos/README.md` — rebranded, with a "Based on elizaOS" section near the top
5. `TAL/tokagentos/scripts/rename.mjs` — the reproducible rename script, so future upstream pulls can be re-rebranded deterministically
6. `TAL/docs/superpowers/specs/2026-04-21-tokagentos-fork-design.md` — this document
7. A single logical git commit in TAL adding the full `tokagentos/` subfolder

## Risks and open questions

- **Lockfile regeneration may surface transitive dependency conflicts** that the current eliza lockfile resolved. Mitigation: regenerate with `bun install`, fix conflicts as they appear. If serious, surface to user before proceeding.
- **Turbo pipeline may reference package names in `turbo.json`** that need renaming. Covered by §2 but verified during execution.
- **Workspace `package.json` references to plugin packages** (`@elizaos/plugin-*` in `dependencies`) will stay as `@elizaos/*` because that is the published name of the plugin. Listed here so this isn't flagged as a missed rename during verification gate 11.
- **Tagline contains "elizaOS" deliberately** — this is attribution, not a missed rename. The verification grep step must allowlist this string.
- **No smoke test exists for every CLI command** — verification gate 8 covers the main scaffold command; edge-case commands may have latent breakage not caught until runtime.
- **Config dir rename breaks existing user state** — a user who has `.eliza/` from the upstream CLI will not see their config carried over. Acceptable because the fork is a clean new CLI, not an upgrade path.

## Next step

Produce the implementation plan via the `superpowers:writing-plans` skill.
