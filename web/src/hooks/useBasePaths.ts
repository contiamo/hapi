import { useCallback, useState, useEffect } from 'react'

const STORAGE_KEY = 'hapi:basePaths'
const MAX_BASE_PATHS_PER_MACHINE = 10

type BasePathsMap = Record<string, string[]>

export function useBasePaths() {
    const [basePathsMap, setBasePathsMap] = useState<BasePathsMap>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY)
            if (stored) {
                const parsed = JSON.parse(stored) as BasePathsMap
                return parsed
            }
        } catch {
            // Ignore parse errors
        }
        return {}
    })

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(basePathsMap))
        } catch {
            // Ignore storage errors
        }
    }, [basePathsMap])

    const getBasePaths = useCallback((machineId: string | null): string[] => {
        if (!machineId) return []
        return basePathsMap[machineId] ?? []
    }, [basePathsMap])

    const setBasePaths = useCallback((machineId: string, paths: string[]) => {
        setBasePathsMap((prev) => ({
            ...prev,
            [machineId]: paths.slice(0, MAX_BASE_PATHS_PER_MACHINE)
        }))
    }, [])

    const addBasePath = useCallback((machineId: string, path: string) => {
        setBasePathsMap((prev) => {
            const current = prev[machineId] ?? []
            if (current.includes(path)) return prev
            const updated = [path, ...current].slice(0, MAX_BASE_PATHS_PER_MACHINE)
            return {
                ...prev,
                [machineId]: updated
            }
        })
    }, [])

    const removeBasePath = useCallback((machineId: string, path: string) => {
        setBasePathsMap((prev) => {
            const current = prev[machineId] ?? []
            const updated = current.filter(p => p !== path)
            if (updated.length === current.length) return prev
            return {
                ...prev,
                [machineId]: updated
            }
        })
    }, [])

    return {
        getBasePaths,
        setBasePaths,
        addBasePath,
        removeBasePath
    }
}
