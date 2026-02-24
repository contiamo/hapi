/**
 * Type definitions for Claude Code SDK integration.
 * Re-exports authoritative types from @anthropic-ai/claude-agent-sdk,
 * with local extensions where HAPI adds fields.
 */

export type {
    SDKMessage,
    SDKUserMessage,
    SDKUserMessageReplay,
    SDKAssistantMessage,
    SDKSystemMessage,
    SDKResultMessage,
    SDKResultSuccess,
    SDKResultError,
    SDKPermissionDenial,
    SDKCompactBoundaryMessage,
    SDKStatusMessage,
    SDKPartialAssistantMessage,
    PermissionResult,
    PermissionMode,
    PermissionUpdate,
    PermissionUpdateDestination,
    PermissionRuleValue,
    CanUseTool,
} from '@anthropic-ai/claude-agent-sdk'

export { AbortError } from '@anthropic-ai/claude-agent-sdk'

// Re-export CanUseTool under the legacy name so existing callers keep working
export type { CanUseTool as CanCallToolCallback } from '@anthropic-ai/claude-agent-sdk'

import type {
    PermissionMode,
    PermissionUpdate,
    PermissionResult,
    CanUseTool,
    SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import type { ClaudePermissionMode } from '@hapi/protocol/types'

/**
 * Wire format of the permission control request sent from the CLI.
 * Not exported by the SDK package (internal), so defined locally.
 */
export interface CanUseToolRequest {
    subtype: 'can_use_tool'
    tool_name: string
    input: Record<string, unknown>
    permission_suggestions?: PermissionUpdate[]
    blocked_path?: string
    decision_reason?: string
    tool_use_id: string
    agent_id?: string
    description?: string
}

export interface CanUseToolControlRequest {
    type: 'control_request'
    request_id: string
    request: CanUseToolRequest
}

export interface CanUseToolControlResponse {
    type: 'control_response'
    response: {
        subtype: 'success' | 'error'
        request_id: string
        response?: PermissionResult
        error?: string
    }
}

export interface ControlCancelRequest {
    type: 'control_cancel_request'
    request_id: string
}

/** Generic control request wrapper (non-permission subtypes). */
export interface ControlRequest {
    subtype: string
}

export interface InterruptRequest extends ControlRequest {
    subtype: 'interrupt'
}

export interface SDKControlRequest {
    request_id: string
    type: 'control_request'
    request: ControlRequest
}

export interface SDKControlResponse {
    type: 'control_response'
    response: {
        request_id: string
        subtype: 'success' | 'error'
        error?: string
        response?: Record<string, unknown>
    }
}

export type ControlResponseHandler = (response: SDKControlResponse['response']) => void

/**
 * Options accepted by the local query() wrapper.
 * Uses PermissionMode from the SDK (which includes 'dontAsk').
 */
export interface QueryOptions {
    abort?: AbortSignal
    additionalDirectories?: string[]
    allowedTools?: string[]
    appendSystemPrompt?: string
    customSystemPrompt?: string
    cwd?: string
    disallowedTools?: string[]
    maxTurns?: number
    mcpServers?: Record<string, unknown>
    pathToClaudeCodeExecutable?: string
    permissionMode?: ClaudePermissionMode | PermissionMode
    continue?: boolean
    resume?: string
    model?: string
    fallbackModel?: string
    settingsPath?: string
    strictMcpConfig?: boolean
    /** @deprecated Use canUseTool instead */
    canCallTool?: CanUseTool
    canUseTool?: CanUseTool
}

export type QueryPrompt = string | AsyncIterable<SDKUserMessage>
