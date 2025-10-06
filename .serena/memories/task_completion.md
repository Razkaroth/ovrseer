# Task Completion Checklist for Ovrseer

When completing a task (bug fix, feature addition, refactoring), follow these steps:

## 1. Code Quality Checks

### Run Linter
```bash
turbo run lint
```
- Ensures code follows Prettier formatting rules
- Must pass before committing

### Run Build
```bash
turbo run build
```
- Ensures TypeScript compiles without errors
- Catches type errors and missing imports
- Must pass before committing

### Run Tests
```bash
turbo run test
```
- Runs all Vitest tests across packages
- Must pass before committing
- If a specific package was changed, can run tests for that package only:
  - `cd packages/core && npm test`
  - `cd packages/tui-ink && npm test`

## 2. Verification

### Manual Testing (if applicable)
- Run the example application: `npm run example`
- Test the specific feature/fix manually
- Verify behavior matches expectations

### Review Changes
```bash
git diff
git status
```
- Review all changes before committing
- Ensure no unintended changes are included
- Check for:
  - Leftover debug code
  - Console logs
  - Comments (should be avoided per code style)
  - Unused imports

## 3. Committing

### Stage and Commit
```bash
git add <files>
git commit -m "type(scope): description"
```

### Commit Message Format
- Use conventional commit format:
  - `feat(core): add new feature`
  - `fix(tui-ink): fix bug description`
  - `refactor(core): refactor description`
  - `test(core): add test for feature`
  - `docs: update documentation`
  - `chore: update dependencies`

### Scope Examples
- `core` - for @ovrseer/core package
- `tui-ink` - for @ovrseer/tui-ink package
- `example` - for @ovrseer/example package
- Leave empty for root-level changes

## 4. Pre-Commit Checklist
- [ ] Linter passes (`turbo run lint`)
- [ ] Build succeeds (`turbo run build`)
- [ ] All tests pass (`turbo run test`)
- [ ] Manual testing completed (if applicable)
- [ ] No debug code or console logs left
- [ ] No unnecessary comments added
- [ ] Git diff reviewed
- [ ] Commit message is descriptive and follows conventions

## 5. Optional (if pushing/PR)
- Push to remote: `git push`
- Create PR if needed
- Ensure CI passes (if configured)

## Notes
- NEVER commit if lint, build, or tests fail
- ALWAYS run all three commands (lint, build, test) before committing
- If tests fail, fix them before committing
- If you can't find the right command, ask the user and suggest adding it to CLAUDE.md or the project docs