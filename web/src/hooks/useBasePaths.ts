import { useCallback } from 'react'

export function useBasePaths(serverBasePaths: string[] = []) {
    const getBasePaths = useCallback((_machineId: string | null): string[] => {
        return serverBasePaths
    }, [serverBasePaths])

    return {
        getBasePaths
    }
}
