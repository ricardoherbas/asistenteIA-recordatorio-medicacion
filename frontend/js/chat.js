
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

        contenedor.scrollIntoView({ behavior: 'smooth', block: 'end' });
        return contenedor;
    }

    function actualizarConexion(conectada, mensaje) {
        elementos.estadoConexion.textContent = mensaje;
        elementos.estadoConexion.dataset.conectado = String(conectada);
    }

    function enviarInicioAsistente() {
        let persona = null;

        try {
            const guardada = sessionStorage.getItem('persona');
            persona = guardada ? JSON.parse(guardada) : null;
        } catch (error) {
            console.error('No se pudo recuperar el perfil:', error);
        }

        const nombre = typeof persona?.nombre === 'string' ? persona.nombre.trim() : '';

        if (!conexion || conexion.readyState !== WebSocket.OPEN) return;

        mostrarActividad('Preparando tu saludo...');

        conexion.send(JSON.stringify({
            type: 'iniciar_asistente',
            nombre
        }));
    }

    function conectarWebSocket() {
        if (conexion && (conexion.readyState === WebSocket.OPEN || conexion.readyState === WebSocket.CONNECTING)) return;

        actualizarConexion(false, 'Conectando con el asistente…');

        try {
            conexion = new WebSocket(window.APP_CONFIG.WEBSOCKET_URL);
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
            ocultarActividad();

            if (microfonoActivo) {
                mostrarError('Se perdió la conexión. Volvé a conectarte antes de continuar.');
                detenerCapturaMicrofono();
            }
        });

        conexion.addEventListener('error', () => {
            mostrarError('Ocurrió un problema con la conexión al asistente.');
        });
    }

    function gestionarMensajeServidor(evento) {
        if (typeof evento.data !== 'string') {
            audiosPendientesDecodificacion++;

            cadenaDecodificacion = cadenaDecodificacion
                .then(() => reproducirAudioRecibido(evento.data))
                .catch((error) => {
                    console.error('Error al procesar el audio recibido:', error);
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

        if (mensaje.tipo === 'error' || mensaje.error) {
            consultaEnCurso = false;
            esperandoRespuesta = false;
            respuestaFinalizada = true;

            if (saludoEnCurso) {
                saludoEnCurso = false;
                saludoFinalizadoServidor = true;
            }

            ocultarActividad();
            mostrarError(mensaje.mensaje || mensaje.error || 'Ocurrió un error.');
            comprobarFinSaludo();
            return;
        }

        switch (mensaje.tipo) {
            case 'saludo':
                if (mensaje.texto) agregarMensaje('asistente', mensaje.texto);
                break;

            case 'fin_saludo':
                saludoFinalizadoServidor = true;
                comprobarFinSaludo();
                break;

            case 'transcripcion':
                if (mensaje.texto) agregarMensaje('usuario', mensaje.texto);
                break;

            case 'intencion':
                console.info('Intención detectada:', mensaje.intencion);
                break;

            case 'accion':
                console.info('Acción determinada por Prolog:', mensaje.accion);
                break;

            case 'respuesta':
                if (mensaje.texto) agregarMensaje('asistente', mensaje.texto);
                break;

            case 'fin_respuesta':
                respuestaFinalizada = true;
                esperandoRespuesta = false;
                comprobarFinConsulta();
                break;

            default:
                console.info('Mensaje recibido del backend:', mensaje);
        }
    }

    async function obtenerAudioContexto() {
        if (!contextoAudio) contextoAudio = new AudioContext();
        if (contextoAudio.state === 'suspended') await contextoAudio.resume();
        return contextoAudio;
    }

    async function reproducirAudioRecibido(datos) {
        const contexto = await obtenerAudioContexto();
        const copia = datos.slice(0);
        const buffer = await contexto.decodeAudioData(copia);

        colaAudio.push(buffer);
        reproducirSiguienteAudio();
    }

    function reproducirSiguienteAudio() {
        if (reproduciendoAudio || colaAudio.length === 0 || !contextoAudio) {
            comprobarFinSaludo();
            comprobarFinConsulta();
            return;
        }

        reproduciendoAudio = true;

        const buffer = colaAudio.shift();
        const fuente = contextoAudio.createBufferSource();

        fuenteAudioActual = fuente;
        fuente.buffer = buffer;
        fuente.connect(contextoAudio.destination);

        fuente.addEventListener('ended', () => {
            fuenteAudioActual = null;
            reproduciendoAudio = false;

            reproducirSiguienteAudio();
            comprobarFinSaludo();
            comprobarFinConsulta();
        }, { once: true });

        fuente.start();
    }

    async function comprobarFinSaludo() {
        if (
            !saludoEnCurso ||
            !saludoFinalizadoServidor ||
            audiosPendientesDecodificacion > 0 ||
            reproduciendoAudio ||
            colaAudio.length > 0 ||
            iniciandoMicrofonoAutomatico ||
            saludoCompletado
        ) return;

        saludoCompletado = true;
        saludoEnCurso = false;
        iniciandoMicrofonoAutomatico = true;

        mostrarActividad('Activando el micrófono...');

        try {
            await iniciarCapturaMicrofono();
            mostrarActividad('Ya podés hablar. Te estoy escuchando.');
        } catch (error) {
            console.error('No se pudo activar el micrófono automáticamente:', error);
            mostrarError('El saludo terminó. Presioná «Activar escucha» para empezar a hablar.');
            mostrarActividad('Esperando que actives el micrófono.');
        } finally {
            iniciandoMicrofonoAutomatico = false;
        }
    }

    function comprobarFinConsulta() {
        if (!respuestaFinalizada || reproduciendoAudio || colaAudio.length > 0 || audiosPendientesDecodificacion > 0) return;

        consultaEnCurso = false;
        esperandoRespuesta = false;
        ocultarActividad();

        if (microfonoActivo) mostrarActividad('Micrófono activo. Podés hablar cuando quieras.');
    }

    function actualizarEstadoMicrofono(activo) {
        elementos.botonEscucha.setAttribute('aria-pressed', String(activo));
        elementos.textoBotonEscucha.textContent = activo ? 'Desactivar micrófono' : 'Activar escucha';
        elementos.botonEscucha.setAttribute('aria-label', activo ? 'Desactivar micrófono' : 'Activar micrófono');
        elementos.estadoMicrofono.textContent = activo ? 'Micrófono habilitado' : 'Micrófono desactivado';
        elementos.indicadorMicrofono.dataset.activo = String(activo);
    }

    function reiniciarSegmentoVoz() {
        fragmentosVoz = [];
        muestrasSilencio = 0;
        muestrasVoz = 0;
        muestrasTotales = 0;
        muestrasPrevias = [];
    }

    function calcularRMS(muestras) {
        let suma = 0;
        for (let i = 0; i < muestras.length; i++) suma += muestras[i] * muestras[i];
        return Math.sqrt(suma / Math.max(1, muestras.length));
    }

    function agregarFragmentoAudio(muestras) {
        const copia = new Float32Array(muestras);
        fragmentosVoz.push(copia);
        muestrasTotales += copia.length;
    }

    function procesarEntradaMicrofono(evento) {
        if (!microfonoActivo || saludoEnCurso || consultaEnCurso) return;

        const entrada = evento.inputBuffer.getChannelData(0);
        const rms = calcularRMS(entrada);
        const hayVoz = rms >= CONFIG_AUDIO.umbralSilencio;

        if (hayVoz) {
            if (fragmentosVoz.length === 0 && muestrasPrevias.length) agregarFragmentoAudio(new Float32Array(muestrasPrevias));
            agregarFragmentoAudio(entrada);
            muestrasVoz += entrada.length;
            muestrasSilencio = 0;
        } else if (fragmentosVoz.length > 0) {
            agregarFragmentoAudio(entrada);
            muestrasSilencio += entrada.length;
        } else {
            muestrasPrevias.push(...entrada);

            const maximoPrevio = Math.floor(contextoAudio.sampleRate * CONFIG_AUDIO.margenInicioMs / 1000);

            if (muestrasPrevias.length > maximoPrevio) {
                muestrasPrevias = muestrasPrevias.slice(muestrasPrevias.length - maximoPrevio);
            }

            return;
        }

        const duracionSilencioMs = muestrasSilencio / contextoAudio.sampleRate * 1000;
        const duracionTotalMs = muestrasTotales / contextoAudio.sampleRate * 1000;

        if (duracionSilencioMs >= CONFIG_AUDIO.duracionSilencioMs || duracionTotalMs >= CONFIG_AUDIO.duracionMaximaMs) finalizarSegmentoVoz();
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

    function remuestrearPCM(muestras, frecuenciaOrigen, frecuenciaDestino) {
        if (frecuenciaOrigen === frecuenciaDestino) return new Float32Array(muestras);

        const proporcion = frecuenciaOrigen / frecuenciaDestino;
        const longitudDestino = Math.floor(muestras.length / proporcion);
        const resultado = new Float32Array(longitudDestino);

        for (let i = 0; i < longitudDestino; i++) {
            const posicion = i * proporcion;
            const indice = Math.floor(posicion);
            const fraccion = posicion - indice;
            const muestraInicial = muestras[indice] || 0;
            const muestraSiguiente = muestras[Math.min(indice + 1, muestras.length - 1)] || 0;
            resultado[i] = muestraInicial + (muestraSiguiente - muestraInicial) * fraccion;
        }

        return resultado;
    }

    function convertirAInt16(muestrasFloat) {
        const resultado = new Int16Array(muestrasFloat.length);

        for (let i = 0; i < muestrasFloat.length; i++) {
            const muestra = Math.max(-1, Math.min(1, muestrasFloat[i]));
            resultado[i] = muestra < 0 ? muestra * 32768 : muestra * 32767;
        }

        return resultado;
    }

    function finalizarSegmentoVoz() {
        if (!fragmentosVoz.length) {
            reiniciarSegmentoVoz();
            return;
        }

        const duracionMs = muestrasTotales / contextoAudio.sampleRate * 1000;
        const tuvoVozSuficiente = muestrasVoz / contextoAudio.sampleRate * 1000 >= CONFIG_AUDIO.duracionMinimaMs;
        const muestras = unirFragmentos(fragmentosVoz, muestrasTotales);

        reiniciarSegmentoVoz();

        if (duracionMs < CONFIG_AUDIO.duracionMinimaMs || !tuvoVozSuficiente) return;
        enviarAudioPCM(muestras);
    }

    function enviarAudioPCM(muestrasFloat) {
        if (!microfonoActivo || saludoEnCurso) return;

        if (!conexion || conexion.readyState !== WebSocket.OPEN) {
            mostrarError('No hay conexión con el asistente. No se pudo enviar la frase.');
            return;
        }

        if (consultaEnCurso) return;

        const muestrasRemuestreadas = remuestrearPCM(muestrasFloat, contextoAudio.sampleRate, CONFIG_AUDIO.frecuenciaDestino);
        const pcm = convertirAInt16(muestrasRemuestreadas);

        if (pcm.length === 0) return;

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
            mostrarError('No se pudo enviar el audio al asistente.');
            console.error('Error al enviar PCM:', error);
        }
    }

    async function iniciarCapturaMicrofono() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('El navegador no permite acceder al micrófono. Usá localhost o una conexión HTTPS.');
        }

        if (!conexion || conexion.readyState !== WebSocket.OPEN) throw new Error('Todavía no hay conexión con el asistente.');

        if (microfonoActivo) return;

        flujoMicrofono = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        try {
            const contexto = await obtenerAudioContexto();

            fuenteMicrofono = contexto.createMediaStreamSource(flujoMicrofono);
            procesadorMicrofono = contexto.createScriptProcessor(4096, 1, 1);
            nodoSilencio = contexto.createGain();
            nodoSilencio.gain.value = 0;

            procesadorMicrofono.onaudioprocess = procesarEntradaMicrofono;
            fuenteMicrofono.connect(procesadorMicrofono);
            procesadorMicrofono.connect(nodoSilencio);
            nodoSilencio.connect(contexto.destination);

            microfonoActivo = true;
            reiniciarSegmentoVoz();
            actualizarEstadoMicrofono(true);
            ocultarError();
        } catch (error) {
            flujoMicrofono.getTracks().forEach((pista) => pista.stop());
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
            try { procesadorMicrofono.disconnect(); } catch {}
            procesadorMicrofono = null;
        }

        if (fuenteMicrofono) {
            try { fuenteMicrofono.disconnect(); } catch {}
            fuenteMicrofono = null;
        }

        if (nodoSilencio) {
            try { nodoSilencio.disconnect(); } catch {}
            nodoSilencio = null;
        }

        if (flujoMicrofono) {
            flujoMicrofono.getTracks().forEach((pista) => pista.stop());
            flujoMicrofono = null;
        }

        reiniciarSegmentoVoz();
        actualizarEstadoMicrofono(false);

        if (!consultaEnCurso && !saludoEnCurso) ocultarActividad();
    }

    async function alternarMicrofono() {
        if (microfonoActivo) {
            detenerCapturaMicrofono();
            return;
        }

        try {
            await iniciarCapturaMicrofono();
            mostrarActividad('Micrófono activo. Hablá y hacé una pausa al terminar.');
        } catch (error) {
            console.error('Error al iniciar el micrófono:', error);
            detenerCapturaMicrofono();
            mostrarError(error.message || 'No se pudo acceder al micrófono. Revisá los permisos.');
        }
    }

    function enviarMensajeTexto() {
        const texto = elementos.textoMensaje.value.trim();
        if (!texto) return;

        mostrarError('El envío de mensajes escritos todavía no está implementado en el WebSocket del backend.');
    }

    elementos.botonEscucha.addEventListener('click', alternarMicrofono);

    elementos.formularioMensaje.addEventListener('submit', (evento) => {
        evento.preventDefault();
        enviarMensajeTexto();
    });

    elementos.botonConfirmarToma.addEventListener('click', () => {
        mostrarError('La confirmación de una toma todavía no está conectada a un registro persistente.');
    });

    window.addEventListener('beforeunload', () => {
        detenerCapturaMicrofono();

        if (conexion) conexion.close();

        if (fuenteAudioActual) {
            try { fuenteAudioActual.stop(); } catch {}
        }

        colaAudio = [];

        if (contextoAudio && contextoAudio.state !== 'closed') contextoAudio.close();
    });

    actualizarEstadoMicrofono(false);
    ocultarError();
    ocultarActividad();
    conectarWebSocket();
})();
