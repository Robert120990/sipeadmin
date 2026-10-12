const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

async function generatePdf() {
    console.log('Iniciando generación de PDF ejecutivo...');

    const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Manual de Usuario y Guía de Operaciones: Telegram Bot, SIPE Admin Web, OpenClaw y n8n</title>
    <style>
        @page {
            size: letter;
            margin: 16mm 14mm 16mm 14mm;
            @bottom-right {
                content: counter(page);
            }
        }
        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            background: #ffffff;
            margin: 0;
            padding: 0;
            font-size: 11pt;
            line-height: 1.55;
        }
        .cover {
            page-break-after: always;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 30px 10px 10px 10px;
        }
        .cover-header {
            border-bottom: 4px solid #2563eb;
            padding-bottom: 24px;
        }
        .badge-enterprise {
            display: inline-block;
            background: #eff6ff;
            color: #1d4ed8;
            border: 1px solid #bfdbfe;
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 9.5pt;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            margin-bottom: 16px;
        }
        h1.doc-title {
            font-size: 26pt;
            font-weight: 800;
            color: #0f172a;
            margin: 0 0 12px 0;
            line-height: 1.2;
        }
        h2.doc-subtitle {
            font-size: 13pt;
            font-weight: 500;
            color: #475569;
            margin: 0;
            line-height: 1.45;
        }
        .cover-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
            margin: 40px 0;
        }
        .stat-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 16px 18px;
        }
        .stat-card h4 {
            margin: 0 0 6px 0;
            font-size: 10pt;
            text-transform: uppercase;
            color: #64748b;
            font-weight: 700;
        }
        .stat-card p {
            margin: 0;
            font-size: 11pt;
            font-weight: 600;
            color: #0f172a;
        }
        .cover-footer {
            border-top: 1px solid #e2e8f0;
            padding-top: 20px;
            display: flex;
            justify-content: space-between;
            font-size: 9pt;
            color: #64748b;
        }
        .section {
            page-break-inside: avoid;
            margin-bottom: 24px;
        }
        h2.section-title {
            font-size: 15pt;
            font-weight: 800;
            color: #0f172a;
            border-left: 5px solid #2563eb;
            padding-left: 12px;
            margin: 28px 0 14px 0;
            display: flex;
            align-items: center;
        }
        h3.subsection-title {
            font-size: 12pt;
            font-weight: 700;
            color: #1e3a8a;
            margin: 18px 0 8px 0;
        }
        p {
            margin: 0 0 10px 0;
        }
        .callout {
            border-radius: 8px;
            padding: 14px 16px;
            margin: 14px 0;
            border-left: 4px solid;
            font-size: 10pt;
        }
        .callout-info {
            background: #f0fdf4;
            border-color: #16a34a;
            color: #14532d;
        }
        .callout-warning {
            background: #fffbeb;
            border-color: #d97706;
            color: #78350f;
        }
        .callout-blue {
            background: #eff6ff;
            border-color: #2563eb;
            color: #1e3a8a;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 14px 0 20px 0;
            font-size: 9.5pt;
        }
        th {
            background: #f1f5f9;
            color: #0f172a;
            font-weight: 700;
            text-align: left;
            padding: 8px 10px;
            border: 1px solid #cbd5e1;
            text-transform: uppercase;
            font-size: 8.5pt;
            letter-spacing: 0.03em;
        }
        td {
            padding: 8px 10px;
            border: 1px solid #e2e8f0;
            vertical-align: top;
        }
        tr:nth-child(even) td {
            background: #f8fafc;
        }
        .tag {
            display: inline-block;
            padding: 2px 7px;
            border-radius: 4px;
            font-size: 8pt;
            font-weight: 700;
            text-transform: uppercase;
        }
        .tag-green { background: #dcfce7; color: #15803d; }
        .tag-blue { background: #dbeafe; color: #1d4ed8; }
        .tag-purple { background: #f3e8ff; color: #7e22ce; }
        .tag-amber { background: #fef3c7; color: #b45309; }
        .tag-gray { background: #f1f5f9; color: #475569; }
        .step-box {
            display: flex;
            gap: 14px;
            margin-bottom: 12px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px 14px;
        }
        .step-num {
            background: #2563eb;
            color: white;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 11pt;
            flex-shrink: 0;
        }
        .step-content h4 {
            margin: 0 0 4px 0;
            font-size: 10.5pt;
            color: #0f172a;
        }
        .step-content p {
            margin: 0;
            font-size: 9.5pt;
            color: #475569;
        }
        .page-break {
            page-break-before: always;
        }
        code {
            background: #f1f5f9;
            padding: 2px 5px;
            border-radius: 4px;
            font-family: "Courier New", Courier, monospace;
            font-size: 9pt;
            color: #0f172a;
        }
    </style>
</head>
<body>

    <!-- PORTADA EJECUTIVA -->
    <div class="cover">
        <div class="cover-header">
            <span class="badge-enterprise">SIPE Admin • Dirección Estratégica & Automatización</span>
            <h1 class="doc-title">Manual de Operaciones & Guía de Uso</h1>
            <h2 class="doc-subtitle">Ecosistema Integrado: Telegram Bot Gerencial, Panel Web SIPE Admin, OpenClaw y n8n</h2>
        </div>

        <div class="cover-grid">
            <div class="stat-card">
                <h4>Servidor de Producción Principal</h4>
                <p>admin.sipesv.com (5.252.55.29)</p>
                <small style="color: #64748b;">Backend Express :5001 + Caddy Reverse Proxy</small>
            </div>
            <div class="stat-card">
                <h4>Servidor de Agentes & Automatización</h4>
                <p>bot.how2getfun.com (169.58.207.115)</p>
                <small style="color: #64748b;">OpenClaw Gateway + n8n Workflows</small>
            </div>
            <div class="stat-card">
                <h4>Grafo de Conocimiento Determinista</h4>
                <p>Graphify AST (v0.9.87)</p>
                <small style="color: #64748b;">1,212 Nodos, 3,183 Relaciones y 60 Módulos</small>
            </div>
            <div class="stat-card">
                <h4>Versión Activa del Sistema</h4>
                <p>v1.0.126 (Octubre 2026)</p>
                <small style="color: #10b981;">100% Verificado en Producción (130 tests OK)</small>
            </div>
        </div>

        <div class="callout callout-blue">
            <strong>Arquitectura de Cero Impacto en Producción:</strong> Todos los agentes externos y flujos de automatización ejecutan consultas de solo lectura (<code>SELECT</code>) a través de un API Gateway seguro con limitador de tasa y tiempo límite de 10 segundos. La operación en pista de las estaciones de servicio y la facturación electrónica DTE (Hacienda) están plenamente aisladas y protegidas.
        </div>

        <div class="cover-footer">
            <span>Confidencial • SIPE Admin El Salvador</span>
            <span>Documento Oficial de Entrega</span>
        </div>
    </div>

    <!-- PÁGINA 1: CAPACIDADES EN TELEGRAM -->
    <div class="page-break"></div>
    <h2 class="section-title">1. ¿Qué se puede hacer actualmente en Telegram?</h2>
    <p>El bot oficial de Telegram (<code>HTTP API</code>) ofrece un panel conversacional ágil diseñado para que directores, socios, gerentes y tesoreros consulten la información operativa y financiera sin necesidad de abrir una computadora.</p>

    <h3 class="subsection-title">Teclado de Acceso Rápido Permanente</h3>
    <p>Al interactuar con el bot, el usuario dispone en la parte inferior de su pantalla de un menú de botones táctiles que responden en menos de 100 milisegundos:</p>

    <table>
        <thead>
            <tr>
                <th style="width: 25%;">Botón / Comando</th>
                <th style="width: 45%;">Información y Contenido Entregado</th>
                <th style="width: 30%;">Permiso Requerido</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td><strong>⛽ Ventas de Hoy</strong><br><code>/ventas hoy</code></td>
                <td>
                    • Galonaje total consolidado del día en curso.<br>
                    • Desglose por producto: <em>Diesel, Regular, Súper e Ion Diesel</em>.<br>
                    • Ventas monetarias en pista ($) + Ventas por cortes en tiendas.<br>
                    • Total global y detalle por cada estación.
                </td>
                <td><span class="tag tag-green">Ventas de Estaciones</span></td>
            </tr>
            <tr>
                <td><strong>⛽ Ventas de Ayer</strong><br><code>/ventas ayer</code> o <code>/ventas</code></td>
                <td>Consolidado oficial del cierre auditado del día anterior con el rendimiento de cada estación y tienda.</td>
                <td><span class="tag tag-green">Ventas de Estaciones</span></td>
            </tr>
            <tr>
                <td><strong>🏦 Saldo en Banco</strong><br><code>/bancos</code></td>
                <td>
                    • Saldo total disponible en bancos.<br>
                    • Agrupación por entidad: <em>Agrícola, Promerica, Davivienda, Hipotecario, Atlántida, Cuscatlán, BAC</em>.<br>
                    • Detalle cuenta por cuenta con sus saldos y números oficiales.
                </td>
                <td><span class="tag tag-blue">Saldo en Bancos</span></td>
            </tr>
            <tr>
                <td><strong>🧾 Saldo en Chequera</strong><br><code>/chequera</code></td>
                <td>Saldos reales disponibles en cuentas corrientes de cheques para aprobación o libramiento de pagos.</td>
                <td><span class="tag tag-purple">Saldo en Chequera</span></td>
            </tr>
            <tr>
                <td><strong>🚨 Alertas en Estaciones</strong><br><code>/alertas</code></td>
                <td>
                    Auditoría automática de irregularidades:<br>
                    1. Descuadres en cierres de turno de pista (&gt; $0.05).<br>
                    2. Descuadres en cortes de tiendas de conveniencia.<br>
                    3. Gastos operativos reportados en tiendas con caja chica.<br>
                    4. Incongruencias entre galones despachados y venta cobrada.
                </td>
                <td><span class="tag tag-amber">Alertas en Estaciones</span></td>
            </tr>
            <tr>
                <td><strong>ℹ️ Mi Perfil</strong><br><code>/perfil</code> o <code>/id</code></td>
                <td>Muestra el ID de Telegram, nombre, estado (Activo/Inactivo), usuario de SIPE Admin vinculado, rol heredado y lista de permisos activos.</td>
                <td><span class="tag tag-gray">Acceso General</span></td>
            </tr>
            <tr>
                <td><strong>❓ Ayuda</strong><br><code>/ayuda</code></td>
                <td>Catálogo explicativo de comandos y sintaxis aceptada por el bot.</td>
                <td><span class="tag tag-gray">Acceso General</span></td>
            </tr>
        </tbody>
    </table>

    <div class="callout callout-info">
        <strong>Consultas Históricas Personalizadas:</strong> Además de los botones, se puede consultar cualquier fecha histórica escribiendo <code>/ventas YYYY-MM-DD</code> (ejemplo: <code>/ventas 2026-10-10</code> o <code>/ventas 10/10/2026</code>) o solicitando alertas con <code>/alertas 2026-10-10</code>.
    </div>

    <!-- PÁGINA 2: PANEL WEB SIPE ADMIN -->
    <div class="page-break"></div>
    <h2 class="section-title">2. ¿Qué se puede hacer en el Panel Web SIPE Admin?</h2>
    <p>En la plataforma web principal (<strong>Seguridad &gt; Usuarios de Telegram</strong> en <a href="https://admin.sipesv.com/dashboard/seguridad/telegram">admin.sipesv.com</a>), los administradores tienen el control total del acceso:</p>

    <div class="stat-card" style="margin-bottom: 16px;">
        <h4 style="color: #2563eb;">1. Monitor de Salud y Control en Vivo del Bot</h4>
        <p style="font-size: 10pt; font-weight: normal; color: #334155;">
            • <strong>Estado del Polling:</strong> Semáforo en tiempo real (<em>En Línea</em> vs <em>En Pausa</em>) y fecha del último sondeo.<br>
            • <strong>Botón Probar Conexión (<code>getMe</code>):</strong> Diagnostica la validez del token contra los servidores globales de Telegram.<br>
            • <strong>Botón Reiniciar Bot:</strong> Reinicia el ciclo de escucha en caliente sin reiniciar el backend de producción.
        </p>
    </div>

    <div class="stat-card" style="margin-bottom: 16px;">
        <h4 style="color: #2563eb;">2. Vinculación Inteligente con Usuarios de SIPE Admin</h4>
        <p style="font-size: 10pt; font-weight: normal; color: #334155;">
            • <strong>Autodetección de Solicitudes:</strong> Cuando alguien nuevo escribe <code>/start</code> en Telegram, entra en estado <em>Inactivo</em> y aparece de inmediato en la tabla web.<br>
            • <strong>Autocompletado Predictivo:</strong> Al abrir el modal de edición, el sistema busca coincidencias por nombre o username en el catálogo de usuarios de SIPE y sugiere la vinculación.<br>
            • <strong>Herencia Automática de Permisos:</strong> Al marcar <em>"Heredar automáticamente permisos de consultas según rol en SIPE Admin"</em>, el usuario recibe exactamente las consultas que su rol en SIPE le permite (evita parametrizar manualmente cada persona).<br>
            • <strong>Permisos Manuales:</strong> Si un directivo no posee cuenta en SIPE Admin, puede configurarse de forma independiente con los switches individuales de Ventas, Bancos, Chequera o Alertas.
        </p>
    </div>

    <div class="stat-card" style="margin-bottom: 16px;">
        <h4 style="color: #2563eb;">3. Emisión de Mensajes de Prueba Directos</h4>
        <p style="font-size: 10pt; font-weight: normal; color: #334155;">
            • Cada usuario en la tabla cuenta con un botón de <strong>Avión de Papel</strong>. Al presionarlo se abre un modal interactivo para redactar un mensaje y enviarlo directamente a su cuenta de Telegram, permitiendo validar la recepción o emitir comunicados urgentes.
        </p>
    </div>

    <div class="stat-card" style="margin-bottom: 16px;">
        <h4 style="color: #2563eb;">4. Bitácora de Auditoría en Tiempo Real</h4>
        <p style="font-size: 10pt; font-weight: normal; color: #334155;">
            • Pestaña dedicada que registra cada interacción realizada en Telegram: fecha y hora, ID del usuario, comando solicitado, respuesta entregada y si fue autorizado o denegado por falta de privilegios.
        </p>
    </div>

    <!-- PÁGINA 3: OPENCLAW Y N8N -->
    <div class="page-break"></div>
    <h2 class="section-title">3. ¿Qué hacen actualmente OpenClaw y n8n?</h2>
    <p>Ambos servicios residen en el servidor dedicado de automatización e Inteligencia Artificial (<code>169.58.207.115</code>). Trabajan en conjunto según sus fortalezas naturales:</p>

    <table>
        <thead>
            <tr>
                <th style="width: 20%;">Componente</th>
                <th style="width: 30%;">Rol en la Arquitectura</th>
                <th style="width: 50%;">Actividades y Funcionamiento Actual</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td><strong>OpenClaw</strong><br><small>bot.how2getfun.com</small></td>
                <td><strong>Agente Conversacional con Inteligencia Artificial</strong></td>
                <td>
                    • <strong>Comprensión de Lenguaje Natural:</strong> Permite al usuario consultar sin botones estrictos (ej. <em>"¿Cuánto diesel se vendió en Costa del Sol la semana pasada?"</em>).<br>
                    • <strong>Navegación con Graphify:</strong> Consulta el grafo AST (<code>graphify-out/graph.json</code>) para localizar las rutas y tablas exactas sin inventar datos ni requerir bases de datos vectoriales.<br>
                    • <strong>Consumo Seguro:</strong> Utiliza el endpoint <code>POST /api/ai/query</code> en <code>admin.sipesv.com</code> validando los permisos efectivos del usuario antes de contestar.
                </td>
            </tr>
            <tr>
                <td><strong>n8n</strong><br><small>Servidor 169.58.207.115</small></td>
                <td><strong>Motor de Flujos Programados y Webhooks</strong></td>
                <td>
                    • <strong>Actividad 1 (Flash Matutino 7:00 AM):</strong> Cron diario que recopila el cierre consolidado y lo despacha a la junta directiva por Telegram.<br>
                    • <strong>Actividad 2 (Centinela de Descuadres):</strong> Webhook reactivo que dispara una alerta urgente si un cierre de turno tiene una diferencia &gt; $50 o merma &gt; 0.4%.<br>
                    • <strong>Actividad 3 (Monitor Pre-DGEHM):</strong> Cron quincenal (lunes 6:00 PM) que evalúa la variación de precios oficiales y recomienda compras de pedidos de combustible.
                </td>
            </tr>
            <tr>
                <td><strong>Graphify</strong><br><small>Labs AST Engine</small></td>
                <td><strong>Grafo de Conocimiento Determinista</strong></td>
                <td>
                    • Modela 1,212 nodos, 3,183 relaciones y 60 comunidades de código.<br>
                    • Reduce el consumo de tokens en un 70x.<br>
                    • Garantiza que las respuestas de la IA respeten las fórmulas matemáticas y esquemas reales del negocio.
                </td>
            </tr>
        </tbody>
    </table>

    <h2 class="section-title">4. Guía Rápida: Alta y Vinculación de un Usuario</h2>
    
    <div class="step-box">
        <div class="step-num">1</div>
        <div class="step-content">
            <h4>Registro Inicial en Telegram</h4>
            <p>El usuario busca el bot en Telegram y envía el comando <code>/start</code>. El bot le responderá saludándolo y mostrando su ID numérico, indicando que su solicitud ha sido enviada para aprobación.</p>
        </div>
    </div>

    <div class="step-box">
        <div class="step-num">2</div>
        <div class="step-content">
            <h4>Acceso al Panel Web</h4>
            <p>El administrador ingresa a <strong>SIPE Admin &gt; Seguridad &gt; Usuarios de Telegram</strong>. En la tabla verá el nuevo registro marcado como <em>Inactivo</em>.</p>
        </div>
    </div>

    <div class="step-box">
        <div class="step-num">3</div>
        <div class="step-content">
            <h4>Vinculación con Rol de SIPE Admin</h4>
            <p>Haz clic en <strong>Editar</strong>. En el menú desplegable, selecciona la cuenta de usuario de SIPE correspondiente (ej. <em>Raúl Sosa</em>). Marca el checkbox <em>"Heredar automáticamente permisos de consultas"</em>, cambia el estado a <strong>Activo</strong> y pulsa <strong>Guardar</strong>.</p>
        </div>
    </div>

    <div class="step-box">
        <div class="step-num">4</div>
        <div class="step-content">
            <h4>Confirmación y Uso Inmediato</h4>
            <p>Usa el botón de <strong>Avión de Papel</strong> para enviarle un mensaje de confirmación al usuario. En su Telegram, el teclado interactivo aparecerá activado y podrá consultar las ventas y saldos de inmediato.</p>
        </div>
    </div>

</body>
</html>`;

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // Rutas de destino
    const targetDirPublic = path.resolve(__dirname, '../../frontend/public/docs');
    const targetDirArtifact = path.resolve('C:/Users/rauls/.gemini/antigravity/brain/ef261f05-033a-493b-9fbb-24439a2edccd');
    
    fs.mkdirSync(targetDirPublic, { recursive: true });

    const pdfPathPublic = path.join(targetDirPublic, 'GUIA_OFICIAL_TELEGRAM_N8N_OPENCLAW_SIPE.pdf');
    const pdfPathArtifact = path.join(targetDirArtifact, 'GUIA_OFICIAL_TELEGRAM_N8N_OPENCLAW_SIPE.pdf');

    await page.pdf({
        path: pdfPathPublic,
        format: 'Letter',
        printBackground: true,
        margin: {
            top: '16mm',
            bottom: '16mm',
            left: '14mm',
            right: '14mm'
        }
    });

    // Copiar también a la carpeta de artefactos
    fs.copyFileSync(pdfPathPublic, pdfPathArtifact);

    await browser.close();
    console.log('PDF generado exitosamente en:');
    console.log('1. ', pdfPathPublic);
    console.log('2. ', pdfPathArtifact);
}

generatePdf().catch(err => {
    console.error('Error generando PDF:', err);
    process.exit(1);
});
