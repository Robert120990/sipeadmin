/**
 * Utilidad compartida para persistencia de Empresa/Cuenta bancaria en localStorage
 * y navegación 1-clic entre pantallas del módulo de Bancos (soporta pestañas keep-alive
 * ya montadas mediante CustomEvent y pestañas nuevas mediante pending nav en localStorage).
 */

const LAST_SELECTION_KEY = 'sipe_bancos_last_selection_v1';
const PENDING_NAV_KEY = 'sipe_bancos_pending_nav_v1';
const BANCOS_NAV_EVENT = 'sipe:bancos-nav-target';
const PENDING_TTL_MS = 30000;

/**
 * Mapa canónico de destinos del módulo de Bancos.
 * @type {Record<string, string>}
 */
export const BANCOS_NAV_TARGETS = {
    conciliacion: '/dashboard/bancos/conciliacion',
    movimientos: '/dashboard/bancos/movimientos',
    transferencias: '/dashboard/bancos/transferencias',
    kardex: '/dashboard/bancos/reportes/movimientos-fecha',
    cheques: '/dashboard/bancos/cheques',
    'saldos-bancos': '/dashboard/bancos/reportes/saldos-bancos',
    'saldos-chequera': '/dashboard/bancos/reportes/saldos-chequera',
};

/**
 * Resuelve una clave abreviada de destino o ruta explícita a su ruta canónica.
 * @param {string} targetKeyOrPath - Clave de `BANCOS_NAV_TARGETS` o ruta `/dashboard/bancos/...`
 * @returns {string} Ruta canónica resuelta
 */
export function resolveBancosTargetPath(targetKeyOrPath) {
    if (!targetKeyOrPath) return '';
    const key = String(targetKeyOrPath).trim();
    return BANCOS_NAV_TARGETS[key] || key;
}

function normalizeSelection(selection = {}) {
    if (!selection || typeof selection !== 'object') {
        return { empresaId: '', cuentaId: '', numeroCuenta: '' };
    }
    const rawEmpresa = selection.empresaId ?? selection.id_empresa ?? selection.empresa_codigo ?? '';
    const rawCuentaId = selection.cuentaId ?? selection.cuenta_bancaria_id ?? selection.corr ?? selection.id ?? '';
    const rawNumero = selection.numeroCuenta ?? selection.numero_cuenta ?? selection.numero ?? '';
    return {
        empresaId: rawEmpresa !== null && rawEmpresa !== undefined ? String(rawEmpresa).trim() : '',
        cuentaId: rawCuentaId !== null && rawCuentaId !== undefined ? String(rawCuentaId).trim() : '',
        numeroCuenta: rawNumero !== null && rawNumero !== undefined ? String(rawNumero).trim() : '',
    };
}

/**
 * Guarda la última selección de Empresa/Cuenta en localStorage.
 * Si todos los campos están vacíos, limpia la selección guardada.
 * @param {{ empresaId?: string|number, cuentaId?: string|number, numeroCuenta?: string }} selection
 * @returns {{ empresaId: string, cuentaId: string, numeroCuenta: string, updatedAt: number } | null}
 */
export function saveBancosSelection(selection = {}) {
    const normalized = normalizeSelection(selection);
    try {
        if (!normalized.empresaId && !normalized.cuentaId && !normalized.numeroCuenta) {
            window.localStorage.removeItem(LAST_SELECTION_KEY);
            return null;
        }
        const payload = { ...normalized, updatedAt: Date.now() };
        window.localStorage.setItem(LAST_SELECTION_KEY, JSON.stringify(payload));
        return payload;
    } catch {
        return null;
    }
}

/**
 * Carga la última selección de Empresa/Cuenta desde localStorage.
 * @returns {{ empresaId: string, cuentaId: string, numeroCuenta: string } | null}
 */
export function loadBancosSelection() {
    try {
        const raw = window.localStorage.getItem(LAST_SELECTION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const normalized = normalizeSelection(parsed);
        if (!normalized.empresaId && !normalized.cuentaId && !normalized.numeroCuenta) {
            return null;
        }
        return normalized;
    } catch {
        return null;
    }
}

/**
 * Almacena una navegación pendiente para que la pantalla destino la consuma al montar.
 * @param {{ targetPath: string, empresaId?: string|number, id_empresa?: string|number, empresa_codigo?: string|number, cuentaId?: string|number, cuenta_bancaria_id?: string|number, corr?: string|number, id?: string|number, numeroCuenta?: string, numero_cuenta?: string, numero?: string, action?: string|null }} params
 * @returns {{ targetPath: string, empresaId: string, cuentaId: string, numeroCuenta: string, action: string|null, timestamp: number }}
 */
export function setPendingBancosNav(params = {}) {
    const safeParams = params && typeof params === 'object' ? params : {};
    const { targetPath, action = null } = safeParams;
    const resolvedPath = resolveBancosTargetPath(targetPath);
    const normalized = normalizeSelection(safeParams);
    const payload = {
        targetPath: resolvedPath,
        ...normalized,
        action: action || null,
        timestamp: Date.now(),
    };
    try {
        window.localStorage.setItem(PENDING_NAV_KEY, JSON.stringify(payload));
    } catch {
        // Ignorar errores de almacenamiento (modo privado / cuota excedida)
    }
    return payload;
}

/**
 * Consume (lee y elimina) una navegación pendiente si coincide con `expectedTargetPath` y no expiró (TTL 30s).
 * @param {string} expectedTargetPath - Ruta esperada o clave de `BANCOS_NAV_TARGETS`
 * @returns {{ targetPath: string, empresaId: string, cuentaId: string, numeroCuenta: string, action: string|null, timestamp: number } | null}
 */
export function consumePendingBancosNav(expectedTargetPath) {
    const expected = resolveBancosTargetPath(expectedTargetPath);
    try {
        const raw = window.localStorage.getItem(PENDING_NAV_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const ageMs = Date.now() - Number(parsed?.timestamp || 0);
        if (!parsed || !Number.isFinite(ageMs) || ageMs > PENDING_TTL_MS) {
            window.localStorage.removeItem(PENDING_NAV_KEY);
            return null;
        }
        if (expected && parsed.targetPath !== expected) {
            return null;
        }
        window.localStorage.removeItem(PENDING_NAV_KEY);
        return {
            targetPath: parsed.targetPath || '',
            ...normalizeSelection(parsed),
            action: parsed.action || null,
            timestamp: Number(parsed.timestamp),
        };
    } catch {
        try {
            window.localStorage.removeItem(PENDING_NAV_KEY);
        } catch {
            // noop
        }
        return null;
    }
}

/**
 * Ejecuta navegación 1-clic hacia otra pantalla de Bancos preservando el contexto de cuenta.
 * Persiste última selección, guarda pending nav para pestañas nuevas, navega con React Router
 * y emite `CustomEvent('sipe:bancos-nav-target')` para pestañas keep-alive ya montadas.
 * @param {Function} navigate - Hook `navigate` de `react-router-dom`
 * @param {string} targetKeyOrPath - Clave de `BANCOS_NAV_TARGETS` o ruta explícita
 * @param {{ empresaId?: string|number, cuentaId?: string|number, numeroCuenta?: string }} [accountContext={}]
 * @param {{ action?: string|null }} [options={}]
 * @returns {{ targetPath: string, empresaId: string, cuentaId: string, numeroCuenta: string, action: string|null, timestamp: number }}
 */
export function navigateToBancosTarget(navigate, targetKeyOrPath, accountContext = {}, options = {}) {
    const targetPath = resolveBancosTargetPath(targetKeyOrPath);
    const normalized = normalizeSelection(accountContext);
    saveBancosSelection(normalized);
    const payload = setPendingBancosNav({
        targetPath,
        ...normalized,
        action: options?.action || null,
    });
    if (typeof navigate === 'function' && targetPath) {
        navigate(targetPath);
    }
    try {
        window.dispatchEvent(new CustomEvent(BANCOS_NAV_EVENT, { detail: payload }));
    } catch {
        // noop
    }
    return payload;
}

/**
 * Suscribe una pantalla destino al evento de navegación 1-clic para cuando la pestaña ya está montada.
 * Al recibir un evento coincidente con `expectedTargetPath`, limpia el pending nav y ejecuta `handler(detail)`.
 * @param {string} expectedTargetPath - Ruta o clave de `BANCOS_NAV_TARGETS`
 * @param {(detail: { targetPath: string, empresaId: string, cuentaId: string, numeroCuenta: string, action: string|null, timestamp: number }) => void} handler
 * @returns {() => void} Función de limpieza para `useEffect`
 */
export function subscribeBancosNavTarget(expectedTargetPath, handler) {
    const expected = resolveBancosTargetPath(expectedTargetPath);
    if (typeof window === 'undefined' || typeof handler !== 'function') {
        return () => {};
    }
    const listener = (event) => {
        const detail = event?.detail;
        if (!detail || (expected && detail.targetPath !== expected)) return;
        consumePendingBancosNav(expected);
        handler(detail);
    };
    window.addEventListener(BANCOS_NAV_EVENT, listener);
    return () => window.removeEventListener(BANCOS_NAV_EVENT, listener);
}

/**
 * Resuelve el contexto inicial al montar una pantalla de Bancos:
 * prioriza una navegación pendiente 1-clic y, si no existe, usa la última selección en localStorage.
 * @param {string} expectedTargetPath - Ruta o clave de `BANCOS_NAV_TARGETS`
 * @returns {{ empresaId: string, cuentaId: string, numeroCuenta: string, action?: string|null } | null}
 */
export function resolveInitialBancosContext(expectedTargetPath) {
    return consumePendingBancosNav(expectedTargetPath) || loadBancosSelection();
}

/**
 * Busca la cuenta bancaria coincidente dentro de cualquier catálogo (`/cuentas`, `/movimientos/catalogos`,
 * `/conciliacion/catalogos`, `/cheques/catalogos`) normalizando `id`/`corr` y `empresa_codigo`/`id_empresa`.
 * Prioridad: 1) `cuentaId` exacto, 2) `(empresaId + numeroCuenta)`, 3) `numeroCuenta` único.
 * @param {Array<Object>} cuentasList - Lista de cuentas bancarias del catálogo
 * @param {{ empresaId?: string|number, cuentaId?: string|number, numeroCuenta?: string } | null} selection
 * @returns {Object | null} Cuenta coincidente o `null`
 */
export function findMatchingCuenta(cuentasList, selection) {
    if (!Array.isArray(cuentasList) || cuentasList.length === 0 || !selection) {
        return null;
    }
    const { empresaId, cuentaId, numeroCuenta } = normalizeSelection(selection);
    if (!empresaId && !cuentaId && !numeroCuenta) {
        return null;
    }

    if (cuentaId) {
        const byId = cuentasList.find(c => {
            const cId = c?.id ?? c?.corr ?? c?.cuenta_bancaria_id;
            return cId !== undefined && cId !== null && String(cId).trim() === cuentaId;
        });
        if (byId) return byId;
    }

    if (empresaId && numeroCuenta) {
        const byEmpresaAndNum = cuentasList.find(c => {
            const cEmp = String(c?.empresa_codigo ?? c?.id_empresa ?? c?.empresa_id ?? '').trim();
            const cNum = String(c?.numero ?? c?.numero_cuenta ?? '').trim();
            return cEmp === empresaId && cNum === numeroCuenta;
        });
        if (byEmpresaAndNum) return byEmpresaAndNum;
    }

    if (numeroCuenta) {
        const byNumMatches = cuentasList.filter(c => {
            const cNum = String(c?.numero ?? c?.numero_cuenta ?? '').trim();
            return cNum === numeroCuenta;
        });
        if (byNumMatches.length === 1) return byNumMatches[0];
    }

    return null;
}
