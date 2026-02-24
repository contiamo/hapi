import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ThreadPrimitive, useAssistantState } from '@assistant-ui/react'
import type { ApiClient } from '@/api/client'
import type { SessionMetadataSummary } from '@/types/api'
import { HappyAssistantMessage } from '@/components/AssistantChat/messages/AssistantMessage'
import { HappyUserMessage } from '@/components/AssistantChat/messages/UserMessage'
import { HappySystemMessage } from '@/components/AssistantChat/messages/SystemMessage'
import { VirtualMessageList, type VirtualMessageListHandle } from '@/components/AssistantChat/VirtualMessageList'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
import { useTranslation } from '@/lib/use-translation'

function NewMessagesIndicator(props: { count: number; onClick: () => void }) {
    const { t } = useTranslation()
    if (props.count === 0) {
        return null
    }

    return (
        <button
            onClick={props.onClick}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-[var(--app-button)] text-[var(--app-button-text)] px-3 py-1.5 rounded-full text-sm font-medium shadow-lg animate-bounce-in z-10"
        >
            {t('misc.newMessage', { n: props.count })} &#8595;
        </button>
    )
}

function MessageSkeleton() {
    const { t } = useTranslation()
    const rows = [
        { align: 'end', width: 'w-2/3', height: 'h-10' },
        { align: 'start', width: 'w-3/4', height: 'h-12' },
        { align: 'end', width: 'w-1/2', height: 'h-9' },
        { align: 'start', width: 'w-5/6', height: 'h-14' }
    ]

    return (
        <div role="status" aria-live="polite">
            <span className="sr-only">{t('misc.loadingMessages')}</span>
            <div className="space-y-3 animate-pulse">
                {rows.map((row, index) => (
                    <div key={`skeleton-${index}`} className={row.align === 'end' ? 'flex justify-end' : 'flex justify-start'}>
                        <div className={`${row.height} ${row.width} rounded-xl bg-[var(--app-subtle-bg)]`} />
                    </div>
                ))}
            </div>
        </div>
    )
}

const THREAD_MESSAGE_COMPONENTS = {
    UserMessage: HappyUserMessage,
    AssistantMessage: HappyAssistantMessage,
    SystemMessage: HappySystemMessage
} as const

export function HappyThread(props: {
    api: ApiClient
    sessionId: string
    metadata: SessionMetadataSummary | null
    disabled: boolean
    onRefresh: () => void
    onRetryMessage?: (localId: string) => void
    onFlushPending: () => void
    onAtBottomChange: (atBottom: boolean) => void
    isLoadingMessages: boolean
    messagesWarning: string | null
    hasMoreMessages: boolean
    hasMoreBeforeBoundary: boolean
    isLoadingMoreMessages: boolean
    onLoadMore: () => Promise<unknown>
    pendingCount: number
    rawMessagesCount: number
    normalizedMessagesCount: number
    messagesVersion: number
    forceScrollToken: number
}) {
    const { t } = useTranslation()
    const viewportRef = useRef<HTMLDivElement | null>(null)
    // scrollElement state drives the virtualizer — it must be non-null when the virtualizer
    // first initializes so TanStack Virtual attaches its ResizeObserver correctly. A callback
    // ref sets both the imperative ref (for scrollTop/listeners) and this state in one step.
    const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
    const setViewportRef = useCallback((el: HTMLDivElement | null) => {
        viewportRef.current = el
        setScrollElement(el)
    }, [])
    // Drives "Load older" overlay — true when user has scrolled within 200px of the top.
    const [isNearTop, setIsNearTop] = useState(false)
    const virtualizerRef = useRef<VirtualMessageListHandle | null>(null)
    const loadLockRef = useRef(false)
    const pendingScrollRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null)
    const prevLoadingMoreRef = useRef(false)
    const loadStartedRef = useRef(false)
    const isLoadingMoreRef = useRef(props.isLoadingMoreMessages)
    const hasMoreMessagesRef = useRef(props.hasMoreMessages)
    const hasMoreBeforeBoundaryRef = useRef(props.hasMoreBeforeBoundary)
    const isLoadingMessagesRef = useRef(props.isLoadingMessages)
    const onLoadMoreRef = useRef(props.onLoadMore)
    const handleLoadMoreRef = useRef<() => void>(() => {})
    const atBottomRef = useRef(true)
    const onAtBottomChangeRef = useRef(props.onAtBottomChange)
    const onFlushPendingRef = useRef(props.onFlushPending)
    const forceScrollTokenRef = useRef(props.forceScrollToken)

    // Smart scroll: enabled when user is near bottom. Pure ref — never needs to trigger a render.
    const autoScrollEnabledRef = useRef(true)

    // Get messages count for virtual scrolling
    const messagesCount = useAssistantState(({ thread }) => thread.messages.length)

    // Keep refs in sync with props
    useEffect(() => {
        onAtBottomChangeRef.current = props.onAtBottomChange
    }, [props.onAtBottomChange])
    useEffect(() => {
        onFlushPendingRef.current = props.onFlushPending
    }, [props.onFlushPending])
    useEffect(() => {
        hasMoreMessagesRef.current = props.hasMoreMessages
    }, [props.hasMoreMessages])
    useEffect(() => {
        hasMoreBeforeBoundaryRef.current = props.hasMoreBeforeBoundary
    }, [props.hasMoreBeforeBoundary])
    useEffect(() => {
        isLoadingMessagesRef.current = props.isLoadingMessages
    }, [props.isLoadingMessages])
    useEffect(() => {
        onLoadMoreRef.current = props.onLoadMore
    }, [props.onLoadMore])

    // Track scroll position to toggle autoScroll and near-top state (stable listener using refs)
    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const BOTTOM_THRESHOLD_PX = 120
        const TOP_THRESHOLD_PX = 200

        let nearTop = false

        const handleScroll = () => {
            const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
            const isNearBottom = distanceFromBottom < BOTTOM_THRESHOLD_PX

            autoScrollEnabledRef.current = isNearBottom

            if (isNearBottom !== atBottomRef.current) {
                atBottomRef.current = isNearBottom
                onAtBottomChangeRef.current(isNearBottom)
                if (isNearBottom) {
                    onFlushPendingRef.current()
                }
            }

            const nextNearTop = viewport.scrollTop < TOP_THRESHOLD_PX
            if (nextNearTop !== nearTop) {
                nearTop = nextNearTop
                setIsNearTop(nextNearTop)
            }
        }

        viewport.addEventListener('scroll', handleScroll, { passive: true })
        return () => viewport.removeEventListener('scroll', handleScroll)
    }, []) // Stable: no dependencies, reads from refs

    // Scroll to bottom handler for the indicator button
    const scrollToBottom = useCallback(() => {
        if (virtualizerRef.current && messagesCount > 0) {
            virtualizerRef.current.scrollToIndex(messagesCount - 1, { behavior: 'smooth' })
        } else {
            const viewport = viewportRef.current
            if (viewport) {
                viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
            }
        }
        autoScrollEnabledRef.current = true
        if (!atBottomRef.current) {
            atBottomRef.current = true
            onAtBottomChangeRef.current(true)
        }
        onFlushPendingRef.current()
    }, [messagesCount])

    // Reset scroll tracking when session changes
    useEffect(() => {
        autoScrollEnabledRef.current = true
        atBottomRef.current = true
        onAtBottomChangeRef.current(true)
        forceScrollTokenRef.current = props.forceScrollToken
    }, [props.sessionId])

    useEffect(() => {
        if (forceScrollTokenRef.current === props.forceScrollToken) {
            return
        }
        forceScrollTokenRef.current = props.forceScrollToken
        scrollToBottom()
    }, [props.forceScrollToken, scrollToBottom])

    // Auto-scroll to bottom when new messages arrive and the user is near the bottom.
    // Only depends on messagesCount — including autoScrollEnabled would re-trigger this
    // when the user manually scrolls back to the bottom, causing a redundant scroll.
    useEffect(() => {
        if (autoScrollEnabledRef.current && messagesCount > 0 && virtualizerRef.current) {
            virtualizerRef.current.scrollToIndex(messagesCount - 1, { behavior: 'auto' })
        }
    }, [messagesCount])

    const handleLoadMore = useCallback(() => {
        if (isLoadingMessagesRef.current || (!hasMoreMessagesRef.current && !hasMoreBeforeBoundaryRef.current) || isLoadingMoreRef.current || loadLockRef.current) {
            return
        }
        const viewport = viewportRef.current
        if (!viewport) {
            return
        }
        pendingScrollRef.current = {
            scrollTop: viewport.scrollTop,
            scrollHeight: viewport.scrollHeight
        }
        loadLockRef.current = true
        loadStartedRef.current = false
        let loadPromise: Promise<unknown>
        try {
            loadPromise = onLoadMoreRef.current()
        } catch (error) {
            pendingScrollRef.current = null
            loadLockRef.current = false
            throw error
        }
        void loadPromise.catch((error) => {
            pendingScrollRef.current = null
            loadLockRef.current = false
            console.error('Failed to load older messages:', error)
        }).finally(() => {
            if (!loadStartedRef.current && !isLoadingMoreRef.current && pendingScrollRef.current) {
                pendingScrollRef.current = null
                loadLockRef.current = false
            }
        })
    }, [])

    useEffect(() => {
        handleLoadMoreRef.current = handleLoadMore
    }, [handleLoadMore])


    useLayoutEffect(() => {
        const pending = pendingScrollRef.current
        const viewport = viewportRef.current
        if (!pending || !viewport) {
            return
        }
        const delta = viewport.scrollHeight - pending.scrollHeight
        viewport.scrollTop = pending.scrollTop + delta
        pendingScrollRef.current = null
        loadLockRef.current = false
    }, [props.messagesVersion])

    useEffect(() => {
        isLoadingMoreRef.current = props.isLoadingMoreMessages
        if (props.isLoadingMoreMessages) {
            loadStartedRef.current = true
        }
        if (prevLoadingMoreRef.current && !props.isLoadingMoreMessages && pendingScrollRef.current) {
            pendingScrollRef.current = null
            loadLockRef.current = false
        }
        prevLoadingMoreRef.current = props.isLoadingMoreMessages
    }, [props.isLoadingMoreMessages])

    return (
        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col relative">
            {/* Non-scrolling header: skeleton and warnings only. Kept outside the scroll
                element so the virtualizer container sits at offset 0 inside the scroll element.
                TanStack Virtual assumes its container starts at the scroll element's top edge —
                any content above it would offset all item positions and make them invisible. */}
            <div className="flex-shrink-0 mx-auto w-full max-w-content min-w-0 px-3">
                {props.isLoadingMessages && props.rawMessagesCount === 0 ? (
                    <MessageSkeleton />
                ) : (
                    <>
                        {props.messagesWarning ? (
                            <div className="mt-2 rounded-md bg-amber-500/10 p-2 text-xs">
                                {props.messagesWarning}
                            </div>
                        ) : null}

                        {import.meta.env.DEV && props.normalizedMessagesCount === 0 && props.rawMessagesCount > 0 ? (
                            <div className="mt-2 rounded-md bg-amber-500/10 p-2 text-xs">
                                Message normalization returned 0 items for {props.rawMessagesCount} messages (see `web/src/chat/normalize.ts`).
                            </div>
                        ) : null}
                    </>
                )}
            </div>

            <ThreadPrimitive.Viewport asChild autoScroll={false}>
                <div ref={setViewportRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                    <div className="mx-auto w-full max-w-content min-w-0 px-3 pb-3">
                        <VirtualMessageList
                            ref={virtualizerRef}
                            components={THREAD_MESSAGE_COMPONENTS}
                            scrollElement={scrollElement}
                        />
                    </div>
                </div>
            </ThreadPrimitive.Viewport>
            {/* Load older / loading overlay — floats over the top of the scroll area.
                Does not consume layout space so virtualizer item positions stay correct. */}
            {(props.hasMoreMessages || props.hasMoreBeforeBoundary) && isNearTop ? (
                props.isLoadingMoreMessages ? (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-[var(--app-button)] text-[var(--app-button-text)] px-3 py-1.5 rounded-full text-sm font-medium shadow-lg opacity-90">
                        <Spinner size="sm" label={null} className="text-current" />
                        {t('misc.loading')}
                    </div>
                ) : (
                    <button
                        onClick={handleLoadMore}
                        disabled={props.isLoadingMessages}
                        className="absolute top-2 left-1/2 -translate-x-1/2 bg-[var(--app-button)] text-[var(--app-button-text)] px-3 py-1.5 rounded-full text-sm font-medium shadow-lg z-10 opacity-90 hover:opacity-100"
                    >
                        ↑ {t('misc.loadOlder')}
                    </button>
                )
            ) : null}
            <NewMessagesIndicator count={props.pendingCount} onClick={scrollToBottom} />
        </ThreadPrimitive.Root>
    )
}
