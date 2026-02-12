import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useMachines } from '@/hooks/queries/useMachines'
import { useAppContext } from '@/lib/app-context'

function BackIcon(props: { className?: string }) {
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
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

export default function BasePathsPage() {
    const goBack = useAppGoBack()
    const { api } = useAppContext()
    const { machines, basePaths: serverBasePaths } = useMachines(api, true)

    return (
        <div className="flex h-full flex-col">
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto w-full max-w-content flex items-center gap-2 p-3 border-b border-[var(--app-border)]">
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                    >
                        <BackIcon />
                    </button>
                    <div className="flex-1 font-semibold">Base Paths</div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-content">
                    {/* Server base paths (read-only) */}
                    {serverBasePaths.length > 0 ? (
                        <div className="border-b border-[var(--app-divider)]">
                            <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                                Configured Base Paths
                            </div>
                            <div className="flex flex-col divide-y divide-[var(--app-divider)]">
                                {serverBasePaths.map((path) => (
                                    <div key={path} className="flex items-center gap-3 px-3 py-2">
                                        <span className="flex-1 text-sm truncate">{path}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="px-3 py-8 text-center text-sm text-[var(--app-hint)]">
                            No base paths configured
                        </div>
                    )}

                    {/* Help text */}
                    <div className="px-3 py-4 text-xs text-[var(--app-hint)]">
                        Base paths are configured on the server and used for autocomplete when creating new sessions.
                        They help you quickly navigate to your project folders by providing suggestions as you type.
                    </div>
                </div>
            </div>
        </div>
    )
}
