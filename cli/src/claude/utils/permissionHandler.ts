/**
 * Permission Handler for canCallTool integration
 * 
 * Replaces the MCP permission server with direct SDK integration.
 * Handles tool permission requests, responses, and state management.
 */

import { logger } from "@/lib";
import { SDKAssistantMessage, SDKMessage, SDKUserMessage } from "../sdk";
import type { CanUseTool, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { PLAN_FAKE_REJECT, PLAN_FAKE_RESTART } from "../sdk/prompts";
import { Session } from "../session";
import { deepEqual } from "@/utils/deepEqual";
import { EnhancedMode, PermissionMode } from "../loop";
import { getToolDescriptor } from "./getToolDescriptor";
import { delay } from "@/utils/time";
import { isObject } from "@hapi/protocol";
import {
    BasePermissionHandler,
    type PendingPermissionRequest,
    type PermissionCompletion
} from "@/modules/common/permission/BasePermissionHandler";

interface PermissionResponse {
    id: string;
    approved: boolean;
    reason?: string;
    mode?: PermissionMode;
    allowTools?: string[];
    answers?: Record<string, string[]> | Record<string, { answers: string[] }>;
    message?: string;
    receivedAt?: number;
}

const PLAN_EXIT_MODES: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions'];

function isAskUserQuestionToolName(toolName: string): boolean {
    return toolName === 'AskUserQuestion' || toolName === 'ask_user_question';
}

function isRequestUserInputToolName(toolName: string): boolean {
    return toolName === 'request_user_input';
}

function isQuestionToolName(toolName: string): boolean {
    return isAskUserQuestionToolName(toolName) || isRequestUserInputToolName(toolName);
}

function buildAskUserQuestionUpdatedInput(input: unknown, answers: Record<string, string[]> | Record<string, { answers: string[] }>): Record<string, unknown> {
    // Normalize to flat format for AskUserQuestion
    const flatAnswers: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(answers)) {
        if (Array.isArray(value)) {
            flatAnswers[key] = value;
        } else if (value && typeof value === 'object' && 'answers' in value) {
            flatAnswers[key] = value.answers;
        }
    }

    if (!isObject(input)) {
        return { answers: flatAnswers };
    }

    return {
        ...input,
        answers: flatAnswers
    };
}

/**
 * Build updated input for request_user_input tool
 * The answers format is nested: { answers: { [id]: { answers: string[] } } }
 */
function buildRequestUserInputUpdatedInput(input: unknown, answers: unknown): Record<string, unknown> {
    if (!isObject(input)) {
        return { answers };
    }

    return {
        ...input,
        answers
    };
}

export class PermissionHandler extends BasePermissionHandler<PermissionResponse, PermissionResult> {
    private toolCalls: { id: string, name: string, input: Record<string, unknown>, used: boolean }[] = [];
    private responses = new Map<string, PermissionResponse>();
    private session: Session;
    private allowedTools = new Set<string>();
    private allowedBashLiterals = new Set<string>();
    private allowedBashPrefixes = new Set<string>();
    private permissionMode: PermissionMode = 'default';
    private onPermissionRequestCallback?: (toolCallId: string) => void;

    constructor(session: Session) {
        super(session.client);
        this.session = session;
    }
    
    /**
     * Set callback to trigger when permission request is made
     */
    setOnPermissionRequest(callback: (toolCallId: string) => void) {
        this.onPermissionRequestCallback = callback;
    }

    handleModeChange(mode: PermissionMode) {
        this.permissionMode = mode;
        this.session.setPermissionMode(mode);
    }

    /**
     * Handler response
     */
    protected async handlePermissionResponse(
        response: PermissionResponse,
        pending: PendingPermissionRequest<PermissionResult>
    ): Promise<PermissionCompletion> {
        const completion: PermissionCompletion = {
            status: response.approved ? 'approved' : 'denied',
            reason: response.reason,
            mode: response.mode,
            allowTools: response.allowTools,
            answers: response.answers
        };

        // Update allowed tools
        if (response.allowTools && response.allowTools.length > 0) {
            response.allowTools.forEach(tool => {
                if (isQuestionToolName(tool)) {
                    return;
                }
                if (tool.startsWith('Bash(') || tool === 'Bash') {
                    this.parseBashPermission(tool);
                } else {
                    this.allowedTools.add(tool);
                }
            });
        }

        // Update permission mode
        if (response.mode) {
            this.permissionMode = response.mode;
            this.session.setPermissionMode(response.mode);
        }

        // Handle ask_user_question
        if (isAskUserQuestionToolName(pending.toolName)) {
            const answers = response.answers ?? {};
            if (Object.keys(answers).length === 0) {
                pending.resolve({ behavior: 'deny', message: 'No answers were provided.' });
                completion.status = 'denied';
                completion.reason = completion.reason ?? 'No answers were provided.';
            } else {
                pending.resolve({
                    behavior: 'allow',
                    updatedInput: buildAskUserQuestionUpdatedInput(pending.input, answers)
                });
            }
            return completion;
        }

        // Handle request_user_input
        if (isRequestUserInputToolName(pending.toolName)) {
            const answers = response.answers ?? {};
            if (Object.keys(answers).length === 0) {
                pending.resolve({ behavior: 'deny', message: 'No answers were provided.' });
                completion.status = 'denied';
                completion.reason = completion.reason ?? 'No answers were provided.';
            } else {
                pending.resolve({
                    behavior: 'allow',
                    updatedInput: buildRequestUserInputUpdatedInput(pending.input, answers)
                });
            }
            return completion;
        }

        if (pending.toolName === 'exit_plan_mode' || pending.toolName === 'ExitPlanMode') {
            // Handle exit_plan_mode specially
            logger.debug('Plan mode result received', response);
            if (response.approved) {
                logger.debug('Plan approved - injecting PLAN_FAKE_RESTART');
                // Inject the approval message at the beginning of the queue
                if (response.mode && PLAN_EXIT_MODES.includes(response.mode)) {
                    this.session.queue.unshift(PLAN_FAKE_RESTART, { permissionMode: response.mode });
                } else {
                    this.session.queue.unshift(PLAN_FAKE_RESTART, { permissionMode: 'default' });
                }
                pending.resolve({ behavior: 'deny', message: PLAN_FAKE_REJECT });
            } else {
                pending.resolve({ behavior: 'deny', message: response.reason || 'Plan rejected' });
            }
            return completion;
        }

        // Handle default case for all other tools
        if (response.approved) {
            // If the user attached a message alongside their approval, queue it as follow-up input.
            if (response.message) {
                this.session.queue.push(response.message, { permissionMode: this.permissionMode });
            }
            pending.resolve({ behavior: 'allow', updatedInput: (pending.input as Record<string, unknown>) ?? {} });
        } else {
            const denyMsg = response.reason
                || response.message
                || `The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.`;
            pending.resolve({ behavior: 'deny', message: denyMsg });
        }

        return completion;
    }

    /**
     * Creates the canCallTool callback for the SDK
     */
    handleToolCall = async (toolName: string, input: Record<string, unknown>, mode: EnhancedMode, options: Parameters<CanUseTool>[2]): Promise<PermissionResult> => {
        const isQuestionTool = isQuestionToolName(toolName);

        // Check if tool is explicitly allowed
        if (!isQuestionTool && toolName === 'Bash') {
            const inputObj = input as { command?: string };
            if (inputObj?.command) {
                // Check literal matches
                if (this.allowedBashLiterals.has(inputObj.command)) {
                    return { behavior: 'allow', updatedInput: input };
                }
                // Check prefix matches
                for (const prefix of this.allowedBashPrefixes) {
                    if (inputObj.command.startsWith(prefix)) {
                        return { behavior: 'allow', updatedInput: input };
                    }
                }
            }
        } else if (!isQuestionTool && this.allowedTools.has(toolName)) {
            return { behavior: 'allow', updatedInput: input };
        }

        // Calculate descriptor
        const descriptor = getToolDescriptor(toolName);

        //
        // Handle special cases
        //

        if (!isQuestionTool && this.permissionMode === 'bypassPermissions') {
            return { behavior: 'allow', updatedInput: input };
        }

        if (!isQuestionTool && this.permissionMode === 'acceptEdits' && descriptor.edit) {
            return { behavior: 'allow', updatedInput: input };
        }

        //
        // Approval flow
        //

        let toolCallId = this.resolveToolCallId(toolName, input);
        if (!toolCallId) { // What if we got permission before tool call
            await delay(1000);
            toolCallId = this.resolveToolCallId(toolName, input);
            if (!toolCallId) {
                throw new Error(`Could not resolve tool call ID for ${toolName}`);
            }
        }
        return this.handlePermissionRequest(toolCallId, toolName, input, options.signal);
    }

    /**
     * Handles individual permission requests
     */
    private async handlePermissionRequest(
        id: string,
        toolName: string,
        input: unknown,
        signal: AbortSignal
    ): Promise<PermissionResult> {
        return new Promise<PermissionResult>((resolve, reject) => {
            // Set up abort signal handling
            const abortHandler = () => {
                this.pendingRequests.delete(id);
                reject(new Error('Permission request aborted'));
            };
            signal.addEventListener('abort', abortHandler, { once: true });

            // Store the pending request
            this.addPendingRequest(id, toolName, input, {
                resolve: (result: PermissionResult) => {
                    signal.removeEventListener('abort', abortHandler);
                    resolve(result);
                },
                reject: (error: Error) => {
                    signal.removeEventListener('abort', abortHandler);
                    reject(error);
                }
            });

            logger.debug(`Permission request sent for tool call ${id}: ${toolName}`);
        });
    }


    /**
     * Parses Bash permission strings into literal and prefix sets
     */
    private parseBashPermission(permission: string): void {
        // Ignore plain "Bash"
        if (permission === 'Bash') {
            return;
        }

        // Match Bash(command) or Bash(command:*)
        const bashPattern = /^Bash\((.+?)\)$/;
        const match = permission.match(bashPattern);
        
        if (!match) {
            return;
        }

        const command = match[1];
        
        // Check if it's a prefix pattern (ends with :*)
        if (command.endsWith(':*')) {
            const prefix = command.slice(0, -2); // Remove :*
            this.allowedBashPrefixes.add(prefix);
        } else {
            // Literal match
            this.allowedBashLiterals.add(command);
        }
    }

    /**
     * Resolves tool call ID based on tool name and input
     */
    private resolveToolCallId(name: string, args: Record<string, unknown>): string | null {
        // Search in reverse (most recent first)
        for (let i = this.toolCalls.length - 1; i >= 0; i--) {
            const call = this.toolCalls[i];
            if (call.name === name && deepEqual(call.input, args)) {
                if (call.used) {
                    return null;
                }
                // Found unused match - mark as used and return
                call.used = true;
                return call.id;
            }
        }

        return null;
    }

    /**
     * Handles messages to track tool calls
     */
    onMessage(message: SDKMessage): void {
        if (message.type === 'assistant') {
            const assistantMsg = message as SDKAssistantMessage;
            if (assistantMsg.message && assistantMsg.message.content) {
                for (const block of assistantMsg.message.content) {
                    if (block.type === 'tool_use') {
                        this.toolCalls.push({
                            id: block.id!,
                            name: block.name!,
                            input: block.input,
                            used: false
                        });
                    }
                }
            }
        }
        if (message.type === 'user') {
            const userMsg = message as SDKUserMessage;
            if (userMsg.message && userMsg.message.content && Array.isArray(userMsg.message.content)) {
                for (const block of userMsg.message.content) {
                    if (block.type === 'tool_result' && block.tool_use_id) {
                        const toolCall = this.toolCalls.find(tc => tc.id === block.tool_use_id);
                        if (toolCall && !toolCall.used) {
                            toolCall.used = true;
                        }
                    }
                }
            }
        }
    }

    /**
     * Checks if a tool call is rejected
     */
    isAborted(toolCallId: string): boolean {

        // If tool not approved, it's aborted
        if (this.responses.get(toolCallId)?.approved === false) {
            return true;
        }

        // Always abort exit_plan_mode
        const toolCall = this.toolCalls.find(tc => tc.id === toolCallId);
        if (toolCall && (toolCall.name === 'exit_plan_mode' || toolCall.name === 'ExitPlanMode')) {
            return true;
        }

        // Tool call is not aborted
        return false;
    }

    /**
     * Cancels all pending requests with interrupt:true so the agent loop halts.
     * Use when the user explicitly aborts the session.
     */
    cancelPendingWithInterrupt(reason: string): void {
        for (const [_, pending] of this.pendingRequests.entries()) {
            pending.resolve({ behavior: 'deny', message: reason, interrupt: true });
        }
        this.pendingRequests.clear();

        this.client.updateAgentState((currentState) => {
            const pendingRequests = currentState.requests || {};
            const completedRequests = { ...currentState.completedRequests };

            for (const [id, request] of Object.entries(pendingRequests)) {
                completedRequests[id] = {
                    ...request,
                    completedAt: Date.now(),
                    status: 'canceled',
                    reason,
                    decision: 'abort' as const
                };
            }

            return {
                ...currentState,
                requests: {},
                completedRequests
            };
        });
    }

    /**
     * Soft reset between turns of the same conversation.
     * Clears per-turn state (tool calls, responses) but preserves session-scoped
     * permissions (allowedTools, allowedBashLiterals, allowedBashPrefixes).
     */
    resetTurn(): void {
        this.toolCalls = [];
        this.responses.clear();

        this.cancelPendingRequests({
            completedReason: 'Turn completed',
            rejectMessage: 'Turn reset'
        });
    }

    /**
     * Full reset for a genuinely new session (e.g. after /clear).
     * Clears all state including session-scoped permissions.
     */
    reset(): void {
        this.toolCalls = [];
        this.responses.clear();
        this.allowedTools.clear();
        this.allowedBashLiterals.clear();
        this.allowedBashPrefixes.clear();

        this.cancelPendingRequests({
            completedReason: 'Session switched to local mode',
            rejectMessage: 'Session reset'
        });
    }

    /**
     * Gets the responses map (for compatibility with existing code)
     */
    getResponses(): Map<string, PermissionResponse> {
        return this.responses;
    }

    protected handleMissingPendingResponse(_response: PermissionResponse): void {
        logger.debug('Permission request not found or already resolved');
    }

    protected onResponseReceived(response: PermissionResponse): void {
        logger.debug(`Permission response: ${JSON.stringify(response)}`);
        this.responses.set(response.id, { ...response, receivedAt: Date.now() });
    }

    protected onRequestRegistered(toolCallId: string): void {
        if (this.onPermissionRequestCallback) {
            this.onPermissionRequestCallback(toolCallId);
        }
    }
}
