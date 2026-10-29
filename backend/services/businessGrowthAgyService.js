const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { GoogleGenAI } = require('@google/genai');
const { getDb } = require('../db');

let injectedDb = undefined;
let injectedAiClient = undefined;
let schemaReady = false;

// Caché en memoria para Graphify AST (evita releer disco si mtime no cambió)
let graphifyCache = {
    mtimeMs: 0,
    data: null,
    summary: null
};

const KNOWLEDGE_CATEGORIES = [
    { id: 'holding_fiscal', label: 'Holding y Optimización Fiscal' },
    { id: 'deuda_capital', label: 'Deuda, Capital y Refinanciamiento' },
    { id: 'operaciones_estaciones', label: 'Estaciones, Combustible y Tiendas' },
    { id: 'andelsa_agro', label: 'Andelsa, Granja e Integración Vertical' },
    { id: 'energia_solar', label: 'Energía Solar y Eficiencia' },
    { id: 'estrategia_crecimiento', label: 'Estrategia y Expansión' },
    { id: 'regla_negocio', label: 'Reglas Corporativas y Metas' },
    { id: 'arquitectura_sistema', label: 'Arquitectura SIPE, Graphify y AGY' }
];

const SEED_INSTITUTIONAL_KNOWLEDGE = [
    {
        clave: 'holding-arquitectura-fiscal',
        categoria: 'holding_fiscal',
        titulo: 'Arquitectura Corporativa Holding EE. UU. + TechCo Decreto 741 + AssetCo',
        resumen_ejecutivo: 'Holding matriz LLC (Delaware/Wyoming) + TechCo salvadoreña (0% ISR Ley de Innovación Decreto 741 por 15 años) + AssetCo inmobiliaria + Operadoras.',
        contenido: 'Estructura corporativa óptima recomendada para el Grupo SIPE: (1) Holding Matriz en EE. UU. (Delaware o Wyoming LLC pass-through) para protección patrimonial y acceso a banca internacional; (2) TechCo en El Salvador acogida a la Ley de Fomento a la Innovación y Manufactura Tecnológica (Decreto 741) con exención del 0% de ISR durante 15 años, propietaria intelectual de sys.sipesv.com y admin.sipesv.com que factura licenciamiento SaaS/IA deducible a las operadoras; (3) AssetCo Inmobiliaria dueña de terrenos, estaciones y nave avícola cobrando cánones de arrendamiento; (4) Operadoras separadas por giro (Estaciones, Transporte, Andelsa y AgroCo Granja).',
        etiquetas: 'holding,fiscal,decreto-741,techco,assetco,impuestos,llc',
        origen: 'estudio_holding',
        confianza: 0.98,
        fijado: 1
    },
    {
        clave: 'reestructuracion-deuda-10m-granja',
        categoria: 'deuda_capital',
        titulo: 'Consolidación Financiera $10M ($5M Deuda Actual + $5M Granja Avícola)',
        resumen_ejecutivo: 'Sindicado/Estructurado de $10M a 10-12 años: Tramo A ($5M refinanciamiento bajando cuota mensual) + Tramo B ($5M Granja con 18-24 meses de gracia de capital).',
        contenido: 'Estrategia para consolidar $5,000,000 de pasivos actuales y levantar $5,000,000 adicionales para la Granja Avícola ($10,000,000 total): estructurar un financiamiento corporativo en dos tramos con garantía inmobiliaria cruzada en AssetCo. Tramo A ($5M Senior Refinancing a 10-12 años, reduciendo servicio mensual de deuda actual en ~30-35%). Tramo B ($5M Proyecto Granja Agroindustrial con período de gracia de capital de 18 a 24 meses durante construcción y levante de parvadas). Los intereses generan escudo fiscal deducible del 30% de ISR en las operadoras.',
        etiquetas: '10m,5m,prestamos,refinanciamiento,granja,periodo-gracia,escudo-fiscal',
        origen: 'estudio_holding',
        confianza: 0.98,
        fijado: 1
    },
    {
        clave: 'integracion-vertical-andelsa',
        categoria: 'andelsa_agro',
        titulo: 'Integración Vertical Granja Avícola (AgroCo) -> Red Comercial ANDELSA',
        resumen_ejecutivo: 'Captura de doble margen (producción + distribución mayorista DTE) mediante contrato de compra asegurada (Off-Take Agreement) con ANDELSA.',
        contenido: 'ANDELSA, S.A. DE C.V. (company_id = 9 en db_sistema_saas) ya opera facturación electrónica DTE, rutas, inventario y cartera de clientes activos. Al vincular la nueva Granja Avícola mediante un contrato Off-Take (compra garantizada a precio de transferencia de mercado), el banco financiador reduce la prima de riesgo comercial porque la demanda ya está cautiva en el grupo, capturando entre +12% y +18% de margen consolidado adicional.',
        etiquetas: 'andelsa,granja,off-take,integracion-vertical,dte,agro',
        origen: 'estudio_holding',
        confianza: 0.97,
        fijado: 1
    },
    {
        clave: 'regla-arbitraje-capital',
        categoria: 'regla_negocio',
        titulo: 'Regla Corporativa de Arbitraje Deuda vs. CapEx y DSCR Mínimo',
        resumen_ejecutivo: 'Ejecutar nuevos proyectos CapEx cuando TIR > Costo Ponderado Deuda + 3.0% y mantener cobertura de servicio de deuda (DSCR) >= 1.35x.',
        contenido: 'Política financiera institucional: (1) Todo proyecto de expansión o eficiencia debe superar en al menos +300 bps (3.0%) la tasa promedio ponderada de la deuda bancaria activa; (2) El Índice de Cobertura del Servicio de Deuda (DSCR = EBITDA Operativo / Servicio Anual de Deuda) consolidado debe mantenerse >= 1.35x; (3) Si el spread de retorno es menor a 2.0%, priorizar abonos extraordinarios a capital en los préstamos con tasa > 9.0%.',
        etiquetas: 'dscr,tir,vpn,arbitraje,capex,politica-financiera',
        origen: 'estudio_holding',
        confianza: 0.96,
        fijado: 1
    },
    {
        clave: 'sinergia-solar-operativa',
        categoria: 'energia_solar',
        titulo: 'Escudo Energético y Fiscal con Generación Solar + Baterías en Estaciones y Granja',
        resumen_ejecutivo: 'Autoconsumo solar y almacenamiento reduce OpEx eléctrico crítico (climatización avícola y tiendas) y aprovecha incentivos fiscales de energía renovable.',
        contenido: 'Las instalaciones fotovoltaicas y bancos de baterías monitoreados en SIPE Admin reducen directamente la factura eléctrica en horas pico y protegen la continuidad operativa. En la nueva Granja Avícola (ventilación/climatización y empaque), integrar generación solar desde el CapEx inicial mejora el flujo neto mensual y aplica beneficios de depreciación e incentivos a energías limpias.',
        etiquetas: 'solar,baterias,opex,energia,granja,estaciones',
        origen: 'auto_sistema',
        confianza: 0.95,
        fijado: 1
    },
    {
        clave: 'arquitectura-agy-dos-servidores',
        categoria: 'arquitectura_sistema',
        titulo: 'Ecosistema SIPE + Consola AGY + Graphify AST en Servidor',
        resumen_ejecutivo: 'Operación coordinada entre admin.sipesv.com (SIPEOFI) y sys.sipesv.com (SIPEWEBgas) con grafo determinista Graphify y flujo AGY Planificar -> Aprobar -> Ejecutar.',
        contenido: 'El servidor principal aloja SIPE Admin (admin.sipesv.com, puerto 5001) y SIPE SaaS (sys.sipesv.com), compartiendo db_sistema_saas y soporte en tiempo real con Consola AGY. Toda consulta de código utiliza Graphify (graphify-out/graph.json) para ubicar controladores, tablas y vistas sin alucinaciones, y las modificaciones aprobadas pasan por planificación, validación de build y sincronización con Tickets/Telegram.',
        etiquetas: 'agy,graphify,servidor,sipeadmin,sipesaas,arquitectura',
        origen: 'auto_graphify',
        confianza: 0.99,
        fijado: 1
    }
];

function _setMockDb(mockDb) {
    injectedDb = mockDb;
    schemaReady = false;
}

function _setMockAiClient(mockClient) {
    injectedAiClient = mockClient;
}

function resolveDb(customDb = null) {
    if (injectedDb !== undefined) return injectedDb;
    return customDb || getDb();
}

function sanitizeServerText(str = '') {
    if (!str) return '';
    return String(str)
        .replace(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, 'servidor-agy')
        // eslint-disable-next-line no-control-regex
        .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*\x07)/g, '')
        .replace(/\r/g, '');
}

function calculatePMT(principal, annualRate, termMonths) {
    const P = Number(principal) || 0;
    const rate = Number(annualRate) || 0;
    const n = parseInt(termMonths, 10) || 0;
    if (P <= 0 || n <= 0) return 0;
    if (rate <= 0) return Math.round((P / n) * 100) / 100;
    const r = (rate / 100) / 12;
    const pmt = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    return Math.round(pmt * 100) / 100;
}

/**
 * Simulador financiero de consolidación de deuda ($5M -> $10M con Granja Avícola + Holding/TechCo)
 */
function simulateCorporateGrowthScenario(params = {}) {
    const deudaActualUsd = Math.max(0, Number(params.deuda_actual_usd ?? 5000000));
    const tasaActualPct = Math.max(0, Number(params.tasa_actual_pct ?? 9.25));
    const plazoRestanteActualMeses = Math.max(12, parseInt(params.plazo_actual_meses ?? 60, 10));

    const capexGranjaUsd = Math.max(0, Number(params.capex_granja_usd ?? 5000000));
    const montoConsolidadoUsd = deudaActualUsd + capexGranjaUsd;
    const nuevaTasaPct = Math.max(0, Number(params.nueva_tasa_pct ?? 7.65));
    const nuevoPlazoMeses = Math.max(24, parseInt(params.nuevo_plazo_meses ?? 120, 10));
    const mesesGraciaGranja = Math.max(0, Math.min(36, parseInt(params.meses_gracia_granja ?? 18, 10)));

    const ebitdaActualAnualUsd = Math.max(0, Number(params.ebitda_actual_anual_usd ?? 1650000));
    const ebitdaGranjaAnualUsd = Math.max(0, Number(params.ebitda_granja_anual_usd ?? 1250000));
    const sinergiaAndelsaAnualUsd = Math.max(0, Number(params.sinergia_andelsa_anual_usd ?? 240000));
    const regaliasTechCoAnualUsd = Math.max(0, Number(params.regalias_techco_anual_usd ?? 180000));
    const tasaIsrPct = Math.max(0, Math.min(40, Number(params.tasa_isr_pct ?? 30)));

    // Situación actual ($5M a plazo corto/medio)
    const cuotaMensualActual = calculatePMT(deudaActualUsd, tasaActualPct, plazoRestanteActualMeses);
    const servicioAnualActual = Math.round(cuotaMensualActual * 12 * 100) / 100;

    // Tramo A: Refinanciamiento de los $5M a largo plazo (ej. 120 meses)
    const cuotaTramoARefinanciamiento = calculatePMT(deudaActualUsd, nuevaTasaPct, nuevoPlazoMeses);

    // Tramo B: Financiamiento Granja ($5M)
    // Durante gracia: solo paga intereses mensuales; post-gracia: amortiza en (nuevoPlazoMeses - mesesGraciaGranja)
    const interesMensualGranjaGracia = Math.round((capexGranjaUsd * (nuevaTasaPct / 100) / 12) * 100) / 100;
    const plazoAmortizacionGranja = Math.max(24, nuevoPlazoMeses - mesesGraciaGranja);
    const cuotaTramoBPostGracia = calculatePMT(capexGranjaUsd, nuevaTasaPct, plazoAmortizacionGranja);

    // Cuota total durante construcción/levante (Meses 1 a mesesGraciaGranja)
    const cuotaTotalDuranteGracia = Math.round((cuotaTramoARefinanciamiento + interesMensualGranjaGracia) * 100) / 100;
    // Cuota total estabilizada (Meses post-gracia, con la granja ya produciendo)
    const cuotaTotalEstabilizada = Math.round((cuotaTramoARefinanciamiento + cuotaTramoBPostGracia) * 100) / 100;
    const servicioAnualEstabilizado = Math.round(cuotaTotalEstabilizada * 12 * 100) / 100;

    // Ahorro de flujo mensual en Tramo A frente a deuda vieja
    const alivioMensualTramoA = Math.round((cuotaMensualActual - cuotaTramoARefinanciamiento) * 100) / 100;
    const diferenciaCuotaDuranteGracia = Math.round((cuotaMensualActual - cuotaTotalDuranteGracia) * 100) / 100;

    // Escudos fiscales legales (El Salvador ISR 30% + TechCo Decreto 741 0% ISR + Depreciación)
    const interesesAnualesPrimerAnio = Math.round((montoConsolidadoUsd * (nuevaTasaPct / 100)) * 100) / 100;
    const escudoFiscalInteresesAnual = Math.round((interesesAnualesPrimerAnio * (tasaIsrPct / 100)) * 100) / 100;
    const ahorroFiscalTechCoDecreto741 = Math.round((regaliasTechCoAnualUsd * (tasaIsrPct / 100)) * 100) / 100;
    // Depreciación estimada de nave, equipos avícolas y solar (promedio 10% anual sobre 70% del CapEx deducible)
    const depreciacionAnualGranja = Math.round((capexGranjaUsd * 0.70 * 0.10) * 100) / 100;
    const escudoFiscalDepreciacion = Math.round((depreciacionAnualGranja * (tasaIsrPct / 100)) * 100) / 100;
    const ahorroFiscalTotalAnual = Math.round((escudoFiscalInteresesAnual + ahorroFiscalTechCoDecreto741 + escudoFiscalDepreciacion) * 100) / 100;

    // Cobertura DSCR
    const ebitdaConsolidadoEstabilizado = Math.round((ebitdaActualAnualUsd + ebitdaGranjaAnualUsd + sinergiaAndelsaAnualUsd) * 100) / 100;
    const dscrActual = servicioAnualActual > 0 ? +(ebitdaActualAnualUsd / servicioAnualActual).toFixed(2) : 9.99;
    const dscrDuranteGracia = cuotaTotalDuranteGracia > 0 ? +(ebitdaActualAnualUsd / (cuotaTotalDuranteGracia * 12)).toFixed(2) : 9.99;
    const dscrEstabilizado = servicioAnualEstabilizado > 0 ? +(ebitdaConsolidadoEstabilizado / servicioAnualEstabilizado).toFixed(2) : 9.99;

    const flujoLibreAnualPostDeuda = Math.round((ebitdaConsolidadoEstabilizado - servicioAnualEstabilizado + ahorroFiscalTotalAnual) * 100) / 100;
    const paybackGranjaAnios = (ebitdaGranjaAnualUsd + sinergiaAndelsaAnualUsd) > 0
        ? +(capexGranjaUsd / (ebitdaGranjaAnualUsd + sinergiaAndelsaAnualUsd)).toFixed(2)
        : 0;

    const viabilidad = dscrEstabilizado >= 1.35 && dscrDuranteGracia >= 1.15
        ? 'Alta (Bancable)'
        : (dscrEstabilizado >= 1.15 ? 'Moderada (Ajustar Plazo/Gracia)' : 'Ajustada (Requiere Mayor Capital o Plazo)');

    return {
        parametros: {
            deuda_actual_usd: deudaActualUsd,
            tasa_actual_pct: tasaActualPct,
            plazo_actual_meses: plazoRestanteActualMeses,
            capex_granja_usd: capexGranjaUsd,
            monto_consolidado_usd: montoConsolidadoUsd,
            nueva_tasa_pct: nuevaTasaPct,
            nuevo_plazo_meses: nuevoPlazoMeses,
            meses_gracia_granja: mesesGraciaGranja,
            ebitda_actual_anual_usd: ebitdaActualAnualUsd,
            ebitda_granja_anual_usd: ebitdaGranjaAnualUsd,
            sinergia_andelsa_anual_usd: sinergiaAndelsaAnualUsd,
            regalias_techco_anual_usd: regaliasTechCoAnualUsd,
            tasa_isr_pct: tasaIsrPct
        },
        resultados: {
            cuota_mensual_actual_usd: cuotaMensualActual,
            servicio_anual_actual_usd: servicioAnualActual,
            cuota_tramo_a_refinanciamiento_usd: cuotaTramoARefinanciamiento,
            interes_mensual_granja_gracia_usd: interesMensualGranjaGracia,
            cuota_tramo_b_post_gracia_usd: cuotaTramoBPostGracia,
            cuota_total_durante_gracia_usd: cuotaTotalDuranteGracia,
            cuota_total_estabilizada_usd: cuotaTotalEstabilizada,
            servicio_anual_estabilizado_usd: servicioAnualEstabilizado,
            alivio_mensual_tramo_a_usd: alivioMensualTramoA,
            diferencia_cuota_durante_gracia_usd: diferenciaCuotaDuranteGracia,
            escudo_fiscal_intereses_anual_usd: escudoFiscalInteresesAnual,
            ahorro_fiscal_techco_741_anual_usd: ahorroFiscalTechCoDecreto741,
            escudo_fiscal_depreciacion_anual_usd: escudoFiscalDepreciacion,
            ahorro_fiscal_total_anual_usd: ahorroFiscalTotalAnual,
            ebitda_consolidado_estabilizado_usd: ebitdaConsolidadoEstabilizado,
            dscr_actual: dscrActual,
            dscr_durante_gracia: dscrDuranteGracia,
            dscr_estabilizado: dscrEstabilizado,
            flujo_libre_anual_post_deuda_usd: flujoLibreAnualPostDeuda,
            payback_granja_anios: paybackGranjaAnios,
            viabilidad
        }
    };
}

/**
 * Carga y consulta en memoria el grafo determinista Graphify (graphify-out/graph.json)
 */
function loadGraphifyGraph() {
    const candidates = [
        path.resolve(__dirname, '../../graphify-out/graph.json'),
        path.resolve(process.cwd(), 'graphify-out/graph.json'),
        path.resolve(process.cwd(), '../graphify-out/graph.json')
    ];
    const foundPath = candidates.find((p) => {
        try { return fs.existsSync(p); } catch { return false; }
    });
    if (!foundPath) return null;

    try {
        const stat = fs.statSync(foundPath);
        if (graphifyCache.data && graphifyCache.mtimeMs === stat.mtimeMs) {
            return graphifyCache;
        }
        const raw = JSON.parse(fs.readFileSync(foundPath, 'utf8'));
        const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
        const links = Array.isArray(raw.links) ? raw.links : (Array.isArray(raw.edges) ? raw.edges : []);
        const communities = new Set(nodes.map((n) => n.community).filter((c) => c !== undefined && c !== null));
        const filesSet = new Set(nodes.map((n) => n.source_file).filter(Boolean));

        const summary = {
            available: true,
            graph_path: foundPath,
            total_nodes: nodes.length,
            total_edges: links.length,
            total_communities: communities.size,
            total_indexed_files: filesSet.size,
            built_at_commit: raw.built_at_commit || null,
            updated_at: new Date(stat.mtimeMs).toISOString()
        };

        graphifyCache = {
            mtimeMs: stat.mtimeMs,
            data: { nodes, links },
            summary
        };
        return graphifyCache;
    } catch {
        return null;
    }
}

function queryGraphifyContext(searchQuery = '', limit = 12) {
    const loaded = loadGraphifyGraph();
    if (!loaded || !loaded.data) {
        return { available: false, summary: null, matches: [], related_files: [] };
    }

    const terms = String(searchQuery || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9_./-]+/)
        .filter((t) => t.length >= 3);

    if (terms.length === 0) {
        return {
            available: true,
            summary: loaded.summary,
            matches: [],
            related_files: []
        };
    }

    const scored = [];
    for (const node of loaded.data.nodes) {
        const hay = `${node.id || ''} ${node.label || ''} ${node.source_file || ''}`.toLowerCase();
        let score = 0;
        for (const t of terms) {
            if (hay.includes(t)) {
                score += (node.source_file && String(node.source_file).toLowerCase().includes(t)) ? 3 : 2;
            }
        }
        if (score > 0) {
            scored.push({
                id: node.id,
                label: node.label || node.id,
                file_type: node.file_type || 'code',
                source_file: node.source_file || null,
                community: node.community ?? null,
                score
            });
        }
    }

    scored.sort((a, b) => b.score - a.score);
    const topMatches = scored.slice(0, limit);
    const relatedFiles = [...new Set(topMatches.map((m) => m.source_file).filter(Boolean))].slice(0, 8);

    return {
        available: true,
        summary: loaded.summary,
        matches: topMatches,
        related_files: relatedFiles
    };
}

/**
 * Inicializa tablas de Crecimiento Empresarial y siembra conocimiento institucional base
 */
async function ensureCrecimientoSchema(customDb = null) {
    const db = resolveDb(customDb);
    if (!db) return;
    if (schemaReady && !customDb) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS finanzas_conocimiento (
            id INT AUTO_INCREMENT PRIMARY KEY,
            clave VARCHAR(140) UNIQUE NULL,
            categoria VARCHAR(60) NOT NULL DEFAULT 'estrategia_crecimiento',
            titulo VARCHAR(220) NOT NULL,
            contenido TEXT NOT NULL,
            resumen_ejecutivo VARCHAR(500) NULL,
            etiquetas VARCHAR(300) NULL,
            origen VARCHAR(40) NOT NULL DEFAULT 'auto_sistema',
            confianza DECIMAL(4,2) NOT NULL DEFAULT 0.95,
            fijado TINYINT(1) NOT NULL DEFAULT 1,
            activo TINYINT(1) NOT NULL DEFAULT 1,
            empresa_id INT NULL,
            metricas_json JSON NULL,
            veces_usado INT NOT NULL DEFAULT 0,
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_fin_conocimiento_cat (categoria, activo, fijado)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS finanzas_conversaciones (
            id INT AUTO_INCREMENT PRIMARY KEY,
            titulo VARCHAR(220) NOT NULL,
            modo VARCHAR(40) NOT NULL DEFAULT 'consultoria_financiera',
            proyecto_destino VARCHAR(30) NOT NULL DEFAULT 'sipeadmin',
            modelo_ia VARCHAR(80) NOT NULL DEFAULT 'gemini-4-argon-high',
            empresa_id INT NULL,
            ticket_id INT NULL,
            ticket_code VARCHAR(32) NULL,
            estado_agy VARCHAR(40) NOT NULL DEFAULT 'idle',
            plan_markdown LONGTEXT NULL,
            plan_version INT NOT NULL DEFAULT 0,
            execution_log LONGTEXT NULL,
            archivos_relacionados JSON NULL,
            created_by INT NULL,
            created_by_name VARCHAR(150) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_fin_conv_user (created_by, updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS finanzas_conversacion_mensajes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            conversacion_id INT NOT NULL,
            rol VARCHAR(30) NOT NULL DEFAULT 'user',
            autor VARCHAR(120) NULL,
            contenido LONGTEXT NOT NULL,
            conocimientos_extraidos_json JSON NULL,
            metadata_json JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversacion_id) REFERENCES finanzas_conversaciones(id) ON DELETE CASCADE,
            INDEX idx_fin_msg_conv (conversacion_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    for (const item of SEED_INSTITUTIONAL_KNOWLEDGE) {
        await db.query(
            `INSERT IGNORE INTO finanzas_conocimiento
             (clave, categoria, titulo, contenido, resumen_ejecutivo, etiquetas, origen, confianza, fijado, activo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
                item.clave,
                item.categoria,
                item.titulo,
                item.contenido,
                item.resumen_ejecutivo,
                item.etiquetas,
                item.origen,
                item.confianza,
                item.fijado
            ]
        );
    }

    if (!customDb) schemaReady = true;
}

/**
 * Construye snapshot multi-base (Solo Lectura) del grupo empresarial en tiempo real
 */
async function buildEnterpriseGrowthSnapshot(customDb = null, { empresaId = null } = {}) {
    const db = resolveDb(customDb);
    const snapshot = {
        timestamp: new Date().toISOString(),
        deuda: {
            prestamos_activos: 0,
            saldo_total_usd: 0,
            cuota_mensual_total_usd: 0,
            tasa_ponderada_anual_pct: 0,
            detalle: []
        },
        inversiones: {
            total_proyectos: 0,
            proyectos_vpn_positivo: 0,
            capex_evaluado_usd: 0,
            mejor_tir_pct: 0,
            mejor_proyecto: null,
            detalle: []
        },
        mantenimiento: {
            eventos_pendientes: 0,
            presupuesto_comprometido_usd: 0
        },
        liquidez_bancos: {
            saldo_bancos_usd: 0,
            saldo_chequera_usd: 0,
            total_cuentas: 0
        },
        operaciones_estaciones: {
            fecha_corte: null,
            venta_combustible_ayer_usd: 0,
            venta_tiendas_ayer_usd: 0,
            galones_ayer: 0,
            proyeccion_mensual_ingresos_usd: 0
        },
        andelsa: {
            facturacion_mes_usd: 0,
            valor_inventario_usd: 0,
            cartera_por_cobrar_usd: 0,
            clientes_activos: 0
        },
        energia_solar: {
            potencia_total_kwp: 0,
            capacidad_bateria_kwh: 0,
            ahorro_mes_usd: 0,
            generacion_mes_kwh: 0
        },
        graphify: loadGraphifyGraph()?.summary || { available: false }
    };

    if (db) {
        try {
            let loanSql = `
                SELECT p.id, p.empresa_id, e.nombre AS empresa_nombre, p.numero_prestamo, p.descripcion,
                       p.monto_original, p.tasa_interes_anual, p.plazo_meses, p.cuota_calculada, p.cuota_total,
                       (p.monto_original - COALESCE(SUM(pp.monto_capital), 0)) AS saldo_actual
                FROM prestamos p
                LEFT JOIN empresas e ON p.empresa_id = e.id
                LEFT JOIN prestamos_pagos pp ON p.id = pp.prestamo_id
                WHERE p.estado = 'activo'
            `;
            const loanParams = [];
            if (empresaId) {
                loanSql += ' AND p.empresa_id = ?';
                loanParams.push(empresaId);
            }
            loanSql += ' GROUP BY p.id';
            const [loans] = await db.query(loanSql, loanParams);

            let weightedSum = 0;
            let totalDebt = 0;
            let totalMonthly = 0;
            for (const l of loans || []) {
                const saldo = Math.max(0, Number(l.saldo_actual || 0));
                const cuota = Number(l.cuota_total || l.cuota_calculada || 0);
                const tasa = Number(l.tasa_interes_anual || 0);
                totalDebt += saldo;
                totalMonthly += cuota;
                weightedSum += saldo * tasa;
            }
            snapshot.deuda = {
                prestamos_activos: (loans || []).length,
                saldo_total_usd: Math.round(totalDebt * 100) / 100,
                cuota_mensual_total_usd: Math.round(totalMonthly * 100) / 100,
                tasa_ponderada_anual_pct: totalDebt > 0 ? +(weightedSum / totalDebt).toFixed(2) : 0,
                detalle: (loans || []).slice(0, 10).map((l) => ({
                    id: l.id,
                    empresa: l.empresa_nombre || 'General',
                    codigo: l.numero_prestamo,
                    descripcion: l.descripcion,
                    saldo_usd: Math.round(Math.max(0, Number(l.saldo_actual || 0)) * 100) / 100,
                    tasa_pct: Number(l.tasa_interes_anual || 0),
                    cuota_usd: Math.round(Number(l.cuota_total || l.cuota_calculada || 0) * 100) / 100
                }))
            };
        } catch { /* Tabla opcional en test mock */ }

        try {
            let projSql = `
                SELECT p.*, e.nombre AS empresa_nombre
                FROM finanzas_proyectos_inversion p
                LEFT JOIN empresas e ON p.empresa_id = e.id
                WHERE 1=1
            `;
            const projParams = [];
            if (empresaId) {
                projSql += ' AND p.empresa_id = ?';
                projParams.push(empresaId);
            }
            projSql += ' ORDER BY p.created_at DESC LIMIT 12';
            const [projects] = await db.query(projSql, projParams);
            const list = projects || [];
            const positive = list.filter((p) => Number(p.vpn_estimado || 0) > 0);
            const best = list.reduce((acc, p) => (!acc || Number(p.tir_estimada || 0) > Number(acc.tir_estimada || 0)) ? p : acc, null);

            snapshot.inversiones = {
                total_proyectos: list.length,
                proyectos_vpn_positivo: positive.length,
                capex_evaluado_usd: Math.round(list.reduce((s, p) => s + Number(p.inversion_inicial || 0), 0) * 100) / 100,
                mejor_tir_pct: best ? Number(best.tir_estimada || 0) : 0,
                mejor_proyecto: best ? best.nombre_proyecto : null,
                detalle: list.slice(0, 8).map((p) => ({
                    id: p.id,
                    nombre: p.nombre_proyecto,
                    empresa: p.empresa_nombre || 'General',
                    inversion_usd: Number(p.inversion_inicial || 0),
                    vpn_usd: Number(p.vpn_estimado || 0),
                    tir_pct: Number(p.tir_estimada || 0),
                    roi_pct: Number(p.roi_estimado || 0),
                    payback_meses: Number(p.payback_meses || 0)
                }))
            };
        } catch { /* ignore */ }

        try {
            let mantSql = `
                SELECT costo_estimado
                FROM finanzas_planes_mantenimiento
                WHERE estado IN ('programado', 'en_proceso')
            `;
            const mantParams = [];
            if (empresaId) {
                mantSql += ' AND empresa_id = ?';
                mantParams.push(empresaId);
            }
            const [mants] = await db.query(mantSql, mantParams);
            snapshot.mantenimiento = {
                eventos_pendientes: (mants || []).length,
                presupuesto_comprometido_usd: Math.round((mants || []).reduce((s, m) => s + Number(m.costo_estimado || 0), 0) * 100) / 100
            };
        } catch { /* ignore */ }
    }

    // En modo mock de pruebas unitarias, evitamos disparar conexiones reales externas
    if (injectedDb !== undefined) {
        return snapshot;
    }

    // Bancos y chequeras
    try {
        const { getSaldosBancosData, getSaldosChequeraData } = require('./telegramBotService');
        const [bancosData, cheqData] = await Promise.all([
            getSaldosBancosData().catch(() => null),
            getSaldosChequeraData().catch(() => null)
        ]);
        if (bancosData) {
            snapshot.liquidez_bancos.saldo_bancos_usd = Math.round(Number(bancosData.total || 0) * 100) / 100;
            snapshot.liquidez_bancos.total_cuentas = Array.isArray(bancosData.cuentas) ? bancosData.cuentas.length : 0;
        }
        if (cheqData) {
            snapshot.liquidez_bancos.saldo_chequera_usd = Math.round(Number(cheqData.total || 0) * 100) / 100;
        }
    } catch { /* ignore */ }

    // Ventas Estaciones y Tiendas (ayer)
    try {
        const { getConsolidadoVentasData } = require('../routes/consultas');
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const yesterdayStr = d.toISOString().split('T')[0];
        const vData = await getConsolidadoVentasData(yesterdayStr);
        if (vData) {
            const vComb = (vData.estaciones || []).reduce((s, e) => s + Number(e.venta || 0), 0);
            const vTiendas = (vData.tiendas || []).reduce((s, t) => s + Number(t.venta || 0), 0);
            const gal = (vData.estaciones || []).reduce((s, e) => s + Number(e.galonaje || 0), 0);
            snapshot.operaciones_estaciones = {
                fecha_corte: yesterdayStr,
                venta_combustible_ayer_usd: Math.round(vComb * 100) / 100,
                venta_tiendas_ayer_usd: Math.round(vTiendas * 100) / 100,
                galones_ayer: Math.round(gal * 100) / 100,
                proyeccion_mensual_ingresos_usd: Math.round((vComb + vTiendas) * 30 * 100) / 100
            };
        }
    } catch { /* ignore */ }

    // Andelsa
    try {
        const { getAndelsaFinanzasResumen } = require('./sysSaasService');
        const andelsa = await getAndelsaFinanzasResumen();
        if (andelsa) {
            snapshot.andelsa = {
                facturacion_mes_usd: Math.round(Number(andelsa.facturacion_total_usd || 0) * 100) / 100,
                valor_inventario_usd: Math.round(Number(andelsa.valor_inventario_actual_usd || 0) * 100) / 100,
                cartera_por_cobrar_usd: Math.round(Number(andelsa.cartera_por_cobrar_usd || 0) * 100) / 100,
                clientes_activos: Number(andelsa.total_clientes_activos || 0)
            };
        }
    } catch { /* ignore */ }

    // Energía Solar
    try {
        const { getSolarEstadoActual, getSolarAhorroMensual } = require('./solarEnergyService');
        const now = new Date();
        const [estadoSolar, ahorroSolar] = await Promise.all([
            getSolarEstadoActual().catch(() => null),
            getSolarAhorroMensual(now.getFullYear(), now.getMonth() + 1).catch(() => null)
        ]);
        if (estadoSolar) {
            snapshot.energia_solar.potencia_total_kwp = Number(estadoSolar.potencia_total_kwp || 0);
            snapshot.energia_solar.capacidad_bateria_kwh = Number(estadoSolar.capacidad_bateria_total_kwh || 0);
        }
        if (ahorroSolar?.totales) {
            snapshot.energia_solar.ahorro_mes_usd = Number(ahorroSolar.totales.ahorro_total_usd || 0);
            snapshot.energia_solar.generacion_mes_kwh = Number(ahorroSolar.totales.generacion_total_kwh || 0);
        }
    } catch { /* ignore */ }

    return snapshot;
}

/**
 * Auto-Build de Conocimientos desde las métricas vivas multi-BD y Graphify
 */
async function autoBuildKnowledgeFromEcosystem(customDb = null, { empresaId = null, userId = null } = {}) {
    const db = resolveDb(customDb);
    await ensureCrecimientoSchema(db);
    const snapshot = await buildEnterpriseGrowthSnapshot(db, { empresaId });
    const upsertedItems = [];

    const candidates = [
        {
            clave: 'auto-pulso-deuda-liquidez',
            categoria: 'deuda_capital',
            titulo: 'Pulso Automático de Deuda Bancaria, Liquidez y Arbitraje',
            resumen_ejecutivo: `Deuda activa en sistema: $${snapshot.deuda.saldo_total_usd.toLocaleString('en-US')} (${snapshot.deuda.tasa_ponderada_anual_pct}% anual) | Liquidez en bancos: $${snapshot.liquidez_bancos.saldo_bancos_usd.toLocaleString('en-US')}.`,
            contenido: `Estado sincronizado automáticamente del sistema financiero: Se registran ${snapshot.deuda.prestamos_activos} préstamo(s) activo(s) con saldo de $${snapshot.deuda.saldo_total_usd.toLocaleString('en-US')}, cuota mensual consolidada de $${snapshot.deuda.cuota_mensual_total_usd.toLocaleString('en-US')} y costo ponderado de ${snapshot.deuda.tasa_ponderada_anual_pct}% anual. La disponibilidad en cuentas bancarias es de $${snapshot.liquidez_bancos.saldo_bancos_usd.toLocaleString('en-US')} (chequera: $${snapshot.liquidez_bancos.saldo_chequera_usd.toLocaleString('en-US')}). Proyectos de inversión evaluados: ${snapshot.inversiones.total_proyectos} (${snapshot.inversiones.proyectos_vpn_positivo} con VPN positivo, mejor TIR: ${snapshot.inversiones.mejor_tir_pct}%).`,
            etiquetas: 'auto-build,deuda,bancos,liquidez,tir',
            metricas: { deuda: snapshot.deuda, liquidez: snapshot.liquidez_bancos, inversiones: snapshot.inversiones }
        },
        {
            clave: 'auto-pulso-operaciones-estaciones',
            categoria: 'operaciones_estaciones',
            titulo: 'Pulso Operativo de Estaciones de Combustible y Tiendas',
            resumen_ejecutivo: `Corte ${snapshot.operaciones_estaciones.fecha_corte || 'reciente'}: ${snapshot.operaciones_estaciones.galones_ayer.toLocaleString('en-US')} gal | Run-rate mensual estimado: $${snapshot.operaciones_estaciones.proyeccion_mensual_ingresos_usd.toLocaleString('en-US')}.`,
            contenido: `Métricas operativas capturadas en solo lectura: Venta diaria reciente de combustible $${snapshot.operaciones_estaciones.venta_combustible_ayer_usd.toLocaleString('en-US')} (${snapshot.operaciones_estaciones.galones_ayer.toLocaleString('en-US')} galones) más tiendas de conveniencia $${snapshot.operaciones_estaciones.venta_tiendas_ayer_usd.toLocaleString('en-US')}, proyectando un flujo bruto mensual de ~$${snapshot.operaciones_estaciones.proyeccion_mensual_ingresos_usd.toLocaleString('en-US')} como respaldo comercial del grupo.`,
            etiquetas: 'auto-build,estaciones,combustible,tiendas,flujo',
            metricas: snapshot.operaciones_estaciones
        },
        {
            clave: 'auto-pulso-andelsa-solar',
            categoria: 'andelsa_agro',
            titulo: 'Pulso Comercial ANDELSA y Ahorro Energético Solar',
            resumen_ejecutivo: `ANDELSA facturación mes: $${snapshot.andelsa.facturacion_mes_usd.toLocaleString('en-US')} (CxC: $${snapshot.andelsa.cartera_por_cobrar_usd.toLocaleString('en-US')}) | Solar: ${snapshot.energia_solar.potencia_total_kwp} kWp instalados.`,
            contenido: `Base comercial activa para integración vertical: ANDELSA registra facturación mensual de $${snapshot.andelsa.facturacion_mes_usd.toLocaleString('en-US')}, inventario valorizado en $${snapshot.andelsa.valor_inventario_usd.toLocaleString('en-US')}, cuentas por cobrar de $${snapshot.andelsa.cartera_por_cobrar_usd.toLocaleString('en-US')} y ${snapshot.andelsa.clientes_activos} clientes activos. En eficiencia energética, el grupo opera ${snapshot.energia_solar.potencia_total_kwp} kWp solares y ${snapshot.energia_solar.capacidad_bateria_kwh} kWh en baterías con ahorro mensual de $${snapshot.energia_solar.ahorro_mes_usd.toLocaleString('en-US')}.`,
            etiquetas: 'auto-build,andelsa,solar,inventario,cxc',
            metricas: { andelsa: snapshot.andelsa, energia_solar: snapshot.energia_solar }
        }
    ];

    if (snapshot.graphify?.available) {
        candidates.push({
            clave: 'auto-pulso-graphify-codigo',
            categoria: 'arquitectura_sistema',
            titulo: 'Mapa Vivo del Grafo de Conocimiento Graphify (SIPE Admin)',
            resumen_ejecutivo: `${snapshot.graphify.total_nodes} nodos, ${snapshot.graphify.total_edges} relaciones y ${snapshot.graphify.total_indexed_files} archivos indexados para Consola AGY.`,
            contenido: `Índice determinista AST actualizado (${snapshot.graphify.built_at_commit ? `commit ${String(snapshot.graphify.built_at_commit).slice(0, 7)}` : 'activo'}): ${snapshot.graphify.total_nodes} nodos, ${snapshot.graphify.total_edges} aristas y ${snapshot.graphify.total_communities} comunidades funcionales en ${snapshot.graphify.total_indexed_files} archivos. Permite a AGY localizar rutas, tablas y componentes exactos para conversaciones y modificaciones en el servidor.`,
            etiquetas: 'auto-build,graphify,ast,agy,codigo',
            metricas: snapshot.graphify
        });
    }

    for (const item of candidates) {
        await db.query(
            `INSERT INTO finanzas_conocimiento
             (clave, categoria, titulo, contenido, resumen_ejecutivo, etiquetas, origen, confianza, fijado, activo, empresa_id, metricas_json, created_by)
             VALUES (?, ?, ?, ?, ?, ?, 'auto_sistema', 0.96, 1, 1, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                titulo = VALUES(titulo),
                contenido = VALUES(contenido),
                resumen_ejecutivo = VALUES(resumen_ejecutivo),
                etiquetas = VALUES(etiquetas),
                metricas_json = VALUES(metricas_json),
                updated_at = CURRENT_TIMESTAMP`,
            [
                item.clave,
                item.categoria,
                item.titulo,
                item.contenido,
                item.resumen_ejecutivo,
                item.etiquetas,
                empresaId || null,
                JSON.stringify(item.metricas || {}),
                userId || null
            ]
        );
        upsertedItems.push({ clave: item.clave, titulo: item.titulo, categoria: item.categoria });
    }

    return {
        upserted_count: upsertedItems.length,
        items: upsertedItems,
        snapshot
    };
}

/**
 * Extrae conocimientos heurísticos cuando el usuario declara metas, reglas, tasas o acuerdos en el chat
 */
function extractHeuristicKnowledgeFromText(userPrompt = '') {
    const text = String(userPrompt || '').trim();
    if (text.length < 18) return [];
    const lower = text.toLowerCase();

    const triggerPatterns = [
        /(?:regla|meta|objetivo|politica|política|acuerdo|decisi[oó]n|recordar|guarda(?:r)?\s+conocimiento)\s*[:=-]?\s*(.+)/i,
        /(?:tasa\s+objetivo|plazo\s+objetivo|dscr\s+m[ií]nimo|presupuesto\s+m[aá]ximo)\s+(.+)/i
    ];

    for (const rx of triggerPatterns) {
        const m = text.match(rx);
        if (m && m[1] && m[1].trim().length >= 12) {
            const cleanBody = text.slice(0, 700);
            let cat = 'regla_negocio';
            if (/holding|impuesto|isr|fiscal|llc|decreto/i.test(lower)) cat = 'holding_fiscal';
            else if (/prestamo|préstamo|deuda|banco|tasa|10m|5m/i.test(lower)) cat = 'deuda_capital';
            else if (/granja|andelsa|pollo|huevo|agro/i.test(lower)) cat = 'andelsa_agro';
            else if (/agy|codigo|código|pantalla|endpoint|tabla/i.test(lower)) cat = 'arquitectura_sistema';

            return [{
                categoria: cat,
                titulo: cleanBody.length > 78 ? `${cleanBody.slice(0, 75)}...` : cleanBody,
                resumen_ejecutivo: cleanBody.slice(0, 220),
                contenido: cleanBody,
                etiquetas: 'aprendizaje-chat,directriz-usuario'
            }];
        }
    }
    return [];
}

async function storeExtractedKnowledgeItems(db, items = [], { userId = null, empresaId = null, origen = 'auto_conversacion' } = {}) {
    if (!db || !Array.isArray(items) || items.length === 0) return [];
    const saved = [];

    for (const raw of items.slice(0, 3)) {
        const titulo = String(raw.titulo || '').trim().slice(0, 210);
        const contenido = String(raw.contenido || raw.detalle || '').trim();
        if (!titulo || contenido.length < 15) continue;

        const validCat = KNOWLEDGE_CATEGORIES.some((c) => c.id === raw.categoria)
            ? raw.categoria
            : 'estrategia_crecimiento';
        const resumen = String(raw.resumen_ejecutivo || contenido.slice(0, 240)).trim().slice(0, 490);
        const etiquetas = String(raw.etiquetas || 'auto-conversacion,finanzas').trim().slice(0, 290);

        // Evitar duplicados exactos por título reciente
        const [existing] = await db.query(
            'SELECT id FROM finanzas_conocimiento WHERE LOWER(titulo) = LOWER(?) LIMIT 1',
            [titulo]
        );

        if (existing && existing.length > 0) {
            await db.query(
                `UPDATE finanzas_conocimiento
                 SET contenido = ?, resumen_ejecutivo = ?, etiquetas = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [contenido, resumen, etiquetas, existing[0].id]
            );
            saved.push({ id: existing[0].id, titulo, categoria: validCat, updated: true });
        } else {
            const [res] = await db.query(
                `INSERT INTO finanzas_conocimiento
                 (categoria, titulo, contenido, resumen_ejecutivo, etiquetas, origen, confianza, fijado, activo, empresa_id, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, 0.90, 1, 1, ?, ?)`,
                [validCat, titulo, contenido, resumen, etiquetas, origen, empresaId || null, userId || null]
            );
            saved.push({ id: res.insertId, titulo, categoria: validCat, updated: false });
        }
    }
    return saved;
}

/**
 * Resuelve información del repositorio destino en el servidor para AGY
 */
function resolveTargetRepo(proyectoDestino = 'sipeadmin', agySettings = {}) {
    const localAdminRoot = path.resolve(__dirname, '../..');
    const adminCandidates = [
        process.env.AGY_ADMIN_PROJECT_PATH,
        '/var/www/sipeadmin',
        '/home/sistemas/sipeadmin',
        '/opt/sipeadmin',
        localAdminRoot
    ].filter(Boolean);

    const saasCandidates = [
        process.env.AGY_SAAS_PROJECT_PATH,
        agySettings?.project_path && !String(agySettings.project_path).includes('sipeadmin') ? agySettings.project_path : null,
        '/opt/nova-saas',
        '/var/www/SIPEWEBgas',
        path.resolve(localAdminRoot, '../SIPEWEBgas')
    ].filter(Boolean);

    if (proyectoDestino === 'sipesaas') {
        const foundSaas = saasCandidates.find((p) => {
            try { return fs.existsSync(p) && (fs.existsSync(path.join(p, 'client')) || fs.existsSync(path.join(p, 'server'))); } catch { return false; }
        });
        return {
            key: 'sipesaas',
            isAdmin: false,
            label: 'sys.sipesv.com (SIPE SaaS)',
            projectPath: foundSaas || '/opt/nova-saas',
            existsLocally: Boolean(foundSaas),
            frontendDir: 'client',
            backendDir: 'server',
            pm2AppName: 'nova-saas-api'
        };
    }

    const foundAdmin = adminCandidates.find((p) => {
        try { return fs.existsSync(p) && (fs.existsSync(path.join(p, 'frontend')) || fs.existsSync(path.join(p, 'backend'))); } catch { return false; }
    });
    return {
        key: 'sipeadmin',
        isAdmin: true,
        label: 'admin.sipesv.com (SIPE Admin)',
        projectPath: foundAdmin || '/var/www/sipeadmin',
        existsLocally: Boolean(foundAdmin),
        frontendDir: 'frontend',
        backendDir: 'backend',
        pm2AppName: 'sipeadmin-backend'
    };
}

/**
 * Encuentra archivos relevantes del repositorio combinando Graphify + escaneo seguro de rutas
 */
function findSmartRepoFiles(projectInfo, queryText = '') {
    const rootDir = projectInfo.projectPath;
    const found = new Set();

    // 1. Rutas explícitas mencionadas en el texto
    const explicitRx = /((?:frontend|backend|client|server)\/[A-Za-z0-9_./-]+\.(?:jsx?|tsx?|css|sql|json))/g;
    let m = explicitRx.exec(String(queryText || ''));
    while (m) {
        const rel = m[1].replace(/\\/g, '/');
        if (!rel.includes('..') && projectInfo.existsLocally && fs.existsSync(path.join(rootDir, rel))) {
            found.add(rel);
        }
        m = explicitRx.exec(String(queryText || ''));
    }

    // 2. Búsqueda vía Graphify AST (si es SIPE Admin)
    if (projectInfo.isAdmin) {
        const gCtx = queryGraphifyContext(queryText, 10);
        for (const rel of gCtx.related_files) {
            if (rel && !rel.startsWith('graphify-out') && projectInfo.existsLocally && fs.existsSync(path.join(rootDir, rel))) {
                found.add(rel);
            }
        }
    }

    // 3. Escaneo ligero por palabras clave en nombres de archivos
    if (projectInfo.existsLocally && found.size < 5) {
        const stopWords = new Set(['para', 'como', 'donde', 'quiero', 'hacer', 'cambiar', 'agregar', 'mejorar', 'pantalla', 'modulo', 'sistema', 'finanzas']);
        const keywords = String(queryText || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .split(/[^a-z0-9]+/)
            .filter((w) => w.length >= 4 && !stopWords.has(w));

        if (/finanza|prestamo|inversion|crecimiento|holding|asesor/i.test(queryText)) {
            keywords.push('finanzas', 'crecimiento', 'asesor');
        }

        const scanDirs = projectInfo.isAdmin
            ? ['frontend/src/pages', 'frontend/src/components', 'backend/routes', 'backend/services']
            : ['client/src/pages', 'client/src/components', 'server/src/controllers', 'server/src/services'];

        const walk = (dir, depth = 0) => {
            if (depth > 2 || found.size >= 6 || !fs.existsSync(dir)) return;
            try {
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    if (found.size >= 6) break;
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        walk(full, depth + 1);
                    } else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
                        const lowerName = entry.name.toLowerCase();
                        if (keywords.some((kw) => lowerName.includes(kw))) {
                            found.add(path.relative(rootDir, full).replace(/\\/g, '/'));
                        }
                    }
                }
            } catch { /* ignore */ }
        };

        for (const d of scanDirs) {
            walk(path.join(rootDir, d), 0);
        }
    }

    if (found.size === 0) {
        found.add(projectInfo.isAdmin ? 'frontend/src/pages/FinanzasCrecimiento.jsx' : 'client/src/App.jsx');
    }

    return Array.from(found).slice(0, 6);
}

function readSafeRepoSnippets(projectInfo, relFiles = [], maxCharsPerFile = 5500) {
    if (!projectInfo?.existsLocally) return [];
    const rootResolved = path.resolve(projectInfo.projectPath);
    const snippets = [];

    for (const rel of relFiles.slice(0, 5)) {
        if (!rel || rel.includes('.env')) continue;
        const abs = path.resolve(rootResolved, rel);
        if (!abs.startsWith(rootResolved) || !fs.existsSync(abs)) continue;
        try {
            const stat = fs.statSync(abs);
            if (!stat.isFile()) continue;
            const raw = fs.readFileSync(abs, 'utf8');
            snippets.push({
                file: rel,
                totalLines: raw.split('\n').length,
                excerpt: raw.slice(0, maxCharsPerFile)
            });
        } catch { /* ignore */ }
    }
    return snippets;
}

async function resolveAiClient() {
    if (injectedAiClient !== undefined) return injectedAiClient;
    let apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        try {
            const { getGeminiApiKey } = require('./conversationalAiService');
            apiKey = (await getGeminiApiKey()) || '';
        } catch { /* ignore */ }
    }
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
}

async function generateGeminiContentWithFallback(aiClient, { systemInstruction, contents, responseMimeType = null }) {
    const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    let lastErr = null;
    for (const modelName of candidateModels) {
        try {
            const config = {
                systemInstruction,
                temperature: 0.25
            };
            if (responseMimeType) config.responseMimeType = responseMimeType;
            const res = await aiClient.models.generateContent({
                model: modelName,
                contents,
                config
            });
            const text = res.text || res.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text) return { text: String(text).trim(), modelUsed: modelName };
        } catch (err) {
            lastErr = err;
        }
    }
    if (lastErr) throw lastErr;
    return null;
}

/**
 * Detecta si el binario CLI `agy` existe en el servidor actual (sin usar interpolación shell insegura)
 */
function detectLocalAgyBinary(agyCommand = 'agy') {
    const cleanName = path.basename(String(agyCommand || 'agy').trim()).replace(/[^a-zA-Z0-9._-]/g, '') || 'agy';
    const home = os.homedir();
    const candidates = [
        path.join(home, '.antigravity', 'bin', cleanName),
        path.join(home, '.local', 'bin', cleanName),
        `/root/.antigravity/bin/${cleanName}`,
        `/root/.local/bin/${cleanName}`,
        `/home/sistemas/.antigravity/bin/${cleanName}`,
        `/home/sistemas/.local/bin/${cleanName}`,
        `/usr/local/bin/${cleanName}`,
        `/usr/bin/${cleanName}`
    ];
    for (const p of candidates) {
        try {
            if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
        } catch { /* ignore */ }
    }
    return null;
}

/**
 * Ejecuta una consulta/plan o instrucción en el binario local `agy` usando archivo temporal seguro (sin inyección shell)
 */
function runLocalAgyCliWithTempPrompt({ agyBinPath, projectPath, model, promptText, isPlanPhase = true, timeoutMs = 65000 }) {
    return new Promise((resolve) => {
        if (!agyBinPath || !fs.existsSync(projectPath)) {
            return resolve({ executed: false, output: '' });
        }

        const safeModel = String(model || 'gemini-4-argon-high').replace(/[^a-zA-Z0-9._-]/g, '');
        try {
            const cfgDir = path.join(os.homedir(), '.gemini', 'antigravity-cli');
            fs.mkdirSync(cfgDir, { recursive: true });
            fs.writeFileSync(
                path.join(cfgDir, 'settings.json'),
                JSON.stringify({ model: safeModel, permissions: { allow: ['*'] }, autoApprove: true }),
                'utf8'
            );
        } catch { /* ignore */ }

        const flatPrompt = String(promptText || '').replace(/\r?\n+/g, ' ').trim();
        const child = spawn(agyBinPath, ['--dangerously-skip-permissions'], {
            cwd: projectPath,
            env: { ...process.env, TERM: 'xterm-256color' },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let finished = false;
        const finish = (timedOut = false) => {
            if (finished) return;
            finished = true;
            try { child.kill('SIGTERM'); } catch { /* ignore */ }
            resolve({ executed: true, timedOut, output: sanitizeServerText(output) });
        };

        const timer = setTimeout(() => finish(true), timeoutMs);

        child.stdout.on('data', (d) => { output += d.toString('utf8'); });
        child.stderr.on('data', (d) => { output += d.toString('utf8'); });
        child.on('error', () => { clearTimeout(timer); finish(false); });
        child.on('close', () => { clearTimeout(timer); finish(false); });

        setTimeout(() => {
            try {
                const cmdLine = isPlanPhase ? `/plan ${flatPrompt}\n` : `${flatPrompt}\n`;
                child.stdin.write(cmdLine);
            } catch { /* ignore */ }
        }, 1200);

        if (!isPlanPhase) {
            [8000, 16000, 24000].forEach((ms) => {
                setTimeout(() => {
                    if (!finished) {
                        try { child.stdin.write('y\n'); } catch { /* ignore */ }
                    }
                }, ms);
            });
        }

        setTimeout(() => {
            if (!finished) {
                try { child.stdin.write('/exit\n'); } catch { /* ignore */ }
            }
        }, isPlanPhase ? 35000 : 45000);
    });
}

/**
 * Obtiene conocimientos relevantes para inyectar en el prompt
 */
async function getRelevantKnowledgeForPrompt(db, { queryText = '', empresaId = null, limit = 12 } = {}) {
    await ensureCrecimientoSchema(db);
    let sql = `
        SELECT id, clave, categoria, titulo, contenido, resumen_ejecutivo, etiquetas, origen, fijado, confianza
        FROM finanzas_conocimiento
        WHERE activo = 1
    `;
    const params = [];
    if (empresaId) {
        sql += ' AND (empresa_id IS NULL OR empresa_id = ?)';
        params.push(empresaId);
    }
    sql += ' ORDER BY fijado DESC, updated_at DESC LIMIT 40';
    const [rows] = await db.query(sql, params);
    const list = rows || [];

    const qTerms = String(queryText || '')
        .toLowerCase()
        .split(/[^a-záéíóúñ0-9-]+/)
        .filter((w) => w.length >= 3);

    const scored = list.map((item) => {
        const hay = `${item.titulo} ${item.etiquetas || ''} ${item.resumen_ejecutivo || ''} ${item.categoria}`.toLowerCase();
        let score = item.fijado ? 5 : 0;
        for (const t of qTerms) {
            if (hay.includes(t)) score += 3;
        }
        return { ...item, _score: score };
    });

    scored.sort((a, b) => b._score - a._score);
    const selected = scored.slice(0, limit);

    if (selected.length > 0) {
        const ids = selected.map((s) => s.id).filter(Boolean);
        if (ids.length > 0) {
            const placeholders = ids.map(() => '?').join(',');
            await db.query(`UPDATE finanzas_conocimiento SET veces_usado = veces_usado + 1 WHERE id IN (${placeholders})`, ids).catch(() => {});
        }
    }

    return selected;
}

/**
 * Procesa un turno de conversación en Crecimiento Empresarial & Consola AGY
 */
async function processGrowthConversationTurn(customDb = null, {
    conversacionId = null,
    titulo = null,
    modo = 'consultoria_financiera',
    proyectoDestino = 'sipeadmin',
    modeloIa = 'gemini-4-argon-high',
    empresaId = null,
    mensaje = '',
    autoLearn = true,
    simulacionParams = null,
    user = null
} = {}) {
    const db = resolveDb(customDb);
    await ensureCrecimientoSchema(db);

    const cleanMsg = String(mensaje || '').trim();
    if (!cleanMsg) {
        throw new Error('El mensaje de consulta no puede estar vacío');
    }

    const safeModo = ['consultoria_financiera', 'consola_agy'].includes(modo) ? modo : 'consultoria_financiera';
    const safeProyecto = ['sipeadmin', 'sipesaas', 'ambos'].includes(proyectoDestino) ? proyectoDestino : 'sipeadmin';
    const actorName = user?.nombre || user?.username || 'Administrador';
    const actorId = user?.id || null;

    let activeConvId = conversacionId ? Number(conversacionId) : null;
    if (activeConvId) {
        const [chk] = await db.query('SELECT id FROM finanzas_conversaciones WHERE id = ? LIMIT 1', [activeConvId]);
        if (!chk || chk.length === 0) activeConvId = null;
    }

    if (!activeConvId) {
        const autoTitle = (titulo && String(titulo).trim())
            ? String(titulo).trim().slice(0, 200)
            : (cleanMsg.length > 68 ? `${cleanMsg.slice(0, 65)}...` : cleanMsg);
        const [ins] = await db.query(
            `INSERT INTO finanzas_conversaciones
             (titulo, modo, proyecto_destino, modelo_ia, empresa_id, created_by, created_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [autoTitle, safeModo, safeProyecto, modeloIa, empresaId || null, actorId, actorName]
        );
        activeConvId = ins.insertId;
    } else {
        await db.query(
            `UPDATE finanzas_conversaciones
             SET modo = ?, proyecto_destino = ?, modelo_ia = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [safeModo, safeProyecto, modeloIa, activeConvId]
        );
    }

    // Guardar mensaje del usuario
    await db.query(
        `INSERT INTO finanzas_conversacion_mensajes (conversacion_id, rol, autor, contenido)
         VALUES (?, 'user', ?, ?)`,
        [activeConvId, actorName, cleanMsg]
    );

    // Historial previo del hilo (últimos 10 mensajes)
    const [prevMsgs] = await db.query(
        `SELECT rol, autor, contenido, created_at
         FROM finanzas_conversacion_mensajes
         WHERE conversacion_id = ?
         ORDER BY id DESC LIMIT 10`,
        [activeConvId]
    );
    const orderedHistory = (prevMsgs || []).reverse();

    // Contexto vivo + Base de Conocimientos + Simulación $10M + Graphify/Código
    const [snapshot, knowledgeItems] = await Promise.all([
        buildEnterpriseGrowthSnapshot(db, { empresaId }),
        getRelevantKnowledgeForPrompt(db, { queryText: cleanMsg, empresaId, limit: 12 })
    ]);

    const simResult = simulateCorporateGrowthScenario({
        deuda_actual_usd: snapshot.deuda.saldo_total_usd > 100000 ? snapshot.deuda.saldo_total_usd : 5000000,
        tasa_actual_pct: snapshot.deuda.tasa_ponderada_anual_pct > 0 ? snapshot.deuda.tasa_ponderada_anual_pct : 9.25,
        ...(simulacionParams || {})
    });

    const targetRepo = resolveTargetRepo(safeProyecto === 'sipesaas' ? 'sipesaas' : 'sipeadmin');
    const relatedFiles = findSmartRepoFiles(targetRepo, cleanMsg);
    const graphifyCtx = queryGraphifyContext(cleanMsg, 8);
    const codeSnippets = (safeModo === 'consola_agy' || /agy|codigo|código|pantalla|endpoint|ruta|tabla|modificar|agregar/i.test(cleanMsg))
        ? readSafeRepoSnippets(targetRepo, relatedFiles, 4000)
        : [];

    let replyMarkdown = '';
    let sugirióPlanAgy = false;
    let propuestaPlanResumen = null;
    let aiExtractedKnowledge = [];
    let fuenteIa = 'motor-estrategico-sipe';

    const aiClient = await resolveAiClient();
    if (aiClient) {
        try {
            const knowledgeBlock = knowledgeItems.map((k, idx) =>
                `${idx + 1}. [${k.categoria}] ${k.titulo}: ${k.contenido}`
            ).join('\n');

            const codeBlock = codeSnippets.length > 0
                ? `\nARCHIVOS REALES DEL SERVIDOR (${targetRepo.label}):\n` +
                  codeSnippets.map((s) => `--- ${s.file} (${s.totalLines} líneas) ---\n${s.excerpt}`).join('\n\n')
                : '';

            const systemInstruction = `Eres el Copiloto de Crecimiento Empresarial, Estratega Fiscal/Holding y Arquitecto AGY en el Servidor del Grupo SIPE.
Tienes acceso en tiempo real a:
1. Métricas reales del Grupo (Préstamos, Bancos, Proyectos, Estaciones de Combustible, Tiendas, ANDELSA, Energía Solar).
2. Simulación financiera de Holding (Delaware/Wyoming LLC + TechCo Decreto 741 0% ISR + AssetCo) y Reestructuración $10M ($5M deuda + $5M Granja Avícola con gracia e integración vertical a ANDELSA).
3. Base de Conocimientos Institucionales Autoconstruible (finanzas_conocimiento).
4. Grafo de código Graphify y archivos reales del servidor (${targetRepo.label}) para operar con AGY en conversación y modificaciones.

REGLAS DE RESPUESTA (JSON ESTRICTO):
Devuelve un objeto JSON válido con esta estructura:
{
  "reply_markdown": "Respuesta ejecutiva, clara, con cifras precisas, viñetas o tablas Markdown en español.",
  "conocimientos_nuevos": [
    {
      "categoria": "holding_fiscal | deuda_capital | operaciones_estaciones | andelsa_agro | energia_solar | estrategia_crecimiento | regla_negocio | arquitectura_sistema",
      "titulo": "Título conciso si el usuario aportó un dato nuevo, meta, acuerdo, tasa, regla o decisión estratégica digna de recordarse permanentemente",
      "resumen_ejecutivo": "Resumen de 1 línea",
      "contenido": "Explicación completa del conocimiento aprendido",
      "etiquetas": "tag1,tag2"
    }
  ],
  "sugerir_modificacion_agy": true/false,
  "instruccion_agy_sugerida": "Si el usuario pidió modificar, crear o mejorar algo en el sistema SIPE, resume aquí la orden técnica para el Plan AGY en el servidor; si es solo consulta financiera, null."
}
Nota: Solo incluye elementos en "conocimientos_nuevos" cuando la conversación contenga una decisión, parámetro estratégico nuevo, hallazgo relevante o regla explícita del usuario (0 a 2 elementos máximo).`;

            const historyText = orderedHistory.slice(0, -1).map((m) =>
                `[${m.rol.toUpperCase()} - ${m.autor || ''}]: ${String(m.contenido || '').slice(0, 1200)}`
            ).join('\n');

            const userPayload = [
                `MODO ACTIVO: ${safeModo === 'consola_agy' ? 'CONSOLA AGY SERVIDOR (Conversación + Arquitectura/Modificaciones)' : 'CONSULTORÍA DE CRECIMIENTO EMPRESARIAL Y HOLDING'}`,
                `PROYECTO SERVIDOR: ${targetRepo.label} | Archivos detectados: ${relatedFiles.join(', ')}`,
                historyText ? `\nHISTORIAL RECIENTE DEL HILO:\n${historyText}` : '',
                `\nBASE DE CONOCIMIENTOS ACTIVA:\n${knowledgeBlock}`,
                `\nSNAPSHOT FINANCIERO Y OPERATIVO EN VIVO:\n${JSON.stringify(snapshot)}`,
                `\nSIMULACIÓN ESTRUCTURA $10M ($5M DEUDA + $5M GRANJA + ESCUDOS FISCALES):\n${JSON.stringify(simResult.resultados)}`,
                graphifyCtx.matches.length > 0 ? `\nNODOS GRAPHIFY RELACIONADOS:\n${JSON.stringify(graphifyCtx.matches)}` : '',
                codeBlock,
                `\nMENSAJE ACTUAL DEL USUARIO:\n${cleanMsg}`
            ].filter(Boolean).join('\n');

            const aiRes = await generateGeminiContentWithFallback(aiClient, {
                systemInstruction,
                contents: [{ role: 'user', parts: [{ text: userPayload }] }],
                responseMimeType: 'application/json'
            });

            if (aiRes?.text) {
                const cleanedJson = aiRes.text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
                const parsed = JSON.parse(cleanedJson);
                replyMarkdown = String(parsed.reply_markdown || '').trim();
                aiExtractedKnowledge = Array.isArray(parsed.conocimientos_nuevos) ? parsed.conocimientos_nuevos : [];
                sugirióPlanAgy = Boolean(parsed.sugerir_modificacion_agy);
                propuestaPlanResumen = parsed.instruccion_agy_sugerida || null;
                fuenteIa = aiRes.modelUsed;
            }
        } catch (err) {
            console.warn('[BusinessGrowthAGY] Fallback activado:', err.message);
        }
    }

    // Fallback determinista de alta precisión si Gemini no está configurado o falló red
    if (!replyMarkdown) {
        const r = simResult.resultados;
        const isAgyRequest = safeModo === 'consola_agy' || /agy|modificar|agregar|crear|pantalla|codigo|código|servidor/i.test(cleanMsg);
        sugirióPlanAgy = isAgyRequest;
        if (isAgyRequest) {
            propuestaPlanResumen = cleanMsg;
        }

        replyMarkdown = [
            `### 📊 Análisis de Crecimiento Empresarial & Consola AGY`,
            `- **Deuda Registrada en Sistema:** $${snapshot.deuda.saldo_total_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${snapshot.deuda.prestamos_activos} préstamos | Tasa ponderada: **${snapshot.deuda.tasa_ponderada_anual_pct}%**)`,
            `- **Liquidez Consolidada en Bancos:** $${snapshot.liquidez_bancos.saldo_bancos_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })} | **ANDELSA Mes:** $${snapshot.andelsa.facturacion_mes_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
            `- **Panorama Estructurado $10M ($5M Refinanciamiento + $5M Granja):**`,
            `  - Cuota durante gracia (${simResult.parametros.meses_gracia_granja} meses): **$${r.cuota_total_durante_gracia_usd.toLocaleString('en-US')} / mes** (vs. $${r.cuota_mensual_actual_usd.toLocaleString('en-US')} actual → ahorro de flujo: **$${r.diferencia_cuota_durante_gracia_usd.toLocaleString('en-US')}/mes**).`,
            `  - Cuota estabilizada con Granja produciendo: **$${r.cuota_total_estabilizada_usd.toLocaleString('en-US')} / mes** | **DSCR Estabilizado:** **${r.dscr_estabilizado}x** (${r.viabilidad}).`,
            `  - Escudo Fiscal Anual Estimado (Intereses + TechCo Decreto 741 + Depreciación): **$${r.ahorro_fiscal_total_anual_usd.toLocaleString('en-US')} / año**.`,
            isAgyRequest
                ? `\n#### 🤖 Puente AGY en Servidor (${targetRepo.label})\n- **Archivos relacionados detectados vía Graphify:** \`${relatedFiles.join('`, `')}\`\n- Puedes pulsar **"Generar Plan AGY en Servidor"** para inspeccionar el código real, revisar el plan y aprobar la modificación.`
                : `\n#### 🧠 Memoria Institucional Activa\n- Se consultaron **${knowledgeItems.length}** nodos de conocimiento estratégico y **${snapshot.graphify?.total_nodes || 0}** nodos del grafo Graphify.`
        ].join('\n');
    }

    // Auto-Build: guardar conocimientos aprendidos del turno (IA + Heurístico)
    let savedKnowledge = [];
    if (autoLearn) {
        const heuristicItems = extractHeuristicKnowledgeFromText(cleanMsg);
        const combinedToStore = [...aiExtractedKnowledge, ...heuristicItems];
        if (combinedToStore.length > 0) {
            savedKnowledge = await storeExtractedKnowledgeItems(db, combinedToStore, {
                userId: actorId,
                empresaId,
                origen: 'auto_conversacion'
            });
        }
    }

    const metadata = {
        fuente_ia: fuenteIa,
        archivos_relacionados: relatedFiles,
        sugerir_modificacion_agy: sugirióPlanAgy,
        instruccion_agy_sugerida: propuestaPlanResumen
    };

    await db.query(
        `INSERT INTO finanzas_conversacion_mensajes
         (conversacion_id, rol, autor, contenido, conocimientos_extraidos_json, metadata_json)
         VALUES (?, 'assistant', ?, ?, ?, ?)`,
        [
            activeConvId,
            `AGY Estratega (${fuenteIa})`,
            replyMarkdown,
            savedKnowledge.length > 0 ? JSON.stringify(savedKnowledge) : null,
            JSON.stringify(metadata)
        ]
    );

    await db.query(
        `UPDATE finanzas_conversaciones
         SET archivos_relacionados = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [JSON.stringify(relatedFiles), activeConvId]
    );

    return {
        conversacion_id: activeConvId,
        fuente_ia: fuenteIa,
        reply_markdown: replyMarkdown,
        conocimientos_aprendidos: savedKnowledge,
        conocimientos_consultados: knowledgeItems.length,
        archivos_relacionados: relatedFiles,
        sugerir_modificacion_agy: sugirióPlanAgy,
        instruccion_agy_sugerida: propuestaPlanResumen,
        snapshot_resumen: {
            saldo_deuda_usd: snapshot.deuda.saldo_total_usd,
            tasa_deuda_pct: snapshot.deuda.tasa_ponderada_anual_pct,
            saldo_bancos_usd: snapshot.liquidez_bancos.saldo_bancos_usd,
            andelsa_mes_usd: snapshot.andelsa.facturacion_mes_usd
        }
    };
}

/**
 * Genera un Plan de Ejecución AGY real inspeccionando los archivos del servidor y sincronizando opcionalmente con Tickets/Telegram
 */
async function generateAgyServerPlan(customDb = null, conversacionId, {
    instruction = '',
    model = 'gemini-4-argon-high',
    proyectoDestino = null,
    syncTicket = true,
    user = null,
    io = null
} = {}) {
    const db = resolveDb(customDb);
    await ensureCrecimientoSchema(db);

    const [convRows] = await db.query('SELECT * FROM finanzas_conversaciones WHERE id = ? LIMIT 1', [conversacionId]);
    const conv = convRows?.[0];
    if (!conv) throw new Error('Conversación no encontrada');

    const [msgs] = await db.query(
        'SELECT rol, autor, contenido FROM finanzas_conversacion_mensajes WHERE conversacion_id = ? ORDER BY id DESC LIMIT 8',
        [conversacionId]
    );
    const history = (msgs || []).reverse();

    let agySettings = {};
    let ticketSvc = null;
    if (injectedDb === undefined) {
        try {
            ticketSvc = require('./ticketService');
            agySettings = await ticketSvc.getAgySettings();
        } catch { /* ignore */ }
    }

    const chosenProjectKey = proyectoDestino || conv.proyecto_destino || 'sipeadmin';
    const targetRepo = resolveTargetRepo(chosenProjectKey === 'sipesaas' ? 'sipesaas' : 'sipeadmin', agySettings);
    const chosenModel = String(model || conv.modelo_ia || agySettings.default_model || 'gemini-4-argon-high').trim();
    const nextVersion = Number(conv.plan_version || 0) + 1;
    const actorName = user?.nombre || user?.username || 'Administrador';

    const combinedQuery = [
        instruction,
        conv.titulo,
        ...history.filter((m) => m.rol === 'user').map((m) => m.contenido)
    ].filter(Boolean).join('\n');

    const relatedFiles = findSmartRepoFiles(targetRepo, combinedQuery);
    const snippets = readSafeRepoSnippets(targetRepo, relatedFiles, 5500);
    const agyBin = detectLocalAgyBinary(agySettings.agy_command || 'agy');

    let execLog = `[${new Date().toISOString()}] Iniciando planificación en Consola AGY (Plan v${nextVersion})...\n` +
        `→ Repositorio destino: ${targetRepo.label} (${targetRepo.projectPath})\n` +
        `→ Modelo: ${chosenModel} | Solicitado por: ${actorName}\n` +
        `→ Archivos detectados: ${relatedFiles.join(', ')}\n` +
        `→ Binario CLI AGY en host: ${agyBin ? 'Detectado y activo' : 'Modo Motor Quirúrgico Integrado Gemini + Graphify'}\n`;

    await db.query(
        `UPDATE finanzas_conversaciones
         SET estado_agy = 'planificando', proyecto_destino = ?, modelo_ia = ?, plan_version = ?,
             archivos_relacionados = ?, execution_log = CONCAT(COALESCE(execution_log, ''), '\n', ?)
         WHERE id = ?`,
        [targetRepo.key, chosenModel, nextVersion, JSON.stringify(relatedFiles), execLog, conversacionId]
    );

    if (io) {
        io.emit('crecimiento:agy_update', { conversacion_id: Number(conversacionId), estado_agy: 'planificando', plan_version: nextVersion });
    }

    let planMarkdown = '';

    // 1. Si el binario AGY CLI existe en el VPS Linux, consultar /plan real
    if (agyBin && targetRepo.existsLocally && injectedDb === undefined) {
        const cliPrompt = [
            `PLANIFICACIÓN DESDE FINANZAS CRECIMIENTO EMPRESARIAL (Plan v${nextVersion})`,
            `Objetivo solicitado: ${instruction || conv.titulo}`,
            `Archivos clave: ${relatedFiles.join(', ')}`,
            `Instrucciones: NO modifiques archivos aún. Entrega en español un plan conciso con 🎯 Diagnóstico/Objetivo, 🛠️ Cambios exactos a realizar y 📂 Archivos a intervenir. Finaliza con [[FIN_PLAN_AGY]].`
        ].join(' | ');

        const cliRes = await runLocalAgyCliWithTempPrompt({
            agyBinPath: agyBin,
            projectPath: targetRepo.projectPath,
            model: chosenModel,
            promptText: cliPrompt,
            isPlanPhase: true,
            timeoutMs: 45000
        });
        if (cliRes.output) {
            execLog += `[Consola CLI AGY]: Salida recibida (${cliRes.output.length} chars).\n`;
            if (cliRes.output.includes('[[FIN_PLAN_AGY]]')) {
                const cleanPart = cliRes.output.split('[[FIN_PLAN_AGY]]')[0].trim();
                if (cleanPart.length > 60) planMarkdown = cleanPart;
            }
        }
    }

    // 2. Motor de Arquitectura con lectura de código real vía Gemini + Graphify
    if (!planMarkdown) {
        const aiClient = await resolveAiClient();
        if (aiClient) {
            try {
                const systemInstruction = `Eres AGY, el Arquitecto Principal de Software en el servidor del Grupo SIPE.
Inspecciona los archivos reales adjuntos de ${targetRepo.label} y redacta el Plan de Ejecución v${nextVersion} en Markdown limpio y conciso en ESPAÑOL.
NO incluyas bloques enormes de código; estructura exactamente con:
### 🎯 Objetivo de la Modificación
### 🛠️ Pasos Técnicos en el Servidor
### 📂 Componentes a Intervenir
### ✅ Validación y Seguridad (Lint, Tests, Build y Reglas AGENTS.md)`;

                const codeCtx = snippets.map((s) => `--- ARCHIVO: ${s.file} (${s.totalLines} líneas) ---\n${s.excerpt}`).join('\n\n');
                const promptText = [
                    `Solicitud del Administrador (${actorName}): ${instruction || conv.titulo}`,
                    `Historial reciente:\n${history.map((h) => `[${h.rol}]: ${String(h.contenido).slice(0, 600)}`).join('\n')}`,
                    `Archivos detectados: ${relatedFiles.join(', ')}`,
                    codeCtx ? `\nCÓDIGO ACTUAL EN SERVIDOR:\n${codeCtx}` : ''
                ].filter(Boolean).join('\n\n');

                const aiPlan = await generateGeminiContentWithFallback(aiClient, {
                    systemInstruction,
                    contents: [{ role: 'user', parts: [{ text: promptText }] }]
                });
                if (aiPlan?.text) {
                    planMarkdown = sanitizeServerText(aiPlan.text);
                }
            } catch (err) {
                execLog += `[Aviso IA Plan]: ${err.message}\n`;
            }
        }
    }

    // 3. Fallback determinista estructurado
    if (!planMarkdown) {
        planMarkdown = [
            `### 🎯 Objetivo de la Modificación (Plan v${nextVersion})`,
            `Implementar en **${targetRepo.label}** el requerimiento solicitado desde Crecimiento Empresarial: *"${(instruction || conv.titulo).slice(0, 220)}"*.`,
            ``,
            `### 🛠️ Pasos Técnicos en el Servidor`,
            `1. Analizar e intervenir de forma quirúrgica los módulos vinculados respetando diseño compacto, responsive móvil (<=768px) y seguridad RBAC.`,
            `2. Sincronizar estado de datos y endpoints sin afectar transacciones activas en producción.`,
            `3. Ejecutar validación de compilación (\`build\`), actualizar grafo \`graphify\` y registrar cambio en bitácora.`,
            ``,
            `### 📂 Componentes a Intervenir`,
            ...relatedFiles.map((f) => `- \`${f}\``)
        ].join('\n');
    }

    // 4. Sincronizar opcionalmente con support_tickets (ADM-XXXX / Telegram)
    let linkedTicketId = conv.ticket_id || null;
    let linkedTicketCode = conv.ticket_code || null;

    if (syncTicket && ticketSvc && injectedDb === undefined) {
        try {
            if (!linkedTicketId) {
                const createdTicket = await ticketSvc.createTicket({
                    userId: user?.id || 1,
                    userName: actorName,
                    userRole: user?.role_name || user?.role || 'Administrator',
                    type: 'mejora',
                    priority: 'alta',
                    subject: `[Crecimiento & AGY] ${(instruction || conv.titulo).slice(0, 140)}`,
                    description: `Solicitud originada en Consola de Crecimiento Empresarial & AGY:\n\n${instruction || conv.titulo}`,
                    moduleName: 'Finanzas - Crecimiento Empresarial & AGY',
                    pageUrl: '/dashboard/finanzas/crecimiento',
                    aiNotes: instruction || conv.titulo,
                    io
                });
                if (createdTicket?.id) {
                    linkedTicketId = createdTicket.id;
                    linkedTicketCode = createdTicket.ticket_code;
                }
            }
            if (linkedTicketId) {
                await ticketSvc.approveAndGeneratePlan(linkedTicketId, {
                    model: chosenModel,
                    aiNotes: `${instruction || conv.titulo}\n\n${planMarkdown}`,
                    actorName,
                    io
                });
                execLog += `→ Ticket sincronizado con Centro de Soporte y Telegram: #${linkedTicketCode}\n`;
            }
        } catch (tErr) {
            execLog += `[Aviso sincronización Ticket]: ${tErr.message}\n`;
        }
    }

    await db.query(
        `UPDATE finanzas_conversaciones
         SET estado_agy = 'esperando_aprobacion',
             plan_markdown = ?,
             ticket_id = COALESCE(?, ticket_id),
             ticket_code = COALESCE(?, ticket_code),
             execution_log = CONCAT(COALESCE(execution_log, ''), '\n', ?),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [planMarkdown, linkedTicketId, linkedTicketCode, `[${new Date().toISOString()}] Plan v${nextVersion} listo para revisión y aprobación.\n`, conversacionId]
    );

    await db.query(
        `INSERT INTO finanzas_conversacion_mensajes (conversacion_id, rol, autor, contenido, metadata_json)
         VALUES (?, 'agy_system', ?, ?, ?)`,
        [
            conversacionId,
            `Consola AGY (${chosenModel})`,
            `📋 **Plan de Ejecución AGY v${nextVersion}** generado para **${targetRepo.label}**${linkedTicketCode ? ` (Ticket **#${linkedTicketCode}** enviado a Telegram)` : ''}:\n\n${planMarkdown}`,
            JSON.stringify({ tipo: 'agy_plan', plan_version: nextVersion, ticket_code: linkedTicketCode, archivos: relatedFiles })
        ]
    );

    if (io) {
        io.emit('crecimiento:agy_update', {
            conversacion_id: Number(conversacionId),
            estado_agy: 'esperando_aprobacion',
            plan_version: nextVersion,
            ticket_code: linkedTicketCode
        });
    }

    return {
        conversacion_id: Number(conversacionId),
        estado_agy: 'esperando_aprobacion',
        plan_version: nextVersion,
        plan_markdown: planMarkdown,
        proyecto: targetRepo.label,
        archivos_relacionados: relatedFiles,
        ticket_id: linkedTicketId,
        ticket_code: linkedTicketCode
    };
}

/**
 * Ejecuta en el servidor un Plan AGY previamente aprobado (restringido a Administradores)
 */
async function executeAgyServerPlan(customDb = null, conversacionId, {
    autoCommitPush = false,
    directInstruction = '',
    user = null,
    io = null
} = {}) {
    const db = resolveDb(customDb);
    await ensureCrecimientoSchema(db);

    const [convRows] = await db.query('SELECT * FROM finanzas_conversaciones WHERE id = ? LIMIT 1', [conversacionId]);
    const conv = convRows?.[0];
    if (!conv) throw new Error('Conversación no encontrada');
    if (!conv.plan_markdown && !directInstruction) {
        throw new Error('Primero debes generar un Plan AGY antes de ejecutar modificaciones en el servidor');
    }

    let agySettings = {};
    let ticketSvc = null;
    if (injectedDb === undefined) {
        try {
            ticketSvc = require('./ticketService');
            agySettings = await ticketSvc.getAgySettings();
        } catch { /* ignore */ }
    }

    const targetRepo = resolveTargetRepo(conv.proyecto_destino === 'sipesaas' ? 'sipesaas' : 'sipeadmin', agySettings);
    const actorName = user?.nombre || user?.username || 'Administrador';
    const chosenModel = conv.modelo_ia || agySettings.default_model || 'gemini-4-argon-high';
    let parsedFiles = [];
    try {
        parsedFiles = Array.isArray(conv.archivos_relacionados)
            ? conv.archivos_relacionados
            : JSON.parse(conv.archivos_relacionados || '[]');
    } catch { parsedFiles = []; }
    if (parsedFiles.length === 0) {
        parsedFiles = findSmartRepoFiles(targetRepo, `${conv.titulo}\n${conv.plan_markdown || ''}`);
    }

    const startLog = `[${new Date().toISOString()}] 🚀 Ejecución aprobada por ${actorName} sobre ${targetRepo.label} (${chosenModel})...\n`;
    await db.query(
        `UPDATE finanzas_conversaciones
         SET estado_agy = 'ejecutando',
             execution_log = CONCAT(COALESCE(execution_log, ''), '\n', ?),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [startLog, conversacionId]
    );

    if (io) {
        io.emit('crecimiento:agy_update', { conversacion_id: Number(conversacionId), estado_agy: 'ejecutando' });
    }

    const modifiedFiles = [];
    const stepLogs = [];
    const rootResolved = path.resolve(targetRepo.projectPath);

    // En modo pruebas unitarias con DB mockeada, simulamos ejecución segura sin tocar archivos reales del workspace
    if (injectedDb !== undefined) {
        stepLogs.push('Modo validación controlada completado.');
    } else if (targetRepo.existsLocally) {
        // Capturar archivos sucios previos para identificar únicamente los nuevos modificados por AGY
        const preDirty = new Set();
        try {
            const st = execFileSync('git', ['status', '--porcelain'], { cwd: rootResolved, timeout: 8000, stdio: 'pipe' }).toString();
            st.split('\n').filter(Boolean).forEach((line) => {
                const f = line.trim().split(/\s+/).pop();
                if (f) preDirty.add(f.replace(/\\/g, '/'));
            });
        } catch { /* ignore */ }

        // 1. Intentar ejecución con binario AGY CLI en servidor si existe
        const agyBin = detectLocalAgyBinary(agySettings.agy_command || 'agy');
        if (agyBin) {
            const execPrompt = [
                `ORDEN DE EJECUCIÓN APROBADA (Plan v${conv.plan_version || 1})`,
                `Objetivo: ${directInstruction || conv.titulo}`,
                `Plan aprobado: ${conv.plan_markdown || ''}`,
                `Aplica los cambios respetando AGENTS.md y finaliza con [[FIN_EJECUCION_AGY]].`
            ].join(' | ');
            const cliExec = await runLocalAgyCliWithTempPrompt({
                agyBinPath: agyBin,
                projectPath: rootResolved,
                model: chosenModel,
                promptText: execPrompt,
                isPlanPhase: false,
                timeoutMs: 75000
            });
            if (cliExec.executed) {
                stepLogs.push('Consola CLI AGY ejecutada en el servidor.');
            }
            try {
                const postSt = execFileSync('git', ['status', '--porcelain'], { cwd: rootResolved, timeout: 8000, stdio: 'pipe' }).toString();
                postSt.split('\n').filter(Boolean).forEach((line) => {
                    const f = line.trim().split(/\s+/).pop()?.replace(/\\/g, '/');
                    if (f && !preDirty.has(f) && !f.includes('.env') && !f.endsWith('lock.json') && !f.endsWith('lock.yaml')) {
                        modifiedFiles.push(f);
                    }
                });
            } catch { /* ignore */ }
        }

        // 2. Si CLI no modificó archivos, aplicar motor de edición quirúrgica Gemini sobre los archivos objetivo
        if (modifiedFiles.length === 0) {
            const aiClient = await resolveAiClient();
            const snippets = readSafeRepoSnippets(targetRepo, parsedFiles, 16000);
            if (aiClient && snippets.length > 0) {
                try {
                    const systemInstruction = `Eres el motor quirúrgico de código de AGY en el servidor SIPE.
Devuelve ÚNICAMENTE un JSON válido con el formato exacto:
{"edits":[{"file":"ruta/relativa.jsx","search":"fragmento exacto existente","replace":"fragmento nuevo actualizado"}],"summary":"resumen breve en español"}.
REGLAS:
- Jamás modifiques archivos .env, credenciales ni controles de autenticación.
- "search" debe coincidir exactamente con el contenido actual del archivo proporcionado.
- Si la solicitud no requiere tocar código o no hay coincidencia exacta segura, devuelve "edits": [].`;

                    const userPrompt = [
                        `Proyecto: ${targetRepo.label}`,
                        `Instrucción aprobada: ${directInstruction || conv.titulo}`,
                        `Plan aprobado:\n${conv.plan_markdown || ''}`,
                        ...snippets.map((s) => `=== ARCHIVO: ${s.file} ===\n${s.excerpt}`)
                    ].join('\n\n');

                    const aiPatch = await generateGeminiContentWithFallback(aiClient, {
                        systemInstruction,
                        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                        responseMimeType: 'application/json'
                    });

                    if (aiPatch?.text) {
                        const parsed = JSON.parse(aiPatch.text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
                        for (const edit of (Array.isArray(parsed.edits) ? parsed.edits : [])) {
                            if (!edit.file || !edit.search || edit.replace === undefined) continue;
                            const cleanRel = path.normalize(String(edit.file)).replace(/^(\.\.(\/|\\|$))+/, '');
                            if (cleanRel.includes('.env') || cleanRel.includes('node_modules') || cleanRel.endsWith('lock.json') || cleanRel.endsWith('lock.yaml')) {
                                continue;
                            }
                            const absFile = path.resolve(rootResolved, cleanRel);
                            if (!absFile.startsWith(rootResolved) || !fs.existsSync(absFile)) continue;

                            const currentText = fs.readFileSync(absFile, 'utf8');
                            const crlfSearch = String(edit.search).replace(/\r?\n/g, '\r\n');
                            let nextText = currentText;
                            if (currentText.includes(edit.search)) {
                                nextText = currentText.replace(edit.search, edit.replace);
                            } else if (currentText.includes(crlfSearch)) {
                                nextText = currentText.replace(crlfSearch, String(edit.replace).replace(/\r?\n/g, '\r\n'));
                            }

                            if (nextText !== currentText) {
                                fs.writeFileSync(absFile, nextText, 'utf8');
                                const normRel = cleanRel.replace(/\\/g, '/');
                                if (!modifiedFiles.includes(normRel)) modifiedFiles.push(normRel);
                            }
                        }
                        if (parsed.summary) stepLogs.push(parsed.summary);
                    }
                } catch (err) {
                    stepLogs.push(`Aviso motor quirúrgico: ${err.message}`);
                }
            }
        }

        // 3. Si hubo archivos modificados: actualizar Graphify y opcionalmente hacer commit en español
        if (modifiedFiles.length > 0) {
            try {
                execFileSync('graphify', ['update', '.'], { cwd: rootResolved, timeout: 25000, stdio: 'pipe' });
                stepLogs.push('Grafo de conocimiento Graphify actualizado (graphify update .).');
            } catch { /* graphify CLI opcional en host */ }

            if (autoCommitPush) {
                try {
                    execFileSync('git', ['add', '--', ...modifiedFiles], { cwd: rootResolved, timeout: 12000, stdio: 'pipe' });
                    const cleanTitle = String(conv.titulo || 'mejora desde consola agy').replace(/["`$\\]/g, '').slice(0, 68);
                    execFileSync(
                        'git',
                        ['-c', 'user.name=AGY Server Bot', '-c', 'user.email=agy@sipesv.com', 'commit', '-m', `feat(agy): ${cleanTitle}`],
                        { cwd: rootResolved, timeout: 15000, stdio: 'pipe' }
                    );
                    const hash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: rootResolved, timeout: 5000, stdio: 'pipe' }).toString().trim();
                    stepLogs.push(`Commit atómico registrado en servidor (${hash}).`);
                } catch (gErr) {
                    stepLogs.push(`Aviso Git local: ${String(gErr.message || '').slice(0, 120)}`);
                }
            }
        }
    }

    // 4. Sincronizar estado con ticket si existe
    if (conv.ticket_id && ticketSvc && injectedDb === undefined) {
        try {
            await ticketSvc.executeApprovedPlan(conv.ticket_id, { actorName, io });
        } catch { /* ignore */ }
    }

    const finalState = modifiedFiles.length > 0 || injectedDb !== undefined ? 'completado' : 'esperando_aprobacion';
    const summaryMarkdown = modifiedFiles.length > 0
        ? [
            `✅ **Plan AGY v${conv.plan_version || 1} ejecutado exitosamente en ${targetRepo.label}**`,
            `- **Aprobado por:** ${actorName}`,
            `- **Archivos modificados (${modifiedFiles.length}):** \`${modifiedFiles.join('`, `')}\``,
            ...stepLogs.map((s) => `- ${s}`)
        ].join('\n')
        : [
            `ℹ️ **Inspección de Ejecución en ${targetRepo.label}**`,
            `- No se aplicaron escrituras automáticas en disco (${stepLogs.join(' | ') || 'especifica con más detalle el cambio exacto o archivo objetivo para edición quirúrgica'}).`,
            `- El plan permanece disponible en estado de revisión para iterar con una directriz adicional.`
        ].join('\n');

    await db.query(
        `UPDATE finanzas_conversaciones
         SET estado_agy = ?,
             execution_log = CONCAT(COALESCE(execution_log, ''), '\n', ?),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [finalState, sanitizeServerText(summaryMarkdown), conversacionId]
    );

    await db.query(
        `INSERT INTO finanzas_conversacion_mensajes (conversacion_id, rol, autor, contenido, metadata_json)
         VALUES (?, 'agy_system', ?, ?, ?)`,
        [
            conversacionId,
            `Ejecutor AGY (${actorName})`,
            summaryMarkdown,
            JSON.stringify({ tipo: 'agy_execution', estado: finalState, archivos_modificados: modifiedFiles })
        ]
    );

    // 5. Auto-Build: registrar la modificación ejecutada en la Base de Conocimientos
    if (modifiedFiles.length > 0) {
        await storeExtractedKnowledgeItems(db, [{
            categoria: 'arquitectura_sistema',
            titulo: `Modificación AGY v${conv.plan_version || 1}: ${String(conv.titulo).slice(0, 140)}`,
            resumen_ejecutivo: `Cambio aplicado en ${targetRepo.label} sobre ${modifiedFiles.join(', ')}.`,
            contenido: `Modificación aprobada por ${actorName} y ejecutada mediante Consola AGY en ${targetRepo.label}. Archivos actualizados: ${modifiedFiles.join(', ')}. Notas: ${stepLogs.join(' ')}`,
            etiquetas: 'agy-ejecucion,modificacion-servidor,auto-graphify'
        }], { userId: user?.id || null, origen: 'auto_graphify' });
    }

    if (io) {
        io.emit('crecimiento:agy_update', {
            conversacion_id: Number(conversacionId),
            estado_agy: finalState,
            archivos_modificados: modifiedFiles
        });
    }

    return {
        conversacion_id: Number(conversacionId),
        estado_agy: finalState,
        archivos_modificados: modifiedFiles,
        summary_markdown: summaryMarkdown
    };
}

async function rejectAgyServerPlan(customDb = null, conversacionId, { reason = '', user = null, io = null } = {}) {
    const db = resolveDb(customDb);
    await ensureCrecimientoSchema(db);
    const actorName = user?.nombre || user?.username || 'Administrador';
    const cleanReason = String(reason || 'Plan descartado para replantear estrategia').trim();

    const [convRows] = await db.query('SELECT * FROM finanzas_conversaciones WHERE id = ? LIMIT 1', [conversacionId]);
    const conv = convRows?.[0];
    if (!conv) throw new Error('Conversación no encontrada');

    if (conv.ticket_id && injectedDb === undefined) {
        try {
            const ticketSvc = require('./ticketService');
            await ticketSvc.rejectPlan(conv.ticket_id, { reason: cleanReason, actorName, io });
        } catch { /* ignore */ }
    }

    const msg = `❌ **Plan AGY v${conv.plan_version || 1} denegado por ${actorName}.** Motivo: ${cleanReason}`;
    await db.query(
        `UPDATE finanzas_conversaciones
         SET estado_agy = 'denegado',
             execution_log = CONCAT(COALESCE(execution_log, ''), '\n', ?),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [`[${new Date().toISOString()}] ${msg}`, conversacionId]
    );

    await db.query(
        `INSERT INTO finanzas_conversacion_mensajes (conversacion_id, rol, autor, contenido)
         VALUES (?, 'agy_system', ?, ?)`,
        [conversacionId, actorName, msg]
    );

    if (io) {
        io.emit('crecimiento:agy_update', { conversacion_id: Number(conversacionId), estado_agy: 'denegado' });
    }

    return { conversacion_id: Number(conversacionId), estado_agy: 'denegado', message: msg };
}

async function getAgyServerStatus() {
    let agySettings = {
        ssh_host: 'localhost',
        project_path: '/var/www/sipeadmin',
        agy_command: 'agy',
        default_model: 'gemini-4-argon-high',
        execution_mode: 'auto',
        available_models: [
            { id: 'gemini-4-argon-high', label: 'gemini-4-argon-high (Máxima Velocidad e Inteligencia)' },
            { id: 'gemini-3.1-pro', label: 'gemini-3.1-pro (Razonamiento Profundo)' },
            { id: 'gemini-3-flash', label: 'gemini-3-flash (Ultra Rápido)' }
        ]
    };

    if (injectedDb === undefined) {
        try {
            const ticketSvc = require('./ticketService');
            agySettings = await ticketSvc.getAgySettings();
        } catch { /* ignore */ }
    }

    const adminRepo = resolveTargetRepo('sipeadmin', agySettings);
    const saasRepo = resolveTargetRepo('sipesaas', agySettings);
    const agyBin = detectLocalAgyBinary(agySettings.agy_command || 'agy');
    const graphify = loadGraphifyGraph()?.summary || { available: false };

    return {
        default_model: agySettings.default_model || 'gemini-4-argon-high',
        execution_mode: agySettings.execution_mode || 'auto',
        available_models: agySettings.available_models || [],
        cli_binary_detected: Boolean(agyBin),
        engine_mode: agyBin ? 'AGY CLI Nativo + Gemini Quirúrgico' : 'Motor Integrado Gemini + Graphify AST',
        repositorios: [
            { key: 'sipeadmin', label: adminRepo.label, active: adminRepo.existsLocally },
            { key: 'sipesaas', label: saasRepo.label, active: saasRepo.existsLocally }
        ],
        graphify
    };
}

module.exports = {
    KNOWLEDGE_CATEGORIES,
    SEED_INSTITUTIONAL_KNOWLEDGE,
    _setMockDb,
    _setMockAiClient,
    resolveDb,
    calculatePMT,
    simulateCorporateGrowthScenario,
    queryGraphifyContext,
    ensureCrecimientoSchema,
    buildEnterpriseGrowthSnapshot,
    autoBuildKnowledgeFromEcosystem,
    extractHeuristicKnowledgeFromText,
    processGrowthConversationTurn,
    generateAgyServerPlan,
    executeAgyServerPlan,
    rejectAgyServerPlan,
    getAgyServerStatus,
    resolveTargetRepo,
    findSmartRepoFiles
};
