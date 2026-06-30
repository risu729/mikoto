import { createInterface } from "node:readline";

const scenario = process.argv[2] ?? "success";

const write = (message: unknown): void => {
	process.stdout.write(`${JSON.stringify(message)}\n`);
};

const respond = (id: string | number, result: unknown): void => {
	write({ id, result });
};

const fail = (id: string | number, message: string): void => {
	write({ error: { code: -32_000, message }, id });
};

type FakeRequest = {
	id?: number | string;
	method: string;
	params?: { threadId?: string };
};

const handleInitialize = (id: number | string): void => {
	respond(id, {
		codexHome: "/tmp/fake-codex-home",
		platformFamily: "unix",
		platformOs: "linux",
		userAgent: "fake-app-server/0.0.0",
	});
	write({ method: "unknown/example", params: { ignored: true } });
	if (scenario === "exit-after-init") {
		process.exit(42);
	}
};

const handleThreadStart = (id: number | string): void => {
	respond(id, {
		approvalPolicy: "never",
		cwd: "/tmp",
		model: "gpt-5.5",
		modelProvider: "openai",
		reasoningEffort: "medium",
		sandbox: { networkAccess: false, type: "readOnly" },
		serviceTier: null,
		thread: { id: "thread-1" },
	});
};

const emitTurnStartedResponse = (id: number | string): void => {
	respond(id, {
		turn: {
			completedAt: null,
			durationMs: null,
			error: null,
			id: "turn-1",
			items: [],
			itemsView: "full",
			startedAt: 1,
			status: "inProgress",
		},
	});
};

const emitAgentDelta = (threadId: string, delta: string): void => {
	write({
		method: "item/agentMessage/delta",
		params: { delta, itemId: "item-1", threadId, turnId: "turn-1" },
	});
};

const emitTurnFailure = (threadId: string): void => {
	write({
		method: "error",
		params: {
			error: { additionalDetails: null, codexErrorInfo: null, message: "fake turn failed" },
			threadId,
			turnId: "turn-1",
			willRetry: false,
		},
	});
};

const emitTurnCompleted = (threadId: string): void => {
	write({
		method: "turn/completed",
		params: {
			threadId,
			turn: {
				completedAt: 2,
				durationMs: 1000,
				error: null,
				id: "turn-1",
				items: [],
				itemsView: "full",
				startedAt: 1,
				status: "completed",
			},
		},
	});
};

const emitTurnSuccess = (threadId: string): void => {
	emitAgentDelta(threadId, "Hello");
	write({
		method: "item/completed",
		params: {
			item: {
				id: "item-1",
				phase: null,
				text: "Hello from fake app-server",
				type: "agentMessage",
			},
			threadId,
			turnId: "turn-1",
		},
	});
	emitTurnCompleted(threadId);
};

const emitDeltaOnlyTurnSuccess = (threadId: string): void => {
	emitAgentDelta(threadId, "partial");
	emitTurnCompleted(threadId);
};

type TurnScenarioHandler = (threadId: string) => void;

const emitTimeoutTurn = (threadId: string): void => {
	emitAgentDelta(threadId, "partial");
};

const turnScenarioHandlers: Record<string, TurnScenarioHandler> = {
	"delta-completed-no-item": emitDeltaOnlyTurnSuccess,
	"timeout-never-completes": emitTimeoutTurn,
	"turn-failed": emitTurnFailure,
};

const handleTurnStart = (request: FakeRequest & { id: number | string }): void => {
	const threadId = request.params?.threadId ?? "thread-1";
	const scenarioHandler = turnScenarioHandlers[scenario] ?? emitTurnSuccess;

	emitTurnStartedResponse(request.id);
	scenarioHandler(threadId);
};

const handleRequest = (request: FakeRequest): void => {
	if (request.method === "initialized") {
		return;
	}

	if (typeof request.id !== "number" && typeof request.id !== "string") {
		return;
	}

	switch (request.method) {
		case "initialize":
			handleInitialize(request.id);
			break;
		case "thread/start":
			handleThreadStart(request.id);
			break;
		case "turn/start":
			handleTurnStart(request as FakeRequest & { id: number | string });
			break;
		case "turn/interrupt":
			respond(request.id, {});
			break;
		default:
			fail(request.id, `Unexpected method: ${request.method}`);
			break;
	}
};

const lines = createInterface({ input: process.stdin });

lines.on("line", (line) => handleRequest(JSON.parse(line) as FakeRequest));
