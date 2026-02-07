import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getDraft, getDraftWithTimestamp, saveDraft, clearDraft, getAllDrafts, mergeDrafts, type DraftData } from './draft-store'

describe('draft-store', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    afterEach(() => {
        localStorage.clear()
    })

    describe('saveDraft', () => {
        it('should save draft to localStorage', () => {
            saveDraft('session-1', 'Hello world')

            const stored = localStorage.getItem('hapi-drafts')
            expect(stored).toBeTruthy()

            const parsed = JSON.parse(stored!)
            expect(parsed['session-1']).toBeDefined()
            expect(parsed['session-1'].text).toBe('Hello world')
            expect(parsed['session-1'].timestamp).toBeTypeOf('number')
        })

        it('should trim whitespace before saving', () => {
            saveDraft('session-1', '  Hello world  ')

            const draft = getDraft('session-1')
            expect(draft).toBe('Hello world')
        })

        it('should not save empty strings', () => {
            saveDraft('session-1', '   ')

            const draft = getDraft('session-1')
            expect(draft).toBeNull()
        })

        it('should truncate drafts exceeding max length', () => {
            const longText = 'a'.repeat(15000)
            saveDraft('session-1', longText)

            const draft = getDraft('session-1')
            expect(draft?.length).toBe(10000)
        })

        it('should use custom timestamp if provided', () => {
            const customTimestamp = 1234567890
            saveDraft('session-1', 'Test', customTimestamp)

            const data = getDraftWithTimestamp('session-1')
            expect(data?.timestamp).toBe(customTimestamp)
        })

        it('should handle multiple sessions', () => {
            saveDraft('session-1', 'Draft 1')
            saveDraft('session-2', 'Draft 2')
            saveDraft('session-3', 'Draft 3')

            expect(getDraft('session-1')).toBe('Draft 1')
            expect(getDraft('session-2')).toBe('Draft 2')
            expect(getDraft('session-3')).toBe('Draft 3')
        })

        it('should do nothing with empty sessionId', () => {
            saveDraft('', 'Test')
            const all = getAllDrafts()
            expect(Object.keys(all).length).toBe(0)
        })
    })

    describe('getDraft', () => {
        it('should return draft text', () => {
            saveDraft('session-1', 'Hello')
            expect(getDraft('session-1')).toBe('Hello')
        })

        it('should return null for non-existent draft', () => {
            expect(getDraft('non-existent')).toBeNull()
        })

        it('should return null for empty sessionId', () => {
            expect(getDraft('')).toBeNull()
        })
    })

    describe('getDraftWithTimestamp', () => {
        it('should return full draft data', () => {
            const timestamp = Date.now()
            saveDraft('session-1', 'Hello', timestamp)

            const data = getDraftWithTimestamp('session-1')
            expect(data).toEqual({
                text: 'Hello',
                timestamp
            })
        })

        it('should return null for non-existent draft', () => {
            expect(getDraftWithTimestamp('non-existent')).toBeNull()
        })
    })

    describe('clearDraft', () => {
        it('should remove draft from storage', () => {
            saveDraft('session-1', 'Hello')
            expect(getDraft('session-1')).toBe('Hello')

            clearDraft('session-1')
            expect(getDraft('session-1')).toBeNull()
        })

        it('should only remove specified session', () => {
            saveDraft('session-1', 'Draft 1')
            saveDraft('session-2', 'Draft 2')

            clearDraft('session-1')

            expect(getDraft('session-1')).toBeNull()
            expect(getDraft('session-2')).toBe('Draft 2')
        })

        it('should handle clearing non-existent draft', () => {
            expect(() => clearDraft('non-existent')).not.toThrow()
        })

        it('should do nothing with empty sessionId', () => {
            saveDraft('session-1', 'Test')
            clearDraft('')
            expect(getDraft('session-1')).toBe('Test')
        })
    })

    describe('getAllDrafts', () => {
        it('should return all drafts', () => {
            saveDraft('session-1', 'Draft 1', 1000)
            saveDraft('session-2', 'Draft 2', 2000)

            const all = getAllDrafts()
            expect(Object.keys(all).length).toBe(2)
            expect(all['session-1'].text).toBe('Draft 1')
            expect(all['session-2'].text).toBe('Draft 2')
        })

        it('should return empty object when no drafts', () => {
            const all = getAllDrafts()
            expect(all).toEqual({})
        })
    })

    describe('mergeDrafts', () => {
        it('should return remote when local is null', () => {
            const remote: DraftData = { text: 'Remote', timestamp: 1000 }
            expect(mergeDrafts(null, remote)).toBe(remote)
        })

        it('should return local when remote is null', () => {
            const local: DraftData = { text: 'Local', timestamp: 1000 }
            expect(mergeDrafts(local, null)).toBe(local)
        })

        it('should return null when both are null', () => {
            expect(mergeDrafts(null, null)).toBeNull()
        })

        it('should return draft with newer timestamp', () => {
            const older: DraftData = { text: 'Old', timestamp: 1000 }
            const newer: DraftData = { text: 'New', timestamp: 2000 }

            expect(mergeDrafts(older, newer)).toBe(newer)
            expect(mergeDrafts(newer, older)).toBe(newer)
        })

        it('should return remote when timestamps are equal (tie goes to remote)', () => {
            const local: DraftData = { text: 'Local', timestamp: 1000 }
            const remote: DraftData = { text: 'Remote', timestamp: 1000 }

            // When timestamps are equal, remote wins (consistent with >= logic)
            expect(mergeDrafts(local, remote)).toBe(remote)
        })
    })

    describe('SSR safety', () => {
        it('should handle window being undefined', () => {
            const windowSpy = vi.spyOn(global, 'window', 'get')
            windowSpy.mockReturnValue(undefined as any)

            expect(() => saveDraft('session-1', 'Test')).not.toThrow()
            expect(() => clearDraft('session-1')).not.toThrow()
            expect(() => getAllDrafts()).not.toThrow()

            windowSpy.mockRestore()
        })
    })

    describe('error handling', () => {
        it('should handle corrupted localStorage data', () => {
            localStorage.setItem('hapi-drafts', 'invalid json{')

            expect(() => getAllDrafts()).not.toThrow()
            expect(getAllDrafts()).toEqual({})
        })

        it('should handle invalid draft data types', () => {
            localStorage.setItem('hapi-drafts', JSON.stringify({
                'session-1': { text: 123, timestamp: 'invalid' },
                'session-2': 'not an object',
                'session-3': { text: 'valid', timestamp: 1000 }
            }))

            const all = getAllDrafts()
            expect(all['session-1']).toBeUndefined()
            expect(all['session-2']).toBeUndefined()
            expect(all['session-3']).toBeDefined()
            expect(all['session-3'].text).toBe('valid')
        })

        it('should handle localStorage quota exceeded', () => {
            const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
            setItemSpy.mockImplementation(() => {
                throw new Error('QuotaExceededError')
            })

            expect(() => saveDraft('session-1', 'Test')).not.toThrow()

            setItemSpy.mockRestore()
        })
    })

    describe('empty draft handling', () => {
        it('should clear draft when saving empty string', () => {
            saveDraft('session-1', 'Hello')
            expect(getDraft('session-1')).toBe('Hello')

            saveDraft('session-1', '')
            expect(getDraft('session-1')).toBeNull()
        })

        it('should clear draft when saving only whitespace', () => {
            saveDraft('session-1', 'Hello')
            expect(getDraft('session-1')).toBe('Hello')

            saveDraft('session-1', '   \n  \t  ')
            expect(getDraft('session-1')).toBeNull()
        })
    })
})
