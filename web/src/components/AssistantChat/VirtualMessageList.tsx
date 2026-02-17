import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useImperativeHandle, forwardRef, useEffect, useState, type ComponentType } from 'react'
import { ThreadPrimitive, useAssistantState } from '@assistant-ui/react'

export type VirtualMessageListHandle = {
    scrollToIndex: (index: number, options?: { behavior?: 'auto' | 'smooth' }) => void
    scrollToOffset: (offset: number, options?: { behavior?: 'auto' | 'smooth' }) => void
    measure: () => void
}

type MessageComponents = {
    UserMessage: ComponentType
    AssistantMessage: ComponentType
    SystemMessage: ComponentType
}

type VirtualMessageListProps = {
    components: MessageComponents
    parentRef: React.RefObject<HTMLDivElement | null>
}

export const VirtualMessageList = forwardRef<VirtualMessageListHandle, VirtualMessageListProps>(
    function VirtualMessageList(props, ref) {
        const messagesCount = useAssistantState((state) => state.thread.messages.length)
        const scrollingRef = useRef<number | undefined>(undefined)

        // Track the scroll element in state so the virtualizer re-initializes when it becomes available.
        // parentRef.current may be null on first render; this ensures the virtualizer observes the
        // scroll element once it's mounted.
        const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
        useEffect(() => {
            setScrollElement(props.parentRef.current)
        }, [props.parentRef])

        const virtualizer = useVirtualizer({
            count: messagesCount,
            getScrollElement: () => scrollElement,
            estimateSize: () => 212, // 200px base + 12px gap (0.75rem)
            overscan: 5,
            measureElement:
                typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1
                    ? (element) => element?.getBoundingClientRect().height
                    : undefined,
        })

        useImperativeHandle(
            ref,
            () => ({
                scrollToIndex: (index, options) => {
                    virtualizer.scrollToIndex(index, {
                        align: 'end',
                        behavior: options?.behavior,
                    })
                },
                scrollToOffset: (offset, options) => {
                    virtualizer.scrollToOffset(offset, {
                        behavior: options?.behavior,
                    })
                },
                measure: () => {
                    virtualizer.measure()
                },
            }),
            [virtualizer]
        )

        const items = virtualizer.getVirtualItems()

        if (messagesCount === 0) {
            return null
        }

        return (
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                }}
            >
                {items.map((virtualItem) => (
                    <div
                            key={virtualItem.key}
                            data-index={virtualItem.index}
                            ref={virtualizer.measureElement}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${virtualItem.start}px)`,
                            }}
                        >
                            <ThreadPrimitive.MessageByIndex
                                index={virtualItem.index}
                                components={props.components}
                            />
                        </div>
                ))}
            </div>
        )
    }
)
