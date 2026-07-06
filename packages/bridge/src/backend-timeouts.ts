import type { JsonObject } from "@mikoto/protocol";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";

const BACKEND_TOOL_CALL_TIMEOUT_MS = 300_000;
const BACKEND_TOOL_CALL_TIMEOUT_BUFFER_MS = 1_000;

const resolveBackendToolCallOptions = (args: JsonObject): RequestOptions => {
	const requestedTimeoutMs = args["timeoutMs"];
	if (
		typeof requestedTimeoutMs === "number" &&
		Number.isFinite(requestedTimeoutMs) &&
		requestedTimeoutMs > 0
	) {
		return {
			timeout: Math.min(
				requestedTimeoutMs + BACKEND_TOOL_CALL_TIMEOUT_BUFFER_MS,
				BACKEND_TOOL_CALL_TIMEOUT_MS,
			),
		};
	}

	return { timeout: BACKEND_TOOL_CALL_TIMEOUT_MS };
};

export default resolveBackendToolCallOptions;
