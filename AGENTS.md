# AGENTS.md

## Build, Lint, and Test Commands

- **Build:** `turbo run build` (builds all packages)
- **Lint:** `turbo run lint` (runs prettier + xo)
- **Test:** `turbo run test` (runs vitest on all packages)
- **Single test:** `cd packages/core && vitest run src/__tests__/logger.test.ts`
- **Dev mode:** `turbo run dev` (watches for changes)

## Code Style Guidelines

- **Formatting:** Uses Prettier via `@vdemedes/prettier-config`:
  - Tabs for indentation
  - Semicolons required
  - Single quotes
  - No bracket spacing (`{foo}` not `{ foo }`)
  - Arrow parens avoided (`x => x` not `(x) => x`)
  - Trailing commas everywhere
- **Linting:** XO (extends `@sindresorhus/tsconfig`)
- **Imports:** ES6 imports with `.js` extensions in source (e.g., `import {Foo} from './types.js'`)
- **Types:** TypeScript everywhere. Use explicit types for function parameters and return values
- **Naming:** PascalCase for classes, camelCase for functions/variables, `UPPER_SNAKE_CASE` for constants
- **Error Handling:** Use try/catch blocks. Prefer explicit error types (e.g., `catch (e: any)`)
- **Comments:** NO comments in code (per codebase convention)
- **File Structure:** Monorepo using Turborepo. Main code in `packages/core/src/`

## Package Status

- **Deprecated:** `packages/tui-ink` — Do not interact with this package anymore. A new TUI will be written from scratch at `packages/skywatch`.

## Recent agent operations

The following automated updates were performed by the assistant while migrating constructor signatures across the repository to the new object-style constructors for ProcessUnit and ProcessLogger:

- Updated example and demo files to use the new constructor signatures (object form) instead of positional arguments.
- Updated test mocks to use the new constructor signatures.

Files modified during this operation:

- packages/example/src/index.ts
- packages/example/src/docker-example.ts
- packages/core/src/__tests__/mocks.ts
- packages/skywatch/src/dev/process-units.ts

Summary of changes:

- Replaced positional ProcessLogger(maxBufferSize, maxLogSize) with ProcessLogger({maxBufferSize, maxLogSize}).
- Replaced positional ProcessUnit(command, args, readyChecks, logger) with ProcessUnit({command, args, readyChecks, logger}).

Verification commands to run locally:

- rg "new ProcessUnit\\(|new ProcessLogger\\(" -n || true
- git status --porcelain

Notes:

- These changes were applied to example/demo files and test mocks only. Unit tests may need to be run locally to ensure everything passes.
- I did not create a git commit. If you want these changes committed, provide a commit message and I will stage and commit the modified files.
