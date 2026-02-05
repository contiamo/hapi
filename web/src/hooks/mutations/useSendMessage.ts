import { useMutation } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { AttachmentMetadata, DecryptedMessage } from '@/types/api'
import { makeClientSideId } from '@/lib/messages'
import {
    appendOptimisticMessage,
    clearMessageWindow,
    getMessageWindowState,
    updateMessageStatus,
} from '@/lib/message-window-store'
import { usePlatform } from '@/hooks/usePlatform'
import { useSimpleToast } from '@/lib/simple-toast'

type SendMessageInput = {
    sessionId: string
    text: string
    localId: string
    createdAt: number
    attachments?: AttachmentMetadata[]
}

function findMessageByLocalId(
    sessionId: string,
    localId: string,
): DecryptedMessage | null {
    const state = getMessageWindowState(sessionId)
    for (const message of state.messages) {
        if (message.localId === localId) return message
    }
    for (const message of state.pending) {
        if (message.localId === localId) return message
    }
    return null
}

export function useSendMessage(api: ApiClient | null, sessionId: string | null): {
    sendMessage: (text: string, attachments?: AttachmentMetadata[]) => void
    retryMessage: (localId: string) => void
    isSending: boolean
} {
    const { haptic } = usePlatform()
    const toast = useSimpleToast()

    const mutation = useMutation({
        mutationFn: async (input: SendMessageInput) => {
            if (!api) {
                throw new Error('API unavailable')
            }

            // Send message to backend
            await api.sendMessage(input.sessionId, input.text, input.localId, input.attachments)

            // Detect clear command and handle after successful send
            const isClearCommand = input.text.trim() === '/clear'
            if (isClearCommand) {
                // Wait a bit for the backend to process and for the CLI to handle the clear
                // This gives the agent time to acknowledge the clear command
                await new Promise(resolve => setTimeout(resolve, 500))

                // Now clear the UI
                clearMessageWindow(input.sessionId)
                toast.success('Chat history cleared')
            }
        },
        onMutate: async (input) => {
            // Don't show /clear as an optimistic message - it will just be cleared anyway
            const isClearCommand = input.text.trim() === '/clear'
            if (isClearCommand) {
                return
            }

            const optimisticMessage: DecryptedMessage = {
                id: input.localId,
                seq: null,
                localId: input.localId,
                content: {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: input.text,
                        attachments: input.attachments
                    }
                },
                createdAt: input.createdAt,
                status: 'sending',
                originalText: input.text,
            }

            appendOptimisticMessage(input.sessionId, optimisticMessage)
        },
        onSuccess: (_, input) => {
            updateMessageStatus(input.sessionId, input.localId, 'sent')
            haptic.notification('success')
        },
        onError: (_, input) => {
            updateMessageStatus(input.sessionId, input.localId, 'failed')
            haptic.notification('error')
        },
    })

    const sendMessage = (text: string, attachments?: AttachmentMetadata[]) => {
        if (!api || !sessionId) return
        if (mutation.isPending) return
        const localId = makeClientSideId('local')
        mutation.mutate({
            sessionId,
            text,
            localId,
            createdAt: Date.now(),
            attachments,
        })
    }

    const retryMessage = (localId: string) => {
        if (!api || !sessionId) return
        if (mutation.isPending) return

        const message = findMessageByLocalId(sessionId, localId)
        if (!message?.originalText) return

        updateMessageStatus(sessionId, localId, 'sending')

        mutation.mutate({
            sessionId,
            text: message.originalText,
            localId,
            createdAt: message.createdAt,
        })
    }

    return {
        sendMessage,
        retryMessage,
        isSending: mutation.isPending,
    }
}
