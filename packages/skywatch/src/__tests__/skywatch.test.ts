import {describe, it, expect} from 'vitest';
import {createSkywatch} from '../index.js';

describe('createSkywatch', () => {
	it('returns initialized string', () => {
		expect(createSkywatch()).toBe('skywatch initialized');
	});
});
