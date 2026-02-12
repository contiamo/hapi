import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { Autocomplete } from '@/components/ChatInput/Autocomplete'
import { FloatingOverlay } from '@/components/ChatInput/FloatingOverlay'
import { Spinner } from '@/components/Spinner'
import { useTranslation } from '@/lib/use-translation'

const ErrorIcon = ({ className }: { className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className={className}
    >
        <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
            clipRule="evenodd"
        />
    </svg>
)

export function DirectorySection(props: {
    directory: string
    suggestions: readonly Suggestion[]
    selectedIndex: number
    isDisabled: boolean
    recentPaths: string[]
    isLoadingSuggestions?: boolean
    autocompleteError?: string | null
    onDirectoryChange: (value: string) => void
    onDirectoryFocus: () => void
    onDirectoryBlur: () => void
    onDirectoryKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void
    onSuggestionSelect: (index: number) => void
    onPathClick: (path: string) => void
    onDismissError?: () => void
}) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <label className="text-xs font-medium text-[var(--app-hint)]">
                {t('newSession.directory')}
            </label>
            <div className="relative">
                <input
                    type="text"
                    placeholder={t('newSession.placeholder')}
                    value={props.directory}
                    onChange={(event) => props.onDirectoryChange(event.target.value)}
                    onKeyDown={props.onDirectoryKeyDown}
                    onFocus={props.onDirectoryFocus}
                    onBlur={props.onDirectoryBlur}
                    disabled={props.isDisabled}
                    className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
                />

                {/* Error banner */}
                {props.autocompleteError && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 mt-2 text-sm text-red-600 bg-red-50 border-l-2 border-red-500 rounded" role="alert">
                        <div className="flex items-center gap-2">
                            <ErrorIcon className="h-4 w-4 flex-shrink-0" aria-hidden />
                            <span>{props.autocompleteError}</span>
                        </div>
                        {props.onDismissError && (
                            <button
                                onClick={props.onDismissError}
                                className="text-red-600 hover:text-red-800 text-lg leading-none"
                                aria-label="Dismiss error"
                            >
                                ×
                            </button>
                        )}
                    </div>
                )}

                {/* Suggestions dropdown */}
                {(props.suggestions.length > 0 || props.isLoadingSuggestions) && (
                    <div className="absolute top-full left-0 right-0 z-10 mt-1">
                        <FloatingOverlay maxHeight={200}>
                            {props.isLoadingSuggestions && (
                                <div className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--app-hint)]" role="status" aria-live="polite">
                                    <Spinner size="sm" aria-hidden />
                                    <span>Searching...</span>
                                </div>
                            )}
                            {props.suggestions.length > 0 && (
                                <Autocomplete
                                    suggestions={props.suggestions}
                                    selectedIndex={props.selectedIndex}
                                    onSelect={props.onSuggestionSelect}
                                />
                            )}
                            {!props.isLoadingSuggestions && props.suggestions.length === 0 && props.directory.trim() && (
                                <div className="px-3 py-4 text-center text-sm text-[var(--app-hint)]" role="status">
                                    No directories found
                                </div>
                            )}
                        </FloatingOverlay>
                    </div>
                )}
            </div>

            {props.recentPaths.length > 0 && (
                <div className="flex flex-col gap-1 mt-1">
                    <span className="text-xs text-[var(--app-hint)]">{t('newSession.recent')}:</span>
                    <div className="flex flex-wrap gap-1">
                        {props.recentPaths.map((path) => (
                            <button
                                key={path}
                                type="button"
                                onClick={() => props.onPathClick(path)}
                                disabled={props.isDisabled}
                                className="rounded bg-[var(--app-subtle-bg)] px-2 py-1 text-xs text-[var(--app-fg)] hover:bg-[var(--app-secondary-bg)] transition-colors truncate max-w-[200px] disabled:opacity-50"
                                title={path}
                            >
                                {path}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
