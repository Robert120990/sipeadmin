'use strict';

const {
    parseStrictDBDate,
    computeMovementFingerprint
} = require('../../services/bancosIntegrityService');

/**
 * Unified stateful transactional in-memory DB mock (`db`, `externalDb`, `accountingDb`)
 * for opaque-box E2E tests covering Bancos (R2–R5), Control de Pagos (R6),
 * Tareas + MiBot (R7), Auth/RBAC, Bitácora, Notifications, and Sentinel.
 */
function createUnifiedMockDb() {
    const createInitialState = () => ({
        seq: {
            empresas: 10,
            bancos: 10,
            tipos_cuenta_bancaria: 10,
            tipos_remesas: 20,
            cuentas_bancarias: 10,
            movimientos_bancarios: 100,
            movimientos_bancarios_comprobantes: 100,
            cheques: 200,
            chequeras: 50,
            validaciones_saldo_banco: 300,
            conciliacion_periodos: 400,
            conciliacion_reapertura_solicitudes: 500,
            conciliacion_importaciones: 600,
            conciliacion_reglas_clasificacion: 650,
            conciliacion_cruces: 670,
            conciliacion_cruce_items: 690,
            bancos_auditoria_detalle: 700,
            check_format: 20,
            printer_calibration: 20,
            notifications: 800,
            bitacora_logs: 900,
            tasks: 1000,
            task_comments: 1100,
            task_attachments: 1200,
            mibot_programaciones: 1300,
            mibot_programaciones_destinatarios: 1400,
            recordatorios_pagos_abonos: 1500,
            recordatorios_pagos_comprobantes: 1600,
            telegram_sentinel_log: 1700,
            web_rc_recordatorios: 2000,
            web_rc_recordatorios_vencimientos: 2100
        },
        users: [
            { id: 1, username: 'admin_e2e', nombre: 'Admin E2E', email: 'admin@sipe.local', status: 'active', role_id: 1, role_name: 'Administrator', token_version: 1 },
            { id: 2, username: 'operador_e2e', nombre: 'Operador Bancos', email: 'op@sipe.local', status: 'active', role_id: 2, role_name: 'Contador', token_version: 1 },
            { id: 3, username: 'consulta_e2e', nombre: 'Solo Consulta', email: 'cons@sipe.local', status: 'active', role_id: 3, role_name: 'Auditor', token_version: 1 },
            { id: 4, username: 'aprobador_e2e', nombre: 'Jefe Autorizador', email: 'jefe@sipe.local', status: 'active', role_id: 4, role_name: 'Gerente', token_version: 1 },
            { id: 5, username: 'impresor_e2e', nombre: 'Auxiliar Cheques', email: 'imp@sipe.local', status: 'active', role_id: 5, role_name: 'Caja', token_version: 1 },
            { id: 6, username: 'colaborador_e2e', nombre: 'Colaborador Sin Admin', email: 'col@sipe.local', status: 'active', role_id: 6, role_name: 'Colaborador', token_version: 1 }
        ],
        rolePermissions: {
            1: [
                'manage_conciliacion_bancaria', 'close_conciliacion_periodo', 'approve_reapertura_conciliacion',
                'edit_monto_conciliacion', 'manage_cuentas', 'manage_movimientos', 'manage_cheques',
                'manage_chequeras', 'manage_conciliacion_reglas', 'manage_cheques_contado',
                'manage_check_designer', 'manage_recordatorios', 'manage_tasks', 'manage_telegram',
                '/dashboard/bancos/reportes/saldos-bancos', '/dashboard/bancos/reportes/saldos-chequera',
                '/dashboard/bancos/reportes/movimientos-fecha', '/dashboard/operaciones/recordatorios',
                '/dashboard/operaciones/tareas', '/dashboard/seguridad/telegram'
            ],
            2: [
                'manage_conciliacion_bancaria', 'close_conciliacion_periodo', 'manage_movimientos',
                'manage_cheques', 'manage_cuentas', 'manage_chequeras', 'manage_conciliacion_reglas',
                'manage_cheques_contado', 'manage_recordatorios', 'manage_tasks',
                '/dashboard/operaciones/recordatorios', '/dashboard/operaciones/tareas',
                '/dashboard/bancos/reportes/saldos-bancos', '/dashboard/bancos/reportes/saldos-chequera',
                '/dashboard/bancos/reportes/movimientos-fecha', '/dashboard/seguridad/telegram'
            ],
            3: [
                'view_conciliacion_bancaria',
                '/dashboard/bancos/reportes/saldos-bancos',
                '/dashboard/bancos/reportes/saldos-chequera',
                '/dashboard/bancos/reportes/movimientos-fecha'
            ],
            4: [
                'manage_conciliacion_bancaria', 'approve_reapertura_conciliacion', 'edit_monto_conciliacion'
            ],
            5: [
                '/dashboard/bancos/reportes/impresion-cheques', 'manage_tasks', '/dashboard/operaciones/tareas'
            ],
            6: []
        },
        empresas: [
            { id: 1, codigo: '01', nombre: 'SIPE S.A. DE C.V.', activa: 'S' },
            { id: 2, codigo: '02', nombre: 'ESTACION NORTE S.A.', activa: 'S' }
        ],
        bancos: [
            { id: 1, empresa_id: 1, codigo: '01', descripcion: 'BANCO PROMERICA' },
            { id: 2, empresa_id: 1, codigo: '02', descripcion: 'BANCO DAVIVIENDA' },
            { id: 3, empresa_id: 2, codigo: '01', descripcion: 'BANCO PROMERICA' }
        ],
        tipos_cuenta_bancaria: [
            { id: 1, empresa_id: 1, codigo: '01', descripcion: 'CORRIENTE' },
            { id: 2, empresa_id: 1, codigo: '02', descripcion: 'AHORRO' },
            { id: 3, empresa_id: 2, codigo: '01', descripcion: 'CORRIENTE' }
        ],
        tipos_remesas: [
            { id: 1, empresa_id: 1, codigo: 'RM', descripcion: 'REMESA' },
            { id: 2, empresa_id: 1, codigo: 'NC', descripcion: 'NOTA DE CARGO' },
            { id: 3, empresa_id: 1, codigo: 'NA', descripcion: 'NOTA DE ABONO' },
            { id: 4, empresa_id: 1, codigo: 'TR', descripcion: 'TRANSFERENCIA' },
            { id: 5, empresa_id: 2, codigo: 'RM', descripcion: 'REMESA' },
            { id: 6, empresa_id: 2, codigo: 'NC', descripcion: 'NOTA DE CARGO' },
            { id: 7, empresa_id: 2, codigo: 'NA', descripcion: 'NOTA DE ABONO' },
            { id: 8, empresa_id: 2, codigo: 'TR', descripcion: 'TRANSFERENCIA' }
        ],
        cuentas_bancarias: [
            {
                id: 1, empresa_id: 1, banco_id: 1, tipo_cuenta_id: 1,
                numero: '2000012345', nombre: 'CUENTA OPERATIVA', cod_cta: '110201',
                orden: 1, activa: 1, saldo_inicial: 1000.00, fecha_saldo_inicial: '2026-10-01'
            },
            {
                id: 2, empresa_id: 2, banco_id: 3, tipo_cuenta_id: 3,
                numero: '3000098765', nombre: 'CUENTA ESTACION NORTE', cod_cta: '110202',
                orden: 2, activa: 1, saldo_inicial: 500.00, fecha_saldo_inicial: '2026-10-01'
            }
        ],
        movimientos_bancarios: [
            {
                id: 1, empresa_id: 1, cuenta_bancaria_id: 1,
                fecha: '2026-10-10', fecha_aplicado: '2026-10-10',
                documento: 'REM-100', concepto: 'DEPOSITO VENTAS',
                monto: 500.00, cargo: 0, abono: 500.00,
                tipo_remesa_id: 1, cod_cta: '110201', num_partida: null,
                es_contabilizado: 0, deleted_at: null, version: 1,
                transfer_group_id: null, comprobante_url: null,
                fingerprint: computeMovementFingerprint({
                    cuentaBancariaId: 1, fecha: '2026-10-10', documento: 'REM-100',
                    cargo: 0, abono: 500.00, concepto: 'DEPOSITO VENTAS'
                })
            },
            {
                id: 2, empresa_id: 1, cuenta_bancaria_id: 1,
                fecha: '2026-10-15', fecha_aplicado: null,
                documento: 'NC-50', concepto: 'COMISION BANCARIA',
                monto: 25.00, cargo: 25.00, abono: 0,
                tipo_remesa_id: 2, cod_cta: '110201', num_partida: null,
                es_contabilizado: 0, deleted_at: null, version: 1,
                transfer_group_id: null, comprobante_url: null,
                fingerprint: 'fp-2'
            },
            {
                id: 3, empresa_id: 1, cuenta_bancaria_id: 1,
                fecha: '2026-10-18', fecha_aplicado: '2026-10-18',
                documento: 'REM-CONT', concepto: 'DEPOSITO CONTABILIZADO',
                monto: 200.00, cargo: 0, abono: 200.00,
                tipo_remesa_id: 1, cod_cta: '110201', num_partida: 'P-99',
                es_contabilizado: 1, deleted_at: null, version: 1,
                transfer_group_id: null, comprobante_url: null,
                fingerprint: 'fp-3'
            }
        ],
        movimientos_bancarios_comprobantes: [],
        cheques: [
            {
                id: 10, empresa_id: 1, cuenta_bancaria_id: 1, llave: 'CHQ00000000000000010',
                fecha: '2026-10-20', cheque_anulado: 0, cheque: '5001', valor: 150.00,
                a_nombre: 'PROVEEDOR UNO', fecha_aplicado: null, concepto: 'COMPRA MATERIALES',
                es_reservado: 0, es_pago_contado: 0, fue_noemitido: 0, num_partida: null,
                es_contabilizado: 0, deleted_at: null, valor_original: null,
                beneficiario_original: null, concepto_original: null,
                anulado_by: null, anulado_at: null, chequera_id: null,
                impreso_at: null, impreso_por: null, veces_impreso: 0, version: 1
            },
            {
                id: 11, empresa_id: 1, cuenta_bancaria_id: 1, llave: 'CHQ00000000000000011',
                fecha: '2026-10-22', cheque_anulado: 0, cheque: '5002', valor: 999.00,
                a_nombre: 'RESERVA CONTROLADA', fecha_aplicado: null, concepto: 'CHEQUE RESERVADO',
                es_reservado: 1, es_pago_contado: 0, fue_noemitido: 0, num_partida: null,
                es_contabilizado: 0, deleted_at: null, valor_original: null,
                beneficiario_original: null, concepto_original: null,
                anulado_by: null, anulado_at: null, chequera_id: null,
                impreso_at: null, impreso_por: null, veces_impreso: 0, version: 1
            }
        ],
        chequeras: [],
        validaciones_saldo_banco: [],
        conciliacion_periodos: [],
        conciliacion_reapertura_solicitudes: [],
        conciliacion_importaciones: [],
        conciliacion_reglas_clasificacion: [],
        conciliacion_cruces: [],
        conciliacion_cruce_items: [],
        bancos_auditoria_detalle: [],
        bancos_idempotency_keys: [],
        check_format: [
            {
                id: 1, name: 'Promerica Carta', description: 'Formato carta',
                banco_id: 1, width: 215.9, height: 279.4, orientation: 'portrait',
                margin_top: 0, margin_right: 0, margin_bottom: 0, margin_left: 0,
                resolution: 300, printer_name: 'HP LaserJet', is_active: 1,
                design_json: JSON.stringify({ fields: [] }),
                created_at: '2026-10-01', updated_at: '2026-10-01'
            }
        ],
        printer_calibration: [
            { id: 1, printer_name: 'HP LaserJet', offset_x: 2.5, offset_y: -1.5, scale: 1.0 }
        ],
        notifications: [],
        bitacora_logs: [],
        tasks: [],
        task_comments: [],
        task_attachments: [],
        telegram_config: [
            { id: 1, bot_token: '123456789:AABBCCDDEEFFGGHHIIJJKKLLMMNNOOPPQQR', is_active: 1, gemini_api_key: null, openclaw_url: null }
        ],
        telegram_usuarios: [
            {
                id: 1, user_id: 1, telegram_user_id: '1001', first_name: 'Admin', last_name: 'SIPE',
                username: 'admin_tg', cargo: 'Director', activo: 1, recibir_mibot: 1,
                mibot_pagos: 1, mibot_tareas: 1, mibot_validaciones: 1, mibot_reuniones: 1,
                permiso_alertas: 1, permiso_saldos_banco: 1
            },
            {
                id: 2, user_id: 6, telegram_user_id: '1006', first_name: 'Carlos', last_name: 'Colaborador',
                username: 'carlos_tg', cargo: 'Supervisor', activo: 1, recibir_mibot: 1,
                mibot_pagos: 1, mibot_tareas: 1, mibot_validaciones: 1, mibot_reuniones: 1,
                permiso_alertas: 0, permiso_saldos_banco: 0
            }
        ],
        telegram_sentinel_log: [],
        mibot_programaciones: [],
        mibot_programaciones_destinatarios: [],
        recordatorios_vencimientos_meta: [],
        recordatorios_pagos_abonos: [],
        recordatorios_pagos_comprobantes: [],
        prestamos: [],
        rh_planilla_pagos: [],
        portal_pedidos: [],

        // External DB (db_sistema_saas / web_rc_*)
        web_rc_ubicaciones: [
            { id: 1, descripcion: 'ANDELSA CENTRAL' },
            { id: 2, descripcion: 'ESTACION NORTE' }
        ],
        web_rc_recordatorios: [
            { id: 100, descripcion: 'PAGO ENERGIA ELECTRICA', id_ubicacion: 1, iniciar: '2026-11-01', monto: 1000.00, repetir: 1, repetir_desc: 'VEZ', activo: 1, forma_pago: 'TRANSF PROMERICA' }
        ],
        web_rc_recordatorios_vencimientos: [
            { id: 500, id_recordatorio: 100, vencimiento: '2026-11-25', estado: 'P', fecha_cancelacion: null, forma_pago: '' }
        ],
        proveedores: [
            { id_empresa: '02', codigo: 'PROV01', nombre: 'DISTRIBUIDORA PETROLEO S.A. DE C.V.' }
        ],
        solicitud_chq_contado: [
            {
                llave: 'SOL-CONT-001', id_empresa: '02', fecha: '2026-11-15',
                cod_proveedor: 'PROV01', monto: 350.00, num_cheque: '', llave_cheque: null,
                concepto: 'COMPRA LUBRICANTES CONTADO'
            },
            {
                llave: 'SOL-CONT-002', id_empresa: '02', fecha: '2026-11-16',
                cod_proveedor: 'PROV01', monto: 220.00, num_cheque: '', llave_cheque: null,
                concepto: 'REPUESTOS BOMBA'
            }
        ],
        externalDbOffline: false,
        spSaldoBancosRows: [
            { nom_banco: 'PROMERICA - CUENTA OPERATIVA', num_cta: '2000012345', new_saldo: 1700.00, saldo: 1700.00 }
        ],
        spSaldoChequeraRows: [
            { nom_banco: 'PROMERICA - CUENTA OPERATIVA', num_cta: '2000012345', new_saldo: 1525.00, saldo_chequera: 1525.00 }
        ],
        failOnSecondImportInsert: false,
        importInsertCounter: 0
    });

    let state = createInitialState();

    const reset = () => {
        state = createInitialState();
    };

    const ymd = (d) => {
        if (!d) return null;
        if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        return parseStrictDBDate(d) || String(d).slice(0, 10);
    };

    const likeMatch = (text, pattern) => {
        const escaped = String(pattern || '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
        return new RegExp(`^${escaped}$`, 'i').test(String(text || ''));
    };

    const splitTopLevelCommas = (str) => {
        const parts = [];
        let cur = '';
        let depth = 0;
        let inQuote = null;
        for (let i = 0; i < str.length; i++) {
            const ch = str[i];
            if (inQuote) {
                cur += ch;
                if (ch === inQuote && str[i - 1] !== '\\') inQuote = null;
            } else if (ch === '\'' || ch === '"') {
                inQuote = ch;
                cur += ch;
            } else if (ch === '(') {
                depth++;
                cur += ch;
            } else if (ch === ')') {
                depth = Math.max(0, depth - 1);
                cur += ch;
            } else if (ch === ',' && depth === 0) {
                parts.push(cur.trim());
                cur = '';
            } else {
                cur += ch;
            }
        }
        if (cur.trim()) parts.push(cur.trim());
        return parts;
    };

    const applySqlSet = (rows, sql, params = [], { dateCols = [], numCols = [], boolCols = [] } = {}) => {
        const setMatch = sql.match(/\bset\s+([\s\S]+?)(?:\s+where\s+([\s\S]+))?$/i);
        if (!setMatch) return { affectedRows: 0, whereParams: params };

        const dateSet = new Set(dateCols);
        const numSet = new Set(numCols);
        const boolSet = new Set(boolCols);
        const assignments = splitTopLevelCommas(setMatch[1]);
        const whereClause = (setMatch[2] || '').toLowerCase();

        let pIdx = 0;
        const parsedAssignments = assignments.map((assign) => {
            const eqIdx = assign.indexOf('=');
            if (eqIdx < 0) return null;
            const rawCol = assign.slice(0, eqIdx).trim().replace(/^[a-z0-9_]+\./i, '');
            const col = rawCol.toLowerCase();
            const expr = assign.slice(eqIdx + 1).trim();
            const qCount = (expr.match(/\?/g) || []).length;
            const consumed = params.slice(pIdx, pIdx + qCount);
            pIdx += qCount;
            return { col, expr, consumed };
        }).filter(Boolean);

        const whereParams = params.slice(pIdx);
        let targets = rows;

        if (whereClause) {
            if (whereClause.includes('deleted_at is null')) {
                targets = targets.filter((r) => !r.deleted_at);
            }
            const idInMatch = whereClause.match(/\bid\s+in\s*\(([^)]+)\)/);
            if (idInMatch) {
                const prefix = whereClause.slice(0, idInMatch.index);
                const startIdx = (prefix.match(/\?/g) || []).length;
                const qInCount = (idInMatch[1].match(/\?/g) || []).length;
                const slice = qInCount > 0 ? whereParams.slice(startIdx, startIdx + qInCount) : whereParams;
                const ids = new Set(slice.flat().map(Number).filter(Number.isFinite));
                targets = targets.filter((r) => ids.has(Number(r.id)));
            } else {
                const idEqMatch = whereClause.match(/\bid\s*=\s*\?/);
                if (idEqMatch) {
                    const prefix = whereClause.slice(0, idEqMatch.index);
                    const idParamIdx = (prefix.match(/\?/g) || []).length;
                    const targetId = Number(whereParams[idParamIdx]);
                    targets = targets.filter((r) => Number(r.id) === targetId);
                } else {
                    const codEqMatch = whereClause.match(/\bcodigo\s*=\s*\?/);
                    if (codEqMatch) {
                        const prefix = whereClause.slice(0, codEqMatch.index);
                        const codParamIdx = (prefix.match(/\?/g) || []).length;
                        const targetCod = String(whereParams[codParamIdx]);
                        targets = targets.filter((r) => String(r.codigo) === targetCod);
                    }
                }
            }
        }

        let affected = 0;
        for (const row of targets) {
            for (const { col, expr, consumed } of parsedAssignments) {
                const exprLow = expr.toLowerCase();
                if (expr === '?') {
                    const val = consumed[0];
                    if (dateSet.has(col)) row[col] = ymd(val);
                    else if (boolSet.has(col)) row[col] = Number(Boolean(val));
                    else if (numSet.has(col)) row[col] = (val === null || val === undefined || val === '') ? null : Number(val);
                    else row[col] = val;
                } else if (exprLow === 'null') {
                    row[col] = null;
                } else if (exprLow === 'now()' || exprLow === 'current_timestamp') {
                    row[col] = new Date().toISOString();
                } else if (/^\w+\s*\+\s*1$/.test(exprLow) || exprLow.includes(`${col} + 1`)) {
                    row[col] = Number(row[col] || 0) + 1;
                } else if (exprLow === 'true' || exprLow === 'false') {
                    row[col] = exprLow === 'true' ? 1 : 0;
                } else if (/^-?\d+(\.\d+)?$/.test(expr)) {
                    row[col] = Number(expr);
                } else if (/^['"][\s\S]*['"]$/.test(expr)) {
                    row[col] = expr.slice(1, -1);
                } else if (exprLow.startsWith('coalesce(') && consumed.length === 1) {
                    const v = consumed[0];
                    if (v !== null && v !== undefined) {
                        row[col] = dateSet.has(col) ? ymd(v) : (numSet.has(col) ? Number(v) : v);
                    }
                }
            }
            affected++;
        }

        return { affectedRows: affected, whereParams };
    };

    const runQuery = async (sqlRaw, params = []) => {
        const sql = String(sqlRaw || '').replace(/\s+/g, ' ').trim();
        const sqlLower = sql.toLowerCase();
        const isMutation = /^(?:insert|update|delete|replace)\b/.test(sqlLower);
        const isSelect = !isMutation;

        // DDL / Schema introspection (idempotent no-ops)
        if (/^(?:create table|alter table|show columns|show index)/i.test(sqlLower)) {
            if (sqlLower.startsWith('show columns')) {
                return [[{ Field: 'id' }]];
            }
            if (sqlLower.startsWith('show index')) {
                return [[{ Key_name: 'PRIMARY' }]];
            }
            return [{ affectedRows: 0 }];
        }
        if (sqlLower.includes('from information_schema.columns')) {
            if (sqlLower.includes("table_name = 'telegram_usuarios'")) {
                return [[
                    { COLUMN_NAME: 'cargo' }, { COLUMN_NAME: 'recibir_mibot' },
                    { COLUMN_NAME: 'mibot_pagos' }, { COLUMN_NAME: 'mibot_tareas' },
                    { COLUMN_NAME: 'mibot_validaciones' }, { COLUMN_NAME: 'mibot_reuniones' }
                ]];
            }
            return [[{ COLUMN_NAME: 'beneficiario' }, { COLUMN_NAME: 'cheque_id' }, { COLUMN_NAME: 'task_id' }, { COLUMN_NAME: 'incluir_adjuntos' }, { COLUMN_NAME: 'attachment_ids' }]];
        }

        // Auth & Users & Permissions
        if (sqlLower.includes('from users u left join roles r') && sqlLower.includes('where u.id = ?')) {
            const u = state.users.find((x) => Number(x.id) === Number(params[0]));
            return [u ? [{ ...u }] : []];
        }
        if (sqlLower.includes('from permissions p join role_permissions rp')) {
            const perms = state.rolePermissions[Number(params[0])] || [];
            return [perms.map((name) => ({ name }))];
        }
        if (sqlLower.includes('from role_permissions rp join users u')) {
            const approvers = state.users.filter((u) =>
                (state.rolePermissions[u.role_id] || []).includes('approve_reapertura_conciliacion')
            );
            return [approvers.map((u) => ({ id: u.id }))];
        }
        if (sqlLower.includes('from users u left join roles r on u.role_id = r.id where u.status')) {
            return [state.users.filter((u) => u.role_id === 1).map((u) => ({ id: u.id }))];
        }
        if (sqlLower.includes('from users u') && sqlLower.includes('left join role_permissions rp') && sqlLower.includes("coalesce(u.status, 'active') = 'active'")) {
            const rows = [];
            for (const u of state.users.filter((usr) => (usr.status || 'active') === 'active')) {
                const perms = state.rolePermissions[Number(u.role_id)] || [];
                if (perms.length === 0) {
                    rows.push({
                        id: u.id, username: u.username, nombre: u.nombre, status: u.status,
                        role_id: u.role_id, role_name: u.role_name || '', permission_name: null
                    });
                } else {
                    for (const pName of perms) {
                        rows.push({
                            id: u.id, username: u.username, nombre: u.nombre, status: u.status,
                            role_id: u.role_id, role_name: u.role_name || '', permission_name: pName
                        });
                    }
                }
            }
            return [rows];
        }
        if (sqlLower.includes('from users u left join roles r on u.role_id = r.id left join telegram_usuarios')) {
            const rows = state.users
                .filter((u) => u.status === 'active')
                .map((u) => {
                    const tu = state.telegram_usuarios.find((t) => Number(t.user_id) === Number(u.id) && Number(t.activo) === 1);
                    return {
                        id: u.id, username: u.username, nombre: u.nombre, email: u.email,
                        status: u.status, role_id: u.role_id, role_name: u.role_name,
                        telegram_usuario_id: tu?.id || null, telegram_user_id: tu?.telegram_user_id || null,
                        telegram_username: tu?.username || null, telegram_cargo: tu?.cargo || null,
                        recibir_mibot: tu?.recibir_mibot ?? null, mibot_tareas: tu?.mibot_tareas ?? null,
                        mibot_validaciones: tu?.mibot_validaciones ?? null, mibot_reuniones: tu?.mibot_reuniones ?? null
                    };
                });
            return [rows];
        }
        if (sqlLower.startsWith('select id, status from users')) {
            return [state.users.map((u) => ({ id: u.id, status: u.status }))];
        }

        // Bitacora & Notifications
        if (sqlLower.startsWith('insert into bitacora_logs')) {
            const id = ++state.seq.bitacora_logs;
            const [user_id, username, accion, entidad, entidad_id, detalles, ip_address] = params;
            state.bitacora_logs.push({
                id, user_id, username, accion, entidad, entidad_id, detalles, ip_address,
                created_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.includes('from bitacora_logs')) {
            return [state.bitacora_logs.slice().reverse()];
        }
        if (sqlLower.startsWith('insert into notifications')) {
            const id = ++state.seq.notifications;
            if (sqlLower.includes("'bank_sentinel_alert'")) {
                const [user_id, title, message, data] = params;
                state.notifications.push({
                    id, user_id: Number(user_id), type: 'bank_sentinel_alert', title, message, data,
                    is_read: 0, created_at: new Date().toISOString()
                });
            } else {
                const [user_id, type, title, message, data] = params;
                state.notifications.push({
                    id, user_id: Number(user_id), type, title, message, data,
                    is_read: 0, created_at: new Date().toISOString()
                });
            }
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.includes('from notifications') && sqlLower.includes('where user_id = ?')) {
            const uid = Number(params[0]);
            const rows = state.notifications.filter((n) => Number(n.user_id) === uid);
            if (sqlLower.includes('count(*)')) {
                return [[{ unreadCount: rows.filter((n) => !n.is_read).length }]];
            }
            return [rows.slice().reverse()];
        }

        // Idempotency
        if (sqlLower.startsWith('insert into bancos_idempotency_keys')) {
            const [key, scope, userId, reqHash] = params;
            const dup = state.bancos_idempotency_keys.find((r) => r.idempotency_key === key && r.scope === scope);
            if (dup) {
                const err = new Error('Duplicate idempotency key');
                err.code = 'ER_DUP_ENTRY';
                throw err;
            }
            state.bancos_idempotency_keys.push({
                idempotency_key: key, scope, user_id: userId, request_hash: reqHash,
                status_code: null, response_json: null
            });
            return [{ affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update bancos_idempotency_keys set status_code = ?')) {
            const [statusCode, responseJson, key, scope] = params;
            const row = state.bancos_idempotency_keys.find((r) => r.idempotency_key === key && r.scope === scope);
            if (row) {
                row.status_code = statusCode;
                row.response_json = responseJson;
            }
            return [{ affectedRows: row ? 1 : 0 }];
        }
        if (sqlLower.startsWith('delete from bancos_idempotency_keys')) {
            const [key, scope] = params;
            const before = state.bancos_idempotency_keys.length;
            state.bancos_idempotency_keys = state.bancos_idempotency_keys.filter(
                (r) => !(r.idempotency_key === key && r.scope === scope && (!sqlLower.includes('status_code is null') || r.status_code === null))
            );
            return [{ affectedRows: before - state.bancos_idempotency_keys.length }];
        }
        if (isSelect && sqlLower.includes('from bancos_idempotency_keys where idempotency_key = ?')) {
            const [key, scope] = params;
            const row = state.bancos_idempotency_keys.find((r) => r.idempotency_key === key && r.scope === scope);
            return [row ? [row] : []];
        }

        // Bancos Auditoria
        if (sqlLower.startsWith('insert into bancos_auditoria_detalle')) {
            const id = ++state.seq.bancos_auditoria_detalle;
            const [cuenta_bancaria_id, entidad, entidad_id, accion, user_id, username, ip_address, motivo, before_json, after_json, metadata_json] = params;
            state.bancos_auditoria_detalle.push({
                id, cuenta_bancaria_id, entidad, entidad_id, accion, user_id, username, ip_address,
                motivo, before_json, after_json, metadata_json, created_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (isSelect && sqlLower.includes('from bancos_auditoria_detalle')) {
            let rows = state.bancos_auditoria_detalle.slice();
            if (sqlLower.includes('cuenta_bancaria_id = ?')) {
                rows = rows.filter((r) => Number(r.cuenta_bancaria_id) === Number(params[0]));
            }
            if (sqlLower.includes('count(*)')) {
                return [[{ total: rows.length }]];
            }
            rows = rows.slice().reverse();
            if (sqlLower.includes('limit ? offset ?')) {
                const offset = Number(params[params.length - 1]) || 0;
                const limit = Number(params[params.length - 2]) || rows.length;
                rows = rows.slice(offset, offset + limit);
            }
            return [rows];
        }

        // Empresas, Bancos, Tipos de Cuenta, Tipos de Remesas
        if (isSelect && sqlLower.includes('from empresas where codigo = ? or id = ?')) {
            return [state.empresas.filter((e) => String(e.codigo) === String(params[0]) || Number(e.id) === Number(params[1]))];
        }
        if (isSelect && sqlLower.includes('from empresas where codigo = ?')) {
            return [state.empresas.filter((e) => String(e.codigo) === String(params[0]))];
        }
        if (isSelect && sqlLower.includes('from empresas order by')) {
            return [state.empresas.map((e) => ({ ...e, id: e.id, codigo: e.codigo }))];
        }
        if (sqlLower.startsWith('select codigo as id, nombre from empresas')) {
            return [state.empresas.map((e) => ({ id: e.codigo, nombre: e.nombre }))];
        }

        if (sqlLower.startsWith('insert into bancos (')) {
            const id = ++state.seq.bancos;
            const [empresa_id, codigo, descripcion] = params;
            state.bancos.push({ id, empresa_id: Number(empresa_id), codigo: String(codigo), descripcion: String(descripcion) });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update bancos set descripcion = ?')) {
            const [descripcion, codigo] = params;
            let affected = 0;
            state.bancos.forEach((b) => {
                if (String(b.codigo) === String(codigo) || Number(b.id) === Number(codigo)) {
                    b.descripcion = String(descripcion);
                    affected++;
                }
            });
            return [{ affectedRows: affected }];
        }
        if (sqlLower.startsWith('delete from bancos')) {
            const target = params[0];
            const before = state.bancos.length;
            state.bancos = state.bancos.filter((b) => String(b.codigo) !== String(target) && Number(b.id) !== Number(target));
            return [{ affectedRows: before - state.bancos.length }];
        }
        if (isSelect && sqlLower.includes('from bancos b') && sqlLower.includes('group by b.codigo')) {
            const byCode = new Map();
            for (const b of state.bancos) {
                const emp = state.empresas.find((e) => Number(e.id) === Number(b.empresa_id));
                const cur = byCode.get(b.codigo) || { codigo: b.codigo, descripcion: b.descripcion, empresas: [] };
                if (emp) cur.empresas.push(emp.nombre);
                byCode.set(b.codigo, cur);
            }
            return [[...byCode.values()].map((r) => ({
                codigo: r.codigo, descripcion: r.descripcion,
                empresas_count: r.empresas.length, empresas_nombres: r.empresas.join(', ')
            }))];
        }
        if (isSelect && sqlLower.includes('from bancos b') && sqlLower.includes('group by b.descripcion')) {
            const map = new Map();
            for (const b of state.bancos) {
                const cur = map.get(b.descripcion) || { id: b.id, descripcion: b.descripcion, num_empresas: 0 };
                cur.num_empresas += 1;
                map.set(b.descripcion, cur);
            }
            return [[...map.values()]];
        }
        if (isSelect && sqlLower.includes('max(cast(codigo as unsigned))') && sqlLower.includes('from bancos')) {
            const nums = state.bancos.map((b) => parseInt(b.codigo, 10)).filter((n) => Number.isFinite(n));
            return [[{ max_cod: nums.length ? Math.max(...nums) : 0 }]];
        }
        if (isSelect && sqlLower.includes('from bancos where empresa_id = ? and codigo = ?')) {
            return [state.bancos.filter((b) => Number(b.empresa_id) === Number(params[0]) && String(b.codigo) === String(params[1]))];
        }
        if (isSelect && sqlLower.includes('from bancos where empresa_id = ? and upper(descripcion) = ?')) {
            return [state.bancos.filter((b) => Number(b.empresa_id) === Number(params[0]) && b.descripcion.toUpperCase() === String(params[1]).toUpperCase())];
        }
        if (isSelect && sqlLower.includes('from bancos where empresa_id = ?')) {
            return [state.bancos.filter((b) => Number(b.empresa_id) === Number(params[0])).map((b) => ({ ...b, id: sqlLower.includes('codigo as id') ? b.codigo : b.id }))];
        }
        if (isSelect && sqlLower.includes('from bancos where id = ?')) {
            return [state.bancos.filter((b) => Number(b.id) === Number(params[0]))];
        }
        if (isSelect && sqlLower.includes('from bancos where codigo = ? and empresa_id = ?')) {
            return [state.bancos.filter((b) => String(b.codigo) === String(params[0]) && Number(b.empresa_id) === Number(params[1]))];
        }
        if (isSelect && sqlLower.includes('from bancos where codigo = ?')) {
            return [state.bancos.filter((b) => String(b.codigo) === String(params[0]))];
        }
        if (isSelect && sqlLower.includes('from bancos')) {
            let rows = state.bancos.slice();
            let pIdx = 0;
            if (sqlLower.includes('empresa_id in (?)')) {
                const empIds = (Array.isArray(params[pIdx]) ? params[pIdx] : [params[pIdx]]).map(Number);
                pIdx++;
                rows = rows.filter((b) => empIds.includes(Number(b.empresa_id)));
            }
            if (sqlLower.includes('upper(descripcion) = ?')) {
                const desc = String(params[pIdx++]).toUpperCase();
                rows = rows.filter((b) => String(b.descripcion || '').toUpperCase() === desc);
            }
            if (sqlLower.includes('codigo <> ?') || sqlLower.includes('codigo != ?')) {
                const cod = String(params[pIdx++]);
                rows = rows.filter((b) => String(b.codigo) !== cod);
            }
            return [rows];
        }

        // Tipos de cuenta bancaria (mutations BEFORE selects)
        if (sqlLower.startsWith('insert into tipos_cuenta_bancaria')) {
            const id = ++state.seq.tipos_cuenta_bancaria;
            const [empresa_id, codigo, descripcion] = params;
            state.tipos_cuenta_bancaria.push({ id, empresa_id: Number(empresa_id), codigo: String(codigo), descripcion: String(descripcion) });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update tipos_cuenta_bancaria')) {
            const { affectedRows } = applySqlSet(state.tipos_cuenta_bancaria, sql, params, { numCols: ['empresa_id'] });
            return [{ affectedRows }];
        }
        if (sqlLower.startsWith('delete from tipos_cuenta_bancaria')) {
            const before = state.tipos_cuenta_bancaria.length;
            if (sqlLower.includes('where codigo = ?')) {
                const cod = String(params[0]);
                state.tipos_cuenta_bancaria = state.tipos_cuenta_bancaria.filter((t) => String(t.codigo) !== cod);
            } else {
                const id = Number(params[0]);
                state.tipos_cuenta_bancaria = state.tipos_cuenta_bancaria.filter((t) => Number(t.id) !== id);
            }
            return [{ affectedRows: before - state.tipos_cuenta_bancaria.length }];
        }
        if (isSelect && sqlLower.includes('from cuentas_bancarias cb') && sqlLower.includes('inner join tipos_cuenta_bancaria t')) {
            const cod = String(params[0]);
            const typeIds = new Set(state.tipos_cuenta_bancaria.filter((t) => String(t.codigo) === cod).map((t) => Number(t.id)));
            const cnt = state.cuentas_bancarias.filter((cb) => typeIds.has(Number(cb.tipo_cuenta_id))).length;
            return [[{ cnt }]];
        }
        if (isSelect && sqlLower.includes('from tipos_cuenta_bancaria where empresa_id = ? and codigo = ?')) {
            return [state.tipos_cuenta_bancaria.filter((t) => Number(t.empresa_id) === Number(params[0]) && String(t.codigo) === String(params[1]))];
        }
        if (isSelect && sqlLower.includes('from tipos_cuenta_bancaria where empresa_id = ? and upper(descripcion) = ?')) {
            return [state.tipos_cuenta_bancaria.filter((t) => Number(t.empresa_id) === Number(params[0]) && String(t.descripcion || '').toUpperCase() === String(params[1]).toUpperCase())];
        }
        if (isSelect && sqlLower.includes('from tipos_cuenta_bancaria where empresa_id = ?')) {
            return [state.tipos_cuenta_bancaria.filter((t) => Number(t.empresa_id) === Number(params[0])).map((t) => ({ ...t, id: sqlLower.includes('codigo as id') ? t.codigo : t.id }))];
        }
        if (isSelect && sqlLower.includes('from tipos_cuenta_bancaria')) {
            if (sqlLower.includes('where id = ?')) {
                return [state.tipos_cuenta_bancaria.filter((t) => Number(t.id) === Number(params[0]))];
            }
            if (sqlLower.includes('where codigo = ? and empresa_id = ?')) {
                return [state.tipos_cuenta_bancaria.filter((t) => String(t.codigo) === String(params[0]) && Number(t.empresa_id) === Number(params[1]))];
            }
            if (sqlLower.includes('where codigo = ?')) {
                return [state.tipos_cuenta_bancaria.filter((t) => String(t.codigo) === String(params[0]))];
            }
            if (sqlLower.includes('empresa_id in (?)') || sqlLower.includes('upper(descripcion) = ?')) {
                let rows = state.tipos_cuenta_bancaria.slice();
                let pIdx = 0;
                if (sqlLower.includes('empresa_id in (?)')) {
                    const empIds = (Array.isArray(params[pIdx]) ? params[pIdx] : [params[pIdx]]).map(Number);
                    pIdx++;
                    rows = rows.filter((t) => empIds.includes(Number(t.empresa_id)));
                }
                if (sqlLower.includes('upper(descripcion) = ?')) {
                    const desc = String(params[pIdx++]).toUpperCase();
                    rows = rows.filter((t) => String(t.descripcion || '').toUpperCase() === desc);
                }
                if (sqlLower.includes('codigo <> ?') || sqlLower.includes('codigo != ?')) {
                    const cod = String(params[pIdx++]);
                    rows = rows.filter((t) => String(t.codigo) !== cod);
                }
                return [rows];
            }
            return [state.tipos_cuenta_bancaria.map((t) => {
                const emp = state.empresas.find((e) => Number(e.id) === Number(t.empresa_id));
                return { ...t, empresa_codigo: emp?.codigo || '01', empresa_nombre: emp?.nombre || '' };
            })];
        }

        // Tipos de remesas (mutations BEFORE selects)
        if (sqlLower.startsWith('insert into tipos_remesas')) {
            const id = ++state.seq.tipos_remesas;
            const [empresa_id, codigo, descripcion] = params;
            state.tipos_remesas.push({ id, empresa_id: Number(empresa_id), codigo: String(codigo), descripcion: String(descripcion) });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update tipos_remesas')) {
            const { affectedRows } = applySqlSet(state.tipos_remesas, sql, params, { numCols: ['empresa_id'] });
            return [{ affectedRows }];
        }
        if (sqlLower.startsWith('delete from tipos_remesas')) {
            const before = state.tipos_remesas.length;
            if (sqlLower.includes('where codigo = ?')) {
                const cod = String(params[0]).toUpperCase();
                state.tipos_remesas = state.tipos_remesas.filter((r) => String(r.codigo).toUpperCase() !== cod);
            } else {
                const id = Number(params[0]);
                state.tipos_remesas = state.tipos_remesas.filter((r) => Number(r.id) !== id);
            }
            return [{ affectedRows: before - state.tipos_remesas.length }];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios where tipo_remesa_id in')) {
            const remIds = new Set((Array.isArray(params[0]) ? params[0] : params).map(Number));
            const cnt = state.movimientos_bancarios.filter((m) => !m.deleted_at && remIds.has(Number(m.tipo_remesa_id))).length;
            return [[{ cnt }]];
        }
        if (isSelect && sqlLower.includes('from conciliacion_reglas_clasificacion where tipo_remesa_id in')) {
            const remIds = new Set((Array.isArray(params[0]) ? params[0] : params).map(Number));
            const cnt = state.conciliacion_reglas_clasificacion.filter((r) => remIds.has(Number(r.tipo_remesa_id))).length;
            return [[{ cnt }]];
        }
        if (isSelect && sqlLower.includes('from tipos_remesas where empresa_id = ? and codigo in')) {
            const empresaId = Number(params[0]);
            const rows = state.tipos_remesas.filter((r) => Number(r.empresa_id) === empresaId && (r.codigo === 'TR' || r.codigo === 'NC' || r.codigo === 'NA'));
            return [rows];
        }
        if (isSelect && sqlLower.includes('from tipos_remesas where empresa_id = ? and codigo = ?')) {
            return [state.tipos_remesas.filter((r) => Number(r.empresa_id) === Number(params[0]) && r.codigo === params[1])];
        }
        if (isSelect && sqlLower.includes('from tipos_remesas where empresa_id = ? and upper(descripcion) = ?')) {
            return [state.tipos_remesas.filter((r) => Number(r.empresa_id) === Number(params[0]) && String(r.descripcion || '').toUpperCase() === String(params[1]).toUpperCase())];
        }
        if (isSelect && sqlLower.includes('from tipos_remesas where empresa_id = ?')) {
            return [state.tipos_remesas.filter((r) => Number(r.empresa_id) === Number(params[0])).map((r) => ({ ...r, id: sqlLower.includes('codigo as id') ? r.codigo : r.id }))];
        }
        if (isSelect && sqlLower.includes('from tipos_remesas where upper(codigo) = ? and empresa_id = ?')) {
            return [state.tipos_remesas.filter((r) => String(r.codigo).toUpperCase() === String(params[0]).toUpperCase() && Number(r.empresa_id) === Number(params[1]))];
        }
        if (isSelect && (sqlLower.includes('from tipos_remesas where codigo = ?') || sqlLower.includes('from tipos_remesas where upper(codigo) = ?'))) {
            return [state.tipos_remesas.filter((r) => String(r.codigo).toUpperCase() === String(params[0]).toUpperCase())];
        }
        if (isSelect && sqlLower.includes('from tipos_remesas where id = ?')) {
            return [state.tipos_remesas.filter((r) => Number(r.id) === Number(params[0]))];
        }
        if (isSelect && sqlLower.includes('from tipos_remesas')) {
            if (sqlLower.includes('empresa_id in (?)') || sqlLower.includes('upper(descripcion) = ?')) {
                let rows = state.tipos_remesas.slice();
                let pIdx = 0;
                if (sqlLower.includes('empresa_id in (?)')) {
                    const empIds = (Array.isArray(params[pIdx]) ? params[pIdx] : [params[pIdx]]).map(Number);
                    pIdx++;
                    rows = rows.filter((r) => empIds.includes(Number(r.empresa_id)));
                }
                if (sqlLower.includes('upper(descripcion) = ?')) {
                    const desc = String(params[pIdx++]).toUpperCase();
                    rows = rows.filter((r) => String(r.descripcion || '').toUpperCase() === desc);
                }
                if (sqlLower.includes('codigo <> ?') || sqlLower.includes('codigo != ?')) {
                    const cod = String(params[pIdx++]);
                    rows = rows.filter((r) => String(r.codigo) !== cod);
                }
                return [rows];
            }
            return [state.tipos_remesas.map((r) => {
                const emp = state.empresas.find((e) => Number(e.id) === Number(r.empresa_id));
                return { ...r, empresa_codigo: emp?.codigo || '01', empresa_nombre: emp?.nombre || '' };
            })];
        }

        // Cuentas bancarias
        if (sqlLower.includes('from cuentas_bancarias') && sqlLower.includes('c.id as corr')) {
            let rows = state.cuentas_bancarias.slice();
            if (sqlLower.includes('where c.activa = true')) {
                rows = rows.filter((c) => Boolean(c.activa));
            }
            if (sqlLower.includes('c.empresa_id = ?')) {
                const empId = Number(params[0]);
                rows = rows.filter((c) => Number(c.empresa_id) === empId);
            }
            return [rows.map((c) => {
                const emp = state.empresas.find((e) => Number(e.id) === Number(c.empresa_id));
                const bco = state.bancos.find((b) => Number(b.id) === Number(c.banco_id));
                const tip = state.tipos_cuenta_bancaria.find((t) => Number(t.id) === Number(c.tipo_cuenta_id));
                return {
                    ...c,
                    corr: c.id,
                    id_empresa: emp?.codigo || '01',
                    cod_banco: bco?.codigo || '01',
                    cod_tipo: tip?.codigo || '01',
                    activa: c.activa ? 'S' : 'N',
                    empresa_nombre: emp?.nombre || '',
                    banco_nombre: bco?.descripcion || '',
                    banco: bco?.descripcion || '',
                    tipo_nombre: tip?.descripcion || ''
                };
            })];
        }
        if (sqlLower.includes('from cuentas_bancarias cb') && sqlLower.includes('inner join empresas e') && sqlLower.includes('e.codigo = ? and cb.numero = ?')) {
            const [codEmp, numCta] = params;
            const emp = state.empresas.find((e) => String(e.codigo) === String(codEmp));
            const cta = emp ? state.cuentas_bancarias.find((c) => Number(c.empresa_id) === Number(emp.id) && c.numero === String(numCta)) : null;
            return [cta ? [{ id: cta.id }] : []];
        }
        if (sqlLower.includes('from cuentas_bancarias cb') && sqlLower.includes('where cb.id = ?')) {
            const cta = state.cuentas_bancarias.find((c) => Number(c.id) === Number(params[0]));
            if (!cta) return [[]];
            const emp = state.empresas.find((e) => Number(e.id) === Number(cta.empresa_id));
            const bco = state.bancos.find((b) => Number(b.id) === Number(cta.banco_id));
            return [[{
                ...cta,
                empresa_codigo: emp?.codigo || '01',
                empresa_nombre: emp?.nombre || '',
                banco_codigo: bco?.codigo || '01',
                banco_nombre: bco?.descripcion || ''
            }]];
        }
        if (sqlLower.includes('from cuentas_bancarias c') && sqlLower.includes('where c.activa = 1')) {
            let rows = state.cuentas_bancarias.filter((c) => Boolean(c.activa));
            if (sqlLower.includes('c.empresa_id = ?')) {
                rows = rows.filter((c) => Number(c.empresa_id) === Number(params[0]));
            }
            return [rows.map((c) => {
                const emp = state.empresas.find((e) => Number(e.id) === Number(c.empresa_id));
                const bco = state.bancos.find((b) => Number(b.id) === Number(c.banco_id));
                return {
                    ...c,
                    raw_id: c.id,
                    empresa_codigo: emp?.codigo || '01',
                    empresa_nombre: emp?.nombre || '',
                    empresa: emp?.nombre || '',
                    banco_codigo: bco?.codigo || '01',
                    banco_nombre: bco?.descripcion || 'BANCO',
                    banco: bco?.descripcion || 'BANCO'
                };
            })];
        }
        if (sqlLower.includes('from cuentas_bancarias cb') && (sqlLower.includes('where cb.activa = true') || sqlLower.includes('where 1=1'))) {
            let rows = state.cuentas_bancarias.slice();
            if (sqlLower.includes('cb.activa = true')) {
                rows = rows.filter((c) => Boolean(c.activa));
            }
            let pIdx = 0;
            if (sqlLower.includes('(e.id = ? or e.codigo = ?)')) {
                const empRef = params[pIdx++];
                pIdx++;
                rows = rows.filter((c) => {
                    const emp = state.empresas.find((e) => Number(e.id) === Number(c.empresa_id));
                    return Number(c.empresa_id) === Number(empRef) || (emp && String(emp.codigo) === String(empRef));
                });
            }
            if (sqlLower.includes('(b.id = ? or b.codigo = ?)')) {
                const bcoRef = params[pIdx++];
                pIdx++;
                rows = rows.filter((c) => {
                    const bco = state.bancos.find((b) => Number(b.id) === Number(c.banco_id));
                    return Number(c.banco_id) === Number(bcoRef) || (bco && String(bco.codigo) === String(bcoRef));
                });
            }
            if (sqlLower.includes('and cb.id = ?')) {
                const cid = Number(params[pIdx++]);
                rows = rows.filter((c) => Number(c.id) === cid);
            }
            const mapped = rows.map((c) => {
                const emp = state.empresas.find((e) => Number(e.id) === Number(c.empresa_id));
                const bco = state.bancos.find((b) => Number(b.id) === Number(c.banco_id));
                const tip = state.tipos_cuenta_bancaria.find((t) => Number(t.id) === Number(c.tipo_cuenta_id));
                return {
                    ...c,
                    empresa_codigo: emp?.codigo || '01',
                    empresa_nombre: emp?.nombre || '',
                    banco_codigo: bco?.codigo || '01',
                    banco_nombre: bco?.descripcion || 'Banco',
                    tipo_cuenta_nombre: tip?.descripcion || ''
                };
            }).sort((a, b) => String(a.banco_nombre).localeCompare(String(b.banco_nombre)) || String(a.numero).localeCompare(String(b.numero)));
            return [mapped];
        }
        if (sqlLower.includes('from cuentas_bancarias c') && sqlLower.includes('where c.id = ? and c.activa = true')) {
            const cta = state.cuentas_bancarias.find((c) => Number(c.id) === Number(params[0]) && Boolean(c.activa));
            if (!cta) return [[]];
            const emp = state.empresas.find((e) => Number(e.id) === Number(cta.empresa_id));
            const bco = state.bancos.find((b) => Number(b.id) === Number(cta.banco_id));
            return [[{ ...cta, empresa_codigo: emp?.codigo || '01', banco_nombre: bco?.descripcion || '' }]];
        }
        if (sqlLower.includes('from cuentas_bancarias c') && sqlLower.includes('where c.numero = ? and c.activa = true')) {
            const cta = state.cuentas_bancarias.find((c) => c.numero === String(params[0]) && Boolean(c.activa));
            if (!cta) return [[]];
            const emp = state.empresas.find((e) => Number(e.id) === Number(cta.empresa_id));
            const bco = state.bancos.find((b) => Number(b.id) === Number(cta.banco_id));
            return [[{ ...cta, empresa_codigo: emp?.codigo || '01', banco_nombre: bco?.descripcion || '' }]];
        }
        if (sqlLower.includes('from cuentas_bancarias where empresa_id = ? and numero = ?')) {
            const [empId, num] = params;
            return [state.cuentas_bancarias.filter((c) => Number(c.empresa_id) === Number(empId) && c.numero === String(num) && (!sqlLower.includes('activa = true') || Boolean(c.activa)))];
        }
        if (sqlLower.includes('from cuentas_bancarias where id = ?')) {
            const cta = state.cuentas_bancarias.find((c) => Number(c.id) === Number(params[0]) && (!sqlLower.includes('activa = true') || Boolean(c.activa)));
            return [cta ? [cta] : []];
        }
        if (sqlLower.includes('from cuentas_bancarias where activa = 1') || sqlLower.includes('from cuentas_bancarias c left join')) {
            return [state.cuentas_bancarias.filter((c) => Boolean(c.activa)).map((c) => {
                const emp = state.empresas.find((e) => Number(e.id) === Number(c.empresa_id));
                const bco = state.bancos.find((b) => Number(b.id) === Number(c.banco_id));
                const tip = state.tipos_cuenta_bancaria.find((t) => Number(t.id) === Number(c.tipo_cuenta_id));
                return {
                    ...c,
                    empresa_codigo: emp?.codigo || '01',
                    empresa_nombre: emp?.nombre || '',
                    banco_codigo: bco?.codigo || '01',
                    banco_nombre: bco?.descripcion || '',
                    tipo_nombre: tip?.descripcion || ''
                };
            })];
        }
        if (sqlLower.startsWith('insert into cuentas_bancarias')) {
            const [empresa_id, numero, nombre, banco_id, tipo_cuenta_id, cod_cta, orden, saldo_inicial, fecha_saldo_inicial] = params;
            const dup = state.cuentas_bancarias.find((c) => Number(c.empresa_id) === Number(empresa_id) && c.numero === String(numero));
            if (dup) {
                const err = new Error('Duplicate account');
                err.code = 'ER_DUP_ENTRY';
                throw err;
            }
            const id = ++state.seq.cuentas_bancarias;
            state.cuentas_bancarias.push({
                id, empresa_id: Number(empresa_id), numero: String(numero), nombre: String(nombre),
                banco_id: Number(banco_id), tipo_cuenta_id: Number(tipo_cuenta_id),
                cod_cta: cod_cta || null, activa: 1, orden: Number(orden) || 0,
                saldo_inicial: Number(saldo_inicial || 0), fecha_saldo_inicial: ymd(fecha_saldo_inicial)
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update cuentas_bancarias set activa = false')) {
            const c = state.cuentas_bancarias.find((x) => Number(x.id) === Number(params[0]));
            if (c) c.activa = 0;
            return [{ affectedRows: c ? 1 : 0 }];
        }
        if (sqlLower.startsWith('update cuentas_bancarias set')) {
            const [empresa_id, numero, nombre, banco_id, tipo_cuenta_id, cod_cta, activa, orden, saldo_inicial, fecha_saldo_inicial, id] = params;
            const dup = state.cuentas_bancarias.find((c) => Number(c.id) !== Number(id) && Number(c.empresa_id) === Number(empresa_id) && c.numero === String(numero));
            if (dup) {
                const err = new Error('Duplicate account');
                err.code = 'ER_DUP_ENTRY';
                throw err;
            }
            const c = state.cuentas_bancarias.find((x) => Number(x.id) === Number(id));
            if (c) {
                Object.assign(c, {
                    empresa_id: Number(empresa_id), numero: String(numero), nombre: String(nombre),
                    banco_id: Number(banco_id), tipo_cuenta_id: Number(tipo_cuenta_id),
                    cod_cta, activa: Number(activa), orden: Number(orden),
                    saldo_inicial: Number(saldo_inicial || 0), fecha_saldo_inicial: ymd(fecha_saldo_inicial)
                });
            }
            return [{ affectedRows: c ? 1 : 0 }];
        }

        // Conciliacion Periodos, Reaperturas & Validaciones
        if (sqlLower.includes("from conciliacion_periodos where cuenta_bancaria_id = ? and estado = 'cerrado'")) {
            const cuentaId = Number(params[0]);
            const rows = state.conciliacion_periodos
                .filter((p) => Number(p.cuenta_bancaria_id) === cuentaId && p.estado === 'CERRADO')
                .sort((a, b) => String(b.fecha_corte).localeCompare(String(a.fecha_corte)));
            return [rows.slice(0, 1)];
        }
        if (sqlLower.includes('from conciliacion_periodos') && sqlLower.includes('where cuenta_bancaria_id = ? and fecha_corte = ?')) {
            const [cuentaId, fechaCorte] = params;
            return [state.conciliacion_periodos.filter((p) => Number(p.cuenta_bancaria_id) === Number(cuentaId) && ymd(p.fecha_corte) === ymd(fechaCorte))];
        }
        if (sqlLower.includes('from conciliacion_periodos p') && sqlLower.includes('where p.cuenta_bancaria_id = ?')) {
            const cuentaId = Number(params[0]);
            const rows = state.conciliacion_periodos
                .filter((p) => Number(p.cuenta_bancaria_id) === cuentaId)
                .sort((a, b) => String(b.fecha_corte).localeCompare(String(a.fecha_corte)));
            return [rows];
        }
        if (sqlLower.includes('from conciliacion_periodos') && sqlLower.includes('where cuenta_bancaria_id in (?)')) {
            const ids = new Set((Array.isArray(params[0]) ? params[0] : params).map(Number));
            const rows = state.conciliacion_periodos
                .filter((p) => ids.has(Number(p.cuenta_bancaria_id)))
                .sort((a, b) => String(b.fecha_corte).localeCompare(String(a.fecha_corte)) || Number(b.id) - Number(a.id));
            return [rows];
        }
        if (sqlLower.includes('from conciliacion_periodos') && sqlLower.includes('where cuenta_bancaria_id = ?')) {
            const cuentaId = Number(params[0]);
            return [state.conciliacion_periodos.filter((p) => Number(p.cuenta_bancaria_id) === cuentaId)];
        }
        if (sqlLower.includes('select p.*, cb.numero as cuenta_numero') && sqlLower.includes('from conciliacion_periodos p')) {
            const p = state.conciliacion_periodos.find((x) => Number(x.id) === Number(params[0]));
            if (!p) return [[]];
            const cta = state.cuentas_bancarias.find((c) => Number(c.id) === Number(p.cuenta_bancaria_id));
            const bco = state.bancos.find((b) => Number(b.id) === Number(cta?.banco_id));
            return [[{ ...p, cuenta_numero: cta?.numero, cuenta_nombre: cta?.nombre, banco_nombre: bco?.descripcion }]];
        }
        if (sqlLower.includes('from conciliacion_periodos where id = ?')) {
            return [state.conciliacion_periodos.filter((p) => Number(p.id) === Number(params[0]))];
        }
        if (sqlLower.startsWith('insert into conciliacion_periodos')) {
            const [cuentaId, fechaCorte, saldoBanco, saldoCheq, saldoLibros, abonosTrans, cargosTrans, dif, snap, notas, cerradoBy, cerradoNombre] = params;
            const existing = state.conciliacion_periodos.find((p) => Number(p.cuenta_bancaria_id) === Number(cuentaId) && ymd(p.fecha_corte) === ymd(fechaCorte));
            if (existing) {
                Object.assign(existing, {
                    estado: 'CERRADO', saldo_banco: saldoBanco, saldo_chequera: saldoCheq,
                    saldo_conciliado_libros: saldoLibros, abonos_en_transito: abonosTrans,
                    cargos_cheques_en_transito: cargosTrans, diferencia: dif, snapshot_json: snap,
                    notas, cerrado_by: cerradoBy, cerrado_por_nombre: cerradoNombre,
                    cerrado_at: new Date().toISOString()
                });
                return [{ insertId: existing.id, affectedRows: 1 }];
            }
            const id = ++state.seq.conciliacion_periodos;
            state.conciliacion_periodos.push({
                id, cuenta_bancaria_id: Number(cuentaId), fecha_corte: ymd(fechaCorte), estado: 'CERRADO',
                saldo_banco: saldoBanco, saldo_chequera: saldoCheq, saldo_conciliado_libros: saldoLibros,
                abonos_en_transito: abonosTrans, cargos_cheques_en_transito: cargosTrans, diferencia: dif,
                snapshot_json: snap, notas, cerrado_by: cerradoBy, cerrado_por_nombre: cerradoNombre,
                cerrado_at: new Date().toISOString(), reabierto_by: null, reabierto_por_nombre: null, reabierto_at: null
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith("update conciliacion_periodos set estado = 'reabierto'")) {
            const [reabiertoBy, reabiertoNombre, motivo, id] = params;
            const p = state.conciliacion_periodos.find((x) => Number(x.id) === Number(id));
            if (p) {
                Object.assign(p, {
                    estado: 'REABIERTO', reabierto_by: reabiertoBy, reabierto_por_nombre: reabiertoNombre,
                    motivo_reapertura: motivo, reabierto_at: new Date().toISOString()
                });
            }
            return [{ affectedRows: p ? 1 : 0 }];
        }

        if (sqlLower.includes("from conciliacion_reapertura_solicitudes where periodo_id = ? and estado = 'pendiente'")) {
            return [state.conciliacion_reapertura_solicitudes.filter((s) => Number(s.periodo_id) === Number(params[0]) && s.estado === 'PENDIENTE')];
        }
        if (sqlLower.startsWith('insert into conciliacion_reapertura_solicitudes')) {
            const [periodoId, cuentaId, fechaCorte, motivo, solBy, solNombre] = params;
            const id = ++state.seq.conciliacion_reapertura_solicitudes;
            state.conciliacion_reapertura_solicitudes.push({
                id, periodo_id: Number(periodoId), cuenta_bancaria_id: Number(cuentaId), fecha_corte: ymd(fechaCorte),
                estado: 'PENDIENTE', motivo_solicitud: motivo, solicitado_by: solBy,
                solicitado_por_nombre: solNombre, solicitado_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.includes('from conciliacion_reapertura_solicitudes where id = ?')) {
            return [state.conciliacion_reapertura_solicitudes.filter((s) => Number(s.id) === Number(params[0]))];
        }
        if (sqlLower.includes('from conciliacion_reapertura_solicitudes s')) {
            let rows = state.conciliacion_reapertura_solicitudes.slice();
            if (sqlLower.includes('s.cuenta_bancaria_id = ?')) {
                rows = rows.filter((s) => Number(s.cuenta_bancaria_id) === Number(params[0]));
            }
            if (sqlLower.includes("s.estado = 'pendiente'")) {
                rows = rows.filter((s) => s.estado === 'PENDIENTE');
            }
            return [rows];
        }
        if (sqlLower.startsWith('update conciliacion_reapertura_solicitudes set estado = ?')) {
            const [estado, resBy, resNombre, comentario, id] = params;
            const sol = state.conciliacion_reapertura_solicitudes.find((s) => Number(s.id) === Number(id));
            if (sol) {
                Object.assign(sol, {
                    estado, resuelto_by: resBy, resuelto_por_nombre: resNombre,
                    comentario_resolucion: comentario, resuelto_at: new Date().toISOString()
                });
            }
            return [{ affectedRows: sol ? 1 : 0 }];
        }
        if (sqlLower.startsWith("update conciliacion_reapertura_solicitudes set estado = 'aprobada'")) {
            const [resBy, resNombre, periodoId] = params;
            state.conciliacion_reapertura_solicitudes.forEach((s) => {
                if (Number(s.periodo_id) === Number(periodoId) && s.estado === 'PENDIENTE') {
                    Object.assign(s, { estado: 'APROBADA', resuelto_by: resBy, resuelto_por_nombre: resNombre, resuelto_at: new Date().toISOString() });
                }
            });
            return [{ affectedRows: 1 }];
        }

        if (sqlLower.startsWith('insert into validaciones_saldo_banco')) {
            const id = ++state.seq.validaciones_saldo_banco;
            const [cuentaId, fechaCorte, montoBanco, saldoCheq, saldoLibros, abonosTrans, cargosTrans, dif, notas, snap, createdBy] = params;
            state.validaciones_saldo_banco.push({
                id, cuenta_bancaria_id: Number(cuentaId), fecha_validacion: new Date().toISOString(),
                fecha_corte: ymd(fechaCorte), monto_banco: montoBanco, saldo_chequera: saldoCheq,
                saldo_conciliado_libros: saldoLibros, abonos_en_transito: abonosTrans,
                cargos_cheques_en_transito: cargosTrans, diferencia: dif, notas, snapshot_json: snap, created_by: createdBy
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.includes('from validaciones_saldo_banco where id = ?')) {
            return [state.validaciones_saldo_banco.filter((v) => Number(v.id) === Number(params[0]))];
        }
        if (sqlLower.includes('from validaciones_saldo_banco')) {
            if (sqlLower.includes('where cuenta_bancaria_id in (?)')) {
                const ids = new Set((Array.isArray(params[0]) ? params[0] : params).map(Number));
                const rows = state.validaciones_saldo_banco
                    .filter((v) => ids.has(Number(v.cuenta_bancaria_id)))
                    .sort((a, b) => String(b.fecha_validacion || '').localeCompare(String(a.fecha_validacion || '')) || Number(b.id) - Number(a.id));
                return [rows];
            }
            if (sqlLower.includes('where cuenta_bancaria_id = ?')) {
                const rows = state.validaciones_saldo_banco
                    .filter((v) => Number(v.cuenta_bancaria_id) === Number(params[0]))
                    .sort((a, b) => Number(b.id) - Number(a.id));
                return [rows];
            }
            return [state.validaciones_saldo_banco];
        }

        // Aggregation queries for computeAccountReconciliationSummary & Kardex
        if (sqlLower.includes('total_abonos_libros') && sqlLower.includes('from movimientos_bancarios')) {
            const [dbHastaA, dbHastaB, cuentaId, dbHastaC, floorDate] = params;
            const movs = state.movimientos_bancarios.filter((m) =>
                Number(m.cuenta_bancaria_id) === Number(cuentaId) &&
                !m.deleted_at &&
                ymd(m.fecha) <= ymd(dbHastaC) &&
                (!floorDate || ymd(m.fecha) >= ymd(floorDate))
            );
            return [[{
                total_abonos_libros: movs.reduce((s, m) => s + Number(m.abono || 0), 0),
                total_cargos_libros: movs.reduce((s, m) => s + Number(m.cargo || 0), 0),
                abonos_en_transito: movs.filter((m) => !m.fecha_aplicado || ymd(m.fecha_aplicado) > ymd(dbHastaA)).reduce((s, m) => s + Number(m.abono || 0), 0),
                cargos_en_transito: movs.filter((m) => !m.fecha_aplicado || ymd(m.fecha_aplicado) > ymd(dbHastaB)).reduce((s, m) => s + Number(m.cargo || 0), 0)
            }]];
        }
        if (sqlLower.includes('coalesce(sum(abono), 0) as sum_abono') && sqlLower.includes('from movimientos_bancarios')) {
            const cuentaId = Number(params[0]);
            const boundDate = ymd(params[1]);
            const floorDate = params.length >= 3 ? ymd(params[2]) : null;
            const strictLt = sqlLower.includes('fecha < ?');
            const movs = state.movimientos_bancarios.filter((m) => {
                if (Number(m.cuenta_bancaria_id) !== cuentaId || m.deleted_at) return false;
                const fd = ymd(m.fecha);
                if (floorDate && fd < floorDate) return false;
                return strictLt ? fd < boundDate : fd <= boundDate;
            });
            return [[{
                sum_abono: movs.reduce((s, m) => s + Number(m.abono || 0), 0),
                sum_cargo: movs.reduce((s, m) => s + Number(m.cargo || 0), 0)
            }]];
        }
        if (sqlLower.includes('total_cheques_libros') && sqlLower.includes('from cheques')) {
            const [dbHastaA, cuentaId, dbHastaB, floorDate] = params;
            const chks = state.cheques.filter((c) =>
                Number(c.cuenta_bancaria_id) === Number(cuentaId) &&
                !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado &&
                ymd(c.fecha) <= ymd(dbHastaB) &&
                (!floorDate || ymd(c.fecha) >= ymd(floorDate))
            );
            return [[{
                total_cheques_libros: chks.reduce((s, c) => s + Number(c.valor || 0), 0),
                cheques_en_transito: chks.filter((c) => !c.fecha_aplicado || ymd(c.fecha_aplicado) > ymd(dbHastaA)).reduce((s, c) => s + Number(c.valor || 0), 0)
            }]];
        }
        if (sqlLower.includes('coalesce(sum(valor), 0) as sum_valor') && sqlLower.includes('from cheques')) {
            const cuentaId = Number(params[0]);
            const boundDate = ymd(params[1]);
            const floorDate = params.length >= 3 ? ymd(params[2]) : null;
            const strictLt = sqlLower.includes('fecha < ?');
            const chks = state.cheques.filter((c) => {
                if (Number(c.cuenta_bancaria_id) !== cuentaId || c.deleted_at || c.cheque_anulado || c.fue_noemitido || c.es_reservado) return false;
                const fd = ymd(c.fecha);
                if (floorDate && fd < floorDate) return false;
                return strictLt ? fd < boundDate : fd <= boundDate;
            });
            return [[{ sum_valor: chks.reduce((s, c) => s + Number(c.valor || 0), 0) }]];
        }
        if (sqlLower.includes('cheques_reservados_count') && sqlLower.includes('from cheques')) {
            const [cuentaId, dbHasta, floorDate] = params;
            const res = state.cheques.filter((c) =>
                Number(c.cuenta_bancaria_id) === Number(cuentaId) &&
                !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && c.es_reservado &&
                ymd(c.fecha) <= ymd(dbHasta) &&
                (!floorDate || ymd(c.fecha) >= ymd(floorDate))
            );
            return [[{
                cheques_reservados_count: res.length,
                cheques_reservados_monto: res.reduce((s, c) => s + Number(c.valor || 0), 0)
            }]];
        }

        // Movimientos Bancarios & Comprobantes (mutations BEFORE selects)
        if (sqlLower.startsWith('insert into movimientos_bancarios_comprobantes')) {
            const id = ++state.seq.movimientos_bancarios_comprobantes;
            const [movimiento_id, nombre_original, archivo_url, mime_type, tamano_bytes, ancho, alto, nota, ocr_json, uploaded_by, uploaded_by_name] = params;
            const row = {
                id, movimiento_id: Number(movimiento_id), nombre_original, archivo_url,
                mime_type: mime_type || 'image/webp', tamano_bytes: Number(tamano_bytes || 0),
                ancho, alto, nota, ocr_json, uploaded_by, uploaded_by_name,
                created_at: new Date().toISOString()
            };
            state.movimientos_bancarios_comprobantes.push(row);
            const mov = state.movimientos_bancarios.find((m) => Number(m.id) === Number(movimiento_id));
            if (mov && !mov.comprobante_url) mov.comprobante_url = archivo_url;
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update movimientos_bancarios_comprobantes set')) {
            const { affectedRows } = applySqlSet(state.movimientos_bancarios_comprobantes, sql, params, {
                numCols: ['movimiento_id', 'tamano_bytes', 'ancho', 'alto']
            });
            return [{ affectedRows }];
        }
        if (sqlLower.startsWith('delete from movimientos_bancarios_comprobantes')) {
            const id = Number(params[0]);
            const before = state.movimientos_bancarios_comprobantes.length;
            state.movimientos_bancarios_comprobantes = state.movimientos_bancarios_comprobantes.filter((c) => Number(c.id) !== id);
            return [{ affectedRows: before - state.movimientos_bancarios_comprobantes.length }];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios_comprobantes') && sqlLower.includes('join movimientos_bancarios m')) {
            const compId = Number(params[0]);
            const comp = state.movimientos_bancarios_comprobantes.find((c) => Number(c.id) === compId);
            if (!comp) return [[]];
            const mov = state.movimientos_bancarios.find((m) => Number(m.id) === Number(comp.movimiento_id));
            if (!mov && sqlLower.includes('inner join')) return [[]];
            return [[{
                ...comp,
                cuenta_bancaria_id: mov ? mov.cuenta_bancaria_id : null,
                fecha: mov ? mov.fecha : null,
                fecha_aplicado: mov ? mov.fecha_aplicado : null,
                deleted_at: mov ? mov.deleted_at : null,
                mov_deleted_at: mov ? mov.deleted_at : null
            }]];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios_comprobantes') && !sqlLower.includes('from movimientos_bancarios m')) {
            if (sqlLower.includes('where archivo_url = ?')) {
                const cnt = state.movimientos_bancarios_comprobantes.filter((c) => c.archivo_url === params[0]).length;
                return [[{ cnt }]];
            }
            if (sqlLower.includes('where movimiento_id = ?')) {
                return [state.movimientos_bancarios_comprobantes.filter((c) => Number(c.movimiento_id) === Number(params[0]))];
            }
            if (sqlLower.includes('where movimiento_id in')) {
                const ids = new Set(params.map(Number));
                return [state.movimientos_bancarios_comprobantes.filter((c) => ids.has(Number(c.movimiento_id)))];
            }
            if (sqlLower.includes('where id = ?')) {
                return [state.movimientos_bancarios_comprobantes.filter((c) => Number(c.id) === Number(params[0]))];
            }
            return [state.movimientos_bancarios_comprobantes];
        }

        if (sqlLower.startsWith('insert into movimientos_bancarios')) {
            if (state.failOnSecondImportInsert) {
                state.importInsertCounter++;
                if (state.importInsertCounter >= 2) {
                    throw new Error('Simulated DB error mid-batch');
                }
            }
            const id = ++state.seq.movimientos_bancarios;
            const isImport = sqlLower.includes('import_batch_id');
            const isTransfer = sqlLower.includes('transfer_group_id');
            const isConcControlPago = sqlLower.includes('es_contabilizado');
            const [empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto, monto] = params;
            let cargo = 0;
            let abono = 0;
            let tipo_remesa_id = null;
            let cod_cta = null;
            let num_partida = null;
            let transfer_group_id = null;
            let fingerprint = null;
            let import_batch_id = null;

            if (isTransfer && sqlLower.includes('values (?, ?, ?, ?, ?, ?, ?, ?, 0,')) {
                cargo = Number(params[7] || 0);
                abono = 0;
                tipo_remesa_id = params[8] || null;
                cod_cta = params[9] || null;
                num_partida = params[10] || null;
                transfer_group_id = params[14] || null;
                fingerprint = params[15] || null;
            } else if (isTransfer && sqlLower.includes('values (?, ?, ?, ?, ?, ?, ?, 0, ?,')) {
                cargo = 0;
                abono = Number(params[7] || 0);
                tipo_remesa_id = params[8] || null;
                cod_cta = params[9] || null;
                num_partida = params[10] || null;
                transfer_group_id = params[14] || null;
                fingerprint = params[15] || null;
            } else if (isImport) {
                cargo = Number(params[7] || 0);
                abono = Number(params[8] || 0);
                tipo_remesa_id = params[9] || null;
                if (sqlLower.includes('null, null')) {
                    import_batch_id = params[13] || null;
                    fingerprint = params[14] || null;
                } else {
                    cod_cta = params[10] || null;
                    num_partida = params[11] || null;
                    import_batch_id = params[15] || null;
                    fingerprint = params[16] || null;
                }
            } else if (isConcControlPago) {
                cargo = Number(params[7] || 0);
                abono = Number(params[8] || 0);
                tipo_remesa_id = params[9] || null;
                cod_cta = params[10] || null;
                fingerprint = params[13] || null;
            } else {
                cargo = Number(params[7] || 0);
                abono = Number(params[8] || 0);
                tipo_remesa_id = params[9] || null;
                cod_cta = params[10] || null;
                num_partida = params[11] || null;
                fingerprint = params[15] || null;
            }

            state.movimientos_bancarios.push({
                id, empresa_id: Number(empresa_id), cuenta_bancaria_id: Number(cuenta_bancaria_id),
                fecha: ymd(fecha), fecha_aplicado: ymd(fecha_aplicado),
                documento, concepto, monto: Number(monto), cargo, abono,
                tipo_remesa_id, cod_cta, num_partida, es_contabilizado: 0,
                deleted_at: null, version: 1, transfer_group_id, import_batch_id,
                comprobante_url: null, fingerprint
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update movimientos_bancarios set')) {
            const { affectedRows } = applySqlSet(state.movimientos_bancarios, sql, params, {
                dateCols: ['fecha', 'fecha_aplicado'],
                numCols: ['empresa_id', 'cuenta_bancaria_id', 'monto', 'cargo', 'abono', 'tipo_remesa_id', 'version']
            });
            return [{ affectedRows }];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios') && sqlLower.includes('where id in')) {
            const ids = params.flat().map(Number);
            return [state.movimientos_bancarios.filter((m) => ids.includes(Number(m.id)))];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios where comprobante_url = ?')) {
            const cnt = state.movimientos_bancarios.filter((m) => !m.deleted_at && m.comprobante_url === params[0]).length;
            return [[{ cnt }]];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios where id = ?')) {
            return [state.movimientos_bancarios.filter((m) => Number(m.id) === Number(params[0]))];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios') && sqlLower.includes('where cuenta_bancaria_id = ? and deleted_at is null and fecha_aplicado is null') && !sqlLower.includes('left join')) {
            const cuentaId = Number(params[0]);
            return [state.movimientos_bancarios.filter((m) => Number(m.cuenta_bancaria_id) === cuentaId && !m.deleted_at && !m.fecha_aplicado).map((m) => ({ ...m, origen_tipo: 'MOV' }))];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios') && sqlLower.includes('where cuenta_bancaria_id = ? and deleted_at is null and fecha_aplicado is not null') && !sqlLower.includes('left join')) {
            const cuentaId = Number(params[0]);
            return [state.movimientos_bancarios.filter((m) => Number(m.cuenta_bancaria_id) === cuentaId && !m.deleted_at && Boolean(m.fecha_aplicado)).map((m) => ({ ...m, origen_tipo: 'MOV' }))];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios') && sqlLower.includes('fingerprint in')) {
            const cuentaId = Number(params[0]);
            const fps = params.slice(1);
            return [state.movimientos_bancarios.filter((m) => Number(m.cuenta_bancaria_id) === cuentaId && !m.deleted_at && fps.includes(m.fingerprint))];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios') && sqlLower.includes('fingerprint = ?')) {
            const [cuentaId, fp] = params;
            return [state.movimientos_bancarios.filter((m) => Number(m.cuenta_bancaria_id) === Number(cuentaId) && !m.deleted_at && m.fingerprint === fp)];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios m') && sqlLower.includes('left join tipos_remesas tr')) {
            let rows = state.movimientos_bancarios.filter((m) => !m.deleted_at);
            if ((sqlLower.includes('where m.cuenta_bancaria_id = ?') || sqlLower.includes('and m.cuenta_bancaria_id = ?')) && !sqlLower.includes('limit ? offset ?') && !sqlLower.includes('e.codigo = ?')) {
                const cuentaId = Number(params[0]);
                rows = rows.filter((m) => Number(m.cuenta_bancaria_id) === cuentaId);
                if (sqlLower.includes('m.fecha_aplicado between ? and ?')) {
                    const [, desde, hasta] = params;
                    rows = rows.filter((m) => m.fecha_aplicado && ymd(m.fecha_aplicado) >= ymd(desde) && ymd(m.fecha_aplicado) <= ymd(hasta));
                } else if (sqlLower.includes('(m.fecha_aplicado is null or m.fecha_aplicado > ?)')) {
                    const [, hastaA, hastaB] = params;
                    rows = rows.filter((m) => (!m.fecha_aplicado || ymd(m.fecha_aplicado) > ymd(hastaA)) && ymd(m.fecha) <= ymd(hastaB));
                } else if (sqlLower.includes('m.fecha between ? and ?')) {
                    const [, desde, hasta] = params;
                    rows = rows.filter((m) => ymd(m.fecha) >= ymd(desde) && ymd(m.fecha) <= ymd(hasta));
                }
            } else {
                let pIdx = 0;
                if (sqlLower.includes('e.codigo = ?')) {
                    const codEmp = params[pIdx++];
                    const emp = state.empresas.find((e) => String(e.codigo) === String(codEmp));
                    rows = emp ? rows.filter((m) => Number(m.empresa_id) === Number(emp.id)) : [];
                }
                if (sqlLower.includes('m.cuenta_bancaria_id = ?')) {
                    const cid = Number(params[pIdx++]);
                    rows = rows.filter((m) => Number(m.cuenta_bancaria_id) === cid);
                } else if (sqlLower.includes('cb.numero = ?')) {
                    const num = String(params[pIdx++]);
                    rows = rows.filter((m) => {
                        const cta = state.cuentas_bancarias.find((c) => Number(c.id) === Number(m.cuenta_bancaria_id));
                        return cta && cta.numero === num;
                    });
                }
                if (sqlLower.includes('m.fecha between ? and ?')) {
                    const desde = params[pIdx++];
                    const hasta = params[pIdx++];
                    rows = rows.filter((m) => ymd(m.fecha) >= ymd(desde) && ymd(m.fecha) <= ymd(hasta));
                }
                if (sqlLower.includes('select count(*) as total')) {
                    return [[{ total: rows.length }]];
                }
            }

            if (sqlLower.includes('order by m.fecha desc, m.id desc')) {
                rows = rows.slice().sort((a, b) => String(ymd(b.fecha)).localeCompare(String(ymd(a.fecha))) || Number(b.id) - Number(a.id));
            } else if (sqlLower.includes('order by m.fecha asc, m.id asc')) {
                rows = rows.slice().sort((a, b) => String(ymd(a.fecha)).localeCompare(String(ymd(b.fecha))) || Number(a.id) - Number(b.id));
            }
            if (sqlLower.includes('limit ? offset ?')) {
                const offset = Number(params[params.length - 1]) || 0;
                const limit = Number(params[params.length - 2]) || rows.length;
                rows = rows.slice(offset, offset + limit);
            }

            const mapped = rows.map((m) => {
                const cta = state.cuentas_bancarias.find((c) => Number(c.id) === Number(m.cuenta_bancaria_id));
                const emp = state.empresas.find((e) => Number(e.id) === Number(m.empresa_id));
                const bco = state.bancos.find((b) => Number(b.id) === Number(cta?.banco_id));
                const tr = state.tipos_remesas.find((r) => Number(r.id) === Number(m.tipo_remesa_id));
                const comps = state.movimientos_bancarios_comprobantes.filter((c) => Number(c.movimiento_id) === Number(m.id));
                return {
                    ...m,
                    origen_tipo: 'MOV',
                    id_empresa: emp?.codigo || '01',
                    empresa_nombre: emp?.nombre || '',
                    numero_cuenta: cta?.numero || '',
                    cuenta_numero: cta?.numero || '',
                    cuenta_nombre: cta?.nombre || '',
                    banco_id: cta?.banco_id || null,
                    banco_nombre: bco?.descripcion || 'BANCO PROMERICA',
                    tipo_doc: tr?.codigo || (Number(m.abono) > 0 ? 'RM' : 'NC'),
                    cod_remesa: tr?.codigo || null,
                    remesa_descripcion: tr?.descripcion || null,
                    comprobante_url: m.comprobante_url || comps[0]?.archivo_url || null,
                    comprobantes_count: comps.length
                };
            });
            if (sqlLower.includes('select count(*) as total')) {
                return [[{ total: mapped.length }]];
            }
            return [mapped];
        }

        // Cheques & Chequeras (mutations BEFORE selects)
        if (sqlLower.startsWith('insert into chequeras')) {
            const id = ++state.seq.chequeras;
            const [cuenta_bancaria_id, serie, desde, hasta, siguiente_correlativo, alerta_stock_bajo, activo, notas, created_by] = params;
            state.chequeras.push({
                id, cuenta_bancaria_id: Number(cuenta_bancaria_id), serie: serie || '',
                desde: Number(desde), hasta: Number(hasta),
                siguiente_correlativo: Number(siguiente_correlativo || desde),
                alerta_stock_bajo: Number(alerta_stock_bajo ?? 10),
                activo: activo !== undefined ? Number(activo) : 1,
                notas: notas || null, created_by: created_by || null,
                created_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update chequeras set')) {
            const { affectedRows } = applySqlSet(state.chequeras, sql, params, {
                numCols: ['cuenta_bancaria_id', 'desde', 'hasta', 'siguiente_correlativo', 'alerta_stock_bajo', 'activo']
            });
            return [{ affectedRows }];
        }
        if (sqlLower.startsWith('delete from chequeras')) {
            const id = Number(params[0]);
            const before = state.chequeras.length;
            state.chequeras = state.chequeras.filter((t) => Number(t.id) !== id);
            return [{ affectedRows: before - state.chequeras.length }];
        }
        if (isSelect && sqlLower.includes('from chequeras')) {
            if (sqlLower.includes('where id = ? and cuenta_bancaria_id = ?')) {
                const [cid, ctaId] = params;
                return [state.chequeras.filter((t) => Number(t.id) === Number(cid) && Number(t.cuenta_bancaria_id) === Number(ctaId) && Number(t.activo) === 1)];
            }
            if (sqlLower.includes('between desde and hasta')) {
                const [ctaId, numInt] = params;
                return [state.chequeras.filter((t) => Number(t.cuenta_bancaria_id) === Number(ctaId) && Number(t.activo) === 1 && Number(numInt) >= Number(t.desde) && Number(numInt) <= Number(t.hasta))];
            }
            if (sqlLower.includes('where cuenta_bancaria_id = ? and activo = 1')) {
                const ctaId = Number(params[0]);
                const rows = state.chequeras.filter((t) => Number(t.cuenta_bancaria_id) === ctaId && Number(t.activo) === 1);
                return [rows];
            }
            if (sqlLower.includes('where id = ?')) {
                return [state.chequeras.filter((t) => Number(t.id) === Number(params[0]))];
            }
            if (sqlLower.includes('cuenta_bancaria_id = ?')) {
                return [state.chequeras.filter((t) => Number(t.cuenta_bancaria_id) === Number(params[0]))];
            }
            return [state.chequeras.map((t) => {
                const cta = state.cuentas_bancarias.find((c) => Number(c.id) === Number(t.cuenta_bancaria_id));
                const bco = state.bancos.find((b) => Number(b.id) === Number(cta?.banco_id));
                return { ...t, cuenta_numero: cta?.numero || '', cuenta_nombre: cta?.nombre || '', banco_nombre: bco?.descripcion || '' };
            })];
        }

        if (sqlLower.startsWith('insert into cheques')) {
            const id = ++state.seq.cheques;
            const isContado = sqlLower.includes('es_pago_contado, es_contabilizado, created_by');
            if (isContado) {
                const [empresa_id, cuenta_bancaria_id, llave, fecha, cheque, valor, a_nombre, concepto, created_by] = params;
                state.cheques.push({
                    id, empresa_id: Number(empresa_id), cuenta_bancaria_id: Number(cuenta_bancaria_id),
                    llave, fecha: ymd(fecha), cheque_anulado: 0, cheque: String(cheque), valor: Number(valor),
                    a_nombre, fecha_aplicado: null, concepto, es_reservado: 0, es_pago_contado: 1,
                    fue_noemitido: 0, num_partida: null, es_contabilizado: 0, deleted_at: null,
                    valor_original: null, beneficiario_original: null, concepto_original: null,
                    anulado_by: null, anulado_at: null, chequera_id: null,
                    impreso_at: null, impreso_por: null, veces_impreso: 0, created_by, version: 1
                });
            } else {
                const [
                    empresa_id, cuenta_bancaria_id, llave, fecha, cheque_anulado, cheque, valor, a_nombre,
                    fecha_aplicado, concepto, es_reservado, es_pago_contado, fue_noemitido, num_partida
                ] = params;
                state.cheques.push({
                    id, empresa_id: Number(empresa_id), cuenta_bancaria_id: Number(cuenta_bancaria_id),
                    llave: llave || null, fecha: ymd(fecha), cheque_anulado: Number(Boolean(cheque_anulado)),
                    cheque: String(cheque), valor: Number(valor), a_nombre,
                    fecha_aplicado: ymd(fecha_aplicado), concepto,
                    es_reservado: Number(Boolean(es_reservado)),
                    es_pago_contado: Number(Boolean(es_pago_contado)),
                    fue_noemitido: Number(Boolean(fue_noemitido)),
                    num_partida: num_partida || null, es_contabilizado: 0, deleted_at: null,
                    valor_original: null, beneficiario_original: null, concepto_original: null,
                    anulado_by: null, anulado_at: null, chequera_id: null,
                    impreso_at: null, impreso_por: null, veces_impreso: 0, version: 1
                });
            }
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update cheques set impreso_at = now()')) {
            const [userId, id] = params;
            const c = state.cheques.find((x) => Number(x.id) === Number(id));
            if (c) {
                c.impreso_at = new Date().toISOString();
                c.impreso_por = userId || null;
                c.veces_impreso = Number(c.veces_impreso || 0) + 1;
            }
            return [{ affectedRows: c ? 1 : 0 }];
        }
        if (sqlLower.startsWith('update cheques set')) {
            const { affectedRows } = applySqlSet(state.cheques, sql, params, {
                dateCols: ['fecha', 'fecha_aplicado', 'anulado_at'],
                numCols: ['empresa_id', 'cuenta_bancaria_id', 'valor', 'chequera_id', 'version'],
                boolCols: ['cheque_anulado', 'es_reservado', 'es_pago_contado', 'fue_noemitido']
            });
            return [{ affectedRows }];
        }
        if (isSelect && sqlLower.includes('from cheques') && sqlLower.includes('where id in')) {
            const ids = params.flat().map(Number);
            return [state.cheques.filter((c) => ids.includes(Number(c.id)) && (!sqlLower.includes('deleted_at is null') || !c.deleted_at))];
        }
        if (isSelect && sqlLower.includes('from cheques where id = ?')) {
            return [state.cheques.filter((c) => Number(c.id) === Number(params[0]))];
        }
        if (isSelect && sqlLower.includes('from cheques where cuenta_bancaria_id = ? and cheque = ?')) {
            const [cuentaId, chequeNum, excludeId] = params;
            const dups = state.cheques.filter((c) =>
                Number(c.cuenta_bancaria_id) === Number(cuentaId) &&
                String(c.cheque) === String(chequeNum) &&
                !c.deleted_at &&
                !c.cheque_anulado &&
                (params.length < 3 || Number(c.id) !== Number(excludeId))
            );
            return [dups];
        }
        if (isSelect && sqlLower.includes('from cheques') && sqlLower.includes('regexp') && sqlLower.includes('limit 1')) {
            const ctaId = Number(params[0]);
            const nums = state.cheques
                .filter((c) => Number(c.cuenta_bancaria_id) === ctaId && !c.deleted_at && /^\d+$/.test(String(c.cheque || '').trim()))
                .sort((a, b) => parseInt(b.cheque, 10) - parseInt(a.cheque, 10) || b.id - a.id);
            return [nums.slice(0, 1)];
        }
        if (isSelect && sqlLower.includes('from cheques') && sqlLower.includes('where cuenta_bancaria_id = ?') && sqlLower.includes('order by id desc limit 1')) {
            const ctaId = Number(params[0]);
            const rows = state.cheques
                .filter((c) => Number(c.cuenta_bancaria_id) === ctaId && !c.deleted_at && String(c.cheque || '').trim())
                .sort((a, b) => b.id - a.id);
            return [rows.slice(0, 1)];
        }
        if (isSelect && sqlLower.includes('from cheques') && sqlLower.includes('where cuenta_bancaria_id = ? and deleted_at is null and fecha_aplicado is null') && !sqlLower.includes('ch.')) {
            const cuentaId = Number(params[0]);
            return [state.cheques.filter((c) => Number(c.cuenta_bancaria_id) === cuentaId && !c.deleted_at && !c.fecha_aplicado && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado).map((c) => ({
                ...c, origen_tipo: 'CK', documento: c.cheque, monto: c.valor, cargo: c.valor, abono: 0, beneficiario: c.a_nombre
            }))];
        }
        if (isSelect && sqlLower.includes('from cheques') && sqlLower.includes('where cuenta_bancaria_id = ? and deleted_at is null and fecha_aplicado is not null') && !sqlLower.includes('ch.')) {
            const cuentaId = Number(params[0]);
            return [state.cheques.filter((c) => Number(c.cuenta_bancaria_id) === cuentaId && !c.deleted_at && Boolean(c.fecha_aplicado) && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado).map((c) => ({
                ...c, origen_tipo: 'CK', documento: c.cheque, monto: c.valor, cargo: c.valor, abono: 0, beneficiario: c.a_nombre
            }))];
        }
        if (isSelect && sqlLower.includes('from cheques ch') && sqlLower.includes('where ch.empresa_id = ? and ch.deleted_at is null and ch.cheque_anulado = false')) {
            return [state.cheques.filter((c) => Number(c.empresa_id) === Number(params[0]) && !c.deleted_at && !c.cheque_anulado)];
        }
        if (isSelect && sqlLower.includes('from cheques ch')) {
            let rows = state.cheques.filter((c) => !c.deleted_at);
            if (sqlLower.includes('ch.cuenta_bancaria_id in (?)')) {
                const ids = new Set((Array.isArray(params[0]) ? params[0] : [params[0]]).map(Number));
                const hastaA = ymd(params[1]);
                const hastaB = ymd(params[2]);
                rows = rows.filter((c) =>
                    ids.has(Number(c.cuenta_bancaria_id)) &&
                    !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado &&
                    ymd(c.fecha) <= hastaA &&
                    (!c.fecha_aplicado || ymd(c.fecha_aplicado) > hastaB)
                ).sort((a, b) => String(ymd(a.fecha)).localeCompare(String(ymd(b.fecha))) || Number(a.id) - Number(b.id));
                return [rows];
            }
            if (sqlLower.includes('as origen_tipo')) {
                const cuentaId = Number(params[0]);
                rows = rows.filter((c) => Number(c.cuenta_bancaria_id) === cuentaId && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado);
                if (sqlLower.includes('ch.fecha_aplicado between ? and ?')) {
                    const [, desde, hasta] = params;
                    rows = rows.filter((c) => c.fecha_aplicado && ymd(c.fecha_aplicado) >= ymd(desde) && ymd(c.fecha_aplicado) <= ymd(hasta));
                } else if (sqlLower.includes('(ch.fecha_aplicado is null or ch.fecha_aplicado > ?)')) {
                    const [, hastaA, hastaB] = params;
                    rows = rows.filter((c) => (!c.fecha_aplicado || ymd(c.fecha_aplicado) > ymd(hastaA)) && ymd(c.fecha) <= ymd(hastaB));
                }
                return [rows.map((c) => ({
                    ...c, origen_tipo: 'CK', tipo_doc: 'CH', documento: c.cheque,
                    monto: c.valor, cargo: c.valor, abono: 0, beneficiario: c.a_nombre
                }))];
            }
            if (sqlLower.includes('cast(ch.cheque as unsigned) between ? and ?')) {
                const [ctaId, dCheq, hCheq] = params;
                rows = rows.filter((c) => Number(c.cuenta_bancaria_id) === Number(ctaId) && Number(c.cheque) >= Number(dCheq) && Number(c.cheque) <= Number(hCheq));
            } else if (sqlLower.includes('ch.cuenta_bancaria_id = ?') && sqlLower.includes('ch.fecha between ? and ?') && !sqlLower.includes('limit ? offset ?') && !sqlLower.includes('e.codigo = ?')) {
                const [ctaId, desde, hasta] = params;
                rows = rows.filter((c) => Number(c.cuenta_bancaria_id) === Number(ctaId) && ymd(c.fecha) >= ymd(desde) && ymd(c.fecha) <= ymd(hasta));
                if (sqlLower.includes('ch.cheque_anulado = false')) rows = rows.filter((c) => !c.cheque_anulado);
                if (sqlLower.includes('ch.es_reservado = false')) rows = rows.filter((c) => !c.es_reservado);
            } else {
                let pIdx = 0;
                if (sqlLower.includes('e.codigo = ?')) {
                    const codEmp = params[pIdx++];
                    const emp = state.empresas.find((e) => String(e.codigo) === String(codEmp));
                    rows = emp ? rows.filter((c) => Number(c.empresa_id) === Number(emp.id)) : [];
                }
                if (sqlLower.includes('ch.cuenta_bancaria_id = ?')) {
                    const cid = Number(params[pIdx++]);
                    rows = rows.filter((c) => Number(c.cuenta_bancaria_id) === cid);
                } else if (sqlLower.includes('cb.numero = ?')) {
                    const num = String(params[pIdx++]);
                    rows = rows.filter((c) => {
                        const cta = state.cuentas_bancarias.find((x) => Number(x.id) === Number(c.cuenta_bancaria_id));
                        return cta && cta.numero === num;
                    });
                }
                if (sqlLower.includes('ch.fecha between ? and ?')) {
                    const desde = params[pIdx++];
                    const hasta = params[pIdx++];
                    rows = rows.filter((c) => ymd(c.fecha) >= ymd(desde) && ymd(c.fecha) <= ymd(hasta));
                }
                if (sqlLower.includes('select count(*) as total')) {
                    return [[{ total: rows.length }]];
                }
            }

            if (sqlLower.includes('order by ch.fecha desc, ch.id desc')) {
                rows = rows.slice().sort((a, b) => String(ymd(b.fecha)).localeCompare(String(ymd(a.fecha))) || Number(b.id) - Number(a.id));
            } else if (sqlLower.includes('order by ch.fecha asc')) {
                rows = rows.slice().sort((a, b) => String(ymd(a.fecha)).localeCompare(String(ymd(b.fecha))) || Number(a.id) - Number(b.id));
            }
            if (sqlLower.includes('limit ? offset ?')) {
                const offset = Number(params[params.length - 1]) || 0;
                const limit = Number(params[params.length - 2]) || rows.length;
                rows = rows.slice(offset, offset + limit);
            }

            return [rows.map((c) => {
                const emp = state.empresas.find((e) => Number(e.id) === Number(c.empresa_id));
                const cta = state.cuentas_bancarias.find((x) => Number(x.id) === Number(c.cuenta_bancaria_id));
                const bco = state.bancos.find((b) => Number(b.id) === Number(cta?.banco_id));
                const impUser = c.impreso_por ? state.users.find((u) => Number(u.id) === Number(c.impreso_por)) : null;
                return {
                    ...c,
                    id_empresa: emp?.codigo || '01',
                    empresa_nombre: emp?.nombre || '',
                    numero_cuenta: cta?.numero || '',
                    cuenta_nombre: cta?.nombre || '',
                    banco_id: cta?.banco_id || null,
                    banco_nombre: bco?.descripcion || '',
                    es_contabilizado: c.es_contabilizado ? 'S' : 'N',
                    impreso_por_nombre: impUser?.nombre || impUser?.username || null
                };
            })];
        }

        // Conciliacion importaciones, reglas & cruces (mutations BEFORE selects)
        if (sqlLower.startsWith('insert into conciliacion_importaciones')) {
            const id = ++state.seq.conciliacion_importaciones;
            const [cuentaId, bancoFmt, fileHash, archivoNombre, totalFilas, saldoFinal, createdBy] = params;
            state.conciliacion_importaciones.push({
                id, cuenta_bancaria_id: Number(cuentaId), banco_formato: bancoFmt, file_hash: fileHash,
                archivo_nombre: archivoNombre || null,
                total_filas: totalFilas, creados_count: 0, conciliados_count: 0, duplicados_omitidos: 0,
                saldo_final_extracto: saldoFinal, created_by: createdBy, created_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update conciliacion_importaciones')) {
            const [creados, conciliados, dupes, id] = params;
            const imp = state.conciliacion_importaciones.find((x) => Number(x.id) === Number(id));
            if (imp) Object.assign(imp, { creados_count: creados, conciliados_count: conciliados, duplicados_omitidos: dupes });
            return [{ affectedRows: imp ? 1 : 0 }];
        }
        if (isSelect && sqlLower.includes('from conciliacion_importaciones')) {
            const [ctaId, hash] = params;
            return [state.conciliacion_importaciones.filter((i) => Number(i.cuenta_bancaria_id) === Number(ctaId) && i.file_hash === hash)];
        }

        if (sqlLower.startsWith('insert into conciliacion_reglas_clasificacion')) {
            const id = ++state.seq.conciliacion_reglas_clasificacion;
            const [banco_codigo, cuenta_bancaria_id, nombre, patron, tipo_match, tipo_movimiento, signo, tipo_remesa_id, concepto_limpio, cod_cta, prioridad, activo, created_by] = params;
            state.conciliacion_reglas_clasificacion.push({
                id, banco_codigo: banco_codigo || null, cuenta_bancaria_id: cuenta_bancaria_id ? Number(cuenta_bancaria_id) : null,
                nombre, patron, tipo_match: tipo_match || 'CONTAINS', tipo_movimiento: tipo_movimiento || 'AMBOS',
                signo: signo || 'CUALQUIERA', tipo_remesa_id: tipo_remesa_id ? Number(tipo_remesa_id) : null,
                concepto_limpio: concepto_limpio || null, cod_cta: cod_cta || null,
                prioridad: Number(prioridad || 100), activo: activo !== undefined ? Number(activo) : 1, created_by
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update conciliacion_reglas_clasificacion')) {
            const { affectedRows } = applySqlSet(state.conciliacion_reglas_clasificacion, sql, params, {
                numCols: ['cuenta_bancaria_id', 'tipo_remesa_id', 'prioridad', 'activo']
            });
            return [{ affectedRows }];
        }
        if (sqlLower.startsWith('delete from conciliacion_reglas_clasificacion')) {
            const id = Number(params[0]);
            const before = state.conciliacion_reglas_clasificacion.length;
            state.conciliacion_reglas_clasificacion = state.conciliacion_reglas_clasificacion.filter((r) => Number(r.id) !== id);
            return [{ affectedRows: before - state.conciliacion_reglas_clasificacion.length }];
        }
        if (isSelect && sqlLower.includes('from conciliacion_reglas_clasificacion')) {
            if (sqlLower.includes('where id = ?')) {
                return [state.conciliacion_reglas_clasificacion.filter((r) => Number(r.id) === Number(params[0]))];
            }
            let rows = state.conciliacion_reglas_clasificacion.slice();
            if (sqlLower.includes('activo = 1')) rows = rows.filter((r) => Number(r.activo) === 1);
            return [rows.sort((a, b) => Number(a.prioridad || 100) - Number(b.prioridad || 100))];
        }

        if (sqlLower.startsWith('insert into conciliacion_cruces')) {
            const id = ++state.seq.conciliacion_cruces;
            const [cuenta_bancaria_id, tipo_cruce, direccion, monto_total, fecha_aplicado, importacion_id, referencia_banco, concepto_banco, notas, created_by] = params;
            state.conciliacion_cruces.push({
                id, cuenta_bancaria_id: Number(cuenta_bancaria_id), tipo_cruce, direccion,
                monto_total: Number(monto_total), fecha_aplicado: ymd(fecha_aplicado),
                estado: 'ACTIVO', importacion_id, referencia_banco, concepto_banco, notas, created_by,
                created_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update conciliacion_cruces')) {
            const id = Number(params[params.length - 1]);
            const row = state.conciliacion_cruces.find((c) => Number(c.id) === id);
            if (row) row.estado = 'DESCONCILIADO';
            return [{ affectedRows: row ? 1 : 0 }];
        }
        if (sqlLower.startsWith('delete from conciliacion_cruces')) {
            const id = Number(params[0]);
            const before = state.conciliacion_cruces.length;
            state.conciliacion_cruces = state.conciliacion_cruces.filter((c) => Number(c.id) !== id);
            return [{ affectedRows: before - state.conciliacion_cruces.length }];
        }
        if (isSelect && sqlLower.includes('from conciliacion_cruces')) {
            if (sqlLower.includes('where id = ?')) {
                return [state.conciliacion_cruces.filter((c) => Number(c.id) === Number(params[0]))];
            }
            return [state.conciliacion_cruces];
        }
        if (sqlLower.startsWith('insert into conciliacion_cruce_items')) {
            const id = ++state.seq.conciliacion_cruce_items;
            const [cruce_id, lado, origen_tipo, entidad_id, documento, fecha, concepto, monto] = params;
            state.conciliacion_cruce_items.push({
                id, cruce_id: Number(cruce_id), lado, origen_tipo, entidad_id, documento, fecha: ymd(fecha), concepto, monto: Number(monto)
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('delete from conciliacion_cruce_items')) {
            const val = Number(params[0]);
            const col = sqlLower.includes('cruce_id') ? 'cruce_id' : 'id';
            const before = state.conciliacion_cruce_items.length;
            state.conciliacion_cruce_items = state.conciliacion_cruce_items.filter((i) => Number(i[col]) !== val);
            return [{ affectedRows: before - state.conciliacion_cruce_items.length }];
        }
        if (isSelect && sqlLower.includes('from conciliacion_cruce_items')) {
            if (sqlLower.includes('where cruce_id = ?')) {
                return [state.conciliacion_cruce_items.filter((i) => Number(i.cruce_id) === Number(params[0]))];
            }
            return [state.conciliacion_cruce_items];
        }

        // Check Designer & Printer Calibration (mutations BEFORE selects)
        if (sqlLower.startsWith('insert into check_format')) {
            const [name, banco_id, description, width, height, orientation, margin_top, margin_right, margin_bottom, margin_left, resolution, printer_name, design_json] = params;
            if (state.check_format.some((f) => f.name === name)) {
                const err = new Error('Duplicate format name');
                err.code = 'ER_DUP_ENTRY';
                throw err;
            }
            const id = ++state.seq.check_format;
            state.check_format.push({
                id, name, banco_id, description, width, height, orientation,
                margin_top, margin_right, margin_bottom, margin_left, resolution, printer_name,
                is_active: 1, design_json, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update check_format set')) {
            const { affectedRows } = applySqlSet(state.check_format, sql, params, {
                numCols: ['banco_id', 'width', 'height', 'margin_top', 'margin_right', 'margin_bottom', 'margin_left', 'resolution', 'is_active']
            });
            return [{ affectedRows }];
        }
        if (sqlLower.startsWith('delete from check_format')) {
            const id = Number(params[0]);
            const before = state.check_format.length;
            state.check_format = state.check_format.filter((f) => Number(f.id) !== id);
            return [{ affectedRows: before - state.check_format.length }];
        }
        if (isSelect && sqlLower.includes('from check_format cf')) {
            let rows = state.check_format.slice();
            if (sqlLower.includes('where cf.id = ?')) {
                rows = rows.filter((f) => Number(f.id) === Number(params[0]));
            }
            return [rows.map((f) => {
                const bco = state.bancos.find((b) => Number(b.id) === Number(f.banco_id));
                return { ...f, banco_nombre: bco?.descripcion || null };
            })];
        }
        if (isSelect && sqlLower.includes('from check_format where name = ? and id != ?')) {
            return [state.check_format.filter((f) => f.name === params[0] && Number(f.id) !== Number(params[1]))];
        }
        if (isSelect && sqlLower.includes('from check_format where id = ?')) {
            return [state.check_format.filter((f) => Number(f.id) === Number(params[0]))];
        }
        if (sqlLower.includes('from printer_calibration')) {
            return [state.printer_calibration.slice()];
        }
        if (sqlLower.startsWith('insert into printer_calibration')) {
            const [printer_name, offset_x, offset_y, scale] = params;
            const existing = state.printer_calibration.find((p) => p.printer_name === printer_name);
            if (existing) {
                Object.assign(existing, { offset_x: Number(offset_x), offset_y: Number(offset_y), scale: Number(scale) });
            } else {
                const id = ++state.seq.printer_calibration;
                state.printer_calibration.push({ id, printer_name, offset_x: Number(offset_x), offset_y: Number(offset_y), scale: Number(scale) });
            }
            return [{ affectedRows: 1 }];
        }

        // Control de Pagos (local DB tables — mutations BEFORE selects)
        if (sqlLower.startsWith('insert into recordatorios_pagos_abonos')) {
            const id = ++state.seq.recordatorios_pagos_abonos;
            const [
                vencimiento_id, recordatorio_id, ubicacion, descripcion_ref, tipo_operacion, metodo_pago,
                cuenta_bancaria_id, cuenta_label, tarjeta_ref, beneficiario, referencia_doc,
                fecha_pago, monto, notas, estado_conciliacion, created_by
            ] = params;
            state.recordatorios_pagos_abonos.push({
                id, vencimiento_id: Number(vencimiento_id), recordatorio_id: Number(recordatorio_id),
                ubicacion, descripcion_ref, tipo_operacion, metodo_pago,
                cuenta_bancaria_id: cuenta_bancaria_id ? Number(cuenta_bancaria_id) : null,
                cuenta_label, tarjeta_ref, beneficiario, referencia_doc,
                fecha_pago: ymd(fecha_pago), monto: Number(monto), notas,
                movimiento_bancario_id: null, cheque_id: null, estado_conciliacion, created_by,
                created_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith("update recordatorios_pagos_abonos set estado_conciliacion = 'conci")) {
            if (sqlLower.includes('cheque_id = ?')) {
                const [movId, chkId, abonoId] = params;
                const ab = state.recordatorios_pagos_abonos.find((a) => Number(a.id) === Number(abonoId));
                if (ab) {
                    ab.estado_conciliacion = 'CONCILIADO';
                    ab.movimiento_bancario_id = movId ? Number(movId) : null;
                    ab.cheque_id = chkId ? Number(chkId) : null;
                }
                return [{ affectedRows: ab ? 1 : 0 }];
            }
            const [movId, abonoId] = params;
            const ab = state.recordatorios_pagos_abonos.find((a) => Number(a.id) === Number(abonoId));
            if (ab) {
                ab.estado_conciliacion = 'CONCILIADO';
                ab.movimiento_bancario_id = Number(movId);
                if (sqlLower.includes('cheque_id = null')) ab.cheque_id = null;
            }
            return [{ affectedRows: ab ? 1 : 0 }];
        }
        if (sqlLower.startsWith("update recordatorios_pagos_abonos set estado_conciliacion = 'pendiente'")) {
            const ids = new Set(params.flat().map(Number));
            const byCheque = sqlLower.includes('cheque_id in');
            state.recordatorios_pagos_abonos.forEach((a) => {
                const linkedId = byCheque ? a.cheque_id : a.movimiento_bancario_id;
                if (ids.has(Number(linkedId)) && a.estado_conciliacion === 'CONCILIADO') {
                    a.estado_conciliacion = 'PENDIENTE';
                    if (sqlLower.includes('movimiento_bancario_id = null')) a.movimiento_bancario_id = null;
                    if (sqlLower.includes('cheque_id = null')) a.cheque_id = null;
                }
            });
            return [{ affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update recordatorios_pagos_abonos set tipo_operacion = ?')) {
            if (sqlLower.includes('where archivo_url = ?')) {
                const cnt = state.recordatorios_pagos_comprobantes.filter((c) => c.archivo_url === params[0]).length;
                return [[{ cnt }]];
            }
            if (sqlLower.includes('where vencimiento_id = ?')) {
                state.recordatorios_pagos_abonos.forEach((a) => {
                    if (Number(a.vencimiento_id) === Number(params[1])) a.tipo_operacion = params[0];
                });
                return [{ affectedRows: 1 }];
            }
            const [
                tipo_operacion, metodo_pago, cuenta_bancaria_id, cuenta_label, tarjeta_ref,
                beneficiario, referencia_doc, fecha_pago, monto, notas, estado_conciliacion, abonoId
            ] = params;
            const ab = state.recordatorios_pagos_abonos.find((a) => Number(a.id) === Number(abonoId));
            if (ab) {
                Object.assign(ab, {
                    tipo_operacion, metodo_pago, cuenta_bancaria_id, cuenta_label, tarjeta_ref,
                    beneficiario, referencia_doc, fecha_pago: ymd(fecha_pago), monto: Number(monto), notas, estado_conciliacion
                });
            }
            return [{ affectedRows: ab ? 1 : 0 }];
        }
        if (sqlLower.startsWith('update recordatorios_pagos_abonos set')) {
            const { affectedRows } = applySqlSet(state.recordatorios_pagos_abonos, sql, params, {
                dateCols: ['fecha_pago'],
                numCols: ['cuenta_bancaria_id', 'monto', 'movimiento_bancario_id', 'cheque_id']
            });
            return [{ affectedRows }];
        }
        if (sqlLower.startsWith('delete from recordatorios_pagos_abonos')) {
            const col = sqlLower.includes('vencimiento_id') ? 'vencimiento_id' : 'id';
            const val = Number(params[0]);
            const before = state.recordatorios_pagos_abonos.length;
            state.recordatorios_pagos_abonos = state.recordatorios_pagos_abonos.filter((a) => Number(a[col]) !== val);
            return [{ affectedRows: before - state.recordatorios_pagos_abonos.length }];
        }
        if (isSelect && sqlLower.includes('from recordatorios_pagos_abonos')) {
            if (sqlLower.includes('where cheque_id = ?')) {
                return [state.recordatorios_pagos_abonos.filter((a) => Number(a.cheque_id) === Number(params[0]))];
            }
            if (sqlLower.includes('where movimiento_bancario_id = ?')) {
                return [state.recordatorios_pagos_abonos.filter((a) => Number(a.movimiento_bancario_id) === Number(params[0]) && a.estado_conciliacion === 'CONCILIADO')];
            }
            if (sqlLower.includes('where a.cuenta_bancaria_id = ?') && sqlLower.includes("estado_conciliacion = 'pendiente'")) {
                const [ctaId, hasta] = params;
                const rows = state.recordatorios_pagos_abonos
                    .filter((a) => Number(a.cuenta_bancaria_id) === Number(ctaId) && a.estado_conciliacion === 'PENDIENTE' && ymd(a.fecha_pago) <= ymd(hasta))
                    .map((a) => {
                        const comps = state.recordatorios_pagos_comprobantes.filter((c) =>
                            Number(c.vencimiento_id) === Number(a.vencimiento_id) &&
                            (Number(c.abono_id) === Number(a.id) || c.abono_id === null)
                        ).sort((x, y) => Number(y.id) - Number(x.id));
                        return {
                            ...a,
                            comprobantes_count: comps.length,
                            comprobante_url: comps[0]?.archivo_url || null
                        };
                    });
                return [rows];
            }
            if (sqlLower.includes('where id = ?')) {
                return [state.recordatorios_pagos_abonos.filter((a) => Number(a.id) === Number(params[0]))];
            }
            if (sqlLower.includes('where vencimiento_id in')) {
                const ids = new Set(params.map(Number));
                return [state.recordatorios_pagos_abonos.filter((a) => ids.has(Number(a.vencimiento_id)))];
            }
            if (sqlLower.includes('where vencimiento_id = ?')) {
                const vid = Number(params[0]);
                const rows = state.recordatorios_pagos_abonos.filter((a) => Number(a.vencimiento_id) === vid);
                if (sqlLower.includes('count(*)')) {
                    return [[{ c: rows.length, cnt: rows.length, total_pagado: rows.reduce((s, r) => s + Number(r.monto || 0), 0) }]];
                }
                return [rows.map((a) => {
                    const cta = state.cuentas_bancarias.find((c) => Number(c.id) === Number(a.cuenta_bancaria_id));
                    const bco = state.bancos.find((b) => Number(b.id) === Number(cta?.banco_id));
                    return { ...a, cuenta_numero: cta?.numero || null, cuenta_nombre_oficial: cta?.nombre || null, banco_nombre: bco?.descripcion || null };
                })];
            }
            if (sqlLower.includes('group by recordatorio_id')) {
                return [[]];
            }
            return [state.recordatorios_pagos_abonos];
        }

        if (sqlLower.startsWith('insert into recordatorios_pagos_comprobantes')) {
            const id = ++state.seq.recordatorios_pagos_comprobantes;
            const [vencimiento_id, abono_id, nombre_original, archivo_url, mime_type, tamano_bytes, ancho, alto, nota, uploaded_by] = params;
            state.recordatorios_pagos_comprobantes.push({
                id, vencimiento_id: Number(vencimiento_id), abono_id: abono_id ? Number(abono_id) : null,
                nombre_original, archivo_url, mime_type, tamano_bytes: Number(tamano_bytes || 0),
                ancho, alto, nota, uploaded_by, created_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update recordatorios_pagos_comprobantes set abono_id = null')) {
            const abonoId = Number(params[0]);
            state.recordatorios_pagos_comprobantes.forEach((c) => {
                if (Number(c.abono_id) === abonoId) c.abono_id = null;
            });
            return [{ affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update recordatorios_pagos_comprobantes set vencimiento_id = ?')) {
            const newVid = Number(params[0]);
            const oldIds = new Set(params.slice(1).map(Number));
            state.recordatorios_pagos_comprobantes.forEach((c) => {
                if (oldIds.has(Number(c.vencimiento_id))) c.vencimiento_id = newVid;
            });
            return [{ affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update recordatorios_pagos_comprobantes set')) {
            const { affectedRows } = applySqlSet(state.recordatorios_pagos_comprobantes, sql, params, {
                numCols: ['vencimiento_id', 'abono_id', 'tamano_bytes', 'ancho', 'alto']
            });
            return [{ affectedRows }];
        }
        if (sqlLower.startsWith('delete from recordatorios_pagos_comprobantes')) {
            const col = sqlLower.includes('vencimiento_id') ? 'vencimiento_id' : 'id';
            const val = Number(params[0]);
            const before = state.recordatorios_pagos_comprobantes.length;
            state.recordatorios_pagos_comprobantes = state.recordatorios_pagos_comprobantes.filter((c) => Number(c[col]) !== val);
            return [{ affectedRows: before - state.recordatorios_pagos_comprobantes.length }];
        }
        if (isSelect && sqlLower.includes('from recordatorios_pagos_comprobantes')) {
            if (sqlLower.includes('where vencimiento_id in') && sqlLower.includes('group by')) {
                const ids = new Set(params.map(Number));
                const counts = new Map();
                for (const c of state.recordatorios_pagos_comprobantes) {
                    if (ids.has(Number(c.vencimiento_id))) {
                        counts.set(Number(c.vencimiento_id), (counts.get(Number(c.vencimiento_id)) || 0) + 1);
                    }
                }
                return [[...counts.entries()].map(([vencimiento_id, total]) => ({ vencimiento_id, total }))];
            }
            if (sqlLower.includes('where archivo_url = ?')) {
                const cnt = state.recordatorios_pagos_comprobantes.filter((c) => c.archivo_url === params[0]).length;
                return [[{ cnt }]];
            }
            if (sqlLower.includes('where vencimiento_id = ?')) {
                return [state.recordatorios_pagos_comprobantes.filter((c) => Number(c.vencimiento_id) === Number(params[0])).slice().reverse()];
            }
            if (sqlLower.includes('where id = ?')) {
                return [state.recordatorios_pagos_comprobantes.filter((c) => Number(c.id) === Number(params[0]))];
            }
            return [state.recordatorios_pagos_comprobantes];
        }

        if (sqlLower.startsWith('insert into recordatorios_vencimientos_meta')) {
            const [vencimiento_id, recordatorio_id, tipo_operacion, metodo_pago_preferido, cuenta_bancaria_id, cuenta_label, tarjeta_ref, notas_control, updated_by] = params;
            const hasNotas = sqlLower.includes('notas_control');
            const realUpdatedBy = hasNotas ? updated_by : notas_control;
            const existing = state.recordatorios_vencimientos_meta.find((m) => Number(m.vencimiento_id) === Number(vencimiento_id));
            const patch = {
                vencimiento_id: Number(vencimiento_id),
                recordatorio_id: Number(recordatorio_id),
                tipo_operacion: tipo_operacion || 'CXP',
                metodo_pago_preferido: metodo_pago_preferido || existing?.metodo_pago_preferido || null,
                cuenta_bancaria_id: cuenta_bancaria_id !== undefined ? cuenta_bancaria_id : (existing?.cuenta_bancaria_id || null),
                cuenta_label: cuenta_label !== undefined ? cuenta_label : (existing?.cuenta_label || null),
                tarjeta_ref: tarjeta_ref !== undefined ? tarjeta_ref : (existing?.tarjeta_ref || null),
                notas_control: hasNotas ? (notas_control ?? existing?.notas_control ?? null) : (existing?.notas_control ?? null),
                updated_by: realUpdatedBy || null,
                updated_at: new Date().toISOString()
            };
            if (existing) Object.assign(existing, patch);
            else state.recordatorios_vencimientos_meta.push(patch);
            return [{ affectedRows: 1 }];
        }
        if (sqlLower.startsWith('delete from recordatorios_vencimientos_meta')) {
            const val = Number(params[0]);
            const before = state.recordatorios_vencimientos_meta.length;
            state.recordatorios_vencimientos_meta = state.recordatorios_vencimientos_meta.filter((m) => Number(m.vencimiento_id) !== val);
            return [{ affectedRows: before - state.recordatorios_vencimientos_meta.length }];
        }
        if (isSelect && sqlLower.includes('from recordatorios_vencimientos_meta')) {
            if (sqlLower.includes('where vencimiento_id in')) {
                const ids = new Set(params.map(Number));
                return [state.recordatorios_vencimientos_meta.filter((m) => ids.has(Number(m.vencimiento_id)))];
            }
            if (sqlLower.includes('where vencimiento_id = ?')) {
                return [state.recordatorios_vencimientos_meta.filter((m) => Number(m.vencimiento_id) === Number(params[0]))];
            }
            return [state.recordatorios_vencimientos_meta];
        }

        // Tasks, Comments, Attachments (mutations BEFORE selects)
        if (sqlLower.startsWith('insert into task_attachments')) {
            const id = ++state.seq.task_attachments;
            const [task_id, comment_id, nombre_original, archivo_url, mime_type, tamano_bytes, ancho, alto, nota, uploaded_by, uploaded_by_name] = params;
            state.task_attachments.push({
                id, task_id: Number(task_id), comment_id: comment_id ? Number(comment_id) : null,
                nombre_original, archivo_url, mime_type: mime_type || 'image/webp',
                tamano_bytes: Number(tamano_bytes || 0), ancho: ancho || null, alto: alto || null,
                nota: nota || null, uploaded_by: uploaded_by ? Number(uploaded_by) : null,
                uploaded_by_name: uploaded_by_name || null, created_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('delete from task_attachments')) {
            const col = sqlLower.includes('task_id') ? 'task_id' : 'id';
            const val = Number(params[0]);
            const before = state.task_attachments.length;
            state.task_attachments = state.task_attachments.filter((a) => Number(a[col]) !== val);
            return [{ affectedRows: before - state.task_attachments.length }];
        }
        if (isSelect && sqlLower.includes('from task_attachments')) {
            if (sqlLower.includes('where archivo_url = ?')) {
                const cnt = state.task_attachments.filter((a) => a.archivo_url === params[0]).length;
                return [[{ cnt }]];
            }
            if (sqlLower.includes('where id = ?')) {
                return [state.task_attachments.filter((a) => Number(a.id) === Number(params[0]))];
            }
            if (sqlLower.includes('where task_id = ?')) {
                return [state.task_attachments.filter((a) => Number(a.task_id) === Number(params[0]))];
            }
            if (sqlLower.includes('where task_id in')) {
                const ids = new Set(params.map(Number));
                return [state.task_attachments.filter((a) => ids.has(Number(a.task_id)))];
            }
            return [state.task_attachments];
        }

        if (sqlLower.startsWith('insert into task_comments')) {
            const id = ++state.seq.task_comments;
            const [task_id, user_id, comentario] = params;
            state.task_comments.push({ id, task_id: Number(task_id), user_id: Number(user_id), comentario, created_at: new Date().toISOString() });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('delete from task_comments')) {
            const col = sqlLower.includes('task_id') ? 'task_id' : 'id';
            const val = Number(params[0]);
            const before = state.task_comments.length;
            state.task_comments = state.task_comments.filter((c) => Number(c[col]) !== val);
            return [{ affectedRows: before - state.task_comments.length }];
        }
        if (isSelect && sqlLower.includes('from task_comments') && !sqlLower.includes('from tasks t')) {
            if (sqlLower.includes('where id = ? and task_id = ?')) {
                return [state.task_comments.filter((c) => Number(c.id) === Number(params[0]) && Number(c.task_id) === Number(params[1]))];
            }
            if (sqlLower.includes('where tc.id = ?')) {
                const c = state.task_comments.find((x) => Number(x.id) === Number(params[0]));
                if (!c) return [[]];
                const u = state.users.find((usr) => Number(usr.id) === Number(c.user_id));
                return [[{ ...c, user_name: u?.nombre || u?.username || '', username: u?.username || '' }]];
            }
            const taskId = Number(params[0]);
            const rows = state.task_comments
                .filter((c) => Number(c.task_id) === taskId)
                .map((c) => {
                    const u = state.users.find((usr) => Number(usr.id) === Number(c.user_id));
                    return { ...c, user_name: u?.nombre || u?.username || '', username: u?.username || '' };
                });
            return [rows];
        }

        if (sqlLower.startsWith('insert into tasks')) {
            const id = ++state.seq.tasks;
            const isMibotCreate = !sqlLower.includes('fecha_inicio');
            if (isMibotCreate) {
                const [titulo, descripcion, fecha_vencimiento, hora_limite, prioridad, categoria, assigned_to, created_by] = params;
                state.tasks.push({
                    id, titulo, descripcion, tipo_plazo: 'dia_especifico', fecha_inicio: null,
                    fecha_vencimiento: ymd(fecha_vencimiento), hora_limite, prioridad, estado: 'pendiente',
                    categoria, assigned_to: Number(assigned_to), created_by: Number(created_by),
                    checklist: '[]', orden: 0, completada_en: null, created_at: new Date().toISOString()
                });
            } else {
                const [titulo, descripcion, tipo_plazo, fecha_inicio, fecha_vencimiento, hora_limite, prioridad, categoria, assigned_to, created_by, checklist] = params;
                state.tasks.push({
                    id, titulo, descripcion, tipo_plazo, fecha_inicio: ymd(fecha_inicio),
                    fecha_vencimiento: ymd(fecha_vencimiento), hora_limite, prioridad, estado: 'pendiente',
                    categoria, assigned_to: Number(assigned_to), created_by: Number(created_by),
                    checklist: checklist || '[]', orden: 0, completada_en: null, created_at: new Date().toISOString()
                });
            }
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update tasks set estado =')) {
            const id = Number(params[params.length - 1]);
            const t = state.tasks.find((x) => Number(x.id) === id);
            let affected = 0;
            if (t) {
                if (sqlLower.includes("estado = 'en_proceso'")) {
                    if (!sqlLower.includes("estado = 'pendiente'") || t.estado === 'pendiente') {
                        t.estado = 'en_proceso';
                        affected = 1;
                    }
                } else if (sqlLower.includes("estado = 'completada'")) {
                    if (!sqlLower.includes("estado <> 'completada'") || t.estado !== 'completada') {
                        t.estado = 'completada';
                        t.completada_en = new Date().toISOString();
                        affected = 1;
                    }
                } else if (params.length >= 2) {
                    t.estado = params[0];
                    if (t.estado === 'completada') t.completada_en = new Date().toISOString();
                    affected = 1;
                }
            }
            return [{ affectedRows: affected }];
        }
        if (sqlLower.startsWith('update tasks set checklist = ?')) {
            const [checklist, id] = params;
            const t = state.tasks.find((x) => Number(x.id) === Number(id));
            if (t) t.checklist = checklist;
            return [{ affectedRows: t ? 1 : 0 }];
        }
        if (sqlLower.startsWith('update tasks set')) {
            const id = Number(params[params.length - 1]);
            const t = state.tasks.find((x) => Number(x.id) === id);
            if (t) {
                const [titulo, descripcion, tipo_plazo, fecha_inicio, fecha_vencimiento, hora_limite, prioridad, categoria, assigned_to] = params;
                Object.assign(t, { titulo, descripcion, tipo_plazo, fecha_inicio, fecha_vencimiento, hora_limite, prioridad, categoria, assigned_to: Number(assigned_to) });
                if (sqlLower.includes('checklist = ?')) t.checklist = params[9];
            }
            return [{ affectedRows: t ? 1 : 0 }];
        }
        if (sqlLower.startsWith('delete from tasks')) {
            const id = Number(params[0]);
            const before = state.tasks.length;
            state.tasks = state.tasks.filter((t) => Number(t.id) !== id);
            state.task_comments = state.task_comments.filter((c) => Number(c.task_id) !== id);
            state.task_attachments = state.task_attachments.filter((a) => Number(a.task_id) !== id);
            return [{ affectedRows: before - state.tasks.length }];
        }
        if (isSelect && sqlLower.includes('from tasks') && sqlLower.includes('count(*) as total')) {
            const todaySv = ymd(params[0]);
            let rows = state.tasks.slice();
            if (sqlLower.includes('(assigned_to = ? or created_by = ?)')) {
                const uid1 = Number(params[2]);
                const uid2 = Number(params[3]);
                rows = rows.filter((t) => Number(t.assigned_to) === uid1 || Number(t.created_by) === uid2);
            } else if (sqlLower.includes('and assigned_to = ?')) {
                const aid = Number(params[2]);
                rows = rows.filter((t) => Number(t.assigned_to) === aid);
            }
            return [[{
                total: rows.length,
                pendientes: rows.filter((t) => t.estado === 'pendiente').length,
                en_proceso: rows.filter((t) => t.estado === 'en_proceso').length,
                en_revision: rows.filter((t) => t.estado === 'en_revision').length,
                completadas: rows.filter((t) => t.estado === 'completada').length,
                vencidas: todaySv ? rows.filter((t) => t.estado !== 'completada' && t.estado !== 'cancelada' && t.fecha_vencimiento && ymd(t.fecha_vencimiento) < todaySv).length : 0,
                vence_hoy: todaySv ? rows.filter((t) => t.estado !== 'completada' && t.estado !== 'cancelada' && t.fecha_vencimiento && ymd(t.fecha_vencimiento) === todaySv).length : 0
            }]];
        }
        if (isSelect && sqlLower.includes('from tasks t')) {
            if (sqlLower.includes('where t.id = ?')) {
                const t = state.tasks.find((x) => Number(x.id) === Number(params[0]));
                if (!t) return [[]];
                const u1 = state.users.find((u) => Number(u.id) === Number(t.assigned_to));
                const u2 = state.users.find((u) => Number(u.id) === Number(t.created_by));
                return [[{
                    ...t,
                    assigned_user_name: u1?.nombre || u1?.username || null,
                    assigned_username: u1?.username || null,
                    created_user_name: u2?.nombre || u2?.username || null,
                    created_username: u2?.username || null
                }]];
            }
            let rows = state.tasks.slice();
            let pIdx = 0;
            if (sqlLower.includes('(t.assigned_to = ? or t.created_by = ?)')) {
                const uid1 = Number(params[pIdx++]);
                const uid2 = Number(params[pIdx++]);
                rows = rows.filter((t) => Number(t.assigned_to) === uid1 || Number(t.created_by) === uid2);
            } else if (sqlLower.includes('and t.assigned_to = ?')) {
                const aid = Number(params[pIdx++]);
                rows = rows.filter((t) => Number(t.assigned_to) === aid);
            }
            if (sqlLower.includes('and t.estado = ?')) {
                const stVal = params[pIdx++];
                rows = rows.filter((t) => t.estado === stVal);
            }
            if (sqlLower.includes('and t.prioridad = ?')) {
                const prVal = params[pIdx++];
                rows = rows.filter((t) => t.prioridad === prVal);
            }
            if (sqlLower.includes('and t.categoria = ?')) {
                const catVal = params[pIdx++];
                rows = rows.filter((t) => t.categoria === catVal);
            }
            if (sqlLower.includes('and t.fecha_vencimiento >= ?')) {
                const fd = params[pIdx++];
                rows = rows.filter((t) => ymd(t.fecha_vencimiento) >= ymd(fd));
            }
            if (sqlLower.includes('and t.fecha_vencimiento <= ?')) {
                const fh = params[pIdx++];
                rows = rows.filter((t) => ymd(t.fecha_vencimiento) <= ymd(fh));
            }
            if (sqlLower.includes('t.titulo like ?')) {
                const term = params[pIdx++];
                pIdx++;
                rows = rows.filter((t) => likeMatch(t.titulo, term) || likeMatch(t.descripcion, term));
            }
            return [rows.map((t) => {
                const u1 = state.users.find((u) => Number(u.id) === Number(t.assigned_to));
                const u2 = state.users.find((u) => Number(u.id) === Number(t.created_by));
                return {
                    ...t,
                    assigned_user_name: u1?.nombre || u1?.username || null,
                    assigned_username: u1?.username || null,
                    created_user_name: u2?.nombre || u2?.username || null,
                    comments_count: state.task_comments.filter((c) => Number(c.task_id) === Number(t.id)).length,
                    attachments_count: state.task_attachments.filter((a) => Number(a.task_id) === Number(t.id)).length
                };
            })];
        }
        if (isSelect && sqlLower.includes('from tasks where id = ?')) {
            return [state.tasks.filter((t) => Number(t.id) === Number(params[0]))];
        }

        // Telegram & MiBot
        if (isSelect && sqlLower.includes('from telegram_config')) {
            return [state.telegram_config];
        }
        if (isSelect && sqlLower.includes('from telegram_usuarios')) {
            let rows = state.telegram_usuarios.filter((u) => Number(u.activo) === 1);
            if (sqlLower.includes('where tu.id in')) {
                const ids = new Set(params.map(Number));
                rows = rows.filter((u) => ids.has(Number(u.id)));
            } else if (sqlLower.includes('where user_id in')) {
                const ids = new Set(params.map(Number));
                rows = rows.filter((u) => ids.has(Number(u.user_id)));
            } else if (sqlLower.includes('where tu.user_id = ?')) {
                rows = rows.filter((u) => Number(u.user_id) === Number(params[0]));
            }
            return [rows.map((tu) => {
                const u = state.users.find((x) => Number(x.id) === Number(tu.user_id));
                return {
                    ...tu,
                    sipe_status: u?.status || 'active',
                    sipe_role_id: u?.role_id || null,
                    sipe_role_name: u?.role_name || null,
                    sipe_nombre: u?.nombre || null,
                    sipe_username: u?.username || null,
                    sipe_permissions: (state.rolePermissions[u?.role_id] || []).join(',')
                };
            })];
        }
        if (isSelect && sqlLower.includes('from users u') && sqlLower.includes('left join telegram_usuarios tu')) {
            return [state.users.filter((u) => u.status === 'active' && !state.telegram_usuarios.some((t) => Number(t.user_id) === Number(u.id) && Number(t.activo) === 1))];
        }

        // MiBot programaciones (mutations BEFORE selects)
        if (sqlLower.startsWith('insert into mibot_programaciones_destinatarios')) {
            const id = ++state.seq.mibot_programaciones_destinatarios;
            const [programacion_id, telegram_usuario_id, telegram_user_id, nombre_destinatario, cargo] = params;
            state.mibot_programaciones_destinatarios.push({
                id, programacion_id: Number(programacion_id), telegram_usuario_id: Number(telegram_usuario_id),
                telegram_user_id: String(telegram_user_id), nombre_destinatario, cargo,
                estado_entrega: 'PENDIENTE', enviado_at: null, respondido_at: null,
                pospuesto_hasta: null, respuesta_nota: null, telegram_message_id: null, error_msg: null
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith("update mibot_programaciones_destinatarios set estado_entrega = 'enviado'")) {
            const [enviadoAt, msgId, destId] = params;
            const d = state.mibot_programaciones_destinatarios.find((x) => Number(x.id) === Number(destId));
            if (d) Object.assign(d, { estado_entrega: 'ENVIADO', enviado_at: enviadoAt, telegram_message_id: msgId, pospuesto_hasta: null, error_msg: null });
            return [{ affectedRows: d ? 1 : 0 }];
        }
        if (sqlLower.startsWith("update mibot_programaciones_destinatarios set estado_entrega = 'error'")) {
            const d = state.mibot_programaciones_destinatarios.find((x) => Number(x.id) === Number(params[params.length - 1]));
            if (d) Object.assign(d, { estado_entrega: 'ERROR', error_msg: params[0] || 'error' });
            return [{ affectedRows: d ? 1 : 0 }];
        }
        if (sqlLower.startsWith('update mibot_programaciones_destinatarios set estado_entrega = ?')) {
            const [est, respAt, posp, nota, id] = params;
            const d = state.mibot_programaciones_destinatarios.find((x) => Number(x.id) === Number(id));
            if (d) Object.assign(d, { estado_entrega: est, respondido_at: respAt, pospuesto_hasta: posp, respuesta_nota: nota });
            return [{ affectedRows: d ? 1 : 0 }];
        }
        if (sqlLower.startsWith('delete from mibot_programaciones_destinatarios')) {
            const col = sqlLower.includes('programacion_id') ? 'programacion_id' : 'id';
            const val = Number(params[0]);
            const before = state.mibot_programaciones_destinatarios.length;
            state.mibot_programaciones_destinatarios = state.mibot_programaciones_destinatarios.filter((d) => Number(d[col]) !== val);
            return [{ affectedRows: before - state.mibot_programaciones_destinatarios.length }];
        }
        if (sqlLower.startsWith('insert into mibot_programaciones')) {
            const id = ++state.seq.mibot_programaciones;
            const [
                tipo, titulo, mensaje, vencimiento_id, recordatorio_id, ubicacion,
                monto_total, monto_pendiente, fecha_vencimiento, programado_para,
                proximo_envio_at, frecuencia, created_by_user_id, created_by_name, task_id
            ] = params;
            state.mibot_programaciones.push({
                id, tipo, titulo, mensaje,
                vencimiento_id: vencimiento_id ? Number(vencimiento_id) : null,
                recordatorio_id: recordatorio_id ? Number(recordatorio_id) : null,
                ubicacion, monto_total, monto_pendiente,
                fecha_vencimiento: ymd(fecha_vencimiento),
                programado_para, proximo_envio_at, frecuencia, estado: 'PROGRAMADO',
                ultimo_envio_at: null, total_envios: 0,
                created_by_user_id, created_by_name,
                task_id: task_id ? Number(task_id) : null
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update mibot_programaciones set estado = ?')) {
            const id = Number(params[params.length - 1]);
            const p = state.mibot_programaciones.find((x) => Number(x.id) === id);
            if (p) {
                if (sqlLower.includes('total_envios = total_envios + 1')) {
                    p.estado = params[0];
                    p.ultimo_envio_at = params[1];
                    p.proximo_envio_at = params[2];
                    p.total_envios = Number(p.total_envios || 0) + 1;
                } else {
                    p.estado = params[0];
                    p.proximo_envio_at = params[1];
                }
            }
            return [{ affectedRows: p ? 1 : 0 }];
        }
        if (sqlLower.startsWith("update mibot_programaciones set estado = 'completado'")) {
            const p = state.mibot_programaciones.find((x) => Number(x.id) === Number(params[0]));
            if (p) {
                p.estado = 'COMPLETADO';
                p.proximo_envio_at = null;
                if (sqlLower.includes('monto_pendiente = 0')) p.monto_pendiente = 0;
            }
            return [{ affectedRows: p ? 1 : 0 }];
        }
        if (sqlLower.startsWith('update mibot_programaciones set monto_pendiente = ?')) {
            const p = state.mibot_programaciones.find((x) => Number(x.id) === Number(params[1]));
            if (p) p.monto_pendiente = params[0];
            return [{ affectedRows: p ? 1 : 0 }];
        }
        if (sqlLower.startsWith('delete from mibot_programaciones')) {
            const id = Number(params[0]);
            const before = state.mibot_programaciones.length;
            state.mibot_programaciones = state.mibot_programaciones.filter((p) => Number(p.id) !== id);
            return [{ affectedRows: before - state.mibot_programaciones.length }];
        }
        if (isSelect && sqlLower.includes('from mibot_programaciones_destinatarios d') && sqlLower.includes('inner join mibot_programaciones p')) {
            if (sqlLower.includes('where d.id = ?')) {
                const d = state.mibot_programaciones_destinatarios.find((x) => Number(x.id) === Number(params[0]));
                if (!d) return [[]];
                const p = state.mibot_programaciones.find((x) => Number(x.id) === Number(d.programacion_id));
                if (!p) return [[]];
                return [[{ ...d, tipo: p.tipo, titulo: p.titulo, frecuencia: p.frecuencia, prog_estado: p.estado, task_id: p.task_id }]];
            }
            return [state.mibot_programaciones_destinatarios];
        }
        if (isSelect && sqlLower.includes('from mibot_programaciones_destinatarios')) {
            if (sqlLower.includes("estado_entrega <> 'validado'")) {
                const cnt = state.mibot_programaciones_destinatarios.filter((d) => Number(d.programacion_id) === Number(params[0]) && d.estado_entrega !== 'VALIDADO').length;
                return [[{ cnt }]];
            }
            if (sqlLower.includes('where programacion_id in')) {
                const ids = new Set(params.map(Number));
                return [state.mibot_programaciones_destinatarios.filter((d) => ids.has(Number(d.programacion_id)))];
            }
            if (sqlLower.includes('where programacion_id = ?')) {
                return [state.mibot_programaciones_destinatarios.filter((d) => Number(d.programacion_id) === Number(params[0]))];
            }
            return [state.mibot_programaciones_destinatarios];
        }
        if (isSelect && sqlLower.includes('from mibot_programaciones')) {
            if (sqlLower.includes('where vencimiento_id in') && sqlLower.includes('group by vencimiento_id')) {
                const ids = new Set(params.map(Number));
                const map = new Map();
                for (const p of state.mibot_programaciones) {
                    if (p.vencimiento_id && ids.has(Number(p.vencimiento_id)) && p.estado !== 'CANCELADO') {
                        const cur = map.get(Number(p.vencimiento_id)) || { vencimiento_id: Number(p.vencimiento_id), programados: 0, total: 0 };
                        if (p.estado === 'PROGRAMADO') cur.programados += 1;
                        cur.total += 1;
                        map.set(Number(p.vencimiento_id), cur);
                    }
                }
                return [[...map.values()]];
            }
            if (sqlLower.includes('where task_id in')) {
                const ids = new Set(params.map(Number));
                return [state.mibot_programaciones.filter((p) => p.task_id && ids.has(Number(p.task_id)) && p.estado !== 'CANCELADO')];
            }
            if (sqlLower.includes('where id = ?')) {
                return [state.mibot_programaciones.filter((p) => Number(p.id) === Number(params[0]))];
            }
            let rows = state.mibot_programaciones.slice();
            if (sqlLower.includes('task_id = ?')) {
                rows = rows.filter((p) => Number(p.task_id) === Number(params[0]));
            } else if (sqlLower.includes('vencimiento_id = ?')) {
                rows = rows.filter((p) => Number(p.vencimiento_id) === Number(params[0]));
            }
            return [rows];
        }

        // Sentinel Log
        if (sqlLower.startsWith('insert ignore into telegram_sentinel_log')) {
            const [sentinel_key, alert_date, severity, summary, recipients_count] = params;
            const dup = state.telegram_sentinel_log.find((s) => s.sentinel_key === sentinel_key && ymd(s.alert_date) === ymd(alert_date));
            if (dup) return [{ insertId: 0, affectedRows: 0 }];
            const id = ++state.seq.telegram_sentinel_log;
            state.telegram_sentinel_log.push({ id, sentinel_key, alert_date: ymd(alert_date), severity, summary, recipients_count: recipients_count || 0 });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update telegram_sentinel_log set recipients_count = ?')) {
            const [cnt, key, alertDate] = params;
            const row = state.telegram_sentinel_log.find((s) => s.sentinel_key === key && ymd(s.alert_date) === ymd(alertDate));
            if (row) row.recipients_count = cnt;
            return [{ affectedRows: row ? 1 : 0 }];
        }

        // Optional / Auxiliary tables
        if (isSelect && (sqlLower.includes('from prestamos') || sqlLower.includes('from rh_planilla_pagos') || sqlLower.includes('from portal_pedidos'))) {
            return [[]];
        }

        return [[]];
    };

    const runExternalQuery = async (sqlRaw, params = []) => {
        if (state.externalDbOffline) {
            const err = new Error('External DB connection refused (simulated offline)');
            err.code = 'ECONNREFUSED';
            throw err;
        }
        const sql = String(sqlRaw || '').replace(/\s+/g, ' ').trim();
        const sqlLower = sql.toLowerCase();
        const isExtMutation = /^(?:insert|update|delete|replace)\b/.test(sqlLower);
        const isExtSelect = !isExtMutation;

        // Stored procedures for Saldos
        if (sqlLower.startsWith('call sp_saldo_en_bancos')) {
            return [[state.spSaldoBancosRows]];
        }
        if (sqlLower.startsWith('call sp_saldo_en_chequera')) {
            return [[state.spSaldoChequeraRows]];
        }

        // Empresas in externalDb (estaciones)
        if (isExtSelect && sqlLower.includes('from empresas') && sqlLower.includes("id <> '001'")) {
            return [state.empresas.filter((e) => e.codigo !== '001' && e.activa === 'S').map((e) => ({ id: e.codigo, nombre: e.nombre }))];
        }

        // Solicitudes de cheques de contado + proveedores
        if (sqlLower.startsWith('update solicitud_chq_contado')) {
            const empCode = String(params[params.length - 1]);
            const llave = String(params[params.length - 2]).trim();
            const sol = state.solicitud_chq_contado.find((s) => (s.llave === llave || s.llave.trim() === llave) && String(s.id_empresa) === empCode);
            if (sol) {
                if (sqlLower.includes('num_cheque = null')) {
                    sol.num_cheque = '';
                    sol.llave_cheque = null;
                } else {
                    sol.num_cheque = params[0];
                    if (params[1] !== null && params[1] !== undefined) sol.llave_cheque = params[1];
                }
            }
            return [{ affectedRows: sol ? 1 : 0 }];
        }
        if (isExtSelect && sqlLower.includes('from solicitud_chq_contado')) {
            let rows = state.solicitud_chq_contado.slice();
            if (sqlLower.includes('a.id_empresa = ?') || sqlLower.includes('id_empresa = ?')) {
                const empCode = params[params.length - 1];
                if (sqlLower.includes('llave = ?')) {
                    const llave = String(params[0]).trim();
                    rows = rows.filter((s) => (s.llave === llave || s.llave.trim() === llave) && String(s.id_empresa) === String(empCode));
                } else {
                    rows = rows.filter((s) => String(s.id_empresa) === String(empCode));
                }
            }
            if (sqlLower.includes('left join proveedores')) {
                rows = rows.map((s) => {
                    const prov = state.proveedores.find((p) => String(p.id_empresa) === String(s.id_empresa) && String(p.codigo) === String(s.cod_proveedor));
                    return { ...s, nombre: prov?.nombre || '', proveedor_nombre: prov?.nombre || '' };
                });
            }
            return [rows];
        }

        // Control de Pagos (web_rc_* — mutations BEFORE selects)
        if (sqlLower.startsWith('insert into web_rc_recordatorios (')) {
            const id = ++state.seq.web_rc_recordatorios;
            const [descripcion, id_ubicacion, iniciar, monto, repetir, repetir_desc, activo, forma_pago] = params;
            state.web_rc_recordatorios.push({
                id, descripcion, id_ubicacion: Number(id_ubicacion), iniciar: ymd(iniciar),
                monto: Number(monto), repetir: Number(repetir), repetir_desc, activo: Number(activo), forma_pago
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update web_rc_recordatorios set')) {
            if (sqlLower.includes('forma_pago = ? where id = ?')) {
                const r = state.web_rc_recordatorios.find((x) => Number(x.id) === Number(params[1]));
                if (r) r.forma_pago = params[0];
                return [{ affectedRows: r ? 1 : 0 }];
            }
            const [descripcion, id_ubicacion, iniciar, monto, repetir, repetir_desc, activo, forma_pago, id] = params;
            const r = state.web_rc_recordatorios.find((x) => Number(x.id) === Number(id));
            if (r) Object.assign(r, { descripcion, id_ubicacion, iniciar: ymd(iniciar), monto: Number(monto), repetir, repetir_desc, activo, forma_pago });
            return [{ affectedRows: r ? 1 : 0 }];
        }
        if (sqlLower.startsWith('delete from web_rc_recordatorios ') || sqlLower.startsWith('delete from web_rc_recordatorios\n')) {
            const id = Number(params[0]);
            const before = state.web_rc_recordatorios.length;
            state.web_rc_recordatorios = state.web_rc_recordatorios.filter((r) => Number(r.id) !== id);
            return [{ affectedRows: before - state.web_rc_recordatorios.length }];
        }
        if (sqlLower.startsWith('insert into web_rc_recordatorios_vencimientos')) {
            const id = ++state.seq.web_rc_recordatorios_vencimientos;
            const isPaid = sqlLower.includes("'c'");
            state.web_rc_recordatorios_vencimientos.push({
                id,
                id_recordatorio: Number(params[0]),
                vencimiento: ymd(params[1]),
                estado: isPaid ? 'C' : 'P',
                fecha_cancelacion: isPaid ? ymd(params[2]) : null,
                forma_pago: isPaid ? params[3] : ''
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update web_rc_recordatorios_vencimientos')) {
            const id = Number(params[params.length - 1]);
            const v = state.web_rc_recordatorios_vencimientos.find((x) => Number(x.id) === id);
            if (v) {
                if (sqlLower.includes("estado = 'p'")) {
                    v.estado = 'P';
                    v.fecha_cancelacion = null;
                } else if (sqlLower.includes("estado = 'c'")) {
                    v.estado = 'C';
                    v.fecha_cancelacion = ymd(params[0]);
                    v.forma_pago = params[1];
                } else if (sqlLower.includes('set estado = ?')) {
                    v.estado = params[0];
                    v.fecha_cancelacion = ymd(params[1]);
                    v.forma_pago = params[2];
                } else if (sqlLower.includes('set forma_pago = ?')) {
                    v.forma_pago = params[0];
                    if (params.length > 2) v.fecha_cancelacion = ymd(params[1]);
                }
            }
            return [{ affectedRows: v ? 1 : 0 }];
        }
        if (sqlLower.startsWith('delete from web_rc_recordatorios_vencimientos')) {
            const val = Number(params[0]);
            const col = sqlLower.includes('id_recordatorio') ? 'id_recordatorio' : 'id';
            const before = state.web_rc_recordatorios_vencimientos.length;
            state.web_rc_recordatorios_vencimientos = state.web_rc_recordatorios_vencimientos.filter((v) => Number(v[col]) !== val);
            return [{ affectedRows: before - state.web_rc_recordatorios_vencimientos.length }];
        }
        if (isExtSelect && sqlLower.includes('from web_rc_ubicaciones')) {
            if (sqlLower.includes('where id = ?')) {
                return [state.web_rc_ubicaciones.filter((u) => Number(u.id) === Number(params[0]))];
            }
            return [state.web_rc_ubicaciones];
        }
        if (isExtSelect && sqlLower.includes('from web_rc_recordatorios_vencimientos a')) {
            let rows = state.web_rc_recordatorios_vencimientos.slice();
            if (sqlLower.includes('where a.id = ?')) {
                rows = rows.filter((v) => Number(v.id) === Number(params[0]));
            } else if (sqlLower.includes('where b.id = ?') || sqlLower.includes('and b.id = ?')) {
                const recId = Number(params[0]);
                rows = rows.filter((v) => Number(v.id_recordatorio) === recId);
            } else if (sqlLower.includes('a.vencimiento between ? and ?')) {
                const [desde, hasta] = params;
                rows = rows.filter((v) => ymd(v.vencimiento) >= ymd(desde) && ymd(v.vencimiento) <= ymd(hasta));
                if (sqlLower.includes("a.estado = 'p'")) rows = rows.filter((v) => v.estado === 'P');
                else if (sqlLower.includes("a.estado = 'c'")) rows = rows.filter((v) => v.estado === 'C');
            } else if (sqlLower.includes('a.vencimiento <= ?')) {
                rows = rows.filter((v) => v.estado === 'P' && ymd(v.vencimiento) <= ymd(params[0]));
            }
            return [rows.map((v) => {
                const r = state.web_rc_recordatorios.find((rec) => Number(rec.id) === Number(v.id_recordatorio)) || {};
                const u = state.web_rc_ubicaciones.find((ub) => Number(ub.id) === Number(r.id_ubicacion)) || {};
                return {
                    id: v.id,
                    id_recordatorio: v.id_recordatorio,
                    vencimiento: v.vencimiento,
                    vence: v.vencimiento,
                    estado: v.estado === 'P' ? 'PENDIENTE' : 'CANCELADO',
                    legacy_estado: v.estado,
                    fecha_cancelacion: v.fecha_cancelacion,
                    forma_pago: v.forma_pago,
                    descripcion: r.descripcion || '',
                    monto: r.monto || 0,
                    id_ubicacion: r.id_ubicacion || null,
                    observacion: r.forma_pago || '',
                    ubicacion: u.descripcion || ''
                };
            })];
        }
        if (isExtSelect && sqlLower.includes('from web_rc_recordatorios_vencimientos')) {
            if (sqlLower.includes('where id_recordatorio = ?')) {
                const rows = state.web_rc_recordatorios_vencimientos.filter((v) => Number(v.id_recordatorio) === Number(params[0]));
                if (sqlLower.includes('count(*)')) return [[{ cont: rows.filter((v) => v.estado === 'C').length }]];
                return [rows];
            }
            if (sqlLower.includes('where id = ?')) {
                return [state.web_rc_recordatorios_vencimientos.filter((v) => Number(v.id) === Number(params[0]))];
            }
            return [state.web_rc_recordatorios_vencimientos];
        }
        if (isExtSelect && sqlLower.includes('from web_rc_recordatorios')) {
            if (sqlLower.includes('where id = ?')) {
                return [state.web_rc_recordatorios.filter((r) => Number(r.id) === Number(params[0]))];
            }
            return [state.web_rc_recordatorios];
        }

        return [[]];
    };

    const runAccountingQuery = async () => [[]];

    let txQueue = Promise.resolve();
    const acquireTxLock = () => {
        let releaseFn;
        const next = new Promise((resolve) => { releaseFn = resolve; });
        const prev = txQueue;
        txQueue = txQueue.then(() => next, () => next);
        return prev.then(() => releaseFn);
    };

    const pool = {
        query: runQuery,
        getConnection: async () => {
            const releaseLock = await acquireTxLock();
            let released = false;
            const snapshot = JSON.stringify(state);
            return {
                query: runQuery,
                beginTransaction: async () => {},
                commit: async () => {},
                rollback: async () => {
                    const restored = JSON.parse(snapshot);
                    Object.keys(restored).forEach((k) => { state[k] = restored[k]; });
                },
                release: () => {
                    if (!released) {
                        released = true;
                        releaseLock();
                    }
                }
            };
        },
        end: async () => {}
    };

    const externalPool = {
        query: runExternalQuery,
        getConnection: async () => {
            const snapshot = JSON.stringify(state);
            return {
                query: runExternalQuery,
                beginTransaction: async () => {},
                commit: async () => {},
                rollback: async () => {
                    const restored = JSON.parse(snapshot);
                    Object.keys(restored).forEach((k) => { state[k] = restored[k]; });
                },
                release: () => {}
            };
        },
        end: async () => {}
    };

    const accountingPool = {
        query: runAccountingQuery,
        end: async () => {}
    };

    return {
        pool,
        externalPool,
        accountingPool,
        getState: () => state,
        reset
    };
}

module.exports = {
    createUnifiedMockDb
};
