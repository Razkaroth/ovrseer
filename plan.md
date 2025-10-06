# Plan: Add stdin Support and Enhanced Log Storage

## Overview

Add ability to send user input to process stdin with enhanced log storage that tracks message types (error, info, warn, debug, log, UserInput, UserInputSecret) and implement TUI interface for user input.

## Phase 1: Core Infrastructure - ProcessUnit

- [ ] Add `sendStdin(input: string)` method to ProcessUnit
  - Write input to child process stdin
  - Emit log event with type 'UserInput' or 'UserInputSecret'
  - Handle errors if stdin is not available
- [ ] Update ProcessUnit types to include new log types
- [ ] Write tests for sendStdin functionality
- [ ] Commit: "feat(core): add sendStdin method to ProcessUnit"

## Phase 2: Enhanced Log Storage - ProcessLogger

- [ ] Update log storage structure from string buffer to array of `{content: string, type: LogType, time: number}`
- [ ] Define LogType enum/type: 'error' | 'info' | 'warn' | 'debug' | 'log' | 'UserInput' | 'UserInputSecret'
- [ ] Update `addLog()` method to accept type parameter
- [ ] Update `getRecentLogs()` to return new structure
- [ ] Update `clearLogs()` to work with new structure
- [ ] Update all internal consumers of log methods
- [ ] Write tests for new log structure
- [ ] Commit: "feat(core): enhance ProcessLogger with typed log storage"

## Phase 3: Ovrseer Integration

- [ ] Add `sendStdin(processId: string, input: string, secret?: boolean)` method to Ovrseer
- [ ] Method should find process unit and call its sendStdin
- [ ] Handle case where process doesn't exist
- [ ] Update type exports
- [ ] Write tests for Ovrseer.sendStdin
- [ ] Commit: "feat(core): add sendStdin method to Ovrseer"

## Phase 4: TUI Type Updates

- [ ] Update TUI to handle new log structure
- [ ] Update log rendering to use typed logs
- [ ] Add color coding based on log type
- [ ] Add masking for UserInputSecret logs (show as '\*\*\*')
- [ ] Write tests for log rendering with types
- [ ] Commit: "feat(tui): update log rendering for typed logs"

## Phase 5: TUI Input Interface

- [ ] Add Text input field at bottom of log window
- [ ] Add state for input focus (default: unfocused)
- [ ] Add state for secret mode (default: false)
- [ ] Implement keyboard shortcuts:
  - `i` - focus input field
  - `Esc` - unfocus input field
  - `Enter` - send input (when focused)
  - `Ctrl+S` - toggle secret mode
- [ ] Mask input display with '\*' when in secret mode
- [ ] Call Ovrseer.sendStdin when Enter pressed
- [ ] Clear input field after sending
- [ ] Show visual indicator for secret mode
- [ ] Write tests for input interactions
- [ ] Commit: "feat(tui): add stdin input interface"

## Phase 6: Integration Testing & Cleanup

- [ ] Run full test suite: `turbo run test`
- [ ] Run lint: `turbo run lint`
- [ ] Run build: `turbo run build`
- [ ] Manual testing with example app
- [ ] Update documentation
- [ ] Final commit: "docs: update docs for stdin support"

## Testing Strategy

- Unit tests for each new method
- Integration tests for end-to-end flow
- TUI interaction tests for keyboard shortcuts
- Edge cases: closed process, invalid process ID, empty input

## Rollback Strategy

- Each phase is independently committable
- Can revert specific commits if issues arise
- Branch can be reset if major issues discovered
