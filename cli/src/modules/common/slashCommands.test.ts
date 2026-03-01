import { describe, it, expect } from 'vitest'
import { buildSlashCommandList } from './slashCommands'

describe('buildSlashCommandList', () => {
    it('returns only intercepted commands when no SDK commands provided', () => {
        const result = buildSlashCommandList(undefined)
        expect(result).toHaveLength(3)
        expect(result.map(c => c.name)).toEqual(['clear', 'compact', 'rollback'])
        expect(result[0].source).toBe('builtin')
        expect(result[1].source).toBe('builtin')
        expect(result[2].source).toBe('builtin')
    })

    it('merges SDK commands with intercepted commands', () => {
        const result = buildSlashCommandList(['skills', 'help', 'review'])
        expect(result).toHaveLength(6)
        expect(result[0].name).toBe('clear')
        expect(result[0].source).toBe('builtin')
        expect(result[1].name).toBe('compact')
        expect(result[1].source).toBe('builtin')
        expect(result[2].name).toBe('rollback')
        expect(result[2].source).toBe('builtin')
        expect(result[3].name).toBe('skills')
        expect(result[3].source).toBe('claude')
        expect(result[4].name).toBe('help')
        expect(result[4].source).toBe('claude')
        expect(result[5].name).toBe('review')
        expect(result[5].source).toBe('claude')
    })

    it('filters out TUI-only commands that produce no output in remote mode', () => {
        const result = buildSlashCommandList(['review', 'context', 'cost', 'init', 'debug'])
        const names = result.map(c => c.name)
        expect(names).not.toContain('context')
        expect(names).not.toContain('cost')
        expect(names).not.toContain('init')
        expect(names).toContain('review')
        expect(names).toContain('debug')
    })

    it('deduplicates if SDK reports intercepted commands', () => {
        const result = buildSlashCommandList(['clear', 'skills', 'compact'])
        expect(result).toHaveLength(4)
        expect(result.filter(c => c.name === 'clear')).toHaveLength(1)
        expect(result.filter(c => c.name === 'clear')[0].source).toBe('builtin')
        expect(result.filter(c => c.name === 'compact')).toHaveLength(1)
        expect(result.filter(c => c.name === 'compact')[0].source).toBe('builtin')
        expect(result[3].name).toBe('skills')
        expect(result[3].source).toBe('claude')
    })

    it('returns only intercepted when SDK commands is empty array', () => {
        const result = buildSlashCommandList([])
        expect(result).toHaveLength(3)
        expect(result.map(c => c.name)).toEqual(['clear', 'compact', 'rollback'])
    })

    it('preserves intercepted command descriptions', () => {
        const result = buildSlashCommandList(['clear', 'compact'])
        const clearCmd = result.find(c => c.name === 'clear')
        const compactCmd = result.find(c => c.name === 'compact')

        expect(clearCmd?.description).toContain('Nuclear option')
        expect(compactCmd?.description).toContain('isolated')
    })

    it('assigns generic description to Claude Code commands', () => {
        const result = buildSlashCommandList(['skills'])
        const skillsCmd = result.find(c => c.name === 'skills')

        expect(skillsCmd?.description).toBe('Claude Code command')
    })

    it('handles complex scenario: intercepted + Claude Code commands, TUI-only filtered', () => {
        const result = buildSlashCommandList(['skills', 'help', 'context'])

        // context is TUI-only so filtered out
        expect(result).toHaveLength(5)
        expect(result[0].name).toBe('clear')
        expect(result[0].source).toBe('builtin')
        expect(result[1].name).toBe('compact')
        expect(result[1].source).toBe('builtin')
        expect(result[2].name).toBe('rollback')
        expect(result[2].source).toBe('builtin')
        expect(result[3].name).toBe('skills')
        expect(result[3].source).toBe('claude')
        expect(result[4].name).toBe('help')
        expect(result[4].source).toBe('claude')
        expect(result.map(c => c.name)).not.toContain('context')
    })
})
