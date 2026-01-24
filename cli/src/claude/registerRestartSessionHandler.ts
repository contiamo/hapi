import type { RpcHandlerManager } from "@/api/rpc/RpcHandlerManager"
import { logger } from "@/lib"

interface RestartSessionRequest {
    // No parameters needed
}

interface RestartSessionResponse {
    success: boolean
    message: string
}

/**
 * Registers the restart session RPC handler.
 *
 * NOTE: This is a placeholder implementation. Restarting a session properly
 * requires spawning a new CLI process with the same configuration, which is
 * a complex operation that should be handled by the runner/control server.
 *
 * For now, this returns an error indicating the feature is not yet implemented.
 * Users should close the inactive session and create a new one manually.
 */
export function registerRestartSessionHandler(
    rpcHandlerManager: RpcHandlerManager
) {
    rpcHandlerManager.registerHandler<RestartSessionRequest, RestartSessionResponse>('restartSession', async () => {
        logger.warn('Restart session request received - feature not yet fully implemented')

        // Return error indicating this feature needs proper implementation
        throw new Error('Session restart is not yet supported. Please create a new session.')
    })
}
