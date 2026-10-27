# Faster Course Coach frontend on the existing VM

The default `docker-compose.yml` runs Vite and Uvicorn in development mode.
Use `docker-compose.vm.yml` as an override on the VM to serve a Vite production
build through Nginx and to disable backend auto-reload. It keeps the same
Compose project, database, uploads, and avatar volumes.

From the repository directory on the VM, with a clean `dev` checkout:

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

To return to the previous development configuration, run:

```sh
sudo docker compose up -d --build
```

Do not use `down -v`: it removes persisted data. This change addresses frontend
development-server overhead. If API calls remain slow, inspect a slow request's
Network > Timing breakdown and compare it with a request timed on the VM.
