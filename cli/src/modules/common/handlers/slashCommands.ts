import { logger } from '@/ui/logger'
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { listSlashCommands, INTERCEPTED_COMMANDS, type ListSlashCommandsResponse } from '../slashCommands'
import { getErrorMessage, rpcError } from '../rpcResponses'
import type { ApiSessionClient } from '@/api/apiSession'

export function registerSlashCommandHandlers(
    rpcHandlerManager: RpcHandlerManager,
    getApiSession: () => ApiSessionClient | null
): void {
    rpcHandlerManager.registerHandler<void, ListSlashCommandsResponse>('listSlashCommands', async () => {
        logger.debug('List slash commands request')

        try {
            const apiSession = getApiSession();
            const metadata = apiSession?.getMetadata();

            // Check if metadata extraction is still in progress
            if (apiSession && !metadata?.slashCommands) {
                logger.debug('Metadata extraction in progress, returning loading state')
                return {
                    success: true,
                    loading: true,
                    commands: INTERCEPTED_COMMANDS
                };
            }

            // If API session has complete metadata with slashCommands, use it (cached)
            if (metadata?.slashCommands) {
                logger.debug('Returning slash commands from session metadata, count:', metadata.slashCommands.length)
                return {
                    success: true,
                    loading: false,
                    commands: metadata.slashCommands
                };
            }

            // Fallback: if metadata missing entirely
            logger.debug('Falling back to hardcoded slash commands')
            const commands = listSlashCommands()
            return { success: true, loading: false, commands }
        } catch (error) {
            logger.debug('Failed to list slash commands:', error)
            return rpcError(getErrorMessage(error, 'Failed to list slash commands'))
        }
    })
}
