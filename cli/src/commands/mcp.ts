import { runHappyMcpStdioBridge } from '@/claude/happyMcpStdioBridge'
import type { CommandDefinition } from './types'

export const mcpCommand: CommandDefinition = {
    name: 'mcp',
    requiresRuntimeAssets: false,
    run: async ({ commandArgs }) => {
        await runHappyMcpStdioBridge(commandArgs)
    }
}
