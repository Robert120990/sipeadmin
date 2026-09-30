const PDFDocument = require('pdfkit');
const { getAccountingDb, withRetry } = require('../db');
const { numberToWords } = require('../utils/numberToWords');

const TABLE = 'rh_planillas';

const MESES = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MESES_MAYUS = [
    '', 'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

/**
 * Helper para formatear fechas y horas en zona horaria de El Salvador (es-SV)
 */
const formatFechaHora = (dateVal) => {
    if (!dateVal) return null;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('es-SV', {
        timeZone: 'America/El_Salvador',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
};

/**
 * Obtener lista de empresas registradas en Sipe Web SaaS con sus conteos de planillas
 */
const getEmpresas = async () => {
    const db = await getAccountingDb();
    const query = `
        SELECT c.id, c.razon_social, c.nombre_comercial, c.nit, c.nrc, c.logo_url,
               COUNT(DISTINCT p.id) as total_planillas_registros,
               COUNT(DISTINCT CONCAT(p.periodo_anio, '-', p.periodo_mes, '-', p.quincena)) as total_periodos,
               (SELECT COUNT(*) FROM rh_empleados e WHERE e.company_id = c.id AND e.es_activo = 1) as total_empleados_activos
        FROM companies c
        LEFT JOIN ${TABLE} p ON p.company_id = c.id
        GROUP BY c.id, c.razon_social, c.nombre_comercial, c.nit, c.nrc, c.logo_url
        ORDER BY c.razon_social ASC
    `;
    const [rows] = await withRetry(() => db.query(query));
    return rows;
};

/**
 * Obtener sucursales y departamentos para filtros por empresa
 */
const getFiltros = async (companyId) => {
    const db = await getAccountingDb();
    const [branches] = await withRetry(() => db.query(
        'SELECT id, nombre, codigo FROM branches WHERE company_id = ? ORDER BY nombre ASC',
        [companyId]
    ));
    const [deptos] = await withRetry(() => db.query(
        'SELECT id, descripcion, codigo FROM rh_departamentos WHERE company_id = ? ORDER BY descripcion ASC',
        [companyId]
    ));
    return { branches, departamentos: deptos };
};

/**
 * Listar planillas agrupadas por período para la empresa seleccionada
 */
const getPlanillasGrupos = async ({ companyId, anio, mes, quincena, page = 1, limit = 20 }) => {
    const db = await getAccountingDb();
    const p = parseInt(page, 10) || 1;
    const l = parseInt(limit, 10) || 20;
    const offset = (p - 1) * l;

    let where = 'WHERE p.company_id = ?';
    const params = [companyId];

    if (anio) { where += ' AND p.periodo_anio = ?'; params.push(parseInt(anio, 10)); }
    if (mes) { where += ' AND p.periodo_mes = ?'; params.push(parseInt(mes, 10)); }
    if (quincena) { where += ' AND p.quincena = ?'; params.push(quincena); }

    const countSql = `SELECT COUNT(DISTINCT CONCAT(p.periodo_anio, '-', p.periodo_mes, '-', p.quincena)) as total FROM ${TABLE} p ${where}`;
    const [countRows] = await withRetry(() => db.query(countSql, params));
    const total = countRows[0]?.total || 0;

    const dataSql = `
        SELECT p.periodo_anio, p.periodo_mes, p.quincena,
               COUNT(*) as total_empleados,
               ROUND(SUM(p.sueldo_base), 2) as total_sueldos_nominal,
               ROUND(SUM(COALESCE(
                   (SELECT d.valor_ingresado FROM rh_planilla_detalles d WHERE d.planilla_id = p.id AND d.codigo = '01' LIMIT 1),
                   (p.sueldo_base / 30) * COALESCE(p.dias_trabajados, 15)
               )), 2) as total_sueldos_quincenal,
               ROUND(GREATEST(0, SUM(p.total_percepciones) - SUM(COALESCE(
                   (SELECT d.valor_ingresado FROM rh_planilla_detalles d WHERE d.planilla_id = p.id AND d.codigo = '01' LIMIT 1),
                   (p.sueldo_base / 30) * COALESCE(p.dias_trabajados, 15)
               ))), 2) as total_ingresos_adic,
               ROUND(SUM(p.total_percepciones), 2) as total_percepciones,
               ROUND(SUM(p.total_deducciones), 2) as total_deducciones,
               ROUND(SUM(p.descuento_isss), 2) as total_isss,
               ROUND(SUM(p.descuento_afp), 2) as total_afp,
               ROUND(SUM(p.descuento_renta), 2) as total_renta,
               ROUND(SUM(GREATEST(0, p.total_deducciones - (p.descuento_isss + p.descuento_afp + p.descuento_renta))), 2) as total_otras_deducciones,
               ROUND(SUM(p.monto_recibir), 2) as total_neto,
               MIN(p.estado) as estado_general,
               MAX(COALESCE(p.updated_at, p.created_at)) as ultima_modificacion_raw,
               MIN(COALESCE(p.created_at, p.updated_at)) as fecha_creacion_raw,
               SUM(CASE WHEN COALESCE(p.dias_trabajados, 15) < 15 THEN 1 ELSE 0 END) as total_con_faltas,
               SUM(CASE WHEN p.monto_recibir < 0 OR p.sueldo_base <= 0 OR ABS((p.total_percepciones - p.total_deducciones) - p.monto_recibir) > 0.05 THEN 1 ELSE 0 END) as total_errores_calculo
        FROM ${TABLE} p
        ${where}
        GROUP BY p.periodo_anio, p.periodo_mes, p.quincena
        ORDER BY p.periodo_anio DESC, p.periodo_mes DESC, FIELD(p.quincena, 'primera', 'segunda')
        LIMIT ? OFFSET ?
    `;

    const [rows] = await withRetry(() => db.query(dataSql, [...params, l, offset]));

    const mappedRows = rows.map(r => ({
        ...r,
        ultima_modificacion: r.ultima_modificacion_raw,
        ultima_modificacion_formato: formatFechaHora(r.ultima_modificacion_raw || r.fecha_creacion_raw),
        fecha_creacion_formato: formatFechaHora(r.fecha_creacion_raw),
        total_anomalias: Number(r.total_con_faltas || 0) + Number(r.total_errores_calculo || 0)
    }));

    return {
        data: mappedRows,
        total,
        page: p,
        totalPages: Math.ceil(total / l)
    };
};

/**
 * Obtener detalle de empleados y desglose para un período específico
 */
const getPlanillaDetalle = async ({ companyId, anio, mes, quincena, branchIds = [], deptoIds = [], search = '' }) => {
    const db = await getAccountingDb();

    let sql = `
        SELECT p.*,
               e.codigo as empleado_codigo,
               e.nombres as empleado_nombres,
               e.apellidos as empleado_apellidos,
               e.num_dui,
               e.cuenta_planillera,
               e.sueldo_base as emp_sueldo_base,
               e.branch_id,
               e.departamento_personal_id,
               b.nombre as branch_nombre,
               c.descripcion as cargo_nombre,
               d.descripcion as departamento_nombre,
               COALESCE(
                   (SELECT d.valor_ingresado FROM rh_planilla_detalles d WHERE d.planilla_id = p.id AND d.codigo = '01' LIMIT 1),
                   ROUND((p.sueldo_base / 30) * COALESCE(p.dias_trabajados, 15), 2)
               ) as sueldo_quincenal,
               ROUND(GREATEST(0, p.total_percepciones - COALESCE(
                   (SELECT d.valor_ingresado FROM rh_planilla_detalles d WHERE d.planilla_id = p.id AND d.codigo = '01' LIMIT 1),
                   ROUND((p.sueldo_base / 30) * COALESCE(p.dias_trabajados, 15), 2)
               )), 2) as ingresos_adic,
               ROUND(GREATEST(0, p.total_deducciones - (p.descuento_isss + p.descuento_afp + p.descuento_renta)), 2) as otras_deducciones
        FROM ${TABLE} p
        JOIN rh_empleados e ON p.empleado_id = e.id
        LEFT JOIN branches b ON e.branch_id = b.id
        LEFT JOIN rh_cargos c ON e.cargo_id = c.id
        LEFT JOIN rh_departamentos d ON e.departamento_personal_id = d.id
        WHERE p.company_id = ? AND p.periodo_anio = ? AND p.periodo_mes = ? AND p.quincena = ?
    `;

    const params = [companyId, parseInt(anio, 10), parseInt(mes, 10), quincena];

    if (branchIds && branchIds.length > 0) {
        sql += ` AND e.branch_id IN (?)`;
        params.push(branchIds);
    }

    if (deptoIds && deptoIds.length > 0) {
        sql += ` AND e.departamento_personal_id IN (?)`;
        params.push(deptoIds);
    }

    if (search && search.trim()) {
        const s = `%${search.trim()}%`;
        sql += ` AND (e.codigo LIKE ? OR e.nombres LIKE ? OR e.apellidos LIKE ? OR e.num_dui LIKE ?)`;
        params.push(s, s, s, s);
    }

    sql += ` ORDER BY COALESCE(d.descripcion, 'ZZZ') ASC, e.codigo ASC`;

    const [rows] = await withRetry(() => db.query(sql, params));

    if (rows.length === 0) {
        return { empleados: [], totales: null, auditoria: null, periodo_anterior: null };
    }

    // Traer todos los detalles de rubros para estos empleados
    const planillaIds = rows.map(r => r.id);
    const [detallesRows] = await withRetry(() => db.query(`
        SELECT d.planilla_id, d.cuenta_id, d.codigo, d.descripcion, d.operacion, d.tipo_valor,
               d.valor_base, d.valor_ingresado, d.orden
        FROM rh_planilla_detalles d
        WHERE d.planilla_id IN (?)
        ORDER BY d.operacion DESC, d.orden ASC, d.codigo ASC
    `, [planillaIds]));

    const detallesMap = {};
    detallesRows.forEach(d => {
        if (!detallesMap[d.planilla_id]) detallesMap[d.planilla_id] = [];
        detallesMap[d.planilla_id].push(d);
    });

    // Calcular período inmediato anterior (para comparativas y discrepancias)
    const currentAnio = parseInt(anio, 10);
    const currentMes = parseInt(mes, 10);
    let prevAnio = currentAnio;
    let prevMes = currentMes;
    let prevQuincena = 'primera';
    if (quincena === 'segunda') {
        prevQuincena = 'primera';
        prevMes = currentMes;
        prevAnio = currentAnio;
    } else {
        prevQuincena = 'segunda';
        if (currentMes === 1) {
            prevMes = 12;
            prevAnio = currentAnio - 1;
        } else {
            prevMes = currentMes - 1;
            prevAnio = currentAnio;
        }
    }

    // Consultar planillas del período anterior
    const [prevRows] = await withRetry(() => db.query(`
        SELECT p.id, p.empleado_id, p.sueldo_base, p.dias_trabajados, p.total_percepciones, p.total_deducciones, p.monto_recibir,
               e.codigo as empleado_codigo, e.nombres as empleado_nombres, e.apellidos as empleado_apellidos
        FROM ${TABLE} p
        JOIN rh_empleados e ON p.empleado_id = e.id
        WHERE p.company_id = ? AND p.periodo_anio = ? AND p.periodo_mes = ? AND p.quincena = ?
    `, [companyId, prevAnio, prevMes, prevQuincena]));

    const prevEmpsMap = {};
    (prevRows || []).forEach(pr => {
        prevEmpsMap[pr.empleado_id] = pr;
    });

    // Mapear cada empleado con desglose itemizado, jornadas, comparativa y alertas
    const empleadosConDetalle = rows.map(emp => {
        const rubros = detallesMap[emp.id] || [];

        // 1. Desglose detallado de ingresos adicionales (Horas extras, comisiones, bonos, etc.)
        const desglose_ingresos_extra = [];
        // 2. Desglose detallado de deducciones (Préstamos, anticipos, FSV, Procuraduría, etc.)
        const desglose_deducciones_detalle = [];

        rubros.forEach(r => {
            const val = parseFloat(r.valor_ingresado || 0);
            const base = parseFloat(r.valor_base || 0);

            if (r.operacion === 'sumar') {
                if (r.codigo === '01') return; // Sueldo ordinario quincenal
                if (val <= 0 && base <= 0) return; // Ignorar rubros con valor 0 y base 0

                if (r.codigo === '08') {
                    desglose_ingresos_extra.push({
                        codigo: r.codigo,
                        tipo: 'horas_extras_diurnas',
                        descripcion: 'Horas Extras Diurnas (Recargo 100%)',
                        cantidad_base: base,
                        unidad: 'horas',
                        factor: 2.0,
                        monto: val,
                        detalle: base > 0 ? `${base} hrs extras diurnas laboradas` : 'Recargo diurno'
                    });
                } else if (r.codigo === '03') {
                    desglose_ingresos_extra.push({
                        codigo: r.codigo,
                        tipo: 'horas_extras_nocturnas',
                        descripcion: 'Horas Extras Nocturnas (Recargo 150%)',
                        cantidad_base: base,
                        unidad: 'horas',
                        factor: 2.5,
                        monto: val,
                        detalle: base > 0 ? `${base} hrs extras nocturnas laboradas` : 'Recargo nocturno'
                    });
                } else if (r.codigo === '05') {
                    desglose_ingresos_extra.push({
                        codigo: r.codigo,
                        tipo: 'horas_extras_valor',
                        descripcion: 'Horas Extras en Valor',
                        cantidad_base: base,
                        unidad: 'valor',
                        monto: val,
                        detalle: 'Monto directo de horas extras asignado'
                    });
                } else if (r.codigo === '07') {
                    desglose_ingresos_extra.push({
                        codigo: r.codigo,
                        tipo: 'comisiones',
                        descripcion: 'Comisión de Lubricante / Metas de Venta',
                        cantidad_base: base,
                        unidad: 'valor',
                        monto: val,
                        detalle: 'Comisión por ventas de lubricantes o metas operativas'
                    });
                } else if (r.codigo === '11') {
                    desglose_ingresos_extra.push({
                        codigo: r.codigo,
                        tipo: 'turnos_extras',
                        descripcion: 'Turnos Extras Laborados',
                        cantidad_base: base,
                        unidad: 'dias',
                        monto: val,
                        detalle: base > 0 ? `${base} turno(s) extra(s) cubierto(s)` : 'Turno extra'
                    });
                } else if (r.codigo === '02') {
                    desglose_ingresos_extra.push({
                        codigo: r.codigo,
                        tipo: 'bonificaciones',
                        descripcion: 'Bonificación / Incentivo',
                        cantidad_base: base,
                        unidad: 'valor',
                        monto: val,
                        detalle: 'Bono por desempeño o compensación extraordinaria'
                    });
                } else if (r.codigo === '04') {
                    desglose_ingresos_extra.push({
                        codigo: r.codigo,
                        tipo: 'vacaciones',
                        descripcion: 'Vacaciones Anuales Pagadas',
                        cantidad_base: base,
                        unidad: 'valor',
                        monto: val,
                        detalle: 'Pago por descanso vacacional anual'
                    });
                } else if (r.codigo === '14') {
                    desglose_ingresos_extra.push({
                        codigo: r.codigo,
                        tipo: 'dia_feriado',
                        descripcion: 'Día Feriado / Asueto Laborado',
                        cantidad_base: base,
                        unidad: 'valor',
                        monto: val,
                        detalle: 'Compensación legal por laborar en día de asueto nacional'
                    });
                } else if (val > 0) {
                    desglose_ingresos_extra.push({
                        codigo: r.codigo,
                        tipo: 'otro_ingreso',
                        descripcion: r.descripcion || `Rubro ${r.codigo}`,
                        cantidad_base: base,
                        unidad: r.tipo_valor || 'valor',
                        monto: val,
                        detalle: 'Ingreso adicional registrado'
                    });
                }
            } else if (r.operacion === 'restar') {
                if (val <= 0) return; // Ignorar deducciones con valor 0

                if (r.codigo === '09') {
                    desglose_deducciones_detalle.push({
                        codigo: r.codigo,
                        tipo: 'prestamos',
                        descripcion: 'Préstamo de Empresa (Cuota Periódica)',
                        monto: val,
                        detalle: 'Descuento de cuota por préstamo interno concedido'
                    });
                } else if (r.codigo === '06') {
                    desglose_deducciones_detalle.push({
                        codigo: r.codigo,
                        tipo: 'anticipos',
                        descripcion: 'Anticipo de Sueldo',
                        monto: val,
                        detalle: 'Descuento por adelanto de quincena'
                    });
                } else if (r.codigo === '10') {
                    desglose_deducciones_detalle.push({
                        codigo: r.codigo,
                        tipo: 'procuraduria',
                        descripcion: 'Pensión Alimenticia PGR / Procuraduría',
                        monto: val,
                        detalle: 'Retención judicial obligatoria por cuota alimenticia'
                    });
                } else if (r.codigo === '12') {
                    desglose_deducciones_detalle.push({
                        codigo: r.codigo,
                        tipo: 'fsv',
                        descripcion: 'Fondo Social para la Vivienda (FSV)',
                        monto: val,
                        detalle: 'Retención de cuota habitacional FSV'
                    });
                } else if (r.codigo === '13') {
                    desglose_deducciones_detalle.push({
                        codigo: r.codigo,
                        tipo: 'llegadas_tarde',
                        descripcion: 'Descuento por Tardanzas / Impuntualidad',
                        monto: val,
                        detalle: 'Descuento aplicado por minutos tarde acumulados'
                    });
                } else if (val > 0) {
                    desglose_deducciones_detalle.push({
                        codigo: r.codigo,
                        tipo: 'otra_deduccion',
                        descripcion: r.descripcion || `Deducción ${r.codigo}`,
                        monto: val,
                        detalle: 'Deducción o retención adicional'
                    });
                }
            }
        });

        // 3. Resumen de jornada y ausencias
        const diasTrabajados = parseFloat(emp.dias_trabajados !== null && emp.dias_trabajados !== undefined ? emp.dias_trabajados : 15);
        const diasAusente = diasTrabajados < 15 ? (15 - diasTrabajados) : 0;
        const sueldoBaseMensual = parseFloat(emp.sueldo_base || 0);
        const descuentoAusencia = diasAusente > 0 ? parseFloat(((sueldoBaseMensual / 30) * diasAusente).toFixed(2)) : 0;
        const info_jornada = {
            dias_trabajados: diasTrabajados,
            dias_ausente: diasAusente,
            descuento_ausencia: descuentoAusencia,
            tiene_ausencia: diasAusente > 0
        };

        // 4. Comparativa contra período anterior
        const prevEmp = prevEmpsMap[emp.empleado_id];
        let comparativa_previo = null;
        if (!prevEmp) {
            comparativa_previo = {
                tenia_registro: false,
                es_nuevo: true,
                monto_recibir_previo: null,
                variacion_monto: null,
                variacion_pct: null,
                tiene_variacion_abrupta: false
            };
        } else {
            const prevNeto = parseFloat(prevEmp.monto_recibir || 0);
            const currNeto = parseFloat(emp.monto_recibir || 0);
            const diffNeto = parseFloat((currNeto - prevNeto).toFixed(2));
            const pctNeto = prevNeto > 0 ? parseFloat(((diffNeto / prevNeto) * 100).toFixed(1)) : 0;
            const esAbrupta = Math.abs(pctNeto) >= 20 && Math.abs(diffNeto) >= 40;
            comparativa_previo = {
                tenia_registro: true,
                es_nuevo: false,
                monto_recibir_previo: prevNeto,
                variacion_monto: diffNeto,
                variacion_pct: pctNeto,
                tiene_variacion_abrupta: esAbrupta
            };
        }

        // 5. Alertas de validación y discrepancias individuales
        const alertas_empleado = [];
        const empSueldo = parseFloat(emp.sueldo_base || 0);
        const empNeto = parseFloat(emp.monto_recibir || 0);
        const empDev = parseFloat(emp.total_percepciones || 0);
        const empDed = parseFloat(emp.total_deducciones || 0);
        const difMat = Math.abs((empDev - empDed) - empNeto);

        if (empSueldo <= 0) {
            alertas_empleado.push({
                tipo: 'critica',
                codigo: 'SUELDO_BASE_CERO',
                titulo: 'Sueldo Base Inválido',
                descripcion: 'El sueldo base asignado en Sipe Web es $0.00 o menor.'
            });
        }
        if (empNeto < 0) {
            alertas_empleado.push({
                tipo: 'critica',
                codigo: 'LIQUIDO_NEGATIVO',
                titulo: 'Líquido Negativo',
                descripcion: `El monto a recibir es negativo ($${empNeto.toFixed(2)}) debido a deducciones excesivas.`
            });
        }
        if (difMat > 0.05) {
            alertas_empleado.push({
                tipo: 'critica',
                codigo: 'DESCUADRE_MATEMATICO',
                titulo: 'Descuadre Matemático',
                descripcion: `Percepciones ($${empDev.toFixed(2)}) - Deducciones ($${empDed.toFixed(2)}) difiere del neto ($${empNeto.toFixed(2)}) por $${difMat.toFixed(2)}.`
            });
        }
        if (diasTrabajados > 15) {
            alertas_empleado.push({
                tipo: 'advertencia',
                codigo: 'DIAS_EXCESIVOS',
                titulo: 'Días Exceden el Período',
                descripcion: `Registra ${diasTrabajados} días trabajados (el estándar quincenal es 15 días).`
            });
        }
        if (diasAusente > 0) {
            alertas_empleado.push({
                tipo: 'advertencia',
                codigo: 'AUSENCIA_DIAS',
                titulo: `Ausencia de ${diasAusente} día(s)`,
                descripcion: `Faltó ${diasAusente} día(s) en la quincena. Descuento estimado de sueldo: -$${descuentoAusencia.toFixed(2)}.`
            });
        }
        if (comparativa_previo.es_nuevo) {
            alertas_empleado.push({
                tipo: 'info',
                codigo: 'NUEVO_INGRESO',
                titulo: 'Nuevo en Planilla',
                descripcion: 'Colaborador de nuevo ingreso; no figuraba en la quincena anterior.'
            });
        } else if (comparativa_previo.tiene_variacion_abrupta) {
            alertas_empleado.push({
                tipo: 'discrepancia',
                codigo: 'VARIACION_ABRUPTA',
                titulo: 'Variación Notoria de Sueldo',
                descripcion: `Líquido varió ${comparativa_previo.variacion_monto > 0 ? '+' : ''}$${comparativa_previo.variacion_monto.toFixed(2)} (${comparativa_previo.variacion_pct > 0 ? '+' : ''}${comparativa_previo.variacion_pct}%) respecto a quincena previa.`
            });
        }

        return {
            ...emp,
            rubros,
            desglose_ingresos_extra,
            desglose_deducciones_detalle,
            info_jornada,
            comparativa_previo,
            alertas: alertas_empleado
        };
    });

    // Calcular totales resumidos
    const totales = {
        total_empleados: rows.length,
        total_sueldos_quincenal: rows.reduce((s, r) => s + parseFloat(r.sueldo_quincenal || 0), 0),
        total_ingresos_adic: rows.reduce((s, r) => s + parseFloat(r.ingresos_adic || 0), 0),
        total_percepciones: rows.reduce((s, r) => s + parseFloat(r.total_percepciones || 0), 0),
        total_isss: rows.reduce((s, r) => s + parseFloat(r.descuento_isss || 0), 0),
        total_afp: rows.reduce((s, r) => s + parseFloat(r.descuento_afp || 0), 0),
        total_renta: rows.reduce((s, r) => s + parseFloat(r.descuento_renta || 0), 0),
        total_otras_deducciones: rows.reduce((s, r) => s + parseFloat(r.otras_deducciones || 0), 0),
        total_deducciones: rows.reduce((s, r) => s + parseFloat(r.total_deducciones || 0), 0),
        total_neto: rows.reduce((s, r) => s + parseFloat(r.monto_recibir || 0), 0),
        estado_general: rows.some(r => r.estado !== 'pagada') ? 'pendiente' : 'pagada'
    };

    // Fechas y horas de modificación de la planilla
    const maxUpdated = rows.reduce((max, r) => {
        const d = r.updated_at || r.created_at;
        return !max || (d && new Date(d) > new Date(max)) ? d : max;
    }, null);
    const minCreated = rows.reduce((min, r) => {
        const d = r.created_at || r.updated_at;
        return !min || (d && new Date(d) < new Date(min)) ? d : min;
    }, null);

    // Comparativa global contra período anterior
    const prevExiste = (prevRows && prevRows.length > 0);
    const prevTotalNeto = prevExiste ? prevRows.reduce((acc, r) => acc + parseFloat(r.monto_recibir || 0), 0) : 0;
    const diffGlobalNeto = prevExiste ? parseFloat((totales.total_neto - prevTotalNeto).toFixed(2)) : 0;
    const pctGlobalNeto = (prevExiste && prevTotalNeto > 0) ? parseFloat(((diffGlobalNeto / prevTotalNeto) * 100).toFixed(1)) : 0;

    const empleadosNuevosList = rows.filter(r => !prevEmpsMap[r.empleado_id]).map(r => ({
        empleado_id: r.empleado_id,
        codigo: r.empleado_codigo,
        nombre: `${r.empleado_nombres} ${r.empleado_apellidos}`.trim(),
        monto_recibir: parseFloat(r.monto_recibir || 0)
    }));

    const currentEmpIdsSet = new Set(rows.map(r => r.empleado_id));
    const empleadosBajasList = (prevRows || []).filter(pr => !currentEmpIdsSet.has(pr.empleado_id)).map(pr => ({
        empleado_id: pr.empleado_id,
        codigo: pr.empleado_codigo,
        nombre: `${pr.empleado_nombres} ${pr.empleado_apellidos}`.trim(),
        monto_recibir_previo: parseFloat(pr.monto_recibir || 0)
    }));

    // Consolidar todas las alertas en un arreglo global
    const todasLasAlertas = [];

    if (prevExiste && Math.abs(pctGlobalNeto) >= 15 && Math.abs(diffGlobalNeto) >= 200) {
        todasLasAlertas.push({
            tipo: 'discrepancia',
            codigo: 'DISCREPANCIA_NOMINA_GLOBAL',
            titulo: 'Variación Global de Nómina Neta',
            descripcion: `La nómina neta varió un ${pctGlobalNeto > 0 ? '+' : ''}${pctGlobalNeto}% (${diffGlobalNeto > 0 ? '+' : ''}$${diffGlobalNeto.toFixed(2)}) comparado con la quincena previa ($${prevTotalNeto.toFixed(2)})`,
            empleado_codigo: null,
            empleado_nombre: null
        });
    }

    if (empleadosNuevosList.length > 0) {
        todasLasAlertas.push({
            tipo: 'info',
            codigo: 'EMPLEADOS_NUEVOS_TOTAL',
            titulo: `${empleadosNuevosList.length} Nuevo(s) Colaborador(es)`,
            descripcion: `Se incorporaron a esta planilla: ${empleadosNuevosList.map(e => `${e.nombre} (${e.codigo})`).join(', ')}`,
            empleado_codigo: null,
            empleado_nombre: null
        });
    }

    if (empleadosBajasList.length > 0) {
        todasLasAlertas.push({
            tipo: 'advertencia',
            codigo: 'EMPLEADOS_BAJAS_TOTAL',
            titulo: `${empleadosBajasList.length} Colaborador(es) ausente(s) respecto a quincena anterior`,
            descripcion: `No figuran en la planilla actual: ${empleadosBajasList.map(e => `${e.nombre} (${e.codigo})`).join(', ')}`,
            empleado_codigo: null,
            empleado_nombre: null
        });
    }

    // Agregar alertas de cada empleado
    empleadosConDetalle.forEach(emp => {
        (emp.alertas || []).forEach(a => {
            todasLasAlertas.push({
                tipo: a.tipo,
                codigo: a.codigo,
                titulo: a.titulo,
                descripcion: a.descripcion,
                empleado_codigo: emp.empleado_codigo,
                empleado_nombre: `${emp.empleado_nombres} ${emp.empleado_apellidos}`.trim()
            });
        });
    });

    const totalAlertasCriticas = todasLasAlertas.filter(a => a.tipo === 'critica').length;
    const totalAdvertencias = todasLasAlertas.filter(a => a.tipo === 'advertencia').length;
    const totalDiscrepancias = todasLasAlertas.filter(a => a.tipo === 'discrepancia').length;

    const auditoria = {
        ultima_modificacion: maxUpdated || minCreated,
        ultima_modificacion_formato: formatFechaHora(maxUpdated || minCreated),
        fecha_creacion: minCreated,
        fecha_creacion_formato: formatFechaHora(minCreated),
        total_alertas_criticas: totalAlertasCriticas,
        total_advertencias: totalAdvertencias,
        total_discrepancias: totalDiscrepancias,
        total_alertas: todasLasAlertas.length,
        alertas: todasLasAlertas
    };

    const periodo_anterior = {
        existe: prevExiste,
        periodo_anio: prevAnio,
        periodo_mes: prevMes,
        quincena: prevQuincena,
        total_empleados: prevRows ? prevRows.length : 0,
        total_neto: prevTotalNeto,
        variacion_neta_monto: diffGlobalNeto,
        variacion_neta_pct: pctGlobalNeto,
        empleados_nuevos: empleadosNuevosList,
        empleados_bajas: empleadosBajasList
    };

    return {
        empleados: empleadosConDetalle,
        totales,
        auditoria,
        periodo_anterior
    };
};

/**
 * Exportar archivo bancario (CSV o TXT)
 */
const exportBancario = async ({ companyId, anio, mes, quincena, branchIds = [], deptoIds = [] }) => {
    const { empleados } = await getPlanillaDetalle({ companyId, anio, mes, quincena, branchIds, deptoIds });

    if (!empleados || empleados.length === 0) {
        throw new Error('No se encontraron registros para el período y filtros seleccionados');
    }

    // CSV: UTF-8 BOM, sep=,, cuenta entre ="...", monto, nombre completo
    const csvRows = empleados.map(r => {
        const nombre = `${r.empleado_nombres || ''} ${r.empleado_apellidos || ''}`.trim().replace(/"/g, '""');
        const cuenta = r.cuenta_planillera || '';
        const monto = parseFloat(r.monto_recibir || 0).toFixed(2);
        return `="${cuenta}",${monto},"${nombre}"`;
    });
    const csvContent = '\uFEFFsep=,\n' + csvRows.join('\n');

    // TXT: separado por tabulaciones (cuenta\tmonto\tnombre)
    const txtRows = empleados.map(r => {
        const nombre = `${r.empleado_nombres || ''} ${r.empleado_apellidos || ''}`.trim();
        const cuenta = r.cuenta_planillera || '';
        const monto = parseFloat(r.monto_recibir || 0).toFixed(2);
        return `${cuenta}\t${monto}\t${nombre}`;
    });
    const txtContent = txtRows.join('\n');

    const db = await getAccountingDb();
    const [compRows] = await withRetry(() => db.query('SELECT nombre_comercial, razon_social FROM companies WHERE id = ?', [companyId]));
    const compName = (compRows[0]?.nombre_comercial || compRows[0]?.razon_social || 'EMPRESA').replace(/[^a-zA-Z0-9]/g, '_');
    const baseName = `PLANILLA_BANCARIA_${compName}_${anio}_${String(mes).padStart(2, '0')}_${quincena}`;

    return {
        csv: csvContent,
        txt: txtContent,
        fileNameBase: baseName
    };
};

/**
 * Helpers para PDF Oficial
 */
function formatCurrency(val, showDashWhenZero = true) {
    if (val === null || val === undefined || isNaN(val)) return '';
    const n = Number(val);
    if (Math.abs(n) < 0.001) {
        return showDashWhenZero ? '$ -' : '$ 0.00';
    }
    const formatted = Math.abs(n).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    if (n < 0) {
        return `$(${formatted})`;
    }
    return `$ ${formatted}`;
}

function renderHeader(doc, company, title, periodText, orientation = 'landscape', subtitle = null) {
    const pageWidth = orientation === 'landscape' ? 792 : 612;
    const contentWidth = pageWidth - 60;

    const now = new Date();
    const dateStr = now.toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    doc.fontSize(6.5).font('Helvetica').fillColor('#64748b').text(`${dateStr}  ${timeStr}`, 30, 20);

    const companyName = (company.razon_social || company.nombre_comercial || 'EMPRESA REGISTRADA').toUpperCase();
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text(companyName, 30, 20, { align: 'center', width: contentWidth });

    doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#0f172a').text(title.toUpperCase(), 30, 35, { align: 'center', width: contentWidth });

    let taxText = `NÚMERO DE REGISTRO DE I.V.A.: ${company.nrc || 'N/A'}    |    NIT: ${company.nit || 'N/A'}`;
    if (subtitle) {
        taxText += `    |    ${subtitle.toUpperCase()}`;
    }
    doc.fontSize(8).font('Helvetica').fillColor('#475569').text(taxText, 30, 49, { align: 'center', width: contentWidth });

    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#1e293b').text(periodText.toUpperCase(), 30, 61, { align: 'center', width: contentWidth });

    doc.fontSize(7.5).font('Helvetica').fillColor('#64748b').text('(CIFRAS EXPRESADAS EN DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA)', 30, 73, { align: 'center', width: contentWidth });

    doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(30, 85).lineTo(pageWidth - 30, 85).stroke();

    doc.y = 92;
    return 92;
}

function renderPageNumbers(doc) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const oldBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.fontSize(7).font('Helvetica').fillColor('#94a3b8');
        doc.text(`Página ${i + 1} de ${range.count}`, 30, doc.page.height - 20, {
            align: 'center',
            width: doc.page.width - 60,
            lineBreak: false
        });
        doc.page.margins.bottom = oldBottom;
    }
}

/**
 * Generar Reporte de Planilla Oficial en PDF (Formato Carta Horizontal)
 */
const generatePlanillaReportePDF = async ({ companyId, anio, mes, quincena, branchIds = [], deptoIds = [] }) => {
    const db = await getAccountingDb();
    const [compRows] = await withRetry(() => db.query('SELECT * FROM companies WHERE id = ?', [companyId]));
    const company = compRows[0] || { razon_social: 'EMPRESA REGISTRADA', nit: 'N/A', nrc: 'N/A' };

    const { empleados, totales } = await getPlanillaDetalle({ companyId, anio, mes, quincena, branchIds, deptoIds });

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                margin: 30,
                size: 'LETTER',
                layout: 'landscape',
                bufferPages: true
            });

            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', err => reject(err));

            const mesNombre = MESES_MAYUS[parseInt(mes, 10)] || '';
            const quincenaText = quincena === 'primera' ? 'PRIMERA QUINCENA' : 'SEGUNDA QUINCENA';
            const periodText = `CORRESPONDIENTE AL MES DE ${mesNombre} DE ${anio} - ${quincenaText}`;
            const title = 'Planilla Oficial de Sueldos y Salarios';
            const startX = 30;
            const contentWidth = 732;

            renderHeader(doc, company, title, periodText, 'landscape');

            const colW = {
                num: 16,
                code: 36,
                name: 145,
                cargo: 85,
                dias: 22,
                sueldoQuincenal: 46,
                ingresosAdic: 44,
                devengado: 48,
                isss: 36,
                afp: 36,
                renta: 38,
                otrasDed: 44,
                totalDed: 48,
                neto: 68
            };

            const drawTableHeader = (yPos) => {
                doc.rect(startX, yPos, contentWidth, 14).fill('#f1f5f9');
                doc.fontSize(6.8).font('Helvetica-Bold').fillColor('#0f172a');
                let x = startX + 2;

                doc.text('Nº', x, yPos + 3.5, { width: colW.num, align: 'center', lineBreak: false }); x += colW.num;
                doc.text('CÓDIGO', x, yPos + 3.5, { width: colW.code, lineBreak: false }); x += colW.code;
                doc.text('EMPLEADO', x, yPos + 3.5, { width: colW.name, lineBreak: false }); x += colW.name;
                doc.text('CARGO / DEPTO', x, yPos + 3.5, { width: colW.cargo, lineBreak: false }); x += colW.cargo;
                doc.text('DÍAS', x, yPos + 3.5, { width: colW.dias, align: 'center', lineBreak: false }); x += colW.dias;
                doc.text('S. QUINC.', x, yPos + 3.5, { width: colW.sueldoQuincenal - 3, align: 'right', lineBreak: false }); x += colW.sueldoQuincenal;
                doc.text('ING. ADIC.', x, yPos + 3.5, { width: colW.ingresosAdic - 3, align: 'right', lineBreak: false }); x += colW.ingresosAdic;
                doc.text('TOTAL DEV.', x, yPos + 3.5, { width: colW.devengado - 3, align: 'right', lineBreak: false }); x += colW.devengado;
                doc.text('ISSS', x, yPos + 3.5, { width: colW.isss - 3, align: 'right', lineBreak: false }); x += colW.isss;
                doc.text('AFP', x, yPos + 3.5, { width: colW.afp - 3, align: 'right', lineBreak: false }); x += colW.afp;
                doc.text('RENTA', x, yPos + 3.5, { width: colW.renta - 3, align: 'right', lineBreak: false }); x += colW.renta;
                doc.text('OTRAS DED.', x, yPos + 3.5, { width: colW.otrasDed - 3, align: 'right', lineBreak: false }); x += colW.otrasDed;
                doc.text('TOTAL DED.', x, yPos + 3.5, { width: colW.totalDed - 3, align: 'right', lineBreak: false }); x += colW.totalDed;
                doc.text('NETO A PAGAR', x, yPos + 3.5, { width: colW.neto - 3, align: 'right', lineBreak: false });
            };

            let currentY = 94;
            drawTableHeader(currentY);
            currentY += 15;

            // Agrupar por departamento si hay varios
            const deptos = {};
            empleados.forEach(emp => {
                const deptoKey = emp.departamento_nombre || 'GENERAL';
                if (!deptos[deptoKey]) deptos[deptoKey] = [];
                deptos[deptoKey].push(emp);
            });

            let globalIndex = 1;

            Object.entries(deptos).forEach(([deptoName, deptoEmployees]) => {
                // Verificar salto de página para el encabezado del departamento
                if (currentY > 520) {
                    doc.addPage();
                    currentY = renderHeader(doc, company, title, periodText, 'landscape');
                    drawTableHeader(currentY);
                    currentY += 15;
                }

                // Header de Departamento
                doc.rect(startX, currentY, contentWidth, 12).fill('#e2e8f0');
                doc.fontSize(7).font('Helvetica-Bold').fillColor('#1e293b');
                doc.text(`DEPARTAMENTO: ${deptoName.toUpperCase()} (${deptoEmployees.length} empleados)`, startX + 6, currentY + 2.5);
                currentY += 13;

                deptoEmployees.forEach(emp => {
                    if (currentY > 540) {
                        doc.addPage();
                        currentY = renderHeader(doc, company, title, periodText, 'landscape');
                        drawTableHeader(currentY);
                        currentY += 15;
                    }

                    const isEven = globalIndex % 2 === 0;
                    if (isEven) {
                        doc.rect(startX, currentY, contentWidth, 11).fill('#f8fafc');
                    }

                    doc.fontSize(6.5).font('Helvetica').fillColor('#334155');
                    let x = startX + 2;

                    doc.text(String(globalIndex), x, currentY + 2, { width: colW.num, align: 'center', lineBreak: false }); x += colW.num;
                    doc.text(emp.empleado_codigo || '', x, currentY + 2, { width: colW.code, lineBreak: false }); x += colW.code;

                    const fullName = `${emp.empleado_nombres || ''} ${emp.empleado_apellidos || ''}`.trim();
                    doc.text(fullName, x, currentY + 2, { width: colW.name - 3, lineBreak: false }); x += colW.name;

                    const cargoText = emp.cargo_nombre || emp.branch_nombre || '—';
                    doc.text(cargoText, x, currentY + 2, { width: colW.cargo - 3, lineBreak: false }); x += colW.cargo;

                    doc.text(String(emp.dias_trabajados || 15), x, currentY + 2, { width: colW.dias, align: 'center', lineBreak: false }); x += colW.dias;
                    doc.text(formatCurrency(emp.sueldo_quincenal), x, currentY + 2, { width: colW.sueldoQuincenal - 3, align: 'right', lineBreak: false }); x += colW.sueldoQuincenal;
                    doc.text(formatCurrency(emp.ingresos_adic), x, currentY + 2, { width: colW.ingresosAdic - 3, align: 'right', lineBreak: false }); x += colW.ingresosAdic;

                    doc.font('Helvetica-Bold').fillColor('#0284c7');
                    doc.text(formatCurrency(emp.total_percepciones), x, currentY + 2, { width: colW.devengado - 3, align: 'right', lineBreak: false }); x += colW.devengado;

                    doc.font('Helvetica').fillColor('#334155');
                    doc.text(formatCurrency(emp.descuento_isss), x, currentY + 2, { width: colW.isss - 3, align: 'right', lineBreak: false }); x += colW.isss;
                    doc.text(formatCurrency(emp.descuento_afp), x, currentY + 2, { width: colW.afp - 3, align: 'right', lineBreak: false }); x += colW.afp;
                    doc.text(formatCurrency(emp.descuento_renta), x, currentY + 2, { width: colW.renta - 3, align: 'right', lineBreak: false }); x += colW.renta;
                    doc.text(formatCurrency(emp.otras_deducciones), x, currentY + 2, { width: colW.otrasDed - 3, align: 'right', lineBreak: false }); x += colW.otrasDed;

                    doc.font('Helvetica-Bold').fillColor('#dc2626');
                    doc.text(formatCurrency(emp.total_deducciones), x, currentY + 2, { width: colW.totalDed - 3, align: 'right', lineBreak: false }); x += colW.totalDed;

                    doc.font('Helvetica-Bold').fillColor('#059669');
                    doc.text(formatCurrency(emp.monto_recibir), x, currentY + 2, { width: colW.neto - 3, align: 'right', lineBreak: false });

                    currentY += 11;
                    globalIndex++;
                });

                currentY += 4;
            });

            // Fila de Gran Total
            if (currentY > 520) {
                doc.addPage();
                currentY = renderHeader(doc, company, title, periodText, 'landscape');
                drawTableHeader(currentY);
                currentY += 15;
            }

            doc.rect(startX, currentY, contentWidth, 14).fill('#0f172a');
            doc.fontSize(7).font('Helvetica-Bold').fillColor('#ffffff');
            let x = startX + 2;

            doc.text('TOTAL GENERAL', x, currentY + 3.5, { width: colW.num + colW.code + colW.name + colW.cargo + colW.dias, lineBreak: false });
            x += (colW.num + colW.code + colW.name + colW.cargo + colW.dias);

            doc.text(formatCurrency(totales?.total_sueldos_quincenal), x, currentY + 3.5, { width: colW.sueldoQuincenal - 3, align: 'right', lineBreak: false }); x += colW.sueldoQuincenal;
            doc.text(formatCurrency(totales?.total_ingresos_adic), x, currentY + 3.5, { width: colW.ingresosAdic - 3, align: 'right', lineBreak: false }); x += colW.ingresosAdic;
            doc.text(formatCurrency(totales?.total_percepciones), x, currentY + 3.5, { width: colW.devengado - 3, align: 'right', lineBreak: false }); x += colW.devengado;
            doc.text(formatCurrency(totales?.total_isss), x, currentY + 3.5, { width: colW.isss - 3, align: 'right', lineBreak: false }); x += colW.isss;
            doc.text(formatCurrency(totales?.total_afp), x, currentY + 3.5, { width: colW.afp - 3, align: 'right', lineBreak: false }); x += colW.afp;
            doc.text(formatCurrency(totales?.total_renta), x, currentY + 3.5, { width: colW.renta - 3, align: 'right', lineBreak: false }); x += colW.renta;
            doc.text(formatCurrency(totales?.total_otras_deducciones), x, currentY + 3.5, { width: colW.otrasDed - 3, align: 'right', lineBreak: false }); x += colW.otrasDed;
            doc.text(formatCurrency(totales?.total_deducciones), x, currentY + 3.5, { width: colW.totalDed - 3, align: 'right', lineBreak: false }); x += colW.totalDed;
            doc.text(formatCurrency(totales?.total_neto), x, currentY + 3.5, { width: colW.neto - 3, align: 'right', lineBreak: false });

            currentY += 22;
            doc.fontSize(7.5).font('Helvetica').fillColor('#475569');
            doc.text(`Total de Empleados en Planilla: ${empleados.length}   |   Estado: ${totales?.estado_general === 'pagada' ? 'CERRADA / PAGADA' : 'ABIERTA / EN PROCESO'}`, startX, currentY);
            doc.text('FIN DEL REPORTE.', startX, currentY + 11);

            renderPageNumbers(doc);
            doc.end();
        } catch (e) {
            reject(e);
        }
    });
};

/**
 * Renderiza un solo recibo en una sección de la página vertical (Letter Portrait)
 */
function drawReciboSection(doc, emp, company, anio, mes, quincena, yOffset) {
    const startX = 36;
    const contentW = 540;
    let y = yOffset;

    const mesNom = MESES[parseInt(mes, 10)] || '';
    const qNom = quincena === 'primera' ? '1ra Quincena' : '2da Quincena';
    const periodoTexto = `${qNom.toUpperCase()} DE ${mesNom.toUpperCase()} ${anio}`;

    // Header del Recibo
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#0f172a');
    doc.text((company.razon_social || company.nombre_comercial || 'EMPRESA').toUpperCase(), startX, y, { width: 340, ellipsis: true });
    doc.fontSize(7).font('Helvetica').fillColor('#64748b');
    doc.text(`NIT: ${company.nit || 'N/A'}  |  NRC: ${company.nrc || 'N/A'}`, startX, y + 12);

    // Titulo de Recibo
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e40af');
    doc.text('COMPROBANTE DE PAGO DE SALARIOS', startX + 330, y, { width: 210, align: 'right' });
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#3b82f6');
    doc.text(`PERÍODO: ${periodoTexto}`, startX + 330, y + 12, { width: 210, align: 'right' });

    y += 24;
    doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(startX, y).lineTo(startX + contentW, y).stroke();
    y += 5;

    // Ficha de Empleado
    doc.rect(startX, y, contentW, 36).fill('#f8fafc').stroke('#cbd5e1');

    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#64748b');
    doc.text('CÓDIGO:', startX + 8, y + 4);
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#0f172a');
    doc.text(emp.empleado_codigo || '—', startX + 8, y + 13);

    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#64748b');
    doc.text('EMPLEADO:', startX + 60, y + 4);
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#0f172a');
    const empNombre = `${emp.empleado_nombres || ''} ${emp.empleado_apellidos || ''}`.trim();
    doc.text(empNombre, startX + 60, y + 13, { width: 170, ellipsis: true });

    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#64748b');
    doc.text('CARGO / DEPTO:', startX + 240, y + 4);
    doc.fontSize(7.5).font('Helvetica').fillColor('#0f172a');
    doc.text(`${emp.cargo_nombre || '—'} / ${emp.departamento_nombre || '—'}`, startX + 240, y + 13, { width: 150, ellipsis: true });

    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#64748b');
    doc.text('DUI:', startX + 400, y + 4);
    doc.fontSize(7.5).font('Helvetica').fillColor('#0f172a');
    doc.text(emp.num_dui || '—', startX + 400, y + 13);

    // Línea 2 ficha
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#64748b');
    doc.text('SUELDO MENSUAL:', startX + 8, y + 23);
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#0f172a');
    doc.text(formatCurrency(emp.sueldo_base), startX + 80, y + 23);

    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#64748b');
    doc.text('DÍAS TRABAJADOS:', startX + 160, y + 23);
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#0f172a');
    doc.text(String(emp.dias_trabajados || 15), startX + 235, y + 23);

    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#64748b');
    doc.text('CUENTA BANCO:', startX + 270, y + 23);
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#0f172a');
    doc.text(emp.cuenta_planillera || '—', startX + 335, y + 23);

    y += 42;

    // Tabla 2 Columnas (Ingresos a la izquierda, Deducciones a la derecha)
    const colHalfW = 265;
    const rightColX = startX + 275;

    // Header Izquierdo
    doc.rect(startX, y, colHalfW, 12).fill('#f1f5f9');
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#0f172a');
    doc.text('PERCEPCIONES / INGRESOS', startX + 4, y + 2.5);
    doc.text('MONTO', startX + colHalfW - 40, y + 2.5, { width: 36, align: 'right' });

    // Header Derecho
    doc.rect(rightColX, y, colHalfW, 12).fill('#f1f5f9');
    doc.text('DEDUCCIONES DE LEY Y OTRAS', rightColX + 4, y + 2.5);
    doc.text('MONTO', rightColX + colHalfW - 40, y + 2.5, { width: 36, align: 'right' });

    y += 14;

    const rubros = emp.rubros || [];
    const ingresos = rubros.filter(r => r.operacion === 'sumar');
    const deducciones = rubros.filter(r => r.operacion === 'restar');

    // Siempre asegurar que el sueldo base quincenal figure si no viene en rubros
    if (!ingresos.some(i => i.codigo === '01')) {
        ingresos.unshift({
            codigo: '01',
            descripcion: 'SUELDO QUINCENAL ORDINARIO',
            valor_ingresado: emp.sueldo_quincenal
        });
    }

    // Agregar deducciones de ley si no están desglosadas en rubros
    if (!deducciones.some(d => d.codigo === 'ISSS' || (d.descripcion || '').includes('ISSS')) && parseFloat(emp.descuento_isss || 0) > 0) {
        deducciones.push({ codigo: 'ISSS', descripcion: 'SEGURO SOCIAL (ISSS 3%)', valor_ingresado: emp.descuento_isss });
    }
    if (!deducciones.some(d => d.codigo === 'AFP' || (d.descripcion || '').includes('AFP')) && parseFloat(emp.descuento_afp || 0) > 0) {
        deducciones.push({ codigo: 'AFP', descripcion: 'FONDO DE PENSIONES (AFP 7.25%)', valor_ingresado: emp.descuento_afp });
    }
    if (!deducciones.some(d => d.codigo === 'RENTA' || (d.descripcion || '').includes('RENTA')) && parseFloat(emp.descuento_renta || 0) > 0) {
        deducciones.push({ codigo: 'RENTA', descripcion: 'IMPUESTO SOBRE LA RENTA', valor_ingresado: emp.descuento_renta });
    }

    const maxLines = Math.max(ingresos.length, deducciones.length, 3);
    const lineH = 9.5;

    for (let i = 0; i < maxLines; i++) {
        const ing = ingresos[i];
        const ded = deducciones[i];

        doc.fontSize(6).font('Helvetica').fillColor('#334155');

        if (ing) {
            doc.text(ing.descripcion || ing.codigo, startX + 4, y, { width: colHalfW - 50, ellipsis: true });
            doc.text(formatCurrency(ing.valor_ingresado), startX + colHalfW - 40, y, { width: 36, align: 'right' });
        }

        if (ded) {
            doc.text(ded.descripcion || ded.codigo, rightColX + 4, y, { width: colHalfW - 50, ellipsis: true });
            doc.text(formatCurrency(ded.valor_ingresado), rightColX + colHalfW - 40, y, { width: 36, align: 'right' });
        }

        y += lineH;
    }

    // Totales de columnas
    doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(startX, y).lineTo(startX + colHalfW, y).stroke();
    doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(rightColX, y).lineTo(rightColX + colHalfW, y).stroke();
    y += 2;

    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#0284c7');
    doc.text('TOTAL PERCEPCIONES:', startX + 4, y);
    doc.text(formatCurrency(emp.total_percepciones), startX + colHalfW - 45, y, { width: 41, align: 'right' });

    doc.font('Helvetica-Bold').fillColor('#dc2626');
    doc.text('TOTAL DEDUCCIONES:', rightColX + 4, y);
    doc.text(formatCurrency(emp.total_deducciones), rightColX + colHalfW - 45, y, { width: 41, align: 'right' });

    y += 13;

    // Caja de Neto a Recibir
    doc.rect(startX, y, contentW, 20).fill('#ecfdf5').stroke('#10b981');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#065f46');
    doc.text('LÍQUIDO A RECIBIR:', startX + 8, y + 5);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#047857');
    doc.text(formatCurrency(emp.monto_recibir), startX + 105, y + 4.5);

    const sonLetras = numberToWords(emp.monto_recibir);
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#047857');
    doc.text(`SON: ${sonLetras}`, startX + 175, y + 6, { width: 355, ellipsis: true });

    y += 25;

    // Firmas
    const sigW = 160;
    const sigY = y + 25;

    // Firma empleado
    doc.strokeColor('#94a3b8').lineWidth(0.5).moveTo(startX + 30, sigY).lineTo(startX + 30 + sigW, sigY).stroke();
    doc.fontSize(6.5).font('Helvetica').fillColor('#475569');
    doc.text('RECIBÍ CONFORME (FIRMA EMPLEADO)', startX + 30, sigY + 3, { width: sigW, align: 'center' });
    doc.text(`DUI: ${emp.num_dui || '—'}`, startX + 30, sigY + 11, { width: sigW, align: 'center' });

    // Firma empresa
    doc.strokeColor('#94a3b8').lineWidth(0.5).moveTo(startX + contentW - 30 - sigW, sigY).lineTo(startX + contentW - 30, sigY).stroke();
    doc.fontSize(6.5).font('Helvetica').fillColor('#475569');
    doc.text('RECURSOS HUMANOS / AUTORIZADO', startX + contentW - 30 - sigW, sigY + 3, { width: sigW, align: 'center' });
    doc.text('SIPE WEB SAAS', startX + contentW - 30 - sigW, sigY + 11, { width: sigW, align: 'center' });
}

/**
 * Generar Recibos Masivos en PDF (2 recibos por página, Carta Vertical)
 */
const generateRecibosMasivosPDF = async ({ companyId, anio, mes, quincena, branchIds = [], deptoIds = [] }) => {
    const db = await getAccountingDb();
    const [compRows] = await withRetry(() => db.query('SELECT * FROM companies WHERE id = ?', [companyId]));
    const company = compRows[0] || { razon_social: 'EMPRESA REGISTRADA', nit: 'N/A', nrc: 'N/A' };

    const { empleados } = await getPlanillaDetalle({ companyId, anio, mes, quincena, branchIds, deptoIds });

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                margin: 20,
                size: 'LETTER',
                layout: 'portrait',
                bufferPages: true
            });

            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', err => reject(err));

            const total = empleados.length;
            for (let i = 0; i < total; i++) {
                const emp = empleados[i];
                const isBottomHalf = i % 2 === 1;

                if (i > 0 && !isBottomHalf) {
                    doc.addPage();
                }

                const yOffset = isBottomHalf ? 405 : 22;
                drawReciboSection(doc, emp, company, anio, mes, quincena, yOffset);

                // Separador de corte entre los dos recibos
                if (!isBottomHalf && i + 1 < total) {
                    const cutY = 394;
                    doc.strokeColor('#cbd5e1').lineWidth(0.5).dash(4, { space: 3 })
                        .moveTo(25, cutY).lineTo(587, cutY).stroke();
                    doc.undash();
                    doc.fontSize(6).font('Helvetica').fillColor('#94a3b8')
                        .text('--- ✂ Doblar o cortar por la línea punteada ----------------------------------------------------------------------------------------------------------------------------------', 25, cutY - 2.5);
                }
            }

            renderPageNumbers(doc);
            doc.end();
        } catch (e) {
            reject(e);
        }
    });
};

/**
 * Generar Recibo Individual para un empleado en PDF
 */
const generateReciboIndividualPDF = async ({ companyId, planillaId }) => {
    const db = await getAccountingDb();
    const [pRows] = await withRetry(() => db.query('SELECT periodo_anio, periodo_mes, quincena FROM rh_planillas WHERE id = ?', [planillaId]));
    if (pRows.length === 0) {
        throw new Error('Planilla no encontrada');
    }
    const { periodo_anio, periodo_mes, quincena } = pRows[0];

    const [compRows] = await withRetry(() => db.query('SELECT * FROM companies WHERE id = ?', [companyId]));
    const company = compRows[0] || { razon_social: 'EMPRESA REGISTRADA', nit: 'N/A', nrc: 'N/A' };

    const { empleados } = await getPlanillaDetalle({ companyId, anio: periodo_anio, mes: periodo_mes, quincena });
    const emp = empleados.find(e => e.id === parseInt(planillaId, 10)) || empleados[0];

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                margin: 24,
                size: 'LETTER',
                layout: 'portrait',
                bufferPages: true
            });

            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', err => reject(err));

            // Renderizar dos copias del mismo recibo (Original y Copia)
            drawReciboSection(doc, emp, company, periodo_anio, periodo_mes, quincena, 22);

            const cutY = 394;
            doc.strokeColor('#cbd5e1').lineWidth(0.5).dash(4, { space: 3 })
                .moveTo(25, cutY).lineTo(587, cutY).stroke();
            doc.undash();
            doc.fontSize(6).font('Helvetica').fillColor('#94a3b8')
                .text('--- ✂ COPIA DE EMPRESA / COPIA DE EMPLEADO ----------------------------------------------------------------------------------------------------------------------------------', 25, cutY - 2.5);

            drawReciboSection(doc, emp, company, periodo_anio, periodo_mes, quincena, 405);

            renderPageNumbers(doc);
            doc.end();
        } catch (e) {
            reject(e);
        }
    });
};

/**
 * 9. Obtener cuentas bancarias disponibles en SIPE Admin para el registro de pago
 */
const getCuentasBancariasParaPago = async (companyId = null) => {
    const { getDb } = require('../db');
    const db = getDb();

    // Consultar todas las cuentas bancarias activas
    const [cuentas] = await withRetry(() => db.query(`
        SELECT cb.id, cb.numero, cb.nombre, cb.empresa_id,
               cb.cod_cta, cb.activa, cb.orden,
               b.id as banco_id, b.descripcion as banco_nombre,
               e.id as empresa_id, e.nombre as empresa_nombre, e.codigo as empresa_codigo
        FROM cuentas_bancarias cb
        JOIN empresas e ON cb.empresa_id = e.id
        LEFT JOIN bancos b ON cb.banco_id = b.id
        WHERE cb.activa = TRUE
        ORDER BY b.descripcion ASC, cb.numero ASC
    `));

    // Si se pasa companyId, buscar razón social en SaaS para ordenar o sugerir
    let saasCompany = null;
    if (companyId) {
        try {
            const saasDb = await getAccountingDb();
            const [cRows] = await withRetry(() => saasDb.query(
                'SELECT id, razon_social, nombre_comercial FROM companies WHERE id = ?',
                [companyId]
            ));
            if (cRows.length > 0) saasCompany = cRows[0];
        } catch (e) {
            // ignore
        }
    }

    const cuentasConMatch = cuentas.map(c => {
        let esSugerida = false;
        if (saasCompany) {
            const nomClean = (saasCompany.razon_social || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const empClean = (c.empresa_nombre || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (nomClean && empClean && (nomClean.includes(empClean) || empClean.includes(nomClean))) {
                esSugerida = true;
            }
        }
        return {
            ...c,
            es_sugerida: esSugerida
        };
    });

    const formasPago = [
        { codigo: 'TR', label: 'Transferencia Bancaria' },
        { codigo: 'CH', label: 'Cheque' },
        { codigo: 'NC', label: 'Nota de Cargo / Débito' }
    ];

    return {
        cuentas: cuentasConMatch,
        formas_pago: formasPago
    };
};

/**
 * 10. Consultar pagos registrados para un período de planilla
 */
const getPagosPlanilla = async ({ companyId, anio, mes, quincena }) => {
    const { getDb } = require('../db');
    const db = getDb();

    const [pagos] = await withRetry(() => db.query(`
        SELECT p.id, p.company_id, p.empresa_id, p.periodo_anio, p.periodo_mes, p.quincena,
               p.cuenta_bancaria_id, p.movimiento_bancario_id, p.monto, p.forma_pago,
               p.tipo_remesa_id, p.documento, p.concepto, p.fecha_pago, p.created_at,
               cb.numero as numero_cuenta, cb.nombre as cuenta_nombre,
               b.descripcion as banco_nombre,
               e.nombre as empresa_nombre,
               m.fecha_aplicado,
               m.cargo,
               IF(m.fecha_aplicado IS NOT NULL, 1, 0) as es_conciliado
        FROM rh_planilla_pagos p
        JOIN cuentas_bancarias cb ON p.cuenta_bancaria_id = cb.id
        LEFT JOIN bancos b ON cb.banco_id = b.id
        LEFT JOIN empresas e ON cb.empresa_id = e.id
        LEFT JOIN movimientos_bancarios m ON p.movimiento_bancario_id = m.id
        WHERE p.company_id = ? AND p.periodo_anio = ? AND p.periodo_mes = ? AND p.quincena = ?
        ORDER BY p.id ASC
    `, [companyId, anio, mes, quincena]));

    return pagos;
};

/**
 * 11. Registrar formas de pago de una planilla y generar movimientos bancarios (conciliables)
 */
const registrarPagoPlanilla = async ({ companyId, anio, mes, quincena, pagos, userId, io }) => {
    if (!companyId || !anio || !mes || !quincena) {
        throw new Error('Parámetros company_id, anio, mes y quincena requeridos');
    }
    if (!Array.isArray(pagos) || pagos.length === 0) {
        throw new Error('Debe proporcionar al menos una forma de pago');
    }

    const { withTransaction } = require('../db');
    const saasDb = await getAccountingDb();

    // Obtener razón social de la empresa en SaaS para conceptos
    const [cRows] = await withRetry(() => saasDb.query(
        'SELECT id, razon_social, nombre_comercial FROM companies WHERE id = ?',
        [companyId]
    ));
    const empresaNombre = cRows[0]?.nombre_comercial || cRows[0]?.razon_social || `Empresa ${companyId}`;

    const mesNom = MESES_MAYUS[mes] || `MES ${mes}`;
    const qLabel = quincena === 'primera' ? '1RA QUINCENA' : '2DA QUINCENA';

    let totalPagado = 0;
    const movimientosGenerados = [];

    // Realizar operaciones en SIPE Admin dentro de transacción
    await withTransaction(async (conn) => {
        for (const item of pagos) {
            const monto = parseFloat(item.monto || 0);
            if (isNaN(monto) || monto <= 0) {
                throw new Error(`El monto debe ser mayor a 0 (recibido: ${item.monto})`);
            }
            if (!item.cuenta_bancaria_id) {
                throw new Error('Cada forma de pago debe tener una cuenta bancaria seleccionada');
            }

            // Buscar la cuenta bancaria para conocer su empresa_id
            const [ctaRows] = await conn.query(
                'SELECT cb.id, cb.numero, cb.nombre, cb.empresa_id, b.descripcion as banco_nombre ' +
                'FROM cuentas_bancarias cb LEFT JOIN bancos b ON cb.banco_id = b.id WHERE cb.id = ?',
                [item.cuenta_bancaria_id]
            );
            if (ctaRows.length === 0) {
                throw new Error(`Cuenta bancaria #${item.cuenta_bancaria_id} no encontrada`);
            }
            const cta = ctaRows[0];

            // Buscar tipo_remesa_id adecuado en esa empresa (TR para transferencia, CH para cheque, NC para nota de cargo)
            let remCode = 'TR';
            const formaPagoStr = (item.forma_pago || '').toLowerCase();
            if (formaPagoStr.includes('cheque') || item.tipo_remesa_codigo === 'CH') {
                remCode = 'CH';
            } else if (formaPagoStr.includes('cargo') || formaPagoStr.includes('debito') || item.tipo_remesa_codigo === 'NC') {
                remCode = 'NC';
            }

            const [remRows] = await conn.query(
                'SELECT id FROM tipos_remesas WHERE empresa_id = ? AND codigo = ? LIMIT 1',
                [cta.empresa_id, remCode]
            );
            const tipoRemesaId = remRows.length > 0 ? remRows[0].id : null;

            const docRef = (item.documento || '').trim();
            const fechaPago = item.fecha_pago ? String(item.fecha_pago).slice(0, 10) : new Date().toISOString().split('T')[0];

            const defaultConcepto = `PAGO PLANILLA ${empresaNombre.toUpperCase()} - ${qLabel} ${mesNom} ${anio}${docRef ? ' - ' + docRef : ''}`.slice(0, 250);
            const conceptoFinal = (item.concepto || defaultConcepto).slice(0, 250);

            // 1. Insertar movimiento bancario con fecha_aplicado = NULL
            // CRÍTICO: fecha_aplicado = NULL permite que sea conciliable en el futuro en el módulo de Conciliación Bancaria
            const [movResult] = await conn.query(`
                INSERT INTO movimientos_bancarios (
                    empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado,
                    documento, concepto, monto, cargo, abono,
                    tipo_remesa_id, es_contabilizado
                ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 0, ?, FALSE)
            `, [
                cta.empresa_id,
                cta.id,
                fechaPago,
                docRef,
                conceptoFinal,
                monto,
                monto, // cargo = salida de dinero
                tipoRemesaId
            ]);

            const movId = movResult.insertId;

            // 2. Registrar pago en rh_planilla_pagos
            const [pagoResult] = await conn.query(`
                INSERT INTO rh_planilla_pagos (
                    company_id, empresa_id, periodo_anio, periodo_mes, quincena,
                    cuenta_bancaria_id, movimiento_bancario_id, monto, forma_pago,
                    tipo_remesa_id, documento, concepto, fecha_pago, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                companyId,
                cta.empresa_id,
                anio,
                mes,
                quincena,
                cta.id,
                movId,
                monto,
                item.forma_pago || (remCode === 'CH' ? 'Cheque' : (remCode === 'NC' ? 'Nota de Cargo' : 'Transferencia')),
                tipoRemesaId,
                docRef,
                conceptoFinal,
                fechaPago,
                userId || null
            ]);

            totalPagado += monto;
            movimientosGenerados.push({
                pago_id: pagoResult.insertId,
                movimiento_bancario_id: movId,
                cuenta_id: cta.id,
                cuenta_numero: cta.numero,
                banco_nombre: cta.banco_nombre,
                monto
            });
        }
    });

    // 3. En Sipe Web SaaS: actualizar estado de planilla a 'pagada'
    await withRetry(() => saasDb.query(
        'UPDATE rh_planillas SET estado = "pagada" WHERE company_id = ? AND periodo_anio = ? AND periodo_mes = ? AND quincena = ?',
        [companyId, anio, mes, quincena]
    ));

    // Si existe la tabla rh_empleado_descuentos en SaaS, descontar cuotas activas
    try {
        const [pendientes] = await withRetry(() => saasDb.query(
            'SELECT DISTINCT empleado_id FROM rh_planillas WHERE company_id = ? AND periodo_anio = ? AND periodo_mes = ? AND quincena = ?',
            [companyId, anio, mes, quincena]
        ));
        if (pendientes.length > 0) {
            const empIds = pendientes.map(p => p.empleado_id);
            await withRetry(() => saasDb.query(`
                UPDATE rh_empleado_descuentos
                SET cuotas_restantes = GREATEST(0, cuotas_restantes - 1),
                    activo = IF(cuotas_restantes - 1 <= 0, 0, activo)
                WHERE company_id = ?
                  AND empleado_id IN (?)
                  AND activo = 1
                  AND cuotas_restantes > 0
                  AND (quincena = 'ambas' OR quincena = ?)
            `, [companyId, empIds, quincena]));
        }
    } catch (e) {
        // Ignorar si la tabla no existe en esta versión de SaaS
    }

    // 4. Emitir eventos en tiempo real si io está disponible
    if (io) {
        try {
            io.emit('movimientos_updated', { source: 'rrhh_planilla_pago' });
            io.emit('conciliacion_updated', { source: 'rrhh_planilla_pago' });
            io.emit('planillas_updated', { company_id: companyId, anio, mes, quincena });
        } catch (e) {
            // ignore
        }
    }

    return {
        success: true,
        message: 'Pago(s) de planilla registrado(s) exitosamente y reflejado(s) en Bancos',
        total_pagado: totalPagado,
        pagos_count: movimientosGenerados.length,
        movimientos: movimientosGenerados
    };
};

/**
 * 12. Anular un pago de planilla registrado
 */
const anularPagoPlanilla = async ({ pagoId, io }) => {
    if (!pagoId) throw new Error('ID de pago requerido');

    const { getDb, withTransaction } = require('../db');
    const adminDb = getDb();
    const saasDb = await getAccountingDb();

    // 1. Consultar el pago y verificar si el movimiento ya fue conciliado
    const [pagoRows] = await withRetry(() => adminDb.query(`
        SELECT p.*, m.fecha_aplicado
        FROM rh_planilla_pagos p
        LEFT JOIN movimientos_bancarios m ON p.movimiento_bancario_id = m.id
        WHERE p.id = ?
    `, [pagoId]));

    if (pagoRows.length === 0) {
        throw new Error('Registro de pago no encontrado');
    }
    const pago = pagoRows[0];

    if (pago.fecha_aplicado) {
        throw new Error(
            `No se puede anular este pago porque el movimiento bancario (#${pago.movimiento_bancario_id}) ` +
            `ya ha sido conciliado en el módulo de Bancos (Fecha aplicado: ${pago.fecha_aplicado}). ` +
            `Debe desconciliarlo primero en Bancos > Conciliación Bancaria.`
        );
    }

    // 2. Eliminar movimiento bancario y registro de pago en transacción
    await withTransaction(async (conn) => {
        if (pago.movimiento_bancario_id) {
            await conn.query('DELETE FROM movimientos_bancarios WHERE id = ?', [pago.movimiento_bancario_id]);
        }
        await conn.query('DELETE FROM rh_planilla_pagos WHERE id = ?', [pagoId]);
    });

    // 3. Verificar si quedan otros pagos para este mismo período
    const [restantes] = await withRetry(() => adminDb.query(`
        SELECT COUNT(*) as count FROM rh_planilla_pagos
        WHERE company_id = ? AND periodo_anio = ? AND periodo_mes = ? AND quincena = ?
    `, [pago.company_id, pago.periodo_anio, pago.periodo_mes, pago.quincena]));

    // Si ya no quedan pagos, regresar la planilla a 'pendiente' en SaaS
    if (restantes[0]?.count === 0) {
        await withRetry(() => saasDb.query(
            'UPDATE rh_planillas SET estado = "pendiente" WHERE company_id = ? AND periodo_anio = ? AND periodo_mes = ? AND quincena = ?',
            [pago.company_id, pago.periodo_anio, pago.periodo_mes, pago.quincena]
        ));

        try {
            const [emps] = await withRetry(() => saasDb.query(
                'SELECT DISTINCT empleado_id FROM rh_planillas WHERE company_id = ? AND periodo_anio = ? AND periodo_mes = ? AND quincena = ?',
                [pago.company_id, pago.periodo_anio, pago.periodo_mes, pago.quincena]
            ));
            if (emps.length > 0) {
                const empIds = emps.map(e => e.empleado_id);
                await withRetry(() => saasDb.query(`
                    UPDATE rh_empleado_descuentos
                    SET cuotas_restantes = cuotas_restantes + 1,
                        activo = 1
                    WHERE company_id = ?
                      AND empleado_id IN (?)
                      AND (quincena = 'ambas' OR quincena = ?)
                `, [pago.company_id, empIds, pago.quincena]));
            }
        } catch (e) {
            // ignore
        }
    }

    if (io) {
        try {
            io.emit('movimientos_updated', { source: 'rrhh_pago_anulado' });
            io.emit('conciliacion_updated', { source: 'rrhh_pago_anulado' });
            io.emit('planillas_updated', { company_id: pago.company_id, anio: pago.periodo_anio, mes: pago.periodo_mes, quincena: pago.quincena });
        } catch (e) {
            // ignore
        }
    }

    return {
        success: true,
        message: 'Pago anulado y movimiento bancario eliminado correctamente'
    };
};

module.exports = {
    getEmpresas,
    getFiltros,
    getPlanillasGrupos,
    getPlanillaDetalle,
    exportBancario,
    generatePlanillaReportePDF,
    generateRecibosMasivosPDF,
    generateReciboIndividualPDF,
    getCuentasBancariasParaPago,
    getPagosPlanilla,
    registrarPagoPlanilla,
    anularPagoPlanilla
};
