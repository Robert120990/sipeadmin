const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
    parseCommitMessage,
    computeCommitKpis,
    filterCommits
} = require('../routes/githubChanges');

describe('GitHub Changes Explorer Backend Tests', () => {
    describe('parseCommitMessage', () => {
        it('should correctly parse standard conventional feat commit', () => {
            const parsed = parseCommitMessage('feat: add real-time notification sound');
            assert.strictEqual(parsed.type, 'feat');
            assert.strictEqual(parsed.scope, null);
            assert.strictEqual(parsed.subject, 'add real-time notification sound');
        });

        it('should correctly parse commit with scope', () => {
            const parsed = parseCommitMessage('fix(prod): prevent crash on short jwt secret');
            assert.strictEqual(parsed.type, 'fix');
            assert.strictEqual(parsed.scope, 'prod');
            assert.strictEqual(parsed.subject, 'prevent crash on short jwt secret');
        });

        it('should correctly parse multi-line commit message with body', () => {
            const raw = 'chore: bump version to 1.0.58\n\nAutomated version bump and dependency sync.';
            const parsed = parseCommitMessage(raw);
            assert.strictEqual(parsed.type, 'chore');
            assert.strictEqual(parsed.subject, 'bump version to 1.0.58');
            assert.strictEqual(parsed.body, 'Automated version bump and dependency sync.');
        });

        it('should categorize unknown prefixes as other', () => {
            const parsed = parseCommitMessage('Initial commit with project setup');
            assert.strictEqual(parsed.type, 'other');
            assert.strictEqual(parsed.subject, 'Initial commit with project setup');
        });
    });

    describe('computeCommitKpis', () => {
        const dummyCommits = [
            { type: 'feat', authorName: 'Roberto', date: '2026-09-20T12:00:00Z' },
            { type: 'feat', authorName: 'Roberto', date: '2026-09-20T11:00:00Z' },
            { type: 'fix', authorName: 'Raul', date: '2026-09-20T10:00:00Z' },
            { type: 'chore', authorName: 'Roberto', date: '2026-09-20T09:00:00Z' },
            { type: 'other', authorName: 'Carlos', date: '2026-09-20T08:00:00Z' }
        ];

        it('should compute exact counts for feat, fix, chore and authors', () => {
            const kpis = computeCommitKpis(dummyCommits, '1.0.58');
            assert.strictEqual(kpis.totalCommits, 5);
            assert.strictEqual(kpis.featCount, 2);
            assert.strictEqual(kpis.fixCount, 1);
            assert.strictEqual(kpis.choreCount, 1);
            assert.strictEqual(kpis.otherCount, 1);
            assert.strictEqual(kpis.authorsCount, 3);
            assert.strictEqual(kpis.currentVersion, '1.0.58');
            assert.strictEqual(kpis.lastDeploy, '2026-09-20T12:00:00Z');
        });
    });

    describe('filterCommits', () => {
        const dummyCommits = [
            { sha: 'abc123456', shortSha: 'abc1234', type: 'feat', authorName: 'Roberto', subject: 'agregar modulo de tareas', rawMessage: 'feat: agregar modulo' },
            { sha: 'def789012', shortSha: 'def7890', type: 'fix', authorName: 'Roberto', subject: 'corregir desconexion backend', rawMessage: 'fix: corregir' },
            { sha: 'ghi345678', shortSha: 'ghi3456', type: 'chore', authorName: 'Raul', subject: 'actualizar version', rawMessage: 'chore: actualizar' }
        ];

        it('should filter by type', () => {
            const filtered = filterCommits(dummyCommits, { type: 'feat' });
            assert.strictEqual(filtered.length, 1);
            assert.strictEqual(filtered[0].shortSha, 'abc1234');
        });

        it('should filter by author', () => {
            const filtered = filterCommits(dummyCommits, { author: 'raul' });
            assert.strictEqual(filtered.length, 1);
            assert.strictEqual(filtered[0].authorName, 'Raul');
        });

        it('should filter by search query matching subject or sha', () => {
            const filtered = filterCommits(dummyCommits, { search: 'corregir' });
            assert.strictEqual(filtered.length, 1);
            assert.strictEqual(filtered[0].shortSha, 'def7890');

            const filteredSha = filterCommits(dummyCommits, { search: 'abc1234' });
            assert.strictEqual(filteredSha.length, 1);
        });
    });
});
