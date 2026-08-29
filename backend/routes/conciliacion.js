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
        return isNaN(dateStr.getTime()) ? null : dateStr.toISOString().split('T')[0];
    }
    if (typeof dateStr === 'string') {
        const str = dateStr.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
        if (str.includes('/')) {
            const parts = str.split('/');
            if (parts.length === 3) {
                const day = parts[0].padStart(2, '0');
                const month = parts[1].padStart(2, '0');
                const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                return `${year}-${month}-${day}`;
            }
        }
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
};

const withRetry = async (fn, retries = 2) => {
    try {
        return await fn();
    } catch (err) {
        if ((err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ETIMEDOUT') && retries > 0) {
            console.warn(`[CONCILIACION] Retrying DB query due to ${err.code}...`);
            await new Promise(r => setTimeout(r, 200));
            return await withRetry(fn, retries - 1);
        }
        throw err;
    }
};

// Helper para parsear CSV/TSV respetando comillas dobles y saltos de linea dentro de celdas
const parseCSVorTSV = (text) => {
    if (!text || typeof text !== 'string') return [];
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const hasTabs = cleanText.includes('\t');
    const isDelimiter = (char) => {
        if (hasTabs) return char === '\t';
        return char === ',' || char === ';';
    };

    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;
    
    for (let i = 0; i < cleanText.length; i++) {
        const char = cleanText[i];
        const nextChar = cleanText[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentCell += '"';
                i++; // Saltear comilla escapada
            } else {
                inQuotes = !inQuotes;
            }
        } else if (isDelimiter(char) && !inQuotes) {
            currentRow.push(currentCell.trim().replace(/^"+|"+$/g, ''));
            currentCell = '';
        } else if (char === '\n' && !inQuotes) {
            currentRow.push(currentCell.trim().replace(/^"+|"+$/g, ''));
            if (currentRow.some(c => c !== '')) {
                rows.push(currentRow);
            }
            currentRow = [];
            currentCell = '';
        } else {
            // Si está dentro de comillas y es un salto de línea, reemplazar por espacio
            if (inQuotes && char === '\n') {
                currentCell += ' ';
            } else {
                currentCell += char;
            }
        }
    }
    
    if (currentCell !== '' || currentRow.length > 0) {
        currentRow.push(currentCell.trim().replace(/^"+|"+$/g, ''));
        if (currentRow.some(c => c !== '')) {
            rows.push(currentRow);
        }
    }
    return rows;
};

// ── 1. Catálogos para la pantalla ─────────────────────────────────────────────
router.get('/catalogos', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const [empresas] = await withRetry(() => db.query('SELECT id, codigo, nombre FROM empresas ORDER BY nombre'));
        const [cuentas] = await withRetry(() => db.query(
            'SELECT cb.id, cb.empresa_id, e.codigo as empresa_codigo, e.nombre as empresa_nombre, ' +
            'cb.banco_id, b.codigo as banco_codigo, b.descripcion as banco_nombre, ' +
            'cb.numero, cb.nombre, cb.cod_cta, cb.orden ' +
            'FROM cuentas_bancarias cb ' +
            'LEFT JOIN empresas e ON cb.empresa_id = e.id ' +
            'LEFT JOIN bancos b ON cb.banco_id = b.id ' +
            'WHERE cb.activa = TRUE ' +
            'ORDER BY e.nombre ASC, cb.orden ASC, cb.nombre ASC'
        ));
        const [tiposRemesas] = await withRetry(() => db.query(
            'SELECT id, empresa_id, codigo, descripcion FROM tipos_remesas ORDER BY id ASC'
        ));
        res.json({ empresas, cuentas, tipos_remesas: tiposRemesas });
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
        const [[cuenta]] = await withRetry(() => db.query(
            'SELECT cb.*, e.codigo as empresa_codigo, e.nombre as empresa_nombre, ' +
            'b.codigo as banco_codigo, b.descripcion as banco_nombre ' +
            'FROM cuentas_bancarias cb ' +
            'LEFT JOIN empresas e ON cb.empresa_id = e.id ' +
            'LEFT JOIN bancos b ON cb.banco_id = b.id ' +
            'WHERE cb.id = ?',
            [cuenta_id]
        ));

        if (!cuenta) {
            return res.status(404).json({ message: 'Cuenta bancaria no encontrada.' });
        }

        const dbDesde = desde ? toDBDate(desde) : '2000-01-01';
        const dbHasta = hasta ? toDBDate(hasta) : '2099-12-31';

        // Asegurar que la tabla validaciones_saldo_banco exista
        try {
            await withRetry(() => db.query(`
                CREATE TABLE IF NOT EXISTS validaciones_saldo_banco (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    cuenta_bancaria_id INT NOT NULL,
                    fecha_validacion DATETIME NOT NULL,
                    monto_banco DECIMAL(14,2) NOT NULL DEFAULT 0,
                    saldo_chequera DECIMAL(14,2) DEFAULT 0,
                    diferencia DECIMAL(14,2) DEFAULT 0,
                    notas TEXT,
                    created_by INT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (cuenta_bancaria_id) REFERENCES cuentas_bancarias(id) ON DELETE CASCADE,
                    INDEX idx_cta_fecha (cuenta_bancaria_id, fecha_validacion)
                )
            `));
        } catch (e) { /* ignore if already exists */ }

        // 2. Última validación registrada para la cuenta
        let ultimaValidacion = null;
        try {
            const [valRows] = await withRetry(() => db.query(
                'SELECT * FROM validaciones_saldo_banco WHERE cuenta_bancaria_id = ? ORDER BY fecha_validacion DESC, id DESC LIMIT 1',
                [cuenta_id]
            ));
            ultimaValidacion = valRows[0] || null;
        } catch (e) {
            console.warn('validaciones_saldo_banco query warning:', e.message);
        }

        // 3. Movimientos bancarios APLICADOS (Conciliados)
        const [movimientosAplicadosRows] = await withRetry(() => db.query(
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
        ));

        // 4. Cheques APLICADOS (Cobrados)
        const [chequesAplicadosRows] = await withRetry(() => db.query(
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
        ));

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
        const [movimientosPendientesRows] = await withRetry(() => db.query(
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
        ));

        // 6. Cheques PENDIENTES (En tránsito / No cobrados)
        const [chequesPendientesRows] = await withRetry(() => db.query(
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
        ));

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
        const [[movTotales]] = await withRetry(() => db.query(
            'SELECT COALESCE(SUM(abono), 0) as total_abonos, COALESCE(SUM(cargo), 0) as total_cargos ' +
            'FROM movimientos_bancarios ' +
            'WHERE cuenta_bancaria_id = ? AND fecha <= ?',
            [cuenta_id, dbHasta]
        ));

        const [[chkTotales]] = await withRetry(() => db.query(
            'SELECT COALESCE(SUM(valor), 0) as total_cheques ' +
            'FROM cheques ' +
            'WHERE cuenta_bancaria_id = ? AND cheque_anulado = FALSE AND fue_noemitido = FALSE AND fecha <= ?',
            [cuenta_id, dbHasta]
        ));

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

        // Parsear líneas o filas usando parser robusto con soporte de comillas
        let rows = [];
        if (Array.isArray(raw_data)) {
            rows = raw_data;
        } else if (typeof raw_data === 'string') {
            rows = parseCSVorTSV(raw_data);
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

            let fecha = null;
            let documento = '';
            let descripcion = '';
            let cargo = 0;
            let abono = 0;
            let monto = 0;
            let saldo = 0;
            let foundNegative = false;

            // Extraer números y fechas de las columnas
            for (let i = 0; i < row.length; i++) {
                const cell = String(row[i] || '').trim();
                if (!cell) continue;

                if (!fecha && (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(cell) || /\d{4}-\d{2}-\d{2}/.test(cell))) {
                    fecha = cell;
                } else if (!documento && /^\d{4,12}$/.test(cell.replace(/^#/, ''))) {
                    documento = cell.replace(/^#/, '');
                } else if (!descripcion && cell.length > 2 && isNaN(Number(cell.replace(/[$,]/g, '')))) {
                    descripcion = cell;
                } else {
                    const numVal = parseFloat(cell.replace(/[$,]/g, ''));
                    if (!isNaN(numVal) && Math.abs(numVal) > 0) {
                        if (numVal < 0) {
                            cargo = Math.abs(numVal);
                            foundNegative = true;
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

            const descUpper = (descripcion || '').toUpperCase();
            
            // Determinar si es Cargo o Abono
            let tipo = 'ABONO';
            if (foundNegative || cargo > 0) {
                tipo = 'CARGO';
            } else if (
                descUpper.includes('CHEQUE') || 
                descUpper.includes('PAGO') || 
                descUpper.includes('DEBITO') || 
                descUpper.includes('CARGO') || 
                descUpper.includes('COMISION') ||
                descUpper.includes('COBRADO') ||
                descUpper.includes('INTERES')
            ) {
                tipo = 'CARGO';
            } else if (
                descUpper.includes('REMESA') || 
                descUpper.includes('ABONO') || 
                descUpper.includes('DEPOSITO') || 
                descUpper.includes('ENTRANTE') || 
                descUpper.includes('LIQUIDACION')
            ) {
                tipo = 'ABONO';
            }

            // Determinar código de remesa sugerido (NC, RM, NA, CH)
            let tipoRemesaCodigo = tipo === 'CARGO' ? 'NC' : 'RM';
            if (descUpper.includes('CHEQUE') || descUpper.includes('CHQ') || descUpper.includes('CAMARA')) {
                tipoRemesaCodigo = 'CH';
            } else if (tipo === 'CARGO') {
                tipoRemesaCodigo = 'NC';
            } else if (descUpper.includes('REMESA')) {
                tipoRemesaCodigo = 'RM';
            } else {
                tipoRemesaCodigo = 'NA';
            }

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
                descUpper.includes(cs) || 
                (match && match.concepto && match.concepto.toUpperCase().includes(cs))
            ) || '';

            parsedTransactions.push({
                fecha: fecha || toDisplayDate(new Date()),
                documento: documento || (match ? match.documento : ''),
                descripcion: (descripcion || (match ? match.concepto : '')).toUpperCase(),
                conceptoSugerido,
                monto: monto,
                cargo: tipo === 'CARGO' ? monto : 0,
                abono: tipo === 'ABONO' ? monto : 0,
                tipo: tipo,
                tipo_remesa_codigo: tipoRemesaCodigo,
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

// ── 5.1. Crear Movimiento y Conciliar Directamente ─────────────────────────
router.post('/crear-y-aplicar', authenticateToken, async (req, res) => {
    const {
        cuenta_bancaria_id,
        fecha,
        fecha_aplicado,
        documento,
        concepto,
        monto,
        tipo, // 'CARGO' o 'ABONO'
        tipo_remesa_codigo, // 'RM', 'NC', 'NA', 'CH'
        tipo_remesa_id,
        num_partida,
        cod_cta,
        aplicar_inmediatamente
    } = req.body;

    if (!cuenta_bancaria_id) {
        return res.status(400).json({ message: 'Cuenta bancaria requerida.' });
    }
    const montoNum = Math.abs(parseFloat(monto) || 0);
    if (montoNum <= 0) {
        return res.status(400).json({ message: 'El monto debe ser mayor a 0.' });
    }

    try {
        const db = getDb();
        const [[cuenta]] = await withRetry(() => db.query(
            'SELECT id, empresa_id FROM cuentas_bancarias WHERE id = ?',
            [cuenta_bancaria_id]
        ));
        if (!cuenta) {
            return res.status(404).json({ message: 'Cuenta bancaria no encontrada.' });
        }

        const empresaId = cuenta.empresa_id;
        const esCargo = (tipo || '').toUpperCase() === 'CARGO' || tipo_remesa_codigo === 'NC' || tipo_remesa_codigo === 'CH';
        const cargo = esCargo ? montoNum : 0;
        const abono = !esCargo ? montoNum : 0;

        let remesaId = tipo_remesa_id || null;
        if (!remesaId && tipo_remesa_codigo) {
            const [remRows] = await withRetry(() => db.query(
                'SELECT id FROM tipos_remesas WHERE empresa_id = ? AND codigo = ?',
                [empresaId, tipo_remesa_codigo]
            ));
            if (remRows.length > 0) {
                remesaId = remRows[0].id;
            } else {
                const [anyRem] = await withRetry(() => db.query(
                    'SELECT id FROM tipos_remesas WHERE codigo = ? LIMIT 1',
                    [tipo_remesa_codigo]
                ));
                if (anyRem.length > 0) remesaId = anyRem[0].id;
            }
        }

        const dbFecha = fecha ? toDBDate(fecha) : toDBDate(new Date());
        const dbFechaAplicado = (aplicar_inmediatamente !== false)
            ? toDBDate(fecha_aplicado || dbFecha)
            : null;

        const [result] = await withRetry(() => db.query(
            'INSERT INTO movimientos_bancarios (empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto, monto, cargo, abono, tipo_remesa_id, cod_cta, num_partida) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                empresaId,
                cuenta_bancaria_id,
                dbFecha,
                dbFechaAplicado,
                documento || '',
                (concepto || '').toUpperCase(),
                montoNum,
                cargo,
                abono,
                remesaId,
                cod_cta || null,
                num_partida || null
            ]
        ));

        if (req.io) {
            req.io.emit('conciliacion_updated', { id: result.insertId, accion: 'CREAR' });
        }

        res.status(201).json({
            message: dbFechaAplicado 
                ? 'Movimiento registrado y conciliado exitosamente' 
                : 'Movimiento registrado como pendiente',
            id: result.insertId,
            fecha_aplicado: dbFechaAplicado
        });
    } catch (error) {
        console.error('Error al crear y aplicar movimiento:', error);
        res.status(500).json({ message: 'Error al registrar movimiento', error: error.message });
    }
});

// ── 5.2. Crear y Aplicar Movimientos Masivamente ───────────────────────────
router.post('/crear-masivo-y-aplicar', authenticateToken, async (req, res) => {
    const { cuenta_bancaria_id, items, fecha_aplicado_general, aplicar_inmediatamente } = req.body;
    if (!cuenta_bancaria_id || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Debe especificar la cuenta bancaria y al menos un movimiento.' });
    }

    try {
        const db = getDb();
        const [[cuenta]] = await withRetry(() => db.query(
            'SELECT id, empresa_id FROM cuentas_bancarias WHERE id = ?',
            [cuenta_bancaria_id]
        ));
        if (!cuenta) {
            return res.status(404).json({ message: 'Cuenta bancaria no encontrada.' });
        }

        const empresaId = cuenta.empresa_id;
        const [tiposRemesas] = await withRetry(() => db.query(
            'SELECT id, codigo FROM tipos_remesas WHERE empresa_id = ?',
            [empresaId]
        ));
        const remesaMap = new Map();
        tiposRemesas.forEach(tr => remesaMap.set(tr.codigo, tr.id));

        let creadosCount = 0;
        for (const item of items) {
            const montoNum = Math.abs(parseFloat(item.monto) || 0);
            if (montoNum <= 0) continue;

            const esCargo = (item.tipo || '').toUpperCase() === 'CARGO' || item.tipo_remesa_codigo === 'NC' || item.tipo_remesa_codigo === 'CH';
            const cargo = esCargo ? montoNum : 0;
            const abono = !esCargo ? montoNum : 0;
            const tipoCodigo = item.tipo_remesa_codigo || (esCargo ? 'NC' : 'RM');
            const remesaId = remesaMap.get(tipoCodigo) || null;

            const dbFecha = item.fecha ? toDBDate(item.fecha) : toDBDate(new Date());
            const itemFechaAplicado = item.fecha_aplicado || fecha_aplicado_general || dbFecha;
            const dbFechaAplicado = (aplicar_inmediatamente !== false) ? toDBDate(itemFechaAplicado) : null;

            await withRetry(() => db.query(
                'INSERT INTO movimientos_bancarios (empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto, monto, cargo, abono, tipo_remesa_id, cod_cta, num_partida) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    empresaId,
                    cuenta_bancaria_id,
                    dbFecha,
                    dbFechaAplicado,
                    item.documento || '',
                    (item.descripcion || item.concepto || '').toUpperCase(),
                    montoNum,
                    cargo,
                    abono,
                    remesaId,
                    null,
                    null
                ]
            ));
            creadosCount++;
        }

        if (req.io) {
            req.io.emit('conciliacion_updated', { count: creadosCount, accion: 'CREAR_MASIVO' });
        }

        res.json({
            message: `Se crearon y ${aplicar_inmediatamente !== false ? 'conciliaron' : 'registraron'} ${creadosCount} movimientos con éxito.`,
            creados: creadosCount
        });
    } catch (error) {
        console.error('Error en crear-masivo-y-aplicar:', error);
        res.status(500).json({ message: 'Error al procesar movimientos en lote', error: error.message });
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
