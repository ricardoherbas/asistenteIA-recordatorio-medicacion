
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
    consultar_medicamentos: [
        'que medicamentos tengo',
        'que medicacion tengo',
        'que medicamentos tengo registrados',
        'que medicacion tengo registrada',
        'que medicamentos tengo guardados',
        'que medicamento tengo registrado',
        'que medicamento estoy tomando',
        'que medicacion estoy tomando',
        'que dosis tengo',
        'que dosis tengo registrada',
        'cual es mi dosis',
        'cual es la dosis',
        'dosis registrada',
        'dosis del medicamento',
        'dosis de mi medicamento',
        'que instrucciones tiene',
        'cuales son las instrucciones',
        'como tengo que tomar el medicamento',
        'como debo tomar el medicamento',
        'mostrame mis medicamentos',
        'mostrar mis medicamentos',
        'listar medicamentos',
        'lista de medicamentos',
        'medicamentos registrados',
        'medicacion registrada'
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

    const datos = {
        horario: horaEncontrada
            ? {
                hora: Number(horaEncontrada[1]),
                minutos: Number(horaEncontrada[2] || 0)
            }
            : null
    };

    return datos;
};

const analizarIntencion = (textoOriginal) => {
    console.log('\n========== CLASIFICADOR DE INTENCIÓN ==========');
    console.log('[INTENCION] Texto original:', textoOriginal);

    if (typeof textoOriginal !== 'string' || !textoOriginal.trim()) {
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

    if (contieneFrase(texto, INTENCIONES.consultar_medicamentos)) {
        resultado = {
            intencion: 'consultar_medicamentos',
            datos
        };
    } else if (contieneFrase(texto, INTENCIONES.consultar_horario)) {
        resultado = {
            intencion: 'consultar_horario',
            datos
        };
    } else if (contieneFrase(texto, INTENCIONES.no_tome)) {
        resultado = {
            intencion: 'no_tome',
            datos
        };
    } else if (contieneFrase(texto, INTENCIONES.rechazar_recordatorio)) {
        resultado = {
            intencion: 'rechazar_recordatorio',
            datos
        };
    } else if (contieneFrase(texto, INTENCIONES.confirmar_toma)) {
        resultado = {
            intencion: 'confirmar_toma',
            datos
        };
    } else if (/^(si|no|puede ser|no se|quizas|tal vez)$/.test(texto)) {
        resultado = {
            intencion: 'respuesta_ambigua',
            datos,
            motivo: 'requiere_contexto'
        };
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
