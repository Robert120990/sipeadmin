export const OPERACIONES_TUTORIALS = [
    {
        id: 'op-pedidos-combustible',
        category: 'operaciones',
        title: 'Pedidos de Combustible (Portal Puma, Programación y Multiparada)',
        subtitle: 'Domina las 4 pestañas operativas: Portal Energy-Latam, cálculo de autonomía, viajes compartidos, precios y conciliación de pagos.',
        route: '/dashboard/operaciones/pedidos',
        routeLabel: 'Pedidos Combustible',
        coverImage: '/tutorials/op-pedidos-portal.webp',
        difficulty: 'Avanzado',
        duration: '12 min',
        role: 'Jefe de Operaciones / Despacho / Gerencia',
        tags: ['puma', 'portal', 'pedidos', 'combustible', 'pipa', 'multiparada', 'precios', '2fa', 'autonomia', 'diesel', 'regular', 'super', 'ion'],
        objective: 'Planificar y despachar pedidos de combustible sin riesgo de desabasto ni sobrellenado de tanques, manteniendo sincronizados los pedidos, precios y pagos del Portal Puma.',
        prerequisites: [
            { label: 'Tener registrados Transportistas y Pipas con sus compartimientos exactos', route: '/dashboard/tankers', routeLabel: 'Catálogo de Pipas' },
            { label: 'Contar con cuentas bancarias activas para vincular pagos', route: '/dashboard/bancos/cuentas', routeLabel: 'Cuentas Bancarias' },
            { label: 'Credenciales vigentes del Portal Energy-Latam / Puma configuradas en Diagnóstico', route: '/dashboard/operaciones/pedidos', routeLabel: 'Pedidos Combustible' }
        ],
        flowSteps: [
            '1. Revisar Semáforo de Tanques',
            '2. Programar Pipa (Simple o Multiparada)',
            '3. Sincronizar Portal Puma',
            '4. Actualizar Precios Vigentes',
            '5. Vincular Pago y Alistar Conciliación'
        ],
        steps: [
            {
                title: 'Revisar la pestaña "Portal Puma" y validar el estado de cuenta',
                location: 'Operaciones → Pedidos Combustible → Pestaña "Portal Puma"',
                summary: 'Verifica saldo disponible, límite de crédito y la fecha/hora de la última sincronización antes de ordenar.',
                instructions: [
                    'Al abrir el módulo verás la pestaña "Portal Puma" activa por defecto con las tarjetas superiores de Saldo Disponible, Límite de Crédito y % Disponible.',
                    'Revisa la marca de "Última sincronización". Si necesitas datos al instante, pulsa el botón de sincronizar con el portal (la sincronización automática también corre cada 30 minutos).',
                    'Usa los filtros compactos de Estación, Estado, Tipo de Producto, Estado de Pago y Búsqueda para localizar cualquier número de orden.',
                    'Si la sincronización reporta sesión vencida o solicitud de código, abre el botón de "Diagnóstico / Credenciales" para ingresar el código 2FA o actualizar usuario y contraseña del portal.'
                ],
                verify: 'Confirmas que el saldo de crédito disponible cubre el costo estimado del nuevo pedido y que no existe ya una orden duplicada en camino para la misma estación.',
                tip: 'Puedes ordenar las columnas de la tabla (Fecha, Monto, Estación) haciendo clic directamente en los encabezados, y cambiar el método de pago o cuenta bancaria en línea sin abrir modales.',
                warning: 'Nunca dupliques un pedido sin revisar antes las órdenes ya registradas en el portal ni el saldo de crédito disponible.',
                screenshot: {
                    src: '/tutorials/op-pedidos-portal.webp',
                    caption: 'Pestaña Portal Puma con Fondos Disponibles, Límite de Crédito, última sincronización automática y filtros rápidos de órdenes.'
                }
            },
            {
                title: 'Analizar la Matriz de Autonomía en la pestaña "Pedidos Programados"',
                location: 'Operaciones → Pedidos Combustible → Pestaña "Programados / Nuevo Pedido"',
                summary: 'Evalúa el inventario actual, el promedio diario de venta y los días de duración de cada producto (D, R, S, I).',
                instructions: [
                    'Cambia a la pestaña de "Programación / Pedidos Programados" y selecciona la Estación principal.',
                    'Verifica la Fecha de Consulta y Turno cargados desde el servidor para asegurar que estás viendo la lectura de tanques más reciente.',
                    'Lee el Semáforo de Días por producto (Diésel, Regular, Súper, Diésel Ion): Rojo (< 2 días = Crítico), Ámbar (2 a 4 días = Alerta), Verde (> 4 días = Óptimo).',
                    'Verifica la fila "NIVEL TANQUE": cualquier valor superior al 100% aparece en alerta roja de "Sobrellenado" — jamás programes galones que excedan la capacidad útil disponible.'
                ],
                verify: 'Identificas exactamente cuántos galones caben por producto (Capacidad - Inventario Actual - Programados previos) y qué combustible tiene menor autonomía en días.',
                tip: 'Haz clic sobre el promedio de venta para abrir el modal de detalle y revisar cómo se calculó el consumo diario de esa estación.',
                warning: 'Ignorar la alerta de "> 100% Sobrellenado" puede provocar derrames en pista o rechazos de cisterna al llegar a la estación.',
                screenshot: {
                    src: '/tutorials/op-pedidos-programados-tab.webp',
                    caption: 'Pestaña Pedidos Programados & Despacho con formulario de transporte/pipa, Sugerir Pedido (IA) y matriz de autonomía por producto.'
                }
            },
            {
                title: 'Seleccionar Transportista, Pipa y usar la Sugerencia Automática',
                location: 'Formulario de Programación de Pedido → Transportista / Pipa / Compartimientos',
                summary: 'Asigna la cisterna óptima respetando la capacidad exacta de cada compartimiento.',
                instructions: [
                    'Define la Fecha del Pedido (por defecto apunta al día operativo siguiente).',
                    'Selecciona el Transportista y luego la Pipa. El sistema mostrará la capacidad total y el desglose de compartimientos.',
                    'Para agilizar el cálculo, presiona el botón "Auto-sugerir" (Sugerencia Automática): el algoritmo prioriza los productos con menor duración en días y ajusta los compartimientos disponibles sin sobrepasar el 100% de llenado.',
                    'Mantén activa la casilla "Previsualizar" para observar en tiempo real cómo cambia el Nivel de Tanque y la nueva Fecha de Duración proyectada al teclear galones en D, R, S o I.'
                ],
                verify: 'La suma de galones ingresados coincide exactamente con los compartimientos de la pipa seleccionada y ningún tanque supera el 100% de nivel proyectado.',
                tip: 'Si necesitas dividir una sola pipa entre dos estaciones cercanas, activa el interruptor "Viaje Compartido (Multiparada)", elige la Estación 2 y reparte los compartimientos entre Estación 1 y Estación 2.'
            },
            {
                title: 'Confirmar el Pedido y registrar costos proyectados',
                location: 'Botón Guardar / Confirmar Pedido → Modal de Confirmación',
                summary: 'Formaliza el pedido con número de orden, forma de pago y costos por galón.',
                instructions: [
                    'Una vez validados los volúmenes por producto (y de ambas estaciones si es Multiparada), pulsa Guardar / Confirmar Pedido.',
                    'En el modal de confirmación, ingresa el Número de Pedido, la Forma de Pago acordada y verifica los costos unitarios (D, R, S, I).',
                    'Guarda para que el pedido pase a la lista de Pedidos Programados activos y se refleje inmediatamente en el consolidado general.'
                ],
                verify: 'El pedido aparece en la tabla inferior de Pedidos Programados y las columnas de duración proyectada se actualizan en verde.',
                tip: 'Al terminar una programación compleja, usa el botón "Limpiar" antes de empezar otra estación para evitar arrastrar datos de multiparada.'
            },
            {
                title: 'Actualizar Precios de Combustible y ajustar costos en órdenes',
                location: 'Pestaña "Precios Combustible" y botón "Ajustar Costos"',
                summary: 'Mantén actualizados los precios quincenales de referencia (DGEHM / Energy-Latam) para costear bien los pedidos.',
                instructions: [
                    'Cuando entre en vigencia una nueva quincena de precios, abre la pestaña "Precios Combustible" y pulsa "Nuevo Precio".',
                    'Ingresa Periodo Inicio, Periodo Fin, los precios de Diésel, Regular, Súper e Ion, y sus variaciones.',
                    'Deja marcada la opción "Aplicar a pedidos pendientes" si deseas recalcular automáticamente las órdenes del portal aún sin liquidar.',
                    'Si una orden específica tuvo un costo distinto en factura, usa la acción "Ajustar Costos" en su fila dentro de la pestaña Portal Puma.'
                ],
                verify: 'La tabla de precios muestra el periodo vigente activo y los montos totales de los pedidos pendientes coinciden con la tarifa real.',
                screenshot: {
                    src: '/tutorials/op-pedidos-precios.webp',
                    caption: 'Pestaña Precios Quincenales con historial de precios DGEHM / Energy-Latam y variaciones por combustible.'
                }
            },
            {
                title: 'Vincular Pago y dejar listo para Conciliación Bancaria',
                location: 'Pestaña "Portal Puma" / Pestaña "Conciliación" → Botón "Vincular Pago"',
                summary: 'Cierra el ciclo financiero del pedido registrando la cuenta bancaria, referencia y monto pagado.',
                instructions: [
                    'En la fila de la orden del portal, haz clic en "Vincular Pago" (o edita el método de pago y cuenta bancaria directamente en la fila).',
                    'Selecciona la Cuenta Bancaria (mostrada en formato estándar [BANCO] Nombre - (Número)), Tipo de Pago (Transferencia, Cheque, etc.), Referencia de Pago, Fecha de Pago y Monto Pagado.',
                    'Mantén marcada la opción "Alistar para Conciliación" para que aparezca en la pestaña "Conciliación" y pueda cruzarse en el módulo Bancos.',
                    'Guarda los cambios y revisa la pestaña "Conciliación" para confirmar que el estado cambió a PAGADO o PARCIAL.'
                ],
                verify: 'La orden cambia a estado PAGADO, muestra la cuenta bancaria y referencia correctas, y figura lista para conciliación bancaria.',
                warning: 'Si realizaste un pago parcial, digita exactamente el monto transferido; el sistema marcará el pedido como PARCIAL para controlar el saldo restante.'
            }
        ],
        successChecklist: [
            'Se revisó el saldo disponible en Portal Puma antes de despachar.',
            'Ningún tanque excede el 100% de nivel proyectado con el pedido cargado.',
            'Los galones por producto coinciden con los compartimientos físicos de la pipa.',
            'Los precios quincenales vigentes están aplicados correctamente.',
            'El pago quedó vinculado con su cuenta bancaria y referencia para conciliación.'
        ],
        troubleshooting: [
            {
                symptom: 'El botón "Auto-sugerir" dice que el transportista no tiene pipas.',
                cause: 'El transportista seleccionado no tiene unidades asociadas en el catálogo de Pipas.',
                solution: 'Ve a Catálogos → Pipas, crea o edita la pipa y asígnale el transportista y sus compartimientos.'
            },
            {
                symptom: 'La sincronización del Portal Puma falla o pide verificación.',
                cause: 'La sesión del portal Energy-Latam expiró o solicitó autenticación de dos factores (2FA).',
                solution: 'Haz clic en "Diagnóstico Portal", ingresa el código 2FA recibido o actualiza las credenciales y vuelve a sincronizar.'
            },
            {
                symptom: 'Un producto aparece con badge rojo "> 100% Sobrellenado".',
                cause: 'La suma de inventario actual + pedidos previos + nuevo pedido excede la capacidad física del tanque.',
                solution: 'Reduce los galones de ese producto o activa "Viaje Compartido" para enviar el excedente a una segunda estación.'
            }
        ]
    },
    {
        id: 'op-pedidos-programados',
        category: 'operaciones',
        title: 'Pedidos Programados y Autonomía Consolidada de Red',
        subtitle: 'Supervisa de un solo vistazo la autonomía de todas las estaciones, detecta alertas menores a 2 días y genera el reporte PDF Carta.',
        route: '/dashboard/operaciones/pedidos-programados',
        routeLabel: 'Pedidos Programados',
        coverImage: '/tutorials/op-pedidos-programados-consolidado.webp',
        difficulty: 'Esencial',
        duration: '5 min',
        role: 'Operaciones / Gerencia / Supervisores de Estación',
        tags: ['programados', 'consolidado', 'autonomia', 'tanques', 'pdf', 'excel', 'alertas', 'dias'],
        objective: 'Monitorear cada mañana la autonomía en días de todas las estaciones de la red para priorizar qué estación requiere abastecimiento urgente.',
        prerequisites: [
            { label: 'Lecturas y cierres de pista actualizados en el servidor RRS', route: '/dashboard/consultas/estaciones/resumen-cierre', routeLabel: 'Resumen de Cierre' }
        ],
        flowSteps: [
            '1. Validar Fecha Servidor y Corte',
            '2. Revisar Tarjetas KPI',
            '3. Identificar Estaciones < 2 Días',
            '4. Inspeccionar Detalle por Estación',
            '5. Exportar Excel o Imprimir PDF Carta'
        ],
        steps: [
            {
                title: 'Verificar la Fecha de Servidor y el Corte de Lecturas',
                location: 'Encabezado superior derecho de Pedidos Programados',
                summary: 'Confirma que la tabla refleja las lecturas más recientes antes de tomar decisiones de compra.',
                instructions: [
                    'Revisa la etiqueta informativa en la barra superior: "Fecha Servidor" y "Corte Lecturas".',
                    'Si necesitas refrescar tras haber programado un nuevo pedido en otra pestaña, haz clic en el botón "Actualizar".'
                ],
                verify: 'La fecha de corte corresponde al último cierre operativo registrado y el spinner de carga terminó.'
            },
            {
                title: 'Evaluar las 4 Tarjetas KPI y detectar alertas críticas',
                location: 'Zona superior de KPIs',
                summary: 'Revisa el volumen total programado, entregas activas y cuántas estaciones están en riesgo de quiebre de stock.',
                instructions: [
                    'Revisa "Total Galones Programados" y "Pedidos Pendientes" para conocer el volumen comprometido del día.',
                    'Presta máxima atención a la tarjeta "Estaciones en Alerta (<2d)". Si el número está en rojo (> 0), hay al menos una estación con menos de 2 días de autonomía en Diésel, Regular o Súper.'
                ],
                verify: 'Tienes claridad inmediata de cuántas estaciones requieren pedido urgente hoy.'
            },
            {
                title: 'Interpretar la tabla consolidada (Galones, D.D./D.I./D.R./D.S. y Fechas)',
                location: 'Tabla Consolidada de Pedidos Programados',
                summary: 'Lee el semáforo por producto y las fechas estimadas de agotamiento de cada estación.',
                instructions: [
                    'Las columnas con fondo crema muestran los galones ya programados por producto (Diésel, Diésel Ion, Regular, Súper).',
                    'Las columnas D.D., D.I., D.R. y D.S. indican los Días de Duración proyectados: Rojo sólido (<= 0 días = Sin stock), Rojo suave (< 2 días = Crítico), Ámbar (2 a 4 días = Programar pronto), Verde (>= 4 días = Seguro).',
                    'Las columnas de la derecha indican la fecha exacta proyectada en la que se agotará cada combustible.',
                    'Haz clic sobre cualquier fila de Estación para abrir el modal de detalle completo con sus entregas pendientes y saltar directo a programar un pedido.'
                ],
                verify: 'Identificas las estaciones prioritarias y confirmas si ya cuentan o no con un pedido programado en tránsito.',
                tip: 'Usa esta pantalla como tu punto de partida diario a las 7:00 AM antes de entrar a Pedidos Combustible.',
                screenshot: {
                    src: '/tutorials/op-pedidos-programados-consolidado.webp',
                    caption: 'Tablero consolidado de Pedidos Programados con KPIs de alertas (<2 días), galones programados y semáforo de duración por estación.'
                }
            },
            {
                title: 'Exportar a Excel o imprimir reporte oficial en PDF Carta',
                location: 'Botones "Excel" y "Vista Previa / Imprimir"',
                summary: 'Comparte el consolidado con gerencia o logística en formato tabular o PDF tamaño Carta horizontal.',
                instructions: [
                    'Pulsa "Excel" para descargar el archivo Pedidos_Programados_Consolidado con la fila de TOTAL GENERAL lista para análisis.',
                    'Pulsa "Vista Previa / Imprimir" para generar el PDF tamaño Carta horizontal y revisarlo dentro de ReportPreviewModal antes de imprimir o descargar.'
                ],
                verify: 'El modal de vista previa muestra todas las estaciones legibles, con sus totales al pie y numeración de páginas.'
            }
        ],
        successChecklist: [
            'Se verificó que no queden estaciones con duración < 2 días sin pedido programado.',
            'Se validó la fecha de corte de lecturas del servidor.',
            'Se compartió o archivó el reporte consolidado si corresponde a junta operativa.'
        ],
        troubleshooting: [
            {
                symptom: 'Una estación muestra duración en 0.0 días pese a tener combustible.',
                cause: 'Faltan lecturas de cierre recientes en RRS o el promedio de venta no se ha actualizado.',
                solution: 'Verifica en Consultas → Resumen de Cierre si el último turno fue cerrado y pulsa "Actualizar".'
            }
        ]
    },
    {
        id: 'op-consulta-pedidos',
        category: 'operaciones',
        title: 'Consulta y Recepción de Pedidos en RRS (Visto → Recibir)',
        subtitle: 'Confirma el arribo de cisternas, registra galones descargados, costos, flete, NCR/cupones y emite el pago por Cheque o Transferencia.',
        route: '/dashboard/operaciones/consulta-pedidos',
        routeLabel: 'Consulta de Pedidos',
        coverImage: '/tutorials/op-consulta-pedidos.webp',
        difficulty: 'Intermedio',
        duration: '10 min',
        role: 'Operaciones / Contabilidad / Recepción de Combustible',
        tags: ['rrs', 'recibir', 'visto', 'descarga', 'ccf', 'cheque', 'transferencia', 'flete', 'ncr', 'cupones'],
        objective: 'Completar el ciclo de vida de un pedido en RRS desde PENDIENTE hasta RECIBIDO, asegurando que la descarga real, el CCF y el pago bancario queden perfectamente cuadrados.',
        prerequisites: [
            { label: 'Pedido previamente creado y visible en RRS', route: '/dashboard/operaciones/pedidos', routeLabel: 'Pedidos Combustible' },
            { label: 'Factura / CCF del proveedor y comprobante de descarga física en mano' },
            { label: 'Número de cheque emitido o referencia de transferencia bancaria lista' }
        ],
        flowSteps: [
            '1. Filtrar Pendientes / Vistos',
            '2. Marcar Pedido como VISTO',
            '3. Elegir Método (Cheque o Transferencia)',
            '4. Capturar Descarga, CCF, Costos y NCR',
            '5. Registrar Pago y Confirmar RECIBIDO'
        ],
        steps: [
            {
                title: 'Localizar el pedido usando pestañas de estado y filtros',
                location: 'Operaciones → Consulta de Pedidos → Barra de Filtros',
                summary: 'Filtra rápidamente por estado, estación, rango de fechas o número de pedido/documento.',
                instructions: [
                    'Usa el selector superior de pestañas: "Pendientes / Vistos" (por defecto), "Recibidos" o "Todos".',
                    'Si buscas una estación específica, selecciónala en el desplegable de Estaciones o escribe el número de pedido, documento o referencia en el buscador.',
                    'Revisa las 5 tarjetas KPI superiores para confirmar el volumen total en galones por combustible (Diésel, Regular, Súper, Ion).'
                ],
                verify: 'El pedido objetivo aparece listado con su número, estación, fecha y galones solicitados.',
                screenshot: {
                    src: '/tutorials/op-consulta-pedidos.webp',
                    caption: 'Consulta de Pedidos en RRS con pestañas Pendientes/Vistos, KPIs por combustible y botones del flujo Visto → Recibir.'
                }
            },
            {
                title: 'Paso obligatorio: Marcar el pedido como "VISTO"',
                location: 'Columna Acciones → Botón azul "Visto"',
                summary: 'Acusa de recibido el pedido en RRS para habilitar el botón de recepción y descarga.',
                instructions: [
                    'Si el pedido está en estado PENDIENTE, haz clic en el botón "Visto" (icono de ojo).',
                    'Confirma en el cuadro de diálogo. El sistema actualizará el estado del pedido en RRS a VISTO.',
                    'Opcionalmente, haz clic en el icono de documento (Ver detalle) para inspeccionar toda la ficha del pedido antes de procesarlo.'
                ],
                verify: 'El badge del pedido cambia a VISTO y en la columna de acciones aparece el botón verde "Recibir".',
                tip: 'Este paso evita que se descarguen accidentalmente pedidos que aún no han sido revisados por oficina.'
            },
            {
                title: 'Iniciar Recepción y elegir la modalidad de pago (Cheque o Transferencia)',
                location: 'Columna Acciones → Botón verde "Recibir"',
                summary: 'Define si el pago de la pipa se liquidará mediante uno o varios cheques o por transferencia bancaria.',
                instructions: [
                    'Haz clic en el botón verde "Recibir" en la fila del pedido en estado VISTO.',
                    'En el selector de modalidad, escoge "CHEQUE" o "TRANSFERENCIA" según cómo se liquidó el pedido.',
                    'Se abrirá el modal completo de Recepción de Pedido con los galones pedidos precargados como base.'
                ],
                verify: 'El modal de recepción carga correctamente la lista de bancos y cuentas bancarias activas desde RRS.'
            },
            {
                title: 'Capturar Fecha de Descarga, CCF, Galones Reales, Costos, Flete y Descuentos',
                location: 'Modal de Recepción → Sección Datos de Descarga y Costos',
                summary: 'Registra las cantidades reales recibidas en tanque y el valor exacto del Comprobante de Crédito Fiscal.',
                instructions: [
                    'Verifica o ajusta la "Fecha de Descarga" y escribe el número exacto de "Documento / CCF".',
                    'Confirma los galones recibidos (r_diesel, r_regular, r_super, r_ion) contra la guía de remisión y factura.',
                    'Ingresa o verifica el costo unitario por producto y el valor del "Flete" por galón.',
                    'Si aplica Nota de Crédito (NCR) o Cupones, ingresa el Número de NCR, Monto NCR y Monto de Cupones; el sistema recalcula automáticamente el Total Neto a Pagar.'
                ],
                verify: 'El monto neto calculado por el sistema coincide exactamente al centavo con el valor a pagar de la factura/CCF menos NCR y cupones.',
                warning: 'Un error en el número de CCF o en el costo unitario afectará directamente los márgenes y reportes de rentabilidad por estación.'
            },
            {
                title: 'Vincular el Pago (Cheques o Transferencia) y confirmar la recepción',
                location: 'Modal de Recepción → Sección Pago',
                summary: 'Amarra el comprobante bancario al pedido para dejar trazabilidad total entre Operaciones y Bancos.',
                instructions: [
                    'Si elegiste CHEQUE: selecciona Banco, Cuenta Bancaria, ingresa el Número de Cheque, Valor y Concepto (se sugiere automáticamente "PAGO DE PIPA CCF# ..."). Puedes agregar múltiples cheques si el pago se dividió en más de uno.',
                    'Si elegiste TRANSFERENCIA: selecciona Banco y Cuenta Bancaria, escribe la Referencia bancaria, Fecha de Pago, Monto y Concepto.',
                    'Revisa que la suma del pago cubra el total neto del pedido y haz clic en Confirmar / Guardar Recepción.'
                ],
                verify: 'Recibes la confirmación de éxito, el pedido desaparece de "Pendientes / Vistos" y aparece bajo la pestaña "Recibidos" con su referencia de pago registrada.',
                tip: 'Si necesitas consultar pedidos antiguos ya liquidados, cambia la pestaña superior a "Recibidos" y filtra por rango de fechas.'
            }
        ],
        successChecklist: [
            'El pedido pasó correctamente por PENDIENTE → VISTO → RECIBIDO.',
            'Los galones recibidos, costos unitarios y flete coinciden con el CCF físico.',
            'Las Notas de Crédito (NCR) y cupones (si hubo) fueron descontados.',
            'El cheque o referencia de transferencia quedó vinculado con la cuenta bancaria exacta.'
        ],
        troubleshooting: [
            {
                symptom: 'No aparece el botón verde "Recibir" en la fila del pedido.',
                cause: 'El pedido todavía está en estado PENDIENTE.',
                solution: 'Primero pulsa el botón "Visto" y confirma; inmediatamente se habilitará el botón "Recibir".'
            },
            {
                symptom: 'Al abrir el modal de recepción aparece error al cargar cuentas bancarias de RRS.',
                cause: 'Fallo temporal de conexión con la base externa RRS.',
                solution: 'Verifica la conexión externa en Configuración → Conexión Externa o pulsa el botón de reintentar dentro del modal.'
            }
        ]
    },
    {
        id: 'op-control-pagos',
        category: 'operaciones',
        title: 'Control de Pagos y Recordatorios (Abonos, OCR IA y MiBot)',
        subtitle: 'Administra vencimientos CXP/CXC/Gastos, sube comprobantes con lectura automática OCR IA, programa alertas Telegram y alimenta Conciliación Bancaria.',
        route: '/dashboard/operaciones/recordatorios',
        routeLabel: 'Control de Pagos',
        coverImage: '/tutorials/op-control-pagos.webp',
        difficulty: 'Intermedio',
        duration: '12 min',
        role: 'Tesorería / Administración / Contabilidad / Gerencia',
        tags: ['pagos', 'recordatorios', 'abonos', 'ocr', 'ia', 'comprobantes', 'cxp', 'cxc', 'mibot', 'telegram', 'pdf', 'excel'],
        objective: 'Controlar el 100% de obligaciones y cobros programados sin atrasos, respaldar cada pago con su comprobante digital y enviarlo automáticamente como sugerencia a Conciliación Bancaria.',
        prerequisites: [
            { label: 'Cuentas bancarias activas para elegir el origen del pago', route: '/dashboard/bancos/cuentas', routeLabel: 'Cuentas Bancarias' },
            { label: 'Opcional: Usuarios vinculados en Telegram para enviar alertas MiBot', route: '/dashboard/seguridad/telegram', routeLabel: 'Usuarios de Telegram' }
        ],
        flowSteps: [
            '1. Filtrar Periodo y Estado',
            '2. Crear Recordatorio (Único o Recurrente)',
            '3. Abrir Modal de Pagos / Abonos',
            '4. Subir Comprobante (OCR IA Auto-llena)',
            '5. Programar Aviso MiBot (Opcional)',
            '6. Conciliar Sugerencia en Bancos'
        ],
        steps: [
            {
                title: 'Dominar los filtros dinámicos, búsqueda rápida y ordenamiento',
                location: 'Operaciones → Control de Pagos → Barra Superior y Filtros por Columna',
                summary: 'Encuentra cualquier pago pendiente, parcial o cancelado en segundos.',
                instructions: [
                    'Define el rango "Desde" / "Hasta" (por defecto carga desde el 1° del mes actual hasta hoy) y el filtro de Estado (Todos, Pendientes, Cancelados).',
                    'Usa la caja de Búsqueda Rápida para escribir varias palabras a la vez (ej. "andelsa bac 500") y filtrar instantáneamente por ubicación, descripción, forma de pago o monto.',
                    'Aprovecha los filtros individuales por columna (ID, Ubicación, Descripción, Vence, Observación, Monto, Forma de Pago, Estado) y haz clic en cualquier encabezado para ordenar ascendente o descendentemente.',
                    'Si buscas un recordatorio recurrente completo (todas sus cuotas históricas y futuras), abre la "Matriz / Buscar Padre" para ver todas las cuotas vinculadas.'
                ],
                verify: 'La tabla muestra únicamente los vencimientos que necesitas trabajar y el total acumulado en pantalla refleja exactamente las filas filtradas.',
                screenshot: {
                    src: '/tutorials/op-control-pagos.webp',
                    caption: 'Control de Pagos con búsqueda rápida multi-palabra, filtros individuales por columna, totales y acceso a Asistente IA / MiBot.'
                }
            },
            {
                title: 'Crear un nuevo Recordatorio o Compromiso Recurrente',
                location: 'Botón "Nuevo Recordatorio" (+)',
                summary: 'Registra pagos únicos o series mensuales/quincenales/anuales con su ubicación y monto.',
                instructions: [
                    'Haz clic en "Nuevo Recordatorio" y llena: Descripción clara del compromiso, Ubicación/Estación, Fecha de Inicio y Monto.',
                    'En "Repetir" y frecuencia (VEZ, MENSUAL, QUINCENAL, etc.), indica cuántas cuotas se generarán automáticamente (ej. 12 cuotas mensuales para un contrato de renta o servicio).',
                    'Opcionalmente, pre-asigna la Forma de Pago sugerida escribiendo el banco o estación (el autocompletado inteligente sugiere las cuentas reales en formato [BANCO] Nombre - (Número)).',
                    'Si deseas programar de una vez un aviso por Telegram al responsable, marca la casilla "Abrir MiBot al crear" antes de guardar.'
                ],
                verify: 'Se generan los vencimientos en el calendario y aparecen en la tabla principal con estado PENDIENTE.'
            },
            {
                title: 'Registrar un Pago o Abono Parcial con Lectura OCR IA de Comprobantes',
                location: 'Fila del vencimiento → Botón de Pagos / Abonos (Popup completo)',
                summary: 'Ahorra tiempo y elimina errores de digitación dejando que la IA lea el comprobante bancario.',
                instructions: [
                    'Haz clic en el botón de gestión de pagos/abonos de la fila para abrir el Modal completo de Control de Pagos.',
                    'Verifica el Tipo de Operación: CXP (Por Pagar - Egreso), CXC (Por Cobrar - Ingreso) o GASTO (Gasto Operativo), ya que esto alimenta el Flujo de Caja Predictivo.',
                    'Arrastra una foto/captura/PDF del comprobante bancario a la zona de carga, tómale foto desde móvil o simplemente pégalo con Ctrl + V.',
                    'Con la opción "Auto-OCR IA" activa, el sistema leerá el comprobante y llenará automáticamente: Método de Pago (Transferencia, Cheque, Tarjeta, Efectivo, etc.), Cuenta Bancaria coincidente, Monto, Fecha de Pago, Beneficiario y Número de Referencia.',
                    'Revisa que los datos extraídos sean correctos. Si es un pago parcial, ajusta el campo "Monto Abono"; el sistema mantendrá el vencimiento en estado PARCIAL mostrando el saldo pendiente exacto.',
                    'Pulsa Guardar Abono.'
                ],
                verify: 'El comprobante queda adjunto con visor lightbox, el abono aparece en el historial del vencimiento y el estado cambia a PARCIAL o CANCELADO.',
                tip: 'También puedes editar rápidamente la Forma de Pago o la Observación directamente en la tabla principal haciendo clic sobre la celda (edición en línea).',
                warning: 'Verifica siempre la Cuenta Bancaria seleccionada cuando pagues por Transferencia o Cheque; esa cuenta determina en qué conciliación bancaria aparecerá la sugerencia automática.',
                screenshot: {
                    src: '/tutorials/op-control-pagos-modal.webp',
                    caption: 'Modal completo de Pagos y Abonos con lectura OCR IA de comprobantes, clasificación CXP/CXC/GASTO y control de saldo pendiente.'
                }
            },
            {
                title: 'Usar el Asistente IA integrado y programar recordatorios en MiBot Telegram',
                location: 'Botón "Asistente IA" y Botón de Campana / Bot (MiBot)',
                summary: 'Consulta tus pagos en lenguaje natural y envía alertas puntuales a Telegram para evitar moras.',
                instructions: [
                    'Abre el chat del "Asistente IA de Pagos" para preguntar o filtrar rápidamente vencimientos próximos sin armar filtros manuales.',
                    'En cualquier fila pendiente (o dentro del modal de pagos), haz clic en el icono de MiBot para programar un recordatorio a uno o varios usuarios vinculados de Telegram (envío inmediato, fecha/hora puntual o recurrente).'
                ],
                verify: 'El aviso queda programado y visible en el historial de MiBot con su estado de entrega.'
            },
            {
                title: 'Exportar reportes y cerrar el puente con Conciliación Bancaria',
                location: 'Botones Excel / Imprimir PDF Carta y módulo Bancos → Conciliación',
                summary: 'Genera respaldos ejecutivos y confirma que cada pago bancario se refleje en bancos.',
                instructions: [
                    'Usa "Excel" o "Vista Previa / Imprimir" (abre ReportPreviewModal en tamaño Carta) para entregar el listado de pagos programados o cancelados.',
                    'Recuerda: cada abono bancario registrado aquí aparecerá automáticamente en Bancos → Conciliación Bancaria → pestaña "CONTROL PAGOS", listo para vincular o crear el movimiento con un clic.'
                ],
                verify: 'Tus pagos quedan respaldados con comprobante digital, reflejados en Flujo de Caja y listos para conciliar en Bancos.'
            }
        ],
        successChecklist: [
            'Cada vencimiento tiene clasificado correctamente su tipo (CXP, CXC o GASTO).',
            'Todos los pagos realizados cuentan con comprobante adjunto y referencia verificada.',
            'Los pagos parciales muestran el saldo pendiente real.',
            'Los pagos desde cuenta bancaria fueron seleccionados con la cuenta exacta para que aparezcan en Conciliación Bancaria.'
        ],
        troubleshooting: [
            {
                symptom: 'El OCR IA no detectó la cuenta bancaria exacta del comprobante.',
                cause: 'El comprobante recortó el número de cuenta o la cuenta no coincide con el formato registrado.',
                solution: 'Selecciona manualmente la cuenta en el selector (ordenado por [BANCO] Nombre - Número) antes de pulsar Guardar.'
            },
            {
                symptom: 'Un pago registrado aquí no aparece en la pestaña CONTROL PAGOS de Conciliación Bancaria.',
                cause: 'El abono se guardó como EFECTIVO o sin cuenta bancaria vinculada.',
                solution: 'Edita el abono en el modal de Control de Pagos, selecciona método bancario (Transferencia/Cheque) y asigna la Cuenta Bancaria.'
            }
        ]
    },
    {
        id: 'op-tareas-kanban',
        category: 'operaciones',
        title: 'Gestión de Tareas (Tablero Kanban, Checklist y MiBot)',
        subtitle: 'Asigna actividades operativas con subtareas, fechas límite, colaboración en tiempo real y recordatorios automáticos por Telegram.',
        route: '/dashboard/operaciones/tareas',
        routeLabel: 'Gestión de Tareas',
        coverImage: '/tutorials/op-tareas-kanban.webp',
        difficulty: 'Esencial',
        duration: '7 min',
        role: 'Todos los colaboradores / Supervisores / Gerencia',
        tags: ['tareas', 'kanban', 'checklist', 'subtareas', 'mibot', 'telegram', 'seguimiento', 'equipo'],
        objective: 'Coordinar pendientes operativos y administrativos de forma visual, transparente y con seguimiento en tiempo real sin perder tareas en chats informales.',
        prerequisites: [
            { label: 'Colaboradores activos en el sistema', route: '/dashboard/users', routeLabel: 'Usuarios' }
        ],
        flowSteps: [
            '1. Crear Tarea con Checklist y Plazo',
            '2. Asignar Responsables y MiBot',
            '3. Mover en Kanban (Arrastrar y Soltar)',
            '4. Comentar Avances en Tiempo Real',
            '5. Revisar y Marcar Completada'
        ],
        steps: [
            {
                title: 'Elegir vista de trabajo (Kanban, Tabla o MiBot) y filtrar pendientes',
                location: 'Operaciones → Gestión de Tareas → Selector de Vistas y Filtros',
                summary: 'Alterna entre tablero visual de columnas, tabla exportable o agenda de envíos MiBot.',
                instructions: [
                    'Revisa las tarjetas KPI superiores: Pendientes, En Proceso, En Revisión, Completadas, Vencidas y Vence Hoy.',
                    'Alterna entre las 3 vistas: "Kanban" (arrastrar y soltar), "Tabla" (vista compacta de lista y exportación a Excel) y "MiBot" (panel de avisos programados por Telegram).',
                    'Usa la casilla "Solo mías" o filtra por Prioridad (Urgente, Alta, Media, Baja), Categoría (Operaciones, Mantenimiento, Administrativo, Finanzas, Sistemas) y Responsable.'
                ],
                verify: 'Visualizas claramente tus tareas prioritarias del día y las alertas de vencimiento.',
                screenshot: {
                    src: '/tutorials/op-tareas-kanban.webp',
                    caption: 'Tablero Kanban de Gestión de Tareas con 4 columnas interactivas, KPIs superiores y vistas Kanban / Tabla / MiBot.'
                }
            },
            {
                title: 'Crear una tarea bien estructurada con subtareas (Checklist) y aviso MiBot',
                location: 'Botón "Nueva Tarea" (+)',
                summary: 'Define un objetivo claro, fecha límite, responsables y pasos verificables.',
                instructions: [
                    'Pulsa "Nueva Tarea" y escribe un Título accionable y una Descripción con el contexto necesario.',
                    'Configura Prioridad, Categoría, Fecha de Vencimiento y Hora Límite (si aplica).',
                    'Selecciona el o los responsables en "Asignar a".',
                    'Agrega elementos en la sección "Checklist / Subtareas" para dividir el trabajo en hitos concretos que el responsable pueda ir marcando.',
                    'Si requiere recordatorio por Telegram, activa la sección MiBot dentro del mismo formulario: elige tipo (TAREA, VALIDACIÓN, REUNIÓN, etc.), destinatarios, y decide si enviarlo de inmediato o programarlo con fecha/hora y frecuencia.'
                ],
                verify: 'La tarjeta aparece en la columna "Pendientes" y el colaborador asignado recibe notificación en tiempo real (y por Telegram si activaste MiBot).'
            },
            {
                title: 'Actualizar progreso mediante Drag & Drop y Comentarios en vivo',
                location: 'Columnas Kanban y Modal de Detalle de Tarea',
                summary: 'Mantén actualizado el flujo de trabajo para que todo el equipo vea el estado real.',
                instructions: [
                    'Arrastra y suelta la tarjeta entre columnas: Pendientes → En Proceso → En Revisión → Completadas (en móvil o vista tabla puedes cambiar el estado desde el detalle).',
                    'Haz clic en una tarjeta para abrir su Detalle: marca las subtareas completadas del Checklist y escribe actualizaciones en el hilo de Comentarios (se sincroniza por Socket.io en tiempo real).',
                    'Cuando la actividad requiera visto bueno de gerencia, déjala en "En Revisión" antes de pasarla a "Completadas".'
                ],
                verify: 'El porcentaje del checklist avanza, el historial de comentarios registra los acuerdos y los KPIs superiores se actualizan automáticamente.',
                tip: 'Usa la pestaña "MiBot" para reenviar al instante un aviso pendiente o filtrar recordatorios por tipo y estado.'
            }
        ],
        successChecklist: [
            'Toda tarea crítica tiene responsable único, fecha de vencimiento y prioridad.',
            'Las tareas complejas incluyen checklist de subtareas.',
            'No quedan tareas terminadas olvidadas en "En Proceso"; se mueven a "Completadas".'
        ],
        troubleshooting: [
            {
                symptom: 'No aparece un colaborador en la lista de destinatarios de MiBot Telegram.',
                cause: 'El usuario aún no ha vinculado su cuenta de Telegram con SIPE Admin.',
                solution: 'Un administrador debe vincularlo en Seguridad → Usuarios de Telegram.'
            }
        ]
    },
    {
        id: 'op-energia-solar-andelsa',
        category: 'operaciones',
        title: 'Energía Solar & Andelsa (Monitoreo Fotovoltaico y Comercial)',
        subtitle: 'Supervisa generación kWh, ahorro en dólares, estado de baterías BESS y las 5 vistas comerciales de Andelsa.',
        route: '/dashboard/operaciones/energia-solar',
        routeLabel: 'Energía Solar & Andelsa',
        coverImage: '/tutorials/op-energia-solar.webp',
        difficulty: 'Esencial',
        duration: '6 min',
        role: 'Operaciones / Gerencia / Administración Andelsa',
        tags: ['solar', 'paneles', 'baterias', 'andelsa', 'san martin', 'ahorro', 'inventarios', 'cxc', 'margenes'],
        objective: 'Evaluar el rendimiento diario y mensual de los sistemas solares (Andelsa y San Martín - La Loma) junto con la salud comercial y cartera de Andelsa.',
        prerequisites: [
            { label: 'Acceso habilitado al módulo Energía Solar & Andelsa' }
        ],
        flowSteps: [
            '1. Filtrar Instalación Solar',
            '2. Revisar Generación, Ahorro y Batería BESS',
            '3. Explorar las 5 Subvistas de Andelsa',
            '4. Generar Reporte PDF Carta'
        ],
        steps: [
            {
                title: 'Monitorear instalaciones solares y estado de baterías (BESS)',
                location: 'Operaciones → Energía Solar & Andelsa → Bloque Solar Superior',
                summary: 'Verifica potencia instalada, generación del día/mes, autoconsumo, ahorro USD y CO2 evitado.',
                instructions: [
                    'Usa el filtro de estación solar para ver el consolidado global o aislar "Andelsa" (paneles 55 kWp + banco de baterías 60 kWh) o "San Martín (La Loma)" (paneles 40 kWp).',
                    'Revisa el porcentaje de carga de batería (SoC %), estado ("EN_LINEA") y horas de autonomía estimadas para Andelsa.',
                    'Compara Generación Día vs Mes y el Ahorro en USD acumulado.'
                ],
                verify: 'Confirmas que ambas instalaciones reportan generación activa y que el banco de baterías de Andelsa opera en línea.',
                screenshot: {
                    src: '/tutorials/op-energia-solar.webp',
                    caption: 'Monitor de Energía Solar & Andelsa mostrando generación kWh, ahorro USD, estado de baterías BESS y pestañas comerciales.'
                }
            },
            {
                title: 'Analizar las 5 subvistas comerciales de Andelsa',
                location: 'Sección Inferior Andelsa → Pestañas de Subvistas y Buscador',
                summary: 'Audita inventario valorizado, márgenes de venta, mejores clientes y cartera por cobrar.',
                instructions: [
                    'Navega entre las 5 pestañas: "Inventarios Valorizados", "Costos y Márgenes", "Top Ventas por Cliente", "Top Ventas por Producto" y "Cuentas por Cobrar (CXC)".',
                    'Utiliza el buscador integrado para filtrar por código de producto, descripción, categoría o nombre de cliente.',
                    'En "Cuentas por Cobrar (CXC)", compara el Saldo Pendiente contra el Límite de Crédito y Días de Crédito de cada cliente.'
                ],
                verify: 'Detectas productos con stock bajo, márgenes anómalos o clientes cercanos a su límite de crédito.'
            },
            {
                title: 'Emitir el reporte oficial en PDF Carta',
                location: 'Botón "Imprimir / Vista Previa PDF"',
                summary: 'Genera un resumen ejecutivo imprimible en tamaño Carta.',
                instructions: [
                    'Pulsa el botón de impresión/reporte en el encabezado.',
                    'Revisa el documento dentro de ReportPreviewModal y descárgalo o imprímelo para junta gerencial.'
                ],
                verify: 'El PDF Carta contiene tanto los indicadores solares como la tabla comercial seleccionada.'
            }
        ],
        successChecklist: [
            'Se revisó el estado de generación y batería BESS de Andelsa.',
            'Se auditaron los inventarios valorizados y saldos CXC de Andelsa.'
        ],
        troubleshooting: [
            {
                symptom: 'La búsqueda no devuelve filas en una subvista.',
                cause: 'El filtro de búsqueda se mantiene activo al cambiar entre pestañas.',
                solution: 'Limpia la caja de búsqueda para ver nuevamente todos los registros de la subvista.'
            }
        ]
    },
    {
        id: 'op-catalogos-flota',
        category: 'operaciones',
        title: 'Catálogos Base: Transportistas y Pipas (Compartimientos)',
        subtitle: 'Configura correctamente la flota y las capacidades por compartimiento para que Pedidos Combustible calcule cargas exactas.',
        route: '/dashboard/tankers',
        routeLabel: 'Catálogo de Pipas',
        coverImage: '/tutorials/op-catalogos-pipas.webp',
        difficulty: 'Esencial',
        duration: '5 min',
        role: 'Operaciones / Logística',
        tags: ['transportistas', 'pipas', 'compartimientos', 'separaciones', 'catalogos', 'cisternas', 'capacidad'],
        objective: 'Mantener actualizada la ficha técnica de cada transportista y cisterna (pipa) con sus compartimientos y separaciones exactas en galones.',
        prerequisites: [
            { label: 'Listado de placas/códigos de cisternas y tabla de aforo oficial por compartimiento' }
        ],
        flowSteps: [
            '1. Crear Transportista (Catálogos → Transportistas)',
            '2. Crear Pipa (Catálogos → Pipas)',
            '3. Definir Compartimientos y Separaciones',
            '4. Validar Capacidad Total Automática'
        ],
        steps: [
            {
                title: 'Registrar el Transportista',
                location: 'Catálogos → Transportistas → Botón "Nuevo Transportista"',
                summary: 'Da de alta la empresa transportista antes de asociarle cisternas.',
                instructions: [
                    'Abre el módulo Transportistas y haz clic en "Nuevo Transportista".',
                    'Ingresa un Código corto único (ej. TR-001) y la Descripción / Nombre oficial de la empresa.',
                    'Haz clic en Guardar. La lista se sincroniza en tiempo real.'
                ],
                verify: 'El transportista aparece en la tabla y queda disponible en los selectores de Pipas y Pedidos Combustible.',
                screenshot: {
                    src: '/tutorials/op-catalogos-transportistas.webp',
                    caption: 'Catálogo de Transportistas con código único y nombre oficial de cada empresa transportista.'
                }
            },
            {
                title: 'Registrar la Pipa con sus Compartimientos y Separaciones',
                location: 'Catálogos → Pipas → Botón "Nueva Pipa"',
                summary: 'Configura la capacidad exacta de cada compartimiento de la cisterna.',
                instructions: [
                    'Abre el módulo Pipas y pulsa "Nueva Pipa".',
                    'Ingresa el Código / Placa de la unidad y selecciona el Transportista propietario.',
                    'Por cada compartimiento físico de la cisterna, agrega el compartimiento ("+") e ingresa la capacidad en galones de su(s) separación(es).',
                    'Si un compartimiento tiene divisiones internas, añade separaciones dentro de ese compartimiento; el sistema sumará la capacidad automáticamente.',
                    'Guarda. Ningún compartimiento puede quedar con capacidad 0.'
                ],
                verify: 'La tabla de Pipas muestra la unidad con su capacidad total correcta y el desglose de compartimientos listo para Auto-sugerir en Pedidos Combustible.',
                warning: 'Si un compartimiento tiene una capacidad mal digitada, el algoritmo de sugerencia automática generará pedidos imposibles de cargar en terminal.',
                screenshot: {
                    src: '/tutorials/op-catalogos-pipas.webp',
                    caption: 'Catálogo de Pipas con capacidad total automática y desglose exacto de compartimientos por unidad.'
                }
            }
        ],
        successChecklist: [
            'Cada transportista activo tiene su código y nombre correcto.',
            'Cada pipa está asignada al transportista correcto.',
            'La suma de compartimientos coincide con la capacidad legal de aforo de la cisterna.'
        ],
        troubleshooting: [
            {
                symptom: 'No puedo guardar la pipa y sale alerta de capacidad mayor a 0.',
                cause: 'Quedó un compartimiento o separación vacía o con valor 0.',
                solution: 'Ingresa la capacidad numérica válida en galones o elimina el compartimiento sobrante con el botón "-".'
            }
        ]
    }
];
