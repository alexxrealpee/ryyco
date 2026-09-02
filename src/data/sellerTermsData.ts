/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SellerTermSection {
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

export const SELLER_TERMS_PREAMBLE = {
  title: "REGISTRO, IDENTIFICACIÓN Y RESPONSABILIDAD DE LOS VENDEDORES",
  text: "De conformidad con la legislación colombiana aplicable, incluyendo la Ley 1480 de 2011 (Estatuto del Consumidor), especialmente sus artículos 49, 50 y 53; la Ley 1581 de 2012 sobre protección de datos personales; la Ley 527 de 1999 sobre comercio electrónico y mensajes de datos; y las demás normas que las modifiquen, adicionen o reglamenten, RYYCO podrá solicitar a los establecimientos, restaurantes, comercios, empresas, personas naturales y demás oferentes que deseen utilizar la plataforma la información necesaria para su adecuada identificación y registro."
};

export const SELLER_TERMS_SECTIONS: SellerTermSection[] = [
  {
    id: "informacion",
    number: "1",
    title: "Información del vendedor",
    content: "Para registrarse como vendedor en RYYCO, el establecimiento deberá proporcionar información cierta, completa, verificable y actualizada que permita identificar al oferente.\n\nDe acuerdo con el artículo 53 de la Ley 1480 de 2011, el registro deberá contener, como mínimo, cuando resulte aplicable:",
    points: [
      "Nombre o razón social.",
      "Documento de identificación (Cédula de Ciudadanía, Cédula de Extranjería o NIT).",
      "Dirección física para notificaciones judiciales y comerciales.",
      "Número o números telefónicos de contacto y atención a clientes."
    ],
    subsections: [
      {
        label: "Información operativa adicional",
        text: "Adicionalmente, RYYCO podrá solicitar información necesaria para la correcta operación de la plataforma, tales como nombre comercial, NIT, correo electrónico, dirección del establecimiento, ciudad, información de contacto, información del representante, propietario, administrador o persona autorizada para gestionar el establecimiento."
      }
    ]
  },
  {
    id: "veracidad",
    number: "2",
    title: "Veracidad de la información",
    content: "El vendedor declara que toda la información suministrada a RYYCO es verdadera, completa, legítima y se encuentra actualizada.\n\nEl vendedor será responsable de mantener actualizada la información registrada y deberá informar cualquier cambio que pueda afectar su identificación, contacto, operación comercial o relación con la plataforma.\n\nEl vendedor responderá directamente por cualquier perjuicio, reclamación, sanción, investigación o actuación de terceros o de autoridades que tenga origen en información falsa, incorrecta, desactualizada, fraudulenta o suministrada sin la debida autorización."
  },
  {
    id: "terceros_registro",
    number: "3",
    title: "Registro en nombre de terceros",
    content: "Cuando una persona registre un establecimiento, empresa o negocio perteneciente a otra persona natural o jurídica, declara que cuenta con la autorización necesaria para actuar en nombre de dicho establecimiento.\n\nEl registro de un establecimiento en RYYCO no constituye, por sí mismo, prueba de propiedad, representación legal, autorización sanitaria, licencia de funcionamiento, habilitación profesional, autorización tributaria o cualquier otra autorización exigida por la legislación colombiana.\n\nEl vendedor será responsable de contar con todos los permisos, registros, licencias y autorizaciones que sean exigibles para el desarrollo de su actividad económica."
  },
  {
    id: "verificacion",
    number: "4",
    title: "Verificación de identidad e información",
    content: "RYYCO podrá solicitar documentos o información adicional cuando resulte necesario para verificar la identidad del vendedor, la existencia del establecimiento, la legitimidad de la información suministrada o la autorización de la persona que realiza el registro.\n\nRYYCO podrá suspender, restringir o cancelar un registro cuando se detecte información falsa, inconsistente, fraudulenta, suplantación de identidad, uso no autorizado de información de terceros o incumplimiento de estos Términos y Condiciones, sin perjuicio de las acciones legales que correspondan."
  },
  {
    id: "consumidor",
    number: "5",
    title: "Información exigida por la legislación de protección al consumidor",
    content: "En cumplimiento del artículo 53 de la Ley 1480 de 2011, RYYCO podrá conservar un registro de los oferentes que utilicen la plataforma.\n\nLa información exigida por la legislación podrá ser puesta a disposición de los consumidores que hayan adquirido un producto o servicio, cuando corresponda para efectos de presentar una queja o reclamación, y podrá ser suministrada a las autoridades competentes cuando sea legalmente requerida."
  },
  {
    id: "datos_personales",
    number: "6",
    title: "Tratamiento de datos personales",
    content: "Los datos personales suministrados por los vendedores, representantes, propietarios, administradores, empleados o personas autorizadas serán tratados de conformidad con la Ley 1581 de 2012, sus normas reglamentarias y la Política de Tratamiento de Datos Personales de RYYCO.\n\nRYYCO podrá recolectar, almacenar, utilizar, actualizar y, cuando exista fundamento legal para ello, compartir los datos personales necesarios para finalidades relacionadas con el registro, identificación, administración de cuentas, operación de la plataforma, gestión de pedidos, comunicaciones, atención de solicitudes, seguridad, prevención del fraude, cumplimiento de obligaciones legales y demás finalidades informadas al titular.\n\nEl titular de los datos personales tendrá los derechos reconocidos por la legislación colombiana, incluyendo conocer, actualizar, rectificar y solicitar la protección de sus datos personales en los términos establecidos por la Ley 1581 de 2012 y la Política de Tratamiento de Datos Personales de RYYCO."
  },
  {
    id: "datos_terceros",
    number: "7",
    title: "Datos de terceros",
    content: "El usuario que suministre a RYYCO datos personales pertenecientes a terceros manifiesta que cuenta con la autorización o legitimidad necesaria para proporcionar dicha información y será responsable de que su suministro y tratamiento se realice conforme a la legislación aplicable."
  },
  {
    id: "responsabilidad",
    number: "8",
    title: "Responsabilidad del vendedor",
    content: "El registro y publicación de un establecimiento en RYYCO no significa que RYYCO certifique, garantice o valide la legalidad de la actividad comercial, productos, servicios, permisos, licencias, registros sanitarios, obligaciones tributarias o demás requisitos legales del vendedor.\n\nEl vendedor será responsable del cumplimiento de las normas que regulen su actividad económica y de la información, productos, precios, promociones, disponibilidad, calidad y demás condiciones que publique u ofrezca a través de la plataforma."
  },
  {
    id: "marco_legal",
    number: "9",
    title: "Marco legal",
    content: "Las disposiciones contenidas en esta sección se interpretarán de conformidad con la legislación colombiana vigente, especialmente:",
    subsections: [
      {
        letter: "a",
        label: "Constitución Política de Colombia, artículo 15",
        text: "Derecho a la intimidad, buen nombre y protección de los datos personales."
      },
      {
        letter: "b",
        label: "Ley 1480 de 2011 – Estatuto del Consumidor",
        text: "Particularmente las disposiciones relativas al comercio electrónico, información de proveedores y portales de contacto (artículos 49, 50 y 53)."
      },
      {
        letter: "c",
        label: "Ley 1581 de 2012",
        text: "Régimen general de protección de datos personales y habeas data."
      },
      {
        letter: "d",
        label: "Ley 527 de 1999",
        text: "Acceso y uso de mensajes de datos, comercio electrónico y firmas digitales."
      }
    ],
    points: [
      "Las normas anteriormente mencionadas se entienden incorporadas a estos Términos y Condiciones en cuanto resulten aplicables y serán entendidas junto con sus decretos reglamentarios, modificaciones, adiciones y demás disposiciones que las sustituyan o complementen."
    ]
  },
  {
    id: "operacion_catalogo",
    number: "10",
    title: "Productos permitidos y exclusiones de catálogo",
    content: "El vendedor es el único y exclusivo responsable por la calidad, higiene, idoneidad, estado, vigencia y precios de los productos y servicios ofertados en su vitrina virtual. Queda prohibida la comercialización de sustancias ilícitas, armas o artículos que infrinjan derechos de terceros o leyes colombianas.",
    points: [
      "Prohibido ofertar sustancias ilícitas o medicamentos sin prescripción legal.",
      "Prohibido el uso de imágenes o marcas sin los respectivos derechos de uso.",
      "RYYCO se reserva el derecho de suspender productos o comercios que contravengan estas pautas."
    ]
  },
  {
    id: "operacion_pagos",
    number: "11",
    title: "Pagos directos al vendedor y autonomía tributaria",
    content: "Las transacciones comerciales se pactan directamente entre el cliente final y el establecimiento. Los pagos vía transferencia o contra entrega van directos al comercio. El vendedor es el exclusivo responsable de emitir las facturas, cuentas de cobro y cumplir con sus deberes tributarios ante la DIAN y autoridades territoriales."
  },
  {
    id: "operacion_soporte",
    number: "12",
    title: "Canales de soporte y contacto oficial",
    content: "Para cualquier requerimiento, consulta legal o asistencia técnica, RYYCO dispone de su canal oficial de atención al vendedor vía WhatsApp (+57 321 973 0865) y correo de soporte."
  }
];
