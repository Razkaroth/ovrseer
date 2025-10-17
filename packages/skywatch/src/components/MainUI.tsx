import {TitledBox, titleStyles} from '@mishieck/ink-titled-box';
import {OvrseerI} from '@ovrseer/core';
import {Box} from 'ink';
import React, {useEffect} from 'react';
import {useStdoutDimensions} from '../hooks/useDimensions';
import {useOvrseer} from '../state/ovrseer.state';
import {Logs} from './Logs';
import {StatusBar} from './StatusBar';
import {Worktree} from './Worktree';
import {Counter} from './Counter';

export const MainUI: React.FC<{ovrseer: OvrseerI}> = ({ovrseer}) => {
	const ovrseerState = useOvrseer();
	const [columns, rows] = useStdoutDimensions();

	useEffect(() => {
		if (!ovrseerState.ovrseer) {
			ovrseerState.setOvrseer(ovrseer);
		}
	}, []);

	return (
		<Box width={columns} height={rows}>
			<TitledBox
				key={`main-ui-${columns}-${rows}`}
				marginTop={1}
				borderStyle="single"
				titleStyles={titleStyles.hexagon}
				titles={[' Ovrseer ']}
				titleJustify="center"
				padding={1}
				flexDirection="column"
				width={columns}
				height={rows}
			>
				<Box flexDirection="row" flexGrow={1}>
					<Worktree />
					<Logs />
				</Box>
				<StatusBar />
			</TitledBox>
		</Box>
	);
};
