import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs))
}

/**
 * Decode base64 string to UTF-8 text
 */
export function decodeBase64(value: string): { text: string; ok: boolean } {
    try {
        const binaryString = atob(value)
        const bytes = Uint8Array.from(binaryString, (char) => char.charCodeAt(0))
        const text = new TextDecoder('utf-8').decode(bytes)
        return { text, ok: true }
    } catch {
        return { text: '', ok: false }
    }
}

/**
 * Encode UTF-8 text to base64 string
 */
export function encodeBase64(value: string): string {
    const bytes = new TextEncoder().encode(value)
    const binaryString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
    return btoa(binaryString)
}

/**
 * Debounce a function call
 */
export function debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
): T & { cancel: () => void } {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const debounced = function (this: any, ...args: Parameters<T>) {
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = setTimeout(() => fn.apply(this, args), delay)
    } as T & { cancel: () => void }

    debounced.cancel = () => {
        if (timeoutId) clearTimeout(timeoutId)
    }

    return debounced
}

