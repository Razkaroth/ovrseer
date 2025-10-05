import EventEmitter from 'events';
import {ProcessLoggerI} from './types.js';

export class ProcessLogger implements ProcessLoggerI {
	private _buffer: string[] = [];
	private _errorBuffer: string[] = [];
	private readonly _maxLogSize: number;
	private _maxBufferSize: number;
	private _defaultSeparator: string;
	private _eventEmitter: EventEmitter;

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
		if (this._buffer.length > this._maxBufferSize) {
			this._buffer.shift();
		}
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
	}
}
