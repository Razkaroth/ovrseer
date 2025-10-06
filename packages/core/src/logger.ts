import EventEmitter from 'events';
import {ProcessLoggerI, Flag, FlagState, FlagMatch} from './types.js';

export class ProcessLogger implements ProcessLoggerI {
	private _buffer: string[] = [];
	private _errorBuffer: string[] = [];
	private readonly _maxLogSize: number;
	private _maxBufferSize: number;
	private _defaultSeparator: string;
	private _eventEmitter: EventEmitter;
	private _flags: Map<string, FlagState> = new Map();

	get _bufferSize() {
		return this._buffer.length;
	}
	get _maxBuffer() {
		return this._maxBufferSize;
	}
	get _maxLog() {
		return this._maxLogSize;
	}
	get _logs() {
		return this._buffer;
	}
	get _errors() {
		return this._errorBuffer;
	}

	constructor(
		maxBufferSize: number,
		maxLogSize: number,
		defaultSeparator?: string,
	) {
		if (maxLogSize > maxBufferSize) {
			throw new Error('maxLogSize cannot be greater than maxBufferSize');
		}
		this._maxLogSize = maxLogSize;
		this._maxBufferSize = maxBufferSize;
		// Default separator is a newline, but can be changed
		// we need to manage the default separator being an empty string
		if (defaultSeparator === undefined) {
			defaultSeparator = '';
		}
		this._defaultSeparator = defaultSeparator;
		this._eventEmitter = new EventEmitter();
	}

	public addChunk(chunk: string, isError?: boolean) {
		this._buffer.push(chunk);

		// If buffer exceeds max size, evict the oldest entry first and
		// adjust stored match indices so they remain consistent with the
		// shifted buffer (decrement indices by 1 and drop any that go < 0).
		if (this._buffer.length > this._maxBufferSize) {
			this._buffer.shift();
			for (const [_name, flagState] of this._flags) {
				const newMatches: FlagMatch[] = [];
				for (const match of flagState.matches) {
					const newIndex = match.logIndex - 1;
					if (newIndex >= 0) {
						match.logIndex = newIndex;
						newMatches.push(match);
					} else {
						// match was evicted from the buffer; decrement count defensively
						flagState.count = Math.max(0, flagState.count - 1);
					}
				}
				flagState.matches = newMatches;
			}
		}

		const logIndex = this._buffer.length - 1;
		this._checkFlags(chunk, logIndex);

		if (isError) {
			this._errorBuffer.push(chunk);
			if (this._errorBuffer.length > this._maxBufferSize) {
				this._errorBuffer.shift();
			}
			this._eventEmitter.emit('error', chunk);
		} else {
			this._eventEmitter.emit('log', chunk);
		}
	}

	public getLogs(options?: {
		index?: number;
		numberOfLines?: number;
		separator?: string;
		mostRecentFirst?: boolean;
	}) {
		const {
			index = 0,
			numberOfLines = this._maxLogSize,
			separator = this._defaultSeparator,
			mostRecentFirst = false,
		} = options || {};
		if (index < 0) {
			throw new Error('Index cannot be negative');
		}
		if (numberOfLines < 0) {
			throw new Error('Number of lines cannot be negative');
		}
		if (index >= this._buffer.length) {
			return '';
		}

		if (mostRecentFirst) {
			const reversedIndex = this._buffer.length - index;
			const numberOfLinesToReturn =
				numberOfLines > this._buffer.length
					? this._buffer.length
					: numberOfLines;

			return this._buffer
				.slice(reversedIndex - numberOfLinesToReturn, reversedIndex)
				.reverse()
				.join(separator);
		} else {
			const startIndex = index;
			const numberOfLinesToReturn =
				numberOfLines > this._buffer.length
					? this._buffer.length
					: numberOfLines;

			return this._buffer
				.slice(startIndex, startIndex + numberOfLinesToReturn)
				.join(separator);
		}
	}

	public onLog(listener: (chunk: string) => void) {
		this._eventEmitter.addListener('log', listener);
		return () => {
			this._eventEmitter.removeListener('log', listener);
		};
	}

	public onError(listener: (chunk: string) => void) {
		this._eventEmitter.addListener('error', listener);
		return () => {
			this._eventEmitter.removeListener('error', listener);
		};
	}

	public reset() {
		this._buffer = [];
		this._errorBuffer = [];
		this._flags.clear();
	}

	public addFlag(name: string, flag: Flag) {
		this._flags.set(name, {
			flag,
			count: 0,
			matches: [],
		});
	}

	public removeFlag(name: string) {
		this._flags.delete(name);
	}

	public getFlag(name: string): FlagState | undefined {
		return this._flags.get(name);
	}

	public getAllFlags(): Map<string, FlagState> {
		return this._flags;
	}

	public clearFlags() {
		this._flags.clear();
	}

	private _checkFlags(chunk: string, logIndex: number) {
		for (const [_name, flagState] of this._flags) {
			const pattern =
				typeof flagState.flag.pattern === 'string'
					? new RegExp(flagState.flag.pattern)
					: new RegExp(
							(flagState.flag.pattern as RegExp).source,
							(flagState.flag.pattern as RegExp).flags,
					  );

			if (pattern.test(chunk)) {
				const match: FlagMatch = {
					logIndex,
					matchedText: chunk,
					timestamp: Date.now(),
					contextWindowSize: flagState.flag.contextWindowSize || 5,
				};

				flagState.count++;
				flagState.matches.push(match);
			}
		}
	}

	public getContextWindow(logIndex: number, windowSize: number): string[] {
		const halfWindow = Math.floor(windowSize / 2);
		const start = Math.max(0, logIndex - halfWindow);
		const end = Math.min(this._buffer.length, logIndex + halfWindow + 1);

		const contextLogs: string[] = [];
		for (let i = start; i < end; i++) {
			contextLogs.push(this._buffer[i]);
		}
		return contextLogs;
	}
}
