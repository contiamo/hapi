import { useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { SessionMetadataSummary } from '@/types/api'
import type { ChatToolCall, ToolPermission } from '@/chat/types'
import type { PermissionUpdate } from '@hapi/protocol/types'
import { usePlatform } from '@/hooks/usePlatform'
import { Spinner } from '@/components/Spinner'
import { useTranslation, type TranslationKey } from '@/lib/use-translation'

function truncatePath(path: string): string {
    const sep = path.startsWith('/home/') ? path.indexOf('/', '/home/'.length) : -1
    const shortened = sep !== -1 ? '~/' + path.slice(sep + 1) : path
    if (shortened.length <= 48) return shortened
    const parts = shortened.split('/')
    if (parts.length <= 4) return shortened
    return `${parts.slice(0, 2).join('/')}/.../${parts.slice(-2).join('/')}`
}

function formatPermissionSummary(permission: ToolPermission, t: (key: TranslationKey) => string): string {
    if (permission.status === 'pending') return t('tool.waitingForApproval')
    if (permission.status === 'canceled') return permission.reason ? `${t('tool.canceled')}: ${permission.reason}` : t('tool.canceled')

    if (permission.status === 'approved') {
        if (permission.mode === 'acceptEdits') return t('tool.approvedAllowAllEdits')
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

const MODE_LABELS: Record<string, string> = {
    acceptEdits: 'Accept Edits',
    bypassPermissions: 'Bypass Permissions',
    plan: 'Plan Mode',
    default: 'Default',
}

function destinationLabel(destination: string): string {
    return DESTINATION_LABELS[destination] ?? destination
}

function modeLabel(mode: string): string {
    return MODE_LABELS[mode] ?? mode
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
    const [loadingSaveRule, setLoadingSaveRule] = useState(false)
    const [loadingSwitchMode, setLoadingSwitchMode] = useState(false)
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

    const canAllowAllEdits = isPending && isEditTool
    const suggestions = permission.suggestions
    // A setMode suggestion means Claude wants to switch the global permission mode.
    // Render a dedicated "Switch to [mode]" button instead of the rule editor.
    const setModeSuggestion = suggestions?.find(s => s.type === 'setMode')
    const hasRuleSuggestions = suggestions?.some(s => s.type === 'addRules' || s.type === 'replaceRules' || s.type === 'removeRules')
    const canSwitchMode = isPending && !!setModeSuggestion && !hasRuleSuggestions
    const canSaveRule = isPending && !!suggestions?.length && !canSwitchMode
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
        if (!isPending || loading || loadingAllEdits || loadingSaveRule || loadingSwitchMode) return
        setLoading('allow')
        await run(() => props.api.approvePermission(props.sessionId, permission.id, { message: trimmedMessage || undefined }), 'success')
        setLoading(null)
    }

    const approveAllEdits = async () => {
        if (!isPending || loading || loadingAllEdits || loadingSaveRule || loadingSwitchMode) return
        setLoadingAllEdits(true)
        await run(() => props.api.approvePermission(props.sessionId, permission.id, { mode: 'acceptEdits', message: trimmedMessage || undefined }), 'success')
        setLoadingAllEdits(false)
    }

    const saveRule = async () => {
        if (!canSaveRule || loading || loadingAllEdits || loadingSaveRule) return
        setLoadingSaveRule(true)
        const editedSuggestions = buildEditedSuggestions()
        await run(() => props.api.approvePermission(props.sessionId, permission.id, { suggestions: editedSuggestions, message: trimmedMessage || undefined }), 'success')
        setLoadingSaveRule(false)
    }

    const switchMode = async () => {
        if (!canSwitchMode || loading || loadingAllEdits || loadingSaveRule || loadingSwitchMode) return
        setLoadingSwitchMode(true)
        await run(() => props.api.approvePermission(props.sessionId, permission.id, { suggestions: [setModeSuggestion!], message: trimmedMessage || undefined }), 'success')
        setLoadingSwitchMode(false)
    }

    const deny = async () => {
        if (!isPending || loading || loadingAllEdits || loadingSaveRule || loadingSwitchMode) return
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

    const isActing = loading !== null || loadingAllEdits || loadingSaveRule || loadingSwitchMode
    const summary = formatPermissionSummary(permission, t)

    return (
        <div className="mt-2">
            {(permission.decisionReason || permission.blockedPath) ? (
                <div className="mb-2 flex flex-col gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-2 py-1.5">
                    {permission.decisionReason ? (
                        <p className="text-xs text-[var(--app-fg)]">{permission.decisionReason}</p>
                    ) : null}
                    {permission.blockedPath ? (
                        <code className="break-all font-mono text-xs text-[var(--app-hint)]">
                            {truncatePath(permission.blockedPath)}
                        </code>
                    ) : null}
                </div>
            ) : null}

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

            {canSaveRule ? (
                <div className="mt-2 space-y-1">
                    <div className="text-xs text-[var(--app-hint)]">Rule to save:</div>
                    {suggestions!.map((s, i) => {
                        if (s.type !== 'addRules' && s.type !== 'replaceRules' && s.type !== 'removeRules') return null
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
                {canSwitchMode ? (
                    <PermissionRowButton
                        label={`Switch to ${modeLabel(setModeSuggestion!.mode)}`}
                        tone="neutral"
                        loading={loadingSwitchMode}
                        disabled={props.disabled || isActing}
                        onClick={switchMode}
                    />
                ) : null}
                {canSaveRule ? (
                    <PermissionRowButton
                        label={`Allow for ${destinationLabel(suggestions![0].destination)}`}
                        tone="neutral"
                        loading={loadingSaveRule}
                        disabled={props.disabled || isActing}
                        onClick={saveRule}
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
