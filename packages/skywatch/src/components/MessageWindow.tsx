import {TitledBox} from '@mishieck/ink-titled-box';
import {
	Box,
	DOMElement,
	Static,
	Text,
	measureElement,
	useFocus,
	useInput,
} from 'ink';
import React, {useEffect, useReducer, useRef} from 'react';
import {useOvrseer} from '../state/ovrseer.state';

interface MessageScrollState {
	innerHeight: number;
	height: number;
	scrollTop: number;
}

type MessageScrollAction =
	| {type: 'SET_INNER_HEIGHT'; innerHeight: number}
	| {type: 'SET_HEIGHT'; height: number}
	| {type: 'SCROLL_DOWN'}
	| {type: 'SCROLL_UP'};

const reducer = (state: MessageScrollState, action: MessageScrollAction) => {
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

export const MessageWindow: React.FC = () => {
	const ovrseerState = useOvrseer();
	const {isFocused} = useFocus({id: 'messages'});
	const [state, dispatch] = useReducer(reducer, {
		height: 0,
		scrollTop: 0,
		innerHeight: 0,
	});

	const innerRef = useRef<DOMElement>(null);
	const outerRef = useRef<DOMElement>(null);

	useEffect(() => {
		if (!outerRef.current) return;

		const dimensions = measureElement(outerRef.current);

		dispatch({type: 'SET_HEIGHT', height: dimensions.height});
	}, []);

	useEffect(() => {
		if (!innerRef.current) return;

		const dimensions = measureElement(innerRef.current);

		dispatch({
			type: 'SET_INNER_HEIGHT',
			innerHeight: dimensions.height,
		});
	}, [ovrseerState.messages]);

	useInput((_input, key) => {
		if (!isFocused) return;

		if (key.downArrow) {
			dispatch({type: 'SCROLL_DOWN'});
		}

		if (key.upArrow) {
			dispatch({type: 'SCROLL_UP'});
		}
	});

	const visibleMessages = ovrseerState.messages.slice(
		Math.max(0, ovrseerState.messages.length - 10),
	);

	return (
		<Box ref={outerRef} flexGrow={1} flexDirection="column">
			<TitledBox
				titles={['󱜽 Messages']}
				borderStyle="single"
				flexDirection="column"
				flexGrow={1}
				paddingX={1}
				overflowY="hidden"
			>
				<Box
					ref={innerRef}
					flexShrink={0}
					flexDirection="column"
					marginTop={-state.scrollTop}
				>
					<Static items={visibleMessages}>
						{(message, index) => (
							<Box flexDirection="row" key={index} columnGap={1}>
								<Text dimColor>
									{new Date(message.timestamp).toLocaleTimeString()}
								</Text>
								<Text>{message.message}</Text>
							</Box>
						)}
					</Static>
				</Box>
			</TitledBox>
		</Box>
	);
};
