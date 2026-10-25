(() => {
    'use strict';

    const protocoloWebSocket =
        window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    const host = window.location.host;

    window.APP_CONFIG = Object.freeze({
        API_BASE_URL: window.location.origin,
        WEBSOCKET_URL: `${protocoloWebSocket}//${host}/ws`,
        TIMEOUT_MS: 10000
    });
})();