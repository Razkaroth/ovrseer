# Suggested Commands for Ovrseer Development

## Build Commands
```bash
# Build all packages (from root)
turbo run build
# or
npm run build
# or
pnpm build

# Build individual package
cd packages/core && npm run build
cd packages/tui-ink && npm run build
```

## Development/Watch Mode
```bash
# Watch all packages (from root)
turbo run dev
# or
npm run dev

# Watch individual package
cd packages/core && npm run dev
cd packages/tui-ink && npm run dev
```

## Testing
```bash
# Run all tests (from root)
turbo run test
# or
npm test

# Run tests for specific package
cd packages/core && npm test
cd packages/tui-ink && npm test

# Run a single test file
cd packages/core && npx vitest run src/__tests__/logger.test.ts
cd packages/tui-ink && npx vitest run src/__tests__/InkTUI-flags.test.ts

# Watch mode for tests
cd packages/core && npx vitest
```

## Linting and Formatting
```bash
# Run linter on all packages (from root)
turbo run lint
# or
npm run lint

# Lint individual package
cd packages/core && npm run lint
cd packages/tui-ink && npm run lint

# Fix formatting issues (if supported)
cd packages/core && prettier --write .
cd packages/tui-ink && prettier --write .
```

## Running the Example
```bash
# Run the example package
npm run example
# or
pnpm --filter @ovrseer/example dev
```

## Package Management
```bash
# Install dependencies (from root)
pnpm install

# Add dependency to specific package
pnpm --filter @ovrseer/core add <package-name>
pnpm --filter @ovrseer/tui-ink add <package-name>

# Add dev dependency
pnpm --filter @ovrseer/core add -D <package-name>
```

## Git Commands
```bash
# Standard git workflow
git status
git add <files>
git commit -m "message"
git push

# View recent commits
git log --oneline -n 10

# View diff
git diff
git diff --staged
```

## System Commands (Linux)
- `ls` - list files
- `cd <dir>` - change directory
- `cat <file>` - view file contents
- `grep <pattern> <file>` - search for pattern in file
- `find <dir> -name <pattern>` - find files by name
- `rg <pattern>` - ripgrep (faster alternative to grep)

## Turborepo Specific
```bash
# Run task for specific package
turbo run build --filter=@ovrseer/core
turbo run test --filter=@ovrseer/tui-ink

# Clear turbo cache
turbo run build --force
```

## Common Workflows

### After making code changes:
1. `turbo run lint` - check formatting
2. `turbo run build` - ensure it compiles
3. `turbo run test` - ensure tests pass

### Before committing:
1. Run lint, build, and test
2. Review changes with `git diff`
3. Commit with descriptive message