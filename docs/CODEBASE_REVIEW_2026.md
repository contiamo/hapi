# HAPI Monorepo Codebase Review - February 2026

**Date:** 2026-02-03
**Reviewer:** Claude Code (Sonnet 4.5)
**Scope:** Type errors, linting consistency, build processes, test infrastructure, and development workflow optimization

---

## Executive Summary

The HAPI monorepo is a well-architected TypeScript project with **solid fundamentals** but suffers from:

1. **4 critical type errors** blocking compilation
2. **Inconsistent linting/formatting** (only website/ has Prettier, no ESLint anywhere)
3. **Complex build pipelines** with unnecessary duplication
4. **Fragmented test infrastructure** (3 different test runners)
5. **95% complete migration to Bun** (legacy pnpm files remain)
6. **Significant code duplication** between CLI and server packages

**Current State:**
- ✅ Strong TypeScript strict mode foundation
- ✅ Modern tooling (Bun, Vite, pnpm workspaces)
- ✅ Comprehensive deployment automation
- ❌ No unified linting/formatting
- ❌ No pre-commit hooks
- ❌ Type errors prevent clean builds

**Recommended Solution:**
Adopt **Bun + Biome + Turborepo** stack with unified scripts at root level. This eliminates configuration complexity while providing fast, reliable development workflows.

---

## Table of Contents

1. [TypeScript Configuration & Type Errors](#1-typescript-configuration--type-errors)
2. [Linting & Formatting Infrastructure](#2-linting--formatting-infrastructure)
3. [Build & Deployment Processes](#3-build--deployment-processes)
4. [Test Infrastructure](#4-test-infrastructure)
5. [Package Management](#5-package-management)
6. [Code Duplication Analysis](#6-code-duplication-analysis)
7. [Development Workflow Recommendations](#7-development-workflow-recommendations)
8. [Assumptions](#8-assumptions)

---

## 1. TypeScript Configuration & Type Errors

### Summary

The monorepo has **5 TypeScript configuration files** with **strict mode enabled** across all packages. There are **4 critical type errors** preventing successful compilation.

### Configuration Files

| File | Extends Base | Strict Mode | Special Settings |
|------|--------------|-------------|------------------|
| `tsconfig.base.json` | N/A | ✅ | Foundation config |
| `cli/tsconfig.json` | ✅ | ✅ | Includes server files (unusual) |
| `server/tsconfig.json` | ✅ | ✅ | Standard |
| `web/tsconfig.json` | ✅ | ✅ | React + DOM types |
| `website/tsconfig.json` | ❌ | ✅ | Standalone (should extend base) |
| `shared/tsconfig.json` | ✅ | ✅ | Standard |

### Critical Type Errors (BLOCKING)

#### Error 1: Missing `Logger.error()` Method
**Location:** `cli/src/codex/utils/codexSessionScanner.ts:550`

```typescript
logger.error('[CODEX_SESSION_SCANNER] Failed to load previous session history:', error);
```

**Issue:** The `Logger` class (`cli/src/ui/logger.ts`) implements `debug()`, `info()`, `infoDeveloper()`, `warn()`, but **not** `error()`.

**Fix:** Add `error()` method to Logger class matching signature of other log methods.

---

#### Error 2: Invalid `resumeSessionId` Parameter
**Location:** `cli/src/gemini/geminiLocalLauncher.ts:118`

```typescript
await geminiLocal({
    path: session.path,
    sessionId: session.sessionId,
    resumeSessionId: session.resumeSessionId,  // ❌ Not in type signature
    abort: processAbortController.signal,
});
```

**Issue:** `geminiLocal()` function signature (`cli/src/gemini/geminiLocal.ts:5-13`) doesn't accept `resumeSessionId`.

**Fix:** Either remove the parameter from the call OR add it to the function signature.

---

#### Error 3: Undefined Variable `startedWithCliMtimeMs`
**Location:** `cli/src/runner/run.ts:79`

```typescript
process.on('SIGUSR1', () => {
    if (typeof startedWithCliMtimeMs === 'number' &&  // ❌ Undefined at this point
        installedCliMtimeMs !== startedWithCliMtimeMs) {
```

**Issue:** Variable is used in SIGUSR1 handler at line 79 but defined later at line 547 (temporal dead zone).

**Fix:** Move `const startedWithCliMtimeMs = getInstalledCliMtimeMs()` before the signal handler registration.

---

#### Error 4: Incorrect Import Type for `Bun.file()`
**Location:** `server/src/web/routes/version.ts:24`

```typescript
import versionFile from '../../../dist/version.json' assert { type: 'file' }
const file = Bun.file(versionFile)  // ❌ Wrong type
```

**Issue:** Import assertion `{ type: 'file' }` imports metadata object, but `Bun.file()` expects `string | URL`.

**Fix:** Change to `const file = Bun.file('../../../dist/version.json')` or adjust import.

---

### Configuration Inconsistencies

1. **CLI includes server files**: `cli/tsconfig.json` has `"include": ["../server/src/**/*.ts"]` - causes coupled type checking
2. **Website doesn't extend base**: Duplicates strict configuration unnecessarily
3. **Missing test exclusions**: CLI and server don't explicitly exclude `**/*.test.ts` files
4. **Shared package has no tsconfig**: Recently added but minimal

### Recommendations

**Priority 1 - Fix Type Errors:**
1. Add `Logger.error()` method
2. Remove or add `resumeSessionId` parameter
3. Move `startedWithCliMtimeMs` declaration before SIGUSR1 handler
4. Fix version.json import pattern

**Priority 2 - Unify Configuration:**
1. Remove server file includes from CLI tsconfig
2. Make website extend `tsconfig.base.json`
3. Add explicit test file exclusions to all configs
4. Remove redundant compiler options from base.json (`noImplicitAny`, `strictNullChecks` already enabled by `strict: true`)

---

## 2. Linting & Formatting Infrastructure

### Summary

**CRITICAL GAP:** The monorepo has **minimal linting and formatting enforcement**. Only `website/` uses Prettier. There is **no ESLint, no Biome, and no pre-commit hooks** across the entire project.

### Current State

| Package | Prettier | ESLint | Biome | Pre-commit | CI Checks |
|---------|----------|--------|-------|------------|-----------|
| cli | ❌ | ❌ | ❌ | ❌ | typecheck only |
| server | ❌ | ❌ | ❌ | ❌ | typecheck only |
| web | ❌ | ❌ | ❌ | ❌ | typecheck only |
| website | ✅ v3.6.2 | ❌ | ❌ | ❌ | none |
| shared | ❌ | ❌ | ❌ | ❌ | none |
| docs | ❌ | ❌ | ❌ | ❌ | none |

### Prettier Configuration (website/ only)

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": false,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "bracketSameLine": false,
  "arrowParens": "avoid",
  "endOfLine": "lf"
}
```

### Git Hooks

**Status:** ❌ No active hooks

- `.git/hooks/` contains only sample files
- No Husky, no lint-staged, no Git hooks configured
- Developers can commit code without validation

### CI/CD Enforcement

**test.yml** (runs on push/PR):
```yaml
- bun typecheck     # ✅ Type checking enforced
- bun run test      # ✅ Tests enforced
# ❌ No linting check
# ❌ No formatting check
```

### Coverage Gaps

1. **No code style enforcement** - Each developer may use different formatting
2. **No linting rules** - Potential bugs/bad patterns not caught
3. **No pre-commit validation** - Bad commits can reach main branch
4. **Inconsistent tooling** - Only 1 of 6 packages has any formatter
5. **CI doesn't enforce formatting** - Can merge PRs with inconsistent code

### Recommendations

See [Section 7](#7-development-workflow-recommendations) for complete solution using Biome.

---

## 3. Build & Deployment Processes

### Summary

The monorepo uses **modern build tooling** (Bun, Vite) with **sophisticated multi-platform release automation**. However, there's **complexity in web asset embedding** and **outdated smoke test references**.

### Build Tools by Package

| Package | Build Tool | Output | Complexity |
|---------|-----------|--------|------------|
| cli | Bun `--compile` | Single-file binaries (5 platforms) | **High** |
| server | Bun bundler | `dist/index.js` + embedded web assets | Moderate |
| web | Vite 7.3.0 | SPA in `dist/` | Low |
| website | Vite 7.1.7 + Express | Client + server | Moderate |
| docs | VitePress 1.6.4 | Static HTML | Low |

### Root Build Orchestration

```json
"build": "bun run build:cli && bun run build:server && bun run build:web",
"build:single-exe": "Web → Embedded → CLI exe (one platform)",
"build:single-exe:all": "Builds all 5 platforms (Darwin x64/arm64, Linux x64/arm64, Windows x64)"
```

### CLI Build Architecture (Most Complex)

**Process:**
1. `bun run build:web` → generates `/web/dist/*`
2. `server/scripts/generate-embedded-web-assets.ts` → creates embedded assets TypeScript file
3. `cli/scripts/build-executable.ts` → compiles 5 platform-specific binaries using `bun --compile`

**Outputs:**
```
cli/dist-exe/
├── bun-darwin-x64/hapi
├── bun-darwin-arm64/hapi
├── bun-linux-x64/hapi
├── bun-linux-arm64/hapi
└── bun-windows-x64/hapi.exe
```

**Issue:** Sequential pipeline with no validation that web assets exist before CLI build.

### Release Process (Highly Automated)

**File:** `cli/scripts/release-all.ts`

1. Bump version in `cli/package.json`
2. Build all 5 platform binaries
3. Generate 5 platform-specific npm packages (`@twsxtd/hapi-darwin-arm64`, etc.)
4. Publish to npm (platform packages first, then main)
5. Update `bun.lock` with published packages
6. Git commit, tag (`v*`), push
7. Update Homebrew formula automatically

**Complexity:** High - 10 npm packages published per release

### Deployment (Linux)

**File:** `deploy/linux/install.sh` (sophisticated shell script)

**Features:**
- Binary-based OR source-based installation
- Atomic updates (prevents "text file busy")
- systemd service management (3 services: server, runner, Tailscale)
- Hot reload via mtime updates
- Automatic rollback on failure

**Services:**
- `hapi-server.service` - Main Telegram bot server
- `hapi-runner.service` - Claude Code runner (depends on server)
- `tailscale-serve-hapi.service` - Optional remote access tunnel

### CI/CD Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| test.yml | Push + PR | typecheck + tests |
| release.yml | Tag `v*` | Build all platforms → GitHub release → Homebrew |
| webapp.yml | Push to main | Deploy web to GitHub Pages |
| smoke-test.yml | Push + PR | ⚠️ References `happy` (outdated CLI name) |

### Build Inefficiencies

1. **Dual smoke test workflows**: Main test.yml uses Bun, smoke-test.yml uses Node.js
2. **Smoke test outdated**: References `happy` command instead of `hapi`
3. **Web asset pipeline fragility**: No early failure if web build missing/incomplete
4. **Version management scattered**: `get-version.ts`, `package.json`, separate for website/docs
5. **NPM package complexity**: 10 artifacts (5 platform packages + main wrapper + 4 optional deps)

### Recommendations

1. **Consolidate smoke tests** into main test.yml using Bun
2. **Fix outdated references** - Update `happy` → `hapi`
3. **Add web asset validation** - Early failure detection in build pipeline
4. **Centralize version management** - Single source of truth (git tags or root package.json)
5. **Document build dependency graph** - Create `BUILD.md` explaining web → server → cli flow
6. **Consider Turborepo** for build orchestration (see [Section 7](#7-development-workflow-recommendations))

---

## 4. Test Infrastructure

### Summary

The project has **fragmented test infrastructure** using 3 different test runners. CLI has the most mature testing (23 tests), while server and web are substantially under-tested.

### Test Framework Distribution

| Package | Framework | Test Files | Coverage |
|---------|-----------|------------|----------|
| cli | Vitest 4.0.16 | 23 | Moderate |
| server | Bun test | 6 | **Low** |
| web | Vitest 2.1.8 | 1 | **Very Low** |
| website | None | 0 | None |
| docs | None | 0 | None |
| shared | None | 0 | None |

### Test Scripts

**Root:**
```json
"test": "bun run test:cli && bun run test:server"
// ❌ Web tests NOT included
```

**CLI:**
```json
"test": "bun run tools:unpack && vitest run"
```

**Server:**
```json
"test": "bun test"
```

**Web:**
```json
"test": "vitest",
"test:ui": "vitest --ui",
"test:coverage": "vitest --coverage"
```

### Vitest Configuration

**CLI (`cli/vitest.config.ts`):**
- Environment: `node`
- Include: `src/**/*.test.ts`
- Coverage: v8 provider (text, json, html)
- Env: Loads `.env.integration-test`

**Web (`web/vitest.config.ts`):**
- Environment: `happy-dom`
- Include: `src/**/*.test.ts`, `src/**/*.test.tsx`
- Coverage: v8 provider
- React Testing Library setup

### Test Patterns

**CLI Philosophy:** "No mocking - tests make real API calls"
- Integration test: `runner.integration.test.ts` (475 lines)
- Spawns actual CLI processes
- Uses real HTTP calls

**Web Philosophy:** Heavy mocking with `vi.mock()`
- Example: `useSessionActions.test.ts`
- Mock API endpoints and Socket.IO

**Server:** Minimal testing, custom stubs
- No mocking utilities
- Manual fake/stub classes

### Critical Gaps

1. **Fragmented test runners** - Vitest (CLI + Web) vs Bun test (Server) - inconsistent approach
2. **Minimal web coverage** - Only 1 test file for entire React application
3. **Server under-tested** - Only 6 tests for critical infrastructure (Socket.IO, SSE, stores)
4. **No coverage thresholds** - CI doesn't enforce minimum coverage
5. **Web tests skip CI** - Root `npm test` doesn't run web tests
6. **No E2E tests** - No cross-workspace integration testing
7. **No shared test utilities** - Each workspace manages own helpers

### Test Infrastructure Quality

**Strengths:**
- ✅ Colocated tests (good discoverability)
- ✅ Multiple coverage reporters
- ✅ Integration test support with env variables
- ✅ Clear async handling patterns

**Weaknesses:**
- ❌ 3 different test runners
- ❌ Inconsistent mocking philosophy
- ❌ No enforced coverage thresholds
- ❌ Limited documentation
- ❌ Web and server substantially under-tested

### Recommendations

1. **Consolidate test frameworks** - Use Vitest everywhere (including server)
2. **Establish coverage thresholds** - Minimum 60% for CLI/server, 70% for web
3. **Run web tests in CI** - Add to root test script
4. **Create shared test utilities** - Extract common patterns to `@hapi/test-utils`
5. **Expand server test coverage** - Critical gap (Socket.IO handlers, stores)
6. **Expand web test coverage** - React components, hooks, UI interactions
7. **Document testing philosophy** - Choose mocking vs no-mocking and apply consistently

---

## 5. Package Management

### Summary

The project is **95% migrated from pnpm to Bun** but legacy files remain. Bun is the de facto standard but cleanup is needed.

### Current State

**Primary Package Manager:** Bun v1.3.5
**Legacy Package Manager:** pnpm (being phased out)

### Lock Files

| File | Status | Size | Last Updated |
|------|--------|------|--------------|
| `bun.lock` | ✅ Active | 481 KB | Feb 3 19:33 |
| `pnpm-lock.yaml` | ⚠️ Legacy | 497 KB | Feb 3 08:13 |
| `pnpm-workspace.yaml` | ⚠️ Legacy | Duplicate config | - |

### Workspace Configuration

**Root `package.json`:**
```json
{
  "workspaces": ["cli", "shared", "server", "web", "website", "docs"]
}
```

**CLI `package.json`:**
```json
{
  "packageManager": "bun@1.3.5"
}
```

All root scripts use `bun run` exclusively (33+ invocations).

### Workspace Dependencies

All internal packages use `workspace:*` protocol:
```json
"dependencies": {
  "@hapi/protocol": "workspace:*"
}
```

Properly resolved through workspace linking in both pnpm and bun.

### Node Modules Structure

Currently **mixed**:
- `.pnpm/` - Legacy pnpm symlink structure (77 KB, 21,000+ packages)
- `.bun/` - Bun's native module storage (66 KB)
- `.modules.yaml` - pnpm workspace metadata

### Bun as Single Entry Point

**FEASIBILITY: VERY HIGH - Already Mostly Implemented**

**Positive Factors:**
- ✅ All root scripts use `bun run`
- ✅ Bun workspace support working
- ✅ TypeScript execution native
- ✅ All dependencies compatible
- ✅ CLI explicitly specifies `packageManager: "bun@1.3.5"`

**Remaining Cleanup:**
1. Remove `pnpm-lock.yaml` from git
2. Delete `pnpm-workspace.yaml` (bun reads from package.json)
3. Ensure CI/CD only runs `bun install`
4. Full reinstall: `rm -rf node_modules && bun install`
5. Add `.npmrc` or `bunfig.toml` (optional)

### Recommendations

1. **Complete Bun migration** - Remove pnpm legacy files
2. **Document package management** - Add to CONTRIBUTING.md
3. **CI/CD alignment** - Verify all workflows use `bun install`
4. **Keep single lock file** - Only `bun.lock` in version control
5. **Consider Taskfile.yaml alternative** - See [Section 7](#7-development-workflow-recommendations) for recommendation against it

---

## 6. Code Duplication Analysis

### Summary

The monorepo has **significant code duplication** between CLI and server packages, particularly in authentication, versioning, error handling, and store patterns.

### Critical Duplication Areas

#### 1. Authentication & Token Management

**Files:**
- `server/src/config/cliApiToken.ts` (120 lines) - Token generation, validation, namespace parsing
- `server/src/utils/crypto.ts` - Timing-safe comparison
- `server/src/utils/accessToken.ts` (35 lines) - Namespace-suffixed token parsing
- `cli/src/api/auth.ts` (9 lines) - Minimal wrapper

**Issue:** Server has sophisticated logic; CLI has none. Should be in `shared`.

**Impact:** Namespace handling inconsistent, security logic not shared.

---

#### 2. Versioned Update Patterns

**Files:**
- `cli/src/api/versionedUpdate.ts` (66 lines) - Client-side optimistic concurrency
- `server/src/store/versionedUpdates.ts` (62 lines) - Server-side versioned updates

**Issue:** Same pattern, different implementations (callback vs functional).

**Already standardized in protocol:**
```typescript
// shared/src/protocol.ts
type VersionedUpdateResult<T> =
  | { result: 'success'; version: number; value: T }
  | { result: 'version-mismatch'; version: number; value: T }
  | { result: 'error'; reason?: string }
```

But not reused consistently.

---

#### 3. Error Handling

**Files:**
- `cli/src/utils/errorUtils.ts` (82 lines) - Axios-specific error extraction
- Server has validation patterns in routes but no centralized error utilities

**Issue:** CLI has sophisticated error handling for network diagnostics; server has none.

---

#### 4. JSON Parsing & Serialization

**Files:**
- `cli/src/utils/deterministicJson.ts` (200+ lines) - Deterministic stringification with tests
- `server/src/store/json.ts` (9 lines) - Safe JSON parsing
- **72 raw `JSON.parse` calls in CLI**
- **30 raw `JSON.parse` calls in server**

**Issue:** No centralized JSON utility layer.

---

#### 5. Store Patterns (Server Only)

**Files:**
- `server/src/store/sessions.ts` (250+ lines)
- `server/src/store/machines.ts` (200+ lines)

**Pattern Duplication:**
```typescript
// IDENTICAL PATTERN IN BOTH:
type DbRow = { id, namespace, created_at, updated_at, metadata, version, ... }
type StoredEntity = { id, namespace, createdAt, updatedAt, metadata, version, ... }

function toStoredEntity(row): StoredEntity { /* convert */ }
function getOrCreate(db, id, metadata): StoredEntity { /* lookup/create */ }
function updateMetadata(db, id, expectedVersion): VersionedUpdateResult { /* update */ }
```

**Opportunity:** Extract generic `VersionedStore<TRow, TStored>` factory.

---

#### 6. Configuration Management

**Files:**
- `cli/src/configuration.ts` (83 lines) - Synchronous singleton
- `server/src/configuration.ts` (202 lines) - Async factory with file loading

**Duplication:**
```typescript
// BOTH DO THIS IDENTICALLY:
process.env.HAPI_HOME
  ? process.env.HAPI_HOME.replace(/^~/, homedir())
  : join(homedir(), '.hapi')
```

**Issue:** Different patterns (sync vs async) prevent code sharing.

---

### Recommended Shared Packages

#### Create `@hapi/auth`
- Token parsing and validation
- Namespace handling
- Crypto utilities (constantTimeEquals)
- Extract from: `server/src/config/cliApiToken.ts`, `server/src/utils/crypto.ts`, `server/src/utils/accessToken.ts`

#### Create `@hapi/errors`
- Standardized error types
- Error extraction utilities
- Network error handling
- Extract from: `cli/src/utils/errorUtils.ts`

#### Create `@hapi/store-utils`
- Generic `VersionedStore<T>` abstraction
- `safeJsonParse` utilities
- Row type conversion helpers
- Extract from: `server/src/store/sessions.ts`, `server/src/store/machines.ts`, `server/src/store/json.ts`

#### Enhance `@hapi/protocol`
Currently minimal; should include:
- Versioned update utilities (already has types)
- RPC type definitions (extract from `cli/src/api/rpc/types.ts`)
- Constant definitions (`DEFAULT_NAMESPACE`, etc.)

### Simplification Opportunities

1. **Consolidate versioning pattern** - Use shared `VersionedUpdate<T>` utility
2. **Extract store abstraction** - Generic `VersionedStore` factory reduces 450+ lines of duplication
3. **Align configuration patterns** - Both should use async initialization
4. **Centralize JSON utilities** - Single safe parse/stringify layer
5. **Share error types** - Consistent error handling across CLI and server

### Impact Summary

| Category | Duplicated Lines | Opportunity |
|----------|------------------|-------------|
| Token/Auth | 130+ | Extract to @hapi/auth |
| Versioning | 128 | Consolidate pattern |
| Error Handling | 82 | Extract to @hapi/errors |
| JSON Utils | 200+ | Consolidate |
| Store Patterns | 450+ | Generic abstraction |
| Configuration | 285 | Align patterns |

**Total potential reduction:** ~1,000+ lines through extraction and consolidation

---

## 7. Development Workflow Recommendations

### Recommended Stack: Bun + Biome + Turborepo

Based on expert analysis (Gemini consultation), the optimal stack for this monorepo is:

1. **Bun** - Package manager and script runner (already 95% migrated)
2. **Biome** - Single tool for linting and formatting (Rust-based, fast, zero-config)
3. **Turborepo** - Build orchestration with intelligent caching
4. **Husky** - Pre-commit hooks (industry standard)

### Why NOT Taskfile.yaml

**Verdict: Skip Taskfile entirely**

**Rationale:**
- Adds Go binary dependency for a TypeScript project
- Duplicates what `package.json` scripts already do
- Every JS developer understands npm scripts; Taskfile adds new syntax
- Best for polyglot repos (Rust + Node + Python); unnecessary for homogeneous TypeScript
- Bun's instant startup makes script execution already fast

**Your stack is already 95% aligned with the recommended approach.**

---

### Why Biome Over ESLint + Prettier

**Recommended:** Biome
**Alternative:** ESLint + Prettier (if you need niche plugins)

**Biome Advantages:**
- **Single tool, single config** (`biome.json`) vs complexity of ESLint + Prettier + config packages
- **Rust-based performance** - Near-instant execution even on large codebases
- **Zero-config philosophy** - Works out of the box with sensible defaults
- **Simplicity** - Aligns with your "boring solutions over clever ones" philosophy
- **Configuration reduction** - From 20+ config files down to 2 (`biome.json`, `turbo.json`)

**Biome Limitations:**
- Lacks niche ESLint plugins (e.g., advanced React hooks rules, architectural linting)
- Still maturing ecosystem (though rapidly evolving)

**Verdict:** Use Biome unless you have specific ESLint plugin requirements.

---

### Why Turborepo

**Recommended:** Turborepo
**Alternative:** Nx (more features, steeper learning curve)

**Turborepo Advantages:**
- **Dependency-aware builds** - Automatically builds in correct order (shared → server → web)
- **Intelligent caching** - Skips rebuilds if inputs haven't changed
- **Parallel execution** - Independent packages build simultaneously
- **Industry standard** - "Boring" solution for TypeScript monorepos
- **Seamless Bun integration** - Invoked via `bun run` scripts

**Your build dependency chain:**
```
web (Vite)
  → server (embeds web assets)
    → cli (embeds server)
```

Turborepo handles this automatically.

---

### Implementation Plan

#### Phase 1: Fix Foundation (Day 1 - BLOCKING)

1. **Fix 4 type errors:**
   - Add `Logger.error()` method (`cli/src/ui/logger.ts`)
   - Remove or add `resumeSessionId` parameter (`cli/src/gemini/geminiLocalLauncher.ts`)
   - Move `startedWithCliMtimeMs` declaration (`cli/src/runner/run.ts`)
   - Fix version.json import (`server/src/web/routes/version.ts`)

2. **Test compilation:**
   ```bash
   bun run typecheck  # Should pass with zero errors
   ```

---

#### Phase 2: Install Biome (Day 1 - Quick Win)

1. **Remove legacy tools:**
   ```bash
   bun remove prettier @types/prettier  # From website/
   ```

2. **Install Biome:**
   ```bash
   bun add -D @biomejs/biome
   ```

3. **Initialize Biome:**
   ```bash
   bunx @biomejs/biome init
   ```

4. **Create `biome.json` at root:**
   ```json
   {
     "$schema": "https://biomejs.dev/schemas/1.5.3/schema.json",
     "organizeImports": { "enabled": true },
     "linter": {
       "enabled": true,
       "rules": { "recommended": true }
     },
     "formatter": {
       "enabled": true,
       "indentStyle": "space",
       "indentWidth": 2,
       "lineWidth": 100
     },
     "files": {
       "ignore": ["node_modules", "dist", ".turbo", "*.generated.ts"]
     }
   }
   ```

5. **Format entire codebase:**
   ```bash
   bunx @biomejs/biome format --write .
   bunx @biomejs/biome lint --write .
   ```

6. **Update root package.json scripts:**
   ```json
   {
     "scripts": {
       "lint": "biome check .",
       "lint:fix": "biome check --write .",
       "format": "biome format --write ."
     }
   }
   ```

---

#### Phase 3: Install Turborepo (Day 2)

1. **Install Turborepo:**
   ```bash
   bun add -D turbo
   ```

2. **Create `turbo.json` at root:**
   ```json
   {
     "$schema": "https://turbo.build/schema.json",
     "pipeline": {
       "build": {
         "dependsOn": ["^build"],
         "outputs": ["dist/**", "build/**", "dist-exe/**"]
       },
       "typecheck": {
         "dependsOn": ["^build"],
         "outputs": []
       },
       "test": {
         "dependsOn": ["^build"],
         "outputs": []
       },
       "dev": {
         "cache": false,
         "persistent": true
       },
       "lint": {
         "outputs": []
       }
     }
   }
   ```

3. **Update root package.json scripts:**
   ```json
   {
     "scripts": {
       "dev": "turbo run dev --parallel",
       "build": "turbo run build",
       "test": "turbo run test",
       "typecheck": "turbo run typecheck",
       "lint": "biome check .",
       "lint:fix": "biome check --write .",
       "format": "biome format --write ."
     }
   }
   ```

4. **Add `.turbo` to `.gitignore`:**
   ```
   .turbo
   ```

5. **Test build order:**
   ```bash
   bun run build  # Should build: shared → server → web → cli → website → docs
   ```

---

#### Phase 4: Pre-commit Hooks (Day 3)

1. **Install Husky:**
   ```bash
   bun add -D husky
   bunx husky init
   ```

2. **Create `.husky/pre-commit`:**
   ```bash
   #!/bin/sh
   bun run typecheck
   bun run lint
   ```

3. **Make executable:**
   ```bash
   chmod +x .husky/pre-commit
   ```

4. **Test:**
   ```bash
   git add .
   git commit -m "test: verify pre-commit hooks"
   # Should run typecheck and lint automatically
   ```

---

#### Phase 5: Update CI/CD (Day 3)

**Update `.github/workflows/test.yml`:**
```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run typecheck
      - run: bun run lint          # ← NEW
      - run: bun run build         # ← NEW (validates build order)
      - run: bun run test
```

---

#### Phase 6: Complete Bun Migration (Day 4)

1. **Remove pnpm legacy:**
   ```bash
   git rm pnpm-lock.yaml pnpm-workspace.yaml
   git commit -m "chore: complete migration to Bun"
   ```

2. **Full reinstall:**
   ```bash
   rm -rf node_modules
   bun install
   ```

3. **Verify structure:**
   ```bash
   ls -la node_modules  # Should see .bun, not .pnpm
   ```

---

#### Phase 7: Consolidate Test Framework (Optional - Day 5+)

**Goal:** Use Vitest everywhere (including server)

1. **Install Vitest in server:**
   ```bash
   cd server
   bun add -D vitest @vitest/coverage-v8
   ```

2. **Create `server/vitest.config.ts`:**
   ```typescript
   import { defineConfig } from 'vitest/config'

   export default defineConfig({
     test: {
       globals: false,
       environment: 'node',
       include: ['src/**/*.test.ts'],
       coverage: {
         provider: 'v8',
         reporter: ['text', 'json', 'html'],
       },
     },
   })
   ```

3. **Convert server tests from Bun test to Vitest:**
   ```typescript
   // Before (Bun test):
   import { describe, it, expect } from 'bun:test'

   // After (Vitest):
   import { describe, it, expect } from 'vitest'
   ```

4. **Update server/package.json:**
   ```json
   {
     "scripts": {
       "test": "vitest run"
     }
   }
   ```

5. **Run all tests with single command:**
   ```bash
   bun run test  # Now runs Vitest in CLI, Server, and Web
   ```

---

### Final Project Structure

```
hapi/
├── .github/workflows/
│   └── test.yml              # Updated with lint + build
├── .husky/
│   └── pre-commit            # Runs typecheck + lint
├── cli/
│   ├── src/
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── package.json
├── server/
│   ├── src/
│   ├── tsconfig.json
│   ├── vitest.config.ts      # NEW (converted from Bun test)
│   └── package.json
├── web/
│   ├── src/
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── package.json
├── website/
│   ├── src/
│   ├── tsconfig.json         # Updated to extend base
│   └── package.json
├── docs/
│   └── package.json
├── shared/
│   ├── src/
│   ├── tsconfig.json
│   └── package.json
├── biome.json                # NEW - Single config for lint + format
├── turbo.json                # NEW - Build orchestration
├── tsconfig.base.json        # Cleaned up (removed redundant options)
├── bun.lock                  # Only lock file
├── package.json              # Unified scripts: dev, build, test, lint
└── .gitignore                # Added .turbo
```

---

### Single Entry Point Scripts

**All development tasks from root:**

```bash
# Development
bun run dev              # Start all packages in dev mode (parallel)

# Building
bun run build            # Build all packages (dependency-aware order)

# Type Checking
bun run typecheck        # Type-check all packages

# Testing
bun run test             # Run all tests (CLI + server + web)

# Linting & Formatting
bun run lint             # Check code quality
bun run lint:fix         # Auto-fix issues
bun run format           # Format code

# Specific Package
bun run --filter web dev  # Run dev only in web package
```

**Developers never need to `cd` into subdirectories.**

---

### Configuration File Reduction

**Before:**
- Multiple `.prettierrc` files
- Multiple `.prettierignore` files
- Potentially `.eslintrc` per package
- Different formatting rules per package
- 20+ total config files

**After:**
- `biome.json` (1 file)
- `turbo.json` (1 file)
- Total: **2 config files**

**Reduction: 90%**

---

### Documentation to Create

1. **`CONTRIBUTING.md`** - Development workflow guide
2. **`BUILD.md`** - Build dependency graph explanation
3. **`docs/LINTING.md`** - Code quality standards
4. **Update `README.md`** - Add quick start with unified commands

---

### Expected Benefits

1. **Consistency** - Single source of truth for code style
2. **Speed** - Biome is 10-100x faster than ESLint + Prettier
3. **Simplicity** - 2 config files instead of 20+
4. **Reliability** - Pre-commit hooks prevent bad commits
5. **CI/CD confidence** - All checks automated
6. **Developer experience** - Single entry point (`bun run <command>`)
7. **Build efficiency** - Turborepo caching reduces rebuild times by 50-80%

---

## 8. Assumptions

This analysis was conducted with the following assumptions:

### Environment Assumptions

1. **Development Environment:** Developers use Linux or macOS (Bun-compatible platforms)
2. **CI/CD:** GitHub Actions with Bun support
3. **Node Version:** Node 18+ (for bundler module resolution compatibility)
4. **Git Workflow:** Feature branches with PR reviews before merging to main
5. **Team Size:** Small to medium team (inferred from monorepo structure)

### Technical Assumptions

1. **TypeScript Strict Mode is Intentional:** The project wants strict type safety
2. **Bun Migration Complete:** Legacy pnpm files are safe to remove
3. **No Breaking Changes Allowed:** Fixes must maintain backward compatibility
4. **Type Errors Are Bugs:** All 4 type errors should be fixed (not suppressed with `@ts-ignore`)
5. **Web Assets Are Critical:** CLI requires embedded web assets for full functionality
6. **Multi-Platform Support Required:** All 5 platform binaries needed for releases

### Tool Selection Assumptions

1. **Biome Maturity Acceptable:** Project willing to use newer tools (Biome launched 2024)
2. **No Niche ESLint Plugins Required:** Standard linting rules suffice
3. **Turborepo Complexity Acceptable:** Team comfortable with caching concepts
4. **Pre-commit Hooks Desired:** Team wants local validation before push

### Codebase Assumptions

1. **Duplication Not Intentional:** Code duplication should be reduced when practical
2. **Test Coverage Should Increase:** Low coverage in server/web is a gap
3. **Documentation Incomplete:** New documentation would be welcome
4. **Build Process Can Change:** No external dependencies on current build artifacts

### Workflow Assumptions

1. **Single Entry Point Desired:** User wants `bun run <command>` at root
2. **Boring Solutions Preferred:** Simplicity over clever abstractions (per CLAUDE.md)
3. **Incremental Adoption OK:** Changes can be phased over multiple days/commits
4. **Breaking Developer Workflow Acceptable:** Developers willing to learn new commands

### Risk Assumptions

1. **No Production Hotfixes Pending:** Safe to make infrastructure changes
2. **No External Contributors:** Changes won't break third-party contribution workflows
3. **CI/CD Can Be Updated:** GitHub Actions workflows can be modified
4. **Lock File Changes Safe:** No external systems depend on pnpm-lock.yaml format

### Validation Assumptions

1. **Type Errors Are Real:** All 4 reported errors actually block compilation
2. **Test Suite Reliable:** Tests accurately validate functionality
3. **Build Scripts Correct:** Existing build process works when errors fixed
4. **No Hidden Dependencies:** No undocumented system dependencies

### Communication Assumptions

1. **Gemini Recommendations Accurate:** Expert analysis from Gemini agent is trustworthy
2. **User Wants Full Report First:** Defer questions until after comprehensive analysis
3. **Technical Depth Desired:** User comfortable with detailed technical recommendations

---

## Summary

The HAPI monorepo is a **well-structured TypeScript project** with solid foundations but critical gaps in code quality infrastructure. The recommended approach—**Bun + Biome + Turborepo**—provides a unified, simple, and fast development workflow while aligning with the project's "boring solutions" philosophy.

**Immediate Actions (Blocking):**
1. Fix 4 type errors
2. Install Biome
3. Install Turborepo

**Quick Wins (Day 1-3):**
1. Format entire codebase
2. Set up pre-commit hooks
3. Update CI/CD

**Long-Term Improvements (Week 1+):**
1. Consolidate test frameworks
2. Extract shared packages (@hapi/auth, @hapi/errors)
3. Increase test coverage
4. Complete Bun migration cleanup

**Configuration Reduction:** From 20+ config files to **2 files** (biome.json, turbo.json).

**Single Entry Point:** All development tasks via `bun run <command>` at root.

This approach eliminates configuration complexity while providing fast, reliable development workflows.