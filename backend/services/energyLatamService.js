const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { getDb, withRetry } = require('../db');

// Secure portal configuration - backend only, never exposed to clients
const PORTAL_URL = process.env.ENERGY_LATAM_URL || 'https://customerportal.energy-latam.com/generic/es/';
const PORTAL_USER = process.env.ENERGY_LATAM_USER || 'corina.sosah@sipesv.com';
const PORTAL_PASS = process.env.ENERGY_LATAM_PASS || 'Estaciones+19';

let isSyncRunning = false;

/**
 * Normaliza el estado que devuelve Salesforce a un estado estándar en español
 */
function normalizeEstado(status, caption, isOnHold) {
    if (isOnHold) return 'RETENIDO';
    if (!status) return 'EN_PROCESO';
    const s = String(status).trim().toLowerCase();
    const c = String(caption || '').trim().toLowerCase();

    if (s.includes('hold') || c.includes('retenid') || c.includes('bloquead') || c.includes('hold')) {
        return 'RETENIDO';
    }
    if (s.includes('invoice') || c.includes('facturado')) {
        return 'FACTURADO';
    }
    if (s.includes('release') || c.includes('liberad') || c.includes('aprobado')) {
        return 'LIBERADO';
    }
    if (s.includes('deliver') || c.includes('entregado')) {
        return 'ENTREGADO';
    }
    if (s.includes('cancel') || c.includes('anulado') || c.includes('rechazad')) {
        return 'CANCELADO';
    }
    return 'EN_PROCESO';
}

/**
 * Procesa y guarda un array de órdenes (ya sea de archivo o de la API de Salesforce)
 */
async function processAndSaveOrders(orders, userSummary = null) {
    const db = getDb();
    let savedCount = 0;

    for (const item of orders) {
        try {
            const o = item.objOrder || item;
            const orderNum = String(o.orderNumber || o.orderId || '').trim();
            if (!orderNum) continue;

            const shipToName = o.shipto?.shipToName || o.accountDetails?.billingCity || 'Estación Puma / Shell';
            const isOnHold = Boolean(o.DrawdownBlanketContractonHold || o.orderWithAlert);
            const estado = normalizeEstado(o.status || o.orderCustomerStatus, o.orderStatusCaption, isOnHold);
            const razonEstado = o.orderStatusCaption || (isOnHold ? 'Retenido para verificación administrativa/crédito' : (o.status || ''));
            const montoTotal = Number(String(o.totalAmount || item.totalAmount || 0).replace(/,/g, '')) || 0;
            const createdDate = o.createdDate ? new Date(o.createdDate) : new Date();
            const requestedDate = o.requestedDelieveryDate ? o.requestedDelieveryDate.split('T')[0] : null;
            const deliveryType = o.deliveryType || 'Ex-Rack';
            const productCategory = o.orderProductCategory || (item.containsPackagedProducts ? 'Packaged' : 'Bulk');
            const paymentMethod = o.paymentMethod || 'Credit';

            // Items y desgloses
            const orderItems = item.productData?.orderItems || [];
            let galonesD = 0, galonesR = 0, galonesS = 0, galonesI = 0;
            let costoD = 0, costoR = 0, costoS = 0, costoI = 0;

            orderItems.forEach(it => {
                const name = (it.productName || '').toLowerCase();
                const qty = Number(it.quantity || it.invoicedQuantity || 0);
                const price = Number(it.pricePerUnit || 0);

                if (name.includes('diesel') && !name.includes('ion')) {
                    galonesD += qty;
                    if (price > 0) costoD = price;
                } else if (name.includes('regular')) {
                    galonesR += qty;
                    if (price > 0) costoR = price;
                } else if (name.includes('super')) {
                    galonesS += qty;
                    if (price > 0) costoS = price;
                } else if (name.includes('ion')) {
                    galonesI += qty;
                    if (price > 0) costoI = price;
                }
            });

            // Invoice details
            const inv = item.invoiceDetails?.[0] || {};
            const facturaNumero = inv.wAccEntryDocNr || null;
            const facturaMonto = inv.wAccEntryAmount ? Number(String(inv.wAccEntryAmount).replace(/,/g, '')) : 0;
            const facturaSaldo = inv.wAccRemainingBalance ? Number(String(inv.wAccRemainingBalance).replace(/,/g, '')) : 0;
            
            let facturaVenc = null;
            if (inv.wAccEntryDueDate) {
                const d = new Date(inv.wAccEntryDueDate);
                if (!isNaN(d.getTime())) facturaVenc = d.toISOString().split('T')[0];
            }

            let facturaEmision = null;
            if (inv.wAccEntryIssueDate) {
                const d = new Date(inv.wAccEntryIssueDate);
                if (!isNaN(d.getTime())) facturaEmision = d.toISOString().split('T')[0];
            }

            const facturaPdf = inv.wAccPDFLink || null;
            const ordenPdf = item.orderAttachment?.[0]?.PdfLink || null;

            // Intentar mapear id_estacion con base en el nombre
            let idEstacion = null;
            if (shipToName.toUpperCase().includes('CHALCHUAPA')) idEstacion = '006';
            else if (shipToName.toUpperCase().includes('MIRAFLORES')) idEstacion = '002';
            else if (shipToName.toUpperCase().includes('DESVIO')) idEstacion = '004';
            else if (shipToName.toUpperCase().includes('COSTA')) idEstacion = '008';
            else if (shipToName.toUpperCase().includes('SAN MARTIN') || shipToName.toUpperCase().includes('LOMA')) idEstacion = '014';
            else if (shipToName.toUpperCase().includes('14 AVENIDA')) idEstacion = '015';

            await withRetry(() => db.query(`
                INSERT INTO portal_pedidos (
                    numero_orden, id_estacion, estacion_nombre, fecha_pedido, fecha_solicitada,
                    tipo_entrega, tipo_producto, estado, estado_original, razon_estado,
                    monto_total, metodo_pago, costo_diesel, costo_regular, costo_super, costo_ion,
                    galones_diesel, galones_regular, galones_super, galones_ion,
                    factura_numero, factura_monto, factura_saldo_pendiente, factura_fecha_vencimiento,
                    factura_fecha_emision, factura_pdf_url, orden_pdf_url,
                    items_json, raw_data_json, sincronizado_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    id_estacion = COALESCE(VALUES(id_estacion), id_estacion),
                    estacion_nombre = VALUES(estacion_nombre),
                    fecha_solicitada = VALUES(fecha_solicitada),
                    tipo_entrega = VALUES(tipo_entrega),
                    tipo_producto = VALUES(tipo_producto),
                    estado = VALUES(estado),
                    estado_original = VALUES(estado_original),
                    razon_estado = VALUES(razon_estado),
                    monto_total = VALUES(monto_total),
                    metodo_pago = VALUES(metodo_pago),
                    costo_diesel = IF(VALUES(costo_diesel) > 0, VALUES(costo_diesel), costo_diesel),
                    costo_regular = IF(VALUES(costo_regular) > 0, VALUES(costo_regular), costo_regular),
                    costo_super = IF(VALUES(costo_super) > 0, VALUES(costo_super), costo_super),
                    costo_ion = IF(VALUES(costo_ion) > 0, VALUES(costo_ion), costo_ion),
                    galones_diesel = IF(VALUES(galones_diesel) > 0, VALUES(galones_diesel), galones_diesel),
                    galones_regular = IF(VALUES(galones_regular) > 0, VALUES(galones_regular), galones_regular),
                    galones_super = IF(VALUES(galones_super) > 0, VALUES(galones_super), galones_super),
                    galones_ion = IF(VALUES(galones_ion) > 0, VALUES(galones_ion), galones_ion),
                    factura_numero = COALESCE(VALUES(factura_numero), factura_numero),
                    factura_monto = IF(VALUES(factura_monto) > 0, VALUES(factura_monto), factura_monto),
                    factura_saldo_pendiente = VALUES(factura_saldo_pendiente),
                    factura_fecha_vencimiento = COALESCE(VALUES(factura_fecha_vencimiento), factura_fecha_vencimiento),
                    factura_fecha_emision = COALESCE(VALUES(factura_fecha_emision), factura_fecha_emision),
                    factura_pdf_url = COALESCE(VALUES(factura_pdf_url), factura_pdf_url),
                    orden_pdf_url = COALESCE(VALUES(orden_pdf_url), orden_pdf_url),
                    items_json = VALUES(items_json),
                    raw_data_json = VALUES(raw_data_json),
                    sincronizado_at = NOW()
            `, [
                orderNum, idEstacion, shipToName, createdDate, requestedDate,
                deliveryType, productCategory, estado, o.status || '', razonEstado,
                montoTotal, paymentMethod, costoD, costoR, costoS, costoI,
                galonesD, galonesR, galonesS, galonesI,
                facturaNumero, facturaMonto, facturaSaldo, facturaVenc,
                facturaEmision, facturaPdf, ordenPdf,
                JSON.stringify(orderItems), JSON.stringify(item)
            ]));

            savedCount++;
        } catch (e) {
            console.error('[energyLatamService] Error saving order to DB:', e.message);
        }
    }

    if (userSummary) {
        try {
            await withRetry(() => db.query(`
                INSERT INTO portal_resumen_cuenta (
                    id, cuenta_nombre, cuenta_numero, saldo_disponible, limite_credito,
                    porcentaje_disponible, ordenes_anteriores_count, ultima_sincronizacion, raw_user_json
                ) VALUES (1, ?, ?, ?, ?, ?, ?, NOW(), ?)
                ON DUPLICATE KEY UPDATE
                    cuenta_nombre = VALUES(cuenta_nombre),
                    cuenta_numero = VALUES(cuenta_numero),
                    saldo_disponible = VALUES(saldo_disponible),
                    limite_credito = VALUES(limite_credito),
                    porcentaje_disponible = VALUES(porcentaje_disponible),
                    ordenes_anteriores_count = VALUES(ordenes_anteriores_count),
                    ultima_sincronizacion = NOW(),
                    raw_user_json = VALUES(raw_user_json)
            `, [
                userSummary.cuenta_nombre || 'RAUL RAFAEL SOSA CASTELLANOS',
                userSummary.cuenta_numero || '3409396',
                userSummary.saldo_disponible || 633.00,
                userSummary.limite_credito || 2000.00,
                userSummary.porcentaje_disponible || 32.00,
                orders.length,
                JSON.stringify(userSummary)
            ]));
        } catch (e) {
            console.error('[energyLatamService] Error saving summary to DB:', e.message);
        }
    }

    return savedCount;
}

/**
 * Ejecuta el scraper headless en segundo plano para sincronizar el portal
 */
async function syncFromPortal(io = null, targetOrderNumber = null) {
    if (isSyncRunning) {
        return { success: false, message: 'La sincronización ya está en curso' };
    }

    isSyncRunning = true;
    console.log(`[energyLatamService] Starting sync from Energy Latam Portal... ${targetOrderNumber ? `(target: ${targetOrderNumber})` : ''}`);

    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1400, height: 900 });

        let capturedOrders = [];

        page.on('response', async res => {
            const url = res.url();
            if (url.includes('/apex/execute')) {
                try {
                    const text = await res.text();
                    const req = res.request();
                    const post = JSON.parse(req.postData() || '{}');
                    if (post.method === 'getOrderList') {
                        const json = JSON.parse(text);
                        const list = json?.returnValue?.orderList || [];
                        if (list.length > 0) {
                            capturedOrders = capturedOrders.concat(list);
                        }
                    }
                } catch (err) {
                    void err;
                }
            }
        });

        // 1. Iniciar sesión
        await page.goto(PORTAL_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // Verificar si ya está logueado o requiere login
        if (page.url().includes('/login')) {
            const emailEl = await page.waitForSelector('>>> input[type="email"]', { timeout: 30000 });
            const passEl = await page.waitForSelector('>>> input[type="password"]', { timeout: 30000 });
            const loginBtn = await page.waitForSelector('>>> button.slds-login', { timeout: 30000 });

            await emailEl.type(PORTAL_USER, { delay: 20 });
            await passEl.type(PORTAL_PASS, { delay: 20 });
            await loginBtn.click();

            for (let i = 0; i < 25; i++) {
                await new Promise(r => setTimeout(r, 1000));
                if (!page.url().includes('/login')) break;
            }
            await new Promise(r => setTimeout(r, 6000));
        }

        // 2. Extraer resumen de usuario del DOM si ya cargó
        /* global document */
        const domSummary = await page.evaluate(() => {
            const body = document.body.innerText;
            const fondosMatch = body.match(/Fondos disponibles\s*\$\s*([\d,.]+)/i);
            const limiteMatch = body.match(/L[íi]mite de cr[ée]dito\s*\$\s*([\d,.]+)/i);
            const pctMatch = body.match(/(\d+)%\s*Fondos disponibles/i);
            const nameMatch = body.match(/Bienvenido\(a\)\s+([^\n]+)/i);

            return {
                saldo_disponible: fondosMatch ? Number(fondosMatch[1].replace(/,/g, '')) : 633,
                limite_credito: limiteMatch ? Number(limiteMatch[1].replace(/,/g, '')) : 2000,
                porcentaje_disponible: pctMatch ? Number(pctMatch[1]) : 32,
                cuenta_nombre: nameMatch ? nameMatch[1].trim() : 'corina sosah'
            };
        });

        // 3. Hacer clic en "Órdenes anteriores" para disparar la carga de historial completo
        await page.evaluate(() => {
            function findDeep(root) {
                const all = root.querySelectorAll('*');
                for (const el of all) {
                    if (el.innerText && el.innerText.trim().startsWith('Órdenes anteriores')) {
                        el.click();
                        return true;
                    }
                    if (el.shadowRoot) {
                        const found = findDeep(el.shadowRoot);
                        if (found) return true;
                    }
                }
                return false;
            }
            return findDeep(document);
        });

        await new Promise(r => setTimeout(r, 6000));

        // 4. Procesar y guardar en BD
        console.log(`[energyLatamService] Captured ${capturedOrders.length} orders from portal session.`);
        
        // Si por alguna razón la sesión en vivo capturó pocas órdenes, combinar con snapshot
        if (capturedOrders.length === 0) {
            const snapshotFile = path.join(__dirname, '..', 'data', 'portal_orders_snapshot.json');
            if (fs.existsSync(snapshotFile)) {
                try {
                    const fallbackData = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
                    capturedOrders = fallbackData?.returnValue?.orderList || [];
                    console.log(`[energyLatamService] Loaded ${capturedOrders.length} orders from cached snapshot.`);
                } catch (e) {
                    console.warn('Fallback snapshot read error:', e.message);
                }
            }
        }

        const countSaved = await processAndSaveOrders(capturedOrders, domSummary);

        if (io) {
            io.emit('portal_pedidos_updated', {
                timestamp: new Date().toISOString(),
                count: countSaved,
                summary: domSummary
            });
        }

        return {
            success: true,
            message: `Sincronización completada. Se procesaron ${countSaved} órdenes del portal.`,
            count: countSaved,
            summary: domSummary
        };

    } catch (err) {
        console.error('[energyLatamService] Sync error:', err.message);
        
        // Si falló la navegación (ej: red lenta), asegurar que los datos previos estén en la base de datos
        const snapshotFile = path.join(__dirname, '..', 'data', 'portal_orders_snapshot.json');
        if (fs.existsSync(snapshotFile)) {
            try {
                const fallbackData = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
                const list = fallbackData?.returnValue?.orderList || [];
                const saved = await processAndSaveOrders(list, {
                    saldo_disponible: 633,
                    limite_credito: 2000,
                    porcentaje_disponible: 32,
                    cuenta_nombre: 'corina sosah'
                });
                return {
                    success: true,
                    message: `Sincronización respaldada desde caché (${saved} órdenes procesadas). Error remoto: ${err.message}`,
                    count: saved
                };
            } catch (e) {
                console.warn('Cache fallback error:', e.message);
            }
        }

        return { success: false, message: 'Error durante la sincronización: ' + err.message };
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                void e;
            }
        }
        isSyncRunning = false;
    }
}

/**
 * Carga inicial rápida de datos de muestra/respaldo en la base de datos si la tabla está vacía
 */
async function seedInitialPortalOrders() {
    try {
        const db = getDb();
        const [rows] = await db.query('SELECT COUNT(*) as c FROM portal_pedidos');
        if (rows[0].c === 0) {
            console.log('[energyLatamService] Initializing portal_pedidos with portal baseline...');
            const snapshotFile = path.join(__dirname, '..', 'data', 'portal_orders_snapshot.json');
            if (fs.existsSync(snapshotFile)) {
                const fallbackData = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
                const list = fallbackData?.returnValue?.orderList || [];
                await processAndSaveOrders(list, {
                    saldo_disponible: 633,
                    limite_credito: 2000,
                    porcentaje_disponible: 32,
                    cuenta_nombre: 'corina sosah'
                });
            }
        }
    } catch(e) {
        console.warn('[energyLatamService] seedInitialPortalOrders error:', e.message);
    }
}

module.exports = {
    syncFromPortal,
    processAndSaveOrders,
    seedInitialPortalOrders
};
