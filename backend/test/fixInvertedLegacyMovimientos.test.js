const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    parseCliArgs,
    classifyMovementForSignFix,
    buildBackupTableName,
    runSignFix
} = require('../scripts/fix_inverted_legacy_movimientos');
const {
    normalizeMovementDirection,
    computeMovementFingerprint,
    round2
} = require('../services/bancosIntegrityService');
const { extractBankStatementWithGemini } = require('../services/bankStatementParserService');

const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

function createInMemoryMockDb() {
    const state = {
        cuentas_bancarias: [
            { id: 8, empresa_id: 56, numero: '10000060002375', nombre: 'CDS-40179-PUMA COSTA DEL SOL', saldo_inicial: 10000, fecha_saldo_inicial: '2026-11-01' },
            { id: 9, empresa_id: 56, numero: '10000060002374', nombre: 'CUENTA SECUNDARIA', saldo_inicial: 500, fecha_saldo_inicial: null }
        ],
        tipos_remesas: [
            { id: 1, empresa_id: 56, codigo: '01', descripcion: 'INGRESO LEGADO' },
            { id: 2, empresa_id: 56, codigo: '02', descripcion: 'EGRESO LEGADO' },
            { id: 3, empresa_id: 56, codigo: '03', descripcion: 'NOTA CREDITO LEGADA' },
            { id: 4, empresa_id: 56, codigo: 'RM', descripcion: 'REMESA DIARIA' },
            { id: 5, empresa_id: 56, codigo: 'NC', descripcion: 'NOTA DE CARGO' },
            { id: 6, empresa_id: 56, codigo: 'XX', descripcion: 'CODIGO DESCONOCIDO' }
        ],
        movimientos_bancarios: [
            // Legados invertidos en cuenta 8
            {
                id: 1001, empresa_id: 56, cuenta_bancaria_id: 8, fecha: '2026-11-26',
                documento: 'C21114841', concepto: 'PUMA COSTA DEL SOL - 26/11/2026',
                monto: 10123.78, cargo: 10123.78, abono: 0, tipo_remesa_id: 1,
                transfer_group_id: null, import_batch_id: null, deleted_at: null,
                fingerprint: 'old-fp-1001', version: 1
            },
            {
                id: 1002, empresa_id: 56, cuenta_bancaria_id: 8, fecha: '2026-11-26',
                documento: '60024303', concepto: 'COSTA DEL SOL REMESA CLIENTE CHINO',
                monto: 1000.00, cargo: 1000.00, abono: 0, tipo_remesa_id: 3,
                transfer_group_id: null, import_batch_id: null, deleted_at: null,
                fingerprint: 'old-fp-1002', version: 1
            },
            {
                id: 1003, empresa_id: 56, cuenta_bancaria_id: 8, fecha: '2026-11-26',
                documento: '59996405', concepto: 'PAGO DE PIPA CCF# 67175',
                monto: 29971.67, cargo: 0, abono: 29971.67, tipo_remesa_id: 2,
                transfer_group_id: null, import_batch_id: null, deleted_at: null,
                fingerprint: 'old-fp-1003', version: 1
            },
            // Nativo SIPE correcto en cuenta 8 (no debe tocarse)
            {
                id: 1004, empresa_id: 56, cuenta_bancaria_id: 8, fecha: '2026-11-27',
                documento: '4001480', concepto: 'REMESA CUENTA CORRIENTE SERSAPROSA',
                monto: 10349.75, cargo: 0, abono: 10349.75, tipo_remesa_id: 4,
                transfer_group_id: null, import_batch_id: null, deleted_at: null,
                fingerprint: 'native-fp-1004', version: 1
            },
            // Ya correcto con código 01 (no debe tocarse)
            {
                id: 1005, empresa_id: 56, cuenta_bancaria_id: 8, fecha: '2026-11-27',
                documento: '9999001', concepto: 'REMESA YA CORRECTA',
                monto: 500.00, cargo: 0, abono: 500.00, tipo_remesa_id: 1,
                transfer_group_id: null, import_batch_id: null, deleted_at: null,
                fingerprint: 'ok-fp-1005', version: 1
            },
            // Transferencia nativa y fila de extracto importado (no deben tocarse aunque trajeran código 01/02)
            {
                id: 1006, empresa_id: 56, cuenta_bancaria_id: 8, fecha: '2026-11-27',
                documento: 'TFB000000000001', concepto: 'TRANSFERENCIA INTERNA',
                monto: 250.00, cargo: 250.00, abono: 0, tipo_remesa_id: 1,
                transfer_group_id: 'TFB000000000001', import_batch_id: null, deleted_at: null,
                fingerprint: 'tf-fp-1006', version: 1
            },
            {
                id: 1007, empresa_id: 56, cuenta_bancaria_id: 8, fecha: '2026-11-27',
                documento: 'IMP-1', concepto: 'FILA IMPORTADA DE EXTRACTO',
                monto: 300.00, cargo: 300.00, abono: 0, tipo_remesa_id: 1,
                transfer_group_id: null, import_batch_id: 77, deleted_at: null,
                fingerprint: 'imp-fp-1007', version: 1
            },
            // Eliminado soft-delete y código desconocido/NULL (no deben mutarse)
            {
                id: 1008, empresa_id: 56, cuenta_bancaria_id: 8, fecha: '2026-11-25',
                documento: 'DEL-1', concepto: 'ELIMINADO',
                monto: 100.00, cargo: 100.00, abono: 0, tipo_remesa_id: 1,
                transfer_group_id: null, import_batch_id: null, deleted_at: '2026-11-26 10:00:00',
                fingerprint: 'del-fp-1008', version: 1
            },
            {
                id: 1009, empresa_id: 56, cuenta_bancaria_id: 8, fecha: '2026-11-25',
                documento: 'UNK-1', concepto: 'MOVIMIENTO CODIGO DESCONOCIDO',
                monto: 50.00, cargo: 50.00, abono: 0, tipo_remesa_id: 6,
                transfer_group_id: null, import_batch_id: null, deleted_at: null,
                fingerprint: 'unk-fp-1009', version: 1
            },
            {
                id: 1010, empresa_id: 56, cuenta_bancaria_id: 8, fecha: '2026-11-25',
                documento: 'NULL-1', concepto: 'MOVIMIENTO SIN TIPO REMESA',
                monto: 25.00, cargo: 25.00, abono: 0, tipo_remesa_id: null,
                transfer_group_id: null, import_batch_id: null, deleted_at: null,
                fingerprint: 'null-fp-1010', version: 1
            },
            // Fila anterior a fecha_saldo_inicial (2026-11-01) en cuenta 8
            {
                id: 1011, empresa_id: 56, cuenta_bancaria_id: 8, fecha: '2026-10-20',
                documento: 'PRE-1', concepto: 'REMESA HISTORICA PREVIA AL CORTE',
                monto: 800.00, cargo: 800.00, abono: 0, tipo_remesa_id: 1,
                transfer_group_id: null, import_batch_id: null, deleted_at: null,
                fingerprint: 'pre-fp-1011', version: 1
            },
            // Otra cuenta (cuenta 9) para verificar filtros por cuenta
            {
                id: 2001, empresa_id: 56, cuenta_bancaria_id: 9, fecha: '2026-11-26',
                documento: 'OTRA-1', concepto: 'REMESA CUENTA 9',
                monto: 400.00, cargo: 400.00, abono: 0, tipo_remesa_id: 1,
                transfer_group_id: null, import_batch_id: null, deleted_at: null,
                fingerprint: 'fp-2001', version: 1
            }
        ],
        cheques: [
            { id: 1, cuenta_bancaria_id: 8, fecha: '2026-11-20', valor: 200.00, deleted_at: null, cheque_anulado: false, fue_noemitido: false, es_reservado: false }
        ],
        backups: {},
        auditLogs: [],
        writes: []
    };

    const getRemesa = (id) => state.tipos_remesas.find(t => t.id === id) || null;

    const query = async (rawSql, params = []) => {
        const sql = String(rawSql || '').replace(/\s+/g, ' ').trim();
        const lower = sql.toLowerCase();

        if (lower.startsWith('show columns from movimientos_bancarios')) {
            return [[
                { Field: 'id' }, { Field: 'empresa_id' }, { Field: 'cuenta_bancaria_id' },
                { Field: 'fecha' }, { Field: 'documento' }, { Field: 'concepto' },
                { Field: 'monto' }, { Field: 'cargo' }, { Field: 'abono' },
                { Field: 'tipo_remesa_id' }, { Field: 'deleted_at' },
                { Field: 'transfer_group_id' }, { Field: 'import_batch_id' },
                { Field: 'fingerprint' }, { Field: 'version' }
            ]];
        }
        if (lower.startsWith('show columns from cuentas_bancarias')) {
            return [[
                { Field: 'id' }, { Field: 'empresa_id' }, { Field: 'numero' }, { Field: 'nombre' },
                { Field: 'saldo_inicial' }, { Field: 'fecha_saldo_inicial' }
            ]];
        }
        if (lower.startsWith('show columns from cheques')) {
            return [[{ Field: 'id' }, { Field: 'cuenta_bancaria_id' }, { Field: 'deleted_at' }]];
        }

        // Resumen global por tipo de remesa
        if (lower.includes('group by upper(trim(tr.codigo))')) {
            let rows = state.movimientos_bancarios.filter(m => !m.deleted_at);
            if (lower.includes('m.cuenta_bancaria_id = ?')) {
                rows = rows.filter(m => m.cuenta_bancaria_id === Number(params[0]));
            }
            const groups = new Map();
            for (const m of rows) {
                const tr = getRemesa(m.tipo_remesa_id);
                const cod = tr ? tr.codigo.toUpperCase() : null;
                const desc = tr ? tr.descripcion : null;
                const key = `${cod || 'NULL'}|${desc || ''}`;
                if (!groups.has(key)) {
                    groups.set(key, { tr_cod: cod, tr_desc: desc, total: 0, solo_cargo: 0, solo_abono: 0, ambos_o_cero: 0 });
                }
                const g = groups.get(key);
                g.total++;
                if (m.cargo > 0 && m.abono === 0) g.solo_cargo++;
                else if (m.abono > 0 && m.cargo === 0) g.solo_abono++;
                else g.ambos_o_cero++;
            }
            return [[...groups.values()]];
        }

        // Muestras de desconocidos / NULL
        if (lower.includes('order by m.fecha desc, m.id desc limit 5')) {
            let rows = state.movimientos_bancarios.filter(m => !m.deleted_at);
            if (lower.includes('m.tipo_remesa_id is null')) {
                rows = rows.filter(m => m.tipo_remesa_id === null);
            } else if (lower.includes('upper(trim(tr.codigo)) = ?')) {
                const targetCod = String(params[params.length - 1] || '').toUpperCase();
                rows = rows.filter(m => getRemesa(m.tipo_remesa_id)?.codigo?.toUpperCase() === targetCod);
            }
            return [rows.slice(0, 5)];
        }

        // Candidatos a corregir
        if (lower.includes('from movimientos_bancarios m') && lower.includes('order by m.cuenta_bancaria_id asc, m.id asc')) {
            let rows = state.movimientos_bancarios.filter(m => !m.deleted_at && !m.transfer_group_id && !m.import_batch_id);
            let pIdx = 0;
            if (lower.includes('m.cuenta_bancaria_id = ?')) {
                const cFilter = Number(params[pIdx++]);
                rows = rows.filter(m => m.cuenta_bancaria_id === cFilter);
            }
            if (lower.includes('m.empresa_id = ?')) {
                const eFilter = Number(params[pIdx++]);
                rows = rows.filter(m => m.empresa_id === eFilter);
            }
            if (lower.includes('m.id <= ?')) {
                const idMax = Number(params[pIdx++]);
                rows = rows.filter(m => m.id <= idMax);
            }
            const remainingCodes = params.slice(pIdx).map(c => String(c).toUpperCase());
            const out = [];
            for (const m of rows) {
                const tr = getRemesa(m.tipo_remesa_id);
                const cod = tr ? tr.codigo.toUpperCase() : null;
                if (!cod || !remainingCodes.includes(cod)) continue;
                out.push({
                    ...m,
                    cod_remesa: tr.codigo,
                    tipo_remesa_desc: tr.descripcion
                });
            }
            return [out];
        }

        if (lower.includes('from cuentas_bancarias cb where cb.id in')) {
            const ids = new Set(params.map(Number));
            return [state.cuentas_bancarias.filter(c => ids.has(c.id))];
        }

        if (lower.includes('coalesce(sum(abono), 0) as total_abonos')) {
            const cid = Number(params[0]);
            const floor = params[1] || null;
            const rows = state.movimientos_bancarios.filter(m =>
                m.cuenta_bancaria_id === cid &&
                !m.deleted_at &&
                (!floor || m.fecha >= floor)
            );
            return [[{
                total_abonos: round2(rows.reduce((s, r) => s + r.abono, 0)),
                total_cargos: round2(rows.reduce((s, r) => s + r.cargo, 0))
            }]];
        }

        if (lower.includes('coalesce(sum(valor), 0) as total_cheques')) {
            const cid = Number(params[0]);
            const floor = params[1] || null;
            const rows = state.cheques.filter(ch =>
                ch.cuenta_bancaria_id === cid &&
                !ch.deleted_at &&
                !ch.cheque_anulado &&
                !ch.fue_noemitido &&
                !ch.es_reservado &&
                (!floor || ch.fecha >= floor)
            );
            return [[{ total_cheques: round2(rows.reduce((s, r) => s + r.valor, 0)) }]];
        }

        if (lower.startsWith('create table ')) {
            state.writes.push(sql);
            const tableName = sql.split(/\s+/)[2];
            state.backups[tableName] = [];
            return [{ affectedRows: 0 }];
        }

        if (lower.startsWith('insert into movimientos_bancarios_bak_signfix_')) {
            state.writes.push(sql);
            const tableName = sql.split(/\s+/)[2];
            const idSet = new Set(params.map(Number));
            const copied = state.movimientos_bancarios
                .filter(m => idSet.has(m.id))
                .map(m => ({ ...m }));
            state.backups[tableName] = [...(state.backups[tableName] || []), ...copied];
            return [{ affectedRows: copied.length }];
        }

        if (lower.startsWith('update movimientos_bancarios set ')) {
            state.writes.push(sql);
            const id = Number(params[params.length - 1]);
            const row = state.movimientos_bancarios.find(m => m.id === id);
            if (!row) return [{ affectedRows: 0 }];
            row.cargo = params[0];
            row.abono = params[1];
            row.monto = params[2];
            if (lower.includes('fingerprint = ?')) {
                row.fingerprint = params[3];
            }
            if (lower.includes('version = coalesce(version, 1) + 1')) {
                row.version = (row.version || 1) + 1;
            }
            return [{ affectedRows: 1 }];
        }

        if (lower.startsWith('insert into bancos_auditoria_detalle')) {
            state.writes.push(sql);
            state.auditLogs.push(params);
            return [{ insertId: state.auditLogs.length }];
        }

        throw new Error(`Consulta mock no manejada: ${sql}`);
    };

    const db = {
        state,
        query,
        async getConnection() {
            return {
                query,
                async beginTransaction() {},
                async commit() {},
                async rollback() {},
                release() {}
            };
        }
    };

    return db;
}

describe('Fix de signos invertidos en movimientos legados (convención extracto bancario)', () => {
    it('parseCliArgs interpreta flags con = o espacio, aplica defaults seguros y rechaza inválidos', () => {
        const def = parseCliArgs([]);
        assert.equal(def.apply, false);
        assert.deepEqual(def.inflowCodes, ['01', '03']);
        assert.deepEqual(def.outflowCodes, ['02']);
        assert.equal(def.batchSize, 2000);
        assert.equal(def.createBackup, true);

        const custom = parseCliArgs([
            '--apply',
            '--cuenta-id=8',
            '--empresa-id', '56',
            '--max-id=1744007',
            '--inflow-codes=01, 03,05',
            '--outflow-codes', '02,04',
            '--batch-size=99999',
            '--no-backup'
        ]);
        assert.equal(custom.apply, true);
        assert.equal(custom.cuentaId, 8);
        assert.equal(custom.empresaId, 56);
        assert.equal(custom.maxId, 1744007);
        assert.deepEqual(custom.inflowCodes, ['01', '03', '05']);
        assert.deepEqual(custom.outflowCodes, ['02', '04']);
        assert.equal(custom.batchSize, 10000);
        assert.equal(custom.createBackup, false);

        assert.throws(() => parseCliArgs(['--cuenta-id=abc']), /Valor inválido/);
        assert.throws(() => parseCliArgs(['--flag-inexistente']), /Argumento no reconocido/);
    });

    it('classifyMovementForSignFix protege nativos, eliminados, transferencias, importados y códigos desconocidos', () => {
        // 01 y 03 con cargo > 0 -> deben pasarse a abono
        const fix01 = classifyMovementForSignFix({ cod_remesa: '01', cargo: 10123.78, abono: 0, monto: 10123.78 });
        assert.equal(fix01.shouldFix, true);
        assert.equal(fix01.directionChange, 'CARGO_TO_ABONO');
        assert.equal(fix01.newCargo, 0);
        assert.equal(fix01.newAbono, 10123.78);

        const fix03 = classifyMovementForSignFix({ cod_remesa: '03', cargo: 1000, abono: 0, monto: 1000 });
        assert.equal(fix03.shouldFix, true);
        assert.equal(fix03.directionChange, 'CARGO_TO_ABONO');
        assert.equal(fix03.newAbono, 1000);

        // 02 con abono > 0 -> debe pasarse a cargo
        const fix02 = classifyMovementForSignFix({ cod_remesa: '02', cargo: 0, abono: 29971.67, monto: 29971.67 });
        assert.equal(fix02.shouldFix, true);
        assert.equal(fix02.directionChange, 'ABONO_TO_CARGO');
        assert.equal(fix02.newCargo, 29971.67);
        assert.equal(fix02.newAbono, 0);

        // Ya correctos -> no tocar
        assert.equal(classifyMovementForSignFix({ cod_remesa: '01', cargo: 0, abono: 500 }).shouldFix, false);
        assert.equal(classifyMovementForSignFix({ cod_remesa: '02', cargo: 500, abono: 0 }).shouldFix, false);

        // Códigos nativos de SIPE -> nunca tocar
        for (const nat of ['RM', 'NA', 'NC', 'ND', 'CH', 'TR']) {
            const res = classifyMovementForSignFix({ cod_remesa: nat, cargo: 100, abono: 0 });
            assert.equal(res.shouldFix, false);
            assert.equal(res.reason, 'NATIVE_CODE');
        }

        // Guardas estructurales
        assert.equal(classifyMovementForSignFix({ cod_remesa: '01', cargo: 100, abono: 0, deleted_at: '2026-11-28' }).reason, 'DELETED');
        assert.equal(classifyMovementForSignFix({ cod_remesa: '01', cargo: 100, abono: 0, transfer_group_id: 'TFB000000000001' }).reason, 'NATIVE_TRANSFER');
        assert.equal(classifyMovementForSignFix({ cod_remesa: '01', cargo: 100, abono: 0, import_batch_id: 42 }).reason, 'NATIVE_IMPORT');
        assert.equal(classifyMovementForSignFix({ cod_remesa: 'XX', cargo: 100, abono: 0 }).reason, 'UNKNOWN_CODE');
        assert.equal(classifyMovementForSignFix({ cod_remesa: null, cargo: 100, abono: 0 }).reason, 'NULL_CODE');
    });

    it('buildBackupTableName genera un identificador SQL válido y seguro', () => {
        const name = buildBackupTableName(new Date(2026, 10, 28, 11, 35, 9));
        assert.equal(name, 'movimientos_bancarios_bak_signfix_20261128_113509');
        assert.match(name, /^[a-z0-9_]+$/);
    });

    it('runSignFix en modo dry-run no realiza escrituras y proyecta correctamente el saldo corregido', async () => {
        const db = createInMemoryMockDb();
        const report = await runSignFix(db, { apply: false, cuentaId: 8 });

        assert.equal(report.applied, false);
        assert.equal(report.backupTable, null);
        assert.equal(report.updatedCount, 0);
        assert.equal(db.state.writes.length, 0, 'Dry-run no debe ejecutar escrituras');

        // En cuenta 8 hay 4 legados invertidos: 1001 (01), 1002 (03), 1003 (02), 1011 (01 previo al corte)
        assert.equal(report.totalCandidates, 4);
        assert.equal(report.unknownOrNullCodes.length, 2);

        const proj = report.accountProjections[0];
        // Saldo actual en >= 2026-11-01:
        // saldo_inicial (10000) + abonos (29971.67 + 10349.75 + 500.00 = 40821.42)
        // - cargos (10123.78 + 1000 + 250 + 300 + 50 + 25 = 11748.78) - cheques (200) = 38872.64
        // Nota: el movimiento 1011 (800) tiene fecha 2026-10-20 < fecha_saldo_inicial (2026-11-01), no entra en saldo_chequera
        assert.equal(proj.saldo_chequera_actual, 38872.64);

        // Tras corregir 1001 (+10123.78 abono, -10123.78 cargo), 1002 (+1000, -1000), 1003 (-29971.67 abono, +29971.67 cargo):
        // abonos post-corte = 10349.75 + 500 + 10123.78 + 1000 = 21973.53
        // cargos post-corte = 250 + 300 + 50 + 25 + 29971.67 = 30596.67
        // saldo proyectado = 10000 + 21973.53 - 30596.67 - 200 = 1176.86
        assert.equal(proj.saldo_chequera_proyectado, 1176.86);
    });

    it('runSignFix con apply=true crea respaldo, corrige saldos/fingerprints/versiones, respeta nativos y es idempotente', async () => {
        const db = createInMemoryMockDb();
        const applyReport = await runSignFix(db, {
            apply: true,
            now: new Date(2026, 10, 28, 12, 0, 0)
        });

        assert.equal(applyReport.applied, true);
        assert.equal(applyReport.backupTable, 'movimientos_bancarios_bak_signfix_20261128_120000');
        assert.ok(applyReport.rollbackSql.includes('UPDATE movimientos_bancarios m INNER JOIN movimientos_bancarios_bak_signfix_20261128_120000'));
        // 4 filas en cuenta 8 + 1 fila en cuenta 9 = 5
        assert.equal(applyReport.totalCandidates, 5);
        assert.equal(applyReport.updatedCount, 5);

        // Respaldo preservó valores originales antes de la corrección
        const backupRows = db.state.backups[applyReport.backupTable];
        assert.equal(backupRows.length, 5);
        const bak1001 = backupRows.find(r => r.id === 1001);
        assert.equal(bak1001.cargo, 10123.78);
        assert.equal(bak1001.abono, 0);

        // Filas corregidas en tabla principal + fingerprint recalculado + version incrementada
        const row1001 = db.state.movimientos_bancarios.find(m => m.id === 1001);
        assert.equal(row1001.cargo, 0);
        assert.equal(row1001.abono, 10123.78);
        assert.equal(row1001.version, 2);
        assert.equal(row1001.fingerprint, computeMovementFingerprint({
            cuentaBancariaId: 8,
            fecha: '2026-11-26',
            documento: 'C21114841',
            cargo: 0,
            abono: 10123.78,
            concepto: 'PUMA COSTA DEL SOL - 26/11/2026'
        }));

        const row1003 = db.state.movimientos_bancarios.find(m => m.id === 1003);
        assert.equal(row1003.cargo, 29971.67);
        assert.equal(row1003.abono, 0);
        assert.equal(row1003.version, 2);

        // Nativo RM 1004 y desconocido 1009 intactos
        const row1004 = db.state.movimientos_bancarios.find(m => m.id === 1004);
        assert.equal(row1004.abono, 10349.75);
        assert.equal(row1004.cargo, 0);
        assert.equal(row1004.version, 1);

        const row1009 = db.state.movimientos_bancarios.find(m => m.id === 1009);
        assert.equal(row1009.cargo, 50);
        assert.equal(row1009.version, 1);

        // Idempotencia: segunda ejecución no encuentra candidatos
        const secondRun = await runSignFix(db, { apply: true });
        assert.equal(secondRun.applied, false);
        assert.equal(secondRun.totalCandidates, 0);
        assert.equal(secondRun.updatedCount, 0);
    });

    it('regresión: normalizeMovementDirection soporta ND y códigos legados, y Gemini incluye convención bancaria', async () => {
        assert.equal(normalizeMovementDirection({ codRemesa: 'ND' }), 'CARGO');
        assert.equal(normalizeMovementDirection({ codRemesa: 'NC' }), 'CARGO');
        assert.equal(normalizeMovementDirection({ codRemesa: '02' }), 'CARGO');
        assert.equal(normalizeMovementDirection({ codRemesa: '01' }), 'ABONO');
        assert.equal(normalizeMovementDirection({ codRemesa: '03' }), 'ABONO');

        let capturedPrompt = '';
        await extractBankStatementWithGemini({
            files: [{ data_url: TINY_PNG_DATA_URL }],
            generateWithGeminiFn: async ({ contents }) => {
                capturedPrompt = contents?.[0]?.parts?.[0]?.text || '';
                return {
                    modelUsed: 'gemini-test',
                    text: JSON.stringify({
                        banco_detectado: 'PROMERICA',
                        moneda: 'USD',
                        transacciones: [
                            { fecha: '2026-11-27', documento: '123', descripcion: 'REMESA', cargo: 0, abono: 100 }
                        ]
                    })
                };
            }
        });

        assert.ok(capturedPrompt.includes('CONVENCIÓN OBLIGATORIA DE SIGNOS'));
        assert.ok(capturedPrompt.includes('"cargo" es SIEMPRE una SALIDA'));
        assert.ok(capturedPrompt.includes('"abono" es SIEMPRE una ENTRADA'));
    });
});
