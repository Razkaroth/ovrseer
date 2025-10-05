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
				expect(loggerInstance._logs).toEqual(['test']);
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

			it('Should capture context window around matched logs', () => {
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
				expect(flag?.matches[0]?.contextWindow).toEqual([
					'log2',
					'WARN: something happened',
				]);
			});

			it('Should handle context window at buffer boundaries', () => {
				loggerInstance.addFlag('test-flag', {
					pattern: 'TEST',
					color: 'blue',
					contextWindowSize: 5,
				});

				loggerInstance.addChunk('TEST at start');

				const flag = loggerInstance.getFlag('test-flag');
				expect(flag?.matches[0]?.contextWindow).toEqual(['TEST at start']);
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
	},
);
