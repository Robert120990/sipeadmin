const express = require('express');
const router = express.Router();
const { execFile } = require('child_process');
const path = require('path');
const { authenticateToken, requirePermission } = require('../middleware/auth');

const GITHUB_REPO = 'Robert120990/sipeadmin';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/commits`;

// In-memory cache for GitHub commits (5 minutes TTL)
let commitCache = {
    data: null,
    timestamp: 0
};
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Parse semantic commit message into type, scope, subject, and body
 */
function parseCommitMessage(rawMessage) {
    if (!rawMessage || typeof rawMessage !== 'string') {
        return {
            type: 'other',
            scope: null,
            subject: '',
            body: ''
        };
    }

    const lines = rawMessage.trim().split('\n');
    const firstLine = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();

    // Conventional Commits regex: type(scope)?: description
    const match = firstLine.match(/^([a-zA-Z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/);

    if (match) {
        const rawType = match[1].toLowerCase();
        const validTypes = ['feat', 'fix', 'chore', 'refactor', 'docs', 'test', 'style', 'perf', 'build', 'ci'];
        const type = validTypes.includes(rawType) ? rawType : 'other';

        return {
            type,
            scope: match[2] ? match[2].trim() : null,
            subject: match[3].trim(),
            body
        };
    }

    return {
        type: 'other',
        scope: null,
        subject: firstLine,
        body
    };
}

/**
 * Compute KPIs from parsed commits
 */
function computeCommitKpis(commits = [], currentVersion = '1.0.0') {
    const kpis = {
        totalCommits: commits.length,
        featCount: 0,
        fixCount: 0,
        choreCount: 0,
        otherCount: 0,
        lastDeploy: commits[0]?.date || null,
        currentVersion,
        authorsCount: 0
    };

    const uniqueAuthors = new Set();

    for (const c of commits) {
        if (c.type === 'feat') kpis.featCount++;
        else if (c.type === 'fix') kpis.fixCount++;
        else if (c.type === 'chore') kpis.choreCount++;
        else kpis.otherCount++;

        if (c.authorName) {
            uniqueAuthors.add(c.authorName);
        }
    }

    kpis.authorsCount = uniqueAuthors.size;
    return kpis;
}

/**
 * Filter commits by query params
 */
function filterCommits(commits = [], { search, type, author }) {
    return commits.filter(c => {
        if (type && type !== 'all' && c.type !== type) {
            return false;
        }

        if (author && author !== 'all') {
            if (!c.authorName || !c.authorName.toLowerCase().includes(author.toLowerCase())) {
                return false;
            }
        }

        if (search) {
            const query = search.toLowerCase();
            const inSha = c.sha?.toLowerCase().includes(query) || c.shortSha?.toLowerCase().includes(query);
            const inSubject = c.subject?.toLowerCase().includes(query);
            const inMessage = c.rawMessage?.toLowerCase().includes(query);
            const inAuthor = c.authorName?.toLowerCase().includes(query);
            const inScope = c.scope?.toLowerCase().includes(query);

            if (!inSha && !inSubject && !inMessage && !inAuthor && !inScope) {
                return false;
            }
        }

        return true;
    });
}

/**
 * Fallback to local git log if GitHub API is rate limited or unavailable
 */
function fetchLocalGitCommits(maxCount = 100) {
    return new Promise((resolve) => {
        const repoRoot = path.resolve(__dirname, '../..');
        // %H = commit hash, %an = author name, %ae = author email, %aI = author date ISO, %s = subject, %b = body
        const sep = '---COMMIT_SEP---';
        const fieldSep = '---FIELD_SEP---';
        const format = `${sep}%H${fieldSep}%an${fieldSep}%ae${fieldSep}%aI${fieldSep}%s${fieldSep}%b`;

        execFile('git', ['log', `-n`, String(maxCount), `--pretty=format:${format}`], { cwd: repoRoot }, (err, stdout) => {
            if (err || !stdout) {
                console.warn('Fallback to local git log failed:', err?.message);
                return resolve([]);
            }

            const rawCommits = stdout.split(sep).filter(Boolean);
            const parsed = rawCommits.map(block => {
                const parts = block.split(fieldSep);
                const sha = (parts[0] || '').trim();
                const authorName = (parts[1] || '').trim();
                const authorEmail = (parts[2] || '').trim();
                const date = (parts[3] || '').trim();
                const subject = (parts[4] || '').trim();
                const body = (parts[5] || '').trim();
                const rawMessage = body ? `${subject}\n\n${body}` : subject;

                const semantic = parseCommitMessage(rawMessage);

                return {
                    sha,
                    shortSha: sha.substring(0, 7),
                    rawMessage,
                    subject: semantic.subject || subject,
                    body: semantic.body,
                    type: semantic.type,
                    scope: semantic.scope,
                    authorName,
                    authorEmail,
                    authorAvatar: null,
                    authorLogin: authorName,
                    date,
                    url: `https://github.com/${GITHUB_REPO}/commit/${sha}`,
                    parents: []
                };
            });

            resolve(parsed);
        });
    });
}

/**
 * Fetch commits from GitHub REST API
 */
async function fetchGithubCommits(force = false) {
    const now = Date.now();
    if (!force && commitCache.data && (now - commitCache.timestamp < CACHE_TTL_MS)) {
        return { commits: commitCache.data, source: 'cache' };
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(`${GITHUB_API_URL}?per_page=100`, {
            headers: {
                'User-Agent': 'sipeadmin-system-query',
                'Accept': 'application/vnd.github.v3+json'
            },
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            console.warn(`GitHub API returned status ${response.status}. Falling back to local git log.`);
            const localCommits = await fetchLocalGitCommits(100);
            return { commits: localCommits, source: 'local_git' };
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
            const localCommits = await fetchLocalGitCommits(100);
            return { commits: localCommits, source: 'local_git' };
        }

        const mapped = data.map(item => {
            const rawMessage = item.commit?.message || '';
            const semantic = parseCommitMessage(rawMessage);
            const sha = item.sha || '';

            return {
                sha,
                shortSha: sha.substring(0, 7),
                rawMessage,
                subject: semantic.subject,
                body: semantic.body,
                type: semantic.type,
                scope: semantic.scope,
                authorName: item.commit?.author?.name || item.author?.login || 'Desconocido',
                authorEmail: item.commit?.author?.email || '',
                authorAvatar: item.author?.avatar_url || null,
                authorLogin: item.author?.login || null,
                date: item.commit?.author?.date || null,
                url: item.html_url || `https://github.com/${GITHUB_REPO}/commit/${sha}`,
                parents: (item.parents || []).map(p => p.sha?.substring(0, 7))
            };
        });

        // Store in cache
        commitCache = {
            data: mapped,
            timestamp: now
        };

        return { commits: mapped, source: 'github' };
    } catch (err) {
        console.warn('Error fetching from GitHub API:', err.message);
        const localCommits = await fetchLocalGitCommits(100);
        return { commits: localCommits, source: 'local_git' };
    }
}

/**
 * Fetch detail for a specific commit (stats, files changed)
 */
async function fetchCommitDetail(sha) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(`${GITHUB_API_URL}/${sha}`, {
            headers: {
                'User-Agent': 'sipeadmin-system-query',
                'Accept': 'application/vnd.github.v3+json'
            },
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (response.ok) {
            const data = await response.json();
            const rawMessage = data.commit?.message || '';
            const semantic = parseCommitMessage(rawMessage);

            return {
                sha: data.sha,
                shortSha: data.sha?.substring(0, 7),
                rawMessage,
                subject: semantic.subject,
                body: semantic.body,
                type: semantic.type,
                scope: semantic.scope,
                authorName: data.commit?.author?.name || data.author?.login,
                authorEmail: data.commit?.author?.email,
                authorAvatar: data.author?.avatar_url,
                date: data.commit?.author?.date,
                url: data.html_url,
                stats: data.stats || { total: 0, additions: 0, deletions: 0 },
                files: (data.files || []).map(f => ({
                    filename: f.filename,
                    status: f.status,
                    additions: f.additions,
                    deletions: f.deletions,
                    changes: f.changes,
                    patch: f.patch || null
                }))
            };
        }
    } catch (err) {
        console.warn(`GitHub API commit detail failed for ${sha}:`, err.message);
    }

    // Fallback: parse using local git
    return new Promise((resolve, reject) => {
        const repoRoot = path.resolve(__dirname, '../..');
        execFile('git', ['show', '--numstat', '--pretty=format:%H%n%an%n%ae%n%aI%n%B%n---END_HEADER---', sha], { cwd: repoRoot }, (err, stdout) => {
            if (err || !stdout) {
                return reject(new Error('Commit not found'));
            }

            const [headerPart, ...numstatLines] = stdout.split('---END_HEADER---');
            const headerLines = (headerPart || '').trim().split('\n');

            const commitSha = headerLines[0]?.trim() || sha;
            const authorName = headerLines[1]?.trim();
            const authorEmail = headerLines[2]?.trim();
            const date = headerLines[3]?.trim();
            const rawMessage = headerLines.slice(4).join('\n').trim();
            const semantic = parseCommitMessage(rawMessage);

            let totalAdditions = 0;
            let totalDeletions = 0;
            const files = [];

            const statContent = numstatLines.join('---END_HEADER---').trim();
            if (statContent) {
                const lines = statContent.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    const parts = trimmed.split('\t');
                    if (parts.length >= 3) {
                        const adds = parseInt(parts[0], 10) || 0;
                        const dels = parseInt(parts[1], 10) || 0;
                        const filename = parts[2];
                        totalAdditions += adds;
                        totalDeletions += dels;
                        files.push({
                            filename,
                            status: 'modified',
                            additions: adds,
                            deletions: dels,
                            changes: adds + dels
                        });
                    }
                }
            }

            resolve({
                sha: commitSha,
                shortSha: commitSha.substring(0, 7),
                rawMessage,
                subject: semantic.subject,
                body: semantic.body,
                type: semantic.type,
                scope: semantic.scope,
                authorName,
                authorEmail,
                authorAvatar: null,
                date,
                url: `https://github.com/${GITHUB_REPO}/commit/${commitSha}`,
                stats: {
                    total: totalAdditions + totalDeletions,
                    additions: totalAdditions,
                    deletions: totalDeletions
                },
                files
            });
        });
    });
}

// Read current system version from frontend package.json
let cachedVersion = '1.0.58';
try {
    const pkg = require('../../frontend/package.json');
    if (pkg && pkg.version) cachedVersion = pkg.version;
} catch {
    // fallback
}

/**
 * GET /api/seguridad/cambios-github
 * Query params: page, limit, search, type, author, force
 */
router.get(
    '/',
    authenticateToken,
    requirePermission(['/dashboard/seguridad/cambios', 'view_github_changes', 'view_bitacora']),
    async (req, res) => {
        try {
            const {
                page = 1,
                limit = 25,
                search = '',
                type = 'all',
                author = 'all',
                force = 'false'
            } = req.query;

            const shouldForce = force === 'true' || force === '1';
            const { commits, source } = await fetchGithubCommits(shouldForce);

            const kpis = computeCommitKpis(commits, cachedVersion);

            // Extract unique authors for filter options
            const authorSet = new Set();
            commits.forEach(c => {
                if (c.authorName) authorSet.add(c.authorName);
            });
            const authorsList = Array.from(authorSet).sort();

            // Apply filters
            const filtered = filterCommits(commits, {
                search: search.trim(),
                type,
                author
            });

            // Pagination
            const pageNum = Math.max(1, parseInt(page, 10));
            const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
            const total = filtered.length;
            const totalPages = Math.ceil(total / limitNum) || 1;
            const startIndex = (pageNum - 1) * limitNum;
            const paginatedCommits = filtered.slice(startIndex, startIndex + limitNum);

            res.json({
                data: paginatedCommits,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    totalPages
                },
                kpis,
                authors: authorsList,
                source,
                repo: GITHUB_REPO
            });
        } catch (err) {
            console.error('Error in GET /api/seguridad/cambios-github:', err);
            res.status(500).json({ message: 'Error al consultar cambios de GitHub' });
        }
    }
);

/**
 * GET /api/seguridad/cambios-github/:sha
 * Fetch commit detail with affected files
 */
router.get(
    '/:sha',
    authenticateToken,
    requirePermission(['/dashboard/seguridad/cambios', 'view_github_changes', 'view_bitacora']),
    async (req, res) => {
        try {
            const { sha } = req.params;
            if (!sha || sha.length < 4) {
                return res.status(400).json({ message: 'SHA de commit inválido' });
            }

            const detail = await fetchCommitDetail(sha);
            res.json({ data: detail });
        } catch (err) {
            console.error(`Error in GET /api/seguridad/cambios-github/${req.params.sha}:`, err);
            res.status(404).json({ message: 'No se pudo obtener el detalle del commit especificado' });
        }
    }
);

module.exports = {
    router,
    parseCommitMessage,
    computeCommitKpis,
    filterCommits
};
