import {SimpleLogger} from '../logger';

describe.each([['SimpleLogger', SimpleLogger]])(
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

			it('Should by default get the last maxLogSize logs', () => {
				const max3 = new logger(10, 3, '');
				max3.addChunk('1');
				max3.addChunk('2');
				max3.addChunk('3');
				max3.addChunk('4');
				expect(max3.getLogs()).toBe('432');

				for (let i = 0; i < 10; i++) {
					loggerInstance.addChunk(`${i}`);
				}
				expect(loggerInstance.getLogs()).toBe('98765');
			});

			it('Should trim logs if a new log exedes limit', () => {
				const max3 = new logger(3, 3, '');
				max3.addChunk('1');
				max3.addChunk('2');
				max3.addChunk('3');
				max3.addChunk('4');
				expect(max3._logs.length).toBe(3);
				expect(max3.getLogs()).toBe('432');
			});

			it('Should return a log segment', () => {
				const max3 = new logger(3, 3, '');
				max3.addChunk('1');
				max3.addChunk('2');
				max3.addChunk('3');
				max3.addChunk('4');
				expect(max3.getLogs({index: 0, numberOfLines: 2})).toBe('43');
				expect(max3.getLogs({index: 1, numberOfLines: 2})).toBe('32');
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
	},
);
