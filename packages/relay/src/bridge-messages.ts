import { BridgeHelloMessageSchema, ToolCallResultSchema } from "@mikoto/protocol";
import type { BridgeHelloMessage, ToolCallResult } from "@mikoto/protocol";

type BridgeInboundMessage =
	| { kind: "hello"; value: BridgeHelloMessage }
	| { kind: "invalid-bridge" }
	| { kind: "invalid-json" }
	| { kind: "tool-result"; value: ToolCallResult };

const parseJson = (message: string): { ok: true; value: unknown } | { ok: false } => {
	try {
		return { ok: true, value: JSON.parse(message) as unknown };
	} catch {
		return { ok: false };
	}
};

const parseBridgeMessage = (message: string): BridgeInboundMessage => {
	const raw = parseJson(message);
	if (!raw.ok) {
		return { kind: "invalid-json" };
	}

	const toolResult = ToolCallResultSchema.safeParse(raw.value);
	if (toolResult.success) {
		return { kind: "tool-result", value: toolResult.data };
	}

	const hello = BridgeHelloMessageSchema.safeParse(raw.value);
	if (hello.success) {
		return { kind: "hello", value: hello.data };
	}

	return { kind: "invalid-bridge" };
};

const sendBridgeError = (ws: WebSocket, error: string): void => {
	ws.send(JSON.stringify({ error, ok: false }));
};

const sendBridgeRegistered = (ws: WebSocket, bridgeId: string): void => {
	ws.send(JSON.stringify({ bridgeId, ok: true, type: "bridge.registered" }));
};

export { parseBridgeMessage, sendBridgeError, sendBridgeRegistered };
