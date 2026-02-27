import { Hono } from 'hono'
import type { WebAppEnv } from '../middleware/auth'
import version from '../../version.generated'

export function createVersionRoutes(): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/version', (c) => {
        return c.json(version)
    })

    return app
}
