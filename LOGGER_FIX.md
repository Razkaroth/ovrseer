# Logger Fix: "No logs available" Issue

## Problem

When viewing logs in the TUI, all processes showed "No logs available" even though they were actively outputting logs.

## Root Cause

The `SimpleLogger.getLogs()` method in `packages/core/src/logger.ts` had an overly strict bounds check on line 79:

```typescript
if (index + numberOfLines > this._buffer.length) {
	throw new Error('Requested logs are out of bounds');
}
```

**Why this caused the issue:**

1. When a logger is first created, the buffer is empty (`length = 0`)
2. `getLogs()` is called without parameters, so `numberOfLines` defaults to `maxLogSize` (100)
3. The check evaluates: `0 + 100 > 0` → throws "Requested logs are out of bounds"
4. ProcessManager catches this error and displays "No logs available"

Even after logs were added, if fewer logs existed than `maxLogSize`, the same error would occur.

## Solution

Changed the bounds check from:

```typescript
if (index + numberOfLines > this._buffer.length) {
	throw new Error('Requested logs are out of bounds');
}
```

To:

```typescript
if (index >= this._buffer.length) {
	return '';
}
```

**Why this works:**

- If the index is beyond the buffer, return an empty string (reasonable default)
- Lines 84-85 already handle the case where `numberOfLines` exceeds available logs
- This allows `getLogs()` to be called at any time, even on empty buffers

## Changes Made

### `packages/core/src/logger.ts:79-81`

- Replaced strict bounds check with lenient index check
- Returns empty string for out-of-bounds index instead of throwing

### `packages/core/src/__tests__/logger.test.ts:27-29`

- Added test case: "Should return empty string for empty buffer"
- Ensures regression doesn't occur

## Verification

✅ **Build**: All packages build successfully
✅ **Lint**: All packages pass linting  
✅ **Tests**: All logger tests pass (11/11)
✅ **Manual test**: Empty buffer returns empty string
✅ **Manual test**: Requesting more lines than available works correctly

## Expected Behavior After Fix

1. **On TUI startup**: Logs panel shows empty (not error message)
2. **As processes output logs**: Logs appear in real-time when process is selected
3. **When selecting process**: Logs display immediately if available
4. **When requesting more logs than exist**: Returns all available logs (no error)

## Testing Instructions

```bash
cd packages/example
node dist/index.js
```

1. Navigate to any process with ↑/↓
2. Press Enter to view logs
3. Logs should appear in the right panel as the process outputs
4. Logs should update in real-time for the selected process
