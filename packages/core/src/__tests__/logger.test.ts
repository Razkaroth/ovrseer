import {ProcessLogger} from '../logger';

describe.each([['ProcessLogger', ProcessLogger]])(
	'%s Process logger',
	(loggerName, logger) => {
		const loggerInstance = new logger(10, 5, '');
		beforeEach(() => {
			loggerInstance.reset();
		});

		it('Should reset logs', () => {
			const errorConsumer = vi.fn();
			loggerInstance.onError(errorConsumer); // 'error' events need at least one listener else they throw
			loggerInstance.addChunk('test');
			loggerInstance.reset();
			expect(loggerInstance._logs).toEqual([]);
		});

		it('Should reset errors', () => {
			loggerInstance.addChunk('test', true);
			loggerInstance.reset();
			expect(loggerInstance._errors).toEqual([]);
			expect(loggerInstance._logs).toEqual([]);
		});

		describe('Log management', () => {
			it('Should return empty string for empty buffer', () => {
				expect(loggerInstance.getLogs()).toBe('');
			});

			it('Should add a log chunk', () => {
				loggerInstance.addChunk('test');
				expect(loggerInstance._logs).toHaveLength(1);
				expect(loggerInstance._logs[0].content).toBe('test');
				expect(loggerInstance._logs[0].type).toBe('log');
				expect(loggerInstance._logs[0].time).toBeGreaterThan(0);
			});

			it('Should by default get the first maxLogSize logs', () => {
				const max3 = new logger(10, 3, '');
				max3.addChunk('1');
				max3.addChunk('2');
				max3.addChunk('3');
				max3.addChunk('4');
				expect(max3.getLogs()).toBe('123');

				for (let i = 0; i < 10; i++) {
					loggerInstance.addChunk(`${i}`);
				}
				expect(loggerInstance.getLogs()).toBe('01234');
			});

			it('Should trim logs if a new log exedes limit', () => {
				const max3 = new logger(3, 3, '');
				max3.addChunk('1');
				max3.addChunk('2');
				max3.addChunk('3');
				max3.addChunk('4');
				expect(max3._logs.length).toBe(3);
				expect(max3.getLogs()).toBe('234');
			});

			it('Should get logs with mostRecentFirst=true', () => {
				const max3 = new logger(10, 3, '');
				max3.addChunk('1');
				max3.addChunk('2');
				max3.addChunk('3');
				max3.addChunk('4');
				expect(max3.getLogs({mostRecentFirst: true})).toBe('432');

				const logger2 = new logger(10, 5, '');
				for (let i = 0; i < 10; i++) {
					logger2.addChunk(`${i}`);
				}
				expect(logger2.getLogs({mostRecentFirst: true})).toBe('98765');
			});

			it('Should get logs with mostRecentFirst=false (default)', () => {
				const max3 = new logger(10, 3, '');
				max3.addChunk('1');
				max3.addChunk('2');
				max3.addChunk('3');
				max3.addChunk('4');
				expect(max3.getLogs({mostRecentFirst: false})).toBe('123');

				const logger2 = new logger(10, 5, '');
				for (let i = 0; i < 10; i++) {
					logger2.addChunk(`${i}`);
				}
				expect(logger2.getLogs({mostRecentFirst: false})).toBe('01234');
			});

			it('Should return a log segment', () => {
				const max3 = new logger(3, 3, '');
				max3.addChunk('1');
				max3.addChunk('2');
				max3.addChunk('3');
				max3.addChunk('4');
				expect(max3.getLogs({index: 0, numberOfLines: 2})).toBe('23');
				expect(max3.getLogs({index: 1, numberOfLines: 2})).toBe('34');
			});

			it('Should return a log segment with mostRecentFirst=true', () => {
				const max3 = new logger(3, 3, '');
				max3.addChunk('1');
				max3.addChunk('2');
				max3.addChunk('3');
				max3.addChunk('4');
				expect(
					max3.getLogs({index: 0, numberOfLines: 2, mostRecentFirst: true}),
				).toBe('43');
				expect(
					max3.getLogs({index: 1, numberOfLines: 2, mostRecentFirst: true}),
				).toBe('32');
			});

			it('Should error when trying to create a logger with maxLogs > maxBufferSize', () => {
				expect(() => {
					new logger(3, 5);
				}).toThrow();
			});

			it('Should emit an event on new log added', () => {
				const logConsumer = vi.fn();

				loggerInstance.onLog(logConsumer);

				loggerInstance.addChunk('test');
				expect(logConsumer).toHaveBeenCalledWith('test');

				loggerInstance.addChunk('test2');
				expect(logConsumer).toHaveBeenCalledWith('test2');
			});
		});

		describe('Error management', () => {
			it('Should add an error chunk', () => {
				const errorConsumer = vi.fn();
				loggerInstance.onError(errorConsumer);
				loggerInstance.addChunk('test', true);

				expect(loggerInstance._errors).toEqual(['test']);
			});

			it('Should emit an event on new error added', () => {
				const errorConsumer = vi.fn();

				loggerInstance.onError(errorConsumer);

				loggerInstance.addChunk('test', true);
				expect(errorConsumer).toHaveBeenCalledWith('test');
			});
		});

		describe('Flag tracking', () => {
			it('Should add and track flags', () => {
				loggerInstance.addFlag('error-flag', {
					pattern: /ERROR/,
					color: 'red',
				});

				const flag = loggerInstance.getFlag('error-flag');
				expect(flag).toBeDefined();
				expect(flag?.count).toBe(0);
				expect(flag?.matches).toEqual([]);
			});

			it('Should increment count when flag pattern matches', () => {
				loggerInstance.addFlag('error-flag', {
					pattern: /ERROR/,
					color: 'red',
				});

				loggerInstance.addChunk('This is an ERROR log');
				loggerInstance.addChunk('Normal log');
				loggerInstance.addChunk('Another ERROR here');

				const flag = loggerInstance.getFlag('error-flag');
				expect(flag?.count).toBe(2);
				expect(flag?.matches.length).toBe(2);
			});

			it('Should store context window size in match', () => {
				loggerInstance.addFlag('warning-flag', {
					pattern: 'WARN',
					color: 'yellow',
					contextWindowSize: 3,
				});

				loggerInstance.addChunk('log1');
				loggerInstance.addChunk('log2');
				loggerInstance.addChunk('WARN: something happened');
				loggerInstance.addChunk('log4');
				loggerInstance.addChunk('log5');

				const flag = loggerInstance.getFlag('warning-flag');
				expect(flag?.matches[0]?.contextWindowSize).toBe(3);
				expect(flag?.matches[0]?.logIndex).toBe(2);
			});

			it('Should get context window on demand for past logs', () => {
				loggerInstance.addFlag('test-flag', {
					pattern: 'TEST',
					color: 'blue',
					contextWindowSize: 3,
				});

				loggerInstance.addChunk('log1');
				loggerInstance.addChunk('log2');
				loggerInstance.addChunk('TEST at middle');
				loggerInstance.addChunk('log4');
				loggerInstance.addChunk('log5');

				const flag = loggerInstance.getFlag('test-flag');
				const match = flag?.matches[0];
				const context = loggerInstance.getContextWindow(
					match!.logIndex,
					match!.contextWindowSize,
				);

				expect(context).toEqual(['log2', 'TEST at middle', 'log4']);
			});

			it('Should get context window with future logs after match', () => {
				loggerInstance.addFlag('test-flag', {
					pattern: 'MATCH',
					color: 'green',
					contextWindowSize: 5,
				});

				loggerInstance.addChunk('log1');
				loggerInstance.addChunk('MATCH here');
				loggerInstance.addChunk('log3');
				loggerInstance.addChunk('log4');

				const flag = loggerInstance.getFlag('test-flag');
				const match = flag?.matches[0];
				const context = loggerInstance.getContextWindow(
					match!.logIndex,
					match!.contextWindowSize,
				);

				expect(context).toEqual(['log1', 'MATCH here', 'log3', 'log4']);
			});

			it('Should handle context window at buffer boundaries', () => {
				loggerInstance.addFlag('test-flag', {
					pattern: 'TEST',
					color: 'blue',
					contextWindowSize: 5,
				});

				loggerInstance.addChunk('TEST at start');

				const flag = loggerInstance.getFlag('test-flag');
				const match = flag?.matches[0];
				const context = loggerInstance.getContextWindow(
					match!.logIndex,
					match!.contextWindowSize,
				);

				expect(context).toEqual(['TEST at start']);
			});

			it('Should remove flag', () => {
				loggerInstance.addFlag('temp-flag', {
					pattern: 'temp',
					color: 'green',
				});

				expect(loggerInstance.getFlag('temp-flag')).toBeDefined();

				loggerInstance.removeFlag('temp-flag');

				expect(loggerInstance.getFlag('temp-flag')).toBeUndefined();
			});

			it('Should track multiple flags simultaneously', () => {
				loggerInstance.addFlag('error-flag', {
					pattern: /ERROR/,
					color: 'red',
				});
				loggerInstance.addFlag('success-flag', {
					pattern: /SUCCESS/,
					color: 'green',
				});

				loggerInstance.addChunk('ERROR occurred');
				loggerInstance.addChunk('SUCCESS!');
				loggerInstance.addChunk('Another ERROR');

				const errorFlag = loggerInstance.getFlag('error-flag');
				const successFlag = loggerInstance.getFlag('success-flag');

				expect(errorFlag?.count).toBe(2);
				expect(successFlag?.count).toBe(1);
			});

			it('Should clear all flags', () => {
				loggerInstance.addFlag('flag1', {pattern: 'test', color: 'red'});
				loggerInstance.addFlag('flag2', {pattern: 'test', color: 'blue'});

				expect(loggerInstance.getAllFlags().size).toBe(2);

				loggerInstance.clearFlags();

				expect(loggerInstance.getAllFlags().size).toBe(0);
			});

			it('Should store match timestamp and log index', () => {
				const before = Date.now();

				loggerInstance.addFlag('test-flag', {
					pattern: 'MATCH',
					color: 'teal',
				});

				loggerInstance.addChunk('MATCH found');

				const after = Date.now();
				const flag = loggerInstance.getFlag('test-flag');
				const match = flag?.matches[0];

				expect(match?.logIndex).toBe(0);
				expect(match?.timestamp).toBeGreaterThanOrEqual(before);
				expect(match?.timestamp).toBeLessThanOrEqual(after);
				expect(match?.matchedText).toBe('MATCH found');
			});

			it('Should work with string patterns', () => {
				loggerInstance.addFlag('string-flag', {
					pattern: 'simple string',
					color: 'purple',
				});

				loggerInstance.addChunk('This has simple string in it');

				const flag = loggerInstance.getFlag('string-flag');
				expect(flag?.count).toBe(1);
			});

			it('Should support targetCount in flag definition', () => {
				loggerInstance.addFlag('target-flag', {
					pattern: 'TARGET',
					color: 'orange',
					targetCount: 5,
				});

				const flag = loggerInstance.getFlag('target-flag');
				expect(flag?.flag.targetCount).toBe(5);
			});
		});

		describe('Typed Logs with LogType', () => {
			it('should add logs with explicit type parameter', () => {
				loggerInstance.addChunk('info message', false, 'info');
				loggerInstance.addChunk('warning message', false, 'warn');
				loggerInstance.addChunk('debug message', false, 'debug');

				const typedLogs = loggerInstance.getTypedLogs();
				expect(typedLogs).toHaveLength(3);
				expect(typedLogs[0].type).toBe('info');
				expect(typedLogs[0].content).toBe('info message');
				expect(typedLogs[1].type).toBe('warn');
				expect(typedLogs[1].content).toBe('warning message');
				expect(typedLogs[2].type).toBe('debug');
				expect(typedLogs[2].content).toBe('debug message');
			});

			it('should default to "log" type when type is not provided', () => {
				loggerInstance.addChunk('default log');

				const typedLogs = loggerInstance.getTypedLogs();
				expect(typedLogs).toHaveLength(1);
				expect(typedLogs[0].type).toBe('log');
				expect(typedLogs[0].content).toBe('default log');
			});

			it('should use "error" type when isError is true and no type provided', () => {
				loggerInstance.addChunk('error message', true);

				const typedLogs = loggerInstance.getTypedLogs();
				expect(typedLogs).toHaveLength(1);
				expect(typedLogs[0].type).toBe('error');
				expect(typedLogs[0].content).toBe('error message');
			});

			it('should override isError flag when explicit type is provided', () => {
				loggerInstance.addChunk('info message', true, 'info');

				const typedLogs = loggerInstance.getTypedLogs();
				expect(typedLogs).toHaveLength(1);
				expect(typedLogs[0].type).toBe('info');
				expect(typedLogs[0].content).toBe('info message');
			});

			it('should add UserInput type logs', () => {
				loggerInstance.addChunk('user typed this', false, 'UserInput');

				const typedLogs = loggerInstance.getTypedLogs();
				expect(typedLogs).toHaveLength(1);
				expect(typedLogs[0].type).toBe('UserInput');
				expect(typedLogs[0].content).toBe('user typed this');
			});

			it('should add UserInputSecret type logs', () => {
				loggerInstance.addChunk('secret password', false, 'UserInputSecret');

				const typedLogs = loggerInstance.getTypedLogs();
				expect(typedLogs).toHaveLength(1);
				expect(typedLogs[0].type).toBe('UserInputSecret');
				expect(typedLogs[0].content).toBe('secret password');
			});

			it('should include timestamp in typed log entries', () => {
				const beforeTime = Date.now();
				loggerInstance.addChunk('test log', false, 'info');
				const afterTime = Date.now();

				const typedLogs = loggerInstance.getTypedLogs();
				expect(typedLogs).toHaveLength(1);
				expect(typedLogs[0].time).toBeGreaterThanOrEqual(beforeTime);
				expect(typedLogs[0].time).toBeLessThanOrEqual(afterTime);
			});

			it('should return a copy of typed logs array', () => {
				loggerInstance.addChunk('log1');
				loggerInstance.addChunk('log2');

				const firstCopy = loggerInstance.getTypedLogs();
				const secondCopy = loggerInstance.getTypedLogs();

				expect(firstCopy).not.toBe(secondCopy);
				expect(firstCopy).toEqual(secondCopy);
			});

			it('should handle mixed log types in buffer', () => {
				loggerInstance.addChunk('regular log', false, 'log');
				loggerInstance.addChunk('error log', true);
				loggerInstance.addChunk('info log', false, 'info');
				loggerInstance.addChunk('user input', false, 'UserInput');
				loggerInstance.addChunk('secret input', false, 'UserInputSecret');
				loggerInstance.addChunk('warning', false, 'warn');

				const typedLogs = loggerInstance.getTypedLogs();
				expect(typedLogs).toHaveLength(6);
				expect(typedLogs[0].type).toBe('log');
				expect(typedLogs[1].type).toBe('error');
				expect(typedLogs[2].type).toBe('info');
				expect(typedLogs[3].type).toBe('UserInput');
				expect(typedLogs[4].type).toBe('UserInputSecret');
				expect(typedLogs[5].type).toBe('warn');
			});

			it('should maintain typed logs when buffer exceeds max size', () => {
				const max3 = new logger(3, 3, '');
				max3.addChunk('log1', false, 'info');
				max3.addChunk('log2', false, 'warn');
				max3.addChunk('log3', false, 'error');
				max3.addChunk('log4', false, 'debug');

				const typedLogs = max3.getTypedLogs();
				expect(typedLogs).toHaveLength(3);
				expect(typedLogs[0].content).toBe('log2');
				expect(typedLogs[0].type).toBe('warn');
				expect(typedLogs[1].content).toBe('log3');
				expect(typedLogs[1].type).toBe('error');
				expect(typedLogs[2].content).toBe('log4');
				expect(typedLogs[2].type).toBe('debug');
			});

			it('should extract content correctly in getLogs from typed entries', () => {
				loggerInstance.addChunk('first', false, 'info');
				loggerInstance.addChunk('second', false, 'warn');
				loggerInstance.addChunk('third', false, 'error');

				expect(loggerInstance.getLogs()).toBe('firstsecondthird');
			});

			it('should extract content correctly with separator', () => {
				const separator = '\n';
				const max3 = new logger(3, 3, separator);
				max3.addChunk('line1', false, 'log');
				max3.addChunk('line2', false, 'info');
				max3.addChunk('line3', false, 'error');

				expect(max3.getLogs()).toBe('line1\nline2\nline3');
			});

			it('should handle getContextWindow with typed log entries', () => {
				loggerInstance.addFlag('test-flag', {
					pattern: 'MATCH',
					color: 'blue',
					contextWindowSize: 3,
				});

				loggerInstance.addChunk('log1', false, 'info');
				loggerInstance.addChunk('log2', false, 'warn');
				loggerInstance.addChunk('MATCH here', false, 'log');
				loggerInstance.addChunk('log4', false, 'error');
				loggerInstance.addChunk('log5', false, 'debug');

				const flag = loggerInstance.getFlag('test-flag');
				const match = flag?.matches[0];
				const context = loggerInstance.getContextWindow(
					match!.logIndex,
					match!.contextWindowSize,
				);

				expect(context).toEqual(['log2', 'MATCH here', 'log4']);
			});

			it('should reset typed logs on reset', () => {
				loggerInstance.addChunk('log1', false, 'info');
				loggerInstance.addChunk('log2', false, 'error');

				expect(loggerInstance.getTypedLogs()).toHaveLength(2);

				loggerInstance.reset();

				expect(loggerInstance.getTypedLogs()).toHaveLength(0);
			});

			it('should preserve log order with different types', () => {
				for (let i = 1; i <= 5; i++) {
					const types: Array<'log' | 'error' | 'info' | 'warn' | 'debug'> = [
						'log',
						'error',
						'info',
						'warn',
						'debug',
					];
					loggerInstance.addChunk(`log${i}`, false, types[i - 1]);
				}

				const typedLogs = loggerInstance.getTypedLogs();
				expect(typedLogs).toHaveLength(5);
				for (let i = 0; i < 5; i++) {
					expect(typedLogs[i].content).toBe(`log${i + 1}`);
				}
			});

			it('should handle empty typed logs', () => {
				const typedLogs = loggerInstance.getTypedLogs();
				expect(typedLogs).toEqual([]);
			});

			it('should maintain all log types through buffer eviction', () => {
				const max3 = new logger(5, 5, '');

				max3.addChunk('1', false, 'log');
				max3.addChunk('2', false, 'error');
				max3.addChunk('3', false, 'UserInput');
				max3.addChunk('4', false, 'UserInputSecret');
				max3.addChunk('5', false, 'info');
				max3.addChunk('6', false, 'warn');
				max3.addChunk('7', false, 'debug');

				const typedLogs = max3.getTypedLogs();
				expect(typedLogs).toHaveLength(5);
				expect(typedLogs[0].content).toBe('3');
				expect(typedLogs[0].type).toBe('UserInput');
				expect(typedLogs[1].content).toBe('4');
				expect(typedLogs[1].type).toBe('UserInputSecret');
				expect(typedLogs[2].content).toBe('5');
				expect(typedLogs[2].type).toBe('info');
				expect(typedLogs[3].content).toBe('6');
				expect(typedLogs[3].type).toBe('warn');
				expect(typedLogs[4].content).toBe('7');
				expect(typedLogs[4].type).toBe('debug');
			});
		});
	}
);