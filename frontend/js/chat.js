
(() => {
    'use strict';

    const elementos = {
        estadoConexion: document.getElementById('estado-conexion'),
        listaMensajes: document.getElementById('lista-mensajes'),
        indicadorActividad: document.getElementById('indicador-actividad'),
        textoActividad: document.getElementById('texto-actividad'),
        mensajeError: document.getElementById('mensaje-chat-error'),
        indicadorMicrofono: document.getElementById('indicador-microfono'),
        estadoMicrofono: document.getElementById('estado-microfono'),
        botonEscucha: document.getElementById('boton-escucha'),
        textoBotonEscucha: document.getElementById('texto-boton-escucha'),
        botonConfirmarToma: document.getElementById('boton-confirmar-toma'),
        formularioMensaje: document.getElementById('form-mensaje'),
        textoMensaje: document.getElementById('texto-mensaje'),
        botonEnviarMensaje: document.getElementById('boton-enviar-mensaje')
    };

    const CONFIG_AUDIO = {
        frecuenciaDestino: 16000,
        canales: 1,
        bytesPorMuestra: 2,
        umbralSilencio: 0.015,
        duracionSilencioMs: 900,
        duracionMinimaMs: 350,
        duracionMaximaMs: 12000,
        margenInicioMs: 250
    };

    const CLAVE_PERSONA = 'personaAsistenteMedicacion';

    let conexion = null;
    let contextoAudio = null;
    let flujoMicrofono = null;
    let fuenteMicrofono = null;
    let procesadorMicrofono = null;
    let nodoSilencio = null;
    let microfonoActivo = false;
    let consultaEnCurso = false;
    let esperandoRespuesta = false;
    let respuestaFinalizada = false;
    let colaAudio = [];
    let reproduciendoAudio = false;
    let fuenteAudioActual = null;
    let cadenaDecodificacion = Promise.resolve();
    let audiosPendientesDecodificacion = 0;
    let fragmentosVoz = [];
    let muestrasSilencio = 0;
    let muestrasVoz = 0;
    let muestrasTotales = 0;
    let muestrasPrevias = [];
    let temporizadorMaximo = null;
    let saludoEnCurso = true;
    let saludoFinalizadoServidor = false;
    let saludoCompletado = false;
    let iniciandoMicrofonoAutomatico = false;

    // Control de recordatorios de medicación.
    let recordatorioEnRecepcion = false;
    let recordatoriosPendientes = 0;

    // Control de confirmaciones de tomas.
    const tomasPendientesConfirmacion = [];
    let confirmacionEnCurso = false;

    function actualizarBotonConfirmacion() {
        elementos.botonConfirmarToma.disabled =
            confirmacionEnCurso ||
            tomasPendientesConfirmacion.length === 0;

        elementos.botonConfirmarToma.textContent = confirmacionEnCurso
            ? 'Confirmando toma...'
            : '✓ Confirmar que tomé la medicación';
    }

    function registrarTomaPendiente(registroTomaId) {
        const id = Number(registroTomaId);

        if (!Number.isSafeInteger(id) || id <= 0) {
            console.warn(
                '[MEMORIC] Recordatorio sin identificador de toma válido:',
                registroTomaId
            );

            return;
        }

        if (!tomasPendientesConfirmacion.includes(id)) {
            tomasPendientesConfirmacion.push(id);
        }

        actualizarBotonConfirmacion();
    }

    function mostrarError(mensaje) {
        elementos.mensajeError.textContent = mensaje;
        elementos.mensajeError.hidden = false;
    }

    function ocultarError() {
        elementos.mensajeError.textContent = '';
        elementos.mensajeError.hidden = true;
    }

    function mostrarActividad(mensaje) {
        elementos.textoActividad.textContent = mensaje;
        elementos.indicadorActividad.hidden = false;
    }

    function ocultarActividad() {
        elementos.textoActividad.textContent = '';
        elementos.indicadorActividad.hidden = true;
    }

    function agregarMensaje(tipo, texto) {
        const contenedor = document.createElement('article');
        contenedor.className = `mensaje mensaje--${tipo}`;

        const autor = document.createElement('p');
        autor.className = 'mensaje__autor';
        autor.textContent = tipo === 'usuario' ? 'Vos' : 'Asistente';

        const contenido = document.createElement('p');
        contenido.className = 'mensaje__texto';
        contenido.textContent = texto;

        contenedor.append(autor, contenido);
        elementos.listaMensajes.appendChild(contenedor);

        contenedor.scrollIntoView({
            behavior: 'smooth',
            block: 'end'
        });

        return contenedor;
    }

    function actualizarConexion(conectada, mensaje) {
        elementos.estadoConexion.textContent = mensaje;
        elementos.estadoConexion.dataset.conectado = String(conectada);
    }

    /* =========================================
       Recuperación del perfil del usuario
    ========================================= */

    function recuperarPersona() {
        try {
            const guardada = localStorage.getItem(CLAVE_PERSONA);

            if (!guardada) {
                console.warn('Todavía no hay un perfil guardado.');
                return null;
            }

            const persona = JSON.parse(guardada);

            if (!persona || typeof persona !== 'object') {
                console.error('El perfil guardado no es válido.');
                return null;
            }

            const usuarioId = Number(persona.id);

            if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
                console.error('El ID del usuario no es válido.');
                return null;
            }

            const nombre = typeof persona.nombre === 'string'
                ? persona.nombre.trim().slice(0, 80)
                : '';

            if (!nombre) {
                console.error('El perfil no tiene un nombre válido.');
                return null;
            }

            return {
                usuarioId,
                nombre
            };
        } catch (error) {
            console.error('No se pudo recuperar el perfil:', error);
            return null;
        }
    }

    /* =========================================
       Confirmación de tomas de medicación
    ========================================= */

    async function confirmarToma() {
        if (
            confirmacionEnCurso ||
            tomasPendientesConfirmacion.length === 0
        ) {
            return;
        }

        const persona = recuperarPersona();

        if (!persona) {
            mostrarError(
                'No se encontró un perfil válido para confirmar la toma.'
            );

            return;
        }

        const registroTomaId = tomasPendientesConfirmacion[0];

        confirmacionEnCurso = true;
        actualizarBotonConfirmacion();
        ocultarError();

        try {
            const apiBase = String(
                window.APP_CONFIG.API_URL || ''
            ).replace(/\/$/, '');

            const respuesta = await fetch(
                `${apiBase}/api/tomas/${registroTomaId}/confirmar`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        usuarioId: persona.usuarioId,
                        origen: 'web'
                    })
                }
            );

            const resultado = await respuesta.json();

            if (!respuesta.ok || !resultado.ok) {
                throw new Error(
                    resultado.mensaje ||
                    'No se pudo confirmar la toma.'
                );
            }

            tomasPendientesConfirmacion.shift();

            agregarMensaje(
                'asistente',
                'Tu toma de medicación fue confirmada correctamente.'
            );

            console.log(
                '[MEMORIC] Toma confirmada:',
                registroTomaId
            );
        } catch (error) {
            console.error(
                '[MEMORIC] Error confirmando toma:',
                error
            );

            mostrarError(
                error.message ||
                'No se pudo registrar la confirmación.'
            );
        } finally {
            confirmacionEnCurso = false;
            actualizarBotonConfirmacion();
        }
    }

    /* =========================================
       Saludo inicial con nombre e ID
    ========================================= */

    function enviarInicioAsistente() {
        if (!conexion || conexion.readyState !== WebSocket.OPEN) {
            return;
        }

        const persona = recuperarPersona();

        if (!persona) {
            saludoEnCurso = false;
            saludoFinalizadoServidor = true;
            ocultarActividad();

            mostrarError(
                'No se encontró un perfil válido. Creá o revisá tu perfil antes de iniciar el asistente.'
            );

            return;
        }

        mostrarActividad('Preparando tu saludo...');

        conexion.send(JSON.stringify({
            type: 'iniciar_asistente',
            nombre: persona.nombre,
            usuarioId: persona.usuarioId
        }));
    }

    /* =========================================
       Conexión WebSocket
    ========================================= */

    function conectarWebSocket() {
        if (
            conexion &&
            (
                conexion.readyState === WebSocket.OPEN ||
                conexion.readyState === WebSocket.CONNECTING
            )
        ) {
            return;
        }

        actualizarConexion(false, 'Conectando con el asistente…');

        try {
            conexion = new WebSocket(
                window.APP_CONFIG.WEBSOCKET_URL
            );

            conexion.binaryType = 'arraybuffer';
        } catch (error) {
            actualizarConexion(false, 'No se pudo iniciar la conexión.');
            mostrarError('No se pudo conectar con el asistente.');
            return;
        }

        conexion.addEventListener('open', () => {
            actualizarConexion(true, 'Conectado al asistente');
            ocultarError();
            enviarInicioAsistente();
        });

        conexion.addEventListener('message', gestionarMensajeServidor);

        conexion.addEventListener('close', () => {
            actualizarConexion(false, 'Desconectado del asistente');
            consultaEnCurso = false;
            esperandoRespuesta = false;
            respuestaFinalizada = true;
            saludoEnCurso = false;
            recordatorioEnRecepcion = false;
            ocultarActividad();

            if (microfonoActivo) {
                mostrarError(
                    'Se perdió la conexión. Volvé a conectarte antes de continuar.'
                );

                detenerCapturaMicrofono();
            }
        });

        conexion.addEventListener('error', () => {
            mostrarError(
                'Ocurrió un problema con la conexión al asistente.'
            );
        });
    }

    /* =========================================
       Mensajes recibidos del servidor
    ========================================= */

    function gestionarMensajeServidor(evento) {
        if (typeof evento.data !== 'string') {
            const esRecordatorio = recordatorioEnRecepcion;

            audiosPendientesDecodificacion++;

            cadenaDecodificacion = cadenaDecodificacion
                .then(() => reproducirAudioRecibido(
                    evento.data,
                    esRecordatorio
                ))
                .catch((error) => {
                    console.error(
                        'Error al procesar el audio recibido:',
                        error
                    );

                    if (esRecordatorio) {
                        recordatoriosPendientes = Math.max(
                            0,
                            recordatoriosPendientes - 1
                        );
                    }

                    mostrarError('No se pudo procesar el audio recibido.');
                })
                .finally(() => {
                    audiosPendientesDecodificacion--;
                    comprobarFinSaludo();
                    comprobarFinConsulta();
                });

            return;
        }

        let mensaje;

        try {
            mensaje = JSON.parse(evento.data);
        } catch {
            agregarMensaje('asistente', evento.data);
            return;
        }

        // Inicio de un recordatorio de medicación.
        if (mensaje.tipo === 'recordatorio_voz') {
            console.log(
                '[MEMORIC VOZ] Recordatorio recibido:',
                mensaje
            );

            recordatorioEnRecepcion = true;
            recordatoriosPendientes++;

            reiniciarSegmentoVoz();

            registrarTomaPendiente(mensaje.registroTomaId);

            agregarMensaje(
                'asistente',
                `Recordatorio de medicación: ${mensaje.texto || ''}`
            );

            mostrarActividad(
                'Reproduciendo recordatorio de medicación...'
            );

            return;
        }

        // Finalización de la transmisión del recordatorio.
        if (mensaje.tipo === 'fin_recordatorio_voz') {
            recordatorioEnRecepcion = false;

            console.log(
                '[MEMORIC VOZ] Fin de transmisión:',
                mensaje.envioId
            );

            return;
        }

        if (mensaje.tipo === 'error' || mensaje.error) {
            consultaEnCurso = false;
            esperandoRespuesta = false;
            respuestaFinalizada = true;

            if (saludoEnCurso) {
                saludoEnCurso = false;
                saludoFinalizadoServidor = true;
            }

            ocultarActividad();

            mostrarError(
                mensaje.mensaje ||
                mensaje.error ||
                'Ocurrió un error.'
            );

            comprobarFinSaludo();
            return;
        }

        switch (mensaje.tipo) {
            case 'saludo':
                if (mensaje.texto) {
                    agregarMensaje('asistente', mensaje.texto);
                }
                break;

            case 'fin_saludo':
                saludoFinalizadoServidor = true;
                comprobarFinSaludo();
                break;

            case 'transcripcion':
                if (mensaje.texto) {
                    agregarMensaje('usuario', mensaje.texto);
                }
                break;

            case 'intencion':
                console.info(
                    'Intención detectada:',
                    mensaje.intencion
                );
                break;

            case 'accion':
                console.info(
                    'Acción determinada por Prolog:',
                    mensaje.accion
                );
                break;

            case 'respuesta':
                if (mensaje.texto) {
                    agregarMensaje('asistente', mensaje.texto);
                }
                break;

            case 'fin_respuesta':
                respuestaFinalizada = true;
                esperandoRespuesta = false;
                comprobarFinConsulta();
                break;

            default:
                console.info(
                    'Mensaje recibido del backend:',
                    mensaje
                );
        }
    }

    /* =========================================
       Reproducción de audio
    ========================================= */

    async function obtenerAudioContexto() {
        if (!contextoAudio) {
            contextoAudio = new AudioContext();
        }

        if (contextoAudio.state === 'suspended') {
            await contextoAudio.resume();
        }

        return contextoAudio;
    }

    async function reproducirAudioRecibido(
        datos,
        esRecordatorio = false
    ) {
        const contexto = await obtenerAudioContexto();
        const copia = datos.slice(0);
        const buffer = await contexto.decodeAudioData(copia);

        colaAudio.push({
            buffer,
            esRecordatorio
        });

        reproducirSiguienteAudio();
    }

    function reproducirSiguienteAudio() {
        if (
            reproduciendoAudio ||
            colaAudio.length === 0 ||
            !contextoAudio
        ) {
            comprobarFinSaludo();
            comprobarFinConsulta();
            return;
        }

        reproduciendoAudio = true;

        const siguiente = colaAudio.shift();
        const fuente = contextoAudio.createBufferSource();

        fuenteAudioActual = fuente;
        fuente.buffer = siguiente.buffer;
        fuente.connect(contextoAudio.destination);

        fuente.addEventListener('ended', () => {
            fuenteAudioActual = null;
            reproduciendoAudio = false;

            if (siguiente.esRecordatorio) {
                recordatoriosPendientes = Math.max(
                    0,
                    recordatoriosPendientes - 1
                );

                console.log(
                    '[MEMORIC VOZ] Recordatorio reproducido.'
                );

                reiniciarSegmentoVoz();
            }

            reproducirSiguienteAudio();
            comprobarFinSaludo();
            comprobarFinConsulta();

            if (
                recordatoriosPendientes === 0 &&
                !reproduciendoAudio &&
                colaAudio.length === 0 &&
                !consultaEnCurso &&
                !saludoEnCurso
            ) {
                ocultarActividad();

                if (microfonoActivo) {
                    mostrarActividad(
                        'Micrófono activo. Podés hablar cuando quieras.'
                    );
                }
            }
        }, { once: true });

        try {
            fuente.start();
        } catch (error) {
            console.error(
                'Error al iniciar reproducción:',
                error
            );

            fuenteAudioActual = null;
            reproduciendoAudio = false;

            if (siguiente.esRecordatorio) {
                recordatoriosPendientes = Math.max(
                    0,
                    recordatoriosPendientes - 1
                );
            }

            reproducirSiguienteAudio();
        }
    }

    /* =========================================
       Finalización del saludo
    ========================================= */

    async function comprobarFinSaludo() {
        if (
            !saludoEnCurso ||
            !saludoFinalizadoServidor ||
            audiosPendientesDecodificacion > 0 ||
            reproduciendoAudio ||
            colaAudio.length > 0 ||
            iniciandoMicrofonoAutomatico ||
            recordatorioEnRecepcion ||
            recordatoriosPendientes > 0 ||
            saludoCompletado
        ) {
            return;
        }

        saludoCompletado = true;
        saludoEnCurso = false;
        iniciandoMicrofonoAutomatico = true;

        mostrarActividad('Activando el micrófono...');

        try {
            await iniciarCapturaMicrofono();

            mostrarActividad(
                'Ya podés hablar. Te estoy escuchando.'
            );
        } catch (error) {
            console.error(
                'No se pudo activar el micrófono automáticamente:',
                error
            );

            mostrarError(
                'El saludo terminó. Presioná «Activar escucha» para empezar a hablar.'
            );

            mostrarActividad(
                'Esperando que actives el micrófono.'
            );
        } finally {
            iniciandoMicrofonoAutomatico = false;
        }
    }

    function comprobarFinConsulta() {
        if (
            !respuestaFinalizada ||
            reproduciendoAudio ||
            colaAudio.length > 0 ||
            audiosPendientesDecodificacion > 0 ||
            recordatorioEnRecepcion ||
            recordatoriosPendientes > 0
        ) {
            return;
        }

        consultaEnCurso = false;
        esperandoRespuesta = false;
        ocultarActividad();

        if (microfonoActivo) {
            mostrarActividad(
                'Micrófono activo. Podés hablar cuando quieras.'
            );
        }
    }

    /* =========================================
       Estado del micrófono
    ========================================= */

    function actualizarEstadoMicrofono(activo) {
        elementos.botonEscucha.setAttribute(
            'aria-pressed',
            String(activo)
        );

        elementos.textoBotonEscucha.textContent = activo
            ? 'Desactivar micrófono'
            : 'Activar escucha';

        elementos.botonEscucha.setAttribute(
            'aria-label',
            activo ? 'Desactivar micrófono' : 'Activar micrófono'
        );

        elementos.estadoMicrofono.textContent = activo
            ? 'Micrófono habilitado'
            : 'Micrófono desactivado';

        elementos.indicadorMicrofono.dataset.activo = String(activo);
    }

    /* =========================================
       Captura y procesamiento de voz
    ========================================= */

    function reiniciarSegmentoVoz() {
        fragmentosVoz = [];
        muestrasSilencio = 0;
        muestrasVoz = 0;
        muestrasTotales = 0;
        muestrasPrevias = [];
    }

    function calcularRMS(muestras) {
        let suma = 0;

        for (let i = 0; i < muestras.length; i++) {
            suma += muestras[i] * muestras[i];
        }

        return Math.sqrt(
            suma / Math.max(1, muestras.length)
        );
    }

    function agregarFragmentoAudio(muestras) {
        const copia = new Float32Array(muestras);

        fragmentosVoz.push(copia);
        muestrasTotales += copia.length;
    }

    function procesarEntradaMicrofono(evento) {
        if (
            !microfonoActivo ||
            saludoEnCurso ||
            consultaEnCurso ||
            recordatorioEnRecepcion ||
            recordatoriosPendientes > 0 ||
            reproduciendoAudio ||
            audiosPendientesDecodificacion > 0
        ) {
            return;
        }

        const entrada = evento.inputBuffer.getChannelData(0);
        const rms = calcularRMS(entrada);
        const hayVoz = rms >= CONFIG_AUDIO.umbralSilencio;

        if (hayVoz) {
            if (
                fragmentosVoz.length === 0 &&
                muestrasPrevias.length
            ) {
                agregarFragmentoAudio(
                    new Float32Array(muestrasPrevias)
                );
            }

            agregarFragmentoAudio(entrada);
            muestrasVoz += entrada.length;
            muestrasSilencio = 0;
        } else if (fragmentosVoz.length > 0) {
            agregarFragmentoAudio(entrada);
            muestrasSilencio += entrada.length;
        } else {
            muestrasPrevias.push(...entrada);

            const maximoPrevio = Math.floor(
                contextoAudio.sampleRate *
                CONFIG_AUDIO.margenInicioMs / 1000
            );

            if (muestrasPrevias.length > maximoPrevio) {
                muestrasPrevias = muestrasPrevias.slice(
                    muestrasPrevias.length - maximoPrevio
                );
            }

            return;
        }

        const duracionSilencioMs =
            muestrasSilencio / contextoAudio.sampleRate * 1000;

        const duracionTotalMs =
            muestrasTotales / contextoAudio.sampleRate * 1000;

        if (
            duracionSilencioMs >= CONFIG_AUDIO.duracionSilencioMs ||
            duracionTotalMs >= CONFIG_AUDIO.duracionMaximaMs
        ) {
            finalizarSegmentoVoz();
        }
    }

    function unirFragmentos(fragmentos, longitudTotal) {
        const resultado = new Float32Array(longitudTotal);
        let desplazamiento = 0;

        for (const fragmento of fragmentos) {
            resultado.set(fragmento, desplazamiento);
            desplazamiento += fragmento.length;
        }

        return resultado;
    }

    function remuestrearPCM(
        muestras,
        frecuenciaOrigen,
        frecuenciaDestino
    ) {
        if (frecuenciaOrigen === frecuenciaDestino) {
            return new Float32Array(muestras);
        }

        const proporcion = frecuenciaOrigen / frecuenciaDestino;
        const longitudDestino = Math.floor(
            muestras.length / proporcion
        );

        const resultado = new Float32Array(longitudDestino);

        for (let i = 0; i < longitudDestino; i++) {
            const posicion = i * proporcion;
            const indice = Math.floor(posicion);
            const fraccion = posicion - indice;

            const muestraInicial = muestras[indice] || 0;

            const muestraSiguiente =
                muestras[
                    Math.min(indice + 1, muestras.length - 1)
                ] || 0;

            resultado[i] =
                muestraInicial +
                (muestraSiguiente - muestraInicial) * fraccion;
        }

        return resultado;
    }

    function convertirAInt16(muestrasFloat) {
        const resultado = new Int16Array(muestrasFloat.length);

        for (let i = 0; i < muestrasFloat.length; i++) {
            const muestra = Math.max(
                -1,
                Math.min(1, muestrasFloat[i])
            );

            resultado[i] = muestra < 0
                ? muestra * 32768
                : muestra * 32767;
        }

        return resultado;
    }

    function finalizarSegmentoVoz() {
        if (!fragmentosVoz.length) {
            reiniciarSegmentoVoz();
            return;
        }

        const duracionMs =
            muestrasTotales / contextoAudio.sampleRate * 1000;

        const tuvoVozSuficiente =
            muestrasVoz / contextoAudio.sampleRate * 1000 >=
            CONFIG_AUDIO.duracionMinimaMs;

        const muestras = unirFragmentos(
            fragmentosVoz,
            muestrasTotales
        );

        reiniciarSegmentoVoz();

        if (
            duracionMs < CONFIG_AUDIO.duracionMinimaMs ||
            !tuvoVozSuficiente
        ) {
            return;
        }

        enviarAudioPCM(muestras);
    }

    function enviarAudioPCM(muestrasFloat) {
        if (!microfonoActivo || saludoEnCurso) {
            return;
        }

        if (
            !conexion ||
            conexion.readyState !== WebSocket.OPEN
        ) {
            mostrarError(
                'No hay conexión con el asistente. No se pudo enviar la frase.'
            );

            return;
        }

        if (consultaEnCurso) {
            return;
        }

        const muestrasRemuestreadas = remuestrearPCM(
            muestrasFloat,
            contextoAudio.sampleRate,
            CONFIG_AUDIO.frecuenciaDestino
        );

        const pcm = convertirAInt16(muestrasRemuestreadas);

        if (pcm.length === 0) {
            return;
        }

        consultaEnCurso = true;
        esperandoRespuesta = true;
        respuestaFinalizada = false;

        mostrarActividad('Procesando tu consulta…');
        ocultarError();

        try {
            conexion.send(pcm.buffer);
        } catch (error) {
            consultaEnCurso = false;
            esperandoRespuesta = false;

            mostrarError(
                'No se pudo enviar el audio al asistente.'
            );

            console.error('Error al enviar PCM:', error);
        }
    }

    /* =========================================
       Activar y detener micrófono
    ========================================= */

    async function iniciarCapturaMicrofono() {
        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {
            throw new Error(
                'El navegador no permite acceder al micrófono. Usá localhost o una conexión HTTPS.'
            );
        }

        if (
            !conexion ||
            conexion.readyState !== WebSocket.OPEN
        ) {
            throw new Error(
                'Todavía no hay conexión con el asistente.'
            );
        }

        if (microfonoActivo) {
            return;
        }

        flujoMicrofono = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        try {
            const contexto = await obtenerAudioContexto();

            fuenteMicrofono =
                contexto.createMediaStreamSource(flujoMicrofono);

            procesadorMicrofono =
                contexto.createScriptProcessor(4096, 1, 1);

            nodoSilencio = contexto.createGain();
            nodoSilencio.gain.value = 0;

            procesadorMicrofono.onaudioprocess =
                procesarEntradaMicrofono;

            fuenteMicrofono.connect(procesadorMicrofono);
            procesadorMicrofono.connect(nodoSilencio);
            nodoSilencio.connect(contexto.destination);

            microfonoActivo = true;

            reiniciarSegmentoVoz();
            actualizarEstadoMicrofono(true);
            ocultarError();
        } catch (error) {
            flujoMicrofono.getTracks().forEach(
                (pista) => pista.stop()
            );

            flujoMicrofono = null;
            throw error;
        }
    }

    function detenerCapturaMicrofono() {
        microfonoActivo = false;

        if (temporizadorMaximo) {
            clearTimeout(temporizadorMaximo);
            temporizadorMaximo = null;
        }

        if (procesadorMicrofono) {
            procesadorMicrofono.onaudioprocess = null;

            try {
                procesadorMicrofono.disconnect();
            } catch {}

            procesadorMicrofono = null;
        }

        if (fuenteMicrofono) {
            try {
                fuenteMicrofono.disconnect();
            } catch {}

            fuenteMicrofono = null;
        }

        if (nodoSilencio) {
            try {
                nodoSilencio.disconnect();
            } catch {}

            nodoSilencio = null;
        }

        if (flujoMicrofono) {
            flujoMicrofono.getTracks().forEach(
                (pista) => pista.stop()
            );

            flujoMicrofono = null;
        }

        reiniciarSegmentoVoz();
        actualizarEstadoMicrofono(false);

        if (!consultaEnCurso && !saludoEnCurso) {
            ocultarActividad();
        }
    }

    async function alternarMicrofono() {
        if (microfonoActivo) {
            detenerCapturaMicrofono();
            return;
        }

        try {
            await iniciarCapturaMicrofono();

            mostrarActividad(
                'Micrófono activo. Hablá y hacé una pausa al terminar.'
            );
        } catch (error) {
            console.error(
                'Error al iniciar el micrófono:',
                error
            );

            detenerCapturaMicrofono();

            mostrarError(
                error.message ||
                'No se pudo acceder al micrófono. Revisá los permisos.'
            );
        }
    }

    /* =========================================
       Mensajes escritos
    ========================================= */

    function enviarMensajeTexto() {
        const texto = elementos.textoMensaje.value.trim();

        if (!texto) return;

        mostrarError(
            'El envío de mensajes escritos todavía no está implementado en el WebSocket del backend.'
        );
    }

    /* =========================================
       Eventos de la interfaz
    ========================================= */

    elementos.botonEscucha.addEventListener(
        'click',
        alternarMicrofono
    );

    elementos.formularioMensaje.addEventListener(
        'submit',
        (evento) => {
            evento.preventDefault();
            enviarMensajeTexto();
        }
    );

    elementos.botonConfirmarToma.addEventListener(
        'click',
        confirmarToma
    );

    window.addEventListener('beforeunload', () => {
        detenerCapturaMicrofono();

        if (conexion) {
            conexion.close();
        }

        if (fuenteAudioActual) {
            try {
                fuenteAudioActual.stop();
            } catch {}
        }

        colaAudio = [];

        if (
            contextoAudio &&
            contextoAudio.state !== 'closed'
        ) {
            contextoAudio.close();
        }
    });

    actualizarEstadoMicrofono(false);
    actualizarBotonConfirmacion();
    ocultarError();
    ocultarActividad();
    conectarWebSocket();
})();
