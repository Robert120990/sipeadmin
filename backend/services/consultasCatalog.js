const ventasViewPerms = [
    'view_ventas',
    '/dashboard/consultas/estaciones/ventas',
    '/dashboard/consultas/estaciones/resumen-cierre',
    '/dashboard/estrategia/torre-control',
    '/dashboard/estrategia/combustible',
    '/dashboard/operaciones/pedidos',
    '/dashboard/finanzas/resumen'
];

const fletesViewPerms = [
    'manage_pedidos',
    'view_ventas',
    '/dashboard/operaciones/pedidos',
    '/dashboard/consultas/estaciones/ventas',
    '/dashboard/estrategia/combustible'
];

const lubricantesViewPerms = [
    '/dashboard/consultas/estaciones/lubricantes',
    '/dashboard/estrategia/torre-control'
];

const cierreViewPerms = [
    '/dashboard/consultas/estaciones/resumen-cierre',
    '/dashboard/consultas/estaciones/ventas',
    '/dashboard/estrategia/torre-control'
];

const preciosEstacionViewPerms = [
    '/dashboard/consultas/estaciones/precios',
    '/dashboard/consultas/estaciones/precios-competencia',
    '/dashboard/estrategia/combustible',
    '/dashboard/estrategia/torre-control'
];

const cumpleanosViewPerms = [
    '/dashboard/consultas/otras/cumpleanos',
    '/dashboard/rrhh/planillas'
];

const diferenciasViewPerms = [
    '/dashboard/consultas/estaciones/diferencias-combustible',
    '/dashboard/estrategia/mermas',
    '/dashboard/estrategia/torre-control'
];

const preciosCompetenciaViewPerms = [
    'manage_precios_competencia',
    '/dashboard/consultas/estaciones/precios-competencia',
    '/dashboard/consultas/estaciones/precios',
    '/dashboard/estrategia/combustible'
];

const genericConsultasPerms = [
    '/dashboard/consultas/otras/backup-db-check',
    '/dashboard/consultas/estaciones/ventas',
    '/dashboard/consultas/estaciones/resumen-cierre',
    '/dashboard/estrategia/torre-control',
    '/dashboard/bancos/reportes/saldos-bancos',
    '/dashboard/bancos/reportes/saldos-chequera'
];

const getCleanStationName = (id, defaultTitulo) => {
    if (!defaultTitulo) return '';
    const upper = defaultTitulo.toUpperCase();
    if (id === '002' && (upper.includes('MIRAFLORES') || upper === '002')) return 'Puma Miraflores';
    if (id === '006' && (upper.includes('CHALCHUAPA') || upper === '006')) return 'Shell Chalchuapa';
    if (id === '008' && (upper.includes('COSTA') || upper === '008')) return 'Puma Costa del Sol';
    if (id === '014' && (upper.includes('SAN MARTIN') || upper.includes('LA LOMA') || upper === '014')) return 'Puma La Loma (San Martín)';
    if (id === '015' && (upper.includes('14') || upper === '015')) return 'Shell 14 Avenida';
    if ((id === '016' || id === '7') && (upper.includes('POLIEDRO') || upper === '016' || upper === '7')) return 'Shell Poliedro';
    if (upper.includes('POLIEDRO')) return 'Shell Poliedro';
    return defaultTitulo;
};

const getCleanTiendaName = (id, defaultTitulo) => {
    const cleanId = String(id || '');
    const upper = (defaultTitulo || '').toUpperCase();
    if (upper.includes('MIRAFLORES') || ((cleanId === '002' || cleanId === '4') && (upper.includes('E-MARKET') || upper === '002' || !upper))) return 'E-Market Miraflores';
    if (upper.includes('CHALCHUAPA') || ((cleanId === '006' || cleanId === '3') && (upper.includes('E-MARKET') || upper === '006' || !upper))) return 'E-Market Chalchuapa';
    if (upper.includes('COSTA') || ((cleanId === '008' || cleanId === '8') && (upper.includes('SUPER') || upper === '008' || !upper))) return 'Super 7 Costa';
    if (upper.includes('SAN MARTIN') || upper.includes('LA LOMA') || ((cleanId === '014' || cleanId === '1') && (upper.includes('E-MARKET') || upper === '014' || !upper))) return 'E-Market San Martin';
    if (upper.includes('PEDREGAL') || ((cleanId === '009' || cleanId === '6') && (upper.includes('SUPER') || upper === '009' || !upper))) return 'Super El Pedregal';
    return defaultTitulo || `Tienda ${cleanId}`;
};

const saasBranchMap = {
    '014': 1, // San Martin -> Puma San Martin II (Inversiones LIL)
    '006': 3, // Chalchuapa -> Shell Chalchuapa
    '009': 6, // El Pedregal -> Super El Pedregal
    '002': 4, // Miraflores -> Puma Miraflores
    '008': 8, // Costa del Sol -> Puma Costa del Sol
    'E-1': 8, // Costa del Sol alias
    '015': 2, // Shell 14 Avenida (Inversiones LIL)
    '016': 7, // Shell Poliedro (Inversiones LIL, company_id = 1, branch_id = 7)
    '7': 7    // Shell Poliedro alias directo (Inversiones LIL)
};

const branchToEmpId = {
    1: '014',
    2: '015',
    3: '006',
    4: '002',
    8: '008',
    6: '009',
    7: '016',
    12: '016'
};

const normalizeSaasBranchId = (bId) => {
    const n = Number(bId);
    return n === 12 ? 7 : n;
};

/**
 * Calcula métricas contables reales de un turno cerrado de tienda SaaS (`pos_shifts`),
 * corrigiendo el bug de expected_cash = 0 cuando actual_cash = venta + apertura (p. ej. Super El Pedregal)
 * y tomando total_tarjetas cuando card_sales viene en 0.
 */
const computeSaasStoreShiftMetrics = (sh = {}) => {
    const round2 = (v) => (Math.round(Number(v || 0) * 100) / 100) || 0;
    const venta = round2(sh.total_sales || 0);
    const ingresos = round2(sh.total_incomes || 0);
    const tarjeta = round2(Math.max(Number(sh.total_tarjetas || 0), Number(sh.card_sales || 0)));
    const otrosMedios = round2(Number(sh.transfer_sales || 0) + Number(sh.other_sales || 0) + Number(sh.total_puntos || 0));
    const remesado = round2(sh.total_remesas || 0);
    const gastos = round2(sh.total_expenses || 0);
    const expectedCash = Number(sh.expected_cash || 0);
    const actualCash = round2(sh.actual_cash || 0);
    const rawDif = Number(sh.difference || 0);

    const totalDescargos = remesado + tarjeta + otrosMedios + gastos;
    const isZeroExpectedCashBug = expectedCash === 0 && actualCash > 0 && Math.abs(rawDif - actualCash) < 0.05 && totalDescargos > 0;

    const dif = isZeroExpectedCashBug
        ? round2(totalDescargos - (venta + ingresos))
        : round2(rawDif);

    return {
        venta,
        ingresos,
        tarjeta,
        otrosMedios,
        remesado,
        gastos,
        saldo_f: actualCash,
        dif,
        adjusted_zero_expected_bug: isZeroExpectedCashBug
    };
};

const OFFICIAL_ESTACIONES = [
    { id_empresa: '002', branch_id: 4, saas_branch_id: 4, company_id: 8, titulo: 'Puma Miraflores', orden: 1 },
    { id_empresa: '006', branch_id: 3, saas_branch_id: 3, company_id: 2, titulo: 'Shell Chalchuapa', orden: 2 },
    { id_empresa: '008', branch_id: 8, saas_branch_id: 8, company_id: 8, titulo: 'Puma Costa del Sol', orden: 3 },
    { id_empresa: '014', branch_id: 1, saas_branch_id: 1, company_id: 1, titulo: 'Puma La Loma (San Martín)', orden: 4 },
    { id_empresa: '015', branch_id: 2, saas_branch_id: 2, company_id: 1, titulo: 'Shell 14 Avenida', orden: 5 },
    { id_empresa: '016', branch_id: 7, saas_branch_id: 7, company_id: 1, titulo: 'Shell Poliedro', orden: 6 }
];

// Tokens y conceptos genéricos para auditoría de movimientos sin descripción suficiente
const GENERIC_TOKENS = new Set([
    'gasto', 'gastos', 'varios', 'otro', 'otros', 'caja', 'ajuste', 'pendiente',
    'compra', 'vale', 'pago', 'cajero', 'general', 'operativo', 'tienda', 'super',
    'sin concepto', 'ninguno', 'na', 'n/a', 'x', '-', '.', '..', '...', 'cierre',
    'saldo', 'fondo', 's/n', 'sn', 'vale provisional', 'diferencia', 'descuadre'
]);

const isGenericDescription = (desc) => {
    if (!desc) return true;
    const clean = String(desc).trim().toLowerCase();
    if (clean.length < 4) return true;
    if (GENERIC_TOKENS.has(clean)) return true;
    const words = clean.replace(/[^a-z0-9áéíóúüñ]/g, ' ').split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    if (words.length <= 2 && words.every(w => GENERIC_TOKENS.has(w))) return true;
    return false;
};

const formatYMD = (val) => {
    if (!val) return '';
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return '';
        // Los pools MySQL usan timezone: 'Z'; leer UTC evita corrimiento -1 día en UTC-6
        const y = val.getUTCFullYear();
        const m = String(val.getUTCMonth() + 1).padStart(2, '0');
        const d = String(val.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const s = String(val).trim();
    return s.split('T')[0].split(' ')[0];
};

module.exports = {
    ventasViewPerms,
    fletesViewPerms,
    lubricantesViewPerms,
    cierreViewPerms,
    preciosEstacionViewPerms,
    cumpleanosViewPerms,
    diferenciasViewPerms,
    preciosCompetenciaViewPerms,
    genericConsultasPerms,
    getCleanStationName,
    getCleanTiendaName,
    saasBranchMap,
    branchToEmpId,
    normalizeSaasBranchId,
    OFFICIAL_ESTACIONES,
    GENERIC_TOKENS,
    isGenericDescription,
    formatYMD,
    computeSaasStoreShiftMetrics
};
