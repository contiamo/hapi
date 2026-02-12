import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ApiClient } from '@/api/client'
import type { Machine } from '@/types/api'
import { usePlatform } from '@/hooks/usePlatform'
import { useSpawnSession } from '@/hooks/mutations/useSpawnSession'
import { useSessions } from '@/hooks/queries/useSessions'
import { useActiveSuggestions, type Suggestion } from '@/hooks/useActiveSuggestions'
import { useDirectorySuggestions } from '@/hooks/useDirectorySuggestions'
import { useRecentPaths } from '@/hooks/useRecentPaths'
import { useBasePaths } from '@/hooks/useBasePaths'
import type { AgentType, SessionType } from './types'
import { ActionButtons } from './ActionButtons'
import { AgentSelector } from './AgentSelector'
import { DirectorySection } from './DirectorySection'
import { MachineSelector } from './MachineSelector'
import { ModelSelector } from './ModelSelector'
import { SessionTypeSelector } from './SessionTypeSelector'
import { YoloToggle } from './YoloToggle'

export function NewSession(props: {
    api: ApiClient
    machines: Machine[]
    serverBasePaths?: string[]
    isLoading?: boolean
    onSuccess: (sessionId: string) => void
    onCancel: () => void
}) {
    const { haptic } = usePlatform()
    const { spawnSession, isPending, error: spawnError } = useSpawnSession(props.api)
    const { sessions } = useSessions(props.api)
    const isFormDisabled = Boolean(isPending || props.isLoading)
    const { getRecentPaths, addRecentPath, getLastUsedMachineId, setLastUsedMachineId } = useRecentPaths()
    const { getBasePaths } = useBasePaths(props.serverBasePaths ?? [])

    const [machineId, setMachineId] = useState<string | null>(null)
    const [directory, setDirectory] = useState('')
    const [suppressSuggestions, setSuppressSuggestions] = useState(false)
    const [isDirectoryFocused, setIsDirectoryFocused] = useState(false)
    const [pathExistence, setPathExistence] = useState<Record<string, boolean>>({})
    const [agent, setAgent] = useState<AgentType>('claude')
    const [model, setModel] = useState('auto')
    const [yoloMode, setYoloMode] = useState(false)
    const [sessionType, setSessionType] = useState<SessionType>('simple')
    const [worktreeName, setWorktreeName] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
    const [autocompleteError, setAutocompleteError] = useState<string | null>(null)
    const worktreeInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (sessionType === 'worktree') {
            worktreeInputRef.current?.focus()
        }
    }, [sessionType])

    useEffect(() => {
        setModel('auto')
    }, [agent])

    useEffect(() => {
        if (props.machines.length === 0) return
        if (machineId && props.machines.find((m) => m.id === machineId)) return

        const lastUsed = getLastUsedMachineId()
        const foundLast = lastUsed ? props.machines.find((m) => m.id === lastUsed) : null

        if (foundLast) {
            setMachineId(foundLast.id)
            const paths = getRecentPaths(foundLast.id)
            if (paths[0]) setDirectory(paths[0])
        } else if (props.machines[0]) {
            setMachineId(props.machines[0].id)
        }
    }, [props.machines, machineId, getLastUsedMachineId, getRecentPaths])

    const recentPaths = useMemo(
        () => getRecentPaths(machineId),
        [getRecentPaths, machineId]
    )

    const basePaths = useMemo(
        () => getBasePaths(),
        [getBasePaths]
    )

    const allPaths = useDirectorySuggestions(machineId, sessions, recentPaths)

    const pathsToCheck = useMemo(
        () => Array.from(new Set(allPaths)).slice(0, 1000),
        [allPaths]
    )

    useEffect(() => {
        let cancelled = false

        if (!machineId || pathsToCheck.length === 0) {
            setPathExistence({})
            return () => { cancelled = true }
        }

        void props.api.checkMachinePathsExists(machineId, pathsToCheck)
            .then((result) => {
                if (cancelled) return
                setPathExistence(result.exists ?? {})
            })
            .catch(() => {
                if (cancelled) return
                setPathExistence({})
            })

        return () => {
            cancelled = true
        }
    }, [machineId, pathsToCheck, props.api])

    const verifiedPaths = useMemo(
        () => allPaths.filter((path) => pathExistence[path]),
        [allPaths, pathExistence]
    )

    const getSuggestions = useCallback(async (query: string): Promise<Suggestion[]> => {
        if (!machineId || !props.api) return []

        const lowered = query.toLowerCase()

        // If query is empty, show base paths first, then recent paths
        if (!query.trim()) {
            const basePathSuggestions = basePaths.map((path) => ({
                key: path,
                text: path,
                label: path
            }))

            const recentPathSuggestions = verifiedPaths
                .filter((path) => !basePaths.includes(path))
                .slice(0, 8 - basePathSuggestions.length)
                .map((path) => ({
                    key: path,
                    text: path,
                    label: path
                }))

            return [...basePathSuggestions, ...recentPathSuggestions]
        }

        // Check if the query is typing under a base path
        const matchingBasePath = basePaths.find(bp =>
            query === bp || query.startsWith(bp + '/')
        )

        if (matchingBasePath && query.length > matchingBasePath.length) {
            // User is typing under a base path - fetch subdirectories recursively
            setIsLoadingSuggestions(true)
            setAutocompleteError(null)

            try {
                const result = await props.api.listMachineDirectories(machineId, matchingBasePath, {
                    prefix: query,
                    maxDepth: 5
                })

                setIsLoadingSuggestions(false)

                // Show more results (up to 15) to help with multi-level navigation
                return result.directories
                    .slice(0, 15)
                    .map((path) => ({
                        key: path,
                        text: path,
                        label: path
                    }))
            } catch (error) {
                console.error('Failed to fetch subdirectories:', error)
                setIsLoadingSuggestions(false)

                // Set appropriate error message
                if (error instanceof Error) {
                    if (error.message.toLowerCase().includes('timeout')) {
                        setAutocompleteError('Search timed out. Try a shorter path.')
                    } else if (error.message.toLowerCase().includes('denied')) {
                        setAutocompleteError('Path not found or access denied.')
                    } else {
                        setAutocompleteError('Could not load suggestions. Check your connection.')
                    }
                } else {
                    setAutocompleteError('Could not load suggestions. Check your connection.')
                }

                // Fall back to verified paths
            }
        }

        // Check if query partially matches any base path (user is typing a base path)
        const partialBasePathMatches = basePaths.filter((path) =>
            path.toLowerCase().startsWith(lowered)
        )

        if (partialBasePathMatches.length > 0) {
            return partialBasePathMatches.map((path) => ({
                key: path,
                text: path,
                label: path
            }))
        }

        // Default: show verified paths that match
        return verifiedPaths
            .filter((path) => path.toLowerCase().includes(lowered))
            .slice(0, 8)
            .map((path) => ({
                key: path,
                text: path,
                label: path
            }))
    }, [verifiedPaths, basePaths, machineId, props.api])

    const activeQuery = (!isDirectoryFocused || suppressSuggestions) ? null : directory

    const [suggestions, selectedIndex, moveUp, moveDown, clearSuggestions] = useActiveSuggestions(
        activeQuery,
        getSuggestions,
        { allowEmptyQuery: true, autoSelectFirst: false, debounceMs: 150 }
    )

    const handleMachineChange = useCallback((newMachineId: string) => {
        setMachineId(newMachineId)
        const paths = getRecentPaths(newMachineId)
        if (paths[0]) {
            setDirectory(paths[0])
        } else {
            setDirectory('')
        }
    }, [getRecentPaths])

    const handlePathClick = useCallback((path: string) => {
        setDirectory(path)
    }, [])

    const handleSuggestionSelect = useCallback((index: number) => {
        const suggestion = suggestions[index]
        if (suggestion) {
            setDirectory(suggestion.text)
            clearSuggestions()
            setSuppressSuggestions(true)
        }
    }, [suggestions, clearSuggestions])

    const handleDirectoryChange = useCallback((value: string) => {
        setSuppressSuggestions(false)
        setDirectory(value)
        if (autocompleteError) {
            setAutocompleteError(null) // Auto-dismiss error when user types
        }
    }, [autocompleteError])

    const handleDirectoryFocus = useCallback(() => {
        setSuppressSuggestions(false)
        setIsDirectoryFocused(true)
    }, [])

    const handleDirectoryBlur = useCallback(() => {
        setIsDirectoryFocused(false)
    }, [])

    const handleDirectoryKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (suggestions.length === 0) return

        if (event.key === 'ArrowUp') {
            event.preventDefault()
            moveUp()
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault()
            moveDown()
        }

        if (event.key === 'Enter' || event.key === 'Tab') {
            if (selectedIndex >= 0) {
                event.preventDefault()
                handleSuggestionSelect(selectedIndex)
            }
        }

        if (event.key === 'Escape') {
            clearSuggestions()
        }
    }, [suggestions, selectedIndex, moveUp, moveDown, clearSuggestions, handleSuggestionSelect])

    async function handleCreate() {
        if (!machineId || !directory.trim()) return

        setError(null)
        try {
            const result = await spawnSession({
                machineId,
                directory: directory.trim(),
                agent,
                model: model !== 'auto' ? model : undefined,
                yolo: yoloMode,
                sessionType,
                worktreeName: sessionType === 'worktree' ? (worktreeName.trim() || undefined) : undefined
            })

            if (result.type === 'success') {
                haptic.notification('success')
                setLastUsedMachineId(machineId)
                addRecentPath(machineId, directory.trim())
                props.onSuccess(result.sessionId)
                return
            }

            haptic.notification('error')
            setError(result.message)
        } catch (e) {
            haptic.notification('error')
            setError(e instanceof Error ? e.message : 'Failed to create session')
        }
    }

    const canCreate = Boolean(machineId && directory.trim() && !isFormDisabled)

    return (
        <div className="flex flex-col divide-y divide-[var(--app-divider)]">
            <MachineSelector
                machines={props.machines}
                machineId={machineId}
                isLoading={props.isLoading}
                isDisabled={isFormDisabled}
                onChange={handleMachineChange}
            />
            <DirectorySection
                directory={directory}
                suggestions={suggestions}
                selectedIndex={selectedIndex}
                isDisabled={isFormDisabled}
                recentPaths={recentPaths}
                isLoadingSuggestions={isLoadingSuggestions}
                autocompleteError={autocompleteError}
                onDirectoryChange={handleDirectoryChange}
                onDirectoryFocus={handleDirectoryFocus}
                onDirectoryBlur={handleDirectoryBlur}
                onDirectoryKeyDown={handleDirectoryKeyDown}
                onSuggestionSelect={handleSuggestionSelect}
                onPathClick={handlePathClick}
                onDismissError={() => setAutocompleteError(null)}
            />
            <SessionTypeSelector
                sessionType={sessionType}
                worktreeName={worktreeName}
                worktreeInputRef={worktreeInputRef}
                isDisabled={isFormDisabled}
                onSessionTypeChange={setSessionType}
                onWorktreeNameChange={setWorktreeName}
            />
            <AgentSelector
                agent={agent}
                isDisabled={isFormDisabled}
                onAgentChange={setAgent}
            />
            <ModelSelector
                agent={agent}
                model={model}
                isDisabled={isFormDisabled}
                onModelChange={setModel}
            />
            <YoloToggle
                yoloMode={yoloMode}
                isDisabled={isFormDisabled}
                onToggle={setYoloMode}
            />

            {(error ?? spawnError) ? (
                <div className="px-3 py-2 text-sm text-red-600">
                    {error ?? spawnError}
                </div>
            ) : null}

            <ActionButtons
                isPending={isPending}
                canCreate={canCreate}
                isDisabled={isFormDisabled}
                onCancel={props.onCancel}
                onCreate={handleCreate}
            />
        </div>
    )
}
