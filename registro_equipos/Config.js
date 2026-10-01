const REGISTRO_CONFIG = Object.freeze({
  SPREADSHEET_ID: '1LuPBr--e14q2Kyf_KBydut9HIBffPpZa5Ua_aD1nrN0',
  REPORT_APP_URL: 'https://script.google.com/macros/s/AKfycbyloFTlhmSDMk5zlMUyC95zBX68RIQxqLaoNI6f99flq5l-fuuYcpPyHctTEAeadnCgiw/exec',
  SHEET_NAME: 'EQUIPOS',
  ACCESS_PROPERTY: 'EQUIPMENT_ADMIN_EMAILS'
});

const EQUIPMENT_HEADERS = Object.freeze([
  'ID_EQUIPO', 'CODIGO_EQUIPO', 'TIPO_EQUIPO', 'NOMBRE_ORIGINAL', 'NOMBRE',
  'MARCA', 'MODELO', 'INFORMACION', 'EMPRESA', 'UBICACION', 'AREA', 'ESTATUS',
  'NUMERO_GLOBAL_TIPO', 'NUMERO_LOCAL_SEDE', 'REEMPLAZA_ID_EQUIPO',
  'REEMPLAZADO_POR_ID_EQUIPO', 'CODIGO_ANTERIOR', 'IMAGEN_URL', 'QR_LEGACY_URL',
  'ACTIVO', 'CREADO_EN', 'ACTUALIZADO_EN'
]);

const EQUIPMENT_CATALOG = Object.freeze({
  categories: [
    {code: 'A', name: 'Almacenamiento'},
    {code: 'E', name: 'Equipo'},
    {code: 'M', name: 'Maquinaria'},
    {code: 'B', name: 'Mobiliario'},
    {code: 'U', name: 'Utensilio de producción'},
    {code: 'V', name: 'Vehículo'}
  ],
  types: {
    A: [['CA','Carretilla'],['CT','Cesta'],['PL','Paleta'],['ZH','Transpaleta']],
    E: [['BM','Biométrico'],['CS','Cámara'],['CR','Comandera'],['CU','CPU'],['ES','Escalera'],['FT','Filtro'],['IE','Impresora de etiquetas'],['IF','Impresora fiscal'],['IM','Impresora'],['LP','Lámpara'],['LT','Laptop'],['MN','Monitor'],['RT','Router'],['SR','Servidor'],['SC','Sistema de cámaras'],['SS','Sistema de sonido'],['TB','Tablet'],['TQ','Tanque'],['TC','Teclado'],['TV','Televisor']],
    M: [['AB','Abatidor'],['AA','Aire acondicionado'],['BL','Balanza'],['BO','Boleadora'],['BB','Bomba de agua'],['CF','Cafetera'],['CD','Calentador de agua'],['CV','Cava cuarto'],['CL','Chiller'],['CC','Cocina'],['CP','Compresor de aire'],['CN','Cortina de aire'],['DI','Deshidratador'],['DH','Deshumidificador'],['DS','Dispensador'],['EC','Elevador de carga'],['EP','Exprimidor'],['EX','Extractor'],['FC','Fechadora'],['FM','Fermentadora'],['FH','Fabricador de hielo'],['FG','Fregadero'],['FD','Freidora'],['FR','Formadora'],['HN','Horno'],['HF','Horno fermentadora'],['LM','Laminadora'],['LV','Lavadora industrial'],['LS','Lavadora secadora'],['LI','Licuadora'],['MH','Máquina de helado'],['MS','Mesa'],['MZ','Mezcladora'],['MC','Microondas'],['ML','Molino'],['NB','Nebulizador'],['PN','Plancha'],['PC','Porcionadora'],['RB','Rebanadora'],['RF','Refrigeración'],['RL','Rellenadora'],['SM','Santamaría'],['SE','Selladora'],['SB','Sistema de bombeo de agua'],['SD','Sobadora'],['SV','Sous Vide'],['TT','Tostadora'],['TF','Transformador'],['VT','Ventilador']],
    B: [['ET','Estantería'],['FG','Fregadero'],['LC','Locker'],['MS','Mesa'],['MT','Mostrador'],['SL','Silla'],['SF','Sofá']],
    U: [['AH','Aros de hamburguesa'],['BD','Bandeja'],['BW','Bowl'],['PG','Pistola de galletas']],
    V: [['CM','Camión'],['MO','Moto'],['VN','Van']]
  },
  companies: [
    ['A','Alimentos PB2'],['B','Alimentos PB2 Los Palos Grandes'],
    ['G','Grupo Pan de Tata La Candelaria'],['K','Inversiones K Food'],
    ['S','PB2 Sabana Grande'],['P','Panificadora Costa Dorada 3088'],
    ['M','La Merma'],['R','Las Reses Sociales'],['T','La Tata de la Libertad']
  ],
  locations: [
    ['CV','Caracas, Av. Victoria, CC Multiplaza Victoria'],['CB','Caracas, Bello Campo'],
    ['CC','Caracas, La Candelaria, CC Sambil'],['CP','Caracas, Los Palos Grandes'],
    ['CR','Caracas, Sabana Grande, CC El Recreo'],
    ['CA','Caracas, Centro de Acción Social para la Música'],
    ['LG','Centro Comercial Ágora, La Guaira'],['CH','Caracas, CC Sambil Chacao'],
    ['CS','Caracas, San Luis, CC San Luis']
  ],
  areas: [
    ['EM','Área de empaquetado'],['HO','Área de hojaldre'],['BT','Área de procesamiento de batata'],
    ['PR','Área de producción'],['PT','Área de producto terminado'],['CA','Área de Calidad'],
    ['AL','Área de almacén'],['SM','Servicios Generales y Mantenimiento Mecánico'],
    ['TD','Tienda'],['ZC','Zona de clientes'],['LR','Las Reses'],['AH','Área de preparado de huevo'],
    ['CS','Cuarto de cámaras'],['OF','Oficina Producción'],['P2','Piso 2, Torre Delta'],
    ['P7','Piso 7, Torre Delta'],['LO','Despacho y logística'],['AZ','Azotea'],['EV','Eventos'],
    ['CC','Cocina'],['CM','Comedor'],['CB','Cuarto de bombas'],['PM','Área de premezclado'],
    ['DL','Delivery'],['TT','La Tata'],['LV','Lavandería'],['ST','Sótano'],['B1','Barra #1'],
    ['B2','Barra #2'],['ES','Estacionamiento']
  ]
});
