import { describe, it, expect } from 'vitest'
import { buildSlashCommandList } from './slashCommands'
import type { SlashCommand } from '@hapi/protocol/types'

describe('buildSlashCommandList', () => {
    it('returns only intercepted commands when no SDK commands provided', () => {
        const result = buildSlashCommandList('claude', undefined)
        expect(result).toHaveLength(2)
        expect(result.map(c => c.name)).toEqual(['clear', 'compact'])
        expect(result[0].source).toBe('builtin')
        expect(result[1].source).toBe('builtin')
    })

    it('merges SDK commands with intercepted commands', () => {
        const result = buildSlashCommandList('claude', ['skills', 'help', 'context'])
        expect(result).toHaveLength(5)
        expect(result[0].name).toBe('clear')
        expect(result[0].source).toBe('builtin')
        expect(result[1].name).toBe('compact')
        expect(result[1].source).toBe('builtin')
        expect(result[2].name).toBe('skills')
        expect(result[2].source).toBe('claude')
        expect(result[3].name).toBe('help')
        expect(result[3].source).toBe('claude')
        expect(result[4].name).toBe('context')
        expect(result[4].source).toBe('claude')
    })

    it('deduplicates if SDK reports intercepted commands', () => {
        const result = buildSlashCommandList('claude', ['clear', 'skills', 'compact'])
        expect(result).toHaveLength(3)
        expect(result.filter(c => c.name === 'clear')).toHaveLength(1)
        expect(result.filter(c => c.name === 'clear')[0].source).toBe('builtin')
        expect(result.filter(c => c.name === 'compact')).toHaveLength(1)
        expect(result.filter(c => c.name === 'compact')[0].source).toBe('builtin')
        expect(result[2].name).toBe('skills')
        expect(result[2].source).toBe('claude')
    })

    it('returns only intercepted for non-Claude agents', () => {
        const result = buildSlashCommandList('gemini', ['some-command'])
        expect(result).toHaveLength(2)
        expect(result.map(c => c.name)).toEqual(['clear', 'compact'])
    })

    it('returns only intercepted when SDK commands is empty array', () => {
        const result = buildSlashCommandList('claude', [])
        expect(result).toHaveLength(2)
        expect(result.map(c => c.name)).toEqual(['clear', 'compact'])
    })

    it('preserves intercepted command descriptions', () => {
        const result = buildSlashCommandList('claude', ['clear', 'compact'])
        const clearCmd = result.find(c => c.name === 'clear')
        const compactCmd = result.find(c => c.name === 'compact')

        expect(clearCmd?.description).toContain('nuclear option')
        expect(compactCmd?.description).toContain('isolated')
    })

    it('assigns generic description to Claude Code commands', () => {
        const result = buildSlashCommandList('claude', ['skills'])
        const skillsCmd = result.find(c => c.name === 'skills')

        expect(skillsCmd?.description).toBe('Claude Code command')
    })

    it('ignores user commands for Claude (init message already includes them)', () => {
        const userCommands: SlashCommand[] = [
            { name: 'mycommand', description: 'My custom command', source: 'user' },
            { name: 'another', description: 'Another command', source: 'user' }
        ]
        const result = buildSlashCommandList('claude', ['skills'], userCommands)

        // user commands are ignored - the Claude Code init message already covers everything
        expect(result).toHaveLength(3)
        expect(result[0].name).toBe('clear')
        expect(result[0].source).toBe('builtin')
        expect(result[1].name).toBe('compact')
        expect(result[1].source).toBe('builtin')
        expect(result[2].name).toBe('skills')
        expect(result[2].source).toBe('claude')
    })

    it('ignores user commands that conflict with intercepted (Claude)', () => {
        const userCommands: SlashCommand[] = [
            { name: 'clear', description: 'User clear', source: 'user' },
            { name: 'mycommand', description: 'My command', source: 'user' }
        ]
        const result = buildSlashCommandList('claude', undefined, userCommands)

        // user commands ignored for Claude regardless
        expect(result).toHaveLength(2)
        const clearCmd = result.find(c => c.name === 'clear')
        expect(clearCmd?.source).toBe('builtin')
        expect(clearCmd?.description).toContain('nuclear option')
    })

    it('Claude Code command wins over same-named user command', () => {
        const userCommands: SlashCommand[] = [
            { name: 'skills', description: 'User skills', source: 'user' },
            { name: 'mycommand', description: 'My command', source: 'user' }
        ]
        const result = buildSlashCommandList('claude', ['skills'], userCommands)

        // user commands ignored; skills comes from Claude Code init message
        expect(result).toHaveLength(3)
        const skillsCmd = result.find(c => c.name === 'skills')
        expect(skillsCmd?.source).toBe('claude')
        expect(skillsCmd?.description).toBe('Claude Code command')
    })

    it('handles empty user commands array', () => {
        const result = buildSlashCommandList('claude', ['skills'], [])
        expect(result).toHaveLength(3)
        expect(result.map(c => c.name)).toEqual(['clear', 'compact', 'skills'])
    })

    it('handles complex scenario: intercepted + Claude Code commands, user commands ignored', () => {
        const userCommands: SlashCommand[] = [
            { name: 'clear', description: 'User clear (should be ignored)', source: 'user' },
            { name: 'skills', description: 'User skills (should be ignored)', source: 'user' },
            { name: 'custom1', description: 'Custom command 1', source: 'user' },
            { name: 'custom2', description: 'Custom command 2', source: 'user' }
        ]
        const result = buildSlashCommandList('claude', ['skills', 'help', 'context'], userCommands)

        // user commands are all ignored for Claude
        expect(result).toHaveLength(5)
        expect(result[0].name).toBe('clear')
        expect(result[0].source).toBe('builtin')
        expect(result[1].name).toBe('compact')
        expect(result[1].source).toBe('builtin')
        expect(result[2].name).toBe('skills')
        expect(result[2].source).toBe('claude')
        expect(result[3].name).toBe('help')
        expect(result[3].source).toBe('claude')
        expect(result[4].name).toBe('context')
        expect(result[4].source).toBe('claude')
    })
})
