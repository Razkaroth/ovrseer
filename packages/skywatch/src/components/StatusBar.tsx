import {TitledBox} from '@mishieck/ink-titled-box';
import {Text} from 'ink';
import React from 'react';
import {useOvrseer} from '../state/ovrseer.state';
import {ProcessStatus} from './ProcessStatus';

export const StatusBar: React.FC<{}> = () => {
	const ovrseerState = useOvrseer();
	return (
		<TitledBox
			titles={[' StatusBar ', ovrseerState.currentFocus]}
			borderStyle="single"
			flexDirection="row"
			height="20%"
		>
			<ProcessStatus />
			<TitledBox
				titles={['󱜽 Messages']}
				borderStyle="single"
				flexDirection="column"
				flexGrow={1}
				paddingX={1}
			>
				<Text>Press ? to open help</Text>
			</TitledBox>
		</TitledBox>
	);
};
