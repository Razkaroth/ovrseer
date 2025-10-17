import {TitledBox} from '@mishieck/ink-titled-box';
import {useOvrseer} from '../state/ovrseer.state';
import {Text} from 'ink';
import React from 'react';

export const Worktree: React.FC<{}> = () => {
	const ovrseerState = useOvrseer();
	return (
		<TitledBox titles={[' Worktree ']} borderStyle="single" paddingX={1}>
			<Text>Hello, world! this is the logs</Text>
		</TitledBox>
	);
};
