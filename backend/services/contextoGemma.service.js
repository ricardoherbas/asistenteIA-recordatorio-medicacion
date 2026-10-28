
const prepararContextoGemma = (textoUsuario, accion, resultadoOperacion) => {
    const instrucciones = [
        'Sos Memoric, un asistente de recordatorios de medicación.',
        'Tu tarea es comunicar al usuario los resultados de una operación.',
        'Respondé en español argentino, de forma breve, clara y natural.',
        'No uses Markdown ni saludos innecesarios.',
        'No repitas la pregunta del usuario.',
        'Utilizá exclusivamente la información proporcionada.',
        'No inventes medicamentos, dosis, horarios ni instrucciones.',
        'No cambies cantidades ni unidades.',
        'No des recomendaciones médicas.',
        'No menciones identificadores internos ni detalles técnicos.',
        'Si hay varios medicamentos, mencioná todos los registrados.',
        'No digas que no entendiste si la información permite responder.'
    ];

    let informacion = '';

    if (accion === 'consultar_medicamentos' && resultadoOperacion.ok) {
        const medicamentos = Array.isArray(resultadoOperacion.datos)
            ? resultadoOperacion.datos
            : [];

        if (medicamentos.length === 0) {
            informacion = 'El usuario no tiene medicamentos registrados.';
        } else {
            const listado = medicamentos.map((medicamento, indice) => {
                const nombre = medicamento.nombre || 'Sin nombre';
                const dosis = medicamento.dosis || 'No registrada';
                const indicaciones = medicamento.instrucciones || 'No registradas';

                return [
                    `${indice + 1}. Medicamento: ${nombre}`,
                    `   Dosis registrada: ${dosis}`,
                    `   Instrucciones: ${indicaciones}`
                ].join('\n');
            }).join('\n\n');

            informacion = [
                `El usuario tiene ${medicamentos.length} medicamento(s) registrado(s).`,
                '',
                listado
            ].join('\n');
        }
    } else if (resultadoOperacion.mensaje) {
        informacion = resultadoOperacion.mensaje;
    } else {
        informacion = 'No hay información disponible para responder.';
    }

    return [
        ...instrucciones,
        '',
        'CONSULTA DEL USUARIO:',
        textoUsuario,
        '',
        'INFORMACIÓN DISPONIBLE:',
        informacion,
        '',
        'INSTRUCCIÓN FINAL:',
        'Respondé directamente la consulta utilizando únicamente la información disponible.',
        'Si hay medicamentos registrados, mencioná sus nombres y dosis sin omitir ninguno.',
        'No agregues explicaciones que no estén relacionadas con la consulta.'
    ].join('\n');
};

module.exports = {
    prepararContextoGemma
};
