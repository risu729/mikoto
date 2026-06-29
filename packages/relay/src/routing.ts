import type { BridgeMetadata, ToolCallError, ToolCallResult, ToolInfo } from "@mikoto/protocol";

type RegisteredBridge = BridgeMetadata & {
	connectedAt: string;
	toolMetadata: ToolInfo[];
};
type PendingToolCall = {
	bridgeId: string;
	reject: (error: ToolCallError) => void;
	resolve: (result: ToolCallResult) => void;
};
type BridgeSelection =
	| {
			bridge: RegisteredBridge;
			error?: never;
	  }
	| {
			bridge?: never;
			error: ToolCallError;
	  };

const createToolError = (id: string, code: string, message: string): ToolCallResult => ({
	error: {
		code,
		message,
	},
	id,
	ok: false,
	type: "tool.result",
});

const createPendingError = (code: string, message: string): ToolCallError => ({
	code,
	message,
});

const selectBridgeById = (
	bridges: RegisteredBridge[],
	tool: string,
	bridgeId: string,
): BridgeSelection => {
	const bridge = bridges.find((item) => item.id === bridgeId);
	if (!bridge) {
		return { error: createPendingError("missing_bridge", `Bridge not found: ${bridgeId}`) };
	}
	if (!bridge.tools.includes(tool)) {
		return { error: createPendingError("tool_not_found", `Bridge does not expose tool: ${tool}`) };
	}

	return { bridge };
};

const selectOnlyBridgeWithTool = (bridges: RegisteredBridge[], tool: string): BridgeSelection => {
	const matches = bridges.filter((bridge) => bridge.tools.includes(tool));
	if (matches.length === 0) {
		return {
			error: createPendingError("tool_not_found", `No connected bridge exposes tool: ${tool}`),
		};
	}
	if (matches.length > 1) {
		return {
			error: createPendingError("ambiguous_bridge", `Multiple bridges expose tool: ${tool}`),
		};
	}

	const [bridge] = matches;
	if (!bridge) {
		return {
			error: createPendingError("tool_not_found", `No connected bridge exposes tool: ${tool}`),
		};
	}

	return { bridge };
};

const selectBridge = (
	bridges: RegisteredBridge[],
	tool: string,
	bridgeId?: string,
): BridgeSelection => {
	if (bridgeId) {
		return selectBridgeById(bridges, tool, bridgeId);
	}

	return selectOnlyBridgeWithTool(bridges, tool);
};

export {
	type PendingToolCall,
	type RegisteredBridge,
	createPendingError,
	createToolError,
	selectBridge,
};
