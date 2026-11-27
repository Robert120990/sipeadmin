export const FLUJOS_MAESTROS_TUTORIALS = [
    {
        id: 'flujo-ciclo-combustible',
        category: 'flujos',
        title: 'Flujo Maestro 1: Ciclo Completo de Combustible (De Tanque a Banco)',
        subtitle: 'Receta paso a paso de principio a fin: detecta autonomía crítica, programa la pipa, sincroniza Portal Puma, recibe en RRS y concilia en Bancos.',
        route: '/dashboard/operaciones/pedidos-programados',
        routeLabel: 'Iniciar en Pedidos Programados',
        difficulty: 'Intermedio',
        duration: '15 min',
        role: 'Operaciones + Tesorería + Contabilidad',
        tags: ['flujo maestro', 'end to end', 'combustible', 'abastecimiento', 'puma', 'rrs', 'conciliacion', 'exito'],
        objective: 'Ejecutar sin brechas el ciclo integral de abastecimiento de combustible conectando los 4 módulos involucrados hasta dejar el pago conciliado en Bancos.',
        prerequisites: [
            { label: 'Catálogo de Transportistas y Pipas actualizado', route: '/dashboard/tankers', routeLabel: 'Pipas' },
            { label: 'Saldos en Chequera verificados antes de ordenar', route: '/dashboard/bancos/reportes/saldos-chequera', routeLabel: 'Saldos Chequera' }
        ],
        flowSteps: [
            '1. Pedidos Programados (Detectar < 2 días)',
            '2. Pedidos Combustible (Programar Pipa / Multiparada)',
            '3. Portal Puma (Confirmar Orden y Vincular Pago)',
            '4. Consulta de Pedidos (Visto → Recibir con CCF)',
            '5. Conciliación Bancaria (Aplicar Cobro)'
        ],
        steps: [
            {
                title: 'Paso 1 · Diagnóstico Matutino en "Pedidos Programados"',
                location: 'Operaciones → Pedidos Programados',
                route: '/dashboard/operaciones/pedidos-programados',
                routeLabel: 'Abrir Pedidos Programados',
                summary: 'Identifica en 60 segundos qué estaciones tienen menos de 2 días de autonomía.',
                instructions: [
                    'Revisa la tarjeta "Estaciones en Alerta (<2d)" y las columnas D.D., D.I., D.R. y D.S.',
                    'Haz clic en las estaciones en rojo o ámbar para confirmar si ya tienen entregas programadas en camino.',
                    'Anota las estaciones prioritarias del día.'
                ],
                verify: 'Tienes la lista exacta de estaciones que necesitan cisterna hoy o mañana.'
            },
            {
                title: 'Paso 2 · Verificar Liquidez en "Saldos en Chequera"',
                location: 'Bancos → Reportes → Saldos en Chequera',
                route: '/dashboard/bancos/reportes/saldos-chequera',
                routeLabel: 'Abrir Saldos en Chequera',
                summary: 'Confirma fondos reales disponibles (descontando cheques en circulación) antes de emitir la orden.',
                instructions: [
                    'Consulta el saldo real disponible en la cuenta bancaria que financiará la pipa.',
                    'Verifica además el crédito disponible en la pestaña Portal Puma de Pedidos Combustible.'
                ],
                verify: 'Hay liquidez y crédito suficientes para cubrir la cisterna sin sobregiro.'
            },
            {
                title: 'Paso 3 · Programar la Pipa (Simple o Multiparada) en "Pedidos Combustible"',
                location: 'Operaciones → Pedidos Combustible → Pestaña Programados',
                route: '/dashboard/operaciones/pedidos',
                routeLabel: 'Abrir Pedidos Combustible',
                summary: 'Asigna la cisterna con compartimientos exactos evitando sobrellenado (> 100%).',
                instructions: [
                    'Selecciona Estación, Transportista y Pipa.',
                    'Usa "Auto-sugerir" con "Previsualizar" activo para validar que ningún producto pase del 100% de capacidad del tanque.',
                    'Si sobra capacidad en la cisterna, activa "Viaje Compartido" y asigna la Estación 2.',
                    'Confirma el pedido con costos vigentes.'
                ],
                verify: 'La programación queda guardada y la autonomía proyectada sube a verde (> 4 días).'
            },
            {
                title: 'Paso 4 · Sincronizar Portal Puma y Vincular el Pago',
                location: 'Operaciones → Pedidos Combustible → Pestaña Portal Puma',
                route: '/dashboard/operaciones/pedidos',
                routeLabel: 'Ir a Portal Puma',
                summary: 'Verifica el despacho en el portal del proveedor y vincula el pago bancario.',
                instructions: [
                    'Confirma que la orden aparezca sincronizada en la pestaña Portal Puma y que los precios quincenales vigentes estén aplicados.',
                    'Usa "Vincular Pago" para registrar Cuenta Bancaria, Tipo de Pago (Transferencia/Cheque), Referencia, Fecha y Monto, dejando marcada "Alistar para Conciliación".'
                ],
                verify: 'La orden pasa a estado PAGADO y queda visible en la pestaña Conciliación.'
            },
            {
                title: 'Paso 5 · Confirmar y Recibir la Descarga en "Consulta de Pedidos (RRS)"',
                location: 'Operaciones → Consulta de Pedidos',
                route: '/dashboard/operaciones/consulta-pedidos',
                routeLabel: 'Abrir Consulta de Pedidos',
                summary: 'Registra la descarga física real en tanque con el número de CCF y pago definitivo.',
                instructions: [
                    'Marca el pedido como "Visto" y luego haz clic en "Recibir".',
                    'Selecciona Cheque o Transferencia, captura Fecha de Descarga, No. CCF, galones descargados, costos, flete, NCR/cupones y la referencia/cheque de pago.',
                    'Confirma la recepción para cerrar el pedido en estado RECIBIDO.'
                ],
                verify: 'El inventario de la estación recibe la carga y el pedido figura bajo la pestaña Recibidos.'
            },
            {
                title: 'Paso 6 · Conciliar el Pago en "Conciliación Bancaria"',
                location: 'Bancos → Conciliación Bancaria',
                route: '/dashboard/bancos/conciliacion',
                routeLabel: 'Abrir Conciliación Bancaria',
                summary: 'Aplica la fecha de cobro real cuando aparezca en el estado de cuenta del banco.',
                instructions: [
                    'Selecciona la cuenta bancaria desde la que se pagó la pipa.',
                    'Cruza mediante "Importar Extracto" o aplica manualmente en PENDIENTES con la fecha real del cargo bancario.',
                    'Valida que la diferencia del saldo bancario cierre en $0.00.'
                ],
                verify: 'El ciclo completo queda 100% cerrado: tanque abastecido, inventario RRS actualizado, factura ingresada y banco cuadrado.'
            }
        ],
        successChecklist: [
            'La estación quedó abastecida sin llegar a quiebre de stock ni sobrellenado.',
            'El CCF y costos reales coinciden entre Portal Puma y Consulta de Pedidos RRS.',
            'El egreso bancario quedó conciliado en la cuenta correcta.'
        ],
        troubleshooting: [
            {
                symptom: 'El monto pagado difiere unos centavos del monto estimado inicial.',
                cause: 'Cambio de tarifa de flete, ajuste de precios quincenales o aplicación de Nota de Crédito (NCR).',
                solution: 'Usa "Ajustar Costos" en Portal Puma y registra el NCR exacto al recibir en Consulta de Pedidos para que el neto a pagar cuadre al centavo.'
            }
        ]
    },
    {
        id: 'flujo-pagos-a-conciliacion',
        category: 'flujos',
        title: 'Flujo Maestro 2: De Control de Pagos hasta Conciliación en $0.00',
        subtitle: 'Conecta Operaciones con Bancos usando OCR IA de comprobantes y el puente automático de sugerencias en Conciliación Bancaria.',
        route: '/dashboard/operaciones/recordatorios',
        routeLabel: 'Iniciar en Control de Pagos',
        difficulty: 'Intermedio',
        duration: '10 min',
        role: 'Tesorería + Contabilidad',
        tags: ['flujo maestro', 'control pagos', 'ocr', 'conciliacion', 'puente', 'comprobante', 'cero diferencia'],
        objective: 'Eliminar la doble digitación entre Tesorería y Contabilidad registrando el pago una sola vez con comprobante OCR y conciliándolo con un clic en Bancos.',
        prerequisites: [
            { label: 'Recordatorio o vencimiento creado en Control de Pagos', route: '/dashboard/operaciones/recordatorios', routeLabel: 'Control de Pagos' },
            { label: 'Imagen o PDF del comprobante bancario del pago realizado' }
        ],
        flowSteps: [
            '1. Ubicar Vencimiento en Control de Pagos',
            '2. Subir Comprobante → Auto-OCR IA',
            '3. Confirmar Cuenta Bancaria y Guardar Abono',
            '4. Abrir Conciliación → Pestaña CONTROL PAGOS',
            '5. Vincular o Crear y Conciliar → Validar $0.00'
        ],
        steps: [
            {
                title: 'Paso 1 · Abrir el vencimiento en Control de Pagos y clasificar operación',
                location: 'Operaciones → Control de Pagos',
                route: '/dashboard/operaciones/recordatorios',
                routeLabel: 'Abrir Control de Pagos',
                summary: 'Localiza la cuota o factura por pagar y abre el popup completo de Pagos/Abonos.',
                instructions: [
                    'Filtra el periodo y usa la búsqueda rápida para encontrar el vencimiento.',
                    'Abre el Modal de Pagos y confirma el tipo de operación (CXP, CXC o GASTO).'
                ],
                verify: 'Visualizas el monto total del vencimiento y el saldo pendiente actual.'
            },
            {
                title: 'Paso 2 · Pegar o subir el comprobante para auto-llenado con OCR IA',
                location: 'Modal Control de Pagos → Zona de Comprobantes (OCR IA)',
                summary: 'Deja que la IA extraiga cuenta, monto, fecha y referencia en segundos.',
                instructions: [
                    'Pega la captura con Ctrl+V o arrastra el PDF/foto del comprobante bancario.',
                    'Espera a que la IA complete Método de Pago, Cuenta Bancaria, Monto, Fecha y Referencia.',
                    'Confirma especialmente que la Cuenta Bancaria seleccionada sea la cuenta exacta donde saldrá el cargo en el banco.'
                ],
                verify: 'Todos los campos del abono están completos y la miniatura del comprobante aparece lista.'
            },
            {
                title: 'Paso 3 · Guardar el abono y saltar a Conciliación Bancaria',
                location: 'Botón Guardar Abono → Bancos → Conciliación Bancaria',
                route: '/dashboard/bancos/conciliacion',
                routeLabel: 'Abrir Conciliación Bancaria',
                summary: 'El abono viaja automáticamente a la pestaña de sugerencias de la cuenta bancaria.',
                instructions: [
                    'Guarda el abono en Control de Pagos.',
                    'Abre Bancos → Conciliación Bancaria (en otra pestaña para trabajar en paralelo) y selecciona la misma Cuenta Bancaria.',
                    'Haz clic en la pestaña "CONTROL PAGOS": allí verás tu pago recién registrado listo para procesar.'
                ],
                verify: 'El pago aparece en la lista de sugerencias de Conciliación con su referencia, monto y ubicación.'
            },
            {
                title: 'Paso 4 · Vincular o Crear & Conciliar y Validar Saldo en $0.00',
                location: 'Conciliación Bancaria → Pestaña CONTROL PAGOS → Validar Saldo',
                summary: 'Deja el movimiento reflejado y aplicado en bancos sin digitarlo dos veces.',
                instructions: [
                    'Define la Fecha Aplicado según tu estado de cuenta.',
                    'Si el movimiento ya existía en libros, pulsa "Vincular"; si no existía, pulsa "Crear y Conciliar".',
                    'Ingresa el Saldo Real del Banco, confirma Diferencia $0.00 y guarda la Validación de Saldo.'
                ],
                verify: 'El pago está cancelado con comprobante en Operaciones, aplicado en Bancos y reflejado en Flujo de Caja.'
            }
        ],
        successChecklist: [
            'El comprobante digital quedó adjunto en Control de Pagos.',
            'No se digitó dos veces el mismo egreso en Movimientos Bancarios.',
            'La sugerencia fue conciliada y la cuenta cerró con $0.00 de diferencia.'
        ],
        troubleshooting: [
            {
                symptom: 'El pago se creó tanto en Movimientos Bancarios como en Control de Pagos y ahora aparece duplicado.',
                cause: 'Se pulsó "Crear y Conciliar" en lugar de "Vincular" cuando el movimiento ya existía.',
                solution: 'Usa siempre "Vincular" cuando Conciliación muestre una coincidencia sugerida; si se duplicó, elimina el movimiento extra en Movimientos Bancarios.'
            }
        ]
    },
    {
        id: 'flujo-ciclo-cheques',
        category: 'flujos',
        title: 'Flujo Maestro 3: Ciclo Completo de Cheques (De Configuración a Cobro)',
        subtitle: 'El recorrido completo para emitir cheques sin errores: cuenta bancaria, diseño calibrado, emisión normal o contado, impresión Carta y conciliación.',
        route: '/dashboard/bancos/cuentas',
        routeLabel: 'Iniciar en Cuentas Bancarias',
        difficulty: 'Esencial',
        duration: '12 min',
        role: 'Tesorería + Bancos',
        tags: ['flujo maestro', 'cheques', 'diseñador', 'impresion', 'contado', 'conciliacion', 'carta'],
        objective: 'Establecer una operación de cheques impecable desde la preparación del formato bancario hasta la impresión en lote y su posterior cobro en conciliación.',
        prerequisites: [
            { label: 'Chequera física activa del banco y muestra para calibración inicial' }
        ],
        flowSteps: [
            '1. Cuenta Activa con Cta. Contable',
            '2. Formato Calibrado en Diseñador',
            '3. Emitir (Cheques o Cheques Contado)',
            '4. Imprimir Lote en Carta 100%',
            '5. Aplicar Cobro en Conciliación'
        ],
        steps: [
            {
                title: 'Paso 1 · Confirmar Cuenta Bancaria activa y Formato calibrado',
                location: 'Bancos → Cuentas Bancarias y Diseñador de Cheques',
                route: '/dashboard/bancos/check-designer',
                routeLabel: 'Ir al Diseñador de Cheques',
                summary: 'Paso único por banco: asegura que la cuenta tenga cuenta contable y el banco tenga su plantilla activa.',
                instructions: [
                    'Verifica en Cuentas Bancarias que la cuenta esté Activa y tenga su cod_cta asignado.',
                    'Verifica en Diseñador de Cheques que exista un formato Activo para ese banco y que haya pasado la prueba a contraluz en hoja Carta.'
                ],
                verify: 'El banco cuenta con plantilla activa lista para autoselección.'
            },
            {
                title: 'Paso 2 · Emitir cheques (Normales o de Contado)',
                location: 'Bancos → Cheques o Bancos → Cheques Contado',
                route: '/dashboard/bancos/cheques',
                routeLabel: 'Ir a Cheques',
                summary: 'Registra los cheques respetando la secuencia correlativa física de la chequera.',
                instructions: [
                    'Para pagos generales/proveedores de crédito: créalos en Bancos → Cheques dejando Fecha Aplicado vacía.',
                    'Para compras de contado de estaciones: entra a Bancos → Cheques Contado, corre primero "Sincronizar Emitidos" y luego usa "Generar" para los pendientes.'
                ],
                verify: 'Todos los cheques del día están registrados con su correlativo exacto y sin saltos.'
            },
            {
                title: 'Paso 3 · Imprimir en lote revisando Vista Previa Carta',
                location: 'Bancos → Reportes → Impresión de Cheques',
                route: '/dashboard/bancos/reportes/impresion-cheques',
                routeLabel: 'Ir a Impresión de Cheques',
                summary: 'Imprime el rango exacto en tamaño Carta 100% excluyendo anulados y reservados.',
                instructions: [
                    'Elige la Cuenta Bancaria (el formato se selecciona solo), digita el rango Desde # y Hasta #, y mantén marcados Excluir Anulados y Excluir Reservados.',
                    'Pulsa "Imprimir Seleccionados", revisa todas las páginas en ReportPreviewModal e imprime a Escala 100% en papel Carta.'
                ],
                verify: 'Los cheques físicos salen nítidos, centrados y con monto en letras protegido con asteriscos.'
            },
            {
                title: 'Paso 4 · Controlar cheques en circulación y aplicarlos al cobro',
                location: 'Reportes (Cheques por Fecha / Saldos Chequera) y Conciliación Bancaria',
                route: '/dashboard/bancos/conciliacion',
                routeLabel: 'Ir a Conciliación Bancaria',
                summary: 'Sigue los cheques emitidos hasta que el beneficiario los cobre en el banco.',
                instructions: [
                    'Mientras no se cobren, los cheques se descuentan de "Saldos en Chequera" y permanecen en Conciliación → PENDIENTES.',
                    'Cuando aparezcan cobrados en el estado de cuenta bancario, aplícalos en Conciliación Bancaria con su fecha real de cobro.'
                ],
                verify: 'El ciclo del cheque concluye: emitido, impreso, entregado, cobrado y conciliado.'
            }
        ],
        successChecklist: [
            'Se usó el Diseñador de Cheques para calibrar antes de imprimir en formularios reales.',
            'Los cheques impresos pasaron por ReportPreviewModal a tamaño Carta 100%.',
            'Los cheques no cobrados permanecen visibles en PENDIENTES y Saldos en Chequera.'
        ],
        troubleshooting: [
            {
                symptom: 'Un cheque se atascó en la impresora y quedó inutilizable.',
                cause: 'Atasco físico de papel durante el lote.',
                solution: 'Marca ese número como "Anulado" en Bancos → Cheques, crea un nuevo registro con el siguiente folio físico libre e imprime solo ese nuevo cheque.'
            }
        ]
    },
    {
        id: 'gen-productividad-atajos',
        category: 'productividad',
        title: 'Productividad en SIPE Admin: Pestañas, Ctrl+K Calculadora y Tickets',
        subtitle: 'Saca el máximo provecho al entorno multi-pestaña para seguir estos tutoriales en vivo mientras trabajas, calcular montos al vuelo y pedir soporte.',
        route: '/dashboard',
        routeLabel: 'Ir al Dashboard',
        difficulty: 'Esencial',
        duration: '4 min',
        role: 'Todos los usuarios',
        tags: ['atajos', 'ctrl+k', 'calculadora', 'pestañas', 'tickets', 'soporte', 'tema', 'productividad'],
        objective: 'Trabajar más rápido en SIPE Admin aprovechando las pestañas simultáneas, el buscador con calculadora rápida y el sistema de tickets con captura anotada.',
        prerequisites: [],
        flowSteps: [
            '1. Usar Pestañas Simultáneas (Tutorial + Módulo)',
            '2. Abrir Buscador y Calculadora con Ctrl + K',
            '3. Reportar Tickets con Captura (Ctrl + Shift + K)',
            '4. Personalizar Tema Visual para Descanso Ocular'
        ],
        steps: [
            {
                title: 'Trabajar con el Centro de Tutoriales abierto en paralelo',
                location: 'Barra de Pestañas Superior + Botones "Abrir Módulo"',
                summary: 'SIPE Admin mantiene tus pestañas vivas sin perder lo que estabas escribiendo.',
                instructions: [
                    'Cuando pulses cualquier botón "Ir al Módulo" desde un tutorial, la pantalla destino se abrirá en su propia pestaña arriba.',
                    'Tu pestaña de "Centro de Tutoriales" permanecerá abierta exactamente en el paso donde te quedaste para que alternes entre leer y ejecutar.',
                    'Puedes tener hasta 8 pestañas activas simultáneamente y desplazarte con la rueda del ratón sobre la barra de pestañas.'
                ],
                verify: 'Alternas entre el Tutorial y Operaciones/Bancos en un clic sin perder tu formulario ni tu avance del checklist.'
            },
            {
                title: 'Usar la Paleta de Comandos y Calculadora instantánea (Ctrl + K)',
                location: 'Botón "Buscar o calcular..." en la barra superior o tecla Ctrl + K',
                summary: 'Salta a cualquier módulo o calcula impuestos/totales sin salir del sistema.',
                instructions: [
                    'Presiona Ctrl + K (o Cmd + K en Mac) desde cualquier pantalla.',
                    'Escribe el nombre de un módulo (ej. "conciliación", "cheques", "pedidos") y pulsa Enter para abrirlo.',
                    'Escribe cualquier fórmula matemática (ej. 1250*1.13 o (4500+320)/2) y pulsa Enter para copiar el resultado exacto al portapapeles.'
                ],
                verify: 'Puedes navegar a cualquier pantalla y hacer cálculos de IVA/fletes en menos de 2 segundos.'
            },
            {
                title: 'Reportar un incidente con Captura Automática (Ctrl + Shift + K)',
                location: 'Botón "Ticket" en la barra superior o atajo Ctrl + Shift + K',
                summary: 'Si algo falla o necesitas una mejora, envía evidencia exacta en 10 segundos.',
                instructions: [
                    'Haz clic en el botón "Ticket" de la esquina superior derecha (o presiona Ctrl + Shift + K).',
                    'El sistema captura automáticamente tu pantalla actual y te permite señalar con flechas o recuadros dónde ocurrió el problema.',
                    'Describe brevemente qué estabas haciendo y envía el ticket para seguimiento directo en Seguridad → Tickets de Soporte.'
                ],
                verify: 'El ticket queda registrado con captura y diagnóstico técnico automático para resolución rápida.',
                tip: 'También puedes ajustar el tema visual (Oscuro, Claro, Lectura Cálida/Sepia o Azul Medianoche) desde el icono de paleta en la barra lateral para evitar fatiga visual.'
            }
        ],
        successChecklist: [
            'Sabes alternar entre el Centro de Tutoriales y el módulo operativo usando pestañas.',
            'Dominas Ctrl + K para buscar pantallas y calcular montos.',
            'Sabes levantar un Ticket con captura si detectas una incidencia.'
        ],
        troubleshooting: [
            {
                symptom: 'El atajo Ctrl + K no abre el buscador.',
                cause: 'El foco está dentro de un visor PDF incrustado (iframe).',
                solution: 'Haz clic en el botón "Buscar o calcular..." de la barra superior o fuera del visor PDF.'
            }
        ]
    }
];
