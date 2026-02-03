import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface PWAUpdateContextValue {
    version: {
        sha: string
        shortSha: string
        buildTime: string
        isDirty: boolean
        gitDescribe: string
    }
    embeddedVersion: {
        sha: string
        shortSha: string
        buildTime: string
        isDirty: boolean
        gitDescribe: string
    } | null
    isOutOfSync: boolean
    checkForUpdate: () => Promise<void>
    forceReload: () => void
    isChecking: boolean
}

const PWAUpdateContext = createContext<PWAUpdateContextValue | null>(null)

interface PWAUpdateProviderProps {
    children: ReactNode
}

export function PWAUpdateProvider({ children }: PWAUpdateProviderProps) {
    const [version, setVersion] = useState({
        sha: 'unknown',
        shortSha: 'unknown',
        buildTime: 'unknown',
        isDirty: false,
        gitDescribe: 'unknown'
    })
    const [embeddedVersion, setEmbeddedVersion] = useState<typeof version | null>(null)
    const [isOutOfSync, setIsOutOfSync] = useState(false)
    const [isChecking, setIsChecking] = useState(false)

    useEffect(() => {
        // First, read embedded version from meta tags
        const versionMeta = document.querySelector('meta[name="app-version"]')
        const shortVersionMeta = document.querySelector('meta[name="app-version-short"]')
        const buildTimeMeta = document.querySelector('meta[name="app-build-time"]')
        const dirtyMeta = document.querySelector('meta[name="app-version-dirty"]')
        const describeMeta = document.querySelector('meta[name="app-version-describe"]')

        const embedded = {
            sha: versionMeta?.getAttribute('content') || 'unknown',
            shortSha: shortVersionMeta?.getAttribute('content') || 'unknown',
            buildTime: buildTimeMeta?.getAttribute('content') || 'unknown',
            isDirty: dirtyMeta?.getAttribute('content') === 'true',
            gitDescribe: describeMeta?.getAttribute('content') || 'unknown'
        }
        setEmbeddedVersion(embedded)

        // Then fetch current version from API
        fetch('/api/version')
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch version')
                return res.json()
            })
            .then((data: {
                sha: string
                shortSha: string
                branch: string
                isDirty: boolean
                gitDescribe: string
                commitTime: string
                buildTime: string
            }) => {
                const serverVersion = {
                    sha: data.sha,
                    shortSha: data.shortSha,
                    buildTime: data.buildTime,
                    isDirty: data.isDirty,
                    gitDescribe: data.gitDescribe
                }
                setVersion(serverVersion)

                // Compare versions - if shortSha differs, we're out of sync
                const outOfSync = embedded.shortSha !== data.shortSha && embedded.shortSha !== 'unknown'
                setIsOutOfSync(outOfSync)
            })
            .catch(() => {
                // Offline - just use embedded version
                setVersion(embedded)
                setIsOutOfSync(false)
            })
    }, [])

    const checkForUpdate = async () => {
        setIsChecking(true)
        try {
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.getRegistration()
                if (registration) {
                    await registration.update()
                    // Give it a moment to install new SW
                    await new Promise(resolve => setTimeout(resolve, 1000))
                }
            }
        } finally {
            setIsChecking(false)
        }
    }

    const forceReload = () => {
        // Unregister service worker and hard reload
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (const registration of registrations) {
                    registration.unregister()
                }
                window.location.reload()
            })
        } else {
            window.location.reload()
        }
    }

    const value: PWAUpdateContextValue = {
        version,
        embeddedVersion,
        isOutOfSync,
        checkForUpdate,
        forceReload,
        isChecking
    }

    return (
        <PWAUpdateContext.Provider value={value}>
            {children}
        </PWAUpdateContext.Provider>
    )
}

export function usePWAUpdate() {
    const context = useContext(PWAUpdateContext)
    if (!context) {
        throw new Error('usePWAUpdate must be used within PWAUpdateProvider')
    }
    return context
}
