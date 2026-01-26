import { Hono } from 'hono'
import type { WebAppEnv } from '../middleware/auth'
// @ts-ignore - version.json is generated at build time
import versionFile from '../../../dist/version.json' assert { type: 'file' }
import { logger } from '../../lib/logger'

interface VersionInfo {
    sha: string
    shortSha: string
    branch: string
    isDirty: boolean
    commitTime: string
    buildTime: string
}

let cachedVersion: VersionInfo | null = null

async function loadVersion(): Promise<VersionInfo> {
    if (cachedVersion) {
        return cachedVersion
    }

    try {
        // Load version.json using Bun's file import
        const file = Bun.file(versionFile)
        const content = await file.text()
        cachedVersion = JSON.parse(content)
        return cachedVersion!
    } catch (error) {
        logger.error({ component: 'Version', error }, 'Failed to load version.json')
        // Fallback version
        cachedVersion = {
            sha: 'unknown',
            shortSha: 'unknown',
            branch: 'unknown',
            isDirty: false,
            commitTime: new Date().toISOString(),
            buildTime: new Date().toISOString(),
        }
        return cachedVersion
    }
}

export function createVersionRoutes(): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/version', async (c) => {
        const version = await loadVersion()
        return c.json(version)
    })

    return app
}
