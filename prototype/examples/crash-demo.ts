import { ProcessManager } from '../process-manager'
import { ManagedProcess } from '../managed-process'
import { CrashReporter } from '../crash-reporter'
import { TUIRenderer } from '../tui-renderer'
import { SimpleLogger } from '../logger'

const crashReporter = new CrashReporter()
const tui = new TUIRenderer()

const processManager = new ProcessManager({
  retries: 3,
  waitTime: 2000,
  crashReporter,
  tui,
})

console.log('💥 Starting Crash & Recovery Demo\n')

const stableProcess = new ManagedProcess(
  'sh',
  [
    '-c',
    `
      echo "Stable process starting..."
      sleep 1
      echo "Stable process ready"
      for i in {1..100}; do
        echo "Stable: Running iteration $i - $(date +%H:%M:%S)"
        sleep 2
      done
    `,
  ],
  [
    {
      logPattern: /Stable process ready/,
      timeout: 3000,
    },
  ],
  new SimpleLogger(50, 20),
)

const crashingProcess = new ManagedProcess(
  'sh',
  [
    '-c',
    `
      echo "Crashing process starting..."
      sleep 1
      echo "Crashing process ready"
      sleep 3
      echo "ERROR: Something went wrong!"
      sleep 1
      exit 1
    `,
  ],
  [
    {
      logPattern: /Crashing process ready/,
      timeout: 3000,
    },
  ],
  new SimpleLogger(30, 15),
)

const intermittentProcess = new ManagedProcess(
  'sh',
  [
    '-c',
    `
      echo "Intermittent process starting..."
      sleep 1
      echo "Intermittent ready"
      RANDOM_CRASH=$((RANDOM % 3))
      sleep $RANDOM_CRASH
      if [ $RANDOM_CRASH -eq 2 ]; then
        echo "WARN: Intermittent failure detected"
        exit 1
      else
        for i in {1..50}; do
          echo "Intermittent: Operation $i completed"
          sleep 2
        done
      fi
    `,
  ],
  [
    {
      logPattern: /Intermittent ready/,
      timeout: 3000,
    },
  ],
  new SimpleLogger(40, 20),
)

const slowStartProcess = new ManagedProcess(
  'sh',
  [
    '-c',
    `
      echo "Slow start process initializing..."
      sleep 5
      echo "Slow start ready - initialization took 5s"
      for i in {1..30}; do
        echo "Slow: Processed item $i"
        sleep 3
      done
    `,
  ],
  [
    {
      logPattern: /Slow start ready/,
      timeout: 8000,
    },
  ],
  new SimpleLogger(35, 15),
)

processManager.addMainProcess('stable', stableProcess)
processManager.addMainProcess('crasher', crashingProcess)
processManager.addMainProcess('intermittent', intermittentProcess)
processManager.addMainProcess('slow', slowStartProcess)

console.log('📦 Added processes:')
console.log('  - stable: Runs without issues')
console.log('  - crasher: Will crash after 5s (will retry)')
console.log('  - intermittent: Random crashes')
console.log('  - slow: Takes 5s to start\n')

console.log('⏳ Starting all processes...')
console.log('💡 Watch how the system handles crashes and retries\n')

processManager.start()

console.log('🎨 Launching TUI in 2 seconds...\n')

setTimeout(() => {
  processManager.startTuiSession()
}, 2000)

setTimeout(() => {
  console.log('\n📋 Crash Report Summary:')
  const reports = crashReporter.getReports()
  console.log(`   Total crashes: ${reports.length}`)
  reports.forEach((report) => {
    console.log(`   - ${report.processId}: ${report.type} at ${report.timestamp}`)
    console.log(`     Status: ${report.status}, Retries: ${report.retryCount || 0}`)
  })
}, 15000)

process.on('SIGINT', () => {
  console.log('\n\n🛑 Stopping all processes...')
  processManager.stop()
  setTimeout(() => {
    console.log('\n📊 Final Crash Report:')
    const reports = crashReporter.getReports()
    console.log(`   Total incidents: ${reports.length}`)
    console.log(`   Reports saved to: ${crashReporter.getReportsDir()}`)
    process.exit(0)
  }, 2000)
})
