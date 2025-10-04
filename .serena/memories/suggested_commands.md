# Suggested Commands for Ovrseer Development

## Build Commands
- `turbo run build` - Build all packages in the monorepo
- `cd packages/core && tsc` - Build only core package
- `cd packages/tui-ink && tsc` - Build only tui-ink package

## Development Commands
- `turbo run dev` - Start watch mode for all packages
- `pnpm --filter @ovrseer/example dev` - Run the example application

## Testing Commands
- `turbo run test` - Run all tests across packages
- `cd packages/core && vitest` - Run core package tests in watch mode
- `cd packages/core && vitest run` - Run core package tests once
- `cd packages/core && vitest run src/__tests__/logger.test.ts` - Run specific test file

## Linting & Formatting
- `turbo run lint` - Check formatting with Prettier (and XO if configured)
- `prettier --check .` - Check formatting
- `prettier --write .` - Auto-fix formatting

## Package Management
- `pnpm install` - Install dependencies (preferred)
- `npm install` - Alternative package manager
- `bun install` - Alternative package manager

## System Commands (Linux)
- `ls` - List files
- `cd` - Change directory
- `grep` - Search in files (prefer `rg` ripgrep if available)
- `find` - Find files
- `git` - Version control

## Task Completion Checklist
When completing a task:
1. Run `turbo run build` to ensure no build errors
2. Run `turbo run lint` to check code formatting
3. Run `turbo run test` to verify all tests pass
4. Check git status before committing