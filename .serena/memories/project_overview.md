# Ovrseer Project Overview

## Purpose
Ovrseer is a node-based process manager with a Terminal User Interface (TUI). It allows managing and monitoring multiple processes with features like crash reporting, logging, and interactive terminal interface.

## Tech Stack
- **Language:** TypeScript (ES Modules with `.js` extensions in imports)
- **Build Tool:** TypeScript compiler (`tsc`)
- **Monorepo:** Turborepo with pnpm workspaces
- **Testing:** Vitest
- **Formatting:** Prettier via `@vdemedes/prettier-config`
- **Linting:** XO (extends `@sindresorhus/tsconfig`)
- **TUI Framework:** Ink (React for CLIs)
- **Runtime:** Node.js >=16

## Package Structure
- **@ovrseer/core** - Core process management logic (ProcessManager, ManagedProcess, CrashReporter, Logger)
- **@ovrseer/tui-ink** - Ink-based TUI renderer for interactive terminal interface
- **@ovrseer/example** - Example usage

## Key Components
1. **ProcessManager** - Orchestrates all managed processes
2. **ManagedProcess** - Wraps a single process with lifecycle management
3. **CrashReporter** - Handles crash detection and reporting
4. **SimpleLogger** - Circular buffer logger for process output
5. **InkTUIWrapper** - Wraps Ink rendering for TUI
6. **InkTUIRenderer** - React component for TUI display

## Entry Points
- Core package: `packages/core/src/index.ts`
- TUI package: `packages/tui-ink/src/index.ts`
- Example: `packages/example/src/index.ts`