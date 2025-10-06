import React, {useState, useEffect, useMemo} from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
import type {
	ProcessMap,
	TUIState,
	TUIProcessType,
	TUIKeyPressMeta,
	ProcessUnitI,
	FlagState,
} from './types.js';

type ProcessItem = {
	id: string;
	type: TUIProcessType;
	process: ProcessUnitI;
};

type InkTUIRendererProps = {
	processes: ProcessMap;
	state: TUIState;
	statusMessage?: string;
	logsData?: {id: string; type: TUIProcessType; content: string} | null;
	onKeyPress?: (key: string, meta?: TUIKeyPressMeta) => void;
};

const getFlagColorCode = (
	color: string,
): 'green' | 'blue' | 'red' | 'yellow' | 'cyan' | 'magenta' | 'gray' => {
	switch (color) {
		case 'green':
			return 'green';
		case 'blue':
			return 'blue';
		case 'red':
			return 'red';
		case 'yellow':
			return 'yellow';
		case 'teal':
			return 'cyan';
		case 'purple':
			return 'magenta';
		case 'orange':
			return 'yellow';
		default:
			return 'gray';
	}
};

const getFlagEmoji = (color: string): string => {
	switch (color) {
		case 'red':
			return '🔴';
		case 'yellow':
			return '🟡';
		case 'green':
			return '🟢';
		case 'blue':
			return '🔵';
		case 'teal':
			return '🟦';
		case 'purple':
			return '🟣';
		case 'orange':
			return '🟠';
		default:
			return '⚑';
	}
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
	const [tailingMap, setTailingMap] = useState<Map<string, boolean>>(new Map());
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

	const maxLogLines = Math.max(1, terminalHeight - 10);

	const currentProcessKey = logsData ? `${logsData.type}:${logsData.id}` : null;
	const isTailing = currentProcessKey
		? tailingMap.get(currentProcessKey) ?? false
		: false;

	useEffect(() => {
		if (isTailing && logsData && logLines.length > maxLogLines) {
			setLogScrollOffset(Math.max(0, logLines.length - maxLogLines));
		}
	}, [logLines, isTailing, logsData, maxLogLines]);

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
			} else if (input === 't') {
				if (currentProcessKey) {
					const newTailing = !isTailing;
					setTailingMap(prev => {
						const newMap = new Map(prev);
						newMap.set(currentProcessKey, newTailing);
						return newMap;
					});
					if (newTailing && logLines.length > maxLogLines) {
						setLogScrollOffset(Math.max(0, logLines.length - maxLogLines));
					}
				}
			} else if (key.return) {
				if (state.flagPanelFocused) {
					onKeyPress('flag-enter');
				} else if (processItems[selectedIndex]) {
					const item = processItems[selectedIndex];
					onKeyPress('enter', {processInfo: {id: item.id, type: item.type}});
					setLogScrollOffset(0);
				}
			} else if (key.upArrow || input === 'k') {
				if (state.flagPanelFocused) {
					onKeyPress('flag-up');
				} else if (logsData) {
					if (currentProcessKey && isTailing) {
						setTailingMap(prev => {
							const newMap = new Map(prev);
							newMap.set(currentProcessKey, false);
							return newMap;
						});
					}
					setLogScrollOffset(Math.max(0, logScrollOffset - 1));
				}
			} else if (key.downArrow || input === 'j') {
				if (state.flagPanelFocused) {
					onKeyPress('flag-down');
				} else if (logsData) {
					if (currentProcessKey && isTailing) {
						setTailingMap(prev => {
							const newMap = new Map(prev);
							newMap.set(currentProcessKey, false);
							return newMap;
						});
					}
					setLogScrollOffset(
						Math.min(
							Math.max(0, logLines.length - maxLogLines),
							logScrollOffset + 1,
						),
					);
				}
			} else if ((key.ctrl && key.upArrow) || input === 'K') {
				const newIndex = Math.max(0, selectedIndex - 1);
				setSelectedIndex(newIndex);
				if (processItems[newIndex]) {
					const item = processItems[newIndex];
					onKeyPress('select', {
						index: newIndex,
						processInfo: {id: item.id, type: item.type},
					});
				}
			} else if ((key.ctrl && key.downArrow) || input === 'J') {
				const newIndex = Math.min(processItems.length - 1, selectedIndex + 1);
				setSelectedIndex(newIndex);
				if (processItems[newIndex]) {
					const item = processItems[newIndex];
					onKeyPress('select', {
						index: newIndex,
						processInfo: {id: item.id, type: item.type},
					});
				}
			} else if (key.pageUp && logsData) {
				if (currentProcessKey && isTailing) {
					setTailingMap(prev => {
						const newMap = new Map(prev);
						newMap.set(currentProcessKey, false);
						return newMap;
					});
				}
				setLogScrollOffset(Math.max(0, logScrollOffset - maxLogLines));
			} else if (key.pageDown && logsData) {
				if (currentProcessKey && isTailing) {
					setTailingMap(prev => {
						const newMap = new Map(prev);
						newMap.set(currentProcessKey, false);
						return newMap;
					});
				}
				setLogScrollOffset(
					Math.min(
						Math.max(0, logLines.length - maxLogLines),
						logScrollOffset + maxLogLines,
					),
				);
			} else if (input === 'f') {
				onKeyPress('f');
			} else if (input === 'm') {
				onKeyPress('m');
			} else if (input === 'n') {
				onKeyPress('n');
			} else if (input === 'p') {
				onKeyPress('p');
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

					const logger = item.process.logger;
					const allFlags = logger.getAllFlags();
					const flagsWithCounts = Array.from(allFlags.values())
						.map((flagState: FlagState) => ({
							color: flagState.flag.color,
							count: flagState.count,
						}))
						.sort((a, b) => b.count - a.count)
						.slice(0, 3);

					return (
						<Box key={item.id}>
							<Text
								backgroundColor={isSelected ? 'blue' : undefined}
								color={isSelected ? 'white' : undefined}
							>
								<Text color={color}>{`  ${icon}`}</Text>
								{` ${item.id} `}
								{flagsWithCounts.map((f, i) =>
									f.count > 0 ? (
										<Text key={i} color={getFlagColorCode(f.color)}>
											{getFlagEmoji(f.color)}
											<Text>{f.count} </Text>
										</Text>
									) : null,
								)}
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
				>
					<Box
						flexDirection="column"
						flexGrow={state.flagPanelSize === 'expanded' ? 0 : 1}
						height={state.flagPanelSize === 'expanded' ? '20%' : undefined}
						paddingX={1}
						borderStyle="single"
						borderColor="cyan"
					>
						<Box>
							<Text bold underline>
								Logs
							</Text>
							{scrollInfo && (
								<Text dimColor color="cyan">
									{' '}
									{scrollInfo}
								</Text>
							)}
						</Box>
						<Box flexDirection="column" flexGrow={1} overflow="hidden">
							{logsData ? (
								<Box flexDirection="column" flexGrow={1}>
									<Text bold color="yellow">
										{logsData.type}:{logsData.id}
									</Text>
									<Box flexDirection="column" marginTop={1} flexGrow={1}>
										{visibleLogLines.map((line, idx) => {
											const actualLineNumber = logScrollOffset + idx + 1;
											return (
												<Text key={actualLineNumber}>
													<Text dimColor>
														{String(actualLineNumber).padStart(4, ' ')}│
													</Text>
													{line}
												</Text>
											);
										})}
									</Box>
									{logLines.length > maxLogLines && (
										<Box>
											<Text dimColor>
												j/k/↑/↓ scroll line | PgUp/PgDn scroll page | t toggle
												tail {isTailing && '(tailing ↓)'}
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

					<Box
						flexDirection="column"
						flexGrow={state.flagPanelSize === 'expanded' ? 1 : 0}
						height={state.flagPanelSize === 'expanded' ? undefined : '20%'}
						borderStyle="single"
						borderColor={state.flagPanelFocused ? 'yellow' : 'magenta'}
						paddingX={1}
					>
						{(() => {
							const selectedItem = processItems.find(
								item =>
									item.id === state.selectedProcessId &&
									item.type === state.selectedProcessType,
							);
							if (!selectedItem) {
								return <Text dimColor>No process selected</Text>;
							}

							const logger = selectedItem.process.logger;
							const allFlags = logger.getAllFlags();

							if (allFlags.size === 0) {
								return <Text dimColor>No flags for this process</Text>;
							}

							const renderFlagTree = () => {
								const items: JSX.Element[] = [];
								Array.from(allFlags.entries()).forEach(([name, flagState]) => {
									const flagNodeId = `flag:${name}`;
									const isSelected = state.selectedFlagNode === flagNodeId;
									const isExpanded = state.expandedFlagNodes?.has(flagNodeId);
									items.push(
										<Box key={flagNodeId}>
											<Text
												bold={isSelected}
												inverse={isSelected}
												color={
													isSelected
														? 'black'
														: getFlagColorCode(flagState.flag.color)
												}
												backgroundColor={
													isSelected
														? getFlagColorCode(flagState.flag.color)
														: undefined
												}
											>
												{isExpanded ? '▼' : '▶'}{' '}
												{getFlagEmoji(flagState.flag.color)} {name}:{' '}
												{String(flagState.count)}
												{flagState.flag.targetCount &&
													`/${String(flagState.flag.targetCount)}`}
											</Text>
										</Box>,
									);
									if (isExpanded && flagState.matches) {
										flagState.matches.forEach((match, idx) => {
											const matchNodeId = `${flagNodeId}:match:${idx}`;
											const isMatchSelected =
												state.selectedFlagNode === matchNodeId;
											const showContext =
												state.matchContextVisible?.has(matchNodeId);
											const contextWindow = showContext
												? logger.getContextWindow(
														match.logIndex,
														match.contextWindowSize,
												  )
												: null;
											items.push(
												<Box
													key={matchNodeId}
													paddingLeft={2}
													flexDirection="column"
												>
													<Text
														bold={isMatchSelected}
														inverse={isMatchSelected}
														color={isMatchSelected ? 'black' : 'gray'}
														backgroundColor={
															isMatchSelected ? 'cyan' : undefined
														}
													>
														• Match {String(idx + 1)}:{' '}
														{match.matchedText.substring(0, 60)}
														{match.matchedText.length > 60 ? '...' : ''}
													</Text>
													{showContext && contextWindow && (
														<Box flexDirection="column" paddingLeft={2}>
															{contextWindow.map((line, lineIdx) => {
																const isMatchLine =
																	lineIdx ===
																	Math.floor(contextWindow.length / 2);
																return (
																	<Text
																		key={lineIdx}
																		dimColor={!isMatchLine}
																		color={isMatchLine ? undefined : 'gray'}
																	>
																		{line}
																	</Text>
																);
															})}
														</Box>
													)}
												</Box>,
											);
										});
									}
								});
								return items;
							};
							return (
								<Box flexDirection="column" overflow="hidden">
									<Text bold>
										Flags{' '}
										{state.flagPanelSize === 'expanded'
											? '(press f to collapse, ↑/↓ to navigate, enter to expand)'
											: '(press f to expand)'}
									</Text>
									{renderFlagTree()}
								</Box>
							);
						})()}
					</Box>
				</Box>
			</Box>

			<Box flexDirection="column">
				<Box borderStyle="single" borderColor="gray" paddingX={1}>
					<Text dimColor>
						J/K/C-↑/C-↓ change process | j/k/↑/↓ scroll logs | t tail | enter
						logs | f toggle flags | r restart | R/C-r restart all | q quit
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
