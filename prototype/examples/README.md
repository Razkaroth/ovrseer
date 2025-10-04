# Process Manager Examples

Interactive examples demonstrating the Process Manager capabilities.

## Running the Examples

### Sample App - Full Stack Simulation

Simulates a complete application stack with dependencies and services:

```bash
bun run src/cli/utils/process-manager/examples/sample-app.ts
```

**Features:**
- 3 dependency processes (database, redis, message queue)
- 3 main processes (API server, worker, scheduler)
- 1 cleanup process
- Varied startup times and logging patterns
- TUI for interactive monitoring

**What you'll see:**
1. Dependencies start first and wait for "ready" signals
2. Main processes start only after all dependencies are ready
3. Each process logs at different intervals
4. Use TUI to navigate, view logs, and restart processes

### Crash Demo - Resilience Testing

Demonstrates crash handling and recovery mechanisms:

```bash
bun run src/cli/utils/process-manager/examples/crash-demo.ts
```

**Features:**
- Stable process (no crashes)
- Crashing process (intentional failure after 5s)
- Intermittent process (random crashes)
- Slow start process (5s initialization)
- Automatic retry with configurable limits
- Crash report generation

**What you'll see:**
1. Some processes will crash and automatically retry
2. Crash reports are generated and saved
3. Process status updates in real-time
4. Retry count tracking
5. Final crash report summary

## TUI Controls

While TUI is active:

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate between processes |
| `Enter` | View logs for selected process |
| `r` | Restart selected process |
| `R` | Restart all processes |
| `q` | Quit and stop all processes |
| `h` | Show help |

## Example Output

### Sample App

```
🚀 Starting Process Manager Sample App

📦 Added processes:
  Dependencies: database, redis, messageQueue
  Main: api, worker, scheduler
  Cleanup: cleanup

⏳ Starting all processes...

🎨 Launching TUI in 2 seconds...
   Use arrow keys to navigate, Enter to view logs, r to restart, q to quit

[TUI Interface appears]

┌─ Dependencies ─────────────────────┐
│ ● database      [ready]            │
│ ● redis         [ready]            │
│ ● messageQueue  [ready]            │
└────────────────────────────────────┘

┌─ Main Processes ───────────────────┐
│ ► api           [running]          │
│   worker        [running]          │
│   scheduler     [running]          │
└────────────────────────────────────┘
```

### Crash Demo

```
💥 Starting Crash & Recovery Demo

📦 Added processes:
  - stable: Runs without issues
  - crasher: Will crash after 5s (will retry)
  - intermittent: Random crashes
  - slow: Takes 5s to start

⏳ Starting all processes...
💡 Watch how the system handles crashes and retries

[After 15 seconds]

📋 Crash Report Summary:
   Total crashes: 3
   - crasher: crash at 2025-10-03T18:45:23.123Z
     Status: crashed, Retries: 1
   - crasher: crash at 2025-10-03T18:45:26.456Z
     Status: crashed, Retries: 2
   - intermittent: crash at 2025-10-03T18:45:21.789Z
     Status: crashed, Retries: 1
```

## Customization

You can modify these examples to test different scenarios:

### Change Retry Behavior

```typescript
const processManager = new ProcessManager({
  retries: 5,        // More retries
  waitTime: 3000,    // Longer wait between retries
})
```

### Adjust Ready Check Timeouts

```typescript
const process = new ManagedProcess('sh', ['-c', 'echo ready'], [], {
  readyCheck: {
    logPattern: /ready/,
    timeout: 10000,  // Wait up to 10 seconds
  },
})
```

### Change Log Buffer Size

```typescript
const process = new ManagedProcess('sh', ['-c', 'echo logs'], [], {
  maxLogLines: 100,      // Keep more stdout logs
  maxErrorLines: 50,     // Keep more stderr logs
})
```

### Custom Crash Report Location

```typescript
const crashReporter = new CrashReporter('/custom/path/reports')
```

## Tips

1. **Press `q` to quit gracefully** - Stops all processes and runs cleanup
2. **View logs frequently** - Press `Enter` on any process to see its output
3. **Watch for status changes** - Process colors indicate their state
4. **Check crash reports** - They're saved to `/tmp/process-manager/crash-reports` by default
5. **Experiment with restarts** - Press `r` to restart individual processes

## Common Issues

### "No main processes to start"
Make sure you've added at least one main process before calling `start()`

### TUI not appearing
Wait for the delay or check console for errors

### Processes not stopping
Use Ctrl+C (SIGINT) to force shutdown

## Next Steps

- Read the main [README.md](../README.md) for API documentation
- Check the test files for more usage patterns
- Build your own process orchestration scripts
