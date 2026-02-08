import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDraftPersistence } from './useDraftPersistence'
import type { ApiClient } from '@/api/client'

describe('useDraftPersistence', () => {
  let mockApi: ApiClient
  let mockAssistantApi: any
  let mockSetText: any

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    mockSetText = vi.fn()

    mockApi = {
      getDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn().mockResolvedValue({ text: '', timestamp: 0 }),
      clearDraft: vi.fn().mockResolvedValue(undefined),
    } as any

    mockAssistantApi = {
      composer: () => ({ setText: mockSetText }),
    }
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('Draft Restoration', () => {
    it('restores server draft when newer than local', async () => {
      localStorage.setItem('hapi-drafts', JSON.stringify({
        'session-1': { text: 'Local', timestamp: 1000 }
      }))

      mockApi.getDraft = vi.fn().mockResolvedValue({
        text: 'Server',
        timestamp: 2000
      })

      renderHook(() =>
        useDraftPersistence({
          sessionId: 'session-1',
          text: '',
          apiClient: mockApi,
          assistantApi: mockAssistantApi,
        })
      )

      await waitFor(() => {
        expect(mockSetText).toHaveBeenCalledWith('Server')
      })
    })

    it('keeps local draft when newer than server', async () => {
      localStorage.setItem('hapi-drafts', JSON.stringify({
        'session-1': { text: 'Local', timestamp: 3000 }
      }))

      mockApi.getDraft = vi.fn().mockResolvedValue({
        text: 'Server',
        timestamp: 1000
      })

      renderHook(() =>
        useDraftPersistence({
          sessionId: 'session-1',
          text: '',
          apiClient: mockApi,
          assistantApi: mockAssistantApi,
        })
      )

      await waitFor(() => {
        expect(mockSetText).toHaveBeenCalledWith('Local')
      })
    })

    it('falls back to localStorage when API fails', async () => {
      localStorage.setItem('hapi-drafts', JSON.stringify({
        'session-1': { text: 'Fallback', timestamp: 1000 }
      }))

      mockApi.getDraft = vi.fn().mockRejectedValue(new Error('Network error'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      renderHook(() =>
        useDraftPersistence({
          sessionId: 'session-1',
          text: '',
          apiClient: mockApi,
          assistantApi: mockAssistantApi,
        })
      )

      await waitFor(() => {
        expect(mockSetText).toHaveBeenCalledWith('Fallback')
      })

      consoleSpy.mockRestore()
    })

    it('only restores draft once per session', async () => {
      mockApi.getDraft = vi.fn().mockResolvedValue({
        text: 'Draft',
        timestamp: 1000
      })

      const { rerender } = renderHook(
        ({ text }) =>
          useDraftPersistence({
            sessionId: 'session-1',
            text,
            apiClient: mockApi,
            assistantApi: mockAssistantApi,
          }),
        { initialProps: { text: '' } }
      )

      await waitFor(() => {
        expect(mockApi.getDraft).toHaveBeenCalledTimes(1)
      })

      rerender({ text: 'Hello' })

      expect(mockApi.getDraft).toHaveBeenCalledTimes(1)
    })

    it('does not restore when enabled is false', async () => {
      mockApi.getDraft = vi.fn().mockResolvedValue({
        text: 'Draft',
        timestamp: 1000
      })

      renderHook(() =>
        useDraftPersistence({
          sessionId: 'session-1',
          text: '',
          apiClient: mockApi,
          assistantApi: mockAssistantApi,
          enabled: false,
        })
      )

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockApi.getDraft).not.toHaveBeenCalled()
    })
  })

  describe('Manual Clear', () => {
    it('clears draft when clearDraft is called', async () => {
      const { result } = renderHook(() =>
        useDraftPersistence({
          sessionId: 'session-1',
          text: 'Hello',
          apiClient: mockApi,
          assistantApi: mockAssistantApi,
        })
      )

      await waitFor(() => {
        expect(mockApi.getDraft).toHaveBeenCalled()
      })

      await result.current.clearDraft()

      expect(mockApi.clearDraft).toHaveBeenCalledWith('session-1')
    })

    it('handles clear errors gracefully', async () => {
      mockApi.clearDraft = vi.fn().mockRejectedValue(new Error('Network error'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() =>
        useDraftPersistence({
          sessionId: 'session-1',
          text: 'Hello',
          apiClient: mockApi,
          assistantApi: mockAssistantApi,
        })
      )

      await waitFor(() => {
        expect(mockApi.getDraft).toHaveBeenCalled()
      })

      await result.current.clearDraft()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clear draft'),
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })
  })
})
