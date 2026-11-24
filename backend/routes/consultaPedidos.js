const express = require('express');
const router = express.Router();
const { getExternalDb } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');

const consultaPedidosPerms = [
    '/dashboard/operaciones/consulta-pedidos',
    '/dashboard/operaciones/pedidos',
    'manage_pedidos'
];

const OFFICIAL_STATIONS = [
    { id_empresa: '002', titulo: 'Puma Miraflores' },
    { id_empresa: '006', titulo: 'Shell Chalchuapa' },
    { id_empresa: '008', titulo: 'Puma Costa del Sol' },
    { id_empresa: '014', titulo: 'Puma La Loma (San Martín)' },
    { id_empresa: '015', titulo: 'Shell 14 Avenida' },
    { id_empresa: '016', titulo: 'Shell Poliedro' }
];

/**
 * Resolves a clean station display name from an external RRS station code or title.
 * @param {string|number} id
 * @param {string} fallbackTitle
 * @returns {string}
 */
function resolveStationName(id, fallbackTitle = '') {
    const strId = String(id || '').trim();
    const matched = OFFICIAL_STATIONS.find((s) => s.id_empresa === strId);
    if (matched) return matched.titulo;

    const upper = String(fallbackTitle || '').toUpperCase();
    if (upper.includes('POLIEDRO')) return 'Shell Poliedro';
    if (upper.includes('14 AVENIDA') || upper.includes('ZURITA')) return 'Shell 14 Avenida';
    if (upper.includes('SAN MARTIN') || upper.includes('SAN MARTÍN') || upper.includes('LA LOMA')) {
        return 'Puma La Loma (San Martín)';
    }
    if (upper.includes('COSTA')) return 'Puma Costa del Sol';
    if (upper.includes('CHALCHUAPA')) return 'Shell Chalchuapa';
    if (upper.includes('MIRAFLORES')) return 'Puma Miraflores';

    return String(fallbackTitle || '').trim() || (strId ? `Estación ${strId}` : 'Estación');
}

/**
 * Converts YYYY-MM-DD to DD/MM/YYYY for legacy RRS voucher/transfer/discharge fields.
 * @param {string} rawDate
 * @returns {string}
 */
function formatDateToDDMMYYYY(rawDate) {
    const trimmed = String(rawDate || '').trim();
    if (!trimmed) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const [y, m, d] = trimmed.split('-');
        return `${d}/${m}/${y}`;
    }
    return trimmed;
}

/**
 * Extracts YYYY-MM-DD safely from string or Date for combustibles_costos.
 * @param {string|Date} rawDate
 * @returns {string}
 */
function formatOrderDateYMD(rawDate) {
    if (!rawDate) return new Date().toISOString().slice(0, 10);
    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
        return rawDate.toISOString().slice(0, 10);
    }
    const str = String(rawDate).trim();
    const ymdMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
    if (ymdMatch) return ymdMatch[1];
    const dmyMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
    try {
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    } catch (_) {
        /* fallback below */
    }
    return new Date().toISOString().slice(0, 10);
}

/**
 * Maps rows adding total_galones and computes KPI totals across fuels.
 * @param {Array<Object>} rows
 * @returns {{ formattedRows: Array<Object>, summary: Object }}
 */
function buildOrdersSummary(rows = []) {
    let totalDiesel = 0;
    let totalRegular = 0;
    let totalSuper = 0;
    let totalIon = 0;

    const formattedRows = (rows || []).map((r) => {
        const pDiesel = parseFloat(r.p_diesel) || 0;
        const pRegular = parseFloat(r.p_regular) || 0;
        const pSuper = parseFloat(r.p_super) || 0;
        const pIon = parseFloat(r.p_ion) || 0;
        const totalGln = pDiesel + pRegular + pSuper + pIon;

        totalDiesel += pDiesel;
        totalRegular += pRegular;
        totalSuper += pSuper;
        totalIon += pIon;

        return {
            ...r,
            total_galones: totalGln
        };
    });

    const totalGallons = totalDiesel + totalRegular + totalSuper + totalIon;

    return {
        formattedRows,
        summary: {
            totalOrders: formattedRows.length,
            totalDiesel,
            totalRegular,
            totalSuper,
            totalIon,
            totalGallons
        }
    };
}

/**
 * Validates and normalizes the payload required to receive an order in RRS web_pedidos.
 * @param {Object} body
 * @param {Object} order
 * @returns {{ valid: boolean, error?: string, parsed?: Object }}
 */
function validateReceivePayload(body = {}, order = {}) {
    const metodoPago = String(body.metodo_pago || 'CHEQUE').trim().toUpperCase();
    const doc = String(body.documento || '').trim();
    const fechaDescargaRaw = String(body.fecha_descarga || '').trim();

    if (!doc) {
        return { valid: false, error: 'El número de documento es obligatorio.' };
    }
    if (!fechaDescargaRaw) {
        return { valid: false, error: 'La fecha de descarga es obligatoria.' };
    }
    if (String(order.estado || '').trim().toUpperCase() !== 'VISTO') {
        return {
            valid: false,
            error: 'Solo se puede recibir el pedido si su estado es VISTO. Debe marcarlo como visto antes de recibirlo.'
        };
    }

    const rDiesel = body.r_diesel !== undefined && body.r_diesel !== '' ? (parseFloat(body.r_diesel) || 0) : (parseFloat(order.p_diesel) || 0);
    const rRegular = body.r_regular !== undefined && body.r_regular !== '' ? (parseFloat(body.r_regular) || 0) : (parseFloat(order.p_regular) || 0);
    const rSuper = body.r_super !== undefined && body.r_super !== '' ? (parseFloat(body.r_super) || 0) : (parseFloat(order.p_super) || 0);
    const rIon = body.r_ion !== undefined && body.r_ion !== '' ? (parseFloat(body.r_ion) || 0) : (parseFloat(order.p_ion) || 0);

    const costoD = body.costo_d !== undefined && body.costo_d !== '' ? (parseFloat(body.costo_d) || 0) : (parseFloat(order.costo_d) || 0);
    const costoR = body.costo_r !== undefined && body.costo_r !== '' ? (parseFloat(body.costo_r) || 0) : (parseFloat(order.costo_r) || 0);
    const costoS = body.costo_s !== undefined && body.costo_s !== '' ? (parseFloat(body.costo_s) || 0) : (parseFloat(order.costo_s) || 0);
    const costoI = body.costo_i !== undefined && body.costo_i !== '' ? (parseFloat(body.costo_i) || 0) : (parseFloat(order.costo_i) || 0);
    const flete = body.flete !== undefined && body.flete !== '' ? (parseFloat(body.flete) || 0) : (parseFloat(order.flete) || 0);

    if (rDiesel <= 0 && rRegular <= 0 && rSuper <= 0 && rIon <= 0) {
        return { valid: false, error: 'Debe registrar la descarga de galones de al menos un producto.' };
    }
    if (rDiesel > 0 && costoD <= 0) {
        return { valid: false, error: 'Debe ingresar el costo por galón para Diésel.' };
    }
    if (rRegular > 0 && costoR <= 0) {
        return { valid: false, error: 'Debe ingresar el costo por galón para Regular.' };
    }
    if (rSuper > 0 && costoS <= 0) {
        return { valid: false, error: 'Debe ingresar el costo por galón para Súper.' };
    }
    if (rIon > 0 && costoI <= 0) {
        return { valid: false, error: 'Debe ingresar el costo por galón para Ion Diésel.' };
    }

    const numeroCuenta = String(body.numero_cuenta || '').trim();
    const referencia = String(body.referencia || '').trim().slice(0, 10);
    const montoTransfer = parseFloat(body.monto) || 0;

    if (metodoPago === 'TRANSFERENCIA') {
        if (!numeroCuenta) {
            return { valid: false, error: 'Falta Cuenta Bancaria.' };
        }
        if (!referencia) {
            return { valid: false, error: 'Falta Num. Referencia de la transferencia.' };
        }
        if (montoTransfer <= 0) {
            return { valid: false, error: 'Monto Incorrecto.' };
        }
    }

    return {
        valid: true,
        parsed: {
            metodoPago,
            doc,
            formattedFechaDescarga: formatDateToDDMMYYYY(fechaDescargaRaw),
            formattedFechaPago: formatDateToDDMMYYYY(body.fecha_pago || fechaDescargaRaw),
            observacion: String(body.observacion || '').trim(),
            ncrNumero: String(body.ncr_numero || '').trim(),
            ncrMonto: parseFloat(body.ncr_monto) || 0,
            cuponesMonto: parseFloat(body.cupones) || 0,
            rDiesel,
            rRegular,
            rSuper,
            rIon,
            costoD,
            costoR,
            costoS,
            costoI,
            flete,
            cheques: Array.isArray(body.cheques) ? body.cheques : [],
            numeroCuenta,
            referencia,
            montoTransfer,
            concepto: String(body.concepto || '').trim()
        }
    };
}

/**
 * Helper to fetch clean station dictionary from externalDb merged with OFFICIAL_STATIONS.
 */
async function loadStationsList(externalDb) {
    let rows = [];
    try {
        const [dbRows] = await externalDb.query(
            "SELECT id_empresa, titulo FROM web_consolidado WHERE grupo = 'ESTACION' AND id_empresa != '004' ORDER BY orden"
        );
        rows = (dbRows || []).map((r) => ({
            id_empresa: String(r.id_empresa),
            titulo: resolveStationName(r.id_empresa, r.titulo)
        }));
    } catch (_) {
        rows = [];
    }

    const existingIds = new Set(rows.map((r) => r.id_empresa));
    OFFICIAL_STATIONS.forEach((st) => {
        if (!existingIds.has(st.id_empresa)) {
            rows.push({ id_empresa: st.id_empresa, titulo: st.titulo });
            existingIds.add(st.id_empresa);
        }
    });

    return rows;
}

// 1. GET /stations
router.get('/stations', authenticateToken, requirePermission(consultaPedidosPerms), async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const stations = await loadStationsList(externalDb);
        res.json({ data: stations });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar estaciones');
    }
});

// 2. GET /orders
router.get('/orders', authenticateToken, requirePermission(consultaPedidosPerms), async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const stations = await loadStationsList(externalDb);
        const stationNameMap = Object.fromEntries(stations.map((s) => [String(s.id_empresa), s.titulo]));

        const stationId = String(req.query.station_id || '').trim();
        const status = String(req.query.status || 'PENDIENTE').trim().toUpperCase();
        const search = String(req.query.search || '').trim();
        const startDate = String(req.query.start_date || '').trim() || null;
        const endDate = String(req.query.end_date || '').trim() || null;

        let query = `
            SELECT
                id,
                fecha,
                numero,
                id_estacion,
                forma_pago,
                p_diesel,
                p_regular,
                p_super,
                p_ion,
                r_diesel,
                r_regular,
                r_super,
                r_ion,
                documento,
                observacion,
                estado,
                cupones,
                pago,
                fecha_descarga,
                costo_d,
                costo_s,
                costo_r,
                costo_i,
                flete,
                ncr_numero,
                ncr_monto
            FROM web_pedidos
            WHERE 1=1
        `;
        const params = [];

        if (stationId && stationId.toUpperCase() !== 'TODAS') {
            query += ' AND id_estacion = ?';
            params.push(stationId);
        } else {
            query += " AND id_estacion != '004'";
        }

        if (status === 'PENDIENTE' || status === 'PENDIENTES') {
            query += " AND estado IN ('PENDIENTE', 'VISTO')";
        } else if (status === 'SOLO_PENDIENTE') {
            query += " AND estado = 'PENDIENTE'";
        } else if (status && status !== 'TODOS') {
            query += ' AND estado = ?';
            params.push(status);
        }

        if (startDate) {
            query += ' AND fecha >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += ' AND fecha <= ?';
            params.push(endDate);
        }

        if (search) {
            query += ' AND (numero LIKE ? OR forma_pago LIKE ? OR documento LIKE ? OR observacion LIKE ? OR ncr_numero LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY fecha DESC, id DESC';

        if ((status === 'RECIBIDO' || status === 'TODOS') && !startDate && !endDate && !search) {
            query += ' LIMIT 500';
        }

        const [rows] = await externalDb.query(query, params);
        const { formattedRows, summary } = buildOrdersSummary(rows || []);
        const enrichedRows = formattedRows.map((r) => ({
            ...r,
            estacion_nombre: stationNameMap[String(r.id_estacion)] || resolveStationName(r.id_estacion)
        }));

        res.json({
            data: enrichedRows,
            total: enrichedRows.length,
            summary
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar pedidos en RRS');
    }
});

// 3. PATCH /orders/:id/seen
router.patch('/orders/:id/seen', authenticateToken, requirePermission(consultaPedidosPerms), async (req, res) => {
    try {
        const { id } = req.params;
        const externalDb = await getExternalDb();

        const [orders] = await externalDb.query(
            'SELECT id, numero, estado FROM web_pedidos WHERE id = ?',
            [id]
        );

        if (!orders.length) {
            return res.status(404).json({ error: 'Pedido no encontrado.' });
        }

        const order = orders[0];
        if (String(order.estado || '').toUpperCase() === 'RECIBIDO') {
            return res.status(400).json({ error: 'El pedido ya fue recibido y no puede cambiarse a visto.' });
        }

        await externalDb.query(
            "UPDATE web_pedidos SET estado = 'VISTO' WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: `Pedido #${order.numero || id} marcado como visto exitosamente.`
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al marcar pedido como visto');
    }
});

// 4. GET /banks
router.get('/banks', authenticateToken, requirePermission(consultaPedidosPerms), async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query(
            `SELECT id, MIN(REPLACE(descripcion, 'A - ', '')) AS descripcion
             FROM bancos
             GROUP BY id
             ORDER BY descripcion`
        );
        res.json({ data: rows || [] });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar bancos');
    }
});

// 5. GET /bank-accounts
router.get('/bank-accounts', authenticateToken, requirePermission(consultaPedidosPerms), async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const bankId = String(req.query?.bank_id || '').trim() || null;

        let query = `
            SELECT a.numero, a.id_empresa, a.cod_banco, a.nombre,
                   TRIM(REPLACE(COALESCE(b.descripcion, ''), 'A - ', '')) AS banco_nombre,
                   CONCAT(COALESCE(b.descripcion, ''), ' - ', a.numero, ' - ', a.nombre) AS descri,
                   CONCAT('(', a.numero, ') ', a.nombre) AS display_name
            FROM cuentas_bancarias a
            LEFT JOIN bancos b ON a.cod_banco = b.id AND a.id_empresa = b.id_empresa
            WHERE a.activa = 'S'
        `;
        const params = [];

        if (bankId) {
            query += ' AND a.cod_banco = ?';
            params.push(bankId);
        }

        query += ' ORDER BY a.orden, a.nombre';

        const [rows] = await externalDb.query(query, params);
        res.json({ data: rows || [] });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar cuentas bancarias');
    }
});

// 6. GET /vouchers/validate
router.get('/vouchers/validate', authenticateToken, requirePermission(consultaPedidosPerms), async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const account = String(req.query.account || '').trim();
        const cheque = String(req.query.cheque || '').trim();

        if (!account || !cheque) {
            return res.status(400).json({ error: 'Cuenta y número de cheque son requeridos.' });
        }

        const [rows] = await externalDb.query(
            `SELECT numero_cuenta, cheque, valor, concepto, es_reservado, id_origen
             FROM vouchers
             WHERE numero_cuenta = ? AND cheque = ?`,
            [account, cheque]
        );

        if (!rows.length) {
            return res.json({ exists: false, message: 'Cheque no encontrado.' });
        }

        res.json({ exists: true, voucher: rows[0] });
    } catch (error) {
        sendSafeError(res, error, 'Error al validar cheque');
    }
});

// 7. GET /orders/:id/vouchers
router.get('/orders/:id/vouchers', authenticateToken, requirePermission(consultaPedidosPerms), async (req, res) => {
    try {
        const { id } = req.params;
        const externalDb = await getExternalDb();

        const [rows] = await externalDb.query(
            `SELECT v.numero_cuenta, v.concepto, v.cheque, v.valor, v.llave, v.id_empresa, c.nombre AS nombre_cuenta
             FROM vouchers v
             LEFT JOIN cuentas_bancarias c ON c.numero = v.numero_cuenta
             WHERE v.id_origen = ?`,
            [id]
        );

        res.json({ data: rows || [] });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar vouchers del pedido');
    }
});

// 8. GET /orders/:id/transfer
router.get('/orders/:id/transfer', authenticateToken, requirePermission(consultaPedidosPerms), async (req, res) => {
    try {
        const { id } = req.params;
        const externalDb = await getExternalDb();

        const [rows] = await externalDb.query(
            `SELECT m.*, CONCAT(COALESCE(b.descripcion, ''), ' - ', c.numero, ' - ', c.nombre) AS descri_cuenta
             FROM movimientos_bancarios m
             LEFT JOIN cuentas_bancarias c ON c.numero = m.numero_cuenta
             LEFT JOIN bancos b ON b.id = c.cod_banco AND b.id_empresa = c.id_empresa
             WHERE m.centro_costo = ?
             LIMIT 1`,
            [id]
        );

        res.json({ data: rows[0] || null });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar transferencia del pedido');
    }
});

// 9. PATCH /orders/:id/receive
router.patch('/orders/:id/receive', authenticateToken, requirePermission(consultaPedidosPerms), async (req, res) => {
    let conn = null;
    try {
        const { id } = req.params;
        const externalDb = await getExternalDb();
        conn = await externalDb.getConnection();
        await conn.beginTransaction();

        const [orders] = await conn.query(
            `SELECT id, numero, estado, fecha, id_estacion, forma_pago,
                    p_diesel, p_regular, p_super, p_ion,
                    costo_d, costo_s, costo_r, costo_i, flete
             FROM web_pedidos WHERE id = ?`,
            [id]
        );

        if (!orders.length) {
            await conn.rollback();
            return res.status(404).json({ error: 'Pedido no encontrado.' });
        }

        const order = orders[0];
        const validation = validateReceivePayload(req.body, order);
        if (!validation.valid) {
            await conn.rollback();
            return res.status(400).json({ error: validation.error });
        }

        const {
            metodoPago,
            doc,
            formattedFechaDescarga,
            formattedFechaPago,
            observacion,
            ncrNumero,
            ncrMonto,
            cuponesMonto: rawCuponesMonto,
            rDiesel,
            rRegular,
            rSuper,
            rIon,
            costoD,
            costoR,
            costoS,
            costoI,
            flete,
            cheques,
            numeroCuenta,
            referencia,
            montoTransfer,
            concepto
        } = validation.parsed;

        let cPago = '';
        let pagoTotal = 0;
        let cuponesMonto = 0;
        let finalObs = observacion;

        if (metodoPago === 'TRANSFERENCIA') {
            const [dup] = await conn.query(
                'SELECT COUNT(*) AS total FROM movimientos_bancarios WHERE numero_cuenta = ? AND documento = ? AND centro_costo != ?',
                [numeroCuenta, referencia, id]
            );
            if ((dup[0]?.total || 0) > 0) {
                await conn.rollback();
                return res.status(400).json({ error: 'Transferencia Repetida. Ya existe un movimiento bancario con esa cuenta y referencia.' });
            }

            const [ctaRows] = await conn.query(
                'SELECT id_empresa FROM cuentas_bancarias WHERE numero = ? LIMIT 1',
                [numeroCuenta]
            );
            const cIdEmpresa = ctaRows[0]?.id_empresa || 'E-1';

            const [corrRows] = await conn.query(
                `SELECT COALESCE(MAX(CAST(SUBSTRING(llave, 4) AS UNSIGNED)), 0) + 1 AS next_corr
                 FROM movimientos_bancarios WHERE llave LIKE 'MVB%' FOR UPDATE`
            );
            const nextCorr = corrRows[0]?.next_corr || 1;
            const cLlave = 'MVB' + String(nextCorr).padStart(17, '0');
            const cConcepto = concepto || `PAGO DE PIPA CCF# ${doc}`;

            await conn.query('DELETE FROM movimientos_bancarios WHERE centro_costo = ?', [id]);

            await conn.query(
                `INSERT INTO movimientos_bancarios (
                    id_empresa, llave, cod_remesa, documento, numero_cuenta, concepto,
                    cargo, abono, fecha_aplicado, fecha, monto, es_contabilizado,
                    cod_destino, tipo_destino, id_rubro, num_partida, centro_costo
                 ) VALUES (
                    ?, ?, '02', ?, ?, ?,
                    0.0, ?, ?, ?, ?, 'N',
                    '', '', '', '', ?
                 )`,
                [
                    cIdEmpresa,
                    cLlave,
                    referencia,
                    numeroCuenta,
                    cConcepto,
                    montoTransfer,
                    formattedFechaPago,
                    formattedFechaPago,
                    montoTransfer,
                    id
                ]
            );

            await conn.query(
                `UPDATE vouchers SET
                    es_reservado = 1,
                    concepto = '***** CHEQUE NO EMITIDO *****',
                    valor = 0.0,
                    fecha = ''
                 WHERE id_origen = ?`,
                [id]
            );

            const ctaLast4 = numeroCuenta.length >= 4 ? numeroCuenta.slice(-4) : numeroCuenta;
            const montoFmt = montoTransfer.toLocaleString('es-SV', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const autoObs = `${String(order.forma_pago || '').trim()}**TRANSF. #${ctaLast4} - $${montoFmt}**`;
            finalObs = observacion || autoObs;
            cPago = finalObs;
            pagoTotal = montoTransfer;
            cuponesMonto = 0;
        } else {
            cuponesMonto = rawCuponesMonto;
            const originalFormaPago = String(order.forma_pago || '').trim();
            if (originalFormaPago === 'CREDITO') {
                cPago = cheques.length > 0 ? '(CRD) PAGO: ' : originalFormaPago;
            } else {
                cPago = originalFormaPago;
            }

            await conn.query(
                `UPDATE vouchers SET
                    es_reservado = 1,
                    concepto = '***** CHEQUE NO EMITIDO *****',
                    valor = 0.0,
                    fecha = ''
                 WHERE id_origen = ?`,
                [id]
            );

            await conn.query('DELETE FROM movimientos_bancarios WHERE centro_costo = ?', [id]);

            let totalCheques = 0;
            for (const chq of cheques) {
                const numCta = String(chq.numero_cuenta || '').trim();
                const numCheque = String(chq.cheque || '').trim();
                const valor = parseFloat(chq.valor) || 0;
                const cConcepto = String(chq.concepto || '').trim() || `PAGO DE PIPA CCF# ${doc}`;

                if (!numCta || !numCheque || valor <= 0) continue;

                totalCheques += valor;

                await conn.query(
                    `UPDATE vouchers SET
                        es_reservado = 0,
                        concepto = ?,
                        valor = ?,
                        fecha = ?,
                        id_origen = ?
                     WHERE numero_cuenta = ? AND cheque = ?`,
                    [cConcepto, valor, formattedFechaDescarga, id, numCta, numCheque]
                );

                const ctaLast4 = numCta.length >= 4 ? numCta.slice(-4) : numCta;
                const valorFmt = valor.toLocaleString('es-SV', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                cPago += `#${ctaLast4}CH#${numCheque}(${valorFmt})-`;
            }

            pagoTotal = totalCheques + cuponesMonto + ncrMonto;
            finalObs = observacion;
        }

        await conn.query(
            `UPDATE web_pedidos SET
                documento = ?,
                observacion = ?,
                r_diesel = ?,
                r_regular = ?,
                r_super = ?,
                r_ion = ?,
                costo_d = ?,
                costo_r = ?,
                costo_s = ?,
                costo_i = ?,
                flete = ?,
                estado = 'RECIBIDO',
                fecha_descarga = ?,
                forma_pago = ?,
                cupones = ?,
                pago = ?,
                ncr_numero = ?,
                ncr_monto = ?
             WHERE id = ?`,
            [
                doc,
                finalObs,
                rDiesel,
                rRegular,
                rSuper,
                rIon,
                costoD,
                costoR,
                costoS,
                costoI,
                flete,
                formattedFechaDescarga,
                cPago,
                cuponesMonto,
                pagoTotal,
                ncrNumero,
                ncrMonto,
                id
            ]
        );

        await conn.query('DELETE FROM combustibles_costos WHERE id_origen = ?', [id]);
        const orderDate = formatOrderDateYMD(order.fecha);

        const costInserts = [
            { code: 'DIESEL', ordered: parseFloat(order.p_diesel) || 0, received: rDiesel, cost: costoD },
            { code: 'REGULAR', ordered: parseFloat(order.p_regular) || 0, received: rRegular, cost: costoR },
            { code: 'SUPER', ordered: parseFloat(order.p_super) || 0, received: rSuper, cost: costoS },
            { code: 'IONDIESEL', ordered: parseFloat(order.p_ion) || 0, received: rIon, cost: costoI }
        ];

        for (const item of costInserts) {
            if ((item.ordered > 0 || item.received > 0) && item.cost > 0) {
                const effectiveCost = item.cost + flete;
                await conn.query(
                    `INSERT INTO combustibles_costos (id_empresa, cod_producto, costo, fecha, pedido, id_origen)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [order.id_estacion, item.code, effectiveCost, orderDate, order.numero, id]
                );
            }
        }

        await conn.commit();

        res.json({
            success: true,
            message: `Pedido #${order.numero || id} recibido exitosamente mediante ${metodoPago === 'TRANSFERENCIA' ? 'Transferencia Bancaria' : 'Cheque'}.`,
            data: {
                id,
                estado: 'RECIBIDO',
                metodo_pago: metodoPago,
                fecha_descarga: formattedFechaDescarga,
                documento: doc,
                observacion: finalObs,
                ncr_numero: ncrNumero,
                ncr_monto: ncrMonto,
                cupones: cuponesMonto,
                pago: pagoTotal,
                forma_pago: cPago,
                r_diesel: rDiesel,
                r_regular: rRegular,
                r_super: rSuper,
                r_ion: rIon,
                costo_d: costoD,
                costo_r: costoR,
                costo_s: costoS,
                costo_i: costoI,
                flete
            }
        });
    } catch (error) {
        if (conn) {
            try { await conn.rollback(); } catch (_) { /* ignore */ }
        }
        sendSafeError(res, error, 'Error al recibir el pedido');
    } finally {
        if (conn) {
            conn.release();
        }
    }
});

router.formatDateToDDMMYYYY = formatDateToDDMMYYYY;
router.formatOrderDateYMD = formatOrderDateYMD;
router.buildOrdersSummary = buildOrdersSummary;
router.validateReceivePayload = validateReceivePayload;
router.resolveStationName = resolveStationName;

module.exports = router;
