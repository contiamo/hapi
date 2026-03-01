/**
 * Claude Code SDK integration for HAPI CLI
 * Provides clean TypeScript implementation without Bun support
 */

export { query } from './query'
export { AbortError } from './types'
export type {
    QueryOptions,
    QueryPrompt,
    ControlRequest,
    InterruptRequest,
    SDKControlRequest,
    SDKControlResponse,
    ControlResponseHandler,
    CanUseToolRequest,
    CanUseToolControlRequest,
    CanUseToolControlResponse,
    ControlCancelRequest,
} from './types'

// Re-export SDK message types and permission types directly from the SDK package
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
    McpServerConfig,
} from '@anthropic-ai/claude-agent-sdk'
