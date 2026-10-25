
% ============================================
% Asistente de recordatorios de medicación
% Archivo: prolog/server.pl
% ============================================

:- use_module(library(http/thread_httpd)).
:- use_module(library(http/http_dispatch)).
:- use_module(library(http/http_json)).
:- use_module(library(http/http_error)).
:- use_module(library(error)).
:- use_module(reglas).

% Endpoint HTTP
:- http_handler(root(consultar), manejar_consulta, []).


% --------------------------------------------
% 1. Inicio del servidor
% --------------------------------------------

iniciar_servidor :-
    (   getenv('PROLOG_PORT', PuertoTexto),
        catch(atom_number(PuertoTexto, Puerto), _, fail),
        integer(Puerto),
        Puerto > 0,
        Puerto =< 65535
    ->  http_server(http_dispatch, [port(Puerto)]),
        format('Servidor Prolog escuchando en el puerto ~w~n', [Puerto]),
        thread_get_message(_)
    ;   throw(error(
            configuracion_invalida('PROLOG_PORT'),
            context(iniciar_servidor, 'Revisá PROLOG_PORT en .env')
        ))
    ).


% --------------------------------------------
% 2. Manejo de solicitudes HTTP
% --------------------------------------------

manejar_consulta(Request) :-
    (   memberchk(method(post), Request)
    ->  http_read_json_dict(Request, Datos),
        procesar_consulta(Datos)
    ;   throw(http_reply(method_not_allowed(post)))
    ).


% --------------------------------------------
% 3. Validación y evaluación
% --------------------------------------------

procesar_consulta(Datos) :-
    (   is_dict(Datos),
        get_dict(intencion, Datos, IntencionTexto),
        string(IntencionTexto),
        string_length(IntencionTexto, Longitud),
        Longitud > 0,
        Longitud =< 80
    ->  atom_string(Intencion, IntencionTexto),
        determinar_accion(Intencion, Accion),
        atom_string(Intencion, IntencionRespuesta),
        atom_string(Accion, AccionTexto),
        reply_json_dict(_{
            intencion: IntencionRespuesta,
            accion: AccionTexto
        })
    ;   throw(http_reply(bad_request(
            json([error='La intención debe ser un texto válido de hasta 80 caracteres'])
        )))
    ).


% --------------------------------------------
% 4. Punto de entrada
% --------------------------------------------

:- initialization(iniciar_servidor, main).
