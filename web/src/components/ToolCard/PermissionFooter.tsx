import { useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { SessionMetadataSummary } from '@/types/api'
import type { ChatToolCall, ToolPermission } from '@/chat/types'
import type { PermissionUpdate } from '@hapi/protocol/types'
import { usePlatform } from '@/hooks/usePlatform'
import { Spinner } from '@/components/Spinner'
import { useTranslation, type TranslationKey } from '@/lib/use-translation'

function formatPermissionSummary(permission: ToolPermission, t: (key: TranslationKey) => string): string {
    if (permission.status === 'pending') return t('tool.waitingForApproval')
    if (permission.status === 'canceled') return permission.reason ? `${t('tool.canceled')}: ${permission.reason}` : t('tool.canceled')

    if (permission.status === 'approved') {
        if (permission.mode === 'acceptEdits') return t('tool.approvedAllowAllEdits')
        if (permission.decision === 'approved_for_session') return t('tool.approvedForSession')
        return t('tool.approved')
    }

    if (permission.status === 'denied') {
        return permission.reason ? `${t('tool.deny')}: ${permission.reason}` : t('tool.deny')
    }

    return t('tool.allow')
}

const DESTINATION_LABELS: Record<string, string> = {
    session: 'this session',
    localSettings: 'this project (local)',
    projectSettings: 'this project',
    userSettings: 'all projects',
}

function formatSuggestionLabel(suggestion: PermissionUpdate): string {
    if (suggestion.type === 'setMode') return `Mode: ${suggestion.mode}`
    if (suggestion.type === 'addDirectories' || suggestion.type === 'removeDirectories') return suggestion.directories.join(', ')
    return ''
}

function destinationLabel(destination: string): string {
    return DESTINATION_LABELS[destination] ?? destination
}

function PermissionRowButton(props: {
    label: string
    tone: 'allow' | 'deny' | 'neutral'
    loading?: boolean
    disabled: boolean
    onClick: () => void
}) {
    const base = 'flex w-full items-center justify-between rounded-md px-2 py-2 text-sm text-left transition-colors disabled:pointer-events-none disabled:opacity-50 hover:bg-[var(--app-subtle-bg)]'
    const tone = props.tone === 'allow'
        ? 'text-emerald-600'
        : props.tone === 'deny'
            ? 'text-red-600'
            : 'text-[var(--app-link)]'

    return (
        <button
            type="button"
            className={`${base} ${tone}`}
            disabled={props.disabled}
            aria-busy={props.loading === true}
            onClick={props.onClick}
        >
            <span className="flex-1">{props.label}</span>
            {props.loading ? (
                <span className="ml-2 shrink-0">
                    <Spinner size="sm" label={null} className="text-current" />
                </span>
            ) : null}
        </button>
    )
}

export function PermissionFooter(props: {
    api: ApiClient
    sessionId: string
    metadata: SessionMetadataSummary | null
    tool: ChatToolCall
    disabled: boolean
    onDone: () => void
}) {
    const { t } = useTranslation()
    const { haptic } = usePlatform()
    const permission = props.tool.permission
    const [loading, setLoading] = useState<'allow' | 'deny' | null>(null)
    const [loadingAllEdits, setLoadingAllEdits] = useState(false)
    const [loadingForSession, setLoadingForSession] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState('')
    // Editable rule content for each suggestion (keyed by index)
    const [editedRules, setEditedRules] = useState<Record<number, string>>({})

    if (!permission) return null

    const isPending = permission.status === 'pending'

    const run = async (action: () => Promise<void>, hapticType: 'success' | 'error') => {
        if (props.disabled) return
        setError(null)
        try {
            await action()
            haptic.notification(hapticType)
            props.onDone()
        } catch (e) {
            haptic.notification('error')
            setError(e instanceof Error ? e.message : t('tool.requestFailed'))
        }
    }

    const toolName = props.tool.name
    const isEditTool = toolName === 'Edit'
        || toolName === 'MultiEdit'
        || toolName === 'Write'
        || toolName === 'NotebookEdit'
    const hideAllowForSession = toolName === 'Edit'
        || toolName === 'MultiEdit'
        || toolName === 'Write'
        || toolName === 'NotebookEdit'
        || toolName === 'exit_plan_mode'
        || toolName === 'ExitPlanMode'

    const canAllowForSession = isPending && !hideAllowForSession
    const canAllowAllEdits = isPending && isEditTool
    const trimmedMessage = message.trim()

    // Build the (possibly edited) suggestions to send back
    const buildEditedSuggestions = (): PermissionUpdate[] | undefined => {
        const suggestions = permission.suggestions
        if (!suggestions?.length) return undefined
        return suggestions.map((s, i) => {
            if (s.type !== 'addRules' && s.type !== 'replaceRules' && s.type !== 'removeRules') return s
            const edited = editedRules[i]
            if (edited === undefined) return s
            // The UI shows one input for rules[0]; only update that entry
            return {
                ...s,
                rules: s.rules.map((r, j) => j === 0 ? { ...r, ruleContent: edited } : r)
            }
        })
    }

    const approve = async () => {
        if (!isPending || loading || loadingAllEdits || loadingForSession) return
        setLoading('allow')
        await run(() => props.api.approvePermission(props.sessionId, permission.id, { message: trimmedMessage || undefined }), 'success')
        setLoading(null)
    }

    const approveAllEdits = async () => {
        if (!isPending || loading || loadingAllEdits || loadingForSession) return
        setLoadingAllEdits(true)
        await run(() => props.api.approvePermission(props.sessionId, permission.id, { mode: 'acceptEdits', message: trimmedMessage || undefined }), 'success')
        setLoadingAllEdits(false)
    }

    const approveForSession = async () => {
        if (!canAllowForSession || loading || loadingAllEdits || loadingForSession) return
        setLoadingForSession(true)
        const suggestions = buildEditedSuggestions()
        await run(() => props.api.approvePermission(props.sessionId, permission.id, { suggestions, decision: 'approved_for_session', message: trimmedMessage || undefined }), 'success')
        setLoadingForSession(false)
    }

    const deny = async () => {
        if (!isPending || loading || loadingAllEdits || loadingForSession) return
        setLoading('deny')
        await run(() => props.api.denyPermission(props.sessionId, permission.id, { reason: trimmedMessage || undefined }), 'success')
        setLoading(null)
    }

    if (!isPending) {
        // Keep the thread minimal: approval is already reflected by tool state/icon.
        // Only surface a short message when the permission was denied/canceled and we have a reason.
        if (permission.status !== 'denied' && permission.status !== 'canceled') return null
        if (!permission.reason) return null

        return (
            <div className="mt-2 text-xs text-red-600">
                {permission.reason}
            </div>
        )
    }

    const isActing = loading !== null || loadingAllEdits || loadingForSession
    const suggestions = permission.suggestions
    const summary = formatPermissionSummary(permission, t)

    return (
        <div className="mt-2">
            <div className="text-xs text-[var(--app-hint)]">{summary}</div>

            {error ? (
                <div className="mt-2 text-xs text-red-600">
                    {error}
                </div>
            ) : null}

            <textarea
                className="mt-2 w-full resize-none rounded-md border border-[var(--app-border)] bg-transparent px-2 py-1.5 text-sm placeholder:text-[var(--app-hint)] focus:outline-none focus:ring-1 focus:ring-[var(--app-border)] disabled:opacity-50"
                rows={2}
                placeholder={t('tool.messageHint')}
                aria-label={t('tool.messageHint')}
                value={message}
                disabled={props.disabled || isActing}
                onChange={(e) => setMessage(e.target.value)}
            />

            {canAllowForSession && suggestions?.length ? (
                <div className="mt-2 space-y-1">
                    <div className="text-xs text-[var(--app-hint)]">Rule to save:</div>
                    {suggestions.map((s, i) => {
                        if (s.type !== 'addRules' && s.type !== 'replaceRules' && s.type !== 'removeRules') {
                            return (
                                <div key={i} className="flex items-center gap-2 rounded-md border border-[var(--app-border)] px-2 py-1.5">
                                    <span className="flex-1 text-sm font-mono">{formatSuggestionLabel(s)}</span>
                                    <span className="text-xs text-[var(--app-hint)]">{destinationLabel(s.destination)}</span>
                                </div>
                            )
                        }
                        const ruleContent = editedRules[i] ?? (s.rules[0]?.ruleContent ?? '')
                        return (
                            <div key={i} className="flex items-center gap-2 rounded-md border border-[var(--app-border)] px-2 py-1">
                                <span className="shrink-0 text-sm font-mono">{s.rules[0]?.toolName ?? s.type}(</span>
                                <input
                                    type="text"
                                    className="min-w-0 flex-1 bg-transparent text-sm font-mono focus:outline-none disabled:opacity-50"
                                    value={ruleContent}
                                    disabled={props.disabled || isActing}
                                    onChange={(e) => setEditedRules(prev => ({ ...prev, [i]: e.target.value }))}
                                    aria-label="Rule pattern"
                                />
                                <span className="shrink-0 text-sm font-mono">)</span>
                                <span className="shrink-0 text-xs text-[var(--app-hint)]">{destinationLabel(s.destination)}</span>
                            </div>
                        )
                    })}
                </div>
            ) : null}

            <div className="mt-1 flex flex-col gap-1">
                <PermissionRowButton
                    label={t('tool.allow')}
                    tone="allow"
                    loading={loading === 'allow'}
                    disabled={props.disabled || isActing}
                    onClick={approve}
                />
                {canAllowForSession ? (
                    <PermissionRowButton
                        label={t('tool.allowForSession')}
                        tone="neutral"
                        loading={loadingForSession}
                        disabled={props.disabled || isActing}
                        onClick={approveForSession}
                    />
                ) : null}
                {canAllowAllEdits ? (
                    <PermissionRowButton
                        label={t('tool.allowAll')}
                        tone="neutral"
                        loading={loadingAllEdits}
                        disabled={props.disabled || isActing}
                        onClick={approveAllEdits}
                    />
                ) : null}
                <PermissionRowButton
                    label={t('tool.deny')}
                    tone="deny"
                    loading={loading === 'deny'}
                    disabled={props.disabled || isActing}
                    onClick={deny}
                />
            </div>
        </div>
    )
}
