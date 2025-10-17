import {OvrseerI} from '@ovrseer/core';

export interface SkywatchOptions {
	ovrseer: OvrseerI;
}

export interface SkywatchI {
	start(): void;
	stop(): Promise<void>;
}
