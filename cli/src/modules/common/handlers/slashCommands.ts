import { logger } from '@/ui/logger'
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { listSlashCommands, type ListSlashCommandsRequest, type ListSlashCommandsResponse } from '../slashCommands'
import { getErrorMessage, rpcError } from '../rpcResponses'
import type { ApiSessionClient } from '@/api/apiSession'
import type { SlashCommand } from '@hapi/protocol/types'

// Minimal intercepted commands shown while metadata loads
const INTERCEPTED_COMMANDS: SlashCommand[] = [
    { name: 'clear', description: 'Complete context and session reset', source: 'builtin' },
    { name: 'compact', description: 'Compress context while preserving session', source: 'builtin' }
];

export function registerSlashCommandHandlers(
    rpcHandlerManager: RpcHandlerManager,
    getApiSession: () => ApiSessionClient | null
): void {
    rpcHandlerManager.registerHandler<ListSlashCommandsRequest, ListSlashCommandsResponse>('listSlashCommands', async (data) => {
        logger.debug('[RPC] ===== listSlashCommands called =====')
        logger.debug('[RPC] Request for agent:', data.agent)

        try {
            const apiSession = getApiSession();
            const metadata = apiSession?.getMetadata();

            logger.debug('[RPC] apiSession exists:', !!apiSession);
            logger.debug('[RPC] metadata exists:', !!metadata);
            logger.debug('[RPC] metadata.slashCommands exists:', !!metadata?.slashCommands);
            logger.debug('[RPC] metadata.slashCommands count:', metadata?.slashCommands?.length || 'none');

            // For Claude: Check if metadata extraction is still in progress
            if (data.agent === 'claude' && apiSession && !metadata?.slashCommands) {
                logger.debug('[RPC] Metadata extraction in progress, returning loading state')
                return {
                    success: true,
                    loading: true,
                    commands: INTERCEPTED_COMMANDS
                };
            }

            // If API session has complete metadata with slashCommands, use it (cached)
            if (metadata?.slashCommands) {
                logger.debug('[RPC] Returning complete slash commands from session metadata, count:', metadata.slashCommands.length)
                logger.debug('[RPC] Commands:', metadata.slashCommands.map(c => c.name).join(', '))
                return {
                    success: true,
                    loading: false,
                    commands: metadata.slashCommands
                };
            }

            // Fallback: Use old hardcoded list for non-Claude agents or if metadata missing
            logger.debug('Falling back to hardcoded slash commands')
            const commands = await listSlashCommands(data.agent)
            return { success: true, loading: false, commands }
        } catch (error) {
            logger.debug('Failed to list slash commands:', error)
            return rpcError(getErrorMessage(error, 'Failed to list slash commands'))
        }
    })
}
