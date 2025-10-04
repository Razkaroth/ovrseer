# Ovrseer Monorepo

A node-based process manager with a TUI (Terminal User Interface).

## Packages

- **@ovrseer/core** - Core process manager logic
- **@ovrseer/tui-ink** - Ink-based TUI renderer

## Development

Install dependencies:

```bash
npm install
# or
pnpm install
# or
bun install
```

Build all packages:

```bash
npm run build
```

Run in development mode:

```bash
npm run dev
```

Run tests:

```bash
npm run test
```

## Structure

```
ovrseer/
├── packages/
│   ├── core/           # @ovrseer/core - Process manager core logic
│   │   ├── src/
│   │   │   ├── types.ts
│   │   │   ├── logger.ts
│   │   │   ├── managed-process.ts
│   │   │   ├── process-manager.ts
│   │   │   ├── crash-reporter.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── tui-ink/        # @ovrseer/tui-ink - Ink-based TUI renderer
│       ├── src/
│       │   ├── types.ts
│       │   ├── InkTUIRenderer.tsx
│       │   ├── InkTUIWrapper.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── prototype/          # Original prototype (reference)
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Usage

### Core Package

```typescript
import {ProcessManager, ManagedProcess, SimpleLogger} from '@ovrseer/core';

const logger = new SimpleLogger(1000, 100);
const process = new ManagedProcess('node', ['server.js'], [], logger);

const manager = new ProcessManager();
manager.addMainProcess('server', process);
manager.start();
```

### With Ink TUI

```typescript
import {ProcessManager} from '@ovrseer/core';
import {InkTUIWrapper} from '@ovrseer/tui-ink';

const tui = new InkTUIWrapper();
const manager = new ProcessManager({tui});

manager.startTuiSession();
manager.start();
```

## License

MIT
