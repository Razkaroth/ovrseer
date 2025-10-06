# Ovrseer Project Overview

## Purpose
Ovrseer is a Node-based process manager with a Terminal User Interface (TUI). It provides process lifecycle management, logging, crash reporting, and an interactive terminal UI for monitoring and controlling processes.

## Tech Stack
- **Language**: TypeScript (targeting ES modules)
- **Build Tool**: Turborepo (monorepo orchestration)
- **Package Manager**: pnpm (workspace-based monorepo)
- **Testing**: Vitest
- **Linting/Formatting**: Prettier + XO (ESLint config)
- **UI Framework**: Ink (React for CLI) for the TUI package
- **TypeScript Config**: Extends @sindresorhus/tsconfig
- **Node Version**: >=16

## Monorepo Structure
```
ovrseer/
├── packages/
│   ├── core/           # @ovrseer/core - Core process manager logic
│   │   ├── src/
│   │   │   ├── types.ts           # Shared types
│   │   │   ├── logger.ts          # ProcessLogger (ring buffer logging)
│   │   │   ├── process-unit.ts    # ProcessUnit (individual process)
│   │   │   ├── ovrseer.ts         # Ovrseer (main manager)
│   │   │   ├── crash-reporter.ts  # CrashReporter
│   │   │   └── index.ts           # Package exports
│   │   ├── __tests__/             # Vitest tests
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── tui-ink/        # @ovrseer/tui-ink - Ink-based TUI renderer
│   │   ├── src/
│   │   │   ├── types.ts              # TUI types
│   │   │   ├── InkTUIRenderer.tsx    # React/Ink UI component
│   │   │   ├── InkTUI.ts             # TUI event handler/state manager
│   │   │   ├── InkTUIWrapper.ts      # Wrapper for integration
│   │   │   └── index.ts              # Package exports
│   │   ├── __tests__/                # Vitest tests
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── example/        # @ovrseer/example - Example usage
├── prototype/          # Original prototype (reference only)
├── turbo.json          # Turborepo config
├── pnpm-workspace.yaml # pnpm workspace config
└── package.json        # Root package.json
```

## Key Packages
- **@ovrseer/core**: Exports `Ovrseer`, `ProcessUnit`, `ProcessLogger`, `CrashReporter`, and types.
- **@ovrseer/tui-ink**: Exports `InkTUI`, `InkTUIWrapper`, `InkTUIRenderer` and TUI-specific types.
- **@ovrseer/example**: Example application using both core and TUI packages.

## Core Concepts
- **Ovrseer**: Main process manager coordinating multiple ProcessUnits.
- **ProcessUnit**: Represents a single managed process with lifecycle methods (start, stop, restart).
- **ProcessLogger**: Ring-buffer logger with flag support (pattern-based log matching).
- **CrashReporter**: Tracks process crashes and restart attempts.
- **InkTUI**: TUI state manager handling user input and rendering state.
- **InkTUIRenderer**: React/Ink component rendering the process list, logs, and flags.

## Development Workflow
- Development is done in a monorepo using Turborepo for task orchestration.
- Packages depend on each other via workspace protocol (`workspace:*`).
- Build outputs go to `dist/` directories.
- Tests are colocated in `__tests__/` directories within each package.