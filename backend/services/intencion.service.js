
const INTENCIONES = {
    confirmar_toma: [
        'ya la tome',
        'ya lo tome',
        'me la tome',
        'me lo tome',
        'ya tome la medicacion',
        'ya tome el medicamento',
        'ya tome mi medicamento',
        'dosis tomada',
        'la tome'
    ],
    no_tome: [
        'no la tome',
        'no lo tome',
        'todavia no la tome',
        'aun no la tome',
        'no tome la medicacion',
        'no tome el medicamento',
        'me olvide de tomarla',
        'me olvide de tomarlo',
        'todavia no'
    ],
    consultar_horario: [
        'a que hora',
        'cuando me toca',
        'cuando tengo que tomar',
        'cual es mi horario',
        'que medicamento me toca',
        'que me toca tomar',
        'proximo recordatorio'
    ],
    rechazar_recordatorio: [
        'no quiero tomarla',
        'no quiero tomarlo',
        'no voy a tomarla',
        'no voy a tomarlo',
        'rechazo la medicacion',
        'no quiero tomar el medicamento'
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

const contieneFrase = (texto, frases) => {
    return frases.some((frase) => {
        return ` ${texto} `.includes(` ${frase} `);
    });
};

const extraerDatos = (textoOriginal) => {
    const texto = normalizarTexto(textoOriginal);

    const horaEncontrada = texto.match(
        /\b(?:a las|a la|para las|para la)\s+(\d{1,2})(?::(\d{2}))?\b/
    );

    return {
        horario: horaEncontrada
            ? {
                hora: Number(horaEncontrada[1]),
                minutos: Number(horaEncontrada[2] || 0)
            }
            : null
    };
};

const analizarIntencion = (textoOriginal) => {
    if (
        typeof textoOriginal !== 'string' ||
        !textoOriginal.trim()
    ) {
        return {
            intencion: 'respuesta_ambigua',
            datos: {},
            motivo: 'texto_vacio'
        };
    }

    const texto = normalizarTexto(textoOriginal);
    const datos = extraerDatos(textoOriginal);

    // Primero detectamos preguntas de horario.
    if (contieneFrase(texto, INTENCIONES.consultar_horario)) {
        return {
            intencion: 'consultar_horario',
            datos
        };
    }

    // Después detectamos negaciones explícitas.
    if (contieneFrase(texto, INTENCIONES.no_tome)) {
        return {
            intencion: 'no_tome',
            datos
        };
    }

    // Rechazar no equivale necesariamente a no haber tomado la dosis.
    if (contieneFrase(texto, INTENCIONES.rechazar_recordatorio)) {
        return {
            intencion: 'rechazar_recordatorio',
            datos
        };
    }

    // Solo confirmamos si encontramos una expresión explícita.
    if (contieneFrase(texto, INTENCIONES.confirmar_toma)) {
        return {
            intencion: 'confirmar_toma',
            datos
        };
    }

    // Una respuesta corta requiere el contexto de la conversación.
    if (/^(si|no|puede ser|no se|quizas|tal vez)$/.test(texto)) {
        return {
            intencion: 'respuesta_ambigua',
            datos,
            motivo: 'requiere_contexto'
        };
    }

    return {
        intencion: 'respuesta_ambigua',
        datos,
        motivo: 'intencion_no_reconocida'
    };
};

module.exports = {
    analizarIntencion,
    normalizarTexto
};
