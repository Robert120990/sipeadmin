const path = require('path');
const mysql = require('mysql2/promise');
const {
    round2,
    parseStrictDBDate,
    computeMovementFingerprint
} = require('../services/bancosIntegrityService');

const DEFAULT_INFLOW_CODES = ['01', '03'];
const DEFAULT_OUTFLOW_CODES = ['02'];
const NATIVE_SIPE_CODES = ['RM', 'NA', 'NC', 'ND', 'CH', 'TR'];

/**
 * Parsea argumentos CLI en formato --flag o --flag=valor sin mutar el entorno global.
 */
function parseCliArgs(argv = []) {
    const args = Array.isArray(argv) ? argv : [];
    const parsed = {
        apply: false,
        cuentaId: null,
        empresaId: null,
        maxId: null,
        inflowCodes: [...DEFAULT_INFLOW_CODES],
        outflowCodes: [...DEFAULT_OUTFLOW_CODES],
        batchSize: 2000,
        createBackup: true,
        help: false
    };

    const parseCodeList = (raw) => {
        const list = String(raw || '')
            .split(',')
            .map(s => s.trim().toUpperCase())
            .filter(Boolean);
        return [...new Set(list)];
    };

    const parsePositiveInt = (raw, flagName) => {
        const num = Number.parseInt(String(raw || '').trim(), 10);
        if (!Number.isInteger(num) || num <= 0) {
            throw new Error(`Valor inválido para ${flagName}: "${raw}". Debe ser un entero positivo.`);
        }
        return num;
    };

    for (let i = 0; i < args.length; i++) {
        const token = String(args[i] || '').trim();
        if (!token) continue;

        if (token === '--help' || token === '-h') {
            parsed.help = true;
            continue;
        }
        if (token === '--apply') {
            parsed.apply = true;
            continue;
        }
        if (token === '--dry-run') {
            parsed.apply = false;
            continue;
        }
        if (token === '--no-backup') {
            parsed.createBackup = false;
            continue;
        }

        let flag = token;
        let value = null;
        const eqIdx = token.indexOf('=');
        if (eqIdx !== -1) {
            flag = token.slice(0, eqIdx);
            value = token.slice(eqIdx + 1);
        } else if (
            flag === '--cuenta-id' ||
            flag === '--empresa-id' ||
            flag === '--max-id' ||
            flag === '--inflow-codes' ||
            flag === '--outflow-codes' ||
            flag === '--batch-size'
        ) {
            if (i + 1 >= args.length) {
                throw new Error(`Falta valor para el argumento ${flag}.`);
            }
            value = String(args[++i]);
        }

        if (flag === '--cuenta-id') {
            parsed.cuentaId = parsePositiveInt(value, '--cuenta-id');
        } else if (flag === '--empresa-id') {
            parsed.empresaId = parsePositiveInt(value, '--empresa-id');
        } else if (flag === '--max-id') {
            parsed.maxId = parsePositiveInt(value, '--max-id');
        } else if (flag === '--inflow-codes') {
            const codes = parseCodeList(value);
            if (codes.length === 0) throw new Error('--inflow-codes no puede quedar vacío.');
            parsed.inflowCodes = codes;
        } else if (flag === '--outflow-codes') {
            const codes = parseCodeList(value);
            if (codes.length === 0) throw new Error('--outflow-codes no puede quedar vacío.');
            parsed.outflowCodes = codes;
        } else if (flag === '--batch-size') {
            const rawBatch = parsePositiveInt(value, '--batch-size');
            parsed.batchSize = Math.min(10000, Math.max(100, rawBatch));
        } else {
            throw new Error(`Argumento no reconocido: ${token}. Use --help para ver opciones.`);
        }
    }

    return parsed;
}

/**
 * Determina de forma pura y determinística si un movimiento legado debe intercambiar cargo ↔ abono.
 */
function classifyMovementForSignFix(row, options = {}) {
    const inflowSet = new Set(
        (options.inflowCodes || DEFAULT_INFLOW_CODES)
            .map(c => String(c || '').trim().toUpperCase())
            .filter(Boolean)
    );
    const outflowSet = new Set(
        (options.outflowCodes || DEFAULT_OUTFLOW_CODES)
            .map(c => String(c || '').trim().toUpperCase())
            .filter(Boolean)
    );

    const cargo = round2(row?.cargo || 0);
    const abono = round2(row?.abono || 0);
    const monto = round2(row?.monto || 0);

    if (!row || row.deleted_at) {
        return { shouldFix: false, reason: 'DELETED', newCargo: cargo, newAbono: abono, newMonto: monto };
    }
    if (row.transfer_group_id) {
        return { shouldFix: false, reason: 'NATIVE_TRANSFER', newCargo: cargo, newAbono: abono, newMonto: monto };
    }
    if (row.import_batch_id) {
        return { shouldFix: false, reason: 'NATIVE_IMPORT', newCargo: cargo, newAbono: abono, newMonto: monto };
    }

    const code = String(row.cod_remesa || '').trim().toUpperCase();
    if (NATIVE_SIPE_CODES.includes(code)) {
        return { shouldFix: false, reason: 'NATIVE_CODE', newCargo: cargo, newAbono: abono, newMonto: monto };
    }

    if (inflowSet.has(code)) {
        if (cargo > 0 && abono === 0) {
            return {
                shouldFix: true,
                directionChange: 'CARGO_TO_ABONO',
                newCargo: 0,
                newAbono: cargo,
                newMonto: monto > 0 ? monto : cargo
            };
        }
        return { shouldFix: false, reason: 'ALREADY_CORRECT_OR_AMBIGUOUS', newCargo: cargo, newAbono: abono, newMonto: monto };
    }

    if (outflowSet.has(code)) {
        if (abono > 0 && cargo === 0) {
            return {
                shouldFix: true,
                directionChange: 'ABONO_TO_CARGO',
                newCargo: abono,
                newAbono: 0,
                newMonto: monto > 0 ? monto : abono
            };
        }
        return { shouldFix: false, reason: 'ALREADY_CORRECT_OR_AMBIGUOUS', newCargo: cargo, newAbono: abono, newMonto: monto };
    }

    return {
        shouldFix: false,
        reason: code ? 'UNKNOWN_CODE' : 'NULL_CODE',
        newCargo: cargo,
        newAbono: abono,
        newMonto: monto
    };
}

/**
 * Construye un nombre seguro de tabla de respaldo con timestamp UTC/local y validación estricta.
 */
function buildBackupTableName(date = new Date()) {
    const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    const stamp =
        `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
        `_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
    const name = `movimientos_bancarios_bak_signfix_${stamp}`;
    if (!/^[a-z0-9_]+$/.test(name)) {
        throw new Error(`Nombre de tabla de respaldo inválido: ${name}`);
    }
    return name;
}

function buildSqlFilters({ cuentaId, empresaId, maxId, hasDeletedAt }) {
    const clauses = [];
    const params = [];
    if (hasDeletedAt) {
        clauses.push('m.deleted_at IS NULL');
    }
    if (Number.isInteger(cuentaId) && cuentaId > 0) {
        clauses.push('m.cuenta_bancaria_id = ?');
        params.push(cuentaId);
    }
    if (Number.isInteger(empresaId) && empresaId > 0) {
        clauses.push('m.empresa_id = ?');
        params.push(empresaId);
    }
    if (Number.isInteger(maxId) && maxId > 0) {
        clauses.push('m.id <= ?');
        params.push(maxId);
    }
    return {
        whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
        params
    };
}

function normalizeCodeList(codes, fallback) {
    const list = Array.isArray(codes) && codes.length > 0 ? codes : fallback;
    return [...new Set(list.map(c => String(c || '').trim().toUpperCase()).filter(Boolean))];
}

function makePlaceholders(count) {
    return Array.from({ length: count }, () => '?').join(', ');
}

function buildRollbackSql(backupTable, { hasFingerprint, hasVersion }) {
    if (!backupTable) return null;
    const setClauses = [
        'm.cargo = b.cargo',
        'm.abono = b.abono',
        'm.monto = b.monto'
    ];
    if (hasFingerprint) setClauses.push('m.fingerprint = b.fingerprint');
    if (hasVersion) setClauses.push('m.version = b.version');
    return `UPDATE movimientos_bancarios m INNER JOIN ${backupTable} b ON b.id = m.id SET ${setClauses.join(', ')};`;
}

async function runWithOptionalTransaction(conn, fn) {
    const hasTx = typeof conn.beginTransaction === 'function' &&
        typeof conn.commit === 'function' &&
        typeof conn.rollback === 'function';
    if (!hasTx) {
        return fn(conn);
    }
    await conn.beginTransaction();
    try {
        const res = await fn(conn);
        await conn.commit();
        return res;
    } catch (err) {
        try {
            await conn.rollback();
        } catch (_) { /* ignore rollback error */ }
        throw err;
    }
}

/**
 * Diagnostica y (opcionalmente con apply=true) corrige movimientos legados invertidos
 * usando convención de extracto bancario (abono=+, cargo=-).
 */
async function runSignFix(db, options = {}) {
    const apply = Boolean(options.apply);
    const cuentaId = Number.isInteger(options.cuentaId) && options.cuentaId > 0 ? options.cuentaId : null;
    const empresaId = Number.isInteger(options.empresaId) && options.empresaId > 0 ? options.empresaId : null;
    const maxId = Number.isInteger(options.maxId) && options.maxId > 0 ? options.maxId : null;
    const inflowCodes = normalizeCodeList(options.inflowCodes, DEFAULT_INFLOW_CODES);
    const outflowCodes = normalizeCodeList(options.outflowCodes, DEFAULT_OUTFLOW_CODES);
    const batchSize = Math.min(10000, Math.max(100, Number.parseInt(options.batchSize, 10) || 2000));
    const createBackup = options.createBackup !== false;

    const [movCols] = await db.query('SHOW COLUMNS FROM movimientos_bancarios');
    const movColSet = new Set((movCols || []).map(c => String(c.Field || '').toLowerCase()));
    const hasDeletedAt = movColSet.has('deleted_at');
    const hasTransferGroup = movColSet.has('transfer_group_id');
    const hasImportBatch = movColSet.has('import_batch_id');
    const hasFingerprint = movColSet.has('fingerprint');
    const hasVersion = movColSet.has('version');

    const [ctaCols] = await db.query('SHOW COLUMNS FROM cuentas_bancarias');
    const ctaColSet = new Set((ctaCols || []).map(c => String(c.Field || '').toLowerCase()));
    const hasSaldoInicial = ctaColSet.has('saldo_inicial');
    const hasFechaSaldoInicial = ctaColSet.has('fecha_saldo_inicial');

    const [chkCols] = await db.query('SHOW COLUMNS FROM cheques').catch(() => [[]]);
    const chkColSet = new Set((chkCols || []).map(c => String(c.Field || '').toLowerCase()));
    const hasChkDeletedAt = chkColSet.has('deleted_at');

    const { whereSql: globalWhereSql, params: globalParams } = buildSqlFilters({
        cuentaId,
        empresaId,
        maxId,
        hasDeletedAt
    });

    const [summaryRows] = await db.query(
        `SELECT UPPER(TRIM(tr.codigo)) AS tr_cod,
                tr.descripcion AS tr_desc,
                COUNT(*) AS total,
                SUM(CASE WHEN COALESCE(m.cargo, 0) > 0 AND COALESCE(m.abono, 0) = 0 THEN 1 ELSE 0 END) AS solo_cargo,
                SUM(CASE WHEN COALESCE(m.abono, 0) > 0 AND COALESCE(m.cargo, 0) = 0 THEN 1 ELSE 0 END) AS solo_abono,
                SUM(CASE WHEN NOT (
                    (COALESCE(m.cargo, 0) > 0 AND COALESCE(m.abono, 0) = 0) OR
                    (COALESCE(m.abono, 0) > 0 AND COALESCE(m.cargo, 0) = 0)
                ) THEN 1 ELSE 0 END) AS ambos_o_cero
         FROM movimientos_bancarios m
         LEFT JOIN tipos_remesas tr ON m.tipo_remesa_id = tr.id
         ${globalWhereSql}
         GROUP BY UPPER(TRIM(tr.codigo)), tr.descripcion
         ORDER BY total DESC`,
        globalParams
    );

    const recognizedCodes = new Set([...NATIVE_SIPE_CODES, ...inflowCodes, ...outflowCodes]);
    const codeSummary = [];
    const unknownOrNullCodes = [];

    for (const s of (summaryRows || [])) {
        const cod = s.tr_cod ? String(s.tr_cod).trim().toUpperCase() : null;
        const entry = {
            codigo: cod,
            descripcion: s.tr_desc || null,
            total: Number(s.total || 0),
            solo_cargo: Number(s.solo_cargo || 0),
            solo_abono: Number(s.solo_abono || 0),
            ambos_o_cero: Number(s.ambos_o_cero || 0)
        };
        codeSummary.push(entry);
        if (!cod || !recognizedCodes.has(cod)) {
            const unknownCond = cod ? 'UPPER(TRIM(tr.codigo)) = ?' : 'm.tipo_remesa_id IS NULL';
            const unknownExtraParams = cod ? [cod] : [];
            const basePrefix = globalWhereSql ? `${globalWhereSql} AND` : 'WHERE';
            const [sampleUnknown] = await db.query(
                `SELECT m.id, m.fecha, m.documento, m.concepto, m.cargo, m.abono
                 FROM movimientos_bancarios m
                 LEFT JOIN tipos_remesas tr ON m.tipo_remesa_id = tr.id
                 ${basePrefix} ${unknownCond}
                 ORDER BY m.fecha DESC, m.id DESC
                 LIMIT 5`,
                [...globalParams, ...unknownExtraParams]
            );
            unknownOrNullCodes.push({
                ...entry,
                muestras: (sampleUnknown || []).map(r => ({
                    id: Number(r.id),
                    fecha: parseStrictDBDate(r.fecha) || String(r.fecha || '').slice(0, 10),
                    documento: r.documento || '',
                    concepto: r.concepto || '',
                    cargo: round2(r.cargo || 0),
                    abono: round2(r.abono || 0)
                }))
            });
        }
    }

    const candClauses = [];
    const candParams = [];
    if (hasDeletedAt) candClauses.push('m.deleted_at IS NULL');
    if (hasTransferGroup) candClauses.push('m.transfer_group_id IS NULL');
    if (hasImportBatch) candClauses.push('m.import_batch_id IS NULL');
    if (cuentaId) {
        candClauses.push('m.cuenta_bancaria_id = ?');
        candParams.push(cuentaId);
    }
    if (empresaId) {
        candClauses.push('m.empresa_id = ?');
        candParams.push(empresaId);
    }
    if (maxId) {
        candClauses.push('m.id <= ?');
        candParams.push(maxId);
    }

    const directionClauses = [];
    const dirParams = [];
    if (inflowCodes.length > 0) {
        directionClauses.push(`(UPPER(TRIM(tr.codigo)) IN (${makePlaceholders(inflowCodes.length)}) AND COALESCE(m.cargo, 0) > 0 AND COALESCE(m.abono, 0) = 0)`);
        dirParams.push(...inflowCodes);
    }
    if (outflowCodes.length > 0) {
        directionClauses.push(`(UPPER(TRIM(tr.codigo)) IN (${makePlaceholders(outflowCodes.length)}) AND COALESCE(m.abono, 0) > 0 AND COALESCE(m.cargo, 0) = 0)`);
        dirParams.push(...outflowCodes);
    }

    let rawCandidates = [];
    if (directionClauses.length > 0) {
        candClauses.push(`(${directionClauses.join(' OR ')})`);
        candParams.push(...dirParams);

        const optSelectCols = [
            hasTransferGroup ? 'm.transfer_group_id' : 'NULL AS transfer_group_id',
            hasImportBatch ? 'm.import_batch_id' : 'NULL AS import_batch_id',
            hasDeletedAt ? 'm.deleted_at' : 'NULL AS deleted_at',
            hasVersion ? 'm.version' : '1 AS version'
        ].join(', ');

        const [rows] = await db.query(
            `SELECT m.id, m.empresa_id, m.cuenta_bancaria_id, m.fecha, m.documento, m.concepto,
                    m.monto, m.cargo, m.abono,
                    tr.codigo AS cod_remesa, tr.descripcion AS tipo_remesa_desc,
                    ${optSelectCols}
             FROM movimientos_bancarios m
             LEFT JOIN tipos_remesas tr ON m.tipo_remesa_id = tr.id
             WHERE ${candClauses.join(' AND ')}
             ORDER BY m.cuenta_bancaria_id ASC, m.id ASC`,
            candParams
        );
        rawCandidates = rows || [];
    }

    const plans = [];
    for (const row of rawCandidates) {
        const decision = classifyMovementForSignFix(row, { inflowCodes, outflowCodes });
        if (!decision.shouldFix) continue;

        const fechaYmd = parseStrictDBDate(row.fecha) || String(row.fecha || '').slice(0, 10);
        const newFingerprint = computeMovementFingerprint({
            cuentaBancariaId: row.cuenta_bancaria_id,
            fecha: fechaYmd,
            documento: row.documento,
            cargo: decision.newCargo,
            abono: decision.newAbono,
            concepto: row.concepto
        });

        plans.push({
            id: Number(row.id),
            empresa_id: Number(row.empresa_id),
            cuenta_bancaria_id: Number(row.cuenta_bancaria_id),
            fecha: fechaYmd,
            documento: row.documento || '',
            concepto: row.concepto || '',
            cod_remesa: String(row.cod_remesa || '').trim().toUpperCase(),
            tipo_remesa_desc: row.tipo_remesa_desc || '',
            oldCargo: round2(row.cargo || 0),
            oldAbono: round2(row.abono || 0),
            oldMonto: round2(row.monto || 0),
            newCargo: decision.newCargo,
            newAbono: decision.newAbono,
            newMonto: decision.newMonto,
            directionChange: decision.directionChange,
            newFingerprint
        });
    }

    const affectedAccountIds = [...new Set(plans.map(p => p.cuenta_bancaria_id))];
    const accountProjections = [];

    if (affectedAccountIds.length > 0) {
        const ctaFields = [
            'cb.id',
            'cb.empresa_id',
            'cb.numero',
            'cb.nombre',
            hasSaldoInicial ? 'cb.saldo_inicial' : '0 AS saldo_inicial',
            hasFechaSaldoInicial ? 'cb.fecha_saldo_inicial' : 'NULL AS fecha_saldo_inicial'
        ].join(', ');

        const [ctaRows] = await db.query(
            `SELECT ${ctaFields} FROM cuentas_bancarias cb WHERE cb.id IN (${makePlaceholders(affectedAccountIds.length)}) ORDER BY cb.id ASC`,
            affectedAccountIds
        );

        const ctaMap = new Map((ctaRows || []).map(c => [Number(c.id), c]));
        const plansByAccount = new Map();
        for (const p of plans) {
            if (!plansByAccount.has(p.cuenta_bancaria_id)) {
                plansByAccount.set(p.cuenta_bancaria_id, []);
            }
            plansByAccount.get(p.cuenta_bancaria_id).push(p);
        }

        for (const cid of affectedAccountIds) {
            const cta = ctaMap.get(cid) || { id: cid, numero: String(cid), nombre: '', saldo_inicial: 0, fecha_saldo_inicial: null };
            const saldoInicial = round2(cta.saldo_inicial || 0);
            const floorDate = cta.fecha_saldo_inicial ? parseStrictDBDate(cta.fecha_saldo_inicial) : null;

            const movParams = [cid];
            let movFloorSql = '';
            if (floorDate) {
                movFloorSql = ' AND fecha >= ?';
                movParams.push(floorDate);
            }
            const [[movAgg]] = await db.query(
                `SELECT COALESCE(SUM(abono), 0) AS total_abonos, COALESCE(SUM(cargo), 0) AS total_cargos
                 FROM movimientos_bancarios
                 WHERE cuenta_bancaria_id = ?${hasDeletedAt ? ' AND deleted_at IS NULL' : ''}${movFloorSql}`,
                movParams
            );

            const chkParams = [cid];
            let chkFloorSql = '';
            if (floorDate) {
                chkFloorSql = ' AND fecha >= ?';
                chkParams.push(floorDate);
            }
            const [[chkAgg]] = await db.query(
                `SELECT COALESCE(SUM(valor), 0) AS total_cheques
                 FROM cheques
                 WHERE cuenta_bancaria_id = ?
                   ${hasChkDeletedAt ? 'AND deleted_at IS NULL' : ''}
                   AND cheque_anulado = FALSE
                   AND fue_noemitido = FALSE
                   AND es_reservado = FALSE${chkFloorSql}`,
                chkParams
            ).catch(() => [[{ total_cheques: 0 }]]);

            const curAbonos = round2(movAgg?.total_abonos || 0);
            const curCargos = round2(movAgg?.total_cargos || 0);
            const curCheques = round2(chkAgg?.total_cheques || 0);
            const saldoActual = round2(saldoInicial + curAbonos - curCargos - curCheques);

            const ctaPlans = plansByAccount.get(cid) || [];
            let deltaAbonosAll = 0;
            let deltaCargosAll = 0;
            let deltaAbonosInSaldo = 0;
            let deltaCargosInSaldo = 0;
            let cargoToAbonoCount = 0;
            let abonoToCargoCount = 0;

            for (const p of ctaPlans) {
                const dAb = round2(p.newAbono - p.oldAbono);
                const dCa = round2(p.newCargo - p.oldCargo);
                deltaAbonosAll = round2(deltaAbonosAll + dAb);
                deltaCargosAll = round2(deltaCargosAll + dCa);
                if (!floorDate || (p.fecha && p.fecha >= floorDate)) {
                    deltaAbonosInSaldo = round2(deltaAbonosInSaldo + dAb);
                    deltaCargosInSaldo = round2(deltaCargosInSaldo + dCa);
                }
                if (p.directionChange === 'CARGO_TO_ABONO') cargoToAbonoCount++;
                else abonoToCargoCount++;
            }

            const saldoProyectado = round2(
                saldoInicial + (curAbonos + deltaAbonosInSaldo) - (curCargos + deltaCargosInSaldo) - curCheques
            );

            accountProjections.push({
                cuenta_bancaria_id: cid,
                numero: cta.numero || '',
                nombre: cta.nombre || '',
                filas_a_corregir: ctaPlans.length,
                cargo_a_abono: cargoToAbonoCount,
                abono_a_cargo: abonoToCargoCount,
                delta_abonos: deltaAbonosAll,
                delta_cargos: deltaCargosAll,
                saldo_chequera_actual: saldoActual,
                saldo_chequera_proyectado: saldoProyectado,
                delta_saldo: round2(saldoProyectado - saldoActual)
            });
        }
    }

    const sampleRows = plans.slice(0, 15).map(p => ({
        id: p.id,
        cuenta_bancaria_id: p.cuenta_bancaria_id,
        fecha: p.fecha,
        cod_remesa: p.cod_remesa,
        documento: p.documento,
        concepto: p.concepto.slice(0, 48),
        cambio: p.directionChange,
        cargo_antes: p.oldCargo,
        abono_antes: p.oldAbono,
        cargo_despues: p.newCargo,
        abono_despues: p.newAbono
    }));

    if (!apply || plans.length === 0) {
        return {
            applied: false,
            backupTable: null,
            rollbackSql: null,
            totalCandidates: plans.length,
            updatedCount: 0,
            inflowCodes,
            outflowCodes,
            codeSummary,
            unknownOrNullCodes,
            accountProjections,
            sampleRows
        };
    }

    let backupTable = null;
    if (createBackup) {
        backupTable = buildBackupTableName(options.now || new Date());
        await db.query(`CREATE TABLE ${backupTable} LIKE movimientos_bancarios`);
        for (let i = 0; i < plans.length; i += batchSize) {
            const chunkIds = plans.slice(i, i + batchSize).map(p => p.id);
            await db.query(
                `INSERT INTO ${backupTable} SELECT * FROM movimientos_bancarios WHERE id IN (${makePlaceholders(chunkIds.length)})`,
                chunkIds
            );
        }
    }

    const updateCols = ['cargo = ?', 'abono = ?', 'monto = ?'];
    if (hasFingerprint) updateCols.push('fingerprint = ?');
    if (hasVersion) updateCols.push('version = COALESCE(version, 1) + 1');
    const updateSql = `UPDATE movimientos_bancarios SET ${updateCols.join(', ')} WHERE id = ?`;

    let updatedCount = 0;
    const poolOrConn = typeof db.getConnection === 'function' ? await db.getConnection() : db;
    const shouldRelease = typeof db.getConnection === 'function' && poolOrConn && typeof poolOrConn.release === 'function';

    try {
        for (let i = 0; i < plans.length; i += batchSize) {
            const chunk = plans.slice(i, i + batchSize);
            await runWithOptionalTransaction(poolOrConn, async (conn) => {
                for (const p of chunk) {
                    const params = [p.newCargo, p.newAbono, p.newMonto];
                    if (hasFingerprint) params.push(p.newFingerprint);
                    params.push(p.id);
                    const [res] = await conn.query(updateSql, params);
                    updatedCount += Number(res?.affectedRows || 0);
                }
            });
        }

        try {
            await poolOrConn.query(
                `INSERT INTO bancos_auditoria_detalle
                    (cuenta_bancaria_id, entidad, entidad_id, accion, user_id, username, motivo, metadata_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    cuentaId || null,
                    'movimientos_bancarios',
                    null,
                    'BULK_FIX_LEGACY_SIGN',
                    null,
                    'script_fix_sign',
                    'Corrección masiva de signos invertidos desde migración legada db_system_rrs',
                    JSON.stringify({
                        backup_table: backupTable,
                        updated_count: updatedCount,
                        inflow_codes: inflowCodes,
                        outflow_codes: outflowCodes,
                        cuentas: accountProjections
                    })
                ]
            );
        } catch (auditErr) {
            if (!auditErr || (auditErr.code !== 'ER_NO_SUCH_TABLE' && auditErr.errno !== 1146)) {
                throw auditErr;
            }
        }
    } finally {
        if (shouldRelease) {
            poolOrConn.release();
        }
    }

    const rollbackSql = buildRollbackSql(backupTable, { hasFingerprint, hasVersion });

    return {
        applied: true,
        backupTable,
        rollbackSql,
        totalCandidates: plans.length,
        updatedCount,
        inflowCodes,
        outflowCodes,
        codeSummary,
        unknownOrNullCodes,
        accountProjections,
        sampleRows
    };
}

function buildDbConfigFromEnv() {
    if (process.env.DATABASE_URL) {
        return process.env.DATABASE_URL;
    }
    return {
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'db_sipe_admin',
        port: Number(process.env.DB_PORT || 3306),
        connectTimeout: 10000
    };
}

function printHelp() {
    console.log([
        'Uso: node scripts/fix_inverted_legacy_movimientos.js [opciones]',
        '',
        'Opciones:',
        '  --dry-run                Solo diagnostica y muestra saldos proyectados (por defecto)',
        '  --apply                  Crea respaldo e intercambia cargo <-> abono en movimientos legados',
        '  --cuenta-id=<id>         Limita a una cuenta bancaria específica',
        '  --empresa-id=<id>        Limita a una empresa específica',
        '  --max-id=<id>            Limita a movimientos con id <= <id>',
        '  --inflow-codes=01,03     Códigos legados de ingresos almacenados en cargo (default: 01,03)',
        '  --outflow-codes=02       Códigos legados de egresos almacenados en abono (default: 02)',
        '  --batch-size=<n>         Tamaño de lote transaccional entre 100 y 10000 (default: 2000)',
        '  --no-backup              Omite creación de tabla de respaldo (no recomendado)',
        '  --help, -h               Muestra esta ayuda'
    ].join('\n'));
}

async function main() {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    const cli = parseCliArgs(process.argv.slice(2));
    if (cli.help) {
        printHelp();
        return;
    }

    const pool = mysql.createPool({
        ...(typeof buildDbConfigFromEnv() === 'string'
            ? { uri: buildDbConfigFromEnv() }
            : buildDbConfigFromEnv()),
        connectionLimit: 4
    });

    try {
        console.log(`\n[FixLegacySign] Modo: ${cli.apply ? 'APPLY (ESCRITURA + RESPALDO)' : 'DRY-RUN (SOLO LECTURA)'}`);
        console.log(`[FixLegacySign] Inflow codes (cargo -> abono): ${cli.inflowCodes.join(', ')} | Outflow codes (abono -> cargo): ${cli.outflowCodes.join(', ')}`);

        const report = await runSignFix(pool, cli);

        console.log('\n=== Distribución actual por tipo de remesa ===');
        if (report.codeSummary.length > 0) console.table(report.codeSummary);
        else console.log('(Sin filas activas para los filtros indicados)');

        if (report.unknownOrNullCodes.length > 0) {
            console.log('\n⚠️  Códigos desconocidos o NULL detectados (NO serán modificados automáticamente):');
            console.table(report.unknownOrNullCodes.map(({ muestras, ...rest }) => ({ ...rest, muestras: muestras.length })));
        }

        console.log(`\n=== Candidatos a corregir: ${report.totalCandidates} ===`);
        if (report.sampleRows.length > 0) {
            console.log('\n=== Muestra (primeras 15 filas) ===');
            console.table(report.sampleRows);
        }

        if (report.accountProjections.length > 0) {
            console.log('\n=== Impacto proyectado por cuenta bancaria ===');
            console.table(report.accountProjections);
        }

        if (report.applied) {
            console.log(`\n✅ Actualización completada: ${report.updatedCount} fila(s) corregida(s).`);
            if (report.backupTable) {
                console.log(`📦 Tabla de respaldo: ${report.backupTable}`);
                console.log(`↩️  SQL de reversión: ${report.rollbackSql}`);
            }
        } else {
            console.log('\nℹ️  Dry-run completado sin cambios en la base de datos. Ejecuta con --apply para aplicar.');
        }
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error('[FixLegacySign] Error:', err.message);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_INFLOW_CODES,
    DEFAULT_OUTFLOW_CODES,
    NATIVE_SIPE_CODES,
    parseCliArgs,
    classifyMovementForSignFix,
    buildBackupTableName,
    runSignFix
};
