import { Hono } from 'hono'
import { z } from 'zod'
import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'
import { requireSessionFromParam } from './guards'

const saveDraftBodySchema = z.object({
    text: z.string().max(10000), // 10KB limit
    timestamp: z.number().int().positive()
})

export function createDraftsRoutes(getStore: () => Store | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    // GET /api/sessions/:id/draft
    app.get('/:id/draft', async (c) => {
        const store = getStore()
        if (!store) {
            return c.json({ error: 'Store not initialized' }, 503)
        }

        const sessionId = c.req.param('id')
        const namespace = c.get('namespace')

        // Verify session access (namespace check)
        const session = store.sessions.getSession(sessionId, namespace)
        if (!session) {
            return c.json({ error: 'Session not found' }, 404)
        }

        const draft = store.drafts.getDraft(sessionId, namespace)
        return c.json({ draft })
    })

    // PUT /api/sessions/:id/draft
    app.put('/:id/draft', async (c) => {
        const store = getStore()
        if (!store) {
            return c.json({ error: 'Store not initialized' }, 503)
        }

        const sessionId = c.req.param('id')
        const namespace = c.get('namespace')

        const body = await c.req.json().catch(() => null)
        const parsed = saveDraftBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body', details: parsed.error }, 400)
        }

        const session = store.sessions.getSession(sessionId, namespace)
        if (!session) {
            return c.json({ error: 'Session not found' }, 404)
        }

        // Last-write-wins logic in setDraft (may return different draft if rejected)
        const draft = store.drafts.setDraft(sessionId, namespace, parsed.data.text, parsed.data.timestamp)

        return c.json({ draft })
    })

    // DELETE /api/sessions/:id/draft
    app.delete('/:id/draft', async (c) => {
        const store = getStore()
        if (!store) {
            return c.json({ error: 'Store not initialized' }, 503)
        }

        const sessionId = c.req.param('id')
        const namespace = c.get('namespace')

        const session = store.sessions.getSession(sessionId, namespace)
        if (!session) {
            return c.json({ error: 'Session not found' }, 404)
        }

        store.drafts.clearDraft(sessionId, namespace)

        return c.json({ ok: true })
    })

    return app
}
