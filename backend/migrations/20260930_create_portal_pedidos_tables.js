const { getDb, getExternalDb } = require('../db');

async function up() {
    console.log('[Migration] Creating portal_pedidos and related tables...');
    const db = getDb();
    const ext = await getExternalDb();

    // 1. Create in main app DB (db_sipe_admin)
    await db.query(`
        CREATE TABLE IF NOT EXISTS portal_pedidos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            numero_orden VARCHAR(50) NOT NULL UNIQUE,
            id_estacion VARCHAR(50) NULL,
            estacion_nombre VARCHAR(150) NULL,
            fecha_pedido DATETIME NULL,
            fecha_solicitada DATE NULL,
            tipo_entrega VARCHAR(50) NULL,
            tipo_producto VARCHAR(50) NULL DEFAULT 'Bulk',
            estado VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE',
            estado_original VARCHAR(50) NULL,
            razon_estado TEXT NULL,
            monto_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            metodo_pago VARCHAR(50) NULL,
            costo_diesel DECIMAL(10,4) DEFAULT 0.0000,
            costo_regular DECIMAL(10,4) DEFAULT 0.0000,
            costo_super DECIMAL(10,4) DEFAULT 0.0000,
            costo_ion DECIMAL(10,4) DEFAULT 0.0000,
            galones_diesel DECIMAL(10,2) DEFAULT 0.00,
            galones_regular DECIMAL(10,2) DEFAULT 0.00,
            galones_super DECIMAL(10,2) DEFAULT 0.00,
            galones_ion DECIMAL(10,2) DEFAULT 0.00,
            factura_numero VARCHAR(50) NULL,
            factura_monto DECIMAL(12,2) DEFAULT 0.00,
            factura_saldo_pendiente DECIMAL(12,2) DEFAULT 0.00,
            factura_fecha_vencimiento DATE NULL,
            factura_fecha_emision DATE NULL,
            factura_pdf_url TEXT NULL,
            orden_pdf_url TEXT NULL,
            items_json LONGTEXT NULL,
            raw_data_json LONGTEXT NULL,
            -- PAGO Y CONCILIACION
            estado_pago ENUM('PENDIENTE', 'PAGADO', 'PARCIAL', 'CONCILIADO') DEFAULT 'PENDIENTE',
            cuenta_bancaria_id INT NULL,
            movimiento_bancario_id INT NULL,
            cheque_id INT NULL,
            tipo_pago VARCHAR(50) DEFAULT 'Transferencia',
            referencia_pago VARCHAR(100) NULL,
            fecha_pago DATE NULL,
            monto_pagado DECIMAL(12,2) DEFAULT 0.00,
            observaciones_pago TEXT NULL,
            listo_conciliacion TINYINT(1) DEFAULT 0,
            fecha_conciliado DATE NULL,
            sincronizado_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_portal_orden (numero_orden),
            INDEX idx_portal_estacion (id_estacion),
            INDEX idx_portal_estado (estado),
            INDEX idx_portal_fecha (fecha_pedido),
            INDEX idx_portal_pago (estado_pago, listo_conciliacion)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS portal_resumen_cuenta (
            id INT AUTO_INCREMENT PRIMARY KEY,
            cuenta_nombre VARCHAR(150),
            cuenta_numero VARCHAR(50),
            saldo_disponible DECIMAL(12,2) DEFAULT 0.00,
            limite_credito DECIMAL(12,2) DEFAULT 0.00,
            porcentaje_disponible DECIMAL(5,2) DEFAULT 0.00,
            ordenes_activas_count INT DEFAULT 0,
            ordenes_anteriores_count INT DEFAULT 0,
            ultima_sincronizacion DATETIME,
            raw_user_json LONGTEXT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS combustible_precios_quincenales (
            id INT AUTO_INCREMENT PRIMARY KEY,
            periodo_inicio DATE NOT NULL,
            periodo_fin DATE NOT NULL,
            precio_diesel DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
            precio_regular DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
            precio_super DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
            precio_ion DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
            variacion_diesel DECIMAL(10,4) DEFAULT 0.0000,
            variacion_regular DECIMAL(10,4) DEFAULT 0.0000,
            variacion_super DECIMAL(10,4) DEFAULT 0.0000,
            variacion_ion DECIMAL(10,4) DEFAULT 0.0000,
            fuente VARCHAR(100) DEFAULT 'Portal Energy-Latam / DGEHM',
            activo TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_periodo (periodo_inicio, periodo_fin)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Ensure web_pedidos_temp and web_pedidos exist in both databases
    const ensureTablesSql = [
        `CREATE TABLE IF NOT EXISTS web_pedidos_temp (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_estacion VARCHAR(50) NOT NULL,
            fecha DATE NOT NULL,
            id_carrier_local INT NULL,
            id_transportista INT NULL,
            id_tanker_local INT NULL,
            id_calibracion_diesel INT NULL,
            diesel DOUBLE(15,2) DEFAULT 0,
            regular DOUBLE(15,2) DEFAULT 0,
            super DOUBLE(15,2) DEFAULT 0,
            iondiesel DOUBLE(15,2) DEFAULT 0,
            numero VARCHAR(50) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
        
        `CREATE TABLE IF NOT EXISTS web_pedidos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            fecha DATE NOT NULL,
            numero VARCHAR(50) NOT NULL,
            id_estacion VARCHAR(50) NOT NULL,
            forma_pago VARCHAR(50) NULL,
            p_diesel DOUBLE(15,2) DEFAULT 0,
            p_regular DOUBLE(15,2) DEFAULT 0,
            p_super DOUBLE(15,2) DEFAULT 0,
            p_ion DOUBLE(15,2) DEFAULT 0,
            id_carrier_local INT NULL,
            id_tanker_local INT NULL,
            flete VARCHAR(50) NULL,
            pipa INT DEFAULT 0,
            costo_d DOUBLE(15,4) DEFAULT 0,
            costo_s DOUBLE(15,4) DEFAULT 0,
            costo_r DOUBLE(15,4) DEFAULT 0,
            costo_i DOUBLE(15,4) DEFAULT 0,
            compartido DOUBLE(15,2) DEFAULT 0,
            id_origen INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    ];

    for (const sql of ensureTablesSql) {
        try { await db.query(sql); } catch(e){ console.warn('main db ensure:', e.message); }
        try { await ext.query(sql); } catch(e){ console.warn('ext db ensure:', e.message); }
    }

    // Insert initial combustible biweekly period (current and previous)
    const today = new Date();
    const currYear = today.getFullYear();
    const currMonth = String(today.getMonth() + 1).padStart(2, '0');
    await db.query(`
        INSERT IGNORE INTO combustible_precios_quincenales 
        (periodo_inicio, periodo_fin, precio_diesel, precio_regular, precio_super, precio_ion, fuente, activo)
        VALUES 
        ('${currYear}-${currMonth}-01', '${currYear}-${currMonth}-15', 3.6500, 3.8200, 4.1500, 3.7500, 'Precios de Referencia Quincenal', 0),
        ('${currYear}-${currMonth}-16', '${currYear}-${currMonth}-30', 3.6800, 3.8500, 4.1800, 3.7800, 'Precios de Referencia Quincenal', 1)
    `);

    console.log('[Migration] portal_pedidos and related tables created successfully.');
}

if (require.main === module) {
    const { initDB } = require('../db');
    (async () => {
        try {
            await initDB();
            await up();
            console.log('Migration completed.');
            process.exit(0);
        } catch (e) {
            console.error('Migration error:', e);
            process.exit(1);
        }
    })();
}

module.exports = { up };
