# Ovrseer Code Style and Conventions

## Formatting
- **Formatter**: Prettier via `@vdemedes/prettier-config`
- **Indentation**: TABS (not spaces) - enforced by .editorconfig
- **Semicolons**: Required (always use semicolons)
- **Quotes**: Single quotes for strings
- **Bracket Spacing**: No spacing (`{foo}` not `{ foo }`)
- **Arrow Function Parens**: Avoid when possible (`x => x` not `(x) => x`)
- **Trailing Commas**: Everywhere (ES5+)
- **Line Endings**: LF (Unix-style)
- **Final Newline**: Always insert final newline

## Linting
- **Linter**: XO (ESLint with opinionated defaults)
- Extends `@sindresorhus/tsconfig` for strict TypeScript

## TypeScript Conventions
- **Module System**: ES modules (type: "module" in package.json)
- **Import Extensions**: Always use `.js` extension in imports (e.g., `import {Foo} from './types.js'`)
- **Types**: Explicit types for function parameters and return values
- **Strictness**: Strict mode enabled (via @sindresorhus/tsconfig)

## Naming Conventions
- **Classes**: PascalCase (e.g., `ProcessUnit`, `ProcessLogger`)
- **Functions/Variables**: camelCase (e.g., `getStatus`, `selectedIndex`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_LOG_LINES`)
- **Interfaces**: PascalCase with `I` suffix (e.g., `ProcessUnitI`)
- **Types**: PascalCase (e.g., `TUIState`, `ProcessMap`)

## Error Handling
- Use try/catch blocks for error handling
- Prefer explicit error types in catch blocks (e.g., `catch (e: any)`)
- Log errors appropriately using the ProcessLogger or console

## Comments
- **IMPORTANT**: NO comments in code (per codebase convention)
- Code should be self-documenting
- Only exception: complex algorithm explanations if absolutely necessary

## File Structure
- Exports at the top level of `index.ts` files
- Tests in `__tests__/` directories
- One main export per file (class or function)

## React/Ink Conventions (for tui-ink package)
- Functional components using hooks (useState, useEffect, useMemo, useInput)
- PascalCase for component names (e.g., `InkTUIRenderer`)
- Props types defined inline or as separate type aliases
- Memoization with useMemo for expensive computations (but avoid stale dependencies)

## Import Order
1. External dependencies (e.g., React, Ink)
2. Internal package dependencies (e.g., @ovrseer/core)
3. Relative imports (e.g., ./types.js, ./logger.js)

## Best Practices
- Keep functions focused and single-purpose
- Prefer composition over inheritance
- Use TypeScript's type system to catch errors at compile time
- Write tests for all core logic (vitest)
- Follow existing patterns in the codebase when adding new features