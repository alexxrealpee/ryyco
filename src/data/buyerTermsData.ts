/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BuyerTermSection {
  id: string;
  number: string;
  title: string;
  content: string;
  points?: string[];
  subsections?: {
    letter?: string;
    label: string;
    text: string;
  }[];
}

export const BUYER_TERMS_PREAMBLE = {
  title: "TÉRMINOS Y CONDICIONES PARA USUARIOS Y COMPRADORES DE RYYCO/RICO",
  lastUpdated: "2 de septiembre de 2026",
  text: "Bienvenido a RYYCO/Rico, plataforma tecnológica que permite a los usuarios consultar productos y establecimientos, realizar pedidos y comunicarse con restaurantes, comercios y demás vendedores registrados en la plataforma.\n\nAl registrarse, navegar, realizar un pedido o utilizar cualquiera de las funcionalidades de RYYCO/Rico, el usuario declara que ha leído y acepta estos Términos y Condiciones."
};

export const BUYER_TERMS_SECTIONS: BuyerTermSection[] = [
  {
    id: "informacion_usuario",
    number: "1",
    title: "INFORMACIÓN DEL USUARIO",
    content: "Para realizar determinados pedidos o utilizar funcionalidades de la plataforma, RYYCO/Rico podrá solicitar información necesaria para identificar al usuario y gestionar correctamente la compra y entrega.\n\nEsta información podrá incluir:",
    points: [
      "Nombre y apellido.",
      "Número de teléfono celular.",
      "Dirección de entrega.",
      "Información de referencia para la entrega.",
      "Correo electrónico, cuando corresponda.",
      "Información relacionada con el pedido."
    ],
    subsections: [
      {
        label: "Deber de Veracidad",
        text: "El usuario se compromete a proporcionar información veraz, completa, actualizada y correcta. El usuario será responsable de mantener actualizada su información y de informar cualquier cambio que pueda afectar la correcta realización o entrega de sus pedidos."
      }
    ]
  },
  {
    id: "uso_datos_pedido",
    number: "2",
    title: "USO DE LOS DATOS PARA LA GESTIÓN DEL PEDIDO",
    content: "El usuario acepta que los datos necesarios para gestionar un pedido puedan ser utilizados y comunicados a los establecimientos correspondientes y, cuando sea necesario para realizar la entrega, a los domiciliarios o prestadores encargados del servicio.\n\nLa información será utilizada exclusivamente en la medida necesaria para gestionar la solicitud, preparar el pedido, comunicarse con el usuario, realizar la entrega, resolver inconvenientes, atender reclamaciones y cumplir las obligaciones legales correspondientes.\n\nRYYCO/Rico no autoriza al establecimiento, domiciliario o tercero receptor de dicha información a utilizar los datos del usuario para finalidades diferentes a aquellas relacionadas con el pedido o aquellas que cuenten con una base legal o autorización independiente."
  },
  {
    id: "direccion_entrega",
    number: "3",
    title: "DIRECCIÓN Y DATOS DE ENTREGA",
    content: "El usuario deberá proporcionar una dirección de entrega correcta y suficiente para permitir la localización del lugar donde desea recibir su pedido.\n\nEl usuario será responsable de verificar que la dirección, teléfono y demás información proporcionada sean correctos.\n\nCuando una entrega no pueda realizarse debido a una dirección incorrecta, incompleta, inexistente o a la imposibilidad de contactar al usuario después de realizar los intentos razonables de contacto, RYYCO/Rico y/o el establecimiento podrán adoptar las medidas correspondientes de acuerdo con las condiciones particulares del pedido."
  },
  {
    id: "realizacion_pedidos",
    number: "4",
    title: "REALIZACIÓN DE PEDIDOS",
    content: "El usuario podrá seleccionar los productos disponibles en los establecimientos publicados en RYYCO/Rico y solicitar un pedido mediante las funcionalidades habilitadas en la plataforma.\n\nLa disponibilidad, precio, descripción, ingredientes, fotografías, promociones, horarios y demás características de los productos serán proporcionados por el establecimiento vendedor.\n\nLa incorporación de un producto a la plataforma no significa que RYYCO/Rico sea el fabricante, preparador o propietario del producto.\n\nUna vez realizado el pedido, este podrá estar sujeto a la aceptación y disponibilidad del establecimiento."
  },
  {
    id: "responsabilidad_productos",
    number: "5",
    title: "RESPONSABILIDAD SOBRE LOS PRODUCTOS",
    content: "Los restaurantes y establecimientos vendedores son responsables de los productos que ofrecen a través de RYYCO/Rico, incluyendo, cuando corresponda:",
    points: [
      "Preparación de los alimentos.",
      "Calidad e inocuidad de los productos.",
      "Ingredientes e información suministrada.",
      "Cumplimiento de las condiciones sanitarias aplicables.",
      "Cantidad y características del producto.",
      "Precio publicado.",
      "Disponibilidad.",
      "Empaque.",
      "Cumplimiento de las condiciones de la oferta."
    ],
    subsections: [
      {
        label: "Intermediación Tecnológica",
        text: "RYYCO/Rico actúa como plataforma tecnológica y canal de intermediación y/o contacto entre usuarios y establecimientos, de acuerdo con las funcionalidades disponibles. Lo anterior se entiende sin perjuicio de las obligaciones legales que puedan corresponder a RYYCO/Rico conforme a la legislación colombiana."
      }
    ]
  },
  {
    id: "domicilios_entrega",
    number: "6",
    title: "DOMICILIOS Y ENTREGA",
    content: "Las condiciones de entrega podrán variar dependiendo del establecimiento, ubicación del usuario, disponibilidad de domiciliarios y demás circunstancias relacionadas con el pedido.\n\nCuando el domicilio sea realizado directamente por el establecimiento, este será responsable de la gestión correspondiente.\n\nCuando la entrega sea realizada mediante un domiciliario o servicio de entrega asociado a RYYCO/Rico, se aplicarán las condiciones informadas al usuario durante el proceso de compra.\n\nLos tiempos de entrega indicados en la plataforma son estimados y pueden verse afectados por condiciones de tráfico, clima, alta demanda, disponibilidad del establecimiento, preparación de los alimentos, ubicación del usuario u otras circunstancias razonables."
  },
  {
    id: "pagos",
    number: "7",
    title: "PAGOS",
    content: "El usuario deberá realizar el pago de acuerdo con los medios de pago disponibles para cada establecimiento o pedido.\n\nLos precios de los productos y, cuando corresponda, los costos de domicilio u otros cargos aplicables serán informados al usuario antes de finalizar el pedido.\n\nCuando el pago sea realizado directamente al establecimiento, este será responsable de la recepción y gestión del pago correspondiente.\n\nCuando se utilice un proveedor externo de pagos, el procesamiento podrá estar sujeto a los términos y condiciones y políticas de privacidad de dicho proveedor."
  },
  {
    id: "cancelacion_pedidos",
    number: "8",
    title: "CANCELACIÓN DE PEDIDOS",
    content: "Una vez que un establecimiento haya comenzado a preparar un pedido, la posibilidad de cancelarlo podrá estar limitada.\n\nLas condiciones de cancelación podrán depender del estado del pedido, del establecimiento y de las circunstancias particulares de la compra.\n\nCuando exista un incumplimiento atribuible al establecimiento o un problema relacionado con el pedido, el usuario podrá comunicarse con RYYCO/Rico y/o con el establecimiento para solicitar la solución correspondiente.\n\nNada de lo establecido en estos Términos limita los derechos que el consumidor tenga reconocidos por la legislación colombiana."
  },
  {
    id: "reclamaciones_novedades",
    number: "9",
    title: "RECLAMACIONES Y NOVEDADES CON EL PEDIDO",
    content: "Si el usuario recibe un producto diferente al solicitado, incompleto, en condiciones inadecuadas o presenta cualquier otra novedad relacionada con su pedido, deberá reportarla a través de los canales de atención disponibles.\n\nRYYCO/Rico podrá solicitar información, fotografías u otros elementos necesarios para analizar la situación y gestionar la solicitud con el establecimiento correspondiente.\n\nLas reclamaciones serán gestionadas de acuerdo con la naturaleza del caso, la responsabilidad del establecimiento o tercero involucrado y las disposiciones de protección al consumidor aplicables."
  },
  {
    id: "proteccion_datos",
    number: "10",
    title: "PROTECCIÓN DE DATOS PERSONALES",
    content: "RYYCO/Rico realizará el tratamiento de los datos personales de los usuarios de conformidad con la Constitución Política de Colombia, la Ley 1581 de 2012, sus normas reglamentarias y la Política de Tratamiento de Datos Personales de RYYCO/Rico.\n\nLos datos podrán ser tratados para finalidades relacionadas con:",
    points: [
      "Creación y administración de la cuenta.",
      "Procesamiento y gestión de pedidos.",
      "Comunicación con el usuario.",
      "Coordinación de entregas.",
      "Atención de solicitudes, peticiones, quejas y reclamos.",
      "Seguridad de la plataforma.",
      "Prevención y detección de fraude.",
      "Gestión administrativa y operativa.",
      "Cumplimiento de obligaciones legales.",
      "Las demás finalidades informadas al usuario y permitidas por la legislación aplicable."
    ],
    subsections: [
      {
        label: "Derechos del Titular de Datos",
        text: "El usuario podrá ejercer los derechos reconocidos por la legislación colombiana respecto de sus datos personales, de acuerdo con los procedimientos establecidos en la Política de Tratamiento de Datos Personales de RYYCO/Rico."
      }
    ]
  },
  {
    id: "info_compartida",
    number: "11",
    title: "INFORMACIÓN COMPARTIDA CON RESTAURANTES Y DOMICILIARIOS",
    content: "Para poder prestar correctamente el servicio, RYYCO/Rico podrá compartir con el establecimiento encargado de preparar el pedido la información estrictamente necesaria para gestionarlo.\n\nCuando exista servicio de domicilio, podrán compartirse con la persona encargada de realizar la entrega los datos necesarios para efectuarla, como nombre, teléfono y dirección de entrega.\n\nEl acceso a dicha información deberá limitarse a las finalidades necesarias para cumplir con el pedido y las obligaciones derivadas del servicio."
  },
  {
    id: "comunicaciones",
    number: "12",
    title: "COMUNICACIONES",
    content: "El usuario acepta recibir comunicaciones relacionadas directamente con sus pedidos, incluyendo confirmaciones, cambios de estado, novedades, cancelaciones, información de entrega y comunicaciones necesarias para la prestación del servicio.\n\nLas comunicaciones comerciales o promocionales se realizarán de acuerdo con la legislación aplicable y las preferencias o autorizaciones correspondientes del usuario."
  },
  {
    id: "seguridad_informacion",
    number: "13",
    title: "SEGURIDAD DE LA INFORMACIÓN",
    content: "RYYCO/Rico adoptará medidas razonables de seguridad destinadas a proteger la información personal de los usuarios frente a accesos, usos, modificaciones o divulgaciones no autorizadas.\n\nNo obstante, ningún sistema tecnológico conectado a Internet puede garantizar seguridad absoluta.\n\nEl usuario deberá mantener bajo su responsabilidad las credenciales de acceso a su cuenta, cuando estas existan, y deberá informar oportunamente cualquier uso no autorizado que detecte."
  },
  {
    id: "uso_adecuado",
    number: "14",
    title: "USO ADECUADO DE LA PLATAFORMA",
    content: "El usuario se compromete a utilizar RYYCO/Rico de manera lícita y adecuada. Está prohibido:",
    points: [
      "Crear cuentas utilizando información falsa.",
      "Suplantar a otra persona.",
      "Realizar pedidos fraudulentos.",
      "Utilizar la plataforma para perjudicar deliberadamente a establecimientos o domiciliarios.",
      "Realizar solicitudes falsas o abusivas.",
      "Utilizar mecanismos automatizados para afectar el funcionamiento de la plataforma sin autorización.",
      "Intentar acceder a información o cuentas de otros usuarios.",
      "Utilizar la plataforma para actividades contrarias a la legislación colombiana."
    ],
    subsections: [
      {
        label: "Medidas Disciplinarias y de Seguridad",
        text: "RYYCO/Rico podrá adoptar medidas sobre cuentas que presenten comportamientos fraudulentos, abusivos o contrarios a estos Términos, respetando las obligaciones legales aplicables."
      }
    ]
  },
  {
    id: "menores_edad",
    number: "15",
    title: "MENORES DE EDAD",
    content: "El uso de la plataforma por parte de menores de edad deberá realizarse bajo la responsabilidad y supervisión de sus padres, representantes legales o responsables.\n\nCuando una operación requiera capacidad legal para contratar, esta deberá realizarse por una persona que tenga dicha capacidad o mediante su representante legal."
  },
  {
    id: "propiedad_intelectual",
    number: "16",
    title: "PROPIEDAD INTELECTUAL",
    content: "Los elementos propios de RYYCO/Rico, incluyendo software, diseño, logotipos, marcas, textos, interfaces, gráficos y demás contenidos desarrollados por la plataforma, estarán protegidos por las normas colombianas aplicables en materia de propiedad intelectual.\n\nLos contenidos publicados por los establecimientos pertenecen a sus respectivos titulares, quienes serán responsables de contar con los derechos y autorizaciones necesarios para su publicación."
  },
  {
    id: "modificacion_terminos",
    number: "17",
    title: "MODIFICACIÓN DE LOS TÉRMINOS",
    content: "RYYCO/Rico podrá actualizar o modificar estos Términos y Condiciones cuando sea necesario, especialmente cuando existan cambios legales, tecnológicos, operativos o en las funcionalidades de la plataforma.\n\nLas modificaciones serán publicadas mediante los medios disponibles y comenzarán a regir en los términos informados en la actualización."
  },
  {
    id: "legislacion_colombiana",
    number: "18",
    title: "LEGISLACIÓN COLOMBIANA",
    content: "Estos Términos y Condiciones se regirán e interpretarán de acuerdo con las leyes de la República de Colombia.\n\nEn particular, serán aplicables, en cuanto correspondan:",
    points: [
      "Constitución Política de Colombia, especialmente el artículo 15 sobre protección de la intimidad y datos personales.",
      "Ley 1480 de 2011 – Estatuto del Consumidor, incluyendo las disposiciones relacionadas con comercio electrónico y protección del consumidor.",
      "Ley 1581 de 2012 – Régimen General de Protección de Datos Personales.",
      "Ley 527 de 1999 – Comercio Electrónico y Mensajes de Datos.",
      "Decreto 1074 de 2015, en las disposiciones aplicables a protección de datos personales y protección al consumidor.",
      "Las demás normas colombianas que modifiquen, adicionen, reglamenten o sustituyan las anteriores."
    ]
  },
  {
    id: "derechos_consumidor",
    number: "19",
    title: "DERECHOS DEL CONSUMIDOR",
    content: "Nada de lo establecido en estos Términos y Condiciones podrá interpretarse como una renuncia, limitación o desconocimiento de los derechos que la legislación colombiana reconoce a los consumidores.\n\nRYYCO/Rico respetará los derechos de los usuarios y consumidores establecidos en el Estatuto del Consumidor y demás normas aplicables."
  },
  {
    id: "aceptacion",
    number: "20",
    title: "ACEPTACIÓN",
    content: "Al crear una cuenta, realizar un pedido o utilizar las funcionalidades de RYYCO/Rico, el usuario declara haber leído y aceptado estos Términos y Condiciones y reconoce que la información proporcionada durante el registro es verdadera y corresponde a la persona que utiliza la cuenta.\n\nCuando corresponda, el usuario deberá aceptar de manera independiente la Política de Tratamiento de Datos Personales y las demás políticas aplicables de RYYCO/Rico.\n\nRYYCO/Rico se reserva el derecho de solicitar información adicional cuando sea necesaria para garantizar la seguridad de la plataforma, prevenir fraudes, gestionar pedidos o cumplir obligaciones legales."
  }
];
