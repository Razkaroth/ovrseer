# TUI-Ink Package Feature Review & Improvement Plan

## Current Features Overview

### Architecture
The TUI package provides a React-based terminal interface using Ink (React for CLIs). It consists of:
- **InkTUIWrapper**: Adapter class implementing `TUIRendererI` interface
- **InkTUIRenderer**: React component rendering the actual UI

---

## Existing Features

### ✅ What's Implemented

1. **Process List Display**
   - Grouped by type (Dependencies, Main, Cleanup)
   - Status indicators with icons (▶ running, ■ stopped, ✖ crashed, etc.)
   - Visual selection with background highlighting

2. **Keyboard Navigation**
   - ↑/↓ arrow keys for selection
   - Enter to view logs
   - `r` to restart selected process
   - `R`/Ctrl-R to restart all
   - `q` to quit (double press for force quit)
   - `s` to start/stop

3. **Layout**
   - Two-pane interface (25% process list, 75% logs)
   - Status bar at bottom
   - Help text/instructions

4. **Log Display**
   - Shows logs for selected process
   - Updates live as new logs arrive
   - Shows process ID and type

---

## Critical Issues

### 1. Performance Problems

**Issue:** Re-renders on every log line
- `processItems` array recreated every render
- `useInput` sets up new listeners every render (memory leak)
- `useEffect` runs constantly due to missing/incorrect dependencies
- Wrapper re-creates React element on every render

**Impact:** 
- High CPU usage with chatty processes
- Memory leaks over time
- UI lag and dropped frames

**Fix Required:**
```typescript
// Memoize process items
const processItems = useMemo(() => {
  const items: ProcessItem[] = [];
  processes.dependencies.forEach((process, id) => {
    items.push({id, type: 'dependency', process});
  });
  // ... etc
  return items;
}, [processes]);

// Fix useEffect deps
useEffect(() => {
  // ... selection logic
}, [state.selectedProcessId, state.selectedProcessType, processItems]);
```

---

### 2. Missing Core Features

**Issue:** Interface methods not implemented
- `showInstructions()` - no-op
- `selectPrevious()` - no-op  
- `selectNext()` - no-op

**Impact:**
- ProcessManager calls these methods, expects them to work
- Navigation doesn't work properly from external control

**Fix Required:** Implement all interface methods or remove from interface

---

### 3. No Scroll Support

**Issue:** Logs overflow viewport with no scrolling
- Long logs truncated or overflow
- No way to scroll up/down through history
- No page up/down support

**Impact:** Cannot view full logs for debugging

**Fix Required:**
```typescript
const [scrollOffset, setScrollOffset] = useState(0);

useInput((input, key) => {
  if (key.pageUp) {
    setScrollOffset(prev => Math.max(0, prev - 20));
  } else if (key.pageDown) {
    setScrollOffset(prev => prev + 20);
  }
});

// Render slice of logs based on scrollOffset
```

---

### 4. Type Safety Issues

**Issue:** `renderInstance: any` and status icon mismatches
- Wrapper uses `any` type for Ink render instance
- Status icons reference non-existent statuses ('starting')

**Fix Required:**
```typescript
import {RenderInstance} from 'ink';

private renderInstance: RenderInstance | null = null;

// Fix status icons to match ProcessStatus type
const getStatusIcon = (status: ProcessStatus): string => {
  switch (status) {
    case 'running': return '▶';
    case 'ready': return '✓';
    case 'stopped': return '■';
    case 'crashed': return '✖';
    case 'stopping': return '⋯';
    case 'completed': return '✓';
    case 'failedByReadyCheck': return '✖';
    case 'couldNotSpawn': return '✖';
    case 'created': return '○';
  }
};
```

---

## Areas for Improvement

### Priority 1: Critical UX Fixes

#### 1.1 Responsive Layout
**Problem:** Fixed 80% height doesn't adapt to terminal size
**Solution:**
```typescript
import {useStdout} from 'ink';

const {stdout} = useStdout();
const terminalHeight = stdout?.rows || 24;
const terminalWidth = stdout?.columns || 80;

// Calculate dynamic heights
const headerHeight = 3;
const footerHeight = 4;
const contentHeight = terminalHeight - headerHeight - footerHeight;
```

---

#### 1.2 Better Status Visualization
**Problem:** Status only shown as text, hard to scan
**Solution:**
- Color-code status (green=ready, yellow=running, red=crashed)
- Add colored borders to process list items
- Add process health indicators
- Animated "spinner" for starting/stopping

```typescript
const getStatusColor = (status: ProcessStatus): string => {
  switch (status) {
    case 'ready': return 'green';
    case 'running': return 'yellow';
    case 'crashed': return 'red';
    case 'stopped': return 'gray';
    default: return 'white';
  }
};

<Box borderColor={getStatusColor(status)}>
  <Text color={getStatusColor(status)}>
    {icon} {id}
  </Text>
</Box>
```

---

#### 1.3 Log Enhancements
**Problem:** No search, filter, or log level support
**Solution:**
- Add search box (`/` to activate)
- Filter by log level if available
- Highlight search matches
- Show line numbers
- Tail mode (auto-scroll to bottom)

```typescript
const [searchTerm, setSearchTerm] = useState('');
const [searchMode, setSearchMode] = useState(false);
const [tailMode, setTailMode] = useState(true);

// Render with highlighting
const highlightedLogs = logs.split('\n').map(line => {
  if (searchTerm && line.includes(searchTerm)) {
    return <Text backgroundColor="yellow">{line}</Text>;
  }
  return <Text>{line}</Text>;
});
```

---

### Priority 2: Enhanced Functionality

#### 2.1 Process Filtering & Grouping
**Problem:** All processes shown, can't focus on subset
**Solution:**
- Filter by status (show only running, show only crashed)
- Filter by type (show only main)
- Filter by tag/group (if implemented in core)
- Search processes by name

```typescript
const [filter, setFilter] = useState<{
  status?: ProcessStatus[];
  type?: TUIProcessType[];
  search?: string;
}>({});

const filteredItems = processItems.filter(item => {
  if (filter.status && !filter.status.includes(item.process.getStatus())) {
    return false;
  }
  if (filter.type && !filter.type.includes(item.type)) {
    return false;
  }
  if (filter.search && !item.id.includes(filter.search)) {
    return false;
  }
  return true;
});
```

---

#### 2.2 Multiple Views/Modes
**Problem:** Single view doesn't show all information
**Solution:**
- **List view** (current): Process list + logs
- **Grid view**: Process grid with mini-log previews
- **Details view**: Single process with full details
- **Dashboard view**: Overview metrics and status

```typescript
type ViewMode = 'list' | 'grid' | 'details' | 'dashboard';
const [viewMode, setViewMode] = useState<ViewMode>('list');

useInput((input) => {
  if (input === '1') setViewMode('list');
  if (input === '2') setViewMode('grid');
  if (input === '3') setViewMode('details');
  if (input === '4') setViewMode('dashboard');
});
```

---

#### 2.3 Process Details Panel
**Problem:** Only logs shown, no other process info
**Solution:** Show comprehensive process details:
- PID
- Uptime
- Memory usage
- CPU usage
- Restart count
- Last exit code/signal
- Environment variables
- Command & args

```typescript
const ProcessDetails: React.FC<{process: ManagedProcessI}> = ({process}) => (
  <Box flexDirection="column">
    <Text bold>Process Details</Text>
    <Text>PID: {process.process?.pid || 'N/A'}</Text>
    <Text>Status: {process.getStatus()}</Text>
    <Text>Uptime: {formatUptime(uptime)}</Text>
    <Text>Memory: {formatBytes(memoryUsage)}</Text>
    <Text>Restarts: {restartCount}</Text>
  </Box>
);
```

---

#### 2.4 Interactive Commands
**Problem:** Limited to restart/stop, could do more
**Solution:** Add command palette (`Ctrl-P` or `:` vim-style)
- Kill process (SIGKILL)
- Send custom signal
- Change log level
- Export logs
- Copy command to clipboard
- Open in external tool

```typescript
const [commandMode, setCommandMode] = useState(false);
const [command, setCommand] = useState('');

const commands = {
  'kill': () => selectedProcess?.kill(),
  'signal SIGTERM': () => selectedProcess?.stop(1000, 'SIGTERM'),
  'export logs': () => exportLogs(selectedProcess),
  'clear logs': () => selectedProcess?.logger.reset(),
};
```

---

### Priority 3: Polish & Aesthetics

#### 3.1 Themes
**Problem:** Hardcoded colors, no customization
**Solution:**
```typescript
type Theme = {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  background: string;
  foreground: string;
  border: string;
};

const defaultTheme: Theme = {
  primary: 'cyan',
  secondary: 'blue',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  background: 'black',
  foreground: 'white',
  border: 'cyan',
};

const themes = {
  default: defaultTheme,
  solarized: {...},
  dracula: {...},
  nord: {...},
};
```

---

#### 3.2 Animations & Transitions
**Problem:** Static UI feels unresponsive
**Solution:**
- Spinner for starting/stopping processes
- Fade in/out for status changes
- Pulse for process activity
- Progress bar for operations with known duration

```typescript
import {Text} from 'ink';
import Spinner from 'ink-spinner';

<Box>
  {status === 'starting' && <Spinner type="dots" />}
  <Text>{id}</Text>
</Box>
```

---

#### 3.3 Charts & Visualizations
**Problem:** No visual representation of metrics
**Solution:**
- Sparklines for CPU/memory over time
- Bar chart for log volume per process
- Timeline for process events
- Status summary (X running, Y crashed, Z stopped)

```typescript
import {Box, Text} from 'ink';

const StatusSummary: React.FC<{processes: ProcessItem[]}> = ({processes}) => {
  const counts = processes.reduce((acc, item) => {
    const status = item.process.getStatus();
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Box>
      <Text color="green">✓ {counts.ready || 0} ready  </Text>
      <Text color="yellow">▶ {counts.running || 0} running  </Text>
      <Text color="red">✖ {counts.crashed || 0} crashed</Text>
    </Box>
  );
};
```

---

## Possible New Features

### 1. Split Panes & Tabs
Compare logs from multiple processes side-by-side:
```typescript
const [splitMode, setSplitMode] = useState<'single' | 'horizontal' | 'vertical'>('single');
const [panes, setPanes] = useState<Array<{processId: string; type: TUIProcessType}>>([]);

// Horizontal split: logs above/below
// Vertical split: logs left/right
// Tabs: switch between multiple processes
```

---

### 2. Log Playback
Replay logs from historical snapshots:
```typescript
const [playbackMode, setPlaybackMode] = useState(false);
const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
const [playbackPosition, setPlaybackPosition] = useState(0);

// Step through logs line-by-line
// Fast-forward/rewind
// Pause/resume
```

---

### 3. Remote TUI
Connect to remote process manager:
```typescript
class RemoteInkTUIWrapper implements TUIRendererI {
  constructor(private wsUrl: string) {}
  
  // Connect via WebSocket
  // Receive process state updates
  // Send commands to remote manager
}
```

---

### 4. Screenshot/Recording
Capture TUI state for sharing:
```typescript
const [recording, setRecording] = useState(false);

// Save as SVG (using term-to-svg)
// Export as text transcript
// Create animated GIF
```

---

### 5. Mouse Support
Click-to-select processes:
```typescript
import {useMouse} from 'ink';

const {mouseX, mouseY, isPressed} = useMouse();

// Click on process to select
// Drag to resize panes
// Right-click for context menu
```

---

### 6. Configuration UI
Edit process config from TUI:
```typescript
const ConfigEditor: React.FC = () => (
  <Box flexDirection="column">
    <TextInput label="Command" value={command} onChange={setCommand} />
    <TextInput label="Args" value={args.join(' ')} onChange={setArgs} />
    <TextInput label="Env" value={JSON.stringify(env)} onChange={setEnv} />
  </Box>
);
```

---

## Implementation Roadmap

### Phase 1: Fix Critical Issues (Week 1)
**Must-have before release**
- ✅ Fix React performance issues (memoization)
- ✅ Implement missing interface methods
- ✅ Add scroll support for logs
- ✅ Fix type safety issues
- ✅ Make layout responsive

### Phase 2: UX Improvements (Week 2)
**High-value enhancements**
- ✅ Better status visualization (colors, icons)
- ✅ Process filtering
- ✅ Search in logs
- ✅ Process details panel
- ✅ Improved help/documentation

### Phase 3: Advanced Features (Week 3-4)
**Nice-to-have**
- Multiple view modes
- Command palette
- Process metrics visualization
- Theme support
- Animations

### Phase 4: Future Enhancements (v1.x)
**Long-term vision**
- Split panes & tabs
- Remote TUI support
- Log playback
- Mouse support
- Configuration UI

---

## Specific Style Improvements for Next Task

### Immediate Visual Enhancements

1. **Color Scheme**
   ```typescript
   // Status-based colors
   const colors = {
     ready: '#22c55e',      // green-500
     running: '#eab308',    // yellow-500
     crashed: '#ef4444',    // red-500
     stopping: '#f97316',   // orange-500
     stopped: '#6b7280',    // gray-500
   };
   ```

2. **Better Borders**
   ```typescript
   // Use different border styles for different sections
   <Box borderStyle="double" borderColor="cyan">  // Process list
   <Box borderStyle="round" borderColor="blue">   // Logs
   <Box borderStyle="single" borderColor="gray">  // Status bar
   ```

3. **Icons & Symbols**
   ```typescript
   const icons = {
     ready: '✓',
     running: '▶',
     crashed: '✖',
     stopping: '⏸',
     stopped: '■',
     dependency: '📦',
     main: '⚙',
     cleanup: '🧹',
   };
   ```

4. **Layout Improvements**
   ```typescript
   // Add padding and margins for breathing room
   <Box padding={1} margin={1}>
   
   // Better proportions (30% list, 70% logs instead of 25/75)
   <Box width="30%">  // Process list
   <Box width="70%">  // Logs
   
   // Add header with title
   <Box justifyContent="center" borderBottom>
     <Text bold color="cyan">OVRSEER Process Manager</Text>
   </Box>
   ```

5. **Status Bar Enhancement**
   ```typescript
   // Multi-line status bar with more info
   <Box flexDirection="column" borderStyle="round" padding={1}>
     <Box>
       <Text bold>Summary: </Text>
       <Text color="green">{readyCount} ready</Text>
       <Text> | </Text>
       <Text color="red">{crashedCount} crashed</Text>
     </Box>
     <Box>
       <Text dimColor>Keys: ↑↓ nav | ⏎ logs | r restart | R restart-all | q quit</Text>
     </Box>
     <Box>
       <Text backgroundColor="blue">{statusMessage}</Text>
     </Box>
   </Box>
   ```

6. **Log Panel Improvements**
   ```typescript
   // Add log metadata header
   <Box flexDirection="column">
     <Box justifyContent="space-between" borderBottom>
       <Text bold color="yellow">{processId}</Text>
       <Text dimColor>{lineCount} lines</Text>
     </Box>
     
     // Line numbers
     {logs.split('\n').map((line, i) => (
       <Box key={i}>
         <Text dimColor>{i + 1} </Text>
         <Text>{line}</Text>
       </Box>
     ))}
   </Box>
   ```

---

## Success Metrics

**Performance:**
- 60fps render rate even with high-frequency logs
- < 100MB memory usage for 100 processes
- < 10ms keystroke latency

**Usability:**
- All keyboard shortcuts discoverable in UI
- < 5 keystrokes to access any feature
- Clear visual feedback for all actions

**Aesthetics:**
- Consistent color scheme
- Proper visual hierarchy
- Smooth animations (no flicker)
- Professional appearance

---

## Conclusion

The TUI package has a solid foundation with Ink but needs polish before release:

**Critical (Must Fix):**
1. Performance issues (React optimization)
2. Missing interface implementations
3. Scroll support
4. Type safety

**High Priority (Should Fix):**
1. Responsive layout
2. Better status visualization
3. Process filtering
4. Log search

**Nice to Have (Can Wait):**
1. Multiple view modes
2. Advanced visualizations
3. Themes
4. Mouse support

With focused effort on the critical and high-priority items, the TUI can be production-ready in 1-2 weeks. The roadmap above provides a path from current state to a polished, feature-rich terminal interface.
