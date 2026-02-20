import { describe, it, expect } from 'vitest';
import { parseRollback, parseSpecialCommand } from './specialCommands';

describe('parseSpecialCommand', () => {
    describe('/compact', () => {
        it('detects /compact with argument', () => {
            const result = parseSpecialCommand('/compact optimize the code');
            expect(result.type).toBe('compact');
            if (result.type === 'compact') expect(result.originalMessage).toBe('/compact optimize the code');
        });

        it('detects bare /compact', () => {
            const result = parseSpecialCommand('/compact');
            expect(result.type).toBe('compact');
        });

        it('does not match /compact embedded in a sentence', () => {
            expect(parseSpecialCommand('some /compact text').type).toBeNull();
        });

        it('does not match /compactor', () => {
            expect(parseSpecialCommand('/compactor').type).toBeNull();
        });
    });

    describe('/clear', () => {
        it('detects /clear exactly', () => {
            expect(parseSpecialCommand('/clear').type).toBe('clear');
        });

        it('detects /clear with surrounding whitespace', () => {
            expect(parseSpecialCommand('  /clear  ').type).toBe('clear');
        });

        it('does not match /clear with arguments', () => {
            expect(parseSpecialCommand('/clear something').type).toBeNull();
        });

        it('does not match /clearing', () => {
            expect(parseSpecialCommand('/clearing').type).toBeNull();
        });
    });

    describe('/rollback', () => {
        it('detects bare /rollback as 1 turn', () => {
            const result = parseSpecialCommand('/rollback');
            expect(result.type).toBe('rollback');
            if (result.type === 'rollback') expect(result.turns).toBe(1);
        });

        it('detects /rollback with a positive integer', () => {
            const result = parseSpecialCommand('/rollback 3');
            expect(result.type).toBe('rollback');
            if (result.type === 'rollback') expect(result.turns).toBe(3);
        });

        it('returns rollback_invalid for non-integer argument', () => {
            expect(parseSpecialCommand('/rollback abc').type).toBe('rollback_invalid');
        });

        it('returns rollback_invalid for zero', () => {
            expect(parseSpecialCommand('/rollback 0').type).toBe('rollback_invalid');
        });

        it('returns rollback_invalid for negative number', () => {
            expect(parseSpecialCommand('/rollback -1').type).toBe('rollback_invalid');
        });

        it('does not match /rollback embedded in a sentence', () => {
            expect(parseSpecialCommand('please /rollback this').type).toBeNull();
        });
    });

    it('returns null for regular messages', () => {
        expect(parseSpecialCommand('hello world').type).toBeNull();
    });
});

describe('parseRollback', () => {
    it('returns turns=1 for bare /rollback', () => {
        const result = parseRollback('/rollback');
        expect(result.type).toBe('rollback');
        if (result.type === 'rollback') expect(result.turns).toBe(1);
    });

    it('parses /rollback 5', () => {
        const result = parseRollback('/rollback 5');
        expect(result.type).toBe('rollback');
        if (result.type === 'rollback') expect(result.turns).toBe(5);
    });

    it('returns rollback_invalid for float', () => {
        expect(parseRollback('/rollback 1.5').type).toBe('rollback_invalid');
    });

    it('returns null for unrelated message', () => {
        expect(parseRollback('hello').type).toBeNull();
    });
});
