import React, {useState, useEffect, useMemo} from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
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

const getStatusIcon = (status: string): string => {
	switch (status) {
		case 'ready':
			return '✓';
		case 'running':
			return '▶';
		case 'stopped':
			return '■';
		case 'completed':
			return '✓';
		case 'crashed':
			return '✖';
		case 'couldNotSpawn':
			return '✖';
		case 'failedByReadyCheck':
			return '✖';
		case 'created':
			return '○';
		case 'starting':
			return '⋯';
		case 'stopping':
			return '⋯';
		default:
			return '○';
	}
};

const getStatusColor = (
	status: string,
): 'green' | 'yellow' | 'red' | 'gray' | 'cyan' => {
	switch (status) {
		case 'ready':
		case 'completed':
			return 'green';
		case 'running':
		case 'starting':
		case 'stopping':
			return 'yellow';
		case 'crashed':
		case 'couldNotSpawn':
		case 'failedByReadyCheck':
			return 'red';
		case 'stopped':
			return 'gray';
		default:
			return 'cyan';
	}
};

export const InkTUIRenderer: React.FC<InkTUIRendererProps> = ({
	processes,
	state,
	statusMessage = 'Ready',
	logsData = null,
	onKeyPress,
}) => {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [logScrollOffset, setLogScrollOffset] = useState(0);
	const [hasAutoSelected, setHasAutoSelected] = useState(false);
	const {stdout} = useStdout();

	const terminalHeight = stdout?.rows ?? 24;
	const terminalWidth = stdout?.columns ?? 80;

	const processItems: ProcessItem[] = useMemo(() => {
		const items: ProcessItem[] = [];

		processes.dependencies.forEach((process, id) => {
			items.push({id, type: 'dependency', process});
		});

		processes.main.forEach((process, id) => {
			items.push({id, type: 'main', process});
		});

		processes.cleanup.forEach((process, id) => {
			items.push({id, type: 'cleanup', process});
		});

		return items;
	}, [processes]);

	const statusCounts = useMemo(() => {
		const counts = {
			ready: 0,
			running: 0,
			crashed: 0,
			stopped: 0,
			other: 0,
		};

		processItems.forEach(item => {
			const status = item.process.getStatus();
			if (status === 'ready' || status === 'completed') {
				counts.ready++;
			} else if (status === 'running') {
				counts.running++;
			} else if (
				status === 'crashed' ||
				status === 'couldNotSpawn' ||
				status === 'failedByReadyCheck'
			) {
				counts.crashed++;
			} else if (status === 'stopped') {
				counts.stopped++;
			} else {
				counts.other++;
			}
		});

		return counts;
	}, [processItems]);

	useEffect(() => {
		if (!hasAutoSelected && processItems.length > 0 && onKeyPress) {
			const firstItem = processItems[0];
			if (firstItem) {
				setSelectedIndex(0);
				onKeyPress('select', {
					index: 0,
					processInfo: {id: firstItem.id, type: firstItem.type},
				});
				setHasAutoSelected(true);
			}
		}
	}, [processItems, hasAutoSelected, onKeyPress]);

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
	}, [state.selectedProcessId, state.selectedProcessType, processItems]);

	const logLines = useMemo(() => {
		if (!logsData) return [];
		return logsData.content.split('\n');
	}, [logsData]);

	const maxLogLines = terminalHeight - 10;

	const visibleLogLines = useMemo(() => {
		const start = logScrollOffset;
		const end = start + maxLogLines;
		return logLines.slice(start, end);
	}, [logLines, logScrollOffset, maxLogLines]);

	useInput(
		(input, key) => {
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
					setLogScrollOffset(0);
				}
			} else if (key.upArrow) {
				if (logsData && logScrollOffset > 0) {
					setLogScrollOffset(Math.max(0, logScrollOffset - 1));
				} else {
					const newIndex = Math.max(0, selectedIndex - 1);
					setSelectedIndex(newIndex);
					if (processItems[newIndex]) {
						const item = processItems[newIndex];
						onKeyPress('select', {
							index: newIndex,
							processInfo: {id: item.id, type: item.type},
						});
					}
				}
			} else if (key.downArrow) {
				if (logsData && logScrollOffset + maxLogLines < logLines.length) {
					setLogScrollOffset(
						Math.min(logLines.length - maxLogLines, logScrollOffset + 1),
					);
				} else if (!logsData) {
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
			} else if (key.pageUp && logsData) {
				setLogScrollOffset(Math.max(0, logScrollOffset - maxLogLines));
			} else if (key.pageDown && logsData) {
				setLogScrollOffset(
					Math.min(
						Math.max(0, logLines.length - maxLogLines),
						logScrollOffset + maxLogLines,
					),
				);
			}
		},
		{isActive: true},
	);

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
				<Text bold color="magenta">
					{group.title}:
				</Text>
				{group.items.map(item => {
					const itemIndex = processItems.indexOf(item);
					const isSelected = itemIndex === selectedIndex;
					const status = item.process.getStatus();
					const icon = getStatusIcon(status);
					const color = getStatusColor(status);

					return (
						<Box key={item.id}>
							<Text
								backgroundColor={isSelected ? 'blue' : undefined}
								color={isSelected ? 'white' : undefined}
							>
								<Text color={color}>{`  ${icon}`}</Text>
								{` ${item.id} `}
								<Text dimColor>[{status}]</Text>
							</Text>
						</Box>
					);
				})}
			</Box>
		));
	};

	const scrollInfo =
		logsData && logLines.length > maxLogLines
			? ` [${logScrollOffset + 1}-${Math.min(
					logScrollOffset + maxLogLines,
					logLines.length,
			  )}/${logLines.length}]`
			: '';

	return (
		<Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
			<Box borderStyle="double" borderColor="cyan" paddingX={2}>
				<Text bold color="cyan">
					⚙ OVRSEER Process Manager
				</Text>
			</Box>

			<Box flexDirection="row" flexGrow={1}>
				<Box
					flexDirection="column"
					width="30%"
					borderStyle="single"
					borderColor="magenta"
					paddingX={1}
				>
					<Text bold underline>
						Processes
					</Text>
					<Box flexDirection="column" flexGrow={1} overflow="hidden">
						{renderProcessList()}
					</Box>
				</Box>

				<Box
					flexDirection="column"
					width="70%"
					borderStyle="single"
					borderColor="cyan"
					paddingX={1}
				>
					<Box>
						<Text bold underline>
							Logs
						</Text>
						{scrollInfo && (
							<Text dimColor color="cyan">
								{scrollInfo}
							</Text>
						)}
					</Box>
					<Box flexDirection="column" flexGrow={1} overflow="hidden">
						{logsData ? (
							<Box flexDirection="column">
								<Text bold color="yellow">
									{logsData.type}:{logsData.id}
								</Text>
								<Box flexDirection="column" marginTop={1}>
									{visibleLogLines.map((line, idx) => {
										const actualLineNumber = logScrollOffset + idx + 1;
										return (
											<Text key={actualLineNumber}>
												<Text dimColor>
													{String(actualLineNumber).padStart(4, ' ')}│
												</Text>{' '}
												{line}
											</Text>
										);
									})}
								</Box>
								{logLines.length > maxLogLines && (
									<Box marginTop={1}>
										<Text dimColor>
											↑/↓ scroll line | PgUp/PgDn scroll page
										</Text>
									</Box>
								)}
							</Box>
						) : (
							<Text dimColor>
								Press Enter to view logs for selected process
							</Text>
						)}
					</Box>
				</Box>
			</Box>

			<Box flexDirection="column">
				<Box borderStyle="single" borderColor="gray" paddingX={1}>
					<Text dimColor>
						↑/↓ navigate | enter logs | r restart | R/Ctrl-R restart all | q
						quit
					</Text>
				</Box>
				<Box borderStyle="single" borderColor="cyan" paddingX={1}>
					<Box flexDirection="column">
						<Box>
							<Text>Status: </Text>
							<Text bold color="cyan">
								{statusMessage}
							</Text>
						</Box>
						<Box>
							<Text>Processes: </Text>
							<Text color="green">✓ {statusCounts.ready}</Text>
							<Text> </Text>
							<Text color="yellow">▶ {statusCounts.running}</Text>
							<Text> </Text>
							<Text color="red">✖ {statusCounts.crashed}</Text>
							<Text> </Text>
							<Text color="gray">■ {statusCounts.stopped}</Text>
						</Box>
					</Box>
				</Box>
			</Box>
		</Box>
	);
};
