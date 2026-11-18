const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const ticketService = require('./ticketService');
const growthAgyService = require('./businessGrowthAgyService');

// Map<telegramUserId, { action: 'resolve_note' | 'comment' | 'agy_feedback', ticketId, ticketCode, expiresAt }>
const pendingTicketReplies = new Map();

function escapeHtmlLocal(text = '') {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function isTicketAdminOrManager(user, effectivePerms = {}) {
    if (!user || !user.activo) return false;
    const roleName = String(effectivePerms?.linkedUser?.role_name || effectivePerms?.linkedUser?.role || '').toLowerCase();
    const roleId = Number(effectivePerms?.linkedUser?.role_id || 0);
    const perms = Array.isArray(effectivePerms?.sipePermissions) ? effectivePerms.sipePermissions : [];
    return (
        roleId === 1 ||
        ['admin', 'administrator', 'administrador', 'super admin', 'superadmin'].includes(roleName) ||
        perms.includes('manage_support_tickets') ||
        Boolean(effectivePerms?.alertas) ||
        Boolean(user.permiso_alertas)
    );
}

async function getTicketByCodeOrId(codeOrId) {
    const clean = String(codeOrId || '').trim().toUpperCase().replace(/^#/, '');
    if (!clean) return null;
    if (/^\d+$/.test(clean)) {
        return ticketService.getTicketById(parseInt(clean, 10));
    }
    let normalized = clean;
    if (/^ADM-?\d+$/i.test(clean)) {
        normalized = `ADM-${clean.replace(/^ADM-?/i, '').padStart(4, '0')}`;
    } else if (/^TKT-?\d+$/i.test(clean)) {
        normalized = `TKT-${clean.replace(/^TKT-?/i, '').padStart(4, '0')}`;
    } else {
        normalized = `ADM-${clean.padStart(4, '0')}`;
    }
    const { pool } = await ticketService.getTicketPool();
    const [rows] = await pool.query('SELECT id FROM support_tickets WHERE ticket_code = ? LIMIT 1', [normalized]);
    if (!rows || rows.length === 0) return null;
    return ticketService.getTicketById(rows[0].id);
}

function resolveRepoKeyForTicket(ticket = {}) {
    const code = String(ticket.ticket_code || '').toUpperCase();
    const src = String(ticket.source_system || '').toLowerCase();
    const url = String(ticket.page_url || '').toLowerCase();
    if (code.startsWith('TKT-') && !src.includes('admin.sipesv.com') && !url.startsWith('/dashboard')) {
        return 'sipesaas';
    }
    return 'sipeadmin';
}

function buildTicketActionKeyboard(ticketId, status = 'abierto') {
    if (status === 'resuelto' || status === 'cerrado') {
        return { inline_keyboard: [[{ text: '💬 Enviar Comentario Adicional', callback_data: `ticket_comment:${ticketId}` }]] };
    }
    return {
        inline_keyboard: [
            [{ text: '🤖 Aprobar y Planificar AGY (Carbon High)', callback_data: `agy_start_plan:${ticketId}` }],
            [
                { text: '🛠️ En Proceso', callback_data: `ticket_take:${ticketId}` },
                { text: '✅ Marcar Resuelto', callback_data: `ticket_resolve:${ticketId}` }
            ],
            [
                { text: '✍️ Resolver con Nota', callback_data: `ticket_resolve_note:${ticketId}` },
                { text: '💬 Comentar al Usuario', callback_data: `ticket_comment:${ticketId}` }
            ]
        ]
    };
}

function buildPlanApprovalKeyboard(ticketId) {
    return {
        inline_keyboard: [
            [{ text: '✅ Aprobar y Ejecutar Plan', callback_data: `agy_plan_approve:${ticketId}` }],
            [
                { text: '✏️ Ampliar / Re-planificar', callback_data: `agy_plan_feedback:${ticketId}` },
                { text: '❌ Denegar Plan', callback_data: `agy_plan_reject:${ticketId}` }
            ]
        ]
    };
}

function buildRetryExecutionKeyboard(ticketId) {
    return {
        inline_keyboard: [
            [{ text: '🔄 Reintentar Ejecución AGY', callback_data: `agy_plan_approve:${ticketId}` }],
            [
                { text: '✏️ Ampliar Directriz y Re-planificar', callback_data: `agy_plan_feedback:${ticketId}` },
                { text: '✅ Marcar Resuelto', callback_data: `ticket_resolve:${ticketId}` }
            ]
        ]
    };
}

async function runRealTicketPlanOnServer(ticket, { model = ticketService.DEFAULT_AGY_MODEL, feedbackComment = '', actorName = 'Telegram Admin' } = {}) {
    const agySettings = await ticketService.getAgySettings();
    const repoKey = resolveRepoKeyForTicket(ticket);
    const targetRepo = growthAgyService.resolveTargetRepo(repoKey, agySettings);
    const chosenModel = String(model || agySettings.default_model || ticketService.DEFAULT_AGY_MODEL).trim();
    const nextVersion = Number(ticket.agy_plan_version || 0) + 1;

    const combinedNotes = [ticket.ai_notes, feedbackComment ? `[Ampliación v${nextVersion} - ${actorName}]: ${feedbackComment}` : '']
        .filter(Boolean)
        .join('\n');

    const queryText = [ticket.subject, ticket.description, ticket.module_name, ticket.page_url, combinedNotes].filter(Boolean).join('\n');
    const relatedFiles = growthAgyService.findSmartRepoFiles(targetRepo, queryText);
    const snippets = growthAgyService.readSafeRepoSnippets(targetRepo, relatedFiles, 28000, queryText);
    const agyBin = growthAgyService.detectLocalAgyBinary(agySettings.agy_command || 'agy');

    let planMarkdown = '';

    if (agyBin && targetRepo.existsLocally) {
        const cliPrompt = [
            `PLANIFICACIÓN TICKET #${ticket.ticket_code} (Plan v${nextVersion})`,
            `Modelo: ${chosenModel} | Proyecto: ${targetRepo.label}`,
            `Asunto: ${ticket.subject} | Ruta: ${ticket.page_url || '/dashboard'} | Descripción: ${ticket.description}`,
            combinedNotes ? `Directriz: ${combinedNotes}` : '',
            `Archivos clave: ${relatedFiles.join(', ')}`,
            `NO modifiques archivos aún. Redacta en español un plan conciso (máximo 14 líneas) con 🎯 Diagnóstico, 🛠️ Solución propuesta y 📂 Componentes. Finaliza con [[FIN_PLAN_AGY]].`
        ].filter(Boolean).join(' | ');

        const cliRes = await growthAgyService.runLocalAgyCliWithTempPrompt({
            agyBinPath: agyBin,
            projectPath: targetRepo.projectPath,
            model: chosenModel,
            promptText: cliPrompt,
            isPlanPhase: true,
            timeoutMs: 90000
        });
        if (cliRes.output && cliRes.output.includes('[[FIN_PLAN_AGY]]')) {
            const extracted = cliRes.output.split('[[FIN_PLAN_AGY]]')[0].trim();
            if (extracted.length > 50) planMarkdown = extracted;
        }
    }

    if (!planMarkdown) {
        const aiClient = await growthAgyService.resolveAiClient();
        if (aiClient) {
            try {
                const systemInstruction = `Eres AGY (${chosenModel}), Arquitecto Principal de Software del Grupo SIPE.
Inspecciona el código real adjunto de ${targetRepo.label} para el ticket #${ticket.ticket_code} y redacta un plan de ejecución CONCISO en español (máximo 14 líneas) sin bloques extensos de código:
🎯 Diagnóstico:
🛠️ Solución propuesta:
📂 Componentes a intervenir:`;

                const codeCtx = snippets.map((s) => `--- ARCHIVO: ${s.file} (${s.totalLines} líneas) ---\n${s.excerpt}`).join('\n\n');
                const promptText = [
                    `Ticket #${ticket.ticket_code} | Asunto: ${ticket.subject}`,
                    `Módulo / Ruta: ${ticket.module_name || 'SIPE Admin'} (${ticket.page_url || '/dashboard'})`,
                    `Descripción: ${ticket.description}`,
                    combinedNotes ? `Directriz Técnica: ${combinedNotes}` : '',
                    `Archivos detectados: ${relatedFiles.join(', ')}`,
                    codeCtx ? `\nCÓDIGO ACTUAL:\n${codeCtx}` : ''
                ].filter(Boolean).join('\n\n');

                const aiPlan = await growthAgyService.generateGeminiContentWithFallback(aiClient, {
                    systemInstruction,
                    contents: [{ role: 'user', parts: [{ text: promptText }] }]
                });
                if (aiPlan?.text) planMarkdown = aiPlan.text.trim();
            } catch (_) { /* fallback abajo */ }
        }
    }

    if (!planMarkdown) {
        planMarkdown = [
            `🎯 Diagnóstico: Se identificó el requerimiento reportado en ${ticket.module_name || 'SIPE Admin'} ("${ticket.subject}").`,
            `🛠️ Solución propuesta:`,
            `1. Intervenir los componentes vinculados a ${ticket.page_url || '/dashboard'} según la descripción del ticket.`,
            `2. Compilar frontend y validar pruebas automatizadas sin afectar producción.`,
            `📂 Componentes a intervenir: ${relatedFiles.join(', ')}`
        ].join('\n');
    }

    const { pool } = await ticketService.getTicketPool();
    const logEntry = `[${new Date().toISOString()}] Plan v${nextVersion} generado con ${chosenModel} por ${actorName} (${relatedFiles.join(', ')}).`;
    await pool.query(
        `UPDATE support_tickets
         SET status = CASE WHEN status = 'abierto' THEN 'en_proceso' ELSE status END,
             include_in_ai_prompt = 1,
             ai_notes = COALESCE(NULLIF(?, ''), ai_notes),
             agy_status = 'esperando_aprobacion',
             agy_model = ?,
             agy_plan_markdown = ?,
             agy_approved_by = ?,
             agy_plan_version = ?,
             agy_execution_log = CONCAT(COALESCE(agy_execution_log, ''), '\n', ?),
             agy_updated_at = NOW()
         WHERE id = ?`,
        [combinedNotes, chosenModel, planMarkdown, actorName, nextVersion, logEntry, ticket.id]
    );

    const updated = await ticketService.getTicketById(ticket.id);
    return { updated, chosenModel, nextVersion, planMarkdown, relatedFiles, targetRepo };
}

async function runRealTicketExecutionOnServer(ticket, { actorId = null, actorName = 'Telegram Admin', autoCommitPush = true } = {}) {
    const agySettings = await ticketService.getAgySettings();
    const repoKey = resolveRepoKeyForTicket(ticket);
    const targetRepo = growthAgyService.resolveTargetRepo(repoKey, agySettings);
    const chosenModel = (!ticket.agy_model || ticket.agy_model === 'gemini-4-argon-high')
        ? (agySettings.default_model || ticketService.DEFAULT_AGY_MODEL)
        : ticket.agy_model;

    const queryText = [ticket.subject, ticket.description, ticket.module_name, ticket.page_url, ticket.ai_notes, ticket.agy_plan_markdown].filter(Boolean).join('\n');
    const relatedFiles = growthAgyService.findSmartRepoFiles(targetRepo, queryText);
    const rootResolved = path.resolve(targetRepo.projectPath);
    const { pool } = await ticketService.getTicketPool();

    await pool.query(
        `UPDATE support_tickets
         SET agy_status = 'ejecutando',
             agy_model = ?,
             agy_approved_by = ?,
             agy_updated_at = NOW()
         WHERE id = ?`,
        [chosenModel, actorName, ticket.id]
    ).catch(() => {});

    if (!targetRepo.existsLocally || !fs.existsSync(rootResolved)) {
        const msg = `⚠️ El repositorio destino (${targetRepo.label}) no está accesible localmente en esta instancia.`;
        await pool.query(
            `UPDATE support_tickets SET agy_status = 'esperando_aprobacion', agy_execution_log = CONCAT(COALESCE(agy_execution_log, ''), '\n', ?), agy_updated_at = NOW() WHERE id = ?`,
            [msg, ticket.id]
        ).catch(() => {});
        return { success: false, modifiedFiles: [], summary: msg, chosenModel, targetRepo };
    }

    const preDirty = new Set();
    try {
        const st = execFileSync('git', ['-c', 'safe.directory=*', 'status', '--porcelain'], { cwd: rootResolved, timeout: 8000, stdio: 'pipe' }).toString();
        st.split('\n').filter(Boolean).forEach((l) => {
            const f = l.trim().split(/\s+/).pop();
            if (f) preDirty.add(f.replace(/\\/g, '/'));
        });
    } catch { /* ignore */ }

    const modifiedFiles = [];
    const stepLogs = [];
    const agyBin = growthAgyService.detectLocalAgyBinary(agySettings.agy_command || 'agy');

    if (agyBin) {
        const execPrompt = [
            `ORDEN DE EJECUCIÓN APROBADA — TICKET #${ticket.ticket_code}`,
            `Modelo: ${chosenModel} | Asunto: ${ticket.subject} | Ruta: ${ticket.page_url || '/dashboard'}`,
            `Descripción: ${ticket.description}`,
            ticket.ai_notes ? `Directriz Técnica: ${ticket.ai_notes}` : '',
            `Plan aprobado: ${ticket.agy_plan_markdown || ''}`,
            `Aplica los cambios reales en código respetando AGENTS.md y finaliza con [[FIN_EJECUCION_AGY]].`
        ].filter(Boolean).join(' | ');

        await growthAgyService.runLocalAgyCliWithTempPrompt({
            agyBinPath: agyBin,
            projectPath: rootResolved,
            model: chosenModel,
            promptText: execPrompt,
            isPlanPhase: false,
            timeoutMs: 155000
        });

        try {
            const postSt = execFileSync('git', ['-c', 'safe.directory=*', 'status', '--porcelain'], { cwd: rootResolved, timeout: 8000, stdio: 'pipe' }).toString();
            postSt.split('\n').filter(Boolean).forEach((l) => {
                const f = l.trim().split(/\s+/).pop()?.replace(/\\/g, '/');
                if (f && !preDirty.has(f) && !f.includes('.env') && !f.endsWith('lock.json') && !f.endsWith('lock.yaml')) {
                    modifiedFiles.push(f);
                }
            });
        } catch { /* ignore */ }
    }

    if (modifiedFiles.length === 0) {
        const aiClient = await growthAgyService.resolveAiClient();
        const snippets = growthAgyService.readSafeRepoSnippets(targetRepo, relatedFiles, 85000, queryText);
        if (aiClient && snippets.length > 0) {
            try {
                const systemInstruction = `Eres el motor quirúrgico de código de AGY (${chosenModel}) para ${targetRepo.label}.
Devuelve ÚNICAMENTE un JSON válido con la estructura exacta:
{"edits":[{"file":"ruta/relativa.jsx","search":"fragmento exacto existente en el archivo","replace":"fragmento nuevo con la mejora implementada"}],"summary":"resumen conciso en español"}.
Reglas: "search" debe coincidir con el código suministrado; prohibido modificar .env o credenciales.`;

                const userPrompt = [
                    `Ticket #${ticket.ticket_code} | Asunto: ${ticket.subject}`,
                    `Ruta: ${ticket.page_url || '/dashboard'} | Módulo: ${ticket.module_name || 'SIPE Admin'}`,
                    `Descripción: ${ticket.description}`,
                    ticket.ai_notes ? `Directriz Técnica: ${ticket.ai_notes}` : '',
                    `Plan Aprobado:\n${ticket.agy_plan_markdown || ''}`,
                    ...snippets.map((s) => `=== ARCHIVO: ${s.file} ===\n${s.excerpt}`)
                ].filter(Boolean).join('\n\n');

                const aiPatch = await growthAgyService.generateGeminiContentWithFallback(aiClient, {
                    systemInstruction,
                    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                    responseMimeType: 'application/json'
                });

                if (aiPatch?.text) {
                    const rawJson = aiPatch.text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
                    const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
                    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawJson);
                    for (const edit of (Array.isArray(parsed.edits) ? parsed.edits : [])) {
                        if (!edit.file || !edit.search || edit.replace === undefined) continue;
                        const cleanRel = path.normalize(String(edit.file)).replace(/^(\.\.(\/|\\|$))+/, '');
                        if (cleanRel.includes('.env') || cleanRel.includes('node_modules')) continue;
                        const absFile = path.resolve(rootResolved, cleanRel);
                        if (!absFile.startsWith(rootResolved) || !fs.existsSync(absFile)) continue;
                        const currentText = fs.readFileSync(absFile, 'utf8');
                        const nextText = growthAgyService.applyFlexibleTextEdit(currentText, String(edit.search), String(edit.replace));
                        if (nextText !== currentText) {
                            fs.writeFileSync(absFile, nextText, 'utf8');
                            const normRel = cleanRel.replace(/\\/g, '/');
                            if (!modifiedFiles.includes(normRel)) modifiedFiles.push(normRel);
                        }
                    }
                    if (parsed.summary) stepLogs.push(parsed.summary);
                }
            } catch (err) {
                stepLogs.push(`Aviso motor quirúrgico IA: ${err.message}`);
            }
        }
    }

    if (modifiedFiles.length === 0) {
        const warnMsg = `⚠️ AGY inspeccionó ${relatedFiles.join(', ')} en ${targetRepo.label}, pero no se aplicaron cambios automáticos en disco. Especifica una directriz más puntual para reintentar.`;
        await pool.query(
            `UPDATE support_tickets
             SET agy_status = 'esperando_aprobacion',
                 agy_execution_log = CONCAT(COALESCE(agy_execution_log, ''), '\n', ?),
                 agy_updated_at = NOW()
             WHERE id = ?`,
            [warnMsg, ticket.id]
        ).catch(() => {});
        const pendingTicket = await ticketService.getTicketById(ticket.id);
        return { success: false, modifiedFiles: [], summary: warnMsg, ticket: pendingTicket, chosenModel, targetRepo };
    }

    // Compilar frontend para validar integridad antes de publicar
    const frontendDir = path.join(rootResolved, targetRepo.frontendDir);
    if (fs.existsSync(frontendDir)) {
        try {
            const buildCmd = targetRepo.isAdmin
                ? 'pnpm --filter frontend run build || npm --prefix frontend run build'
                : 'npm --prefix client run build || pnpm --filter client run build';
            execSync(buildCmd, { cwd: rootResolved, timeout: 150000, stdio: 'pipe' });
            stepLogs.push(`Frontend (${targetRepo.frontendDir}/dist) compilado sin errores.`);
        } catch (bErr) {
            stepLogs.push(`Aviso compilación: ${String(bErr.message || '').slice(0, 140)}`);
        }
    }

    if (autoCommitPush && process.env.NODE_ENV === 'production') {
        try {
            if (targetRepo.isAdmin) {
                const pkgPath = path.join(rootResolved, 'frontend/package.json');
                if (fs.existsSync(pkgPath)) {
                    const pkgObj = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                    const parts = String(pkgObj.version || '1.0.0').split('.').map((n) => parseInt(n, 10) || 0);
                    parts[2] = (parts[2] || 0) + 1;
                    pkgObj.version = parts.join('.');
                    fs.writeFileSync(pkgPath, `${JSON.stringify(pkgObj, null, 2)}\n`, 'utf8');
                    if (!modifiedFiles.includes('frontend/package.json')) modifiedFiles.push('frontend/package.json');
                }
            }
            execFileSync('git', ['-c', 'safe.directory=*', 'add', '--', ...modifiedFiles], { cwd: rootResolved, timeout: 12000, stdio: 'pipe' });
            const cleanSubj = String(ticket.subject || 'ajuste ticket').replace(/["`$\\]/g, '').slice(0, 68);
            execFileSync(
                'git',
                ['-c', 'safe.directory=*', '-c', 'user.name=AGY Server Bot', '-c', 'user.email=agy@sipesv.com', 'commit', '-m', `fix(agy): resolver #${ticket.ticket_code} - ${cleanSubj}`],
                { cwd: rootResolved, timeout: 15000, stdio: 'pipe' }
            );
            const branch = execFileSync('git', ['-c', 'safe.directory=*', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd: rootResolved, timeout: 5000, stdio: 'pipe' }).toString().trim() || 'main';
            execFileSync('git', ['-c', 'safe.directory=*', 'pull', '--rebase', '--autostash', 'origin', branch], { cwd: rootResolved, timeout: 25000, stdio: 'pipe' });
            execFileSync('git', ['-c', 'safe.directory=*', 'push', 'origin', branch], { cwd: rootResolved, timeout: 25000, stdio: 'pipe' });
            stepLogs.push(`Cambios sincronizados en GitHub (origin/${branch}).`);
        } catch (gErr) {
            stepLogs.push(`Git local: ${String(gErr.message || '').slice(0, 120)}`);
        }
    }

    const summaryNotes = [
        stepLogs[0] || `Solución implementada mediante Consola AGY (${chosenModel}).`,
        `Archivos actualizados: ${modifiedFiles.join(', ')}`
    ].join(' — ');

    const resolvedTicket = await ticketService.executeApprovedPlan(ticket.id, {
        actorId,
        actorName,
        resolutionNotes: summaryNotes
    });

    return {
        success: true,
        modifiedFiles,
        summary: summaryNotes,
        stepLogs,
        ticket: resolvedTicket,
        chosenModel,
        targetRepo
    };
}

async function handleTicketCallback(cq, tgHelpers, { tgUser = null, effPerms = {} } = {}) {
    const data = String(cq?.data || '').trim();
    if (!data.startsWith('agy_') && !data.startsWith('ticket_')) return false;

    const { sendTelegramMessage, answerCallbackQuery, editMessageReplyMarkup } = tgHelpers;
    const chatId = cq.message?.chat?.id || (cq.from ? String(cq.from.id) : null);
    const messageId = cq.message?.message_id;
    const fromId = cq.from ? String(cq.from.id) : null;
    const actorName = `${cq.from?.first_name || cq.from?.username || 'Admin'} (Telegram)`;

    if (data === 'agy_noop') {
        await answerCallbackQuery(cq.id, '⏳ Esta solicitud ya está en curso o fue procesada.');
        return true;
    }

    if (tgUser && !isTicketAdminOrManager(tgUser, effPerms)) {
        await answerCallbackQuery(cq.id, '⛔ No tienes permisos para gestionar tickets de soporte.');
        return true;
    }

    const [action, rawId] = data.split(':');
    const ticketId = parseInt(rawId, 10);
    if (Number.isNaN(ticketId)) return true;

    const ticket = await ticketService.getTicketById(ticketId);
    if (!ticket) {
        await answerCallbackQuery(cq.id, '⚠️ Ticket no encontrado.');
        return true;
    }

    if (action === 'ticket_take') {
        await answerCallbackQuery(cq.id, '🛠️ Ticket marcado En Proceso');
        const updated = await ticketService.updateTicketStatus(ticketId, {
            status: 'en_proceso',
            actorName,
            source: 'telegram',
            skipTelegramStatusAlert: true
        });
        if (chatId && messageId) {
            await editMessageReplyMarkup(chatId, messageId, buildTicketActionKeyboard(ticketId, 'en_proceso')).catch(() => {});
        }
        await sendTelegramMessage(
            chatId,
            `🛠️ <b>Ticket #${escapeHtmlLocal(updated.ticket_code)} en proceso</b>\n` +
            `📌 <b>Asunto:</b> ${escapeHtmlLocal(updated.subject)}\n` +
            `👨‍💻 <b>Atendido por:</b> ${escapeHtmlLocal(actorName)}`
        );
        return true;
    }

    if (action === 'ticket_resolve') {
        await answerCallbackQuery(cq.id, '✅ Ticket marcado como Resuelto');
        const updated = await ticketService.updateTicketStatus(ticketId, {
            status: 'resuelto',
            resolutionNotes: 'Solicitud atendida y resuelta por el equipo técnico.',
            actorName,
            source: 'telegram',
            skipTelegramStatusAlert: true
        });
        if (chatId && messageId) {
            await editMessageReplyMarkup(chatId, messageId, { inline_keyboard: [] }).catch(() => {});
        }
        await sendTelegramMessage(
            chatId,
            `✅ <b>Ticket #${escapeHtmlLocal(updated.ticket_code)} MARCADO COMO RESUELTO</b>\n` +
            `📌 <b>Asunto:</b> ${escapeHtmlLocal(updated.subject)}\n` +
            `🔔 <i>Notificación en tiempo real enviada a ${escapeHtmlLocal(updated.user_name)}.</i>`
        );
        return true;
    }

    if (action === 'ticket_resolve_note' || action === 'ticket_comment' || action === 'agy_plan_feedback') {
        await answerCallbackQuery(cq.id, '✍️ Escribe tu mensaje a continuación');
        if (fromId) {
            pendingTicketReplies.set(fromId, {
                action: action === 'ticket_resolve_note' ? 'resolve_note' : (action === 'ticket_comment' ? 'comment' : 'agy_feedback'),
                ticketId,
                ticketCode: ticket.ticket_code,
                messageId,
                expiresAt: Date.now() + 15 * 60 * 1000
            });
        }
        const promptHtml = action === 'ticket_resolve_note'
            ? `✍️ <b>Resolver Ticket #${escapeHtmlLocal(ticket.ticket_code)} con nota</b>\nEscribe la solución aplicada para notificar a <b>${escapeHtmlLocal(ticket.user_name)}</b> (o escribe /cancelar):`
            : action === 'ticket_comment'
                ? `💬 <b>Comentar en Ticket #${escapeHtmlLocal(ticket.ticket_code)}</b>\nEscribe el comentario para <b>${escapeHtmlLocal(ticket.user_name)}</b> (o escribe /cancelar):`
                : `✏️ <b>Ampliar Directriz AGY en Ticket #${escapeHtmlLocal(ticket.ticket_code)}</b>\nEscribe tus indicaciones técnicas para re-planificar con <code>${escapeHtmlLocal(ticketService.DEFAULT_AGY_MODEL)}</code> (o escribe /cancelar):`;
        await sendTelegramMessage(chatId, promptHtml);
        return true;
    }

    if (action === 'agy_plan_reject') {
        await answerCallbackQuery(cq.id, '❌ Plan AGY denegado');
        await ticketService.rejectPlan(ticketId, { reason: 'Denegado desde Telegram', actorName });
        if (chatId && messageId) {
            await editMessageReplyMarkup(chatId, messageId, {
                inline_keyboard: [[{ text: '✏️ Ampliar Directriz y Re-planificar', callback_data: `agy_plan_feedback:${ticketId}` }]]
            }).catch(() => {});
        }
        return true;
    }

    if (action === 'agy_start_plan') {
        await answerCallbackQuery(cq.id, '🤖 Analizando código y generando Plan AGY (Carbon High)...');
        if (chatId && messageId) {
            await editMessageReplyMarkup(chatId, messageId, {
                inline_keyboard: [[{ text: '⏳ AGY generando plan con Carbon High...', callback_data: 'agy_noop' }]]
            }).catch(() => {});
        }
        await sendTelegramMessage(
            chatId,
            `⏳ <b>Analizando repositorio para Ticket #${escapeHtmlLocal(ticket.ticket_code)}</b>\n` +
            `🧠 <b>Modelo:</b> <code>${escapeHtmlLocal(ticketService.DEFAULT_AGY_MODEL)}</code>`
        );
        setImmediate(async () => {
            try {
                const res = await runRealTicketPlanOnServer(ticket, { model: ticketService.DEFAULT_AGY_MODEL, actorName });
                await sendTelegramMessage(
                    chatId,
                    `🤖 <b>PROPUESTA DE SOLUCIÓN AGY (v${res.nextVersion}) — #${escapeHtmlLocal(ticket.ticket_code)}</b>\n` +
                    `🧠 <b>Modelo:</b> <code>${escapeHtmlLocal(res.chosenModel)}</code>\n` +
                    `📌 <b>Asunto:</b> ${escapeHtmlLocal(ticket.subject)}\n` +
                    `📂 <b>Módulo:</b> ${escapeHtmlLocal(ticket.module_name || 'SIPE Admin')} (<code>${escapeHtmlLocal(ticket.page_url || '/dashboard')}</code>)\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `${escapeHtmlLocal(res.planMarkdown)}\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `👇 <b>Revisa y autoriza la ejecución:</b>`,
                    buildPlanApprovalKeyboard(ticket.id)
                );
            } catch (err) {
                await sendTelegramMessage(chatId, `❌ Error generando Plan AGY para #${escapeHtmlLocal(ticket.ticket_code)}: ${escapeHtmlLocal(err.message)}`);
            }
        });
        return true;
    }

    if (action === 'agy_plan_approve') {
        await answerCallbackQuery(cq.id, '⚙️ Ejecutando Plan AGY en el servidor...');
        if (chatId && messageId) {
            await editMessageReplyMarkup(chatId, messageId, {
                inline_keyboard: [[{ text: '⚙️ AGY aplicando solución en curso...', callback_data: 'agy_noop' }]]
            }).catch(() => {});
        }
        await sendTelegramMessage(
            chatId,
            `⚙️ <b>Ejecutando Plan AGY en #${escapeHtmlLocal(ticket.ticket_code)}</b>\n` +
            `🧠 <b>Modelo:</b> <code>${escapeHtmlLocal(ticket.agy_model || ticketService.DEFAULT_AGY_MODEL)}</code>\n` +
            `<i>Aplicando cambios, verificando compilación y actualizando estado...</i>`
        );
        setImmediate(async () => {
            try {
                const execRes = await runRealTicketExecutionOnServer(ticket, {
                    actorId: effPerms?.linkedUser?.id || null,
                    actorName
                });
                if (!execRes.success) {
                    if (chatId && messageId) {
                        await editMessageReplyMarkup(chatId, messageId, buildRetryExecutionKeyboard(ticket.id)).catch(() => {});
                    }
                    await sendTelegramMessage(
                        chatId,
                        `⚠️ <b>EJECUCIÓN REQUIERE PRECISIÓN ADICIONAL — #${escapeHtmlLocal(ticket.ticket_code)}</b>\n\n` +
                        `${escapeHtmlLocal(execRes.summary)}\n\n` +
                        `<i>El ticket permanece <b>En Proceso</b> (no se ha marcado como resuelto). Selecciona una acción:</i>`,
                        buildRetryExecutionKeyboard(ticket.id)
                    );
                    return;
                }
                if (chatId && messageId) {
                    await editMessageReplyMarkup(chatId, messageId, { inline_keyboard: [] }).catch(() => {});
                }
                await sendTelegramMessage(
                    chatId,
                    `✅ <b>TAREA FINALIZADA Y TICKET RESUELTO — #${escapeHtmlLocal(ticket.ticket_code)}</b>\n` +
                    `🧠 <b>Modelo:</b> <code>${escapeHtmlLocal(execRes.chosenModel)}</code>\n` +
                    `📌 <b>Asunto:</b> ${escapeHtmlLocal(ticket.subject)}\n` +
                    `📦 <b>Archivos actualizados:</b> <code>${escapeHtmlLocal(execRes.modifiedFiles.join(', '))}</code>\n` +
                    `🎉 <i>El ticket pasó automáticamente a <b>Resuelto</b> y se notificó al solicitante.</i>`
                );
            } catch (err) {
                await sendTelegramMessage(
                    chatId,
                    `⚠️ <b>Error durante la ejecución de #${escapeHtmlLocal(ticket.ticket_code)}:</b> ${escapeHtmlLocal(err.message)}`,
                    buildRetryExecutionKeyboard(ticket.id)
                );
            }
        });
        return true;
    }

    return false;
}

async function handleTicketTextCommand(chatId, rawText, user, effectivePerms, tgHelpers) {
    const { sendTelegramMessage } = tgHelpers;
    const trimmed = String(rawText || '').trim();
    const uidKey = String(user?.telegram_user_id || '');
    const actorName = `${user?.first_name || user?.telegram_username || 'Admin'} (Telegram)`;

    const pending = pendingTicketReplies.get(uidKey);
    if (pending) {
        if (Date.now() > pending.expiresAt) {
            pendingTicketReplies.delete(uidKey);
        } else if (/^\/?cancelar$/i.test(trimmed)) {
            pendingTicketReplies.delete(uidKey);
            await sendTelegramMessage(chatId, '❎ Acción sobre ticket cancelada.');
            return true;
        } else if (!trimmed.startsWith('/')) {
            pendingTicketReplies.delete(uidKey);
            if (pending.action === 'resolve_note') {
                const updated = await ticketService.updateTicketStatus(pending.ticketId, {
                    status: 'resuelto',
                    resolutionNotes: trimmed,
                    actorId: effectivePerms?.linkedUser?.id || null,
                    actorName,
                    source: 'telegram',
                    skipTelegramStatusAlert: true
                });
                await sendTelegramMessage(
                    chatId,
                    `✅ <b>Ticket #${escapeHtmlLocal(updated?.ticket_code || pending.ticketCode)} RESUELTO CON NOTA</b>\n` +
                    `📝 <b>Solución:</b> ${escapeHtmlLocal(trimmed)}`
                );
                return true;
            }
            if (pending.action === 'comment') {
                const updated = await ticketService.addTicketMessage(pending.ticketId, {
                    senderUserId: effectivePerms?.linkedUser?.id || null,
                    senderName: actorName,
                    senderRole: 'tech',
                    source: 'telegram',
                    message: trimmed
                });
                await sendTelegramMessage(
                    chatId,
                    `💬 Comentario enviado en <b>#${escapeHtmlLocal(updated?.ticket_code || pending.ticketCode)}</b>.`
                );
                return true;
            }
            if (pending.action === 'agy_feedback') {
                const ticket = await ticketService.getTicketById(pending.ticketId);
                if (ticket) {
                    await sendTelegramMessage(chatId, `⏳ Re-planificando <b>#${escapeHtmlLocal(ticket.ticket_code)}</b> con <code>${escapeHtmlLocal(ticketService.DEFAULT_AGY_MODEL)}</code>...`);
                    setImmediate(async () => {
                        try {
                            const res = await runRealTicketPlanOnServer(ticket, {
                                model: ticketService.DEFAULT_AGY_MODEL,
                                feedbackComment: trimmed,
                                actorName
                            });
                            await sendTelegramMessage(
                                chatId,
                                `🤖 <b>PLAN AGY ACTUALIZADO (v${res.nextVersion}) — #${escapeHtmlLocal(ticket.ticket_code)}</b>\n` +
                                `🧠 <b>Modelo:</b> <code>${escapeHtmlLocal(res.chosenModel)}</code>\n\n` +
                                `${escapeHtmlLocal(res.planMarkdown)}`,
                                buildPlanApprovalKeyboard(ticket.id)
                            );
                        } catch (err) {
                            await sendTelegramMessage(chatId, `❌ Error al re-planificar: ${escapeHtmlLocal(err.message)}`);
                        }
                    });
                }
                return true;
            }
        }
    }

    if (!/^\/(?:tickets|ticket|ver_ticket|agy|ejecutar|reintentar|resolver)\b/i.test(trimmed)) {
        return false;
    }

    if (!isTicketAdminOrManager(user, effectivePerms)) {
        await sendTelegramMessage(chatId, '⛔ No tienes permisos para ejecutar comandos técnicos de tickets.');
        return true;
    }

    if (/^\/tickets\b/i.test(trimmed)) {
        const listRes = await ticketService.getTickets({ canManage: true, limit: 15 });
        const active = (listRes.items || []).filter((t) => t.status === 'abierto' || t.status === 'en_proceso').slice(0, 10);
        if (active.length === 0) {
            await sendTelegramMessage(chatId, '🎉 No hay tickets pendientes ni en proceso actualmente.');
            return true;
        }
        let html = `🎫 <b>Tickets Activos (${active.length})</b>\n` +
            `🧠 <b>Modelo AGY por defecto:</b> <code>${escapeHtmlLocal(ticketService.DEFAULT_AGY_MODEL)}</code>\n\n`;
        for (const t of active) {
            const icon = t.status === 'en_proceso' ? '🛠️' : '🆕';
            const agyTag = t.agy_status && t.agy_status !== 'idle' ? ` · AGY: <code>${escapeHtmlLocal(t.agy_status)}</code>` : '';
            html += `${icon} <b>#${escapeHtmlLocal(t.ticket_code)}</b> (${escapeHtmlLocal(String(t.priority).toUpperCase())}) — ${escapeHtmlLocal(t.subject)}${agyTag}\n`;
        }
        html += `\n<i>Comandos:</i>\n` +
            `• <code>/ticket ADM-0012</code> (ver detalle y botones)\n` +
            `• <code>/agy ADM-0012 [directriz]</code> (planificar con Carbon High)\n` +
            `• <code>/ejecutar ADM-0012</code> (implementar plan)\n` +
            `• <code>/resolver ADM-0012 Solución</code>`;
        await sendTelegramMessage(chatId, html);
        return true;
    }

    const viewMatch = trimmed.match(/^\/(?:ticket|ver_ticket)\s+([A-Za-z0-9#-]+)$/i);
    if (viewMatch) {
        const ticket = await getTicketByCodeOrId(viewMatch[1]);
        if (!ticket) {
            await sendTelegramMessage(chatId, `⚠️ No se encontró el ticket <code>${escapeHtmlLocal(viewMatch[1])}</code>.`);
            return true;
        }
        const kb = ticket.agy_status === 'esperando_aprobacion'
            ? buildPlanApprovalKeyboard(ticket.id)
            : buildTicketActionKeyboard(ticket.id, ticket.status);
        const detailHtml =
            `🎫 <b>DETALLE TICKET #${escapeHtmlLocal(ticket.ticket_code)}</b>\n` +
            `📊 <b>Estado:</b> <code>${escapeHtmlLocal(ticket.status)}</code> | <b>AGY:</b> <code>${escapeHtmlLocal(ticket.agy_status || 'idle')}</code>\n` +
            `🧠 <b>Modelo:</b> <code>${escapeHtmlLocal(ticket.agy_model || ticketService.DEFAULT_AGY_MODEL)}</code>\n` +
            `📌 <b>Asunto:</b> ${escapeHtmlLocal(ticket.subject)}\n` +
            `📂 <b>Módulo / Ruta:</b> ${escapeHtmlLocal(ticket.module_name || 'SIPE Admin')} (<code>${escapeHtmlLocal(ticket.page_url || '/dashboard')}</code>)\n` +
            `👤 <b>Solicitante:</b> ${escapeHtmlLocal(ticket.user_name)}\n\n` +
            `📝 <b>Descripción:</b>\n${escapeHtmlLocal(String(ticket.description || '').slice(0, 900))}` +
            (ticket.agy_plan_markdown ? `\n\n📋 <b>Último Plan AGY:</b>\n${escapeHtmlLocal(String(ticket.agy_plan_markdown).slice(0, 900))}` : '');
        await sendTelegramMessage(chatId, detailHtml, kb);
        return true;
    }

    const agyMatch = trimmed.match(/^\/agy\s+([A-Za-z0-9#-]+)(?:\s+([\s\S]+))?$/i);
    if (agyMatch) {
        const ticket = await getTicketByCodeOrId(agyMatch[1]);
        if (!ticket) {
            await sendTelegramMessage(chatId, `⚠️ No se encontró el ticket <code>${escapeHtmlLocal(agyMatch[1])}</code>.`);
            return true;
        }
        const extra = (agyMatch[2] || '').trim();
        await sendTelegramMessage(
            chatId,
            `⏳ Generando Plan AGY para <b>#${escapeHtmlLocal(ticket.ticket_code)}</b> con <code>${escapeHtmlLocal(ticketService.DEFAULT_AGY_MODEL)}</code>...`
        );
        setImmediate(async () => {
            try {
                const res = await runRealTicketPlanOnServer(ticket, {
                    model: ticketService.DEFAULT_AGY_MODEL,
                    feedbackComment: extra,
                    actorName
                });
                await sendTelegramMessage(
                    chatId,
                    `🤖 <b>PROPUESTA DE SOLUCIÓN AGY (v${res.nextVersion}) — #${escapeHtmlLocal(ticket.ticket_code)}</b>\n` +
                    `🧠 <b>Modelo:</b> <code>${escapeHtmlLocal(res.chosenModel)}</code>\n\n` +
                    `${escapeHtmlLocal(res.planMarkdown)}`,
                    buildPlanApprovalKeyboard(ticket.id)
                );
            } catch (err) {
                await sendTelegramMessage(chatId, `❌ Error en planificación AGY: ${escapeHtmlLocal(err.message)}`);
            }
        });
        return true;
    }

    const execMatch = trimmed.match(/^\/(?:ejecutar|reintentar)\s+([A-Za-z0-9#-]+)$/i);
    if (execMatch) {
        const ticket = await getTicketByCodeOrId(execMatch[1]);
        if (!ticket) {
            await sendTelegramMessage(chatId, `⚠️ No se encontró el ticket <code>${escapeHtmlLocal(execMatch[1])}</code>.`);
            return true;
        }
        await sendTelegramMessage(
            chatId,
            `⚙️ Ejecutando implementación AGY en <b>#${escapeHtmlLocal(ticket.ticket_code)}</b> con <code>${escapeHtmlLocal(ticket.agy_model || ticketService.DEFAULT_AGY_MODEL)}</code>...`
        );
        setImmediate(async () => {
            try {
                const execRes = await runRealTicketExecutionOnServer(ticket, {
                    actorId: effectivePerms?.linkedUser?.id || null,
                    actorName
                });
                if (!execRes.success) {
                    await sendTelegramMessage(
                        chatId,
                        `⚠️ <b>EJECUCIÓN REQUIERE PRECISIÓN ADICIONAL — #${escapeHtmlLocal(ticket.ticket_code)}</b>\n\n${escapeHtmlLocal(execRes.summary)}`,
                        buildRetryExecutionKeyboard(ticket.id)
                    );
                    return;
                }
                await sendTelegramMessage(
                    chatId,
                    `✅ <b>TAREA FINALIZADA Y TICKET RESUELTO — #${escapeHtmlLocal(ticket.ticket_code)}</b>\n` +
                    `📦 <b>Archivos actualizados:</b> <code>${escapeHtmlLocal(execRes.modifiedFiles.join(', '))}</code>`
                );
            } catch (err) {
                await sendTelegramMessage(chatId, `⚠️ Error ejecutando #${escapeHtmlLocal(ticket.ticket_code)}: ${escapeHtmlLocal(err.message)}`);
            }
        });
        return true;
    }

    const resolveMatch = trimmed.match(/^\/resolver\s+([A-Za-z0-9#-]+)(?:\s+([\s\S]+))?$/i);
    if (resolveMatch) {
        const ticket = await getTicketByCodeOrId(resolveMatch[1]);
        if (!ticket) {
            await sendTelegramMessage(chatId, `⚠️ No se encontró el ticket <code>${escapeHtmlLocal(resolveMatch[1])}</code>.`);
            return true;
        }
        const note = (resolveMatch[2] || '').trim() || 'Solicitud atendida y resuelta desde Telegram.';
        const updated = await ticketService.updateTicketStatus(ticket.id, {
            status: 'resuelto',
            resolutionNotes: note,
            actorId: effectivePerms?.linkedUser?.id || null,
            actorName,
            source: 'telegram',
            skipTelegramStatusAlert: true
        });
        await sendTelegramMessage(
            chatId,
            `✅ <b>Ticket #${escapeHtmlLocal(updated.ticket_code)} MARCADO COMO RESUELTO</b>\n` +
            `📌 <b>Asunto:</b> ${escapeHtmlLocal(updated.subject)}\n` +
            `📝 <b>Solución:</b> ${escapeHtmlLocal(note)}`
        );
        return true;
    }

    return false;
}

module.exports = {
    isTicketAdminOrManager,
    getTicketByCodeOrId,
    runRealTicketPlanOnServer,
    runRealTicketExecutionOnServer,
    handleTicketCallback,
    handleTicketTextCommand
};
