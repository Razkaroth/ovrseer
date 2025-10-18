import {TitledBox, titleStyles} from '@mishieck/ink-titled-box';
import {OvrseerI} from '@ovrseer/core';
import {Box, Text, useFocus, useInput} from 'ink';
import React, {useEffect, useState} from 'react';
import {useStdoutDimensions} from '../hooks/useDimensions';
import {Focus, useOvrseer} from '../state/ovrseer.state';
import {Logs} from './Logs';
import {StatusBar} from './StatusBar';
import {Worktree} from './Worktree';

export const MainUI: React.FC<{ovrseer: OvrseerI}> = ({ovrseer}) => {
	const ovrseerState = useOvrseer();
	const [columns, rows] = useStdoutDimensions();
	const {isFocused, focus} = useFocus({id: 'main-ui'});
	const [showHelp, setShowHelp] = useState(false);

	useEffect(() => {
		if (!ovrseerState.ovrseer) {
			ovrseerState.setOvrseer(ovrseer);
		}
	}, []);

	useInput((input, key) => {
		if (input === '?') {
			setShowHelp(true);
		}
		if (showHelp && (key.escape || input === 'q' || input === '?')) {
			setShowHelp(false);
		}
		if (isFocused && ovrseerState.currentFocus !== Focus.Main) {
			ovrseerState.setCurrentFocus(Focus.Main);
		}
	});

	return (
		<Box width={columns} height={rows} flexDirection="column">
			<TitledBox
				key={`main-ui-${columns}-${rows}`}
				marginTop={1}
				borderStyle="single"
				titleStyles={titleStyles.hexagon}
				titles={[' Ovrseer   ']}
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
			{showHelp && <HelpWindow columns={columns} rows={rows} />}
		</Box>
	);
};

const HelpWindow: React.FC<{columns: number; rows: number}> = ({
	columns,
	rows,
}) => {
	const helpWidth = Math.min(columns - 4, 100);
	const helpHeight = Math.min(rows - 4, 20);
	const {globalInstructions, currentInstructions} = useOvrseer();

	return (
		<Box
			position="absolute"
			alignSelf="center"
			width={helpWidth}
			height={helpHeight}
			flexDirection="column"
			backgroundColor="black"
		>
			<TitledBox
				borderStyle="single"
				titles={['Help']}
				titleStyles={titleStyles.hexagon}
				titleJustify="center"
				padding={1}
				flexDirection="column"
				width={helpWidth}
				height={helpHeight}
			>
				<Box flexDirection="column" flexGrow={1}>
					<Text>Global keybindings</Text>
					<Text>──────────────────────</Text>
					<Box
						flexDirection="column"
						flexGrow={1}
						paddingLeft={2}
						marginBottom={1}
					>
						{globalInstructions.map(instruction => (
							<Box flexDirection="row" key={instruction.name} columnGap={4}>
								<Text>{instruction.name}</Text>
								<Text>{instruction.description}</Text>
							</Box>
						))}
					</Box>

					<Text>Current focus keybindings</Text>
					<Text>──────────────────────</Text>
					<Box flexDirection="column" flexGrow={1} paddingLeft={2}>
						{currentInstructions.map(instruction => (
							<Box flexDirection="row" key={instruction.name} columnGap={4}>
								<Text>{instruction.name}</Text>
								<Text>{instruction.description}</Text>
							</Box>
						))}
					</Box>
				</Box>
			</TitledBox>
		</Box>
	);
};
