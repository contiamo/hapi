import { beforeEach } from 'vitest'

// Mock localStorage for tests
class LocalStorageMock {
    private store: Map<string, string> = new Map()

    getItem(key: string): string | null {
        return this.store.get(key) ?? null
    }

    setItem(key: string, value: string): void {
        this.store.set(key, value)
    }

    removeItem(key: string): void {
        this.store.delete(key)
    }

    clear(): void {
        this.store.clear()
    }

    get length(): number {
        return this.store.size
    }

    key(index: number): string | null {
        const keys = Array.from(this.store.keys())
        return keys[index] ?? null
    }
}

// Setup localStorage mock before each test
beforeEach(() => {
    const localStorageMock = new LocalStorageMock()
    global.localStorage = localStorageMock as any
})
