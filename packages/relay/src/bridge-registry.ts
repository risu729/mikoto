import type { BridgeHelloMessage } from "@mikoto/protocol";

import { selectDisconnectedBridgeKeys } from "./routing";
import type { RegisteredBridge } from "./routing";

const BRIDGE_KEY_PREFIX = "bridge:";

const bridgeStorageKey = (bridgeId: string): string => `${BRIDGE_KEY_PREFIX}${bridgeId}`;

const bridgeIdFromStorageKey = (key: string): string => key.slice(BRIDGE_KEY_PREFIX.length);

const deleteBridgeStorage = async (state: DurableObjectState, bridgeId: string): Promise<void> => {
	await state.storage.delete(bridgeStorageKey(bridgeId));
};

const acceptBridgeSocket = (state: DurableObjectState): Response => {
	const pair = new WebSocketPair();
	const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
	const connectedAt = new Date().toISOString();

	server.serializeAttachment({ connectedAt });
	state.acceptWebSocket(server);

	return new Response(null, {
		status: 101,
		webSocket: client,
	});
};

const liveBridgeIds = (webSockets: Iterable<WebSocket>): Set<string> => {
	const ids = new Set<string>();

	for (const ws of webSockets) {
		const attachment = ws.deserializeAttachment() as { bridgeId?: string } | undefined;
		if (attachment?.bridgeId) {
			ids.add(attachment.bridgeId);
		}
	}

	return ids;
};

const pruneDisconnectedBridgeStorage = async (
	state: DurableObjectState,
	onBridgeDisconnected: (bridgeId: string) => void,
): Promise<void> => {
	const bridges = await state.storage.list<RegisteredBridge>({ prefix: BRIDGE_KEY_PREFIX });
	const disconnectedKeys = selectDisconnectedBridgeKeys(
		bridges,
		liveBridgeIds(state.getWebSockets()),
	);

	for (const key of disconnectedKeys) {
		onBridgeDisconnected(bridgeIdFromStorageKey(key));
	}
	await Promise.all(disconnectedKeys.map((key) => state.storage.delete(key)));
};

const storeRegisteredBridge = async (
	state: DurableObjectState,
	ws: WebSocket,
	message: BridgeHelloMessage,
): Promise<void> => {
	const attachment = ws.deserializeAttachment() as { connectedAt?: string } | undefined;

	await state.storage.put(bridgeStorageKey(message.bridge.id), {
		...message.bridge,
		connectedAt: attachment?.connectedAt ?? new Date().toISOString(),
		toolMetadata: message.tools,
		tools: message.tools.map((tool) => tool.name),
	});
	ws.serializeAttachment({
		...(ws.deserializeAttachment() as object | undefined),
		bridgeId: message.bridge.id,
	});
};

export {
	acceptBridgeSocket,
	bridgeStorageKey,
	deleteBridgeStorage,
	pruneDisconnectedBridgeStorage,
	storeRegisteredBridge,
};
