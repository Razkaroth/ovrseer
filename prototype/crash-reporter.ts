import type { CrashReporterI, CrashReport, ManagedProcessI, ReportType } from './types'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

export class CrashReporter implements CrashReporterI {
  private reports: CrashReport[] = []
  private reportsDir: string

  constructor(reportsDir?: string) {
    this.reportsDir = reportsDir || join(tmpdir(), 'process-manager', 'crash-reports')
  }

  generateReport(
    processId: string,
    process: ManagedProcessI,
    type: ReportType,
    context?: Record<string, any>,
  ): CrashReport {
    let logs = ''
    try {
      logs = process.logger.getLogs()
    } catch {
      // Logger may be empty or out of bounds
      logs = 'No logs available'
    }
    const status = process.getStatus()

    const report: CrashReport = {
      timestamp: new Date().toISOString(),
      processId,
      processType: this.inferProcessType(context),
      type,
      errorMessage: context?.errorMessage || context?.error?.message || `Process ${type}`,
      errorStack: context?.error?.stack,
      logs,
      status,
      retryCount: context?.retryCount,
      context,
    }

    return report
  }

  async saveReport(report: CrashReport): Promise<void> {
    this.reports.push(report)

    try {
      await mkdir(this.reportsDir, { recursive: true })

      const filename = `${report.timestamp.replace(/[:.]/g, '-')}_${report.processId}.json`
      const filepath = join(this.reportsDir, filename)

      await writeFile(filepath, JSON.stringify(report, null, 2), 'utf-8')
    } catch (error) {
      // Fail gracefully - report is still in memory
    }
  }

  getReports(): CrashReport[] {
    return [...this.reports]
  }

  clearReports(): void {
    this.reports = []
  }

  getReportsDir(): string {
    return this.reportsDir
  }

  private inferProcessType(context?: Record<string, any>): 'dependency' | 'main' | 'cleanup' {
    if (context?.processType) {
      return context.processType
    }
    return 'main'
  }
}
