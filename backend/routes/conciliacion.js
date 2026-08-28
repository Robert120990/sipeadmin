const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const toDisplayDate = (dateVal) => {
    if (!dateVal) return null;
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};

const toDBDate = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr instanceof Date) {
        return dateStr.toISOString().split('T')[0];
    }
    // Handle dd/mm/yyyy or yyyy-mm-dd
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            return `${year}-${month}-${day}`;
        }
    }
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
};

// ── 1. Catálogos para la pantalla ─────────────────────────────────────────────
router.get('/catalogos', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const [empresas] = await db.query('SELECT id, codigo, nombre FROM empresas ORDER BY nombre');
        const [cuentas] = await db.query(
            'SELECT cb.id, cb.empresa_id, e.codigo as empresa_codigo, e.nombre as empresa_nombre, ' +
            'cb.banco_id, b.codigo as banco_codigo, b.descripcion as banco_nombre, ' +
            'cb.numero, cb.nombre, cb.cod_cta, cb.orden ' +
            'FROM cuentas_bancarias cb ' +
            'LEFT JOIN empresas e ON cb.empresa_id = e.id ' +
            'LEFT JOIN bancos b ON cb.banco_id = b.id ' +
            'WHERE cb.activa = TRUE ' +
            'ORDER BY e.nombre ASC, cb.orden ASC, cb.nombre ASC'
        );
        res.json({ empresas, cuentas });
    } catch (error) {
        console.error('Error en catalogos conciliacion:', error);
        res.status(500).json({ message: 'Error al cargar catálogos', error: error.message });
    }
});

// ── 2. Datos Principales de Conciliación ─────────────────────────────────────
router.get('/data', authenticateToken, async (req, res) => {
    const { cuenta_id, desde, hasta } = req.query;
    if (!cuenta_id) {
        return res.status(400).json({ message: 'Debe especificar el ID de la cuenta bancaria.' });
    }

    try {
        const db = getDb();

        // 1. Obtener datos de la cuenta bancaria
        const [[cuenta]] = await db.query(
            'SELECT cb.*, e.codigo as empresa_codigo, e.nombre as empresa_nombre, ' +
            'b.codigo as banco_codigo, b.descripcion as banco_nombre ' +
            'FROM cuentas_bancarias cb ' +
            'LEFT JOIN empresas e ON cb.empresa_id = e.id ' +
            'LEFT JOIN bancos b ON cb.banco_id = b.id ' +
            'WHERE cb.id = ?',
            [cuenta_id]
        );

        if (!cuenta) {
            return res.status(404).json({ message: 'Cuenta bancaria no encontrada.' });
        }

        const dbDesde = desde ? toDBDate(desde) : '2000-01-01';
        const dbHasta = hasta ? toDBDate(hasta) : '2099-12-31';

        // 2. Última validación registrada para la cuenta
        const [[ultimaValidacion]] = await db.query(
            'SELECT * FROM validaciones_saldo_banco WHERE cuenta_bancaria_id = ? ORDER BY fecha_validacion DESC, id DESC LIMIT 1',
            [cuenta_id]
        );

        // 3. Movimientos bancarios APLICADOS (Conciliados)
        const [movimientosAplicadosRows] = await db.query(
            'SELECT m.id, "MOV" as origen_tipo, m.tipo_remesa_id, tr.codigo as tipo_doc, ' +
            'm.fecha, m.fecha_aplicado, m.documento, m.concepto, "" as beneficiario, ' +
            'm.monto, m.cargo, m.abono, m.num_partida, m.cod_cta ' +
            'FROM movimientos_bancarios m ' +
            'LEFT JOIN tipos_remesas tr ON m.tipo_remesa_id = tr.id ' +
            'WHERE m.cuenta_bancaria_id = ? ' +
            'AND m.fecha_aplicado IS NOT NULL ' +
            'AND m.fecha_aplicado BETWEEN ? AND ? ' +
            'ORDER BY m.fecha_aplicado DESC, m.id DESC',
            [cuenta_id, dbDesde, dbHasta]
        );

        // 4. Cheques APLICADOS (Cobrados)
        const [chequesAplicadosRows] = await db.query(
            'SELECT ch.id, "CK" as origen_tipo, "CH" as tipo_doc, ' +
            'ch.fecha, ch.fecha_aplicado, ch.cheque as documento, ch.concepto, ch.a_nombre as beneficiario, ' +
            'ch.valor as monto, ch.valor as cargo, 0 as abono, ch.num_partida, "" as cod_cta ' +
            'FROM cheques ch ' +
            'WHERE ch.cuenta_bancaria_id = ? ' +
            'AND ch.fecha_aplicado IS NOT NULL ' +
            'AND ch.cheque_anulado = FALSE AND ch.fue_noemitido = FALSE ' +
            'AND ch.fecha_aplicado BETWEEN ? AND ? ' +
            'ORDER BY ch.fecha_aplicado DESC, ch.id DESC',
            [cuenta_id, dbDesde, dbHasta]
        );

        // Unificar y ordenar movimientos conciliados
        const movimientosConciliados = [...movimientosAplicadosRows, ...chequesAplicadosRows]
            .sort((a, b) => new Date(b.fecha_aplicado) - new Date(a.fecha_aplicado) || b.id - a.id)
            .map(r => ({
                ...r,
                key: `${r.origen_tipo}_${r.id}`,
                tipo: r.tipo_doc || (r.origen_tipo === 'CK' ? 'CH' : (r.abono > 0 ? 'RM' : 'NC')),
                fecha_display: toDisplayDate(r.fecha),
                fecha_aplicado_display: toDisplayDate(r.fecha_aplicado),
                monto_display: Number(r.monto || r.cargo || r.abono || 0)
            }));

        // 5. Movimientos bancarios PENDIENTES (Sin fecha aplicado o posterior al rango)
        const [movimientosPendientesRows] = await db.query(
            'SELECT m.id, "MOV" as origen_tipo, tr.codigo as tipo_doc, ' +
            'm.fecha, m.fecha_aplicado, m.documento, m.concepto, "" as beneficiario, ' +
            'm.monto, m.cargo, m.abono, m.num_partida, m.cod_cta ' +
            'FROM movimientos_bancarios m ' +
            'LEFT JOIN tipos_remesas tr ON m.tipo_remesa_id = tr.id ' +
            'WHERE m.cuenta_bancaria_id = ? ' +
            'AND (m.fecha_aplicado IS NULL OR m.fecha_aplicado > ?) ' +
            'AND m.fecha <= ? ' +
            'ORDER BY m.fecha DESC, m.id DESC',
            [cuenta_id, dbHasta, dbHasta]
        );

        // 6. Cheques PENDIENTES (En tránsito / No cobrados)
        const [chequesPendientesRows] = await db.query(
            'SELECT ch.id, "CK" as origen_tipo, "CH" as tipo_doc, ' +
            'ch.fecha, ch.fecha_aplicado, ch.cheque as documento, ch.concepto, ch.a_nombre as beneficiario, ' +
            'ch.valor as monto, ch.valor as cargo, 0 as abono, ch.num_partida, "" as cod_cta ' +
            'FROM cheques ch ' +
            'WHERE ch.cuenta_bancaria_id = ? ' +
            'AND (ch.fecha_aplicado IS NULL OR ch.fecha_aplicado > ?) ' +
            'AND ch.fecha <= ? ' +
            'AND ch.cheque_anulado = FALSE AND ch.fue_noemitido = FALSE ' +
            'ORDER BY ch.fecha DESC, ch.id DESC',
            [cuenta_id, dbHasta, dbHasta]
        );

        const pendientes = [...movimientosPendientesRows, ...chequesPendientesRows]
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha) || b.id - a.id)
            .map(r => ({
                ...r,
                key: `${r.origen_tipo}_${r.id}`,
                tipo: r.tipo_doc || (r.origen_tipo === 'CK' ? 'CH' : (r.abono > 0 ? 'RM' : 'NC')),
                fecha_display: toDisplayDate(r.fecha),
                fecha_aplicado_display: toDisplayDate(r.fecha_aplicado),
                monto_display: Number(r.monto || r.cargo || r.abono || 0)
            }));

        // 7. Cálculo del Saldo en Chequera (Acumulado de todos los abonos menos cargos y cheques hasta la fecha fin)
        const [[movTotales]] = await db.query(
            'SELECT COALESCE(SUM(abono), 0) as total_abonos, COALESCE(SUM(cargo), 0) as total_cargos ' +
            'FROM movimientos_bancarios ' +
            'WHERE cuenta_bancaria_id = ? AND fecha <= ?',
            [cuenta_id, dbHasta]
        );

        const [[chkTotales]] = await db.query(
            'SELECT COALESCE(SUM(valor), 0) as total_cheques ' +
            'FROM cheques ' +
            'WHERE cuenta_bancaria_id = ? AND cheque_anulado = FALSE AND fue_noemitido = FALSE AND fecha <= ?',
            [cuenta_id, dbHasta]
        );

        const saldoChequeraCalculado = Number((Number(movTotales.total_abonos) - Number(movTotales.total_cargos) - Number(chkTotales.total_cheques)).toFixed(2));

        // Saldo banco por defecto toma la última validación o saldo calculado
        const saldoBanco = ultimaValidacion ? Number(ultimaValidacion.monto_banco) : saldoChequeraCalculado;
        const diferencia = Number((saldoBanco - saldoChequeraCalculado).toFixed(2));

        res.json({
            cuenta,
            movimientos_conciliados: movimientosConciliados,
            pendientes,
            resumen: {
                saldo_banco: saldoBanco,
                saldo_chequera: saldoChequeraCalculado,
                diferencia: diferencia,
                ultima_validacion: ultimaValidacion ? {
                    id: ultimaValidacion.id,
                    fecha_validacion: ultimaValidacion.fecha_validacion,
                    monto_banco: Number(ultimaValidacion.monto_banco),
                    saldo_chequera: Number(ultimaValidacion.saldo_chequera),
                    diferencia: Number(ultimaValidacion.diferencia),
                    notas: ultimaValidacion.notas
                } : null
            }
        });
    } catch (error) {
        console.error('Error al obtener datos de conciliación:', error);
        res.status(500).json({ message: 'Error al consultar conciliación', error: error.message });
    }
});

// ── 3. Aplicar o Desconciliar Masivamente ────────────────────────────────────
router.post('/aplicar', authenticateToken, async (req, res) => {
    const { items, fecha_aplicado, accion } = req.body;
    // accion: 'CONCILIAR' o 'DESCONCILIAR'
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Debe seleccionar al menos un documento.' });
    }

    const esConciliar = accion !== 'DESCONCILIAR';
    const dbFecha = esConciliar ? toDBDate(fecha_aplicado || new Date()) : null;

    try {
        const db = getDb();
        const movIds = items.filter(i => i.tipo === 'MOV' || i.origen_tipo === 'MOV').map(i => i.id);
        const chkIds = items.filter(i => i.tipo === 'CK' || i.origen_tipo === 'CK').map(i => i.id);

        if (movIds.length > 0) {
            await db.query(
                `UPDATE movimientos_bancarios SET fecha_aplicado = ? WHERE id IN (${movIds.map(() => '?').join(',')})`,
                [dbFecha, ...movIds]
            );
        }

        if (chkIds.length > 0) {
            await db.query(
                `UPDATE cheques SET fecha_aplicado = ? WHERE id IN (${chkIds.map(() => '?').join(',')})`,
                [dbFecha, ...chkIds]
            );
        }

        if (req.io) {
            req.io.emit('conciliacion_updated', { count: items.length, accion });
        }

        res.json({
            message: esConciliar 
                ? `Se conciliarion ${items.length} documento(s) con fecha ${toDisplayDate(dbFecha)}.`
                : `Se desconciliaron ${items.length} documento(s) exitosamente.`,
            actualizados: items.length
        });
    } catch (error) {
        console.error('Error en /aplicar conciliacion:', error);
        res.status(500).json({ message: 'Error al aplicar cambios en conciliación', error: error.message });
    }
});

// ── 4. Registrar Validación de Saldo en Banco ───────────────────────────────
router.post('/validar-saldo', authenticateToken, async (req, res) => {
    const { cuenta_bancaria_id, monto_banco, saldo_chequera, diferencia, notas } = req.body;

    if (!cuenta_bancaria_id) {
        return res.status(400).json({ message: 'Cuenta bancaria requerida.' });
    }

    try {
        const db = getDb();
        const [result] = await db.query(
            'INSERT INTO validaciones_saldo_banco (cuenta_bancaria_id, fecha_validacion, monto_banco, saldo_chequera, diferencia, notas, created_by) ' +
            'VALUES (?, NOW(), ?, ?, ?, ?, ?)',
            [cuenta_bancaria_id, Number(monto_banco || 0), Number(saldo_chequera || 0), Number(diferencia || 0), notas || '', req.user?.id || null]
        );

        const [[saved]] = await db.query('SELECT * FROM validaciones_saldo_banco WHERE id = ?', [result.insertId]);

        res.json({
            message: 'Validación de saldo guardada exitosamente.',
            validacion: saved
        });
    } catch (error) {
        console.error('Error al guardar validacion de saldo:', error);
        res.status(500).json({ message: 'Error al guardar validación', error: error.message });
    }
});

// ── 5. Parser y Auto-Matcher de Extractos Bancarios ─────────────────────────
router.post('/parse-extracto', authenticateToken, async (req, res) => {
    const { cuenta_id, raw_data, banco_formato } = req.body;
    if (!cuenta_id || !raw_data) {
        return res.status(400).json({ message: 'Faltan datos requeridos (cuenta y datos de extracto).' });
    }

    try {
        const db = getDb();

        // Obtener pendientes de la cuenta para cruce inteligente
        const [movPendientes] = await db.query(
            'SELECT id, "MOV" as origen_tipo, documento, concepto, monto, cargo, abono, fecha ' +
            'FROM movimientos_bancarios ' +
            'WHERE cuenta_bancaria_id = ? AND fecha_aplicado IS NULL',
            [cuenta_id]
        );

        const [chkPendientes] = await db.query(
            'SELECT id, "CK" as origen_tipo, cheque as documento, concepto, valor as monto, valor as cargo, 0 as abono, fecha, a_nombre as beneficiario ' +
            'FROM cheques ' +
            'WHERE cuenta_bancaria_id = ? AND fecha_aplicado IS NULL AND cheque_anulado = FALSE AND fue_noemitido = FALSE',
            [cuenta_id]
        );

        const todosPendientes = [...movPendientes, ...chkPendientes];

        // Parsear líneas o filas
        let rows = [];
        if (Array.isArray(raw_data)) {
            rows = raw_data;
        } else if (typeof raw_data === 'string') {
            // Divide por saltos de línea y tabuladores (copiado de Excel o banca web)
            const lines = raw_data.split(/\r?\n/).filter(l => l.trim() !== '');
            rows = lines.map(line => line.split(/\t|,|;/).map(c => c.trim()));
        }

        const parsedTransactions = [];

        // Conceptos sugeridos frecuentes para enriquecer descripciones
        const conceptosSugeridos = [
            'LIQUIDACION APP PUMA PRIS',
            'REMESA CUENTA CORRIENTE SERSAPROSA',
            'TRANSFERENCIA POR TRANSFER365',
            'LIQUIDACION VERSATEC FLOTA',
            'PAGO DE PRESTAMO',
            'PAGO MINISTERIO DE HACIENDA',
            'CHEQUES COMPENSACION',
            'ARRENDAMIENTO ATM',
            'NOTA DE DEBITO X PLANILLA',
            'INTERESES',
            'COMPRA DE CHEQUERA',
            'IMPUESTO POR LIQUIDEZ'
        ];

        for (const row of rows) {
            if (!Array.isArray(row) || row.length === 0) continue;
            // Omitir encabezados comunes
            const firstCell = String(row[0] || '').toLowerCase();
            if (firstCell.includes('fecha') || firstCell.includes('usuario') || firstCell.includes('banco') || firstCell.includes('saldo')) {
                continue;
            }

            // Normalización según formato o detección automática
            let fecha = null;
            let documento = '';
            let descripcion = '';
            let cargo = 0;
            let abono = 0;
            let monto = 0;
            let saldo = 0;

            // Extraer números y fechas de las columnas
            for (let i = 0; i < row.length; i++) {
                const cell = String(row[i] || '').trim();
                if (!fecha && (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(cell) || /\d{4}-\d{2}-\d{2}/.test(cell))) {
                    fecha = cell;
                } else if (!documento && /^\d{5,12}$/.test(cell)) {
                    documento = cell;
                } else if (!descripcion && cell.length > 3 && isNaN(Number(cell.replace(/[$,]/g, '')))) {
                    descripcion = cell;
                } else {
                    const numVal = parseFloat(cell.replace(/[$,]/g, ''));
                    if (!isNaN(numVal) && Math.abs(numVal) > 0) {
                        if (numVal < 0) {
                            cargo = Math.abs(numVal);
                        } else if (monto === 0) {
                            monto = numVal;
                        } else if (saldo === 0) {
                            saldo = numVal;
                        }
                    }
                }
            }

            if (cargo > 0 && abono === 0) {
                monto = cargo;
            } else if (abono > 0) {
                monto = abono;
            }

            if (!fecha && !descripcion && monto === 0) continue;

            // Intentar cruce automático con los pendientes
            let match = null;
            let matchType = 'NINGUNO';

            // 1. Coincidencia exacta por número de documento/cheque y monto
            if (documento) {
                match = todosPendientes.find(p => String(p.documento || '').trim() === documento && Math.abs(Number(p.monto) - monto) < 0.01);
                if (match) matchType = 'EXACTO_DOC_MONTO';
            }

            // 2. Coincidencia por número de documento
            if (!match && documento) {
                match = todosPendientes.find(p => String(p.documento || '').trim() === documento);
                if (match) matchType = 'SUGERIDO_DOC';
            }

            // 3. Coincidencia por monto exacto único
            if (!match && monto > 0) {
                const matchesByAmount = todosPendientes.filter(p => Math.abs(Number(p.monto) - monto) < 0.01);
                if (matchesByAmount.length === 1) {
                    match = matchesByAmount[0];
                    matchType = 'SUGERIDO_MONTO_UNICO';
                }
            }

            // Detectar concepto sugerido
            const conceptoSugerido = conceptosSugeridos.find(cs => 
                descripcion.toUpperCase().includes(cs) || 
                (match && match.concepto && match.concepto.toUpperCase().includes(cs))
            ) || '';

            parsedTransactions.push({
                fecha: fecha || toDisplayDate(new Date()),
                documento: documento || (match ? match.documento : ''),
                descripcion: (descripcion || (match ? match.concepto : '')).toUpperCase(),
                conceptoSugerido,
                monto: monto,
                cargo: cargo,
                abono: abono,
                saldo: saldo,
                match: match ? {
                    id: match.id,
                    origen_tipo: match.origen_tipo,
                    documento: match.documento,
                    concepto: match.concepto,
                    beneficiario: match.beneficiario || '',
                    monto: match.monto,
                    fecha: toDisplayDate(match.fecha)
                } : null,
                matchType
            });
        }

        res.json({
            banco_formato: banco_formato || 'AUTO',
            total_procesadas: parsedTransactions.length,
            transacciones: parsedTransactions,
            conceptos_sugeridos: conceptosSugeridos
        });
    } catch (error) {
        console.error('Error al procesar extracto bancario:', error);
        res.status(500).json({ message: 'Error al parsear extracto bancario', error: error.message });
    }
});

// ── 6. Edición Controlada de Movimiento ──────────────────────────────────────
router.put('/movimiento/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { concepto, documento, fecha, monto, origen_tipo } = req.body;

    try {
        const db = getDb();
        const esAdmin = req.user?.role === 'Administrator' || req.user?.role_id === 1;
        const tienePermisoMonto = esAdmin || req.user?.permissions?.includes('edit_monto_conciliacion');

        if (origen_tipo === 'CK') {
            const [[chk]] = await db.query('SELECT * FROM cheques WHERE id = ?', [id]);
            if (!chk) return res.status(404).json({ message: 'Cheque no encontrado' });

            if (monto !== undefined && Number(monto) !== Number(chk.valor) && !tienePermisoMonto) {
                return res.status(403).json({ message: 'No tienes autorización para modificar el monto de un cheque.' });
            }

            const nuevoMonto = tienePermisoMonto && monto !== undefined ? Number(monto) : chk.valor;
            const dbFecha = fecha ? toDBDate(fecha) : chk.fecha;

            await db.query(
                'UPDATE cheques SET concepto = ?, cheque = ?, fecha = ?, valor = ? WHERE id = ?',
                [(concepto || chk.concepto || '').toUpperCase(), documento || chk.cheque, dbFecha, nuevoMonto, id]
            );
        } else {
            const [[mov]] = await db.query('SELECT * FROM movimientos_bancarios WHERE id = ?', [id]);
            if (!mov) return res.status(404).json({ message: 'Movimiento no encontrado' });

            if (monto !== undefined && Number(monto) !== Number(mov.monto) && !tienePermisoMonto) {
                return res.status(403).json({ message: 'No tienes autorización para modificar el monto de un movimiento bancario.' });
            }

            const nuevoMonto = tienePermisoMonto && monto !== undefined ? Number(monto) : mov.monto;
            const nuevoCargo = mov.cargo > 0 ? nuevoMonto : 0;
            const nuevoAbono = mov.abono > 0 ? nuevoMonto : 0;
            const dbFecha = fecha ? toDBDate(fecha) : mov.fecha;

            await db.query(
                'UPDATE movimientos_bancarios SET concepto = ?, documento = ?, fecha = ?, monto = ?, cargo = ?, abono = ? WHERE id = ?',
                [(concepto || mov.concepto || '').toUpperCase(), documento || mov.documento, dbFecha, nuevoMonto, nuevoCargo, nuevoAbono, id]
            );
        }

        res.json({ message: 'Registro actualizado correctamente' });
    } catch (error) {
        console.error('Error al editar movimiento en conciliacion:', error);
        res.status(500).json({ message: 'Error al actualizar registro', error: error.message });
    }
});

module.exports = router;
