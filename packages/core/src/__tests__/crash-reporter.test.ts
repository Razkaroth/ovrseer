import { CrashReporter } from '../crash-reporter'
import { SimpleLogger } from '../logger'
import { fakeManagedProcess } from './mocks'
import type { CrashReport } from '../types'
import { join } from 'path'
import { tmpdir } from 'os'

// Mock fs/promises used by CrashReporter implementation (if any)
vi.mock('fs/promises', () => {
  const mockWriteFile = vi.fn()
  const mockMkdir = vi.fn()
  return {
    default: {
      writeFile: mockWriteFile,
      mkdir: mockMkdir,
    },
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
  }
})

describe('CrashReporter', () => {
  let crashReporter: CrashReporter
  let mockLogger: SimpleLogger

  beforeEach(() => {
    crashReporter = new CrashReporter()
    mockLogger = new SimpleLogger(10, 5)
    vi.clearAllMocks()
  })

  it('initially has no reports', () => {
    expect(crashReporter.getReports()).toEqual([])
  })

  it('uses default tmp directory when no reportsDir provided', () => {
    const defaultDir = join(tmpdir(), 'process-manager', 'crash-reports')
    expect(crashReporter.getReportsDir()).toBe(defaultDir)
  })

  it('uses custom reportsDir when provided', () => {
    const customDir = '/custom/path/reports'
    const customReporter = new CrashReporter(customDir)
    expect(customReporter.getReportsDir()).toBe(customDir)
  })

  describe('generateReport()', () => {
    it('generates a report with required fields', () => {
      mockLogger.onError(() => {}) // Add error listener to prevent unhandled error
      mockLogger.addChunk('log1')
      mockLogger.addChunk('error1', true)
      const process = fakeManagedProcess({
        logger: mockLogger,
        getStatus: vi.fn(() => 'crashed' as any),
      })

      const report = crashReporter.generateReport('pid', process, 'crash')

      expect(report.processId).toBe('pid')
      expect(report.type).toBe('crash')
      expect(report.logs).toEqual(expect.any(String))
      expect(report.status).toBe('crashed')
      expect(report.timestamp).toBeDefined()
    })

    it('includes context and retryCount when provided', () => {
      const process = fakeManagedProcess({ logger: mockLogger })
      const report = crashReporter.generateReport('pid', process, 'maxRetriesExceeded', {
        retryCount: 3,
      })
      expect(report.retryCount).toBe(3)
      expect(report.context).toBeDefined()
    })
  })

  describe('saveReport()', () => {
    it('saves report in memory and attempts to persist', async () => {
      const report: CrashReport = {
        timestamp: new Date().toISOString(),
        processId: 'p',
        processType: 'main',
        type: 'crash',
        errorMessage: 'err',
        logs: 'logs',
        status: 'crashed',
      }

      await crashReporter.saveReport(report)
      const reports = crashReporter.getReports()
      expect(reports).toContain(report)
      const { mkdir, writeFile } = await vi.importMock<typeof import('fs/promises')>('fs/promises')
      expect(mkdir).toHaveBeenCalled()
      expect(writeFile).toHaveBeenCalled()
    })

    it('handles write failures gracefully', async () => {
      const { writeFile } = await vi.importMock<typeof import('fs/promises')>('fs/promises')
      vi.mocked(writeFile).mockRejectedValueOnce(new Error('disk full'))

      const report: CrashReport = {
        timestamp: new Date().toISOString(),
        processId: 'p',
        processType: 'main',
        type: 'crash',
        errorMessage: 'err',
        logs: 'logs',
        status: 'crashed',
      }

      await expect(crashReporter.saveReport(report)).resolves.not.toThrow()
      expect(crashReporter.getReports()).toContain(report)
    })
  })

  describe('getReports() and clearReports()', () => {
    it('returns a copy of reports and clearReports empties', async () => {
      const report: CrashReport = {
        timestamp: new Date().toISOString(),
        processId: 'p',
        processType: 'main',
        type: 'crash',
        errorMessage: 'err',
        logs: 'logs',
        status: 'crashed',
      }
      await crashReporter.saveReport(report)
      const list = crashReporter.getReports()
      expect(list).toHaveLength(1)
      list.push({} as any)
      expect(crashReporter.getReports()).toHaveLength(1)

      crashReporter.clearReports()
      expect(crashReporter.getReports()).toHaveLength(0)
    })
  })
})
