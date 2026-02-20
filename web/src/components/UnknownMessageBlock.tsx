import { useState, useEffect, useRef } from 'react'
import { safeStringify, isObject } from '@hapi/protocol'

function getMessageType(raw: unknown): string {
    if (!isObject(raw)) return 'unknown'
    // Unwrap output envelope to show the inner type
    if (raw.type === 'output' && isObject(raw.data) && typeof raw.data.type === 'string') {
        return raw.data.type
    }
    if (typeof raw.type === 'string') return raw.type
    return 'unknown'
}

export function UnknownMessageBlock(props: { raw: unknown }) {
    const [copied, setCopied] = useState(false)
    const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const json = safeStringify(props.raw)
    const messageType = getMessageType(props.raw)

    useEffect(() => {
        return () => {
            if (resetTimer.current !== null) clearTimeout(resetTimer.current)
        }
    }, [])

    function handleCopy() {
        navigator.clipboard.writeText(json).then(() => {
            setCopied(true)
            if (resetTimer.current !== null) clearTimeout(resetTimer.current)
            resetTimer.current = setTimeout(() => setCopied(false), 1500)
        }).catch(() => {
            // clipboard write failed silently; nothing actionable to show
        })
    }

    return (
        <details className="rounded border border-[var(--app-border)] text-xs">
            <summary className="flex cursor-pointer select-none items-center gap-1.5 px-2 py-1.5 text-[var(--app-hint)]">
                <span className="font-mono opacity-70">?</span>
                <span>Unknown message type: <span className="font-mono">{messageType}</span></span>
            </summary>
            <div className="border-t border-[var(--app-border)]">
                <div className="flex items-center justify-end px-2 py-1">
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="text-[var(--app-hint)] hover:text-[var(--app-fg)] transition-colors"
                    >
                        {copied ? 'Copied' : 'Copy JSON'}
                    </button>
                </div>
                <pre className="overflow-x-auto px-2 pb-2 font-mono text-[0.7rem] leading-relaxed text-[var(--app-hint)]">
                    {json}
                </pre>
            </div>
        </details>
    )
}
