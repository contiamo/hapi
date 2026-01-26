/**
 * Admin routes for runtime configuration and debugging
 *
 * These endpoints require CLI_API_TOKEN authentication
 */

import type { Hono } from 'hono'
import { z } from 'zod'
import { getLogLevel, setGlobalLogLevel } from '../../lib/logger'
import type { WebAppEnv } from '../middleware/auth'

const LogLevelSchema = z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
})

export function registerAdminRoutes(app: Hono<WebAppEnv>) {
    /**
     * GET /api/admin/log-level
     * Get current log level
     */
    app.get('/api/admin/log-level', async (c) => {
        return c.json({
            level: getLogLevel()
        })
    })

    /**
     * POST /api/admin/log-level
     * Change log level at runtime without restart
     *
     * Body: { "level": "debug" | "info" | "warn" | "error" | "trace" | "fatal" }
     *
     * Example:
     *   curl -X POST http://localhost:3006/api/admin/log-level \
     *     -H "Authorization: Bearer $CLI_API_TOKEN" \
     *     -H "Content-Type: application/json" \
     *     -d '{"level":"debug"}'
     */
    app.post('/api/admin/log-level', async (c) => {
        try {
            const body = await c.req.json()
            const parsed = LogLevelSchema.safeParse(body)

            if (!parsed.success) {
                return c.json({
                    error: 'Invalid log level',
                    validLevels: ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
                }, 400)
            }

            const previousLevel = getLogLevel()
            setGlobalLogLevel(parsed.data.level)

            return c.json({
                success: true,
                previousLevel,
                newLevel: parsed.data.level
            })
        } catch (error) {
            return c.json({
                error: 'Failed to parse request body'
            }, 400)
        }
    })
}
