import {Box, DOMElement, measureElement, useFocus, useInput} from 'ink';
import React from 'react';
import {useEffect, useReducer, useRef} from 'react';

interface ScrollAreaState {
	innerHeight: number;
	height: number;
	scrollTop: number;
}

type ScrollAreaAction =
	| {type: 'SET_INNER_HEIGHT'; innerHeight: number}
	| {type: 'SET_HEIGHT'; height: number}
	| {type: 'SCROLL_DOWN'}
	| {type: 'SCROLL_UP'};

const reducer = (state: ScrollAreaState, action: ScrollAreaAction) => {
	switch (action.type) {
		case 'SET_INNER_HEIGHT':
			return {
				...state,
				innerHeight: action.innerHeight,
			};
		case 'SET_HEIGHT':
			return {
				...state,
				height: action.height,
			};

		case 'SCROLL_DOWN':
			return {
				...state,
				scrollTop: Math.min(
					state.innerHeight <= state.height
						? 0
						: state.innerHeight - state.height,
					state.scrollTop + 1,
				),
			};

		case 'SCROLL_UP':
			return {
				...state,
				scrollTop: Math.max(0, state.scrollTop - 1),
			};

		default:
			return state;
	}
};

export interface ScrollAreaProps extends React.PropsWithChildren {
	height: number;
}

export function ScrollArea({height, children}: ScrollAreaProps) {
	useFocus();
	const [state, dispatch] = useReducer(reducer, {
		height: height,
		scrollTop: 0,
		innerHeight: 0,
	});

	const innerRef = useRef<DOMElement>(null);

	useEffect(() => {
		dispatch({type: 'SET_HEIGHT', height});
	}, [height]);

	useEffect(() => {
		if (!innerRef.current) return;

		const dimensions = measureElement(innerRef.current);

		dispatch({
			type: 'SET_INNER_HEIGHT',
			innerHeight: dimensions.height,
		});
	}, []);

	// TODO: Get this via a zustand store for input callbacks
	useInput((_input, key) => {
		if (key.downArrow) {
			dispatch({
				type: 'SCROLL_DOWN',
			});
		}

		if (key.upArrow) {
			dispatch({
				type: 'SCROLL_UP',
			});
		}
	});

	return (
		<Box
			height={height}
			borderStyle="single"
			flexDirection="column"
			flexGrow={1}
			overflow="hidden"
		>
			<Box
				ref={innerRef}
				flexShrink={0}
				flexDirection="column"
				marginTop={-state.scrollTop}
			>
				{children}
			</Box>
		</Box>
	);
}
