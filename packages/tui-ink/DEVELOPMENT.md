# Development (Ink + tsx)

This document explains how to run the Ink TUI in development mode with `tsx` hot reload and optional React DevTools.

## Install

From repository root:

```bash
pnpm install
```

## Run dev

From the package directory:

```bash
pnpm --filter @ovrseer/tui-ink run dev
```

Or from repo root using Turbo:

```bash
turbo run dev --filter=@ovrseer/tui-ink
```

`dev` runs `tsx watch src/dev/index.ts` which recompiles and restarts on change. The `src/dev` directory is excluded from the package build and from published files (only `dist` is published).

## Debug with React DevTools

1. Start the app in debug mode:

```bash
pnpm --filter @ovrseer/tui-ink run dev:debug
```

2. In a separate terminal, start React DevTools:

```bash
npx react-devtools
```

3. Connect and inspect the Ink React tree.

## Notes

- Entry point: `src/index.ts`. If your entry file is `src/index.tsx`, update `package.json` `dev`/`dev:debug` scripts accordingly to point to `src/index.tsx`.
- If you use path aliases in `tsconfig.json`, `tsx` will respect `tsconfig.json` automatically. If you encounter resolution problems, use `tsx --tsconfig tsconfig.json` in the scripts.
- Turbo's `dev` task is configured as persistent and depends on `^build` so package dependencies are built first.
