import {TitledBox} from '@mishieck/ink-titled-box';
import {Box} from 'ink';
import React from 'react';
import {useOvrseer} from '../state/ovrseer.state';
import {MessageWindow} from './MessageWindow';
import {ProcessStatus} from './ProcessStatus';

export const StatusBar: React.FC<{}> = () => {
	const ovrseerState = useOvrseer();

	return (
		<TitledBox
			titles={[' StatusBar ', ovrseerState.currentFocus]}
			borderStyle="single"
			flexDirection="row"
			height="15%"
			paddingX={0}
			paddingY={0}
		>
			<Box flexDirection="row" flexGrow={1}>
				<ProcessStatus />
				<MessageWindow />
			</Box>
		</TitledBox>
	);
};
