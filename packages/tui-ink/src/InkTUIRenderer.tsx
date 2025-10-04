import React, {useState, useEffect} from 'react';
import {Box, Text, useInput, useApp} from 'ink';
import type {
	ProcessMap,
	TUIState,
	TUIProcessType,
	TUIKeyPressMeta,
	ManagedProcessI,
} from './types.js';

type ProcessItem = {
	id: string;
	type: TUIProcessType;
	process: ManagedProcessI;
};

type InkTUIRendererProps = {
	processes: ProcessMap;
	state: TUIState;
	statusMessage?: string;
	logsData?: {id: string; type: TUIProcessType; content: string} | null;
	onKeyPress?: (key: string, meta?: TUIKeyPressMeta) => void;
};

export const InkTUIRenderer: React.FC<InkTUIRendererProps> = ({
	processes,
	state,
	statusMessage = 'Ready',
	logsData = null,
	onKeyPress,
}) => {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const {exit} = useApp();

	const processItems: ProcessItem[] = [];

	processes.dependencies.forEach((process, id) => {
		processItems.push({id, type: 'dependency', process});
	});

	processes.main.forEach((process, id) => {
		processItems.push({id, type: 'main', process});
	});

	processes.cleanup.forEach((process, id) => {
		processItems.push({id, type: 'cleanup', process});
	});

	useEffect(() => {
		if (state.selectedProcessId && state.selectedProcessType) {
			const idx = processItems.findIndex(
				item =>
					item.id === state.selectedProcessId &&
					item.type === state.selectedProcessType,
			);
			if (idx >= 0) {
				setSelectedIndex(idx);
			}
		}
	}, [state.selectedProcessId, state.selectedProcessType]);

	useInput((input, key) => {
		if (!onKeyPress) return;

		if (input === 'q' || (key.ctrl && input === 'c')) {
			onKeyPress(key.ctrl && input === 'c' ? 'C-c' : 'q');
		} else if (input === 's') {
			onKeyPress('s');
		} else if (input === 'r') {
			onKeyPress('r');
		} else if (input === 'R' || (key.ctrl && input === 'r')) {
			onKeyPress(key.ctrl && input === 'r' ? 'C-r' : 'R');
		} else if (key.return) {
			if (processItems[selectedIndex]) {
				const item = processItems[selectedIndex];
				onKeyPress('enter', {processInfo: {id: item.id, type: item.type}});
			}
		} else if (key.upArrow) {
			const newIndex = Math.max(0, selectedIndex - 1);
			setSelectedIndex(newIndex);
			if (processItems[newIndex]) {
				const item = processItems[newIndex];
				onKeyPress('select', {
					index: newIndex,
					processInfo: {id: item.id, type: item.type},
				});
			}
		} else if (key.downArrow) {
			const newIndex = Math.min(processItems.length - 1, selectedIndex + 1);
			setSelectedIndex(newIndex);
			if (processItems[newIndex]) {
				const item = processItems[newIndex];
				onKeyPress('select', {
					index: newIndex,
					processInfo: {id: item.id, type: item.type},
				});
			}
		}
	});

	const getStatusIcon = (status: string): string => {
		switch (status) {
			case 'running':
				return '▶';
			case 'stopped':
				return '■';
			case 'crashed':
				return '✖';
			case 'starting':
				return '⋯';
			case 'stopping':
				return '⋯';
			default:
				return '○';
		}
	};

	const renderProcessList = () => {
		const groups: {title: string; items: ProcessItem[]}[] = [];

		const deps = processItems.filter(item => item.type === 'dependency');
		const mains = processItems.filter(item => item.type === 'main');
		const cleanups = processItems.filter(item => item.type === 'cleanup');

		if (deps.length > 0) groups.push({title: 'Dependencies', items: deps});
		if (mains.length > 0) groups.push({title: 'Main', items: mains});
		if (cleanups.length > 0) groups.push({title: 'Cleanup', items: cleanups});

		return groups.map((group, groupIdx) => (
			<Box key={groupIdx} flexDirection="column" marginBottom={1}>
				<Text bold color="cyan">
					{group.title}:
				</Text>
				{group.items.map(item => {
					const itemIndex = processItems.indexOf(item);
					const isSelected = itemIndex === selectedIndex;
					const status = item.process.getStatus();
					const icon = getStatusIcon(status);

					return (
						<Box key={item.id}>
							<Text backgroundColor={isSelected ? 'blue' : undefined}>
								{`  ${icon} ${item.id} [${status}]`}
							</Text>
						</Box>
					);
				})}
			</Box>
		));
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Box flexDirection="row" height="80%">
				<Box
					flexDirection="column"
					width="25%"
					borderStyle="round"
					borderColor="cyan"
					padding={1}
				>
					<Text bold>Processes</Text>
					{renderProcessList()}
				</Box>

				<Box
					flexDirection="column"
					width="75%"
					borderStyle="round"
					borderColor="cyan"
					marginLeft={1}
					padding={1}
				>
					<Text bold>Logs</Text>
					{logsData ? (
						<Box flexDirection="column">
							<Text bold color="yellow">
								{logsData.type}:{logsData.id}
							</Text>
							<Text>{logsData.content}</Text>
						</Box>
					) : (
						<Text dimColor>Press Enter to view logs for selected process</Text>
					)}
				</Box>
			</Box>

			<Box flexDirection="column" marginTop={1}>
				<Box borderStyle="round" borderColor="cyan" padding={1}>
					<Text>
						↑/↓ navigate | enter logs | r restart | R/Ctrl-R restart all | q
						quit
					</Text>
				</Box>
				<Box padding={1}>
					<Text backgroundColor="blue">{statusMessage}</Text>
				</Box>
			</Box>
		</Box>
	);
};
