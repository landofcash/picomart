FROM redis:7-alpine
CMD ["sh", "-c", "exec /usr/local/bin/docker-entrypoint.sh redis-server --bind 0.0.0.0 :: --protected-mode yes --requirepass \"$REDISPASSWORD\" --appendonly yes --appendfsync everysec --dir /data"]
