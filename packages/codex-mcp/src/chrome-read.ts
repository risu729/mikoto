import type { CodexRunInput } from "./codex";

type CodexChromeReadInput = {
	cwd?: string;
	request: string;
	timeoutMs?: number;
};

const createChromeReadPrompt = (request: string): string =>
	`
Use @Chrome to satisfy this browser read request.

Request:
${request}

Rules:
- Use read-only browser access. Do not write data or make lasting changes.
- You may navigate or interact only when required to read the requested information.
- Do not submit forms, send messages, change settings, mark items read/unread, delete/archive, or perform purchases.
- Do not return raw HTML, raw DOM, screenshots, cookies, storage, tokens, or secrets.
- Return structured task-oriented information that directly answers the request.
- If the request cannot be completed read-only, say so clearly.
`.trim();

const applyChromeReadOptions = (
	taskInput: CodexRunInput,
	input: CodexChromeReadInput,
): CodexRunInput => {
	if (input.cwd) {
		taskInput.cwd = input.cwd;
	}
	if (input.timeoutMs) {
		taskInput.timeoutMs = input.timeoutMs;
	}

	return taskInput;
};

const createReadOnlyTaskPrompt = (prompt: string): string =>
	`
You are running through a read-only MCP tool. Avoid writes, lasting changes, and destructive actions.

Task:
${prompt}
`.trim();

const createChromeReadTaskInput = (input: CodexChromeReadInput): CodexRunInput =>
	applyChromeReadOptions(
		{
			prompt: createChromeReadPrompt(input.request),
			toolKind: "chrome_read",
		},
		input,
	);

export { createChromeReadPrompt, createChromeReadTaskInput, createReadOnlyTaskPrompt };
export type { CodexChromeReadInput };
