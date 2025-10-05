# Code Review - Ovrseer Process Manager

## Executive Summary

Ovrseer is a well-architected process manager with TUI capabilities, built on solid TypeScript foundations. The codebase demonstrates good separation of concerns, comprehensive interfaces, and thoughtful async handling. This review identifies areas for improvement before release.

---

## Architecture & Design

### ✅ Strengths

1. **Clean separation of concerns**: Core logic (`@ovrseer/core`) is independent of UI (`@ovrseer/tui-ink`)
2. **Interface-driven design**: Strong use of interfaces (`ManagedProcessI`, `ProcessManagerI`, `TUIRendererI`) allows for extensibility
3. **Monorepo structure**: Well-organized with Turborepo, clear package boundaries
4. **Type safety**: Comprehensive TypeScript usage with explicit types throughout

### ⚠️ Areas for Improvement

1. **TUI coupling**: `ProcessManager` has TUI-specific logic embedded (keyboard handling, status messages). Consider extracting to a separate controller/mediator.
2. **Error handling inconsistency**: Mix of promise rejections, callbacks, and silent failures (many empty `catch` blocks)
3. **State management**: TUI state lives in `ProcessManager`, which violates single responsibility

---

## Core Package (`@ovrseer/core`)

### ProcessManager (`process-manager.ts`)

**Strengths:**
- Comprehensive lifecycle management (dependencies → main → cleanup)
- Graceful shutdown with timeout escalation
- Retry logic with configurable limits
- Crash reporting integration

**Issues:**

1. **Line 43-44**: Unused `waitTime` retained for backward compatibility - consider deprecation notice or removal
   ```typescript
   this.waitTime = options?.waitTime ?? 1000;
   ```

2. **Line 97-154 (`start` method)**: Complex promise chain with mixed error handling. The catch block at line 102 attempts async `stop()` but doesn't handle potential race conditions.

3. **Line 161-179**: Silent `catch(() => {})` blocks hide potential issues. At minimum, log warnings.

4. **Line 309-316 (`gracefulQuit`)**: Double-quit detection logic is fragile. Consider state machine approach.

5. **TUI coupling**: Lines 271-318 contain keyboard handling logic that should live in a separate controller layer.

6. **Race condition potential**: `restartAll()` (line 232-282) uses async IIFE but doesn't track its completion, which could cause issues if called rapidly.

**Recommendations:**
- Extract keyboard/TUI interaction to separate `TUIController` class
- Add proper error logging instead of empty catches
- Consider state machine for quit/shutdown lifecycle
- Add mutex/lock for `restartAll()` to prevent concurrent calls

---

### ManagedProcess (`managed-process.ts`)

**Strengths:**
- Robust lifecycle state management
- Proper cleanup of timers and subscriptions
- Signal escalation (SIGINT → SIGTERM → SIGKILL)
- Comprehensive error handling for spawn failures vs runtime crashes

**Issues:**

1. **Line 62-63**: Private state exposed through getter for tests. Consider dependency injection of state observer instead.

2. **Line 107-121 (`start`)**: Can throw synchronously if status !== 'created', but other methods return promises. Inconsistent async patterns.

3. **Line 123-142 (exit handler)**: Complex status determination logic. Consider extracting to separate method for testability.

4. **Line 200-209 (error handler)**: Calls crash callbacks AND rejects ready promise. Consumers need to handle both paths, which is error-prone.

5. **Line 233-247 (`runReadyChecks`)**: Timers array leaked to instance `_timers`. If check completes early, timers may not be cleared properly.

6. **Line 289-309 (`stop`)**: Console.warn calls should use logger or configurable debug output.

**Recommendations:**
- Standardize async patterns (all lifecycle methods should be async or all sync with clear documentation)
- Extract status determination to `determineExitStatus(code, signal, currentStatus)` method
- Improve timer cleanup guarantees in ready checks
- Remove console.warn, use proper logging abstraction

---

### SimpleLogger (`logger.ts`)

**Strengths:**
- Circular buffer implementation prevents unbounded memory growth
- Event-based subscription model
- Configurable log retrieval (index, numberOfLines, separator)

**Issues:**

1. **Line 14-23**: Private fields exposed via getters for testing. This couples implementation to tests.

2. **Line 57-60**: Silent swallowing of errors if event listeners throw. Consider:
   ```typescript
   this._eventEmitter.emit('log', chunk);
   ```
   EventEmitter will throw if 'error' event has no listeners. Current code doesn't handle this.

3. **Line 70-86 (`getLogs`)**: Complexity in index math with reverse operations. Off-by-one errors likely. Add edge case tests.

4. **Line 51-60**: Adding to both `_buffer` and `_errorBuffer` means errors are counted twice against memory limits. Clarify if this is intentional.

5. **Missing feature**: No way to retrieve errors separately from logs. `getLogs()` returns combined output.

**Recommendations:**
- Add `getErrors()` method to retrieve error-specific logs
- Simplify index math or add extensive documentation
- Consider using a proper circular buffer library instead of shift/push
- Add try-catch around emit calls with proper error escalation

---

### CrashReporter (`crash-reporter.ts`)

**Strengths:**
- Clean interface implementation
- Fails gracefully if filesystem unavailable
- Keeps reports in memory as fallback

**Issues:**

1. **Line 39**: Silent `catch` on `mkdir` and `writeFile`. Users won't know if reports aren't persisting.

2. **Line 24**: `inferProcessType()` defaults to 'main' if not in context, which may mask bugs.

3. **Missing feature**: No report rotation/cleanup. Long-running processes will accumulate unbounded reports.

4. **Missing feature**: No configuration for report size limits (logs could be enormous).

5. **Line 29**: Uses `process.logger.getLogs()` without parameters, gets default which may not be enough context for debugging.

**Recommendations:**
- Add optional error callback to report filesystem failures
- Add max reports limit with LRU eviction
- Add max report size configuration
- Retrieve more log context (or configurable amount) for crash reports
- Throw or warn if `inferProcessType()` falls back to default

---

## TUI Package (`@ovrseer/tui-ink`)

### InkTUIWrapper (`InkTUIWrapper.ts`)

**Strengths:**
- Clean adapter pattern for Ink
- Maintains immutable process/state for rendering

**Issues:**

1. **Line 52-53**: `showInstructions`, `selectPrevious`, `selectNext` are no-ops. Either implement or remove from interface.

2. **Line 10**: `renderInstance: any` - no typing. Should be `RenderInstance` from Ink.

3. **Line 37-41**: Re-creates React element on every render. Expensive. Should use state updates.

4. **Line 48**: Logs data stored in wrapper, not in renderer state. Breaks React unidirectional data flow.

5. **Missing**: No cleanup of old logs data. Will accumulate in memory.

**Recommendations:**
- Type `renderInstance` properly
- Implement or remove stubbed methods
- Refactor to use React state properly instead of wrapper-level state
- Add logs data cleanup after certain time/size

---

### InkTUIRenderer (`InkTUIRenderer.tsx`)

**Strengths:**
- Clean React component structure
- Keyboard handling with useInput
- Visual grouping of process types

**Issues:**

1. **Line 45-56**: `useEffect` with no dependency array will run on every render. Should be:
   ```typescript
   useEffect(() => {
     // ...
   }, [state.selectedProcessId, state.selectedProcessType, processItems]);
   ```
   But `processItems` is recreated every render, so this will still run constantly.

2. **Line 32-42**: `processItems` recreated on every render. Should be memoized with `useMemo`.

3. **Line 59**: `useInput` sets up new listener on every render due to closure over `processItems`. Memory leak.

4. **Line 102-112 (`getStatusIcon`)**: Status values don't match core types. E.g., 'starting' doesn't exist in `ProcessStatus` type.

5. **Line 150-157**: Static height `height="80%"` won't adapt to terminal size changes.

6. **Line 179**: Status message on blue background always, no visual distinction for errors vs info vs warnings.

7. **Missing**: No scroll support for logs pane. Long logs will overflow.

8. **Missing**: No error state visualization for processes beyond 'crashed' text.

**Recommendations:**
- Memoize `processItems` with `useMemo`
- Fix `useEffect` dependencies
- Align status icons with actual `ProcessStatus` enum
- Add color coding for status messages (red=error, yellow=warning, blue=info)
- Implement log scrolling
- Add visual indicators for process health (e.g., green border for ready)
- Make layout responsive to terminal size

---

## Testing

**Strengths:**
- Vitest setup with good test structure
- Tests use proper mocking patterns
- Logger has comprehensive edge case coverage

**Issues:**

1. **Coverage**: Only logger and partial process tests exist. Missing:
   - ProcessManager integration tests
   - CrashReporter tests
   - TUI component tests
   - End-to-end scenarios

2. **Mocks**: Tests access private fields (`_logs`, `_errors`) which couples tests to implementation.

3. **Async testing**: No tests for race conditions, concurrent restarts, or rapid start/stop cycles.

**Recommendations:**
- Add integration tests for ProcessManager with real or mock ManagedProcess
- Add tests for crash scenarios
- Add tests for TUI keyboard interactions
- Remove private field access from tests, use public API
- Add concurrency/race condition tests

---

## Documentation

**Issues:**

1. **README**: Basic usage examples but missing:
   - Configuration options
   - Error handling patterns
   - TUI keyboard shortcuts documentation
   - Troubleshooting guide

2. **API docs**: No JSDoc comments (intentional per style guide, but makes IDE hints less useful)

3. **Architecture docs**: No documentation of lifecycle flows, state machines, or interaction patterns

**Recommendations:**
- Add comprehensive README with all configuration options
- Add ARCHITECTURE.md explaining process lifecycle, restart flows, crash handling
- Add TROUBLESHOOTING.md with common issues
- Consider adding JSDoc despite style preference for public API surface

---

## Code Style & Conventions

### ✅ Adherence to Guidelines

- Consistent use of tabs, single quotes, no bracket spacing ✓
- PascalCase classes, camelCase functions ✓
- Explicit types on function signatures ✓
- ES6 imports with `.js` extensions ✓
- No comments in code ✓

### ⚠️ Minor Issues

1. Console.log/warn present in production code (`managed-process.ts:289-292`)
2. Inconsistent error type in catch blocks (some `any`, some omitted)
3. Some unused variables (`loggerName` in tests)

---

## Security Considerations

1. **Command injection**: `ManagedProcess` accepts raw `command` and `args` but doesn't validate. If user input flows through, could be vulnerable.

2. **Filesystem**: `CrashReporter` writes to configurable directory without validation. Could write outside intended bounds.

3. **Resource exhaustion**: No limits on number of processes, logs, or crash reports.

**Recommendations:**
- Add validation for command/args if accepting user input
- Validate and sanitize `reportsDir` path
- Add configurable limits for processes and reports
- Consider sandboxing or process isolation

---

## Performance Considerations

1. **Logs**: Every log chunk triggers event emission → TUI re-render. High-frequency logs will thrash UI.

2. **React renders**: TUI re-renders on every log event. Should debounce or throttle.

3. **Crash reports**: Writing to disk synchronously blocks event loop.

**Recommendations:**
- Debounce TUI updates (max 60fps)
- Batch log events before emitting
- Make crash report writes truly async (use worker thread or batch writes)
- Add performance monitoring/profiling before release

---

## Pre-Release Checklist

### Critical
- [ ] Fix empty catch blocks - add at least logging
- [ ] Implement or remove stubbed TUI methods
- [ ] Fix React rendering performance issues (memoization)
- [ ] Add integration tests for ProcessManager
- [ ] Document configuration options
- [ ] Add resource limits (processes, reports, logs)

### High Priority  
- [ ] Extract TUI logic from ProcessManager
- [ ] Standardize async patterns across ManagedProcess
- [ ] Add scroll support to logs pane
- [ ] Add crash reporter tests
- [ ] Fix status icon mismatch with types
- [ ] Add architecture documentation

### Medium Priority
- [ ] Add getErrors() to logger
- [ ] Improve error handling consistency
- [ ] Add troubleshooting guide
- [ ] Add concurrency tests
- [ ] Remove private field access in tests

### Nice to Have
- [ ] Add state machine for quit lifecycle
- [ ] Add JSDoc for public API
- [ ] Performance profiling and optimization
- [ ] Terminal size responsiveness

---

## Overall Assessment

**Grade: B+**

The codebase shows solid engineering fundamentals with good architecture and type safety. However, several production-readiness concerns need addressing:

1. Error handling needs hardening
2. TUI performance requires optimization  
3. Test coverage must expand significantly
4. Documentation needs to reach release quality

Estimated effort to production-ready: **2-3 weeks** with focused work on critical and high-priority items.

---

## Positive Highlights

- Excellent interface design that enables extensibility
- Thoughtful lifecycle management with cleanup
- Good separation of concerns (mostly)
- Clean monorepo structure
- Type safety throughout

The foundation is strong. With the recommended improvements, this will be a robust, production-ready process manager.
