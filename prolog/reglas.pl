
:- module(reglas, [
    accion/2,
    determinar_accion/2,
    seguimiento/4,
    resultado/2,
    determinar_seguimiento/4
]).

% --------------------------------------------
% 1. Intenciones y acciones
% --------------------------------------------

accion(confirmar_toma, registrar_confirmacion).
accion(no_tome, mantener_pendiente).
accion(consultar_horario, consultar_recordatorio).
accion(rechazar_recordatorio, solicitar_aclaracion).
accion(respuesta_ambigua, pedir_aclaracion).
accion(sin_respuesta, evaluar_seguimiento).


% --------------------------------------------
% 2. Determinar una única acción
% --------------------------------------------

determinar_accion(Intencion, Accion) :-
    (   accion(Intencion, Accion)
    ->  !
    ;   Accion = pedir_aclaracion
    ).


% --------------------------------------------
% 3. Reglas de seguimiento
% --------------------------------------------

seguimiento(
    pendiente,
    sin_confirmacion,
    cinco_minutos,
    enviar_aviso_seguimiento
).

seguimiento(
    confirmado,
    _,
    _,
    cancelar_seguimiento
).

seguimiento(
    pendiente,
    sin_confirmacion,
    antes_de_cinco_minutos,
    mantener_pendiente
).


% --------------------------------------------
% 4. Interpretación del resultado
% --------------------------------------------

resultado(confirmar_toma, confirmacion_explicita).
resultado(no_tome, sin_confirmacion).
resultado(respuesta_ambigua, requiere_aclaracion).
resultado(sin_respuesta, estado_no_confirmado).


% --------------------------------------------
% 5. Determinar seguimiento
% --------------------------------------------

determinar_seguimiento(Estado, Confirmacion, Tiempo, Accion) :-
    (   seguimiento(Estado, Confirmacion, Tiempo, Accion)
    ->  !
    ;   Accion = revisar_estado
    ).
