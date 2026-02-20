import { useEffect, useMemo, useState } from 'react'
import type { SessionSummary } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { useLongPress } from '@/hooks/useLongPress'
import { usePlatform } from '@/hooks/usePlatform'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { RenameSessionDialog } from '@/components/RenameSessionDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useTranslation, type TranslationKey } from '@/lib/use-translation'
import { useSimpleToast } from '@/lib/simple-toast'

export type ViewMode = 'active' | 'by-project'

type SessionGroup = {
    directory: string
    displayName: string
    sessions: SessionSummary[]
    latestUpdatedAt: number
    hasActiveSession: boolean
}

function getGroupDisplayName(directory: string): string {
    if (directory === 'Other') return directory
    const parts = directory.split(/[\\/]+/).filter(Boolean)
    if (parts.length === 0) return directory
    if (parts.length === 1) return parts[0]
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
}

function groupSessionsByDirectory(sessions: SessionSummary[]): SessionGroup[] {
    const groups = new Map<string, SessionSummary[]>()

    sessions.forEach(session => {
        const path = session.metadata?.worktree?.basePath ?? session.metadata?.path ?? 'Other'
        if (!groups.has(path)) {
            groups.set(path, [])
        }
        groups.get(path)!.push(session)
    })

    return Array.from(groups.entries())
        .map(([directory, groupSessions]) => {
            const sortedSessions = [...groupSessions].sort((a, b) => {
                const rankA = a.active ? (a.pendingRequestsCount > 0 ? 0 : 1) : 2
                const rankB = b.active ? (b.pendingRequestsCount > 0 ? 0 : 1) : 2
                if (rankA !== rankB) return rankA - rankB
                return b.updatedAt - a.updatedAt
            })
            const latestUpdatedAt = groupSessions.reduce(
                (max, s) => (s.updatedAt > max ? s.updatedAt : max),
                -Infinity
            )
            const hasActiveSession = groupSessions.some(s => s.active)
            const displayName = getGroupDisplayName(directory)

            return { directory, displayName, sessions: sortedSessions, latestUpdatedAt, hasActiveSession }
        })
        .sort((a, b) => {
            if (a.hasActiveSession !== b.hasActiveSession) {
                return a.hasActiveSession ? -1 : 1
            }
            return b.latestUpdatedAt - a.latestUpdatedAt
        })
}

function groupSessionsByActivity(sessions: SessionSummary[]): SessionGroup[] {
    const active = sessions.filter(s => s.active)
    const inactive = sessions.filter(s => !s.active)

    const groups: SessionGroup[] = []

    if (active.length > 0) {
        const sortedActive = [...active].sort((a, b) => {
            const rankA = a.pendingRequestsCount > 0 ? 0 : (a.thinking ? 1 : 2)
            const rankB = b.pendingRequestsCount > 0 ? 0 : (b.thinking ? 1 : 2)
            if (rankA !== rankB) return rankA - rankB
            return b.updatedAt - a.updatedAt
        })
        groups.push({
            directory: '__active__',
            displayName: '__active__',
            sessions: sortedActive,
            latestUpdatedAt: active.reduce((max, s) => (s.updatedAt > max ? s.updatedAt : max), -Infinity),
            hasActiveSession: true,
        })
    }

    if (inactive.length > 0) {
        const sortedInactive = [...inactive].sort((a, b) => b.updatedAt - a.updatedAt)
        groups.push({
            directory: '__inactive__',
            displayName: '__inactive__',
            sessions: sortedInactive,
            latestUpdatedAt: inactive.reduce((max, s) => (s.updatedAt > max ? s.updatedAt : max), -Infinity),
            hasActiveSession: false,
        })
    }

    return groups
}

function PlusIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    )
}

function BulbIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M12 2a7 7 0 0 0-4 12c.6.6 1 1.2 1 2h6c0-.8.4-1.4 1-2a7 7 0 0 0-4-12Z" />
        </svg>
    )
}

function ChevronIcon(props: { className?: string; collapsed?: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`${props.className ?? ''} transition-transform duration-200 ${props.collapsed ? '' : 'rotate-90'}`}
        >
            <polyline points="9 18 15 12 9 6" />
        </svg>
    )
}

function CheckSquareIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
    )
}

function XIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    )
}

function ArchiveIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <rect width="20" height="5" x="2" y="3" rx="1" />
            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
            <path d="M10 12h4" />
        </svg>
    )
}

function getSessionTitle(session: SessionSummary): string {
    if (session.metadata?.name) {
        return session.metadata.name
    }
    if (session.metadata?.summary?.text) {
        return session.metadata.summary.text
    }
    if (session.metadata?.path) {
        const parts = session.metadata.path.split('/').filter(Boolean)
        return parts.length > 0 ? parts[parts.length - 1] : session.id.slice(0, 8)
    }
    return session.id.slice(0, 8)
}

function getTodoProgress(session: SessionSummary): { completed: number; total: number } | null {
    if (!session.todoProgress) return null
    if (session.todoProgress.completed === session.todoProgress.total) return null
    return session.todoProgress
}

function getAgentLabel(session: SessionSummary): string {
    const flavor = session.metadata?.flavor?.trim()
    if (flavor) return flavor
    return 'unknown'
}

function formatRelativeTime(value: number, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string | null {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value
    if (!Number.isFinite(ms)) return null
    const delta = Date.now() - ms
    if (delta < 60_000) return t('session.time.justNow')
    const minutes = Math.floor(delta / 60_000)
    if (minutes < 60) return t('session.time.minutesAgo', { n: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('session.time.hoursAgo', { n: hours })
    const days = Math.floor(hours / 24)
    if (days < 7) return t('session.time.daysAgo', { n: days })
    return new Date(ms).toLocaleDateString()
}

function SessionItem(props: {
    session: SessionSummary
    onSelect: (sessionId: string) => void
    showPath?: boolean
    api: ApiClient | null
    selectionMode?: boolean
    isSelected?: boolean
    onToggleSelection?: (sessionId: string) => void
}) {
    const { t } = useTranslation()
    const { session: s, onSelect, showPath = true, api, selectionMode = false, isSelected = false, onToggleSelection } = props
    const { haptic } = usePlatform()
    const toast = useSimpleToast()
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuAnchorPoint, setMenuAnchorPoint] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
    const [renameOpen, setRenameOpen] = useState(false)
    const [archiveOpen, setArchiveOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)

    const { archiveSession, renameSession, deleteSession, resumeSession, isPending } = useSessionActions(
        api,
        s.id,
        s.metadata?.flavor ?? null
    )

    const handleResume = async () => {
        try {
            await resumeSession()
            // On success, user will be navigated to the session
        } catch (error) {
            // Error already toasted by useSessionActions
            // Keep menu open so user can retry
        }
    }

    const longPressHandlers = useLongPress({
        onLongPress: (point) => {
            if (!selectionMode) {
                haptic.impact('medium')
                setMenuAnchorPoint(point)
                setMenuOpen(true)
            }
        },
        onClick: () => {
            if (selectionMode && onToggleSelection) {
                onToggleSelection(s.id)
            } else if (!menuOpen) {
                onSelect(s.id)
            }
        },
        threshold: 500
    })

    const sessionName = getSessionTitle(s)
    const statusDotClass = s.active
        ? (s.thinking ? 'bg-[#007AFF]' : 'bg-[var(--app-badge-success-text)]')
        : 'bg-[var(--app-hint)]'
    return (
        <>
            <button
                type="button"
                {...longPressHandlers}
                className={`session-list-item flex w-full flex-col gap-2 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)] select-none ${isSelected ? 'bg-[var(--app-subtle-bg)]' : ''}`}
                style={{ WebkitTouchCallout: 'none' }}
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        {selectionMode ? (
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => onToggleSelection?.(s.id)}
                                className="h-4 w-4 rounded border-[var(--app-border)] text-[var(--app-link)] focus:ring-2 focus:ring-[var(--app-link)] focus:ring-offset-0"
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
                                <span
                                    className={`h-2.5 w-2.5 rounded-full ${statusDotClass}`}
                                />
                            </span>
                        )}
                        <div className="truncate text-sm font-medium">
                            {sessionName}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs">
                        {s.thinking ? (
                            <span className="text-[#007AFF] animate-pulse">
                                {t('session.item.thinking')}
                            </span>
                        ) : null}
                        {(() => {
                            const progress = getTodoProgress(s)
                            if (!progress) return null
                            return (
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <BulbIcon className="h-3 w-3" />
                                    {progress.completed}/{progress.total}
                                </span>
                            )
                        })()}
                        {s.pendingRequestsCount > 0 ? (
                            <span className="text-[var(--app-badge-warning-text)]">
                                {t('session.item.pending')} {s.pendingRequestsCount}
                            </span>
                        ) : null}
                        <span className="text-[var(--app-hint)]">
                            {formatRelativeTime(s.updatedAt, t)}
                        </span>
                    </div>
                </div>
                {showPath ? (
                    <div className="truncate text-xs text-[var(--app-hint)]">
                        {s.metadata?.path ?? s.id}
                    </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--app-hint)]">
                    <span className="inline-flex items-center gap-2">
                        <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
                            ❖
                        </span>
                        {getAgentLabel(s)}
                    </span>
                    <span>{t('session.item.modelMode')}: {s.modelMode || 'default'}</span>
                    {s.metadata?.worktree?.branch ? (
                        <span>{t('session.item.worktree')}: {s.metadata.worktree.branch}</span>
                    ) : null}
                </div>
            </button>

            <SessionActionMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                sessionActive={s.active}
                onRename={() => setRenameOpen(true)}
                onArchive={() => setArchiveOpen(true)}
                onDelete={() => setDeleteOpen(true)}
                onResume={!s.active ? () => void handleResume() : undefined}
                anchorPoint={menuAnchorPoint}
            />

            <RenameSessionDialog
                isOpen={renameOpen}
                onClose={() => setRenameOpen(false)}
                currentName={sessionName}
                onRename={renameSession}
                isPending={isPending}
            />

            <ConfirmDialog
                isOpen={archiveOpen}
                onClose={() => setArchiveOpen(false)}
                title={t('dialog.archive.title')}
                description={t('dialog.archive.description', { name: sessionName })}
                confirmLabel={t('dialog.archive.confirm')}
                confirmingLabel={t('dialog.archive.confirming')}
                onConfirm={archiveSession}
                isPending={isPending}
                destructive
            />

            <ConfirmDialog
                isOpen={deleteOpen}
                onClose={() => setDeleteOpen(false)}
                title={t('dialog.delete.title')}
                description={t('dialog.delete.description', { name: sessionName })}
                confirmLabel={t('dialog.delete.confirm')}
                confirmingLabel={t('dialog.delete.confirming')}
                onConfirm={deleteSession}
                isPending={isPending}
                destructive
            />
        </>
    )
}

export function SessionList(props: {
    sessions: SessionSummary[]
    onSelect: (sessionId: string) => void
    onNewSession: () => void
    onRefresh: () => void
    isLoading: boolean
    renderHeader?: boolean
    api: ApiClient | null
    viewMode?: ViewMode
}) {
    const { t } = useTranslation()
    const { renderHeader = true, api } = props
    const toast = useSimpleToast()

    const [internalViewMode, setInternalViewMode] = useState<ViewMode>(() => {
        const saved = localStorage.getItem('hapi-session-view')
        return saved === 'by-project' ? 'by-project' : 'active'
    })
    const viewMode = props.viewMode ?? internalViewMode

    const [collapseOverrides, setCollapseOverrides] = useState<Map<string, boolean>>(
        () => new Map()
    )
    const [selectionMode, setSelectionMode] = useState(false)
    const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
    const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false)
    const [isBulkArchiving, setIsBulkArchiving] = useState(false)
    const [bulkArchiveError, setBulkArchiveError] = useState<string | null>(null)

    const groups = useMemo(
        () => viewMode === 'active'
            ? groupSessionsByActivity(props.sessions)
            : groupSessionsByDirectory(props.sessions),
        [props.sessions, viewMode]
    )

    const handleSetViewMode = (mode: ViewMode) => {
        setInternalViewMode(mode)
        setCollapseOverrides(new Map())
        localStorage.setItem('hapi-session-view', mode)
    }

    const isGroupCollapsed = (group: SessionGroup): boolean => {
        const override = collapseOverrides.get(group.directory)
        if (override !== undefined) return override
        return !group.hasActiveSession
    }

    const toggleGroup = (directory: string, isCollapsed: boolean) => {
        setCollapseOverrides(prev => {
            const next = new Map(prev)
            next.set(directory, !isCollapsed)
            return next
        })
    }

    const toggleSelectionMode = () => {
        setSelectionMode(prev => !prev)
        setSelectedSessions(new Set())
    }

    const toggleSessionSelection = (sessionId: string) => {
        setSelectedSessions(prev => {
            const next = new Set(prev)
            if (next.has(sessionId)) {
                next.delete(sessionId)
            } else {
                next.add(sessionId)
            }
            return next
        })
    }

    useEffect(() => {
        setCollapseOverrides(prev => {
            if (prev.size === 0) return prev
            const next = new Map(prev)
            const knownGroups = new Set(groups.map(group => group.directory))
            let changed = false
            for (const directory of next.keys()) {
                if (!knownGroups.has(directory)) {
                    next.delete(directory)
                    changed = true
                }
            }
            return changed ? next : prev
        })
    }, [groups])

    const handleBulkArchiveClick = () => {
        if (selectedSessions.size === 0) return
        setBulkArchiveError(null) // Reset error state
        setBulkArchiveOpen(true)
    }

    const handleBulkArchiveConfirm = async () => {
        if (!api || selectedSessions.size === 0) return

        const sessionIds = Array.from(selectedSessions)
        setIsBulkArchiving(true)
        setBulkArchiveError(null)
        try {
            const results = await Promise.allSettled(
                sessionIds.map(sessionId => api.archiveSession(sessionId))
            )

            // Count successful vs failed operations
            const failed = results.filter(r => r.status === 'rejected')
            const succeeded = results.filter(r => r.status === 'fulfilled')

            if (failed.length > 0) {
                console.error(`Failed to archive ${failed.length} of ${sessionIds.length} sessions:`, failed)
                if (succeeded.length === 0) {
                    // All failed
                    setBulkArchiveError(t('dialog.bulkArchive.error.allFailed', { count: failed.length }))
                } else {
                    // Partial failure
                    setBulkArchiveError(t('dialog.bulkArchive.error.partialFailed', {
                        failed: failed.length,
                        total: sessionIds.length
                    }))
                }
            }

            // Only clear selection and close dialog if all succeeded
            if (succeeded.length > 0 && failed.length === 0) {
                setSelectedSessions(new Set())
                setSelectionMode(false)
                setBulkArchiveOpen(false)
                toast.success(t('dialog.bulkArchive.success', { count: succeeded.length }))
                props.onRefresh()
            } else if (succeeded.length > 0) {
                // Partial success - refresh to show updated state
                toast.info(t('dialog.bulkArchive.partialSuccess', {
                    succeeded: succeeded.length,
                    failed: failed.length
                }))
                props.onRefresh()
            }
        } catch (error) {
            console.error('Unexpected error during bulk archive:', error)
            setBulkArchiveError(t('dialog.error.default'))
        } finally {
            setIsBulkArchiving(false)
        }
    }

    const handleBulkArchiveRetry = () => {
        setBulkArchiveError(null)
        void handleBulkArchiveConfirm()
    }

    const getGroupLabel = (group: SessionGroup): string => {
        if (group.directory === '__active__') return t('sessions.group.active')
        if (group.directory === '__inactive__') return t('sessions.group.inactive')
        return group.displayName
    }

    return (
        <div className="mx-auto w-full max-w-content flex flex-col">
            {renderHeader ? (
                <div className="flex items-center justify-between px-3 py-2">
                    {selectionMode ? (
                        <>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={toggleSelectionMode}
                                    disabled={isBulkArchiving}
                                    className="p-1.5 rounded-full text-[var(--app-hint)] hover:text-[var(--app-text)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Cancel selection"
                                    aria-label="Cancel selection mode"
                                >
                                    <XIcon className="h-5 w-5" />
                                </button>
                                <span className="text-sm text-[var(--app-text)]">
                                    {selectedSessions.size} selected
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={handleBulkArchiveClick}
                                disabled={selectedSessions.size === 0 || isBulkArchiving}
                                className="px-3 py-1.5 rounded-md bg-red-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                                title="Archive selected sessions"
                                aria-label={`Archive ${selectedSessions.size} selected sessions`}
                            >
                                {isBulkArchiving ? t('dialog.bulkArchive.confirming') : 'Archive'}
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="text-sm text-[var(--app-hint)]">
                                {viewMode === 'active'
                                    ? t('sessions.count.simple', { n: props.sessions.length })
                                    : t('sessions.count', { n: props.sessions.length, m: groups.length })}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center rounded-lg bg-[var(--app-secondary-bg)] p-0.5 text-xs">
                                    <button
                                        type="button"
                                        onClick={() => handleSetViewMode('active')}
                                        className={`px-2.5 py-1 rounded-md transition-colors font-medium ${
                                            viewMode === 'active'
                                                ? 'bg-[var(--app-bg)] text-[var(--app-text)] shadow-sm'
                                                : 'text-[var(--app-hint)] hover:text-[var(--app-text)]'
                                        }`}
                                    >
                                        {t('sessions.view.active')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSetViewMode('by-project')}
                                        className={`px-2.5 py-1 rounded-md transition-colors font-medium ${
                                            viewMode === 'by-project'
                                                ? 'bg-[var(--app-bg)] text-[var(--app-text)] shadow-sm'
                                                : 'text-[var(--app-hint)] hover:text-[var(--app-text)]'
                                        }`}
                                    >
                                        {t('sessions.view.byProject')}
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={toggleSelectionMode}
                                    className="p-1.5 rounded-full text-[var(--app-link)] transition-colors"
                                    title="Select sessions"
                                    aria-label="Enable selection mode to select multiple sessions"
                                >
                                    <CheckSquareIcon className="h-5 w-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={props.onNewSession}
                                    className="session-list-new-button p-1.5 rounded-full text-[var(--app-link)] transition-colors"
                                    title={t('sessions.new')}
                                >
                                    <PlusIcon className="h-5 w-5" />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            ) : null}

            <div className="flex flex-col">
                {viewMode === 'active' && !props.sessions.some(s => s.active) ? (
                    <div className="flex flex-col items-center justify-center gap-1 px-6 py-8 text-center">
                        <span className="text-sm text-[var(--app-hint)]">No active sessions</span>
                        <span className="text-xs text-[var(--app-hint)]">Start a new session or resume one below</span>
                    </div>
                ) : null}
                {groups.map((group) => {
                    const isCollapsed = isGroupCollapsed(group)
                    return (
                        <div key={group.directory}>
                            <button
                                type="button"
                                onClick={() => toggleGroup(group.directory, isCollapsed)}
                                className="sticky top-0 z-10 flex w-full items-center gap-2 px-3 py-2 text-left bg-[var(--app-secondary-bg)] border-b border-[var(--app-divider)] shadow-sm transition-colors hover:brightness-95"
                            >
                                <ChevronIcon
                                    className="h-4 w-4 text-[var(--app-hint)]"
                                    collapsed={isCollapsed}
                                />
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--app-hint)] break-words" title={group.directory === '__active__' || group.directory === '__inactive__' ? undefined : group.directory}>
                                        {getGroupLabel(group)}
                                    </span>
                                    <span className="shrink-0 text-xs text-[var(--app-hint)]">
                                        ({group.sessions.length})
                                    </span>
                                </div>
                            </button>
                            {!isCollapsed ? (
                                <div className="flex flex-col divide-y divide-[var(--app-divider)] border-b border-[var(--app-divider)]">
                                    {group.sessions.map((s) => (
                                        <SessionItem
                                            key={s.id}
                                            session={s}
                                            onSelect={props.onSelect}
                                            showPath={false}
                                            api={api}
                                            selectionMode={selectionMode}
                                            isSelected={selectedSessions.has(s.id)}
                                            onToggleSelection={toggleSessionSelection}
                                        />
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    )
                })}
            </div>

            <ConfirmDialog
                isOpen={bulkArchiveOpen}
                onClose={() => {
                    setBulkArchiveOpen(false)
                    setBulkArchiveError(null)
                }}
                title={t('dialog.bulkArchive.title')}
                description={t('dialog.bulkArchive.description', { count: selectedSessions.size })}
                confirmLabel={t('dialog.bulkArchive.confirm')}
                confirmingLabel={t('dialog.bulkArchive.confirming')}
                onConfirm={handleBulkArchiveConfirm}
                isPending={isBulkArchiving}
                destructive
                error={bulkArchiveError}
                onRetry={handleBulkArchiveRetry}
                retryLabel={t('button.retry')}
            />
        </div>
    )
}
