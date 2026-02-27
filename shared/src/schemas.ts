import { z } from 'zod'
import { MODEL_MODES, CLAUDE_PERMISSION_MODES } from './modes'

export const PermissionModeSchema = z.enum(CLAUDE_PERMISSION_MODES)
export const ModelModeSchema = z.enum(MODEL_MODES)

const MetadataSummarySchema = z.object({
    text: z.string(),
    updatedAt: z.number()
})

export const WorktreeMetadataSchema = z.object({
    basePath: z.string(),
    branch: z.string(),
    name: z.string(),
    worktreePath: z.string().optional(),
    createdAt: z.number().optional()
})

export type WorktreeMetadata = z.infer<typeof WorktreeMetadataSchema>

export const SlashCommandSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    source: z.enum(['builtin', 'user', 'claude']),
    content: z.string().optional()
})

export type SlashCommand = z.infer<typeof SlashCommandSchema>

export const SlashCommandsResponseSchema = z.object({
    success: z.boolean(),
    loading: z.boolean().optional(),
    commands: z.array(SlashCommandSchema).optional(),
    error: z.string().optional()
})

export type SlashCommandsResponse = z.infer<typeof SlashCommandsResponseSchema>

export const MetadataSchema = z.object({
    path: z.string(),
    host: z.string(),
    version: z.string().optional(),
    name: z.string().optional(),
    os: z.string().optional(),
    summary: MetadataSummarySchema.optional(),
    machineId: z.string().optional(),
    claudeSessionId: z.string().optional(),
    tools: z.array(z.string()).optional(),
    slashCommands: z.preprocess(
        (val) => {
            if (!Array.isArray(val)) return val
            return val.map(item => typeof item === 'string' ? { name: item, source: 'claude' } : item)
        },
        z.array(SlashCommandSchema)
    ).optional(),
    homeDir: z.string().optional(),
    happyHomeDir: z.string().optional(),
    happyLibDir: z.string().optional(),
    happyToolsDir: z.string().optional(),
    startedFromRunner: z.boolean().optional(),
    hostPid: z.number().optional(),
    startedBy: z.enum(['runner', 'terminal']).optional(),
    lifecycleState: z.string().optional(),
    lifecycleStateSince: z.number().optional(),
    archivedBy: z.string().optional(),
    archiveReason: z.string().optional(),
    flavor: z.string().nullish(),
    worktree: WorktreeMetadataSchema.optional(),
    shouldFork: z.boolean().optional(),
    yolo: z.boolean().optional(),
    shouldEnableYolo: z.boolean().optional()
})

export type Metadata = z.infer<typeof MetadataSchema>

const PermissionRuleValueSchema = z.object({
    toolName: z.string(),
    ruleContent: z.string().optional()
})

export const PermissionUpdateSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('addRules'), rules: z.array(PermissionRuleValueSchema), behavior: z.enum(['allow', 'deny', 'ask']), destination: z.string() }),
    z.object({ type: z.literal('replaceRules'), rules: z.array(PermissionRuleValueSchema), behavior: z.enum(['allow', 'deny', 'ask']), destination: z.string() }),
    z.object({ type: z.literal('removeRules'), rules: z.array(PermissionRuleValueSchema), behavior: z.enum(['allow', 'deny', 'ask']), destination: z.string() }),
    z.object({ type: z.literal('setMode'), mode: z.string(), destination: z.string() }),
    z.object({ type: z.literal('addDirectories'), directories: z.array(z.string()), destination: z.string() }),
    z.object({ type: z.literal('removeDirectories'), directories: z.array(z.string()), destination: z.string() }),
])

export type PermissionUpdate = z.infer<typeof PermissionUpdateSchema>

export const AgentStateRequestSchema = z.object({
    tool: z.string(),
    arguments: z.unknown(),
    createdAt: z.number().nullish(),
    suggestions: z.array(PermissionUpdateSchema).optional(),
    blockedPath: z.string().optional(),
    decisionReason: z.string().optional(),
    agentID: z.string().optional()
})

export type AgentStateRequest = z.infer<typeof AgentStateRequestSchema>

export const AgentStateCompletedRequestSchema = z.object({
    tool: z.string(),
    arguments: z.unknown(),
    createdAt: z.number().nullish(),
    completedAt: z.number().nullish(),
    status: z.enum(['canceled', 'denied', 'approved']),
    reason: z.string().optional(),
    mode: z.string().optional(),
    decision: z.enum(['approved', 'denied', 'abort']).optional(),
    // Flat format: Record<string, string[]> (AskUserQuestion)
    // Nested format: Record<string, { answers: string[] }> (request_user_input)
    answers: z.union([
        z.record(z.string(), z.array(z.string())),
        z.record(z.string(), z.object({ answers: z.array(z.string()) }))
    ]).optional(),
    blockedPath: z.string().optional(),
    decisionReason: z.string().optional(),
    agentID: z.string().optional()
})

export type AgentStateCompletedRequest = z.infer<typeof AgentStateCompletedRequestSchema>

export const AgentStateSchema = z.object({
    controlledByUser: z.boolean().nullish(),
    requests: z.record(z.string(), AgentStateRequestSchema).nullish(),
    completedRequests: z.record(z.string(), AgentStateCompletedRequestSchema).nullish()
})

export type AgentState = z.infer<typeof AgentStateSchema>

export const TodoItemSchema = z.object({
    content: z.string(),
    status: z.enum(['pending', 'in_progress', 'completed']),
    priority: z.enum(['high', 'medium', 'low']),
    id: z.string()
})

export type TodoItem = z.infer<typeof TodoItemSchema>

export const TodosSchema = z.array(TodoItemSchema)

export const AttachmentMetadataSchema = z.object({
    id: z.string(),
    filename: z.string(),
    mimeType: z.string(),
    size: z.number(),
    path: z.string(),
    previewUrl: z.string().optional()
})

export type AttachmentMetadata = z.infer<typeof AttachmentMetadataSchema>

export const DecryptedMessageSchema = z.object({
    id: z.string(),
    seq: z.number().nullable(),
    localId: z.string().nullable(),
    content: z.unknown(),
    createdAt: z.number()
})

export type DecryptedMessage = z.infer<typeof DecryptedMessageSchema>

export const SessionSchema = z.object({
    id: z.string(),
    namespace: z.string(),
    seq: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
    active: z.boolean(),
    activeAt: z.number(),
    metadata: MetadataSchema.nullable(),
    metadataVersion: z.number(),
    agentState: AgentStateSchema.nullable(),
    agentStateVersion: z.number(),
    thinking: z.boolean(),
    thinkingAt: z.number(),
    todos: TodosSchema.optional(),
    permissionMode: PermissionModeSchema.optional(),
    modelMode: ModelModeSchema.optional()
})

export type Session = z.infer<typeof SessionSchema>

const SessionEventBaseSchema = z.object({
    namespace: z.string().optional()
})

const SessionChangedSchema = SessionEventBaseSchema.extend({
    sessionId: z.string()
})

const MachineChangedSchema = SessionEventBaseSchema.extend({
    machineId: z.string()
})

export const SyncEventSchema = z.discriminatedUnion('type', [
    SessionChangedSchema.extend({
        type: z.literal('session-added'),
        data: z.unknown().optional()
    }),
    SessionChangedSchema.extend({
        type: z.literal('session-updated'),
        data: z.unknown().optional()
    }),
    SessionEventBaseSchema.extend({
        type: z.literal('session-removed'),
        sessionId: z.string()
    }),
    SessionChangedSchema.extend({
        type: z.literal('message-received'),
        message: DecryptedMessageSchema
    }),
    MachineChangedSchema.extend({
        type: z.literal('machine-updated'),
        data: z.unknown().optional()
    }),
    SessionEventBaseSchema.extend({
        type: z.literal('toast'),
        data: z.object({
            title: z.string(),
            body: z.string(),
            sessionId: z.string(),
            url: z.string()
        })
    }),
    SessionEventBaseSchema.extend({
        type: z.literal('connection-changed'),
        data: z.object({
            status: z.string(),
            subscriptionId: z.string().optional()
        }).optional()
    }),
    SessionChangedSchema.extend({
        type: z.literal('message-queued'),
        queueId: z.string()
    }),
    SessionChangedSchema.extend({
        type: z.literal('message-processing'),
        queueId: z.string()
    }),
    SessionChangedSchema.extend({
        type: z.literal('message-queue-completed'),
        queueId: z.string()
    }),
    SessionChangedSchema.extend({
        type: z.literal('message-queue-failed'),
        queueId: z.string(),
        error: z.string()
    }),
    SessionChangedSchema.extend({
        type: z.literal('message-queue-cancelled'),
        queueId: z.string()
    }),
    SessionChangedSchema.extend({
        type: z.literal('messages-cleared')
    })
])

export type SyncEvent = z.infer<typeof SyncEventSchema>
