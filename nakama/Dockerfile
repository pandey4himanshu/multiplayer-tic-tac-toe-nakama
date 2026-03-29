FROM heroiclabs/nakama:3.22.0

COPY modules /nakama/data/modules
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
