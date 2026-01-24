import { useState, useCallback } from 'react'
import type { ApiClient } from '@/api/client'

function FolderIcon(props: { className?: string }) {
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
            className={props.className}
        >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
    )
}

function ChevronRightIcon(props: { className?: string }) {
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
            className={props.className}
        >
            <polyline points="9 18 15 12 9 6" />
        </svg>
    )
}

export function BasePathSelector(props: {
    machineId: string | null
    basePaths: string[]
    api: ApiClient | null
    onSelectPath: (path: string) => void
    isDisabled?: boolean
}) {
    const { machineId, basePaths, api, onSelectPath, isDisabled } = props
    const [selectedBasePath, setSelectedBasePath] = useState<string | null>(null)
    const [subdirectories, setSubdirectories] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(false)

    const handleBasePathClick = useCallback(async (basePath: string) => {
        if (!api || !machineId || isDisabled) return

        setSelectedBasePath(basePath)
        setIsLoading(true)
        try {
            const result = await api.listMachineDirectories(machineId, basePath)
            setSubdirectories(result.directories)
        } catch (error) {
            console.error('Failed to list directories:', error)
            setSubdirectories([])
        } finally {
            setIsLoading(false)
        }
    }, [api, machineId, isDisabled])

    const handleSubdirectoryClick = useCallback((path: string) => {
        onSelectPath(path)
        setSelectedBasePath(null)
        setSubdirectories([])
    }, [onSelectPath])

    const handleBack = useCallback(() => {
        setSelectedBasePath(null)
        setSubdirectories([])
    }, [])

    if (basePaths.length === 0) {
        return null
    }

    return (
        <div className="flex flex-col">
            {!selectedBasePath ? (
                <div className="flex flex-col">
                    <div className="px-3 py-2 text-xs text-[var(--app-hint)]">
                        Base Paths
                    </div>
                    <div className="flex flex-col divide-y divide-[var(--app-divider)]">
                        {basePaths.map((basePath) => (
                            <button
                                key={basePath}
                                type="button"
                                onClick={() => void handleBasePathClick(basePath)}
                                disabled={isDisabled}
                                className="flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--app-subtle-bg)] transition-colors disabled:opacity-50"
                            >
                                <FolderIcon className="text-[var(--app-hint)] shrink-0" />
                                <span className="flex-1 truncate">{basePath}</span>
                                <ChevronRightIcon className="text-[var(--app-hint)] shrink-0" />
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col">
                    <div className="px-3 py-2 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleBack}
                            className="text-xs text-[var(--app-link)] hover:underline"
                        >
                            ← Back
                        </button>
                        <span className="text-xs text-[var(--app-hint)] truncate">
                            {selectedBasePath}
                        </span>
                    </div>
                    <div className="flex flex-col divide-y divide-[var(--app-divider)] max-h-64 overflow-y-auto">
                        {isLoading ? (
                            <div className="px-3 py-4 text-sm text-center text-[var(--app-hint)]">
                                Loading...
                            </div>
                        ) : subdirectories.length === 0 ? (
                            <div className="px-3 py-4 text-sm text-center text-[var(--app-hint)]">
                                No subdirectories found
                            </div>
                        ) : (
                            subdirectories.map((dir) => (
                                <button
                                    key={dir}
                                    type="button"
                                    onClick={() => handleSubdirectoryClick(dir)}
                                    className="flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--app-subtle-bg)] transition-colors"
                                >
                                    <FolderIcon className="text-[var(--app-hint)] shrink-0" />
                                    <span className="flex-1 truncate">{dir}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
