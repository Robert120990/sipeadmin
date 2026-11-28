export const BANCOS_TUTORIALS = [
    {
        id: 'ban-cuentas-bancarias',
        category: 'bancos',
        title: 'Cuentas Bancarias, Entidades y Saldo Inicial (Configuración Base)',
        subtitle: 'Registra bancos, crea cuentas por empresa, define Saldo Inicial y Fecha de corte inicial, enlaza la cuenta contable (cod_cta) y controla el estado activo.',
        route: '/dashboard/bancos/cuentas',
        routeLabel: 'Cuentas Bancarias',
        coverImage: '/tutorials/ban-cuentas-bancarias.webp',
        difficulty: 'Esencial',
        duration: '7 min',
        role: 'Tesorería / Contabilidad / Administrador',
        tags: ['cuentas', 'bancos', 'catalogo', 'cuenta contable', 'cod_cta', 'saldo inicial', 'fecha saldo inicial', 'activar', 'desactivar', 'empresa'],
        objective: 'Mantener un catálogo blindado y estandarizado de bancos y cuentas bancarias (con su saldo inicial y cuenta contable) para que Movimientos, Cheques, Conciliación y Control de Pagos cuadren con precisión.',
        prerequisites: [
            { label: 'Empresas y catálogo contable sincronizados en el sistema' },
            { label: 'Número de cuenta bancaria oficial, código contable (cod_cta) y saldo inicial (si es cuenta nueva sin historial previo)' }
        ],
        flowSteps: [
            '1. Verificar o Crear Entidad Bancaria',
            '2. Dar de Alta Cuenta y Cta. Contable',
            '3. Definir Saldo Inicial y Fecha (Opcional)',
            '4. Controlar Estado Activa / Inactiva'
        ],
        steps: [
            {
                title: 'Verificar si el Banco existe o crear una nueva Entidad Bancaria',
                location: 'Bancos → Cuentas Bancarias → Botón "Bancos" (o "+ Nuevo Banco" dentro del modal)',
                summary: 'Asegúrate de que la institución bancaria exista en el catálogo antes de crear cuentas nuevas.',
                instructions: [
                    'Haz clic en el botón "Bancos" ubicado junto a "Nueva Cuenta" (también puedes crearlo desde el selector de Banco eligiendo "Agregar nuevo banco...").',
                    'Usa el buscador del modal para confirmar que el banco no exista ya y evitar duplicados.',
                    'Si es un banco nuevo, escribe el Nombre del Banco, revisa el Código correlativo sugerido automáticamente y deja marcada la opción "Todas las empresas" para habilitarlo en todo el grupo.',
                    'Guarda la entidad bancaria.'
                ],
                verify: 'El banco aparece en el listado y queda disponible inmediatamente en el formulario de cuentas.'
            },
            {
                title: 'Crear o editar una Cuenta Bancaria y vincular Cuenta Contable (cod_cta)',
                location: 'Botón "Nueva Cuenta" (+) o icono Editar en la tabla',
                summary: 'Registra empresa, banco, tipo de cuenta, número único, nombre descriptivo y código contable.',
                instructions: [
                    'Pulsa "Nueva Cuenta" y selecciona la Empresa propietaria (esto filtra los bancos y tipos de cuenta válidos para esa empresa).',
                    'Selecciona el Banco y el Tipo de Cuenta (Corriente, Ahorro, etc.).',
                    'Digita el Número de Cuenta exacto (el sistema valida unicidad por empresa para evitar duplicados) y el Nombre Alterno / Representante claro (ej. "ANDELSA - CTA CTE OPERATIVA").',
                    'Completa el campo "Cta. Contable (cod_cta)" para evitar la advertencia amarilla "Sin Cta. Contable", y define opcionalmente el campo "Orden".'
                ],
                verify: 'La cuenta aparece en la tabla con su código contable en azul y estado "Activa", y en todos los selectores del sistema con el formato estándar [BANCO] Nombre - (Número).',
                warning: 'Al editar una cuenta existente, el campo Empresa queda bloqueado por seguridad: el sistema no permite cambiar de empresa una cuenta que ya tiene movimientos o cheques registrados.',
                screenshot: {
                    src: '/tutorials/ban-cuentas-bancarias.webp',
                    caption: 'Catálogo de Cuentas Bancarias con empresa, entidad bancaria, código contable (cod_cta), orden y estado Activa/Inactiva.'
                }
            },
            {
                title: 'Configurar Saldo Inicial y Fecha Saldo Inicial (Nuevo)',
                location: 'Modal Nueva / Editar Cuenta → Campos "Saldo Inicial ($)" y "Fecha Saldo Inicial"',
                summary: 'Establece el punto de partida contable de la cuenta para que Conciliación Bancaria calcule el saldo correcto.',
                instructions: [
                    'Si la cuenta ya contiene todo su historial inicial migrado en Movimientos Bancarios, deja "Saldo Inicial ($)" en 0.00 (valor por defecto).',
                    'Si abres una cuenta nueva o comienzas a conciliar a partir de una fecha de corte específica sin migrar años anteriores, ingresa el monto exacto en "Saldo Inicial ($)" y la fecha de corte en "Fecha Saldo Inicial".',
                    'Guarda los cambios. El sistema registra automáticamente en auditoría el estado anterior y posterior del saldo inicial.'
                ],
                verify: 'Al abrir esta cuenta en Bancos → Conciliación Bancaria, la barra inferior mostrará el Saldo Inicial configurado y lo incluirá automáticamente en la ecuación oficial de conciliación.',
                tip: 'Usar nombres consistentes con la estación o empresa facilita además la detección automática del OCR IA y el autocompletado en Control de Pagos.',
                screenshot: {
                    src: '/tutorials/ban-cuentas-modal.webp',
                    caption: 'Modal Nueva / Editar Cuenta Bancaria mostrando Banco (+ Gestionar), Tipo de Cuenta (+ Nuevo Tipo), Cta. Contable y Saldo Inicial.'
                }
            },
            {
                title: 'Activar o Desactivar cuentas cerradas sin perder historial',
                location: 'Columna Estado → Badge "Activa / Inactiva" (o interruptor en Editar)',
                summary: 'Inactiva cuentas en desuso de forma segura preservando su historial de auditoría y reportes.',
                instructions: [
                    'Localiza la cuenta usando el buscador (busca por número, nombre, empresa, banco o cuenta contable).',
                    'Haz clic sobre el badge de Estado ("Activa") y confirma el cambio a Inactiva.',
                    'Las cuentas inactivas bloquean nuevos registros en Movimientos y Cheques pero mantienen intacta su trazabilidad histórica.'
                ],
                verify: 'El badge cambia de verde (Activa) a rojo (Inactiva) y se muestra la notificación de confirmación.',
                warning: 'Antes de desactivar una cuenta, confirma en Conciliación Bancaria que no tenga partidas pendientes en tránsito ni períodos sin cuadrar.'
            }
        ],
        successChecklist: [
            'Cada cuenta bancaria activa tiene su Cuenta Contable (cod_cta) asignada.',
            'El Saldo Inicial y su Fecha están correctamente definidos (o en $0.00 si tiene historial completo).',
            'No existen bancos ni números de cuenta duplicados dentro de la misma empresa.'
        ],
        troubleshooting: [
            {
                symptom: 'El selector de Empresa aparece deshabilitado al editar una cuenta o muestra error 409.',
                cause: 'Por integridad contable, no se puede trasladar a otra empresa una cuenta que ya tiene movimientos o cheques asociados.',
                solution: 'Mantén la empresa original o crea una cuenta nueva bajo la empresa destino si corresponde a otro contribuyente.'
            },
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
        title: 'Movimientos Bancarios (Abonos, Cargos, Transferencias y Candados)',
        subtitle: 'Registra remesas, notas de cargo/abono y transferencias atómicas entre cuentas (TR), respetando la protección de movimientos conciliados y períodos cerrados.',
        route: '/dashboard/bancos/movimientos',
        routeLabel: 'Movimientos Bancarios',
        coverImage: '/tutorials/ban-movimientos-bancarios.webp',
        difficulty: 'Intermedio',
        duration: '9 min',
        role: 'Tesorería / Contabilidad / Auxiliar Bancario',
        tags: ['movimientos', 'abono', 'cargo', 'remesa', 'transferencia', 'entre cuentas', 'candado', 'conciliado', 'periodo cerrado', 'idempotencia', 'excel'],
        objective: 'Registrar con exactitud e integridad cada ingreso, egreso o traslado entre cuentas evitando duplicados y respetando los bloqueos de conciliación y cierre de período.',
        prerequisites: [
            { label: 'Cuentas bancarias activas configuradas', route: '/dashboard/bancos/cuentas', routeLabel: 'Cuentas Bancarias' },
            { label: 'Boleta de remesa, nota bancaria o comprobante de transferencia a la vista' }
        ],
        flowSteps: [
            '1. Filtrar Historial y Evitar Duplicados',
            '2. Elegir Empresa y Tipo de Remesa',
            '3. Registrar Abono/Cargo o Transferencia Atómica (TR)',
            '4. Respetar Candado Conciliado y Período Cerrado',
            '5. Validar o Exportar a Excel'
        ],
        steps: [
            {
                title: 'Consultar el historial y verificar si hay aviso de resultados truncados',
                location: 'Bancos → Movimientos Bancarios → Barra de Filtros',
                summary: 'Revisa los últimos 30 días (o tu rango de fechas) antes de ingresar un documento para evitar duplicados.',
                instructions: [
                    'Filtra por Empresa, Cuenta Bancaria y rango de fechas (Desde / Hasta) y presiona Consultar.',
                    'Usa la caja de búsqueda para filtrar en vivo por Número de Documento, Concepto o Llave.',
                    'Si aparece la franja amarilla indicando que se muestran los primeros registros de un total mayor, estrecha el rango de fechas o selecciona una cuenta específica para ver el listado completo.'
                ],
                verify: 'Confirmas que el número de documento/boleta que vas a ingresar aún no existe en la cuenta.',
                screenshot: {
                    src: '/tutorials/ban-movimientos-bancarios.webp',
                    caption: 'Pantalla principal de Movimientos Bancarios con filtros por empresa/cuenta/fechas, columnas Cargo/Abono, candado Conciliado y Excel.'
                }
            },
            {
                title: 'Registrar un Abono (Entrada) o un Cargo (Salida) con validación estricta',
                location: 'Botón "Nuevo Movimiento" (+)',
                summary: 'El indicador visual de Cargo/Abono confirma en tiempo real el signo del movimiento antes de guardar.',
                instructions: [
                    'Haz clic en "Nuevo Movimiento" y selecciona la Empresa (carga los tipos de remesa oficiales de esa empresa).',
                    'Selecciona el Tipo de Movimiento / Remesa y confirma el banner de color: Rojo "CARGO (-) / Salida de Fondos" (códigos 01, 03, NC, CH) o Verde "ABONO (+) / Entrada de Fondos" (RM, NA).',
                    'Elige la Cuenta Bancaria, Fecha del movimiento, Documento, Concepto claro y Monto (obligatoriamente mayor a $0.00).',
                    'Deja "Fecha Aplicado" vacía si aún no se refleja en el estado de cuenta bancario (se aplicará después en Conciliación Bancaria).',
                    'Pulsa "Guardar Movimiento". El sistema protege contra doble clic con clave de idempotencia (X-Idempotency-Key).'
                ],
                verify: 'El movimiento aparece en la tabla en la columna Cargo o Abono correcta y queda registrado en auditoría bancaria.',
                warning: 'Si la fecha ingresada cae dentro de un Período Cerrado de esa cuenta, el sistema bloqueará el registro (Error 423) hasta que se autorice una reapertura en Conciliación Bancaria.'
            },
            {
                title: 'Registrar una Transferencia Atómica entre Cuentas Propias (Tipo TR)',
                location: 'Modal Nuevo Movimiento → Tipo "TR / TRANSFERENCIA"',
                summary: 'Genera en una sola transacción atómica el débito en la cuenta origen y el crédito en la cuenta destino vinculados por grupo.',
                instructions: [
                    'Dentro de "Nuevo Movimiento", selecciona Empresa y elige el tipo "TR" (Transferencia).',
                    'Selecciona la "Cuenta a Debitar" (origen, recuadro rojo) y la "Cuenta a Acreditar" (destino, recuadro verde). Deben ser cuentas distintas y ambas estar activas.',
                    'Revisa el concepto autogenerado ("TRANSFERENCIA DE [Origen] PARA [Destino] / ") y complétalo con el motivo breve.',
                    'Ingresa Fecha, Referencia/Documento y Monto (> $0.00), y pulsa Guardar.',
                    'El sistema valida automáticamente que NINGUNA de las dos cuentas tenga período cerrado en esa fecha y crea ambos asientos atómicamente con un mismo transfer_group_id.'
                ],
                verify: 'Recibes la confirmación "Transferencia entre cuentas registrada con éxito" y ambos lados quedan reflejados con trazabilidad en auditoría.',
                tip: 'Al editar posteriormente uno de los movimientos de una transferencia, el modal se abre en modo movimiento individual para no alterar accidentalmente la contrapartida.',
                screenshot: {
                    src: '/tutorials/ban-movimientos-transferencia.webp',
                    caption: 'Modal de Transferencia Atómica entre cuentas (TR) con Cuenta a Debitar, Cuenta a Acreditar y carga de comprobante con OCR IA.'
                }
            },
            {
                title: 'Comprender el Candado de Seguridad ("🔒 Conciliado" y "Contabilizado") y Exportar Excel',
                location: 'Columna Acciones y botón "Exportar Excel"',
                summary: 'Los movimientos conciliados o contabilizados están blindados contra cambios o borrados accidentales.',
                instructions: [
                    'Si un movimiento aún no tiene Fecha Aplicado y no está contabilizado, verás los botones Editar y Eliminar.',
                    'Si un movimiento ya fue conciliado (tiene Fecha Aplicado), verás el candado verde "🔒 Conciliado" y los botones de edición/eliminación quedan bloqueados.',
                    'Para corregir un movimiento ya conciliado: primero ve a Bancos → Conciliación Bancaria, busca el documento en la pestaña MOVIMIENTOS y pulsa Desconciliar (X) — solo posible si su fecha no está en un período cerrado.',
                    'Usa "Exportar Excel" para descargar el detalle filtrado con Fecha, Fecha Aplicado, Llave, Documento, Empresa, Cuenta, Tipo, Concepto, Monto y Partida.'
                ],
                verify: 'Ningún movimiento ya conciliado o en período cerrado puede modificarse accidentalmente, garantizando que el saldo validado nunca se descuadre.'
            }
        ],
        successChecklist: [
            'Se verificó el indicador visual de CARGO (-) vs ABONO (+) antes de guardar.',
            'Las transferencias entre cuentas propias se registraron con tipo TR atómico.',
            'El monto es estrictamente mayor a $0.00 y no hay documentos duplicados.',
            'Para editar un movimiento con candado "Conciliado", se desconcilia primero desde Conciliación Bancaria.'
        ],
        troubleshooting: [
            {
                symptom: 'No aparecen los botones Editar ni Eliminar; solo sale un candado verde "Conciliado".',
                cause: 'Por blindaje bancario, los movimientos con Fecha Aplicado no pueden alterarse desde Movimientos Bancarios.',
                solution: 'Abre Bancos → Conciliación Bancaria, localízalo en MOVIMIENTOS, desconcílialo (si el período está abierto) y vuelve a editarlo.'
            },
            {
                symptom: 'Al guardar sale el error "La cuenta tiene período cerrado hasta DD/MM/AAAA".',
                cause: 'La fecha del movimiento (o de la cuenta origen/destino en una transferencia) corresponde a un corte ya cerrado.',
                solution: 'Verifica si la fecha es correcta; si genuinamente requiere ajuste histórico, solicita reapertura en Conciliación Bancaria → Períodos y Auditoría.'
            }
        ]
    },
    {
        id: 'ban-conciliacion-bancaria',
        category: 'bancos',
        title: 'Conciliación Bancaria Paso a Paso (Extracto Multibanco, Ecuación y $0.00)',
        subtitle: 'Domina el nuevo motor de conciliación: 8 bancos + Excel/CSV, detección de duplicados y cadena de saldos, ecuación de partidas en tránsito y cierre de período.',
        route: '/dashboard/bancos/conciliacion',
        routeLabel: 'Conciliación Bancaria',
        coverImage: '/tutorials/ban-conciliacion-principal.webp',
        difficulty: 'Avanzado',
        duration: '15 min',
        role: 'Contabilidad / Tesorería / Auditoría Bancaria',
        tags: ['conciliacion', 'extracto', 'multibanco', 'excel', 'csv', 'duplicados', 'cadena de saldos', 'ecuacion', 'transito', 'control pagos', 'validar saldo', 'diferencia', 'pdf'],
        objective: 'Cuadrar al centavo ($0.00 de diferencia real) el estado de cuenta bancario contra los libros aplicando la ecuación oficial de partidas en tránsito y dejando respaldo auditable.',
        prerequisites: [
            { label: 'Estado de cuenta bancario en Excel/CSV o copiado desde la banca en línea' },
            { label: 'Cuenta con Saldo Inicial verificado (si aplica)', route: '/dashboard/bancos/cuentas', routeLabel: 'Cuentas Bancarias' },
            { label: 'Movimientos, cheques y pagos bancarios de Control de Pagos registrados', route: '/dashboard/operaciones/recordatorios', routeLabel: 'Control de Pagos' }
        ],
        flowSteps: [
            '1. Elegir Empresa, Cuenta y Periodo',
            '2. Importar Extracto (Excel/CSV o Pegar)',
            '3. Procesar Sugerencias de CONTROL PAGOS',
            '4. Aplicar Partidas en PENDIENTES',
            '5. Verificar Ecuación Oficial → DIF REAL $0.00',
            '6. Procesar, Guardar Validación y (Opc.) Cerrar Período'
        ],
        steps: [
            {
                title: 'Seleccionar Empresa, Cuenta, Periodo y revisar Banners de Estado',
                location: 'Bancos → Conciliación Bancaria → Filtros Superiores y Banners',
                summary: 'Identifica al instante el estado de la última validación y si existe un período cerrado activo.',
                instructions: [
                    'Elige Empresa, Cuenta Bancaria (formato [BANCO] Nombre - Número) y el preset de Periodo ("Este Mes", "Mes Anterior", "Últimos 30 Días", "Últimos 3 Meses", "Hoy", "Ayer", "Año Actual" o "Personalizado") y pulsa "Filtrar".',
                    'Observa el Banner Superior de Validación: aparece en VERDE con escudo si la última validación está al día y la diferencia es $0.00, o en ROJO si hay diferencia o sin validación previa, mostrando fecha/hora El Salvador y monto de BANCO VALIDADO.',
                    'Si aparece el banner de "Período Cerrado hasta YYYY-MM-DD", recuerda que las fechas iguales o anteriores están bloqueadas con candado 🔒; los movimientos posteriores sí están abiertos para trabajar.'
                ],
                verify: 'Se cargan las 3 pestañas de trabajo: MOVIMIENTOS (conciliados), PENDIENTES (en tránsito) y CONTROL PAGOS (sugerencias).',
                screenshot: {
                    src: '/tutorials/ban-conciliacion-principal.webp',
                    caption: 'Conciliación Bancaria con banner verde de validación, período cerrado, ecuación en 3 tarjetas, Reglas IA, Cruces y pestañas de trabajo.'
                }
            },
            {
                title: 'Importar y Analizar el Extracto Bancario Multibanco (Excel/CSV o Pegado)',
                location: 'Botón "Importar Extracto" → Modal Importador Multibanco',
                summary: 'Carga archivos Excel/CSV o pega filas de cualquiera de los 8 bancos soportados con verificación automática de integridad.',
                instructions: [
                    'Haz clic en "Importar Extracto". Deja el Formato en "-- Auto Detección Inteligente --" o selecciona manualmente entre: Promerica, BAC Credomatic, Davivienda, Hipotecario, Cuscatlán, Agrícola, Atlántida o Abank/Constelación.',
                    'Sube el archivo Excel/CSV (.xlsx, .xls, .csv) desde "Cargar Archivo Excel / CSV" (lee fechas de forma segura en dd/mm/yyyy) O pega directamente las filas copiadas con Ctrl+V, y pulsa "Analizar Extracto".',
                    'Revisa la barra de Diagnóstico del Extracto antes de procesar:',
                    '• Total Cargos y Total Abonos detectados.',
                    '• Cadena de Saldos: verifica matemáticamente el saldo corrido del extracto e informa si el orden es ascendente/descendente y el Saldo Final del Extracto.',
                    '• Alerta de Archivo Repetido: te avisa con fecha/hora exacta si ese mismo archivo (hash) ya fue importado antes.',
                    '• Filas Omitidas: si el parser descartó encabezados o filas sin monto, pulsa "Ver N fila(s) omitida(s)" para auditar por qué se excluyeron.'
                ],
                verify: 'El diagnóstico muestra totales coherentes, la cadena de saldos está verificada y puedes ver el estado de cruce de cada fila.',
                screenshot: {
                    src: '/tutorials/ban-conciliacion-extracto.webp',
                    caption: 'Importador Multibanco (Excel/CSV/PDF/Imágenes IA) mostrando cadena de saldos verificada, cruces automáticos, duplicados omitidos y Cruce Agrupado Manual.'
                }
            },
            {
                title: 'Revisar Cruces, Alertas de Monto y Procesar el Extracto Atómicamente',
                location: 'Tabla de Resultados del Importador Multibanco',
                summary: 'Aprovecha la protección contra duplicados, atiende alertas de diferencia de monto y concilia en bloque con la fecha real del banco.',
                instructions: [
                    'Identifica los 4 estados posibles en la columna "ESTADO DE CRUCE":',
                    '• Verde (Cruce con Cheque/Mov): coincidencia exacta lista para conciliar. Puedes conciliar una fila puntual con "Conciliar" o todas a la vez con "Conciliar Coincidencias" (usa la fecha real de cada línea del extracto).',
                    '• Ámbar (Ya conciliado previamente): duplicado probable — el sistema lo desmarca y bloquea automáticamente para que jamás dupliques registros.',
                    '• Rojo (Doc coincide pero difiere por $X): alerta de diferencia de monto — el procesamiento masivo se detiene por seguridad hasta que la revises manualmente con el botón "Asignar".',
                    '• Gris (Nuevo sin coincidencia, ej. comisiones bancarias o transferencias no registradas): pulsa "Asignar" para elegir entre "Crear Nuevo Movimiento" (con concepto sugerido y tipo de remesa filtrado por Cargo/Abono) o "Vincular a Pendiente Existente".',
                    'Cuando toda tu selección esté revisada, pulsa "Procesar Seleccionados (N)": en UNA SOLA transacción atómica concilia las coincidencias existentes y crea/aplica los movimientos nuevos.'
                ],
                verify: 'Las transacciones pasan a "✓ Listo / Conciliado en esta sesión" y los saldos principales se actualizan de inmediato.',
                warning: 'Si intentas cerrar el modal con transacciones válidas aún sin procesar, el sistema te pedirá confirmación para evitar perder tu análisis.'
            },
            {
                title: 'Procesar Sugerencias en "CONTROL PAGOS" y Aplicar Partidas en "PENDIENTES"',
                location: 'Pestaña "CONTROL PAGOS", Pestaña "PENDIENTES" y Botón "+ Nuevo Movimiento"',
                summary: 'Concilia los abonos venidos desde Operaciones y aplica cheques cobrados o remesas pendientes.',
                instructions: [
                    'Abre la pestaña "CONTROL PAGOS (N)": verás los pagos bancarios registrados en Operaciones → Control de Pagos con acceso directo a "Ver comprobante". Usa "Vincular" (si ya existe el movimiento en libros), "Crear y Conciliar" (si no existía) o "Descartar".',
                    'Abre la pestaña "PENDIENTES (N)": define la "Fecha Aplicado", marca los cheques/movimientos que ya fueron cobrados en el banco y pulsa "CONCILIAR (N)" — o usa el botón rápido ✓ en cada fila para conciliar uno solo.',
                    'Si detectas un cargo/abono faltante y no usaste el importador, pulsa "+ Nuevo Movimiento" en la barra superior para crearlo y marcarlo conciliado inmediatamente sin salir de esta pantalla.'
                ],
                verify: 'En PENDIENTES quedan únicamente las partidas genuinamente en tránsito (cheques aún no cobrados por proveedores y remesas aún no acreditadas).'
            },
            {
                title: 'Comprobar la Ecuación Oficial de Conciliación hasta DIF REAL = $0.00',
                location: 'Barra Inferior de Totales y Desglose de Partidas en Tránsito',
                summary: 'Entiende cómo el sistema calcula exactamente el Saldo Conciliado y la Diferencia Real.',
                instructions: [
                    'Digita en "*SALDO EN BANCO" el saldo final exacto de tu estado de cuenta real al corte (el campo queda protegido contra sobreescrituras por Socket.io mientras estás trabajando).',
                    'Verifica la Ecuación Oficial desplegada en la franja inferior: Saldo en Chequera (Libros) − Abonos en Tránsito + Cheques y Cargos en Tránsito = Saldo Conciliado.',
                    'Observa también si aparece la etiqueta azul de "Saldo Inicial" o el aviso ámbar de "cheque(s) retenido(s)/reservado(s) excluidos" (estos no distorsionan tu cuadre).',
                    'Confirma que "DIF REAL" (= Saldo en Banco − Saldo Conciliado) sea $0.00 en verde con el icono de check.'
                ],
                verify: 'DIF REAL marca $0.00 en verde y todas las partidas en tránsito son verificables.',
                tip: 'Si necesitas corregir un documento o concepto en un registro abierto (no contabilizado y fuera de período cerrado), haz clic en Editar (lápiz). Editar el monto requiere el permiso especial edit_monto_conciliacion.'
            },
            {
                title: 'Procesar, Guardar Validación, (Opcional) Cerrar Período y Emitir PDF Carta',
                location: 'Botón "PROCESAR Y GUARDAR" y Botones "Excel" / "Vista Previa / PDF"',
                summary: 'Graba la instantánea oficial en el servidor, cierra el corte si corresponde y genera el reporte PDF Carta.',
                instructions: [
                    'Haz clic en "PROCESAR Y GUARDAR" para abrir el modal de confirmación con el desglose completo al corte seleccionado.',
                    'Escribe tus "Notas de Validación" (ej. "Conciliación mensual cuadrada a $0.00").',
                    'Si el corte del mes/quincena está definitivo y tienes permiso, marca "Cerrar período de conciliación al [fecha]" para blindar esa fecha contra cambios retroactivos (si hubiese diferencia distinta de $0.00, el sistema exige una segunda casilla de confirmación explícita).',
                    'Pulsa "Confirmar Validación" (o "Validar y Cerrar Período").',
                    'Por último, genera los respaldos con "Excel" o "Vista Previa / PDF" (tamaño Carta horizontal con totales de Cargos, Abonos y Neto) desde la pestaña activa (MOVIMIENTOS, PENDIENTES o CONTROL PAGOS).'
                ],
                verify: 'El banner superior cambia a VERDE con la fecha/hora exacta de validación, el monto validado y el período cerrado registrado.',
                screenshot: {
                    src: '/tutorials/ban-conciliacion-validar.webp',
                    caption: 'Modal de Validación de Saldo y Cierre de Período con resumen de ecuación oficial, notas de validación y opción de sellar corte.'
                }
            }
        ],
        successChecklist: [
            'Se analizó el extracto bancario verificando totales, cadena de saldos y filas omitidas.',
            'Todas las alertas rojas de diferencia de monto fueron resueltas antes de procesar.',
            'Todas las sugerencias de CONTROL PAGOS fueron atendidas.',
            'La ecuación oficial cuadra con DIF REAL = $0.00.',
            'Se guardó la validación (y se cerró el período si corresponde al cierre oficial) y se archivó el PDF Carta.'
        ],
        troubleshooting: [
            {
                symptom: 'El importador bloquea "Procesar Seleccionados" avisando filas con alerta de diferencia de monto.',
                cause: 'El número de documento coincide con un pendiente en libros, pero el monto del banco difiere del monto registrado.',
                solution: 'Haz clic en "Asignar" en esa fila roja, verifica cuál es el monto correcto del banco y vincula o corrige el registro antes de procesar el lote.'
            },
            {
                symptom: 'Al subir el extracto sale alerta amarilla "Este archivo ya fue importado anteriormente".',
                cause: 'El hash criptográfico del archivo coincide con una importación previa de esta cuenta.',
                solution: 'Revisa los registros en amarillo "Ya conciliado previamente" (quedan omitidos automáticamente) y procesa solo líneas genuinamente nuevas si las hubiera.'
            },
            {
                symptom: 'Un movimiento en MOVIMIENTOS tiene candado 🔒 y no deja editar ni desconciliar.',
                cause: 'El registro está contabilizado o pertenece a un Período Cerrado.',
                solution: 'Si es por período cerrado, solicita una reapertura desde "Períodos y Auditoría" → "Solicitar Reapertura".'
            },
            {
                symptom: 'DIF REAL coincide exactamente con el doble de un movimiento.',
                cause: 'Un Cargo fue registrado como Abono (o viceversa).',
                solution: 'Divide la diferencia entre 2, busca ese monto exacto en MOVIMIENTOS y corrige su naturaleza tras desconciliarlo.'
            }
        ]
    },
    {
        id: 'ban-periodos-auditoria',
        category: 'bancos',
        title: 'Cierre de Períodos Bancarios, Reaperturas y Auditoría',
        subtitle: 'Protege tus conciliaciones cerradas contra cambios retroactivos, gestiona solicitudes formales de reapertura con aprobación y audita cada acción bancaria.',
        route: '/dashboard/bancos/conciliacion',
        routeLabel: 'Conciliación Bancaria',
        coverImage: '/tutorials/ban-conciliacion-periodos.webp',
        difficulty: 'Intermedio',
        duration: '7 min',
        role: 'Contabilidad / Auditoría / Administrador',
        tags: ['periodos', 'cierre', 'reapertura', 'solicitud', 'aprobar', 'rechazar', 'auditoria', 'candado', 'bloqueo', 'control interno'],
        objective: 'Garantizar la inmutabilidad de los meses ya conciliados y controlar de manera formal, aprobada y auditable cualquier reapertura excepcional.',
        prerequisites: [
            { label: 'Conciliación de la cuenta cuadrada al corte deseado', route: '/dashboard/bancos/conciliacion', routeLabel: 'Conciliación Bancaria' },
            { label: 'Para aprobar reaperturas: rol Administrador o permiso approve_reapertura_conciliacion', route: '/dashboard/permissions', routeLabel: 'Permisos' }
        ],
        flowSteps: [
            '1. Cerrar Período al Validar Saldo',
            '2. Verificar Bloqueo Activo (Candados 🔒)',
            '3. Solicitar Reapertura (Motivo ≥ 10 caract.)',
            '4. Aprobar / Rechazar o Reabrir Directo',
            '5. Revisar Pestaña Auditoría Bancaria'
        ],
        steps: [
            {
                title: 'Cerrar un Período de Conciliación al finalizar el corte',
                location: 'Conciliación Bancaria → Botón "PROCESAR Y GUARDAR" → Casilla "Cerrar período"',
                summary: 'Sella todas las fechas hasta el corte para impedir alteraciones accidentales en Movimientos, Cheques y Conciliación.',
                instructions: [
                    'Cuadra la cuenta hasta la fecha de corte deseada (ej. último día del mes) y haz clic en "PROCESAR Y GUARDAR".',
                    'Marca la casilla "Cerrar período de conciliación al [fecha]".',
                    'Si la diferencia real es $0.00, pulsa directamente "Validar y Cerrar Período". Si hubiera una diferencia excepcional, el sistema exigirá marcar la confirmación explícita adicional antes de permitir el cierre.'
                ],
                verify: 'Aparece el banner superior "Período Cerrado hasta YYYY-MM-DD" y todos los movimientos/cheques de fechas anteriores quedan protegidos con candado 🔒 en todo el módulo Bancos.'
            },
            {
                title: 'Solicitar una Reapertura Formal cuando se requiere un ajuste histórico',
                location: 'Banner "Período Cerrado" → "Solicitar Reapertura" (o Modal "Períodos y Auditoría")',
                summary: 'Cualquier usuario contable puede solicitar reapertura dejando justificación escrita para aprobación gerencial.',
                instructions: [
                    'Haz clic en "Solicitar Reapertura" en el banner de período cerrado (o abre "Períodos y Auditoría" → pestaña "Períodos" → botón "Solicitar" en el corte cerrado).',
                    'Escribe un "Motivo detallado de la reapertura" (obligatorio, mínimo 10 caracteres) explicando qué documento o ajuste requiere modificación.',
                    'Pulsa "Enviar Solicitud de Reapertura". El Administrador y aprobadores recibirán notificación inmediata y verán un contador ámbar en el botón "Períodos y Auditoría".'
                ],
                verify: 'La solicitud aparece en la pestaña "Solicitudes de Reapertura" con estado PENDIENTE, fecha/hora y nombre del solicitante.'
            },
            {
                title: 'Aprobar, Rechazar o Reabrir Directamente (Rol Administrador / Aprobador)',
                location: 'Botón "Períodos y Auditoría" → Pestañas "Solicitudes de Reapertura" y "Períodos"',
                summary: 'Resuelve solicitudes con trazabilidad completa o ejecuta una reapertura directa autorizada.',
                instructions: [
                    'Haz clic en "Períodos y Auditoría" (si hay solicitudes pendientes se abre directamente en la pestaña "Solicitudes de Reapertura").',
                    'Revisa cuenta, fecha de corte, solicitante y motivo.',
                    'Escribe un comentario de resolución (obligatorio de mínimo 5 caracteres si vas a Rechazar) y pulsa "Aprobar" o "Rechazar".',
                    'Alternativamente, un aprobador puede ir a la pestaña "Períodos" y pulsar "Reabrir Directo" sobre un período cerrado.',
                    'Al aprobarse la reapertura, el estado del período pasa a REABIERTO y se desbloquean las modificaciones para corregir el documento; al terminar el ajuste, vuelve a validar y cerrar el período.'
                ],
                verify: 'El período cambia de CERRADO a REABIERTO, registrando quién cerró y quién autorizó la reapertura.',
                warning: 'No dejes un período reabierto indefinidamente; apenas termines el ajuste puntual, vuelve a ejecutar "PROCESAR Y GUARDAR" marcando "Cerrar período".',
                screenshot: {
                    src: '/tutorials/ban-conciliacion-periodos.webp',
                    caption: 'Modal de Períodos y Auditoría Bancaria con solicitudes de reapertura pendientes, motivo detallado y botones Aprobar / Rechazar.'
                }
            },
            {
                title: 'Consultar la Bitácora de Auditoría Bancaria de la Cuenta',
                location: 'Modal "Períodos y Auditoría" → Pestaña "Auditoría Bancaria"',
                summary: 'Inspecciona quién creó, editó, concilió, anuló, cerró o reabrió cualquier documento de la cuenta.',
                instructions: [
                    'Abre "Períodos y Auditoría" y cambia a la pestaña "Auditoría Bancaria".',
                    'Revisa el historial cronológico con Fecha/Hora (El Salvador), Usuario, Acción (ej. CREATE_TRANSFER_DEBIT, CONCILIAR, CLOSE_PERIOD, REOPEN_PERIOD), Entidad/ID y Detalle/Motivo.',
                    'Pasa el cursor sobre la columna Detalle/Motivo para inspeccionar los valores anteriores y posteriores (before/after) de cada cambio.'
                ],
                verify: 'Cuentas con evidencia completa y auditable para revisiones internas o contables.'
            }
        ],
        successChecklist: [
            'Todo mes cuadrado y revisado se sella marcando "Cerrar período de conciliación".',
            'Cualquier ajuste en un mes cerrado pasa por solicitud formal con motivo claro.',
            'Tras corregir un ajuste en un período reabierto, el período vuelve a cerrarse.'
        ],
        troubleshooting: [
            {
                symptom: 'No veo el botón "Aprobar / Rechazar" ni "Reabrir Directo".',
                cause: 'Tu usuario no tiene rol Administrador ni el permiso especial approve_reapertura_conciliacion.',
                solution: 'Envía la solicitud mediante "Solicitar Reapertura" para que un Administrador o usuario autorizado la apruebe.'
            }
        ]
    },
    {
        id: 'ban-cheques',
        category: 'bancos',
        title: 'Gestión y Emisión de Cheques (Blindaje, Anulación con Auditoría e Impresión)',
        subtitle: 'Emite cheques con validación de montos e idempotencia, anula resguardando los datos originales en auditoría, respeta el candado Conciliado e imprime.',
        route: '/dashboard/bancos/cheques',
        routeLabel: 'Cheques',
        coverImage: '/tutorials/ban-cheques.webp',
        difficulty: 'Esencial',
        duration: '8 min',
        role: 'Tesorería / Contabilidad / Administración',
        tags: ['cheques', 'emitir', 'anulado', 'auditoria', 'no emitido', 'candado', 'conciliado', 'imprimir', 'beneficiario', 'partida'],
        objective: 'Emitir y controlar la numeración correlativa de cheques sin duplicados ni saltos, resguardando evidencia histórica al anular y protegiendo cheques ya conciliados.',
        prerequisites: [
            { label: 'Cuenta bancaria activa en el sistema', route: '/dashboard/bancos/cuentas', routeLabel: 'Cuentas Bancarias' },
            { label: 'Formato de cheque diseñado y activo para el banco', route: '/dashboard/bancos/check-designer', routeLabel: 'Diseñador de Cheques' }
        ],
        flowSteps: [
            '1. Filtrar Cuenta y Revisar Correlativo',
            '2. Crear Nuevo Cheque (Valor > $0.00)',
            '3. Anular con Resguardo Automático (si aplica)',
            '4. Imprimir Cheque Individual o en Lote',
            '5. Conciliar al Cobro (Queda con Candado 🔒)'
        ],
        steps: [
            {
                title: 'Verificar el último correlativo emitido y revisar alertas de límite',
                location: 'Bancos → Cheques → Filtros Empresa / Cuenta / Fechas',
                summary: 'Confirma el último folio físico emitido y refina filtros si el historial excede 1,500 registros.',
                instructions: [
                    'Filtra por Empresa, Cuenta Bancaria (formato [BANCO] Nombre - Número) y rango de fechas, y presiona el botón de filtrar.',
                    'Si aparece el aviso amarillo "Mostrando los primeros X de Y cheques", acota el rango de fechas o la cuenta para ver todos los registros.',
                    'Usa la caja "Buscar..." para localizar cheques por beneficiario, número, concepto o llave.'
                ],
                verify: 'Conoces el número correlativo exacto del cheque físico que vas a emitir.',
                screenshot: {
                    src: '/tutorials/ban-cheques.webp',
                    caption: 'Módulo de Cheques con correlativos, badges Emitido / Contado / Anulado y el candado verde Conciliado en cheques ya aplicados.'
                }
            },
            {
                title: 'Registrar un Nuevo Cheque con validación estricta e idempotencia',
                location: 'Botón "Nuevo Cheque" (+)',
                summary: 'Captura fecha, número, valor (> $0.00 para cheques activos), beneficiario y concepto sin riesgo de doble registro.',
                instructions: [
                    'Haz clic en "Nuevo Cheque", selecciona Empresa y Cuenta Bancaria.',
                    'Ingresa Fecha de Emisión, Cheque # exacto (correlativo de la chequera), Valor ($) mayor a $0.00, Beneficiario ("A Nombre"), Concepto (se convierte automáticamente a mayúsculas) y No. Partida si aplica.',
                    'Deja "Fecha Aplicado" vacía al emitirlo (se asignará al cobrarse en Conciliación Bancaria).',
                    'Pulsa "Guardar Cheque". El botón muestra "Guardando..." con protección X-Idempotency-Key para evitar duplicados.'
                ],
                verify: 'El cheque aparece en la tabla con estado "Emitido" y sin fecha aplicado.',
                warning: 'No podrás registrar ni modificar cheques con fecha dentro de un Período Cerrado de esa cuenta.',
                screenshot: {
                    src: '/tutorials/ban-cheques-modal.webp',
                    caption: 'Modal de emisión de cheques con empresa, cuenta bancaria, correlativo, beneficiario, concepto e interruptores de estado.'
                }
            },
            {
                title: 'Anular o marcar "No Emitido" con resguardo automático en auditoría',
                location: 'Modal Editar / Nuevo Cheque → Sección "Estado del Cheque"',
                summary: 'Al anular, el sistema protege el monto en $0 pero guarda en auditoría el valor, beneficiario y concepto originales.',
                instructions: [
                    'Anulado (interruptor rojo): cuando un cheque físico se dañó o se canceló, activa "Anulado". Automáticamente el formulario coloca valor $0 y el texto "***** CHEQUE ANULADO *****", bloqueando los campos.',
                    'Resguardo en Auditoría: el sistema guarda automáticamente el valor original, beneficiario original y concepto original en campos de auditoría (valor_original, beneficiario_original, concepto_original) para trazabilidad contable.',
                    'Si activaste "Anulado" por equivocación antes de guardar, vuelve a apagar el interruptor y el formulario restaurará tus textos y monto originales.',
                    'No Emitido (interruptor gris): úsalo cuando un folio no salió físicamente a circulación (permite monto $0.00 y queda excluido del Total Emitido en reportes).'
                ],
                verify: 'El cheque anulado conserva su número de folio con valor tachado y badge rojo "Anulado", sin borrar la secuencia correlativa.',
                warning: 'Nunca elimines un cheque físico que ya ocupó un correlativo en la chequera; anúlalo para conservar el rastro auditable.'
            },
            {
                title: 'Respetar el Candado "🔒 Conciliado" e imprimir con trazabilidad',
                location: 'Columna Acciones → Icono Impresora / Candado Conciliado',
                summary: 'Los cheques ya conciliados o contabilizados no pueden editarse ni eliminarse; cada impresión queda registrada.',
                instructions: [
                    'Para imprimir un cheque puntual, pulsa el icono de impresora (o ve a Bancos → Reportes → Impresión de Cheques para previsualizar en PDF Carta e imprimir en lote). El sistema registra usuario, fecha y número de impresiones.',
                    'Observa que cualquier cheque con Fecha Aplicado muestra el candado verde "🔒 Conciliado" en lugar de Editar/Eliminar: para modificarlo, primero debes desconciliarlo en Conciliación Bancaria (si su período sigue abierto).'
                ],
                verify: 'El cheque sale alineado con monto en letras protegido con asteriscos (*****) y los cheques conciliados permanecen blindados.'
            }
        ],
        successChecklist: [
            'El número de cheque coincide exactamente con el folio físico de la chequera.',
            'El cheque activo tiene valor estrictamente mayor a $0.00.',
            'Los cheques dañados se marcaron como Anulados (conservando datos originales en auditoría).',
            'Los cheques ya conciliados muestran candado "Conciliado" y no se alteran sin desconciliar primero.'
        ],
        troubleshooting: [
            {
                symptom: 'No aparece el botón Editar ni Eliminar en un cheque, solo "🔒 Conciliado".',
                cause: 'El cheque ya tiene Fecha Aplicado en Conciliación Bancaria.',
                solution: 'Desconcilia el cheque en Bancos → Conciliación Bancaria (si el período está abierto) para habilitar su edición.'
            },
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
        title: 'Cheques de Contado (Solicitudes, Sincronización e Idempotencia)',
        subtitle: 'Atiende solicitudes de pago de contado de estaciones, sincroniza cheques existentes, genera o asigna con blindaje anti-duplicados y desvincula si hay error.',
        route: '/dashboard/bancos/cheques-contado',
        routeLabel: 'Cheques Contado',
        coverImage: '/tutorials/ban-cheques-contado.webp',
        difficulty: 'Intermedio',
        duration: '7 min',
        role: 'Tesorería / Bancos / Oficina Central',
        tags: ['cheques contado', 'solicitudes', 'estaciones', 'sincronizar', 'ya emitido', 'generar', 'desvincular', 'idempotencia', 'ccf'],
        objective: 'Liquidar oportunamente las solicitudes de pago de contado de las estaciones evitando emisiones dobles gracias a la sincronización automática y claves de idempotencia.',
        prerequisites: [
            { label: 'Solicitudes de pago de contado registradas por las estaciones en RRS' },
            { label: 'Cuentas bancarias activas configuradas y período abierto', route: '/dashboard/bancos/cuentas', routeLabel: 'Cuentas Bancarias' }
        ],
        flowSteps: [
            '1. Seleccionar Estación y Consultar Pendientes',
            '2. Ejecutar "Sincronizar Emitidos" (Detección Auto)',
            '3. Elegir "Generar" o "Ya Emitido" (Protegido)',
            '4. Verificar Número de Cheque Vinculado'
        ],
        steps: [
            {
                title: 'Consultar las solicitudes pendientes de la estación',
                location: 'Bancos → Cheques Contado → Selector Estación + "Solo pendientes"',
                summary: 'Lista todas las facturas/CCF de contado que esperan emisión o asignación de cheque.',
                instructions: [
                    'Selecciona la Estación en el desplegable superior.',
                    'Mantén encendido el interruptor "Solo pendientes" para ver únicamente las solicitudes sin cheque asignado.',
                    'Presiona "Consultar". En el extremo derecho verás el total de solicitudes y la suma en dólares.'
                ],
                verify: 'La tabla muestra Fecha, Proveedor, Nombre, Tipo Destino (D), Monto, Fecha Entrega, No. CCF y estado PENDIENTE.',
                screenshot: {
                    src: '/tutorials/ban-cheques-contado.webp',
                    caption: 'Emisión de Cheques de Contado con filtro de estación, interruptor Solo pendientes, Sincronizar Emitidos y acciones por solicitud.'
                }
            },
            {
                title: 'Ejecutar primero "Sincronizar Emitidos" para detectar cheques existentes',
                location: 'Botón "Sincronizar Emitidos"',
                summary: 'Empareja automáticamente solicitudes con cheques que ya fueron registrados en el libro de bancos.',
                instructions: [
                    'Antes de emitir cualquier cheque nuevo, haz clic en "Sincronizar Emitidos".',
                    'El sistema cruza las solicitudes pendientes contra el libro de bancos y vincula automáticamente las coincidencias con la etiqueta azul "Auto".',
                    'Revisa la notificación con la cantidad de cheques sincronizados.'
                ],
                verify: 'Las solicitudes que ya tenían cheque emitido salen de PENDIENTE, eliminando el riesgo de pagos duplicados.',
                tip: 'Haz de "Sincronizar Emitidos" tu primer paso obligatorio cada vez que cambies de estación.'
            },
            {
                title: 'Usar "Generar" vs "Ya Emitido" con blindaje anti-duplicados',
                location: 'Columna Acción → Botón verde "Ya Emitido" o Botón azul "Generar"',
                summary: 'El sistema envía clave de idempotencia (X-Idempotency-Key) y valida período cerrado y correlativos antes de crear el cheque.',
                instructions: [
                    'Usa "Generar" cuando el cheque TODAVÍA NO existe en el libro de bancos: elige la Cuenta Bancaria, digita el Número de Cheque y confirma. Se crea automáticamente en Bancos con concepto "PAGO A PROVEEDOR (CONTADO)" y se vincula a la solicitud.',
                    'Usa "Ya Emitido" cuando el cheque ya existe físicamente/manualmente: digita el Número de Cheque. Si además deseas crear el asiento en el libro de bancos, activa "Registrar en bancos" y selecciona la cuenta.',
                    'Si la fecha de la solicitud corresponde a un período cerrado en esa cuenta bancaria o el número ya está duplicado, el servidor mostrará el mensaje exacto de bloqueo.'
                ],
                verify: 'La solicitud muestra el número de cheque en verde y desaparece de "Solo pendientes".',
                warning: 'No uses "Generar" si el cheque ya estaba registrado en Bancos → Cheques; para esos casos usa "Sincronizar Emitidos" o "Ya Emitido" sin marcar "Registrar en bancos".'
            },
            {
                title: 'Desvincular un cheque si hubo error de asignación',
                location: 'Vista con "Solo pendientes" apagado → Botón Desvincular',
                summary: 'Revierte una vinculación incorrecta devolviendo la solicitud a PENDIENTE.',
                instructions: [
                    'Apaga "Solo pendientes" y pulsa "Consultar" para mostrar las solicitudes ya vinculadas.',
                    'En la fila incorrecta, haz clic en Desvincular y confirma en el cuadro de seguridad.'
                ],
                verify: 'La solicitud vuelve a estado PENDIENTE para reasignar el número correcto.'
            }
        ],
        successChecklist: [
            'Se ejecutó "Sincronizar Emitidos" antes de generar cheques nuevos.',
            'El monto y proveedor coinciden con el No. CCF.',
            'No existen cheques duplicados entre Cheques Contado y Cheques.'
        ],
        troubleshooting: [
            {
                symptom: 'Al generar un cheque aparece un mensaje de período cerrado.',
                cause: 'La fecha de la solicitud cae dentro de un corte ya cerrado en Conciliación Bancaria para esa cuenta.',
                solution: 'Verifica la cuenta bancaria seleccionada o gestiona la reapertura/ajuste en Conciliación Bancaria → Períodos y Auditoría.'
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
        coverImage: '/tutorials/ban-disenador-cheques.webp',
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
                verify: 'El formato se crea y al abrirlo navegas al editor visual (DesignerView).',
                screenshot: {
                    src: '/tutorials/ban-disenador-cheques.webp',
                    caption: 'Administrador de Formatos del Diseñador de Cheques mostrando plantillas activas por banco calibradas en tamaño Carta.'
                }
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
                    'Imprime un cheque de prueba en una hoja blanca tamaño Carta (en el diálogo de impresión asegúrate de que Escala esté en "100% / Tamaño real" y Márgenes en "Ninguno").',
                    'Coloca la hoja blanca impresa detrás de un cheque físico real y míralos a contraluz.',
                    'Si un campo quedó corrido unos milímetros, regresa al Diseñador, ajusta sus coordenadas X/Y exactas y guarda.',
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
                solution: 'En la ventana de impresión selecciona Papel: Carta (Letter), Escala: 100%, Márgenes: Ninguno y desactiva Encabezados y pies de página.'
            }
        ]
    },
    {
        id: 'ban-impresion-cheques',
        category: 'bancos',
        title: 'Impresión de Cheques en Lote (Por Rango y Vista Previa Carta)',
        subtitle: 'Busca un rango numérico de cheques, excluye anulados/reservados/no emitidos, revisa la vista previa oficial tamaño Carta e imprime en lote sin errores.',
        route: '/dashboard/bancos/reportes/impresion-cheques',
        routeLabel: 'Impresión de Cheques',
        coverImage: '/tutorials/ban-impresion-cheques.webp',
        difficulty: 'Esencial',
        duration: '6 min',
        role: 'Tesorería / Bancos / Emisión de Pagos',
        tags: ['impresion', 'cheques', 'lote', 'rango', 'vista previa', 'carta', 'pdf', 'anulados', 'reservados', 'reimpresion'],
        objective: 'Imprimir uno o múltiples cheques correlativos en un solo PDF tamaño Carta (1 cheque por página), validando visualmente cada página antes de enviar a impresora.',
        prerequisites: [
            { label: 'Cheques ya registrados en Bancos → Cheques', route: '/dashboard/bancos/cheques', routeLabel: 'Cheques' },
            { label: 'Formato del banco calibrado y activo', route: '/dashboard/bancos/check-designer', routeLabel: 'Diseñador de Cheques' },
            { label: 'Cheques físicos colocados en la bandeja en el orden numérico exacto' }
        ],
        flowSteps: [
            '1. Seleccionar Cuenta (Autoselecciona Formato)',
            '2. Indicar Rango Desde # / Hasta #',
            '3. Excluir Anulados, Reservados y No Emitidos',
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
                    'Confirma que el campo "Formato Guardado *" haya seleccionado la plantilla correspondiente a ese banco.'
                ],
                verify: 'Tanto Cuenta Bancaria como Formato Guardado muestran valores válidos.'
            },
            {
                title: 'Ingresar el rango numérico (Desde # / Hasta #) y buscar',
                location: 'Campos compactos "Desde #" y "Hasta #" + Checkboxes de exclusión',
                summary: 'Consulta los cheques del lote filtrando automáticamente anulados, reservados y no emitidos.',
                instructions: [
                    'Digita el número inicial en "Desde #" y el número final en "Hasta #" (Desde debe ser menor o igual a Hasta).',
                    'Mantén marcadas las casillas "Excluir Anulados" y "Excluir Reservados" (esta última también omite los marcados como No Emitido) para no desperdiciar folios.',
                    'Haz clic en "Buscar".'
                ],
                verify: 'Se despliega la tabla con los cheques válidos preseleccionados.',
                screenshot: {
                    src: '/tutorials/ban-impresion-cheques.webp',
                    caption: 'Impresión de Cheques en Lote con autoselección de formato, rango Desde/Hasta, exclusión de anulados/reservados y tabla seleccionable.'
                }
            },
            {
                title: 'Validar la selección, cantidad de cheques y monto total',
                location: 'Tabla de Resultados y Barra de Totales',
                summary: 'Haz un control cruzado de folios y suma total antes de abrir el PDF.',
                instructions: [
                    'Revisa cada fila: Número de Cheque, Fecha, Beneficiario, Concepto y Monto.',
                    'Si deseas omitir algún cheque del lote, desmarca su casilla individual (o imprime un cheque puntual con el botón de impresora de su fila).',
                    'Verifica el resumen de "Cheques seleccionados" y "Monto Total Seleccionado" contra tu relación de pagos.'
                ],
                verify: 'El orden de los cheques seleccionados coincide exactamente con el orden de las hojas físicas en la bandeja de la impresora.'
            },
            {
                title: 'Previsualizar en ReportPreviewModal (Tamaño Carta) e imprimir a escala 100%',
                location: 'Botón "Imprimir Seleccionados" → ReportPreviewModal',
                summary: 'Inspecciona cada página del PDF Carta antes de enviar a papel.',
                instructions: [
                    'Haz clic en "Imprimir Seleccionados". El sistema construye un PDF tamaño Carta completo (1 cheque por página) y abre automáticamente ReportPreviewModal.',
                    'Navega las páginas en la vista previa para confirmar beneficiarios, montos en números y montos en letras.',
                    'Pulsa Imprimir en el visor verificando: Tamaño Carta (Letter) y Escala 100% (NO "Ajustar a página").'
                ],
                verify: 'Todos los cheques del lote salen alineados en su folio físico exacto.',
                warning: 'SIEMPRE confirma el orden de alimentación de tu impresora (cara arriba o cara abajo) antes de mandar lotes de más de 2 cheques.'
            }
        ],
        successChecklist: [
            'Se excluyeron cheques Anulados, Reservados y No Emitidos.',
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
        subtitle: 'Distingue Saldos en Bancos vs Saldos en Chequera y genera reportes exactos de Cheques (excluyendo anulados/reservados/no emitidos) y Movimientos por Fecha.',
        route: '/dashboard/bancos/reportes/saldos-bancos',
        routeLabel: 'Saldos en Bancos',
        coverImage: '/tutorials/ban-reportes-movimientos-fecha.webp',
        difficulty: 'Esencial',
        duration: '7 min',
        role: 'Gerencia / Contabilidad / Tesorería',
        tags: ['reportes', 'saldos bancos', 'saldos chequera', 'cheques fecha', 'no emitido', 'movimientos fecha', 'flujo neto', 'excel', 'pdf'],
        objective: 'Obtener visibilidad financiera exacta de la liquidez disponible (Bancos vs Chequera) y emitir reportes auditables por rango de fechas en Excel o PDF tamaño Carta.',
        prerequisites: [
            { label: 'Movimientos, cheques y conciliaciones actualizados', route: '/dashboard/bancos/conciliacion', routeLabel: 'Conciliación Bancaria' }
        ],
        flowSteps: [
            '1. Consultar Saldos en Bancos (Liquidez Aplicada)',
            '2. Contrastar con Saldos en Chequera (Incluye Tránsito)',
            '3. Emitir Cheques por Fecha (Total Emitido Depurado)',
            '4. Emitir Movimientos por Fecha (Cargos, Abonos y Flujo Neto)'
        ],
        steps: [
            {
                title: 'Entender la diferencia clave: "Saldos en Bancos" vs "Saldos en Chequera"',
                location: 'Bancos → Reportes → Saldos en Bancos / Saldos en Chequera',
                summary: 'Usa el reporte correcto según quieras saber el saldo conciliado en banco o la liquidez real comprometida.',
                instructions: [
                    'Saldos en Bancos (/dashboard/bancos/reportes/saldos-bancos): refleja movimientos y cheques YA APLICADOS (conciliados). Equivale a lo reconocido por el banco.',
                    'Saldos en Chequera (/dashboard/bancos/reportes/saldos-chequera): incluye todos los cheques emitidos aunque aún estén en tránsito (no cobrados). Es tu liquidez REAL disponible para no sobregirarte.',
                    'En ambos reportes puedes exportar a Excel o abrir "Vista Previa / PDF" en tamaño Carta horizontal mediante ReportPreviewModal.'
                ],
                verify: 'Comprendes que la diferencia entre Saldo en Bancos y Saldo en Chequera corresponde a las partidas en tránsito que detalla Conciliación Bancaria.',
                tip: 'Antes de aprobar una transferencia grande o un pedido de pipa, consulta siempre "Saldos en Chequera" para evitar sobregiros por cheques en circulación.',
                screenshot: {
                    src: '/tutorials/ban-reportes-saldos.webp',
                    caption: 'Reporte de Saldos en Bancos / Chequera mostrando liquidez por cuenta bancaria, totales y botones Excel / PDF Carta.'
                }
            },
            {
                title: 'Generar Reporte de Cheques por Fecha y Antigüedad en Circulación (Aging)',
                location: 'Bancos → Reportes → Cheques por Fecha',
                summary: 'Audita cheques emitidos, anulados, reservados y no emitidos, y controla su antigüedad (0-30d, 31-90d, 91-180d, >180d caducos) con totales depurados.',
                instructions: [
                    'Abre "Cheques por Fecha", selecciona la Cuenta Bancaria y el rango Desde / Hasta (por defecto del 1° del mes hasta hoy).',
                    'Usa los checkboxes "Excluir Anulados" y "Excluir Reservados" y los filtros rápidos de Antigüedad en Circulación (Pendientes, 0-30d, 31-90d, 91-180d, Por caducar 150-180d, >180d Caducos).',
                    'Observa los badges diferenciados por estado: EMITIDO (verde), ANULADO (rojo), RESERVADO (ámbar) y NO EMITIDO (gris).',
                    'Verifica el "Total Monto Emitido": el sistema excluye automáticamente cheques Anulados, Reservados y No Emitidos para reflejar únicamente el desembolso real emitido.',
                    'Descarga en Excel o genera el PDF Carta vertical en ReportPreviewModal.'
                ],
                verify: 'El reporte totaliza únicamente la emisión real vigente y alerta sobre cheques pendientes por caducar (>150 días).',
                screenshot: {
                    src: '/tutorials/ban-reportes-cheques-fecha.webp',
                    caption: 'Reporte de Cheques por Fecha con resumen de Antigüedad en Circulación (Aging) y Total Emitido depurado.'
                }
            },
            {
                title: 'Generar el Libro Auxiliar de Bancos (Kardex) con Saldo Corrido',
                location: 'Bancos → Reportes → Movimientos por Fecha (Libro Auxiliar / Kardex)',
                summary: 'Analiza Saldo Inicial, Total Abonos, Total Cargos, Saldo Final y Saldo Corrido línea a línea combinando movimientos y cheques.',
                instructions: [
                    'Abre "Movimientos por Fecha", elige la Cuenta Bancaria, el rango Desde / Hasta y el filtro de Estado: "Todos", "Solo Conciliados" o "Solo En Tránsito".',
                    'Presiona "Consultar Kardex" para ver las 5 tarjetas de resumen: Saldo Inicial del Período, Total Abonos (+), Total Cargos (-), Neto del Período y Saldo Final.',
                    'Revisa la columna "Saldo Corrido" en cada línea y los badges "Conciliado" / "En tránsito", y exporta a Excel o abre la vista previa PDF Carta para archivo contable.'
                ],
                verify: 'El Saldo Corrido final cuadra exactamente con Saldo Inicial + Total Abonos − Total Cargos del período consultado.',
                screenshot: {
                    src: '/tutorials/ban-reportes-movimientos-fecha.webp',
                    caption: 'Libro Auxiliar de Bancos (Kardex) con Saldo Inicial, Abonos, Cargos, Saldo Corrido línea a línea y estado de conciliación.'
                }
            }
        ],
        successChecklist: [
            'Se consultó Saldos en Chequera antes de comprometer nuevos egresos importantes.',
            'Los reportes PDF se previsualizaron en ReportPreviewModal tamaño Carta antes de imprimir.',
            'En Cheques por Fecha se validó que Anulados, Reservados y No Emitidos no distorsionen el Total Emitido.'
        ],
        troubleshooting: [
            {
                symptom: 'Saldos en Bancos y Saldos en Chequera muestran una gran diferencia.',
                cause: 'Existen cheques ya cobrados en el banco que todavía no han sido aplicados en Conciliación Bancaria.',
                solution: 'Ve a Bancos → Conciliación Bancaria → pestaña PENDIENTES (o usa Importar Extracto) y aplica los cheques ya cobrados.'
            }
        ]
    }
];
