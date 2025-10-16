import React from 'react';
import {Text} from 'ink';

export function createSkywatch(): string {
	return 'skywatch initialized';
}

// Minimal Ink-compatible TUI component for dev purposes.
// Return type `any` to avoid strict Ink element typing in this package.
export function SkywatchTUI(): any {
	return React.createElement(Text, null, 'Skywatch TUI — dev view updated');
}
