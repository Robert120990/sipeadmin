/**
 * Utilidades para Cálculos Financieros Avanzados:
 * - VPN / VAN (Valor Presente Neto)
 * - TIR / IRR (Tasa Interna de Retorno - Newton-Raphson & Bisección)
 * - Payback Simple y Descontado (Periodo de Recuperación)
 * - ROI (Retorno de Inversión)
 * - Relación Beneficio / Costo (B/C)
 * - Análisis de Sensibilidad (Escenarios Base, Optimista, Pesimista)
 * - TCO (Costo Total de Propiedad: Sustituir vs Reparar Activo)
 */

/**
 * Calcula el Valor Presente Neto (VPN / NPV)
 * @param {number} rate - Tasa de descuento anual en decimal (ej. 0.10 para 10%)
 * @param {number} initialInvestment - Inversión inicial positiva (ej. 50000)
 * @param {Array<number>} cashFlows - Arreglo de flujos netos anuales [CF1, CF2, ...]
 * @param {number} [salvageValue=0] - Valor residual al final del último año
 * @returns {number} VPN
 */
export function calculateNPV(rate, initialInvestment, cashFlows, salvageValue = 0) {
    const r = parseFloat(rate) || 0;
    const i0 = parseFloat(initialInvestment) || 0;
    let npv = -i0;

    cashFlows.forEach((cf, index) => {
        const t = index + 1;
        let flow = parseFloat(cf) || 0;
        if (t === cashFlows.length) {
            flow += parseFloat(salvageValue) || 0;
        }
        npv += flow / Math.pow(1 + r, t);
    });

    return npv;
}

/**
 * Calcula la Tasa Interna de Retorno (TIR / IRR) en porcentaje anual (ej. 18.5%)
 * Utiliza el método numérico iterativo de Newton-Raphson con fallback a Bisección.
 * @param {number} initialInvestment - Inversión inicial (positiva)
 * @param {Array<number>} cashFlows - Arreglo de flujos netos anuales
 * @param {number} [salvageValue=0]
 * @returns {number|null} Tasa en porcentaje (ej: 15.42) o null si no converge
 */
export function calculateIRR(initialInvestment, cashFlows, salvageValue = 0) {
    const i0 = parseFloat(initialInvestment) || 0;
    if (i0 <= 0 || !cashFlows || cashFlows.length === 0) return null;

    const flows = cashFlows.map(cf => parseFloat(cf) || 0);
    flows[flows.length - 1] += parseFloat(salvageValue) || 0;

    // Verificar si hay flujos positivos que puedan compensar la inversión
    const totalInflows = flows.reduce((a, b) => a + b, 0);
    if (totalInflows <= 0) return null;

    // Función objetivo: NPV(r) = -i0 + sum(cf_t / (1+r)^t)
    const f = (r) => {
        let sum = -i0;
        for (let t = 0; t < flows.length; t++) {
            sum += flows[t] / Math.pow(1 + r, t + 1);
        }
        return sum;
    };

    // Derivada: f'(r) = - sum( t * cf_t / (1+r)^(t+1) )
    const fPrime = (r) => {
        let sum = 0;
        for (let t = 0; t < flows.length; t++) {
            sum -= (t + 1) * flows[t] / Math.pow(1 + r, t + 2);
        }
        return sum;
    };

    // 1. Intento con Newton-Raphson
    let r = 0.10; // Semilla inicial del 10%
    const maxIterations = 60;
    const tolerance = 1e-6;

    for (let i = 0; i < maxIterations; i++) {
        const y = f(r);
        const yPrime = fPrime(r);

        if (Math.abs(yPrime) < 1e-10) break; // Evitar división por cero

        const nextR = r - y / yPrime;

        if (Math.abs(nextR - r) < tolerance && Math.abs(y) < 1e-3) {
            return +(nextR * 100).toFixed(2);
        }

        r = nextR;

        // Si r se sale de rangos razonables, pasar a bisección
        if (r < -0.95 || r > 10.0) break;
    }

    // 2. Fallback a Bisección si Newton no convergió
    let low = -0.80;
    let high = 5.0; // Hasta 500% TIR
    let fLow = f(low);
    let fHigh = f(high);

    if (fLow * fHigh > 0) {
        // Mismo signo: puede no haber raíz en este rango o es superior a 500%
        return null;
    }

    for (let i = 0; i < 100; i++) {
        const mid = (low + high) / 2;
        const fMid = f(mid);

        if (Math.abs(fMid) < tolerance || (high - low) / 2 < tolerance) {
            return +(mid * 100).toFixed(2);
        }

        if (fLow * fMid < 0) {
            high = mid;
            fHigh = fMid;
        } else {
            low = mid;
            fLow = fMid;
        }
    }

    return +(((low + high) / 2) * 100).toFixed(2);
}

/**
 * Calcula el Periodo de Recuperación Simple (Payback en años y meses)
 * @param {number} initialInvestment 
 * @param {Array<number>} cashFlows 
 * @returns {{ anios: number, meses: number, totalMeses: number, recuperado: boolean }}
 */
export function calculatePayback(initialInvestment, cashFlows) {
    const i0 = parseFloat(initialInvestment) || 0;
    let acumulado = 0;

    for (let i = 0; i < cashFlows.length; i++) {
        const cf = parseFloat(cashFlows[i]) || 0;
        const previo = acumulado;
        acumulado += cf;

        if (acumulado >= i0) {
            const restante = i0 - previo;
            const fraccionAnio = cf > 0 ? (restante / cf) : 0;
            const tiempoTotalAnios = i + fraccionAnio;
            const anios = Math.floor(tiempoTotalAnios);
            const meses = Math.round((tiempoTotalAnios - anios) * 12);
            return {
                anios,
                meses: meses === 12 ? 0 : meses,
                totalAnios: +(tiempoTotalAnios).toFixed(2),
                totalMeses: Math.round(tiempoTotalAnios * 12),
                recuperado: true
            };
        }
    }

    return {
        anios: 0,
        meses: 0,
        totalAnios: 0,
        totalMeses: 0,
        recuperado: false
    };
}

/**
 * Calcula el Payback Descontado (tomando en cuenta el valor del dinero en el tiempo)
 * @param {number} rate - Tasa de descuento anual en decimal (ej. 0.10)
 * @param {number} initialInvestment 
 * @param {Array<number>} cashFlows 
 * @returns {{ anios: number, meses: number, totalMeses: number, recuperado: boolean }}
 */
export function calculateDiscountedPayback(rate, initialInvestment, cashFlows) {
    const r = parseFloat(rate) || 0;
    const i0 = parseFloat(initialInvestment) || 0;
    let acumulado = 0;

    for (let i = 0; i < cashFlows.length; i++) {
        const t = i + 1;
        const cf = parseFloat(cashFlows[i]) || 0;
        const discountedCf = cf / Math.pow(1 + r, t);
        const previo = acumulado;
        acumulado += discountedCf;

        if (acumulado >= i0) {
            const restante = i0 - previo;
            const fraccionAnio = discountedCf > 0 ? (restante / discountedCf) : 0;
            const tiempoTotalAnios = i + fraccionAnio;
            const anios = Math.floor(tiempoTotalAnios);
            const meses = Math.round((tiempoTotalAnios - anios) * 12);
            return {
                anios,
                meses: meses === 12 ? 0 : meses,
                totalAnios: +(tiempoTotalAnios).toFixed(2),
                totalMeses: Math.round(tiempoTotalAnios * 12),
                recuperado: true
            };
        }
    }

    return {
        anios: 0,
        meses: 0,
        totalAnios: 0,
        totalMeses: 0,
        recuperado: false
    };
}

/**
 * Calcula el ROI (Return on Investment) en porcentaje
 * ROI = [(Beneficio Neto Acumulado + Valor Residual) / Inversión Inicial] * 100
 * @param {number} initialInvestment 
 * @param {Array<number>} cashFlows 
 * @param {number} [salvageValue=0] 
 * @returns {number} ROI en %
 */
export function calculateROI(initialInvestment, cashFlows, salvageValue = 0) {
    const i0 = parseFloat(initialInvestment) || 0;
    if (i0 <= 0) return 0;

    const totalFlows = cashFlows.reduce((acc, cf) => acc + (parseFloat(cf) || 0), 0);
    const totalReturn = totalFlows + (parseFloat(salvageValue) || 0);
    const netGain = totalReturn - i0;

    return +((netGain / i0) * 100).toFixed(2);
}

/**
 * Calcula la Relación Beneficio / Costo (Índice de Rentabilidad B/C)
 * B/C = VP de Flujos Futuros / Inversión Inicial
 * Si B/C > 1.0, el proyecto genera más valor de lo que cuesta a valor presente.
 * @param {number} rate 
 * @param {number} initialInvestment 
 * @param {Array<number>} cashFlows 
 * @param {number} [salvageValue=0] 
 * @returns {number}
 */
export function calculateBCRatio(rate, initialInvestment, cashFlows, salvageValue = 0) {
    const i0 = parseFloat(initialInvestment) || 0;
    if (i0 <= 0) return 0;

    const r = parseFloat(rate) || 0;
    let presentValueOfInflows = 0;

    cashFlows.forEach((cf, index) => {
        const t = index + 1;
        let flow = parseFloat(cf) || 0;
        if (t === cashFlows.length) {
            flow += parseFloat(salvageValue) || 0;
        }
        presentValueOfInflows += flow / Math.pow(1 + r, t);
    });

    return +(presentValueOfInflows / i0).toFixed(2);
}

/**
 * Genera matriz de escenarios de sensibilidad (Base, Optimista, Pesimista)
 * @param {Object} project
 * @returns {{ base: Object, optimista: Object, pesimista: Object }}
 */
export function generateSensitivityScenarios(project) {
    const { inversion_inicial, tasa_descuento, flujos, valor_residual } = project;
    const rate = (parseFloat(tasa_descuento) || 10) / 100;
    const i0 = parseFloat(inversion_inicial) || 0;
    const salvage = parseFloat(valor_residual) || 0;

    const evalScenario = (multiplier, label, desc) => {
        const adjustedFlows = (flujos || []).map(cf => (parseFloat(cf) || 0) * multiplier);
        const adjustedSalvage = salvage * multiplier;

        const npv = calculateNPV(rate, i0, adjustedFlows, adjustedSalvage);
        const irr = calculateIRR(i0, adjustedFlows, adjustedSalvage);
        const payback = calculatePayback(i0, adjustedFlows);
        const discountedPayback = calculateDiscountedPayback(rate, i0, adjustedFlows);
        const roi = calculateROI(i0, adjustedFlows, adjustedSalvage);
        const bcRatio = calculateBCRatio(rate, i0, adjustedFlows, adjustedSalvage);

        return {
            label,
            desc,
            multiplier,
            flows: adjustedFlows,
            npv: +npv.toFixed(2),
            irr,
            roi,
            bcRatio,
            payback,
            discountedPayback,
            esViable: npv > 0 && (irr === null || irr > (rate * 100))
        };
    };

    return {
        pesimista: evalScenario(0.85, 'Escenario Pesimista', 'Flujos de efectivo -15% por contracción o sobrecostos'),
        base: evalScenario(1.0, 'Escenario Base', 'Proyección esperada según estudio de inversión'),
        optimista: evalScenario(1.15, 'Escenario Optimista', 'Flujos de efectivo +15% por mayor demanda o margen')
    };
}

/**
 * Análisis TCO (Total Cost of Ownership): Mantener vs Sustituir Activo
 * Compara los costos totales proyectados entre seguir reparando un equipo existente vs comprar uno nuevo.
 * 
 * @param {Object} params
 * @param {number} params.aniosProyeccion - Años a evaluar (ej. 5)
 * @param {number} params.costoEquipoNuevo - Precio de compra del nuevo activo
 * @param {number} params.mantenimientoAnualNuevo - Gasto anual estimado del nuevo
 * @param {number} params.garantiaAnios - Años con garantía sin costo de correctivos
 * @param {number} params.valorRescateNuevo - Valor residual del nuevo activo al final
 * @param {number} params.costoReparacionActual - Costo de la reparación inmediata del actual
 * @param {number} params.mantenimientoAnualActual - Gasto anual correctivo/preventivo creciente
 * @param {number} params.inflacionMantenimiento - Crecimiento anual de fallas en equipo viejo (ej. 10%)
 * @param {number} params.valorVentaActual - Lo que nos dan hoy por el equipo viejo como chatarra/usado
 * @returns {Object}
 */
export function calculateTCO(params) {
    const anios = parseInt(params.aniosProyeccion) || 5;
    const precioNuevo = parseFloat(params.costoEquipoNuevo) || 0;
    const mantNuevo = parseFloat(params.mantenimientoAnualNuevo) || 0;
    const garantia = parseInt(params.garantiaAnios) || 1;
    const rescateNuevo = parseFloat(params.valorRescateNuevo) || 0;

    const repActual = parseFloat(params.costoReparacionActual) || 0;
    let mantActual = parseFloat(params.mantenimientoAnualActual) || 0;
    const inflacionMant = (parseFloat(params.inflacionMantenimiento) || 10) / 100;
    const ventaActual = parseFloat(params.valorVentaActual) || 0;

    // Escenario 1: Mantener equipo actual
    let tcoActual = repActual;
    const flujoAnualActual = [];
    let gastoIterado = mantActual;

    for (let t = 1; t <= anios; t++) {
        flujoAnualActual.push(gastoIterado);
        tcoActual += gastoIterado;
        gastoIterado *= (1 + inflacionMant); // Fallas incrementales con la edad
    }

    // Escenario 2: Comprar equipo nuevo
    // Inversión neta = precio nuevo - venta del viejo
    const inversionNetaNuevo = Math.max(0, precioNuevo - ventaActual);
    let tcoNuevo = inversionNetaNuevo;
    const flujoAnualNuevo = [];

    for (let t = 1; t <= anios; t++) {
        // Si está en garantía, el mantenimiento es significativamente menor
        const gastoAnio = t <= garantia ? (mantNuevo * 0.3) : mantNuevo;
        flujoAnualNuevo.push(gastoAnio);
        tcoNuevo += gastoAnio;
    }
    tcoNuevo -= rescateNuevo; // Descontar valor residual al final

    const ahorroNeto = tcoActual - tcoNuevo;
    const convieneSustituir = ahorroNeto > 0;

    return {
        anios,
        tcoActual: +tcoActual.toFixed(2),
        tcoNuevo: +tcoNuevo.toFixed(2),
        ahorroNeto: +Math.abs(ahorroNeto).toFixed(2),
        convieneSustituir,
        recomendacion: convieneSustituir
            ? `Es financieramente más conveniente SUSTITUIR el activo. Te ahorrarías $${ahorroNeto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} en ${anios} años.`
            : `Es financieramente más conveniente MANTENER/REPARAR el activo actual por ahora. Te costaría $${Math.abs(ahorroNeto).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} menos que comprar uno nuevo.`,
        flujoAnualActual,
        flujoAnualNuevo
    };
}
