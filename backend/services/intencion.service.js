
const INTENCIONES = {
    rechazar_recordatorio: [
        /\bno\s+(?:quiero|voy\s+a|pienso|deseo)\s+tomar\b/,
        /\bno\s+(?:la|lo|las|los)\s+(?:quiero|voy\s+a)\s+tomar\b/,
        /\bno\s+me\s+(?:la|lo|las|los)\s+(?:quiero|voy\s+a)\s+tomar\b/,
        /\brechaz(?:o|ar)\b/,
        /\bme\s+niego\s+a\s+tomar\b/
    ],

    no_tome: [
        /\bno\s+(?:me\s+)?(?:la\s+|lo\s+|las\s+|los\s+)?tome\b/,
        /\btodavia\s+no\b/,
        /\baun\s+no\b/,
        /\bme\s+olvide\s+de\s+tomar\b/,
        /\bse\s+me\s+olvido\b/,
        /\bno\s+he\s+tomado\b/,
        /\bno\s+la\s+he\s+tomado\b/,
        /\bno\s+lo\s+he\s+tomado\b/
    ],

    consultar_horario: [
        /\ba\s+que\s+hora\b/,
        /\bcuando\b/,
        /\bhorarios?\b/,
        /\bproxim[oa]\s+(?:toma|dosis|recordatorio)\b/,
        /\bque\s+(?:medicamento|medicacion|pastilla)\s+me\s+toca\b/,
        /\bque\s+me\s+toca\s+tomar\b/,
        /\bme\s+toca\s+tomar\b/,
        /\ba\s+que\s+hora\s+debo\s+tomar\b/
    ],

    consultar_medicamentos: [
        /\bque\s+medicamentos?\b/,
        /\bque\s+medicacion\b/,
        /\bmis\s+medicamentos\b/,
        /\bmedicamentos?\s+registrados?\b/,
        /\bmedicacion\s+registrada\b/,
        /\bmedicamentos?\s+guardados?\b/,
        /\b(?:lista|listado)\s+de\s+medicamentos\b/,
        /\b(?:listar|mostrar|mostrame|decime)\s+(?:mis\s+)?medicamentos\b/,
        /\b(?:que|cual|cuanto)\s+(?:es\s+)?(?:mi\s+|la\s+)?dosis\b/,
        /\bdosis\s+(?:registrada|del\s+medicamento|de\s+mi\s+medicamento)\b/,
        /\binstrucciones\b/,
        /\bcomo\s+(?:tengo|debo|hay\s+que)\s+tomar\b/,
        /\bque\s+estoy\s+tomando\b/,
        /\bque\s+(?:medicamento|medicacion)\s+estoy\s+tomando\b/
    ],

    confirmar_toma: [
        /\bya\s+(?:me\s+)?(?:la\s+|lo\s+|las\s+|los\s+)?tome\b/,
        /\bme\s+(?:la\s+|lo\s+|las\s+|los\s+)?tome\b/,
        /\b(?:la|lo|las|los)\s+tome\b/,
        /\bya\s+(?:me\s+)?(?:la\s+|lo\s+)?he\s+tomado\b/,
        /\b(?:dosis|medicacion|pastilla)\s+tomada\b/,
        /\bmedicamento\s+tomado\b/,
        /\bya\s+esta\s+tomada\b/,
        /\bya\s+esta\s+tomado\b/
    ]
};

const normalizarTexto = (texto) => {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[¿?¡!.,;:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const coincidePatron = (texto, patrones) => {
    return patrones.some((patron) => patron.test(texto));
};

const extraerDatos = (textoOriginal) => {
    const texto = normalizarTexto(textoOriginal);

    const horaEncontrada = texto.match(
        /\b(?:a las|a la|para las|para la)\s+(\d{1,2})(?::(\d{2}))?\b/
    );

    let horario = null;

    if (horaEncontrada) {
        const hora = Number(horaEncontrada[1]);
        const minutos = Number(horaEncontrada[2] || 0);

        if (
            hora >= 0 &&
            hora <= 23 &&
            minutos >= 0 &&
            minutos <= 59
        ) {
            horario = {
                hora,
                minutos
            };
        }
    }

    return {
        horario
    };
};

const esPregunta = (textoOriginal, textoNormalizado) => {
    const texto = textoNormalizado;

    if (textoOriginal.includes('¿') || textoOriginal.includes('?')) {
        return true;
    }

    return /^(?:que|cual|cuales|cuando|como|cuanto|cuantos|donde|por que)\b/.test(
        texto
    );
};

const analizarIntencion = (textoOriginal) => {
    console.log('\n========== CLASIFICADOR DE INTENCIÓN ==========');
    console.log('[INTENCION] Texto original:', textoOriginal);

    if (
        typeof textoOriginal !== 'string' ||
        !textoOriginal.trim()
    ) {
        const resultado = {
            intencion: 'respuesta_ambigua',
            datos: {},
            motivo: 'texto_vacio'
        };

        console.log('[INTENCION] Resultado:', JSON.stringify(resultado));
        console.log('===============================================\n');

        return resultado;
    }

    const texto = normalizarTexto(textoOriginal);
    const datos = extraerDatos(textoOriginal);

    console.log('[INTENCION] Texto normalizado:', texto);
    console.log('[INTENCION] Datos extraídos:', JSON.stringify(datos));

    let resultado;

    const pregunta = esPregunta(textoOriginal, texto);

    // Consultas explícitas sobre horarios.
    if (coincidePatron(texto, INTENCIONES.consultar_horario)) {
        resultado = {
            intencion: 'consultar_horario',
            datos
        };

    // Consultas explícitas sobre medicamentos y dosis.
    } else if (coincidePatron(texto, INTENCIONES.consultar_medicamentos)) {
        resultado = {
            intencion: 'consultar_medicamentos',
            datos
        };

    // Una pregunta no debe modificar el estado de una toma.
    } else if (pregunta) {
        resultado = {
            intencion: 'respuesta_ambigua',
            datos,
            motivo: 'pregunta_no_reconocida'
        };

    // Rechazo explícito de la medicación.
    } else if (coincidePatron(texto, INTENCIONES.rechazar_recordatorio)) {
        resultado = {
            intencion: 'rechazar_recordatorio',
            datos
        };

    // El usuario informa que todavía no tomó la medicación.
    } else if (coincidePatron(texto, INTENCIONES.no_tome)) {
        resultado = {
            intencion: 'no_tome',
            datos
        };

    // El usuario informa que ya tomó la medicación.
    } else if (coincidePatron(texto, INTENCIONES.confirmar_toma)) {
        resultado = {
            intencion: 'confirmar_toma',
            datos
        };

    // Respuestas que necesitan contexto de una conversación anterior.
    } else if (/^(si|no|puede ser|no se|quizas|tal vez)$/.test(texto)) {
        resultado = {
            intencion: 'respuesta_ambigua',
            datos,
            motivo: 'requiere_contexto'
        };

    // No se encontró ninguna intención suficientemente clara.
    } else {
        resultado = {
            intencion: 'respuesta_ambigua',
            datos,
            motivo: 'intencion_no_reconocida'
        };
    }

    console.log('[INTENCION] Intención detectada:', resultado.intencion);
    console.log('[INTENCION] Motivo:', resultado.motivo || 'ninguno');
    console.log('[INTENCION] Resultado completo:', JSON.stringify(resultado));
    console.log('===============================================\n');

    return resultado;
};

module.exports = {
    analizarIntencion,
    normalizarTexto
};
