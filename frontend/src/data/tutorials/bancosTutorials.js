export const BANCOS_TUTORIALS = [
    {
        id: 'ban-cuentas-bancarias',
        category: 'bancos',
        title: 'Cuentas Bancarias y Entidades de Banco (Configuración Base)',
        subtitle: 'Registra bancos, crea cuentas por empresa, enlaza la cuenta contable (cod_cta) y controla qué cuentas aparecen activas en todo el sistema.',
        route: '/dashboard/bancos/cuentas',
        routeLabel: 'Cuentas Bancarias',
        difficulty: 'Esencial',
        duration: '6 min',
        role: 'Tesorería / Contabilidad / Administrador',
        tags: ['cuentas', 'bancos', 'catalogo', 'cuenta contable', 'cod_cta', 'activar', 'desactivar', 'empresa'],
        objective: 'Mantener un catálogo limpio y estandarizado de bancos y cuentas bancarias para garantizar que Movimientos, Cheques, Conciliación y Control de Pagos operen sin errores.',
        prerequisites: [
            { label: 'Empresas y catálogo contable sincronizados en el sistema' },
            { label: 'Número de cuenta bancaria oficial y código de cuenta contable (cod_cta)' }
        ],
        flowSteps: [
            '1. Verificar o Crear Entidad Bancaria',
            '2. Dar de Alta Nueva Cuenta Bancaria',
            '3. Vincular Cuenta Contable (cod_cta)',
            '4. Controlar Estado Activa / Inactiva'
        ],
        steps: [
            {
                title: 'Verificar si el Banco existe o crear una nueva Entidad Bancaria',
                location: 'Bancos → Cuentas Bancarias → Botón "Bancos"',
                summary: 'Asegúrate de que el banco exista en el catálogo antes de crear cuentas nuevas.',
                instructions: [
                    'Haz clic en el botón "Bancos" ubicado junto a "Nueva Cuenta".',
                    'Usa el buscador del modal para confirmar que el banco no exista ya (evita duplicados como "BAC" y "BAC CREDOMATIC").',
                    'Si es un banco nuevo, escribe el Nombre del Banco, revisa el Código sugerido automáticamente y deja marcada la opción "Todas las empresas" para que esté disponible en todo el grupo empresarial.',
                    'Guarda la entidad bancaria.'
                ],
                verify: 'El banco aparece en el listado y queda seleccionado automáticamente para nuevas cuentas.'
            },
            {
                title: 'Crear o editar una Cuenta Bancaria por Empresa',
                location: 'Botón "Nueva Cuenta" (+) o icono Editar en la tabla',
                summary: 'Registra número, nombre descriptivo, tipo de cuenta y cuenta contable asociada.',
                instructions: [
                    'Pulsa "Nueva Cuenta".',
                    'Selecciona la Empresa propietaria (esto carga los bancos y tipos de cuenta de esa empresa).',
                    'Selecciona el Banco y el Tipo de Cuenta (Corriente, Ahorro, etc.).',
                    'Digita el Número de Cuenta exacto (tal como aparece en el estado de cuenta bancario) y un Nombre claro que identifique estación/uso (ej. "ANDELSA - CTA CTE OPERATIVA").',
                    'Completa el campo "Cuenta Contable (cod_cta)" — evita dejarla vacía para que no muestre la advertencia amarilla "Sin Cta. Contable".',
                    'Opcionalmente asigna un número de Orden y pulsa Guardar.'
                ],
                verify: 'La cuenta aparece en la tabla con su código contable en azul y estado "Activa", y automáticamente aparece en los selectores de todo SIPE Admin con el formato estándar [BANCO] Nombre - (Número).',
                tip: 'Usa nombres consistentes que incluyan la estación o empresa para facilitar la detección automática del OCR IA y el autocompletado en Control de Pagos.'
            },
            {
                title: 'Activar o Desactivar cuentas cerradas sin perder historial',
                location: 'Columna Estado → Badge "Activa / Inactiva"',
                summary: 'Inactiva cuentas en desuso de forma segura sin eliminar movimientos históricos.',
                instructions: [
                    'Localiza la cuenta usando el buscador (busca por número, nombre, empresa, banco o cuenta contable).',
                    'Haz clic sobre el badge de Estado ("Activa") y confirma en el cuadro de diálogo el cambio a Inactiva.',
                    'Una cuenta inactiva conserva toda su historia para auditoría y reportes, pero evita registros nuevos accidentales.'
                ],
                verify: 'El badge cambia de verde (Activa) a rojo (Inactiva) y se muestra la notificación de confirmación.',
                warning: 'Antes de desactivar una cuenta, asegúrate de que no tenga cheques pendientes de conciliar ni pagos programados activos.'
            }
        ],
        successChecklist: [
            'Cada cuenta bancaria activa tiene su Cuenta Contable (cod_cta) asignada.',
            'No existen bancos ni números de cuenta duplicados.',
            'Los nombres de cuenta permiten identificar empresa y uso de un vistazo.'
        ],
        troubleshooting: [
            {
                symptom: 'En la tabla aparece el badge amarillo "Sin Cta. Contable".',
                cause: 'La cuenta se creó sin vincular el campo cod_cta.',
                solution: 'Haz clic en Editar (icono lápiz), ingresa el código contable correspondiente y guarda.'
            }
        ]
    },
    {
        id: 'ban-movimientos-bancarios',
        category: 'bancos',
        title: 'Movimientos Bancarios (Abonos, Cargos y Transferencias entre Cuentas)',
        subtitle: 'Registra remesas, notas de abono, notas de cargo y traslados automáticos entre cuentas con trazabilidad y exportación a Excel.',
        route: '/dashboard/bancos/movimientos',
        routeLabel: 'Movimientos Bancarios',
        difficulty: 'Intermedio',
        duration: '9 min',
        role: 'Tesorería / Contabilidad / Auxiliar Bancario',
        tags: ['movimientos', 'abono', 'cargo', 'remesa', 'transferencia', 'entre cuentas', 'nota de cargo', 'nota de abono', 'excel'],
        objective: 'Registrar con exactitud cada ingreso, egreso o traslado entre cuentas bancarias para mantener el saldo de chequera y bancos siempre al día.',
        prerequisites: [
            { label: 'Cuentas bancarias activas configuradas', route: '/dashboard/bancos/cuentas', routeLabel: 'Cuentas Bancarias' },
            { label: 'Boleta de remesa, nota bancaria o comprobante de transferencia a la vista' }
        ],
        flowSteps: [
            '1. Filtrar Historial para Evitar Duplicados',
            '2. Elegir Empresa y Tipo de Remesa / Movimiento',
            '3. Registrar Abono/Cargo o Transferencia (TR)',
            '4. Verificar Concepto, Documento y Monto',
            '5. Validar en Historial o Exportar Excel'
        ],
        steps: [
            {
                title: 'Consultar y filtrar el historial antes de ingresar nuevos movimientos',
                location: 'Bancos → Movimientos Bancarios → Barra de Filtros',
                summary: 'Revisa los últimos 30 días (o el rango deseado) para confirmar que el documento no exista ya.',
                instructions: [
                    'Filtra por Empresa, Cuenta Bancaria y rango de fechas (Desde / Hasta) y presiona Consultar.',
                    'Usa la caja de búsqueda para filtrar instantáneamente por Número de Documento, Concepto o Llave.',
                    'Verifica los totales y si el movimiento ya tiene "Fecha Aplicado" (lo que indica que ya fue conciliado).'
                ],
                verify: 'Confirmas que el número de documento/boleta que vas a registrar no existe todavía en la cuenta.'
            },
            {
                title: 'Registrar un Abono (Remesa/Crédito) o un Cargo (Débito/Nota de Cargo)',
                location: 'Botón "Nuevo Movimiento" (+)',
                summary: 'El sistema determina automáticamente si el movimiento suma (ABONO) o resta (CARGO) según el código de remesa elegido.',
                instructions: [
                    'Haz clic en "Nuevo Movimiento".',
                    'Selecciona la Empresa (esto carga automáticamente los tipos de remesa válidos para esa empresa).',
                    'En "Tipo de Movimiento / Remesa", elige el código correcto: los códigos 01, 03, NC y CH generan CARGO (débito/salida), mientras que remesas y notas de abono (RM, NA) generan ABONO (crédito/entrada).',
                    'Selecciona la Cuenta Bancaria, Fecha del movimiento, Número de Documento, Monto y un Concepto claro y descriptivo.',
                    'Si ya verificaste que el banco lo aplicó en el estado de cuenta, puedes llenar "Fecha Aplicado"; de lo contrario déjala vacía para aplicarla luego en Conciliación Bancaria.',
                    'Pulsa Guardar.'
                ],
                verify: 'El movimiento aparece en la tabla con la columna Cargo o Abono correcta y el saldo reflejado.',
                warning: 'Revisa siempre si elegiste un tipo de Cargo o Abono antes de guardar; invertir el tipo generará una diferencia del doble del monto en la conciliación.'
            },
            {
                title: 'Registrar una Transferencia entre Cuentas propias (Tipo TR)',
                location: 'Modal Nuevo Movimiento → Tipo "TR / TRANSFERENCIA"',
                summary: 'Registra salida en una cuenta y entrada en la cuenta destino en una sola operación sincronizada.',
                instructions: [
                    'Dentro de "Nuevo Movimiento", selecciona la Empresa y escoge el tipo de movimiento "TR" (Transferencia entre Cuentas).',
                    'El formulario se transformará automáticamente para pedir dos cuentas: "Cuenta a Debitar" (origen) y "Cuenta a Acreditar" (destino).',
                    'Observa que al seleccionar ambas cuentas, el sistema autogenera el concepto estándar: "TRANSFERENCIA DE [Cuenta Origen] PARA [Cuenta Destino] / " — complétalo con el motivo breve.',
                    'Verifica que la Cuenta a Debitar y la Cuenta a Acreditar sean distintas (el sistema bloquea traslados a la misma cuenta).',
                    'Ingresa Fecha, Número de Referencia/Documento y Monto, y pulsa Guardar.'
                ],
                verify: 'El sistema confirma "Transferencia entre cuentas registrada con éxito" y genera tanto el débito en la cuenta origen como el crédito en la cuenta destino.',
                tip: 'Usar el tipo TR ahorra la mitad del tiempo y garantiza que nunca olvides registrar la contrapartida en la cuenta receptora.'
            },
            {
                title: 'Editar, eliminar con seguridad o exportar a Excel',
                location: 'Acciones por fila y botón "Exportar Excel"',
                summary: 'Corrige datos puntuales o descarga el movimiento del periodo para análisis contable.',
                instructions: [
                    'Para corregir documento, concepto o fecha, haz clic en Editar (icono lápiz), actualiza y guarda.',
                    'Para eliminar un registro duplicado, usa el icono Eliminar y confirma en el diálogo de seguridad.',
                    'Para llevar el detalle filtrado a hoja de cálculo, presiona el botón de exportar Excel (incluye Fecha, Fecha Aplicado, Llave, Documento, Empresa, Cuenta, Tipo, Concepto, Monto y Partida).'
                ],
                verify: 'El archivo Excel descarga con el rango de fechas exacto en su nombre y el historial queda limpio.'
            }
        ],
        successChecklist: [
            'No hay documentos duplicados en la misma cuenta y fecha.',
            'Los débitos y créditos corresponden correctamente a Cargo o Abono.',
            'Las transferencias entre cuentas propias se registraron con tipo TR.',
            'Todo concepto incluye referencia clara del origen/destino del dinero.'
        ],
        troubleshooting: [
            {
                symptom: 'El sistema muestra alerta "La Cuenta a Debitar y la Cuenta a Acreditar no pueden ser la misma".',
                cause: 'En una transferencia TR seleccionaste el mismo número de cuenta en origen y destino.',
                solution: 'Cambia la Cuenta a Acreditar por la cuenta receptora real.'
            },
            {
                symptom: 'Un movimiento no suma al Saldo en Bancos sino solo al Saldo en Chequera.',
                cause: 'El movimiento aún no tiene Fecha Aplicado (está en tránsito/pendiente).',
                solution: 'Aplícalo desde Bancos → Conciliación Bancaria en la pestaña PENDIENTES.'
            }
        ]
    },
    {
        id: 'ban-conciliacion-bancaria',
        category: 'bancos',
        title: 'Conciliación Bancaria Paso a Paso (Extracto, Pendientes y Saldo $0.00)',
        subtitle: 'La guía maestra para cuadrar cualquier cuenta bancaria: importa extractos multibanco, vincula Control de Pagos, aplica pendientes y valida saldo en $0.00.',
        route: '/dashboard/bancos/conciliacion',
        routeLabel: 'Conciliación Bancaria',
        difficulty: 'Avanzado',
        duration: '15 min',
        role: 'Contabilidad / Tesorería / Auditoría Bancaria',
        tags: ['conciliacion', 'extracto', 'multibanco', 'pendientes', 'control pagos', 'validar saldo', 'diferencia', 'pdf', 'fecha aplicado'],
        objective: 'Lograr que el Saldo en Bancos del sistema coincida exactamente ($0.00 de diferencia) con el estado de cuenta real del banco, dejando respaldada la validación y el reporte PDF Carta.',
        prerequisites: [
            { label: 'Estado de cuenta / extracto bancario en línea o archivo del periodo a conciliar' },
            { label: 'Movimientos y cheques emitidos del periodo registrados', route: '/dashboard/bancos/movimientos', routeLabel: 'Movimientos Bancarios' },
            { label: 'Opcional: Abonos bancarios registrados en Control de Pagos', route: '/dashboard/operaciones/recordatorios', routeLabel: 'Control de Pagos' }
        ],
        flowSteps: [
            '1. Elegir Empresa, Cuenta y Periodo',
            '2. Importar Extracto Bancario Multibanco',
            '3. Procesar Sugerencias de CONTROL PAGOS',
            '4. Aplicar Movimientos en PENDIENTES',
            '5. Digitar Saldo Banco Real → Diferencia $0.00',
            '6. Guardar Validación e Imprimir PDF Carta'
        ],
        steps: [
            {
                title: 'Seleccionar Empresa, Cuenta Bancaria y Periodo de Conciliación',
                location: 'Bancos → Conciliación Bancaria → Panel de Filtros Superior',
                summary: 'Carga los saldos actuales, movimientos ya conciliados, pendientes y sugerencias de Control de Pagos.',
                instructions: [
                    'Selecciona la Empresa y la Cuenta Bancaria (mostrada en formato [BANCO] Nombre - Número).',
                    'Elige el preset de periodo rápido ("Hoy", "Ayer", "Este mes", "Mes anterior", "Últimos 30 días", "Últimos 3 meses", "Año actual") o ajusta manualmente Desde / Hasta.',
                    'Observa los 3 indicadores clave superiores: Saldo en Banco (sistema), Saldo en Chequera (incluye partidas en tránsito) y Diferencia actual, además de la fecha de última validación.'
                ],
                verify: 'Se cargan las 3 pestañas de trabajo: MOVIMIENTOS (conciliados), PENDIENTES (sin aplicar) y CONTROL PAGOS (sugerencias).'
            },
            {
                title: 'Importar y cruzar el Extracto Bancario Multibanco (Método más rápido)',
                location: 'Botón "Importar Extracto" → Modal Importador Multibanco',
                summary: 'Copia y pega las líneas del estado de cuenta de tu banca en línea (o sube el archivo) para conciliar en bloque.',
                instructions: [
                    'Haz clic en el botón "Importar Extracto".',
                    'Deja el selector de banco en "AUTO" (detección automática multibanco) o elige el banco específico.',
                    'Pega el texto copiado desde la banca en línea (o carga el archivo de extracto) y pulsa Analizar / Procesar.',
                    'El analizador comparará automáticamente cada línea del extracto contra tus registros en PENDIENTES:',
                    '• Coincidencias exactas: quedan listas para marcarse y aplicarse en bloque.',
                    '• Líneas sin registro en sistema (ej. comisiones bancarias, intereses, transferencias no ingresadas): haz clic en "Asignar / Crear" en esa fila para elegir "CREAR" (crea el cargo/abono con su tipo de remesa y lo aplica inmediatamente) o "VINCULAR" (enlaza manualmente con un pendiente existente).'
                ],
                verify: 'Cada línea del extracto bancario queda emparejada o creada en el sistema sin omitir comisiones ni cargos automáticos.',
                tip: 'Al crear un movimiento desde el extracto, el sistema filtra automáticamente los tipos de remesa válidos según sea CARGO (NC, CH) o ABONO (RM, NA) para evitar errores de signo.'
            },
            {
                title: 'Revisar la pestaña "CONTROL PAGOS" (Puente automático con Operaciones)',
                location: 'Pestaña "CONTROL PAGOS (N)"',
                summary: 'Concilia en un clic los pagos que Tesorería u Operaciones ya registraron en Control de Pagos.',
                instructions: [
                    'Si la pestaña "CONTROL PAGOS" muestra un contador mayor a 0, ábrela.',
                    'Verás cada abono bancario registrado en Control de Pagos para esta cuenta, con su descripción, ubicación, referencia, monto y si el sistema encontró una coincidencia sugerida en libros.',
                    'Define la "Fecha Aplicado" y ejecuta la acción correspondiente: "Vincular" (si ya existe el movimiento en libros), "Crear y Conciliar" (si aún no existía el movimiento bancario) o "Descartar" (solo si no corresponde a esta conciliación).'
                ],
                verify: 'El contador de sugerencias baja a 0 y los movimientos aparecen inmediatamente en la pestaña MOVIMIENTOS.'
            },
            {
                title: 'Aplicar partidas en la pestaña "PENDIENTES" (Cheques cobrados y remesas)',
                location: 'Pestaña "PENDIENTES" → Selección múltiple + Fecha Aplicado',
                summary: 'Marca los cheques y movimientos que ya fueron cobrados/efectivos en el banco.',
                instructions: [
                    'Abre la pestaña "PENDIENTES". Aquí están todos los cheques emitidos y movimientos que aún no tienen Fecha Aplicado.',
                    'Usa el buscador para localizar por número de cheque, documento, beneficiario o monto.',
                    'Define la "Fecha Aplicado" correcta según el estado de cuenta bancario.',
                    'Marca las casillas de los cheques/movimientos que ya aparecen cobrados en tu estado de cuenta y pulsa el botón para Aplicar Seleccionados.',
                    'Si un registro tiene un error menor en documento, concepto o fecha, usa el botón Editar antes de aplicarlo (la edición de montos está protegida por permiso especial).'
                ],
                verify: 'Los ítems aplicados pasan a la pestaña MOVIMIENTOS y el Saldo en Banco del sistema se actualiza al instante.',
                warning: 'Los cheques emitidos que el proveedor aún NO ha cobrado en el banco DEBEN permanecer en PENDIENTES (son cheques en circulación).'
            },
            {
                title: 'Cuadrar Saldo Real del Banco hasta Diferencia $0.00 y Guardar Validación',
                location: 'Campo "Saldo en Banco Real" → Botón "Validar Saldo"',
                summary: 'Compara el saldo final de tu estado de cuenta real contra el saldo conciliado en SIPE Admin y deja registro auditable.',
                instructions: [
                    'Escribe en el campo "Saldo en Banco (Manual / Real)" el saldo final exacto que indica tu banca en línea o estado de cuenta a la fecha de corte.',
                    'Verifica el indicador de "Diferencia": si es $0.00 en verde, tu conciliación es perfecta.',
                    'Si existe una diferencia distinta de $0.00, NO valides todavía: busca el monto exacto de la diferencia (o la mitad, por si hay un cargo invertido como abono) en tu extracto bancario.',
                    'Una vez la diferencia esté en $0.00 (o plenamente justificada en notas), abre "Validar Saldo", escribe una observación clara (ej. "Conciliación cierre mensual cuadrada a $0.00") y guarda la validación.'
                ],
                verify: 'Se registra la fecha y hora de la "Última Validación" y se actualiza en tiempo real para todos los usuarios.'
            },
            {
                title: 'Generar y archivar el Reporte Oficial de Conciliación en PDF Carta',
                location: 'Botón "Vista Previa / Imprimir PDF"',
                summary: 'Imprime o guarda el acta oficial de conciliación con resumen de saldos, movimientos conciliados y cheques en circulación.',
                instructions: [
                    'Haz clic en el botón de imprimir reporte para abrir ReportPreviewModal en tamaño Carta completo.',
                    'Verifica que el encabezado muestre la cuenta correcta, el periodo, los saldos conciliados y los pendientes en tránsito.',
                    'Descarga el PDF o imprímelo para firma de contabilidad y gerencia.'
                ],
                verify: 'El PDF Carta contiene el detalle completo listo para archivo contable y auditoría.'
            }
        ],
        successChecklist: [
            'Todas las comisiones, intereses y cargos automáticos del banco fueron ingresados.',
            'Todas las sugerencias de la pestaña CONTROL PAGOS fueron procesadas.',
            'Solo quedan en PENDIENTES las partidas genuinamente en tránsito (cheques no cobrados / depósitos en tránsito).',
            'La diferencia contra el saldo real del banco es $0.00.',
            'Se guardó la Validación de Saldo y se generó el PDF Carta de respaldo.'
        ],
        troubleshooting: [
            {
                symptom: 'La diferencia coincide exactamente con el doble de un movimiento.',
                cause: 'Un Cargo fue registrado como Abono (o viceversa).',
                solution: 'Divide la diferencia entre 2, busca ese monto exacto en MOVIMIENTOS y corrige su tipo.'
            },
            {
                symptom: 'No puedo editar el monto de un movimiento en Conciliación.',
                cause: 'Por control interno, editar montos requiere el permiso especial edit_monto_conciliacion o rol Administrador.',
                solution: 'Solicita autorización al administrador o corrige el registro en Movimientos Bancarios / Cheques según corresponda.'
            },
            {
                symptom: 'Apliqué por error un cheque que aún no ha sido cobrado en el banco.',
                cause: 'Se marcó accidentalmente en PENDIENTES.',
                solution: 'Ubícalo en la pestaña MOVIMIENTOS y usa la acción para revertir/quitar su fecha aplicado y devolverlo a PENDIENTES.'
            }
        ]
    },
    {
        id: 'ban-cheques',
        category: 'bancos',
        title: 'Gestión y Emisión de Cheques (Registro, Estados e Impresión)',
        subtitle: 'Emite cheques, gestiona correctamente anulados y reservados, controla fechas de aplicación e imprime directamente con el formato del banco.',
        route: '/dashboard/bancos/cheques',
        routeLabel: 'Cheques',
        difficulty: 'Esencial',
        duration: '8 min',
        role: 'Tesorería / Contabilidad / Administración',
        tags: ['cheques', 'emitir', 'anulado', 'reservado', 'no emitido', 'imprimir', 'beneficiario', 'partida'],
        objective: 'Emitir y controlar la numeración correlativa de cheques sin saltos ni errores de estado, garantizando una impresión exacta sobre el formulario físico del banco.',
        prerequisites: [
            { label: 'Cuenta bancaria activa en el sistema', route: '/dashboard/bancos/cuentas', routeLabel: 'Cuentas Bancarias' },
            { label: 'Formato de cheque diseñado y activo para el banco', route: '/dashboard/bancos/check-designer', routeLabel: 'Diseñador de Cheques' }
        ],
        flowSteps: [
            '1. Filtrar Cuenta para Verificar Correlativo',
            '2. Crear Nuevo Cheque',
            '3. Configurar Banderas de Estado (si aplica)',
            '4. Imprimir Cheque Individual o en Lote',
            '5. Conciliar cuando se Cobre en Banco'
        ],
        steps: [
            {
                title: 'Verificar el último correlativo emitido en la cuenta',
                location: 'Bancos → Cheques → Filtros Empresa / Cuenta / Fechas',
                summary: 'Confirma el número del último cheque físico antes de registrar el siguiente.',
                instructions: [
                    'Filtra por Empresa y Cuenta Bancaria (formato [BANCO] Nombre - Número) y presiona Consultar.',
                    'Revisa la tabla para confirmar el último número de cheque emitido y que no exista un número duplicado.',
                    'Usa la caja "Buscar en resultados..." para localizar cheques por beneficiario, número, concepto o llave.'
                ],
                verify: 'Conoces el número correlativo exacto del cheque físico que vas a emitir.'
            },
            {
                title: 'Registrar un Nuevo Cheque con datos exactos',
                location: 'Botón "Nuevo Cheque" (+)',
                summary: 'Captura fecha, número, valor, beneficiario y concepto sin errores ortográficos.',
                instructions: [
                    'Haz clic en "Nuevo Cheque".',
                    'Selecciona Empresa y luego la Cuenta Bancaria.',
                    'Ingresa la Fecha de Emisión, Número de Cheque exacto (igual al impreso en la chequera física), Valor ($) y "A Nombre de" (Beneficiario exacto).',
                    'Escribe un Concepto claro (incluyendo número de CCF, factura o periodo pagado) y Número de Partida si contabilidad ya lo asignó.',
                    'Deja vacía la "Fecha Aplicado" al emitirlo (esa fecha se llena cuando el cheque se cobre en Conciliación Bancaria).'
                ],
                verify: 'El beneficiario, monto en números y número de cheque coinciden 100% con el soporte de pago.'
            },
            {
                title: 'Usar correctamente los interruptores de estado (Anulado, Reservado, Contado, No Emitido)',
                location: 'Modal Nuevo / Editar Cheque → Interruptores de Estado',
                summary: 'Cada bandera tiene un efecto contable y operativo específico en reportes e impresión.',
                instructions: [
                    'Cheque Anulado (Badge rojo): actívalo cuando un cheque físico se arruinó o se canceló el pago. No lo elimines si ya ocupó un correlativo físico; dejarlo Anulado preserva la secuencia de auditoría y lo excluye de los totales emitidos.',
                    'Reservado (Badge ámbar): úsalo para apartar un correlativo pendiente de definir monto/beneficiario final.',
                    'No Emitido (Badge gris): marca cheques que no salieron físicamente a circulación.',
                    'Pago Contado (Badge azul): identifica cheques asociados a liquidaciones de compras de contado en estaciones.'
                ],
                verify: 'Los badges de estado en la tabla reflejan exactamente la condición física del cheque.',
                warning: 'Nunca elimines un cheque físico que ya fue dañado en impresora; márcalo como "Anulado" para conservar el rastro correlativo ante auditoría.'
            },
            {
                title: 'Imprimir el cheque y verificar formato del banco',
                location: 'Columna Acciones → Icono Impresora (o módulo Impresión de Cheques)',
                summary: 'Envía los datos formateados (monto en letras con asteriscos de seguridad *****) al formato del banco.',
                instructions: [
                    'Para imprimir un cheque puntual, haz clic en el icono de impresora de su fila (o usa Bancos → Reportes → Impresión de Cheques para previsualizar en PDF Carta e imprimir en lote).',
                    'El sistema busca automáticamente el formato activo para el banco de esa cuenta y genera automáticamente el monto en letras (*****CANTIDAD EN LETRAS*****) y fecha en letras.',
                    'Si no existe formato guardado para ese banco, el sistema te preguntará si deseas ir directamente al "Diseñador de Cheques".'
                ],
                verify: 'El cheque sale alineado en fecha, beneficiario, monto en números y monto en letras sin salirse de las líneas preimpresas.'
            }
        ],
        successChecklist: [
            'El número de cheque coincide exactamente con el folio físico de la chequera.',
            'El beneficiario y el monto fueron verificados antes de imprimir.',
            'Los cheques dañados quedaron marcados como Anulados (no borrados).',
            'La Fecha Aplicado se dejó vacía hasta su cobro real en banco.'
        ],
        troubleshooting: [
            {
                symptom: 'Al intentar imprimir aparece "Formato no encontrado para el banco".',
                cause: 'Aún no existe un diseño guardado y activo para esa institución bancaria.',
                solution: 'Acepta el botón "Ir al Diseñador" y crea/activa el formato en Bancos → Diseñador de Cheques.'
            }
        ]
    },
    {
        id: 'ban-cheques-contado',
        category: 'bancos',
        title: 'Cheques de Contado (Solicitudes de Estaciones y Sincronización)',
        subtitle: 'Atiende solicitudes de pago de contado desde estaciones, sincroniza cheques ya emitidos automáticamente o genera nuevos cheques en bancos.',
        route: '/dashboard/bancos/cheques-contado',
        routeLabel: 'Cheques Contado',
        difficulty: 'Intermedio',
        duration: '7 min',
        role: 'Tesorería / Bancos / Oficina Central',
        tags: ['cheques contado', 'solicitudes', 'estaciones', 'sincronizar', 'ya emitido', 'generar', 'desvincular', 'ccf'],
        objective: 'Liquidar oportunamente las solicitudes de pago de contado de proveedores de las estaciones sin emitir cheques duplicados.',
        prerequisites: [
            { label: 'Solicitudes de pago de contado registradas por las estaciones en RRS' },
            { label: 'Cuentas bancarias activas configuradas', route: '/dashboard/bancos/cuentas', routeLabel: 'Cuentas Bancarias' }
        ],
        flowSteps: [
            '1. Seleccionar Estación y Consultar Pendientes',
            '2. Ejecutar "Sincronizar Emitidos" (Detección Auto)',
            '3. Elegir "Generar" (Nuevo) o "Ya Emitido" (Asignar)',
            '4. Verificar Número de Cheque Vinculado'
        ],
        steps: [
            {
                title: 'Consultar las solicitudes pendientes de la estación',
                location: 'Bancos → Cheques Contado → Selector Estación + "Solo pendientes"',
                summary: 'Lista todas las facturas/CCF de contado que esperan emisión o asignación de cheque.',
                instructions: [
                    'Selecciona la Estación en el desplegable superior.',
                    'Deja encendido el interruptor "Solo pendientes" para enfocarte únicamente en solicitudes sin cheque asignado (apágalo si deseas revisar historial ya emitido).',
                    'Presiona "Consultar". En la parte derecha verás el conteo total de solicitudes y la suma en dólares.'
                ],
                verify: 'La tabla muestra Fecha, Proveedor, Nombre, Tipo Destino (D), Monto, Fecha Entrega, No. CCF y estado PENDIENTE.'
            },
            {
                title: 'Ejecutar primero "Sincronizar Emitidos" para evitar duplicados',
                location: 'Botón "Sincronizar Emitidos"',
                summary: 'Busca automáticamente en el libro de bancos cheques que ya se emitieron para esas solicitudes.',
                instructions: [
                    'Antes de generar cheques nuevos, haz clic en el botón "Sincronizar Emitidos".',
                    'El sistema compara las solicitudes pendientes contra los cheques existentes en el libro de bancos y vincula automáticamente las coincidencias (marcándolas con la etiqueta azul "Auto").',
                    'Revisa la notificación para ver cuántos cheques fueron detectados y vinculados.'
                ],
                verify: 'Las solicitudes que ya tenían cheque emitido dejan de aparecer como PENDIENTE, evitando pagos dobles.',
                tip: 'Convertir "Sincronizar Emitidos" en tu primer paso obligatorio ahorra tiempo y elimina el riesgo de emitir un segundo cheque al mismo proveedor.'
            },
            {
                title: 'Elegir la acción correcta: "Generar" vs "Ya Emitido"',
                location: 'Columna Acción → Botón verde "Ya Emitido" o Botón azul "Generar"',
                summary: 'Distingue claramente cuándo crear un cheque nuevo en bancos y cuándo solo asignar un número existente.',
                instructions: [
                    'Usa "Generar" cuando el cheque TODAVÍA NO existe en el libro de bancos: selecciona la Cuenta Bancaria, escribe el Número de Cheque y confirma. El sistema creará el cheque en Bancos con concepto "PAGO A PROVEEDOR (CONTADO)" y lo vinculará a la solicitud.',
                    'Usa "Ya Emitido" cuando el cheque ya fue hecho manualmente o en otra pantalla y solo deseas anotar su número en la solicitud: digita el Número de Cheque. Si además deseas que se registre en el libro de bancos, activa la casilla "Registrar en bancos" y selecciona la cuenta bancaria.'
                ],
                verify: 'La solicitud muestra el número de cheque en verde y desaparece de la vista "Solo pendientes".',
                warning: 'No uses "Generar" si el cheque ya estaba creado en Bancos → Cheques, o crearás un cheque duplicado en el saldo de chequera.'
            },
            {
                title: 'Desvincular un cheque si hubo error de asignación',
                location: 'Vista con "Solo pendientes" desactivado → Botón Desvincular',
                summary: 'Revierte una vinculación errónea devolviendo la solicitud a estado PENDIENTE.',
                instructions: [
                    'Apaga el interruptor "Solo pendientes" y pulsa "Consultar" para ver las solicitudes ya vinculadas.',
                    'En la fila incorrecta, pulsa el botón de desvincular y confirma en el diálogo de seguridad.',
                    'La solicitud volverá a estado PENDIENTE para asignarle el cheque correcto.'
                ],
                verify: 'La solicitud regresa a PENDIENTE y queda lista para corrección.'
            }
        ],
        successChecklist: [
            'Se ejecutó "Sincronizar Emitidos" antes de generar nuevos cheques.',
            'El monto y proveedor de cada solicitud coincide con el No. CCF.',
            'No se duplicaron cheques entre Cheques Contado y el módulo Cheques.'
        ],
        troubleshooting: [
            {
                symptom: 'El botón "Sincronizar Emitidos" está deshabilitado.',
                cause: 'No has seleccionado una Estación en el desplegable superior.',
                solution: 'Elige primero una estación y luego pulsa "Sincronizar Emitidos".'
            }
        ]
    },
    {
        id: 'ban-disenador-cheques',
        category: 'bancos',
        title: 'Diseñador de Cheques (Crear y Calibrar Formatos por Banco)',
        subtitle: 'Configura las coordenadas milimétricas de cada campo del cheque (fecha, beneficiario, monto en números y letras) para cada banco.',
        route: '/dashboard/bancos/check-designer',
        routeLabel: 'Diseñador de Cheques',
        difficulty: 'Avanzado',
        duration: '10 min',
        role: 'Administrador / Tesorería / Sistemas',
        tags: ['diseñador', 'formato', 'cheques', 'calibracion', 'coordenadas', 'impresora', 'carta', 'banco'],
        objective: 'Crear y calibrar plantillas de impresión precisas por banco para que todos los cheques salgan perfectamente alineados al imprimir en hoja tamaño Carta.',
        prerequisites: [
            { label: 'Un cheque físico de muestra (o copia a escala 1:1) del banco a configurar' },
            { label: 'Regla en milímetros para verificar alineación de prueba' }
        ],
        flowSteps: [
            '1. Crear Nuevo Formato y Asociar Banco',
            '2. Abrir Editor Visual (DesignerView)',
            '3. Posicionar Campos Dinámicos (X/Y y Fuente)',
            '4. Imprimir Prueba en Hoja Blanca Carta',
            '5. Superponer a Contraluz, Ajustar y Activar'
        ],
        steps: [
            {
                title: 'Crear o seleccionar el Formato del Banco en el Administrador',
                location: 'Bancos → Diseñador de Cheques (FormatManager)',
                summary: 'Asocia el diseño al banco correcto para que Impresión de Cheques lo autoseleccione.',
                instructions: [
                    'En la pantalla principal del Diseñador verás la lista de formatos existentes por banco.',
                    'Haz clic en "Nuevo Formato" (o edita uno existente si solo necesitas recalibrar).',
                    'Asigna un Nombre claro (ej. "BAC Credomatic - Voucher Carta"), selecciona el Banco correspondiente y marca el formato como Activo.'
                ],
                verify: 'El formato se crea y al abrirlo navegas al editor visual (DesignerView).'
            },
            {
                title: 'Colocar y configurar los campos dinámicos en el lienzo',
                location: 'Editor Visual del Diseñador de Cheques',
                summary: 'Agrega los campos estándar que se rellenarán automáticamente con los datos de cada cheque.',
                instructions: [
                    'Coloca en el lienzo los campos esenciales: Fecha (o Día / Mes / Año / Fecha en Letras), Beneficiario, Monto en Números (*****1,250.00), Monto en Letras (*****UN MIL DOSCIENTOS CINCUENTA...*****), y si lleva voucher inferior: Concepto, Número de Cheque, Cuenta Bancaria y Empresa.',
                    'Ajusta posición X/Y (en milímetros), ancho máximo de caja, tamaño de fuente y alineación.',
                    'Guarda los cambios del formato.'
                ],
                verify: 'Todos los campos requeridos por el cheque físico están ubicados dentro del área imprimible sin superponerse.'
            },
            {
                title: 'Realizar prueba de calibración a contraluz (Cero desperdicio de cheques)',
                location: 'Prueba de Impresión en Hoja Blanca Carta',
                summary: 'Valida la alineación antes de meter un cheque real en la impresora.',
                instructions: [
                    'Imprime un cheque de prueba en una hoja blanca tamaño Carta (asegúrate en el diálogo de impresión del navegador que Escala esté en "100% / Tamaño real" y Márgenes en "Ninguno").',
                    'Coloca la hoja blanca impresa detrás de un cheque físico real y míralos a contraluz.',
                    'Si un campo quedó corrido 2 mm a la derecha o 3 mm arriba, regresa al Diseñador, ajusta sus coordenadas X/Y en milímetros exactos y guarda.',
                    'Repite hasta que todos los textos caigan exactamente sobre las líneas del cheque.'
                ],
                verify: 'La superposición a contraluz es exacta y el formato queda marcado como Activo.',
                tip: 'Una vez calibrado un banco, todas las cuentas de ese mismo banco en cualquier empresa del grupo heredarán automáticamente el formato al imprimir.',
                warning: 'Nunca pruebes un formato nuevo directamente sobre un cheque real de la chequera; usa siempre hoja blanca tamaño Carta primero.'
            }
        ],
        successChecklist: [
            'El formato está vinculado al banco correcto y marcado como Activo.',
            'El monto en letras tiene ancho suficiente para cifras largas sin cortarse.',
            'La prueba a contraluz en hoja Carta a escala 100% coincide perfectamente.'
        ],
        troubleshooting: [
            {
                symptom: 'En el diseñador se ve bien, pero impreso sale más pequeño y corrido hacia arriba.',
                cause: 'El navegador aplicó "Ajustar a página" o agregó encabezados/pies de página al imprimir.',
                solution: 'En la ventana de impresión selecciona Papel: Carta (Letter), Escala: 100% (Personalizado 100), Márgenes: Ninguno y desactiva Encabezados y pies de página.'
            }
        ]
    },
    {
        id: 'ban-impresion-cheques',
        category: 'bancos',
        title: 'Impresión de Cheques en Lote (Por Rango y Vista Previa Carta)',
        subtitle: 'Busca un rango numérico de cheques, excluye anulados/reservados, revisa la vista previa oficial tamaño Carta e imprime en lote sin errores.',
        route: '/dashboard/bancos/reportes/impresion-cheques',
        routeLabel: 'Impresión de Cheques',
        difficulty: 'Esencial',
        duration: '6 min',
        role: 'Tesorería / Bancos / Emisión de Pagos',
        tags: ['impresion', 'cheques', 'lote', 'rango', 'vista previa', 'carta', 'pdf', 'anulados', 'reservados'],
        objective: 'Imprimir uno o múltiples cheques correlativos en un solo PDF tamaño Carta (1 cheque por página), validando visualmente cada página antes de enviar a impresora.',
        prerequisites: [
            { label: 'Cheques ya registrados en Bancos → Cheques', route: '/dashboard/bancos/cheques', routeLabel: 'Cheques' },
            { label: 'Formato del banco calibrado y activo', route: '/dashboard/bancos/check-designer', routeLabel: 'Diseñador de Cheques' },
            { label: 'Cheques físicos colocados en la bandeja en el orden numérico exacto' }
        ],
        flowSteps: [
            '1. Seleccionar Cuenta (Autoselecciona Formato)',
            '2. Indicar Rango Desde # / Hasta #',
            '3. Verificar Exclusión de Anulados y Reservados',
            '4. Confirmar Selección y Monto Total',
            '5. Revisar en ReportPreviewModal (Carta) e Imprimir'
        ],
        steps: [
            {
                title: 'Seleccionar la Cuenta Bancaria y verificar el Formato autoseleccionado',
                location: 'Bancos → Reportes → Impresión de Cheques → Parámetros de Consulta',
                summary: 'Al elegir la cuenta, el sistema identifica el banco y selecciona automáticamente su formato guardado.',
                instructions: [
                    'Selecciona la "Cuenta Bancaria *" en el desplegable (ordenado por [BANCO] Nombre - Número).',
                    'Confirma que el campo "Formato Guardado *" haya seleccionado la plantilla correspondiente a ese banco. Si el banco tiene más de un formato, puedes cambiarlo manualmente.'
                ],
                verify: 'Tanto Cuenta Bancaria como Formato Guardado muestran valores válidos.'
            },
            {
                title: 'Ingresar el rango numérico (Desde # / Hasta #) y buscar',
                location: 'Campos compactos "Desde #" y "Hasta #" + Checkboxes de exclusión',
                summary: 'Consulta los cheques del lote filtrando automáticamente anulados y reservados.',
                instructions: [
                    'Digita el número inicial en "Desde #" y el número final en "Hasta #" (ambos valores numéricos; Desde debe ser menor o igual a Hasta).',
                    'Mantén marcadas las casillas "Excluir Anulados" y "Excluir Reservados" para que el sistema nunca desperdicie un folio imprimiendo un cheque anulado o reservado.',
                    'Haz clic en "Buscar".'
                ],
                verify: 'Se despliega la tabla con los cheques encontrados en ese rango y todos los válidos aparecen preseleccionados.'
            },
            {
                title: 'Validar la selección, cantidad de cheques y monto total',
                location: 'Tabla de Resultados y Barra de Totales',
                summary: 'Haz un control cruzado de folios y suma total antes de abrir el PDF.',
                instructions: [
                    'Revisa cada fila: Número de Cheque, Fecha, Beneficiario, Concepto y Monto.',
                    'Si deseas omitir algún cheque del lote, desmarca su casilla individual (o imprime un cheque puntual con el botón de impresora de su propia fila).',
                    'Verifica el resumen de "Cheques seleccionados" y "Monto Total Seleccionado" contra tu relación de pagos.'
                ],
                verify: 'El orden de los cheques seleccionados coincide exactamente con el orden de las hojas físicas en la bandeja de la impresora.'
            },
            {
                title: 'Previsualizar en ReportPreviewModal (Tamaño Carta) e imprimir a escala 100%',
                location: 'Botón "Imprimir Seleccionados" → ReportPreviewModal',
                summary: 'Inspecciona cada página del PDF Carta antes de enviar a papel.',
                instructions: [
                    'Haz clic en "Imprimir Seleccionados". El sistema construye un PDF tamaño Carta completo con una página por cheque y abre automáticamente ReportPreviewModal.',
                    'Navega las páginas en la vista previa para confirmar beneficiarios, montos en números y montos en letras.',
                    'Pulsa Imprimir en el visor y verifica en las opciones de la impresora: Tamaño Carta (Letter) y Escala 100% (NO "Ajustar a página").'
                ],
                verify: 'Todos los cheques del lote salen alineados y en su folio físico exacto.',
                warning: 'SIEMPRE confirma el orden de alimentación de tu impresora (cara arriba o cara abajo) antes de mandar lotes de más de 2 cheques.'
            }
        ],
        successChecklist: [
            'Se excluyeron cheques Anulados y Reservados.',
            'El orden de cheques en la bandeja coincide con el orden de páginas en ReportPreviewModal.',
            'La impresora se configuró en Carta / Escala 100% sin reescalado.'
        ],
        troubleshooting: [
            {
                symptom: 'La búsqueda dice "No se encontraron cheques en el rango indicado".',
                cause: 'Elegiste una cuenta bancaria distinta o invertiste Desde/Hasta.',
                solution: 'Verifica que la cuenta bancaria seleccionada sea la misma donde se emitieron esos correlativos.'
            }
        ]
    },
    {
        id: 'ban-reportes-bancarios',
        category: 'bancos',
        title: 'Reportes Bancarios y Saldos (Bancos, Chequera, Cheques y Movimientos)',
        subtitle: 'Comprende la diferencia entre Saldos en Bancos y Saldos en Chequera, y genera reportes oficiales por fecha en Excel y PDF Carta.',
        route: '/dashboard/bancos/reportes/saldos-bancos',
        routeLabel: 'Saldos en Bancos',
        difficulty: 'Esencial',
        duration: '7 min',
        role: 'Gerencia / Contabilidad / Tesorería',
        tags: ['reportes', 'saldos bancos', 'saldos chequera', 'cheques fecha', 'movimientos fecha', 'flujo neto', 'excel', 'pdf'],
        objective: 'Obtener visibilidad financiera exacta de la liquidez disponible (Bancos vs Chequera) y emitir reportes auditables por rango de fechas en Excel o PDF tamaño Carta.',
        prerequisites: [
            { label: 'Movimientos, cheques y conciliaciones actualizados', route: '/dashboard/bancos/conciliacion', routeLabel: 'Conciliación Bancaria' }
        ],
        flowSteps: [
            '1. Consultar Saldos en Bancos (Liquidez Aplicada)',
            '2. Contrastar con Saldos en Chequera (Incluye Tránsito)',
            '3. Emitir Cheques por Fecha (Emitidos vs Anulados)',
            '4. Emitir Movimientos por Fecha (Cargos, Abonos y Flujo Neto)'
        ],
        steps: [
            {
                title: 'Entender la diferencia clave: "Saldos en Bancos" vs "Saldos en Chequera"',
                location: 'Bancos → Reportes → Saldos en Bancos / Saldos en Chequera',
                summary: 'Usa el reporte correcto según quieras saber el dinero real en el banco o el dinero comprometido.',
                instructions: [
                    'Saldos en Bancos (/dashboard/bancos/reportes/saldos-bancos): muestra únicamente movimientos y cheques YA APLICADOS (conciliados). Refleja lo que el banco reconoce hoy.',
                    'Saldos en Chequera (/dashboard/bancos/reportes/saldos-chequera): incluye todos los cheques emitidos aunque el proveedor aún no los haya cobrado. Es tu liquidez REAL disponible para no sobregirarte.',
                    'En ambos reportes puedes exportar inmediatamente a Excel o abrir "Vista Previa / PDF" en tamaño Carta horizontal mediante ReportPreviewModal.'
                ],
                verify: 'Comprendes que la diferencia entre Saldo en Bancos y Saldo en Chequera corresponde a tus partidas en tránsito (cheques por cobrar y depósitos pendientes).',
                tip: 'Antes de aprobar una transferencia grande o un pedido de pipa, consulta siempre "Saldos en Chequera" para evitar sobregiros por cheques en circulación.'
            },
            {
                title: 'Generar Reporte de Cheques por Fecha',
                location: 'Bancos → Reportes → Cheques por Fecha',
                summary: 'Audita todos los cheques emitidos y anulados de una cuenta en un periodo determinado.',
                instructions: [
                    'Abre "Cheques por Fecha", selecciona la Cuenta Bancaria y el rango Desde / Hasta (por defecto del 1° del mes hasta hoy).',
                    'Usa los checkboxes "Excluir Anulados" y "Excluir Reservados" según el propósito del informe y pulsa Buscar.',
                    'Revisa los totales calculados automáticamente: Total Monto Emitido (excluye anulados) vs Total Monto Anulado.',
                    'Descarga en Excel (incluye Estado, Fecha Aplicado, No. Partida y Contabilizado) o genera el PDF Carta vertical en ReportPreviewModal.'
                ],
                verify: 'El reporte totaliza correctamente la emisión real del periodo sin sumar cheques anulados.'
            },
            {
                title: 'Generar Estado de Movimientos Bancarios por Fecha (Flujo Neto)',
                location: 'Bancos → Reportes → Movimientos por Fecha',
                summary: 'Analiza entradas (Abonos), salidas (Cargos) y el Flujo Neto de una cuenta en cualquier rango.',
                instructions: [
                    'Abre "Movimientos por Fecha", elige la Cuenta Bancaria, el rango Desde / Hasta y el filtro de Tipo: "TODOS", "CARGOS" o "ABONOS".',
                    'Presiona Buscar para ver las tarjetas de resumen: Total Cargos / Débitos, Total Abonos / Créditos y Flujo Neto del Período (Abonos - Cargos).',
                    'Exporta a Excel o abre la vista previa PDF Carta para archivo contable.'
                ],
                verify: 'El Flujo Neto cuadra con la variación entre el saldo inicial y final del periodo consultado.'
            }
        ],
        successChecklist: [
            'Se consultó Saldos en Chequera antes de comprometer nuevos egresos importantes.',
            'Los reportes PDF se previsualizaron en ReportPreviewModal tamaño Carta antes de imprimir.',
            'Los filtros de fecha y exclusión de anulados corresponden al cierre solicitado.'
        ],
        troubleshooting: [
            {
                symptom: 'Saldos en Bancos y Saldos en Chequera muestran una gran diferencia.',
                cause: 'Existen cheques ya cobrados en el banco que todavía no han sido aplicados en Conciliación Bancaria.',
                solution: 'Ve a Bancos → Conciliación Bancaria → pestaña PENDIENTES y aplica los cheques ya cobrados.'
            }
        ]
    }
];
