# TUI Verification Guide

## Summary of Changes

The following bugs were fixed in the previous session:

1. **Live logs not showing** - Fixed by passing `logsData` prop from InkTUIWrapper to InkTUIRenderer
2. **Status messages not updating** - Fixed by passing `statusMessage` prop from InkTUIWrapper to InkTUIRenderer
3. **Process restart not working** - Fixed by calling `pm.startTuiSession()` instead of `tui.init()` to enable key handlers
4. **Cleanup not visible during shutdown** - Fixed by adding cleanup process to ProcessManager with `pm.addCleanupProcess()`
5. **Manual signal handlers bypassing TUI** - Fixed by removing custom SIGINT/SIGTERM handlers from example

## Build Status

✅ **Build**: All packages build successfully
✅ **Lint**: All packages pass linting  
❌ **Tests**: Core tests have 1 failure (unrelated to TUI changes)

## Manual Testing Instructions

Since the TUI requires an interactive terminal with raw mode support, it cannot be fully tested through this interface. To manually test:

### 1. Start the TUI

```bash
cd packages/example
node dist/index.js
```

### 2. Test Live Logs Display

- **Expected**: The TUI should show 3 main processes (web-server, api-server, worker) and 1 dependency (db)
- **Test**: Use ↑/↓ arrow keys to navigate between processes
- **Test**: Press `Enter` on any process
- **Expected**: The right panel should show live logs for that process
- **Verify**: Logs should update in real-time as the process outputs

### 3. Test Process Restart (r key)

- **Test**: Navigate to any running process and press `r`
- **Expected**: Status should change to "stopping" then "starting" then "running"
- **Expected**: Status message at bottom should show "Restarting [process-name]..."
- **Verify**: Logs should show the process restarting

### 4. Test Restart All (R or Ctrl-R)

- **Test**: Press `R` or `Ctrl-R`
- **Expected**: All processes should restart sequentially
- **Expected**: Status message should show "Restarting all processes..."
- **Verify**: Process icons should cycle through stopping/starting/running states

### 5. Test Graceful Quit with Cleanup (q key)

- **Test**: Press `q`
- **Expected**: Status message should show "Shutting down gracefully..."
- **Expected**: A "cleanup" process should appear in the process list
- **Expected**: The cleanup process should run for ~2 seconds
- **Expected**: All processes should stop gracefully
- **Expected**: TUI should exit cleanly

### 6. Test Navigation

- **Test**: Use ↑ arrow key to move up through process list
- **Test**: Use ↓ arrow key to move down through process list
- **Expected**: Selected process should have blue background
- **Expected**: Selection should not go below 0 or above last process

## Key Files Changed

- `packages/tui-ink/src/InkTUIWrapper.ts:25-38,48-64` - Pass statusMessage and logsData to renderer
- `packages/tui-ink/src/InkTUIRenderer.tsx:20-30` - Receive statusMessage and logsData as props
- `packages/example/src/index.ts:61,63` - Add cleanup process and use startTuiSession()

## Technical Details

### Data Flow for Live Updates

1. ProcessManager calls `tui.showLogs(id, type, logs)`
2. InkTUIWrapper stores logs in `this.logsData` and calls `render()`
3. InkTUIWrapper creates React element with `logsData` prop
4. InkTUIRenderer receives and displays the `logsData` prop

### Key Handler Flow

1. User presses key in terminal
2. Ink's `useInput` hook captures it in InkTUIRenderer
3. InkTUIRenderer calls `onKeyPress(key, meta)`
4. InkTUIWrapper's callback forwards to ProcessManager
5. ProcessManager handles the key (restart, quit, etc.)
6. ProcessManager updates state and re-renders TUI

## Known Limitations

- Cannot test interactively through non-TTY environments (like this AI session)
- Raw mode is required for Ink's input handling
- Tests for tui-ink package are not implemented yet
