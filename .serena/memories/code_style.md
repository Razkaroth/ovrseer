# Code Style and Conventions

## Formatting (Prettier via @vdemedes/prettier-config)
- **Indentation:** Tabs (not spaces)
- **Semicolons:** Required at end of statements
- **Quotes:** Single quotes for strings
- **Bracket Spacing:** None - use `{foo}` not `{ foo }`
- **Arrow Function Parens:** Avoid when possible - `x => x` not `(x) => x`
- **Trailing Commas:** Everywhere (arrays, objects, function params)

## TypeScript Conventions
- **Imports:** ES6 imports with `.js` extensions (e.g., `import {Foo} from './types.js'`)
- **Type Annotations:** Explicit types for function parameters and return values
- **TSConfig:** Extends `@sindresorhus/tsconfig`
- **Module System:** ES Modules (`"type": "module"`)

## Naming Conventions
- **Classes:** PascalCase (e.g., `ProcessManager`, `ManagedProcess`)
- **Functions/Variables:** camelCase (e.g., `startProcess`, `logBuffer`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`, `DEFAULT_PORT`)
- **Interfaces:** PascalCase with `I` suffix (e.g., `ProcessManagerI`, `ManagedProcessI`)

## Error Handling
- Use try/catch blocks for error handling
- Prefer explicit error types: `catch (e: any)` or proper error type casting
- Handle errors gracefully at appropriate levels

## Code Organization
- **No Comments:** Per codebase convention, code should be self-documenting
- **File Structure:** One main export per file typically
- **Exports:** Named exports preferred, collected in `index.ts` barrel files

## Testing
- **Framework:** Vitest
- **Location:** `__tests__/` directories within `src/`
- **Mocks:** Shared mocks in `__tests__/mocks.ts`

## Linting
- **Tool:** XO linter
- **Rules:** Extends `@sindresorhus/tsconfig` standards