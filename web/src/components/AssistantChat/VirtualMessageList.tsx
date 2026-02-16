import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useImperativeHandle, forwardRef, type ComponentType } from 'react'
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

        const virtualizer = useVirtualizer({
            count: messagesCount,
            getScrollElement: () => props.parentRef.current,
            estimateSize: () => 200,
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
