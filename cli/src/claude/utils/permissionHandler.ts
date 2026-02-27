/**
 * Permission Handler for canCallTool integration
 *
 * Replaces the MCP permission server with direct SDK integration.
 * Handles tool permission requests, responses, and state management.
 */

import { logger } from "@/lib";
import type { CanUseTool, PermissionResult, PermissionUpdate } from "@anthropic-ai/claude-agent-sdk";
import { PLAN_FAKE_REJECT, PLAN_FAKE_RESTART } from "../sdk/prompts";
import { Session } from "../session";
import { EnhancedMode, PermissionMode } from "../loop";
import { getToolDescriptor } from "./getToolDescriptor";
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
    suggestions?: PermissionUpdate[];
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
    // Maps toolUseID → toolName for use by isAborted().
    // Populated in handleToolCall at callback time when the SDK provides both.
    private activeToolNames = new Map<string, string>();
    private responses = new Map<string, PermissionResponse>();
    private session: Session;
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

    setPermissionMode(mode: PermissionMode) {
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
            answers: response.answers
        };

        // Update permission mode
        if (response.mode) {
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
            // We use only permissionMode here; model/fallback inherit from the queue consumer's
            // current mode rather than being explicitly forwarded.
            if (response.message) {
                this.session.queue.push(response.message, { permissionMode: (this.session.getPermissionMode() ?? 'default') });
            }

            // Build updatedPermissions: if the user confirmed suggestions (possibly edited),
            // return them so the SDK records the rule and won't ask again.
            // For plain approve (no suggestions), no update needed.
            const updatedPermissions = response.suggestions?.length
                ? response.suggestions
                : undefined;

            pending.resolve({
                behavior: 'allow',
                updatedInput: pending.input as Record<string, unknown>,
                updatedPermissions
            });
        } else {
            // If the user typed a message alongside deny, queue it as a follow-up user turn
            // so Claude responds to the feedback rather than just stopping.
            if (response.reason) {
                this.session.queue.push(response.reason, { permissionMode: (this.session.getPermissionMode() ?? 'default') });
            }
            pending.resolve({ behavior: 'deny', message: `The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.` });
        }

        return completion;
    }

    /**
     * Creates the canCallTool callback for the SDK
     */
    handleToolCall = async (toolName: string, input: Record<string, unknown>, _mode: EnhancedMode, options: Parameters<CanUseTool>[2]): Promise<PermissionResult> => {
        const isQuestionTool = isQuestionToolName(toolName);

        // Calculate descriptor
        const descriptor = getToolDescriptor(toolName);

        //
        // Handle special cases
        //

        if (!isQuestionTool && (this.session.getPermissionMode() ?? 'default') === 'bypassPermissions') {
            return { behavior: 'allow', updatedInput: input };
        }

        if (!isQuestionTool && (this.session.getPermissionMode() ?? 'default') === 'acceptEdits' && descriptor.edit) {
            return { behavior: 'allow', updatedInput: input };
        }

        //
        // Approval flow
        //

        // The SDK provides toolUseID directly — unique per call, guaranteed present.
        // We record the name here so isAborted() can check it later from tool_result blocks
        // in user messages where only the ID is available.
        const toolCallId = options.toolUseID;
        this.activeToolNames.set(toolCallId, toolName);

        if (options.agentID) {
            logger.debug(`[permission] Request from sub-agent ${options.agentID}: ${toolName} (${toolCallId})`);
        }

        return this.handlePermissionRequest(toolCallId, toolName, input, options.signal, options.suggestions);
    }

    /**
     * Handles individual permission requests
     */
    private async handlePermissionRequest(
        id: string,
        toolName: string,
        input: unknown,
        signal: AbortSignal,
        suggestions?: PermissionUpdate[]
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
            }, suggestions);

            logger.debug(`Permission request sent for tool call ${id}: ${toolName}`);
        });
    }

    /**
     * Checks if a tool call is aborted (denied or always-abort tool).
     * Called from claudeRemote when a tool_result arrives in a user message.
     */
    isAborted(toolCallId: string): boolean {
        if (this.responses.get(toolCallId)?.approved === false) {
            return true;
        }

        // exit_plan_mode is always aborted — the plan handler resolves it with deny
        // so the SDK loop exits cleanly, but we still need to signal abort here.
        const name = this.activeToolNames.get(toolCallId);
        if (name === 'exit_plan_mode' || name === 'ExitPlanMode') {
            return true;
        }

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
     * Reset between turns of the same conversation.
     * Clears per-turn state (active tool names, responses).
     * Session-scoped permissions are tracked by the SDK via updatedPermissions.
     *
     * No pending requests should exist at turn boundaries (claudeRemote has
     * already completed), so we do not cancel them here.
     */
    resetTurn(): void {
        this.activeToolNames.clear();
        this.responses.clear();
    }

    /**
     * Full reset for a genuinely new session (e.g. after /clear).
     */
    reset(): void {
        this.activeToolNames.clear();
        this.responses.clear();

        this.cancelPendingRequests({
            completedReason: 'Session reset',
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
