import { ProcessManager } from '../process-manager'
import { ManagedProcess } from '../managed-process'
import { CrashReporter } from '../crash-reporter'
import { TUIRenderer } from '../tui-renderer'
import { SimpleLogger } from '../logger'

const crashReporter = new CrashReporter()
const tui = new TUIRenderer()

const processManager = new ProcessManager({
  retries: 2,
  waitTime: 1000,
  crashReporter,
  tui,
})

console.log('🚀 Starting Process Manager Sample App\n')

const dependency1 = new ManagedProcess(
  'sh',
  [
    '-c',
    'echo "Database starting..." && sleep 2 && echo "Database ready on port 5432" && sleep 30 && echo "Database shutdown"',
  ],
  [
    {
      logPattern: /Database ready/,
      timeout: 5000,
    },
  ],
  new SimpleLogger(20, 10),
)

const dependency2 = new ManagedProcess(
  'sh',
  [
    '-c',
    'echo "Redis starting..." && sleep 1 && echo "Redis ready on port 6379" && sleep 30 && echo "Redis shutdown"',
  ],
  [
    {
      logPattern: /Redis ready/,
      timeout: 3000,
    },
  ],
  new SimpleLogger(20, 10),
)

const dependency3 = new ManagedProcess(
  'sh',
  [
    '-c',
    'echo "Message Queue initializing..." && sleep 3 && echo "MQ ready on port 5672" && sleep 30 && echo "MQ stopped"',
  ],
  [
    {
      logPattern: /MQ ready/,
      timeout: 6000,
    },
  ],
  new SimpleLogger(20, 10),
)

const apiServer = new ManagedProcess(
  'sh',
  [
    '-c',
    `
      echo "API Server starting..."
      sleep 1
      echo "API Server listening on http://localhost:3000"
      for i in {1..60}; do
        echo "API: Handled request #$i - $(date +%H:%M:%S)"
        sleep 1
      done
    `,
  ],
  [
    {
      logPattern: /listening on/,
      timeout: 3000,
    },
  ],
  new SimpleLogger(50, 20),
)

const workerProcess = new ManagedProcess(
  'sh',
  [
    '-c',
    `
      echo "Worker process starting..."
      sleep 1
      echo "Worker ready - processing jobs"
      for i in {1..40}; do
        echo "Worker: Processed job #$i - $(date +%H:%M:%S)"
        sleep 2
      done
    `,
  ],
  [
    {
      logPattern: /Worker ready/,
      timeout: 3000,
    },
  ],
  new SimpleLogger(30, 15),
)

const schedulerProcess = new ManagedProcess(
  'sh',
  [
    '-c',
    `
      echo "Scheduler starting..."
      sleep 1
      echo "Scheduler ready - running cron jobs"
      for i in {1..20}; do
        echo "Scheduler: Executed task #$i at $(date +%H:%M:%S)"
        sleep 3
      done
    `,
  ],
  [
    {
      logPattern: /Scheduler ready/,
      timeout: 3000,
    },
  ],
  new SimpleLogger(25, 15),
)

const cleanupProcess = new ManagedProcess(
  'sh',
  [
    '-c',
    `
      echo "Cleanup started - closing connections..."
      sleep 1
      echo "Cleanup: Flushing database connections"
      sleep 0.5
      echo "Cleanup: Closing Redis connections"
      sleep 0.5
      echo "Cleanup: Saving state to disk"
      sleep 0.5
      echo "Cleanup complete"
    `,
  ],
  [],
  new SimpleLogger(10, 5),
)

processManager.addDependency('database', dependency1)
processManager.addDependency('redis', dependency2)
processManager.addDependency('messageQueue', dependency3)

processManager.addMainProcess('api', apiServer)
processManager.addMainProcess('worker', workerProcess)
processManager.addMainProcess('scheduler', schedulerProcess)

processManager.addCleanupProcess('cleanup', cleanupProcess)

console.log('📦 Added processes:')
console.log('  Dependencies: database, redis, messageQueue')
console.log('  Main: api, worker, scheduler')
console.log('  Cleanup: cleanup\n')

console.log('⏳ Starting all processes...\n')
processManager.start()

console.log('🎨 Launching TUI in 2 seconds...')
console.log('   Use arrow keys to navigate, Enter to view logs, r to restart, q to quit\n')

setTimeout(() => {
  processManager.startTuiSession()
}, 2000)

process.on('SIGINT', () => {
  console.log('\n\n🛑 Received SIGINT, stopping all processes...')
  processManager.stop()
  setTimeout(() => {
    console.log('✅ All processes stopped')
    console.log(`📊 Crash reports saved to: ${crashReporter.getReportsDir()}`)
    process.exit(0)
  }, 2000)
})
