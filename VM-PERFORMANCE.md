# Faster Course Coach frontend on the existing VM

The default `docker-compose.yml` runs Vite and Uvicorn in development mode.
Use `docker-compose.vm.yml` as an override on the VM to serve a Vite production
build through Nginx and to disable backend auto-reload. It keeps the same
Compose project and persistent volumes. **It does not select the database:**
every database override already used by the VM must remain in the command.

Before updating the VM, check which database the running backend uses:

```sh
sudo docker exec coursecoach-community-backend-1 sh -c 'printf "DB_HOST=%s\n" "$DB_HOST"'
grep '^COMPOSE_FILE=' .env
```

**On `coursecoach-01`, which uses Supabase**, keep the existing cloud database
override in every command. The `-f` flags replace `COMPOSE_FILE` from `.env`; omitting
`docker-compose.cloud-db.yml` reconnects the backend to the old local database
and makes newer data and roles appear to disappear:

```sh
ls -l docker-compose.cloud-db.yml
git pull --ff-only origin dev
sudo docker compose -f docker-compose.yml -f docker-compose.cloud-db.yml -f docker-compose.vm.yml config --quiet
sudo docker compose -f docker-compose.yml -f docker-compose.cloud-db.yml -f docker-compose.vm.yml up -d --build
sudo docker compose -f docker-compose.yml -f docker-compose.cloud-db.yml -f docker-compose.vm.yml ps
sudo docker exec coursecoach-community-backend-1 sh -c 'printf "DB_HOST=%s\n" "$DB_HOST"'
curl -fsS http://localhost/health
```

For a routine update, `DB_HOST` should remain the same Supabase host. When
recovering from an accidental switch to `db`, it should change back to the
Supabase host. These commands do not remove the local database volume or
change Supabase data.

Only if a different VM intentionally uses local PostgreSQL (`DB_HOST=db`), use
the two-file configuration instead:

```sh
git pull --ff-only origin dev
sudo docker compose -f docker-compose.yml -f docker-compose.vm.yml config --quiet
sudo docker compose -f docker-compose.yml -f docker-compose.vm.yml up -d --build
sudo docker compose -f docker-compose.yml -f docker-compose.vm.yml ps
curl -fsS http://localhost/health
curl -I http://localhost/favicon.svg
```

Expect the frontend to run Nginx on the existing container port 3000 and the
backend to run Uvicorn without `--reload`. The initial build can still take
time, but subsequent page loads should request bundled assets instead of many
Vite development modules. Browser caching may require a hard reload once.

To return to the previous development frontend while keeping the **same**
database, use the matching command:

```sh
# Local PostgreSQL:
sudo docker compose up -d --build

# Supabase PostgreSQL:
sudo docker compose -f docker-compose.yml -f docker-compose.cloud-db.yml up -d --build
```

Do not use `down -v`: it removes persisted data. This change addresses frontend
development-server overhead. If API calls remain slow, inspect a slow request's
Network > Timing breakdown and compare it with a request timed on the VM.
