# Core Package Feature Review & Improvement Plan

## Current Features Overview

### 1. Process Management (`ProcessManager`)

**Existing Capabilities:**
- ✅ Multi-tier process orchestration (dependencies → main → cleanup)
- ✅ Automatic dependency resolution and startup sequencing
- ✅ Configurable retry logic (max retries, wait time)
- ✅ Graceful shutdown with timeout escalation
- ✅ Individual process restart
- ✅ Restart all processes
- ✅ Cleanup process execution on shutdown
- ✅ TUI integration hooks

**What Works Well:**
- Dependency chain ensures correct startup order
- Cleanup processes run reliably on shutdown
- Retry mechanism provides resilience for transient failures

**Pain Points:**
- No visibility into why dependency startup failed
- Cannot pause/resume processes
- No process grouping beyond dependency/main/cleanup
- Restart all is "nuclear" - no selective group restarts

---

### 2. Process Lifecycle (`ManagedProcess`)

**Existing Capabilities:**
- ✅ Child process spawning with stdio piping
- ✅ Ready check system (log pattern matching)
- ✅ Status tracking (created, running, ready, stopping, stopped, completed, crashed, etc.)
- ✅ Graceful stop with signal escalation (SIGINT → SIGKILL)
- ✅ Event callbacks (onExit, onCrash, onReady)
- ✅ Automatic stream capture (stdout/stderr)

**What Works Well:**
- Ready checks allow for health monitoring
- Signal escalation prevents hanging processes
- Status enum provides clear process state

**Pain Points:**
- No process restart policies (always/on-failure/never)
- No environment variable injection
- No working directory configuration
- No support for process prioritization
- Cannot attach to existing processes (only spawn new)
- No CPU/memory limits enforcement

---

### 3. Logging (`SimpleLogger`)

**Existing Capabilities:**
- ✅ Circular buffer prevents unbounded memory growth
- ✅ Separate error tracking
- ✅ Event-based subscriptions (onLog, onError)
- ✅ Configurable buffer sizes
- ✅ Log retrieval with index and line limits
- ✅ Custom separator support

**What Works Well:**
- Memory-bounded design suitable for long-running processes
- Event system allows reactive updates

**Pain Points:**
- No log levels (debug, info, warn, error)
- No timestamps on log entries
- Cannot search/filter logs
- No structured logging support (JSON)
- No log persistence (only in-memory)
- No log rotation or archiving
- Reverse indexing is confusing (0 = newest)

---

### 4. Crash Reporting (`CrashReporter`)

**Existing Capabilities:**
- ✅ Automatic crash report generation
- ✅ Captures process logs at crash time
- ✅ Saves reports to filesystem (JSON)
- ✅ Multiple report types (crash, cleanupFailed, dependencyFailed, maxRetriesExceeded)
- ✅ Context data capture
- ✅ In-memory report storage

**What Works Well:**
- Comprehensive crash metadata
- Doesn't block on filesystem failures

**Pain Points:**
- No report limits (unbounded memory/disk)
- No report querying/filtering
- No report upload/remote logging
- No report notifications (webhooks, email, etc.)
- No anonymization for sensitive data
- No report compression (large log dumps)

---

## Areas for Improvement

### Priority 1: Critical for Production

#### 1.1 Resource Limits & Safety
**Problem:** No protection against resource exhaustion
**Impact:** Production systems could run out of memory/disk/processes

**Proposed Solution:**
```typescript
type ResourceLimits = {
  maxProcesses?: number;
  maxCrashReports?: number;
  maxLogBufferSize?: number;
  maxCrashReportSize?: number;
  processMemoryLimit?: number; // MB
  processCPULimit?: number; // percentage
};

class ProcessManager {
  constructor(options?: ProcessManagerOptions & {limits?: ResourceLimits}) {}
}
```

**Implementation Tasks:**
- Add process count limit with error on exceed
- Add crash report LRU eviction
- Add log truncation for oversized reports
- Consider OS-level resource limits (ulimit integration)

---

#### 1.2 Enhanced Error Handling
**Problem:** Silent failures hide critical issues
**Impact:** Difficult to debug in production

**Proposed Solution:**
- Add structured error logger
- Replace empty catch blocks with proper error handling
- Add error callback hooks for monitoring integration
- Add circuit breaker for repeatedly failing processes

**Implementation Tasks:**
```typescript
interface ErrorHandler {
  onError(error: Error, context: ErrorContext): void;
}

type ErrorContext = {
  processId?: string;
  operation: string;
  severity: 'warning' | 'error' | 'critical';
};

class ProcessManager {
  constructor(options: {errorHandler?: ErrorHandler}) {}
}
```

---

#### 1.3 Environment & Configuration
**Problem:** Cannot configure process environment or working directory
**Impact:** Processes must inherit parent environment, limiting flexibility

**Proposed Solution:**
```typescript
type ProcessConfig = {
  command: string;
  args: string[];
  env?: Record<string, string>; // Environment variables
  cwd?: string; // Working directory
  shell?: boolean | string; // Run in shell
  uid?: number; // Unix user ID
  gid?: number; // Unix group ID
};

class ManagedProcess {
  constructor(config: ProcessConfig, readyChecks: ReadyCheck[], logger: ProcessLogger) {}
}
```

**Implementation Tasks:**
- Add env merging (inherit + override)
- Add cwd validation
- Add shell execution support
- Add Unix user/group support for privilege dropping

---

### Priority 2: High Value Features

#### 2.1 Advanced Restart Policies
**Problem:** Only manual restart or max-retry logic exists
**Impact:** Cannot express "restart always" or "restart on-failure" semantics

**Proposed Solution:**
```typescript
type RestartPolicy = 
  | {type: 'no'} // Never restart
  | {type: 'always'; maxRetries?: number} // Always restart
  | {type: 'on-failure'; maxRetries?: number; codes?: number[]} // Restart on non-zero exit
  | {type: 'unless-stopped'}; // Restart unless explicitly stopped

type ProcessConfig = {
  // ... existing fields
  restartPolicy?: RestartPolicy;
  restartDelay?: number; // ms to wait between restarts
  backoffMultiplier?: number; // exponential backoff
};
```

**Implementation Tasks:**
- Implement restart policy evaluation in ManagedProcess
- Add exponential backoff for repeated failures
- Track restart history for debugging
- Add metrics (restart count, uptime, downtime)

---

#### 2.2 Process Groups & Tags
**Problem:** Only three categories (dependency, main, cleanup)
**Impact:** Cannot express complex relationships or filter by custom criteria

**Proposed Solution:**
```typescript
type ProcessMetadata = {
  tags?: string[]; // e.g., ['backend', 'critical', 'api']
  group?: string; // e.g., 'web-tier', 'data-tier'
  priority?: number; // 0-10, affects shutdown order
};

class ProcessManager {
  addProcess(id: string, process: ManagedProcessI, metadata?: ProcessMetadata): void;
  
  restartGroup(group: string): void;
  stopByTag(...tags: string[]): void;
  getProcessesByTag(tag: string): ManagedProcessI[];
}
```

**Implementation Tasks:**
- Add metadata storage in ProcessManager
- Implement group/tag filtering
- Update TUI to support filtering by group/tag
- Add priority-based shutdown ordering

---

#### 2.3 Enhanced Logging
**Problem:** Basic logging insufficient for debugging complex issues
**Impact:** Difficult to diagnose production problems

**Proposed Solution:**
```typescript
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

type LogEntry = {
  timestamp: number;
  level: LogLevel;
  message: string;
  metadata?: Record<string, any>;
};

interface ProcessLogger {
  // Existing methods...
  
  // New methods:
  setLogLevel(level: LogLevel): void;
  search(pattern: string | RegExp): LogEntry[];
  getLogsByLevel(level: LogLevel): LogEntry[];
  export(format: 'json' | 'text'): string;
  
  // Optional streaming to file
  streamToFile?(path: string): void;
  stopStreaming?(): void;
}
```

**Implementation Tasks:**
- Add timestamp to log entries
- Implement log level filtering
- Add search capability
- Add export functionality
- Consider structured logging (JSON lines)
- Add optional file streaming

---

#### 2.4 Health Checks & Monitoring
**Problem:** Ready checks are one-time, no ongoing health monitoring
**Impact:** Cannot detect processes that become unhealthy after startup

**Proposed Solution:**
```typescript
type HealthCheck = {
  type: 'http' | 'tcp' | 'exec' | 'log';
  interval: number; // ms between checks
  timeout: number; // ms before check fails
  retries?: number; // failures before marking unhealthy
  
  // Type-specific config
  http?: {url: string; expectedStatus?: number};
  tcp?: {host: string; port: number};
  exec?: {command: string; args: string[]};
  log?: {pattern: RegExp; notFoundMeansHealthy?: boolean};
};

class ManagedProcess {
  addHealthCheck(check: HealthCheck): void;
  getHealth(): 'healthy' | 'unhealthy' | 'unknown';
  onHealthChange(callback: (health: string) => void): void;
}
```

**Implementation Tasks:**
- Implement HTTP health check (fetch)
- Implement TCP health check (net.connect)
- Implement exec health check (spawn)
- Implement log-based health check
- Add health status to TUI
- Add health-based restart policies

---

### Priority 3: Nice-to-Have Enhancements

#### 3.1 Process Metrics
**Proposed Solution:**
```typescript
type ProcessMetrics = {
  uptime: number; // ms
  restartCount: number;
  crashCount: number;
  memoryUsage?: {rss: number; heapUsed: number}; // bytes
  cpuUsage?: {user: number; system: number}; // microseconds
  lastExitCode?: number;
  lastExitSignal?: NodeJS.Signals;
};

class ManagedProcess {
  getMetrics(): ProcessMetrics;
}
```

**Implementation:** Use `process.cpuUsage()` and `process.memoryUsage()` from child process

---

#### 3.2 Inter-Process Communication
**Proposed Solution:**
```typescript
class ProcessManager {
  sendMessage(fromId: string, toId: string, message: any): void;
  broadcast(fromId: string, message: any): void;
  
  onMessage(processId: string, callback: (message: any) => void): void;
}
```

**Implementation:** Use IPC channels in child_process spawn options

---

#### 3.3 Process Dependencies Graph
**Proposed Solution:**
```typescript
class ProcessManager {
  setDependsOn(processId: string, dependencies: string[]): void;
  getDependencyGraph(): {nodes: string[]; edges: [string, string][]};
  
  // Ensures dependency starts before dependent
  // Ensures dependent stops before dependency
}
```

**Implementation:** Topological sort for startup/shutdown order

---

#### 3.4 Configuration Files
**Proposed Solution:**
```yaml
# ovrseer.yml
processes:
  - id: postgres
    type: dependency
    command: postgres
    args: [-D, /var/lib/postgresql/data]
    env:
      POSTGRES_PASSWORD: secret
    readyChecks:
      - logPattern: "database system is ready"
        timeout: 5000
        
  - id: api
    type: main
    command: node
    args: [server.js]
    dependsOn: [postgres]
    restartPolicy:
      type: on-failure
      maxRetries: 3
```

**Implementation:** Add YAML/JSON config parser, schema validation

---

## Possible New Features

### 1. Plugin System
Allow extensions without modifying core:
```typescript
interface Plugin {
  name: string;
  onProcessStart?(process: ManagedProcessI): void;
  onProcessExit?(process: ManagedProcessI): void;
  onManagerStart?(manager: ProcessManager): void;
}

class ProcessManager {
  use(plugin: Plugin): void;
}
```

**Use Cases:**
- Metrics collection (Prometheus, StatsD)
- Log shipping (Elasticsearch, CloudWatch)
- Alerting (PagerDuty, Slack)
- Trace collection (OpenTelemetry)

---

### 2. Remote Management API
Expose management over HTTP/gRPC:
```typescript
class RemoteAPI {
  constructor(manager: ProcessManager, options: {port: number; auth?: string}) {}
  
  // REST endpoints:
  // GET /processes
  // GET /processes/:id
  // POST /processes/:id/restart
  // POST /processes/:id/stop
  // GET /processes/:id/logs
}
```

**Use Cases:**
- Dashboard UI
- CLI remote control
- Integration with orchestration systems

---

### 3. Docker/Container Support
Manage containers instead of raw processes:
```typescript
type DockerConfig = {
  image: string;
  containerName?: string;
  ports?: Record<string, string>;
  volumes?: string[];
  env?: Record<string, string>;
};

class DockerProcess implements ManagedProcessI {
  constructor(config: DockerConfig, readyChecks: ReadyCheck[]) {}
}
```

---

### 4. Load Balancing & Scaling
Horizontal scaling of processes:
```typescript
class ProcessManager {
  scale(processId: string, replicas: number): void;
  
  // Creates processId-1, processId-2, ... processId-N
  // Load balances between replicas
}
```

**Implementation:** Port allocation, round-robin routing

---

### 5. Process Snapshots & Time Travel
Capture and restore process state:
```typescript
class ProcessManager {
  createSnapshot(): Snapshot;
  restoreSnapshot(snapshot: Snapshot): void;
  
  // Snapshot includes:
  // - Process list & status
  // - Logs (last N lines)
  // - Metrics
  // - Configuration
}
```

**Use Cases:**
- Debugging: capture state at crash time
- Testing: restore known-good states
- Rollback: undo configuration changes

---

## Implementation Roadmap

### Phase 1: Production Hardening (v0.1.0)
**Timeline:** 1-2 weeks
- Resource limits
- Enhanced error handling
- Environment & configuration support
- Documentation & examples

### Phase 2: Advanced Features (v0.2.0)
**Timeline:** 2-3 weeks
- Restart policies
- Process groups & tags
- Enhanced logging with levels & search
- Health checks

### Phase 3: Observability (v0.3.0)
**Timeline:** 2-3 weeks
- Process metrics
- Plugin system foundations
- Better crash analytics
- Performance optimizations

### Phase 4: Ecosystem (v1.0.0)
**Timeline:** 4-6 weeks
- Configuration files (YAML/JSON)
- Remote management API
- Documentation site
- Example plugins (metrics, logging)

### Future Phases (v1.x)
- Docker/container support
- Load balancing & scaling
- Web dashboard
- Advanced IPC
- Process snapshots

---

## Metrics for Success

**Performance:**
- Process startup time < 100ms overhead
- Memory overhead < 50MB for 100 processes
- Log retrieval < 10ms for 1000 lines
- TUI update rate 60fps

**Reliability:**
- Zero crashes in 30-day continuous operation
- 100% cleanup execution on shutdown
- < 0.1% crash reports lost

**Usability:**
- Configuration in < 10 lines for simple cases
- Learning curve < 1 hour for basic usage
- Documentation coverage > 90%

---

## Conclusion

The core package provides a solid foundation with essential process management features. To reach production maturity, focus on:

1. **Hardening** - Resource limits, error handling, safety
2. **Flexibility** - Environment config, restart policies, groups
3. **Observability** - Logging, metrics, health checks
4. **Extensibility** - Plugins, configuration files, remote API

The roadmap above provides a path from current state to a feature-rich, production-ready process manager suitable for diverse use cases from development to production deployment.
