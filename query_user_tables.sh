sudo docker exec -it davax-postgres bash -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\x" -c "SELECT * FROM users;"'
