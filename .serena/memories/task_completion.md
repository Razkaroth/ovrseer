# Task Completion Checklist

When you complete any coding task in this project, ALWAYS run the following commands in order:

## 1. Build Check
```bash
turbo run build
```
**Purpose:** Ensure TypeScript compiles without errors across all packages
**Fix if fails:** Address TypeScript compilation errors before proceeding

## 2. Lint Check
```bash
turbo run lint
```
**Purpose:** Ensure code follows Prettier formatting and XO linting rules
**Fix if fails:** Run `prettier --write .` to auto-fix formatting issues

## 3. Test Check
```bash
turbo run test
```
**Purpose:** Ensure all tests pass and no regressions introduced
**Fix if fails:** Debug failing tests and fix issues

## Order Matters
- Build must succeed before testing (tests depend on build outputs per turbo.json)
- Lint can run independently but should be checked

## For Individual Packages
If working on a single package, you can run:
```bash
cd packages/core && tsc && prettier --check . && vitest run
```

## Before Committing
Always ensure all three checks pass before committing changes to git.