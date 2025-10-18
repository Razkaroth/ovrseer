import {TitledBox} from '@mishieck/ink-titled-box';
import spinners from 'cli-spinners';
import React from 'react';
import {useOvrseer, ProcessStatus} from '../state/ovrseer.state';

import {Task, TaskList} from 'ink-task-list';

export const Worktree: React.FC<{}> = () => {
	const ovrseerState = useOvrseer();
	const processes = ovrseerState.processStates;

	function getTaskProps(process: ProcessStatus) {
		const baseProps = {
			label: process.label,
			state: process.state,
			status: process.status,
		};

		if (process.state === 'loading') {
			return {
				...baseProps,
				spinner: spinners.aesthetic,
			};
		}

		return baseProps as (typeof Task)['arguments'];
	}

	return (
		<TitledBox titles={[' Worktree ']} borderStyle="single" paddingX={1}>
			<TaskList>
				<Task label="Dependencies" isExpanded>
					{ovrseerState.worktree?.dependenciesIds.map(id => (
						<Task key={id} {...getTaskProps(processes.get(id)!)} />
					))}
				</Task>
				<Task label="Main" isExpanded>
					{ovrseerState.worktree?.mainIds.map(id => (
						<Task key={id} {...getTaskProps(processes.get(id)!)} />
					))}
				</Task>
				<Task label="Cleanup" isExpanded>
					{ovrseerState.worktree?.cleanupIds.map(id => (
						<Task key={id} {...getTaskProps(processes.get(id)!)} />
					))}
				</Task>
			</TaskList>
		</TitledBox>
	);
};
