FROM swipl:latest

WORKDIR /app

COPY reglas.pl ./
COPY server.pl ./

CMD ["swipl", "-s", "server.pl"]
