# Pteroless

**Pteroless** is a lightweight, local-first server management panel
based on the Pterodactyl Panel codebase.

The project keeps the familiar Pterodactyl-style panel experience, but
changes the server execution model: instead of requiring a separate
Wings daemon and Docker-based server containers, Pteroless provides a
built-in **local process runner** that starts and manages applications
directly on the same machine as the panel.

> **Important:** Pteroless is a modified/reworked project derived from
> Pterodactyl Panel. It is not an independent implementation of the
> original Pterodactyl architecture. The original Pterodactyl license
> and attribution requirements remain important.

------------------------------------------------------------------------

## Table of Contents

-   [Overview](#overview)
-   [What Pteroless Changes](#what-pteroless-changes)
-   [Architecture](#architecture)
-   [Pterodactyl vs Pteroless](#pterodactyl-vs-pteroless)
-   [Local Runner](#local-runner)
-   [Supported Runtime Presets](#supported-runtime-presets)
-   [Node.js](#nodejs)
-   [Next.js](#nextjs)
-   [Python](#python)
-   [Java / JAR](#java--jar)
-   [PHP](#php)
-   [Go](#go)
-   [Custom Runtime](#custom-runtime)
-   [Process Management](#process-management)
-   [Console and Logs](#console-and-logs)
-   [Resource Monitoring](#resource-monitoring)
-   [Server Storage](#server-storage)
-   [Ports and Allocations](#ports-and-allocations)
-   [Database](#database)
-   [Installation](#installation)
-   [Administrator Setup](#administrator-setup)
-   [Environment Variables](#environment-variables)
-   [Starting the Panel](#starting-the-panel)
-   [Installer Details](#installer-details)
-   [File Structure](#file-structure)
-   [Important Project Files](#important-project-files)
-   [Docker and
    docker-compose.example.yml](#docker-and-docker-composeexampleyml)
-   [Wings Compatibility Code](#wings-compatibility-code)
-   [Egg and Nest Compatibility](#egg-and-nest-compatibility)
-   [Security](#security)
-   [Production Considerations](#production-considerations)
-   [Development](#development)
-   [Updating](#updating)
-   [Backup](#backup)
-   [Troubleshooting](#troubleshooting)
-   [Limitations](#limitations)
-   [Project Status](#project-status)
-   [Credits](#credits)
-   [License](#license)

------------------------------------------------------------------------

# Overview

Pteroless is designed for users who want a panel for running
applications on a VPS or Linux machine without having to deploy the
traditional:

``` text
Pterodactyl Panel
        |
        v
      Wings
        |
        v
     Docker
        |
        v
   Application
```

Pteroless instead uses:

``` text
             Pteroless Panel
                    |
                    v
            Built-in Local Runner
                    |
        +-----------+-----------+
        |           |           |
        v           v           v
     Node.js     Python       Java
        |           |           |
      Next.js      PHP          Go
        |           |           |
        +-----------+-----------+
                    |
                    v
              Linux host
```

The panel and application processes live on the same machine.

This makes Pteroless useful for:

-   personal VPS hosting;
-   Node.js bots;
-   Next.js applications;
-   Python applications;
-   Java/JAR applications;
-   PHP applications;
-   Go applications;
-   small APIs;
-   development services;
-   self-hosted tools;
-   personal projects;
-   lightweight server applications.

------------------------------------------------------------------------

# What Pteroless Changes

The primary change is the execution layer.

The original Pterodactyl project is built around a panel that
communicates with a daemon/node layer for server execution. Pteroless
introduces a local execution path so that a server can be created and
run directly on the same machine as the panel.

## Pteroless local path

``` text
Web UI
  |
  v
Laravel / Pterodactyl-derived backend
  |
  v
LocalServerService
  |
  v
LocalProcessManager
  |
  v
Linux process
```

The local runner does not need Wings to start the application.

The project creates a built-in `Local` node representation so the
existing Pterodactyl server data model can still be used.

------------------------------------------------------------------------

# Architecture

A normal Pterodactyl-style deployment can contain several independent
infrastructure layers.

Pteroless reduces that for the local use case.

## Traditional concept

``` text
                         Browser
                            |
                            v
                     Pterodactyl Panel
                            |
                            v
                          Wings
                            |
                            v
                         Docker
                            |
              +-------------+-------------+
              |             |             |
              v             v             v
           Server 1      Server 2      Server 3
```

## Pteroless concept

``` text
                         Browser
                            |
                            v
                       Pteroless
                            |
                            v
                    LocalProcessManager
                            |
              +-------------+-------------+
              |             |             |
              v             v             v
           Node.js       Python        Java/JAR
              |             |             |
              +-------------+-------------+
                            |
                            v
                       Linux host
```

This is intentionally simpler.

The trade-off is that direct host execution does not provide the same
isolation model as Docker containers.

------------------------------------------------------------------------

# Pterodactyl vs Pteroless

  ------------------------------------------------------------------------------
  Feature                 Traditional Pterodactyl Pteroless local architecture
                          architecture            
  ----------------------- ----------------------- ------------------------------
  Panel                   Yes                     Yes

  Wings                   Required for normal     Not required for local runner
                          node execution          

  Docker                  Core to normal server   Not required by local runner
                          isolation               

  Local execution         Via node/daemon         Built-in

  Database default        Commonly external       SQLite
                          database                

  Redis default           Commonly used in Docker File cache/session
                          deployment              configuration by installer

  Runtime                 Container image / Egg   Host runtime preset

  Server directory        Node filesystem         `storage/app/servers/<uuid>`

  Process manager         Wings                   `LocalProcessManager`

  Console                 WebSocket/daemon model  Local FIFO command pipe

  Logs                    Node/daemon logs        Local runner output log

  Resource data           Node/daemon telemetry   cgroup v2 + filesystem
                                                  quotas + nftables counters

  Isolation               Docker/container based  Host process based
  ------------------------------------------------------------------------------

This table describes the architecture of this project and is not
intended to claim that the two systems have identical capabilities.

------------------------------------------------------------------------

# Local Runner

The local runner is the core Pteroless feature.

The relevant implementation is located under:

``` text
app/Services/Local/
```

The current project contains:

``` text
LocalServerService.php
LocalProcessManager.php
```

## LocalServerService

`LocalServerService` is responsible for preparing the local environment.

It:

-   creates or finds the built-in local node;
-   creates a local location;
-   creates compatibility runtime records;
-   allocates a local port;
-   creates a server record;
-   creates the server directory;
-   identifies local-runner servers;
-   provides runtime startup presets.

The local node is represented internally as:

``` text
Local
```

with:

``` text
127.0.0.1
```

as its FQDN.

The node description explicitly identifies it as a built-in local runner
and states that Wings is not used for this path.

------------------------------------------------------------------------

# Supported Runtime Presets

The current local service defines these runtime presets:

``` text
nodejs
nextjs
python
java
php
go
custom
```

In other words, the currently implemented runtime list is:

  Runtime    Startup behavior
  ---------- -------------------------------------------------
  Node.js    `npm install && npm start` or `node index.js`
  Next.js    `npm install && npm run build && npm run start`
  Python     venv + requirements installation + `main.py`
  Java/JAR   `java -jar server.jar`
  PHP        Composer + Laravel/PHP built-in server
  Go         `go mod download && go run`
  Custom     User-defined startup command

The exact command is stored as the server startup command and executed
by the local process manager.

------------------------------------------------------------------------

# Node.js

The Node.js preset detects `package.json`.

If the file exists, the preset runs:

``` bash
npm install && npm start
```

If `package.json` does not exist, it falls back to:

``` bash
node index.js
```

Example project:

``` text
my-node-app/
├── package.json
└── index.js
```

The normal startup expectation is that `package.json` contains an
appropriate `start` script.

Example:

``` json
{
  "scripts": {
    "start": "node index.js"
  }
}
```

------------------------------------------------------------------------

# Next.js

The Next.js preset expects a Node.js/Next.js project with:

``` text
package.json
```

It performs:

``` bash
npm install
npm run build
npm run start
```

A typical project can look like:

``` text
my-next-app/
├── package.json
├── next.config.js
├── app/
├── public/
└── ...
```

The `start` script should point to the production Next.js server.

For example:

``` json
{
  "scripts": {
    "build": "next build",
    "start": "next start"
  }
}
```

------------------------------------------------------------------------

# Python

The Python preset supports projects using:

``` text
requirements.txt
```

When the requirements file exists, the runner creates:

``` text
.venv/
```

then installs:

``` bash
pip install -r requirements.txt
```

and starts:

``` bash
.venv/bin/python main.py
```

Without `requirements.txt`, the fallback is:

``` bash
python3 main.py
```

Example:

``` text
my-python-app/
├── main.py
└── requirements.txt
```

------------------------------------------------------------------------

# Java / JAR

The Java preset expects:

``` text
server.jar
```

and runs:

``` bash
java -jar server.jar
```

Example:

``` text
my-java-app/
└── server.jar
```

Java options can also be included in a custom startup command when
required.

------------------------------------------------------------------------

# PHP

The PHP preset supports common PHP application layouts.

If a `composer.json` exists, the runner first attempts:

``` bash
composer install --no-interaction --prefer-dist
```

Then it checks for Laravel:

``` text
artisan
```

If Laravel is detected, it runs:

``` bash
php artisan serve --host=0.0.0.0 --port="${PORT:-8000}"
```

If the project has `index.php`, it uses PHP's built-in server.

When a `public/` directory exists:

``` bash
php -S 0.0.0.0:"${PORT:-8000}" -t public
```

Otherwise:

``` bash
php -S 0.0.0.0:"${PORT:-8000}"
```

This makes the PHP preset useful for both Laravel-style and simple PHP
applications.

------------------------------------------------------------------------

# Go

The Go preset checks for:

``` text
go.mod
```

or:

``` text
main.go
```

With `go.mod`, it runs:

``` bash
go mod download
go run .
```

With `main.go` but no `go.mod`, it runs:

``` bash
go run main.go
```

Example:

``` text
my-go-app/
├── go.mod
├── main.go
└── ...
```

------------------------------------------------------------------------

# Custom Runtime

The `custom` preset intentionally has an empty default command.

This is intended for applications where the predefined runtime presets
do not match the project's startup process.

A custom command can be supplied through the server startup
configuration.

Examples might include a compiled binary or a project-specific script.

------------------------------------------------------------------------

# Process Management

The local process manager is implemented in:

``` text
app/Services/Local/LocalProcessManager.php
```

It handles:

-   start;
-   stop;
-   force stop;
-   restart;
-   PID tracking;
-   console commands;
-   log retrieval;
-   resource statistics.

The process is started as a detached Linux process.

The manager creates a process group and stores the PID for later
lifecycle operations.

------------------------------------------------------------------------

# PID Tracking

Each local server gets its own metadata directory.

A PID file is stored under:

``` text
.local/pid
```

The runner checks whether the process is alive before reporting it as
running.

When a stale PID is detected, the PID file is removed.

This prevents a server from being permanently shown as running after its
process has exited.

------------------------------------------------------------------------

# Console and Logs

The local runner uses a FIFO pipe for sending commands to the process.

The file is:

``` text
.local/stdin.fifo
```

The application output is redirected to:

``` text
.local/logs/output.log
```

This gives the panel a local mechanism for:

-   viewing application output;
-   sending console input;
-   tracking the process;
-   restarting the process.

The log endpoint reads the most recent section of the output file rather
than loading an unlimited amount of output into memory.

------------------------------------------------------------------------

# Resource Monitoring

The local process manager reads Linux process information through
`/proc`. With the privileged resource agent installed, resource usage is
read from per-server cgroups, filesystem usage, and nftables counters.
Without the agent, the legacy process and directory measurements are used.

The agent can collect:

-   process state;
-   resident memory usage;
-   CPU usage;
-   disk usage;
-   uptime.

Disk usage is calculated from the server directory.

When the privileged resource agent is installed, a configured disk limit
uses a soft limit: the agent checks active servers approximately every
five seconds and stops a server whose directory reaches its limit. This is
best-effort and can allow temporary overage between checks. An
over-limit server cannot be started again until files are removed or the
limit is increased. File-manager writes, uploads, copies, and archive
operations are rejected when they would reach the configured limit.

Network usage is collected from nftables rules matching each server's
cgroup. If the agent or kernel nftables cgroup matching is unavailable,
the API reports `network_available: false` with null counters and the
client UI displays `Unavailable`. It does not display zero for measurements
the host cannot provide.

------------------------------------------------------------------------

# Memory Handling

Without the resource agent, the local process manager applies
runtime-specific best-effort limits.

For Node.js:

``` text
NODE_OPTIONS
```

can receive a calculated:

``` text
--max-old-space-size
```

For Java:

``` text
JAVA_TOOL_OPTIONS
```

can receive an `-Xmx` value.

For Go:

``` text
GOMEMLIMIT
```

can be configured.

For other processes, the manager can use:

``` bash
ulimit -v
```

The values are derived from the server memory configuration. They are
best-effort runtime/process limits, not hard resident-memory limits.

With the privileged resource agent, each server process is attached to a
cgroup v2 group and `memory.max` enforces the configured limit.

------------------------------------------------------------------------

# CPU Handling

The local runner can use a CPU/thread configuration when it matches the
supported CPU-set syntax.

When a valid CPU set is supplied, the runner can start the process
using:

``` bash
taskset -c
```

This allows a server to be assigned a CPU affinity.

Again, this is host-level process control, not container-level
isolation.

With the privileged resource agent, `cpu.max` enforces the configured CPU
percentage. Disk limits use a periodic soft-limit monitor. These are
resource controls, not container-level isolation.

------------------------------------------------------------------------

# Privileged Resource Agent

The installer runs a root-owned standalone helper daemon that communicates
with the panel over a permission-restricted Unix socket. It does not require
Wings, Docker, or systemd. A cron `@reboot` entry starts it after boot; use
`sudo pteroless-resource-agent start|stop|status` to manage it manually.
The helper accepts only validated resource-control requests, rejects
connections from managed server processes, and does not execute startup
commands as root.

Requirements for enforced limits and network counters:

-   root privileges to install and run the helper;
-   cgroup v2 with the CPU and memory controllers;
-   the host must delegate those controllers to `/sys/fs/cgroup/pteroless`;
-   `nftables` with `socket cgroupv2` matching for per-server network
  accounting.

The installer does not change host mount options, firewall rules, or
top-level cgroup controller delegation. If the host does not delegate cgroup
controllers, the helper reports an explicit startup or per-server error.
The installer does not remount filesystems or edit `/etc/fstab`. Run
`./start.sh` as the regular installer user; it starts the panel without sudo.
Local servers that were
already running when the agent was installed must be stopped and started
again to join their resource cgroups; the panel rejects a start request that
would otherwise leave an already-running process outside its limits.
Without the agent, CPU and disk limits are display-only and memory controls
remain best-effort.

------------------------------------------------------------------------

# Server Storage

Local server files are stored under:

``` text
storage/app/servers/
```

Each server gets a directory based on its UUID:

``` text
storage/app/servers/<server-uuid>/
```

Inside that directory, Pteroless creates:

``` text
.local/
├── logs/
├── home/
├── pid
└── stdin.fifo
```

The `.local` directory is reserved for runner state and is excluded from
the client file browser and file APIs.

The application itself lives in the server root.

For example:

``` text
storage/app/servers/<uuid>/
├── package.json
├── index.js
└── .local/
    ├── logs/
    ├── home/
    ├── pid
    └── stdin.fifo
```

------------------------------------------------------------------------

# Ports and Allocations

When a local server is created, Pteroless looks for an unused local
allocation.

The initial port is:

``` text
25565
```

If it is already occupied, the allocator searches for the next available
port.

The allocation uses:

``` text
127.0.0.1
```

and the selected port is exposed to the process through:

``` text
PORT
SERVER_PORT
```

This allows applications to read their assigned port from the
environment.

------------------------------------------------------------------------

# Database

The default Pteroless installation uses **SQLite**.

This is important:

> Pteroless does not use the MariaDB database from the old Docker
> Compose example during the normal `install` workflow.

The installer creates:

``` text
database/database.sqlite
```

and configures:

``` env
DB_CONNECTION=sqlite
DB_DATABASE=/path/to/Pteroless/database/database.sqlite
```

The project's Composer configuration also includes the SQLite PDO
extension requirement.

SQLite keeps the default installation simple because there is no need to
configure a separate database server, database user or database
password.

------------------------------------------------------------------------

# Installation

## Requirements

The current installer is designed for Debian/Ubuntu-style systems using
APT.

It requires:

-   root privileges;
-   `apt-get`;
-   network access;
-   PHP 8.2--8.4;
-   Composer;
-   Node.js;
-   npm;
-   Python 3;
-   Python venv;
-   Java;
-   Go.

The installer automatically handles most of these requirements.

------------------------------------------------------------------------

## Install

From the Pteroless directory:

``` bash
chmod +x install
```

Then:

``` bash
sudo ./install
```

The installer expects root privileges.

After installation:

``` bash
./start
```

------------------------------------------------------------------------

# Administrator Setup

The installer creates the first administrator account.

It checks whether a root administrator already exists.

If one already exists, it skips creation.

For automated setup, the installer accepts:

``` text
ADMIN_EMAIL
ADMIN_USERNAME
ADMIN_PASSWORD
ADMIN_FIRST_NAME
ADMIN_LAST_NAME
```

Example:

``` bash
export ADMIN_EMAIL="admin@example.com"
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="use-a-strong-password"
export ADMIN_FIRST_NAME="Admin"
export ADMIN_LAST_NAME="User"

sudo -E ./install
```

If those variables are not supplied, the installer falls back to the
interactive Pterodactyl user creation command.

Do not put real passwords into public Git repositories.

------------------------------------------------------------------------

# Environment Variables

The installer supports:

``` text
APP_URL
HASHIDS_SALT
TRUSTED_PROXIES
ADMIN_EMAIL
ADMIN_USERNAME
ADMIN_PASSWORD
ADMIN_FIRST_NAME
ADMIN_LAST_NAME
```

The default application URL is:

``` text
http://127.0.0.1:8080
```

The installer also configures:

``` env
APP_ENV=production
APP_DEBUG=false
APP_ENVIRONMENT_ONLY=false
```

When running in GitHub Codespaces, the installer defaults `TRUSTED_PROXIES` to
`**` so Laravel can use forwarded host and protocol headers. An existing
`TRUSTED_PROXIES` value is preserved. For other reverse-proxy deployments, set
this variable to the proxy addresses you trust.
The installer creates and preserves `HASHIDS_SALT`; existing configurations
without one fall back to `APP_KEY`.

The database is configured for SQLite.

Cache and session handling are configured for local file-based operation
by the installer.

The default queue connection is:

``` text
sync
```

------------------------------------------------------------------------

# Starting the Panel

Pteroless includes:

``` text
start
```

The script starts Laravel's built-in development server.
It uses the active `php` command, but falls back to `/usr/bin/php` if the
active PHP runtime is missing the required ZIP extension. Install `php-zip`
if neither PHP runtime provides `ZipArchive`.

Default values are:

``` text
HOST=0.0.0.0
PORT=8080
```

You can override them:

``` bash
HOST=127.0.0.1 PORT=8080 ./start
```

or:

``` bash
HOST=0.0.0.0 PORT=9000 ./start
```

The script refuses to run the panel directly as root.

When started as root and `runuser` plus `www-data` are available, it
drops execution to `www-data`.

------------------------------------------------------------------------

# Installer Details

The installer performs the following major steps.

## 1. System packages

It installs:

``` text
ca-certificates
curl
unzip
git
openssl
python3
python3-venv
default-jre-headless
golang-go
nftables
quota
e2fsprogs
```

## 2. PHP

It searches for compatible:

``` text
8.2
8.3
8.4
```

and installs the required PHP packages.

The installer checks that the resulting PHP version is:

``` text
>= 8.2
< 8.5
```

## 3. Composer

If Composer is not installed, the installer downloads the official
installer and verifies its SHA-384 signature before installing Composer.

## 4. Node.js

The current installer installs **Node.js 26** when a suitable Node.js
installation is not already available.

The package configuration itself accepts Node.js 22 or newer.

Therefore:

-   package requirement: Node.js `>=22`;
-   current installer preference: Node.js 26.

## 5. Python

The installer checks:

``` bash
python3
python3 -m venv
```

## 6. Java

The installer verifies:

``` bash
java -version
```

## 7. Go

The installer verifies:

``` bash
go version
```

## 8. SQLite

The installer creates:

``` text
database/database.sqlite
```

## 9. Laravel environment

The installer creates `.env` from `.env.example` when necessary and
configures production settings.

## 10. Composer dependencies

It runs:

``` bash
composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist
```

## 11. Database migrations

It runs:

``` bash
php artisan migrate --force --no-interaction
```

## 12. Administrator

It creates the first administrator if one does not already exist.

## 13. Frontend build

When `yarn.lock` exists:

``` bash
yarn install --frozen-lockfile --non-interactive
yarn run build:production
```

Otherwise:

``` bash
npm ci
npm run build:production
```

## 14. Permissions

The installer assigns the application and runtime storage to:

``` text
www-data:www-data
```

and prepares Laravel cache/log/session directories.

------------------------------------------------------------------------

# File Structure

The important project structure is approximately:

``` text
Pteroless/
├── app/
│   ├── Http/
│   ├── Models/
│   ├── Repositories/
│   └── Services/
│       └── Local/
│           ├── LocalServerService.php
│           └── LocalProcessManager.php
│
├── bootstrap/
├── config/
├── database/
│   └── database.sqlite
├── public/
├── resources/
├── routes/
├── storage/
│   └── app/
│       └── servers/
│
├── tests/
│
├── artisan
├── composer.json
├── composer.lock
├── package.json
├── yarn.lock
├── install
├── start
└── README.md
```

The exact source tree can change between releases.

------------------------------------------------------------------------

# Important Project Files

## `install`

The main Pteroless installation script.

It installs the operating-system dependencies, prepares
PHP/Composer/Node/Python/Java/Go, creates SQLite, migrates the database
and builds the frontend.

## `start`

The local panel startup script.

It launches Laravel's built-in server and prevents direct root
execution.

## `app/Services/Local/LocalServerService.php`

Creates and prepares local servers.

It contains the runtime presets:

``` text
nodejs
nextjs
python
java
php
go
custom
```

## `app/Services/Local/LocalProcessManager.php`

Manages:

-   process start;
-   stop;
-   restart;
-   PID;
-   commands;
-   logs;
-   resource statistics.

## `database/database.sqlite`

The default Pteroless application database.

## `storage/app/servers`

The storage root for locally managed applications.

------------------------------------------------------------------------

# Docker and docker-compose.example.yml

## Can `docker-compose.example.yml` be deleted?

**Yes, for the current Pteroless installation path, it can be removed.**

The file in the uploaded project is the upstream Pterodactyl Docker
Compose example.

It defines:

``` text
MariaDB
Redis
Pterodactyl Panel Docker image
```

and configures the panel container to connect to:

``` text
database
cache
```

with MySQL/MariaDB and Redis.

That architecture is unrelated to the current Pteroless installer.

The Pteroless installer instead:

``` text
SQLite
+
file cache
+
file sessions
+
sync queue
+
local runner
```

and the `start` script uses:

``` bash
php artisan serve
```

There is no reference to `docker-compose.example.yml` in the Pteroless
`install` or `start` scripts.

Therefore keeping the old Compose file can be confusing because it
suggests a deployment method that the current Pteroless installer does
not use.

### Recommended cleanup

These files are reasonable candidates for removal if you are committing
Pteroless as a local-runner project:

``` text
docker-compose.example.yml
Dockerfile
flake.lock
flake.nix
shell.nix
```

The first two are Docker-related.

The last three are Nix development/environment files.

Before removing any file, verify that your own deployment or CI workflow
does not reference it.

------------------------------------------------------------------------

# Why the Old Compose File Exists

Pteroless originated from a Pterodactyl codebase.

The upstream repository itself contains a `docker-compose.example.yml`
alongside files such as `Dockerfile`, Nix configuration and the normal
application source tree.

The upstream Compose file is designed around:

``` text
MariaDB
Redis
Pterodactyl Panel container
```

rather than the Pteroless local-runner architecture.

Therefore the file is best considered **leftover upstream deployment
infrastructure** unless Pteroless intentionally adds Docker support
again.

------------------------------------------------------------------------

# Wings Compatibility Code

One important detail of the current source is that Pteroless has **not
completely removed every Wings-related class**.

The local runner does not use Wings for its execution path, but the
source tree still contains Pterodactyl/Wings repositories and services.

Examples include classes under:

``` text
app/Repositories/Wings/
```

and services that still reference:

``` text
DaemonServerRepository
DaemonConfigurationRepository
DaemonPowerRepository
DaemonFileRepository
DaemonRevocationRepository
DaemonBackup...
```

There are also remaining references to:

``` text
docker
container
daemon
Wings
```

inside inherited Pterodactyl functionality.

This means the most accurate description is:

> **Pteroless adds a built-in local execution path and does not require
> Wings for its local runner.**

It would be inaccurate to claim:

> "All Wings code has been completely removed."

unless the remaining compatibility code is actually deleted and all
dependent paths are replaced.

------------------------------------------------------------------------

# Egg and Nest Compatibility

Pteroless also retains the original Pterodactyl `Nest` and `Egg`
database concepts internally.

This is intentional in the current implementation.

When a local server is created, `LocalServerService` creates
compatibility records such as:

``` text
Pteroless Local
```

and runtime records for:

``` text
Node.js
Next.js
Python
Java/JAR
PHP
Go
Custom
```

These records allow the existing Pterodactyl server schema to continue
working.

The important distinction is that the local runner does not use an Egg's
Docker image to execute the application.

The local runner uses the server's startup command directly.

In other words:

``` text
Egg/Nest
   |
   +-- compatibility/schema layer
   |
   X-- not the local Docker execution mechanism
```

The actual execution path is:

``` text
Server startup command
        |
        v
LocalProcessManager
        |
        v
Linux process
```

This is why removing every Egg/Nest reference without replacing the
underlying Pterodactyl server schema would likely break the current
implementation.

------------------------------------------------------------------------

# Why `docker_images` Still Exists

The compatibility Egg records contain a value resembling:

``` text
docker_images
```

with:

``` text
local
```

This does not mean the local runner launches a Docker container.

It is retained because the inherited Pterodactyl data model expects
Egg/server configuration fields.

The local server is identified through the local runner implementation,
including its local image/compatibility metadata.

------------------------------------------------------------------------

# Security

Pteroless executes applications directly on the host.

This is one of its biggest differences from container-based Pterodactyl
deployments.

A Docker container can provide an isolation boundary.

A normal Linux process does not automatically provide that same
boundary.

Therefore Pteroless should be deployed with care.

## Important rules

-   Do not run the panel itself as root.
-   Do not give untrusted users administrator access.
-   Do not execute arbitrary untrusted applications on a sensitive host.
-   Keep the operating system updated.
-   Keep PHP and runtime dependencies updated.
-   Use a firewall.
-   Use HTTPS for public deployments.
-   Keep `.env` private.
-   Use strong administrator credentials.
-   Back up the SQLite database.

------------------------------------------------------------------------

# Production Considerations

The included `start` script uses:

``` bash
php artisan serve
```

This is convenient for a simple local/VPS installation.

For a serious public production deployment, consider placing the
application behind a proper web server/reverse proxy and configuring the
Laravel application appropriately.

The project should not be assumed to have the same production isolation
or orchestration guarantees as a multi-node containerized Pterodactyl
installation.

------------------------------------------------------------------------

# Development

Pteroless is a Laravel/PHP application with a React/JavaScript frontend
inherited from the Pterodactyl Panel architecture.

Backend dependencies are managed by Composer.

Frontend dependencies are managed by Yarn/npm according to the
repository lockfile and scripts.

Typical backend setup:

``` bash
composer install
```

Typical frontend setup:

``` bash
yarn install
```

Build:

``` bash
yarn run build:production
```

The repository's exact development workflow may change over time.

------------------------------------------------------------------------

# Updating

Before updating Pteroless, back up at least:

``` text
.env
database/database.sqlite
storage/app/servers/
```

A typical update process is:

``` text
Backup
  |
  v
Update source
  |
  v
Composer dependencies
  |
  v
Frontend dependencies/build
  |
  v
Database migrations
  |
  v
Restart
```

Do not blindly replace the entire project directory over a live
installation without preserving the database and server files.

------------------------------------------------------------------------

# Backup

The most important Pteroless data is:

``` text
database/database.sqlite
storage/app/servers/
.env
```

The SQLite database contains the panel's application state.

The server storage contains the files of locally managed applications.

`.env` contains application configuration and the generated application
key.

Keep backups outside the Pteroless directory.

------------------------------------------------------------------------

# Troubleshooting

## `vendor/autoload.php is missing`

Run:

``` bash
./install
```

or:

``` bash
composer install
```

------------------------------------------------------------------------

## `.env is missing`

Run the installer:

``` bash
./install
```

The installer creates `.env` from `.env.example`.

------------------------------------------------------------------------

## PHP version error

Check:

``` bash
php -v
```

The installer currently requires:

``` text
PHP >= 8.2
PHP < 8.5
```

------------------------------------------------------------------------

## Node.js version

Check:

``` bash
node --version
```

The project package configuration requires Node.js 22 or newer.

The current installer prefers Node.js 26.

------------------------------------------------------------------------

## Python runtime fails

Check:

``` bash
python3 --version
python3 -m venv --help
```

A Python server using `requirements.txt` needs the Python venv package
available.

------------------------------------------------------------------------

## Java runtime fails

Check:

``` bash
java -version
```

The Java preset expects:

``` text
server.jar
```

unless a custom startup command is used.

------------------------------------------------------------------------

## Go runtime fails

Check:

``` bash
go version
```

A Go project should normally contain:

``` text
go.mod
```

or:

``` text
main.go
```

------------------------------------------------------------------------

## Node.js server fails

For the default Node.js preset, check:

``` text
package.json
```

and its `start` script.

Alternatively make sure:

``` text
index.js
```

exists.

------------------------------------------------------------------------

## Next.js server fails

Check:

``` text
package.json
```

and verify that:

``` text
npm run build
npm run start
```

work manually inside the application directory.

------------------------------------------------------------------------

## Python server fails

Check:

``` text
main.py
requirements.txt
```

If dependencies are required, confirm that:

``` bash
pip install -r requirements.txt
```

works.

------------------------------------------------------------------------

## Server is shown as offline

Check the server log:

``` text
.local/logs/output.log
```

Also check whether the PID file points to a running process.

------------------------------------------------------------------------

## Port conflict

The local allocator starts at:

``` text
25565
```

and searches for another unused port.

The process receives:

``` text
PORT
SERVER_PORT
```

from its allocation.

------------------------------------------------------------------------

# Limitations

Pteroless intentionally trades isolation and distributed-node features
for simplicity.

Current limitations include:

-   local host execution;
-   no required Wings daemon for the local runner;
-   no required Docker runtime for local servers;
-   no automatic container isolation;
-   default SQLite database;
-   Debian/Ubuntu-oriented installer;
-   CPU and memory hard limits, plus disk-limit monitoring, require the
-   CPU and memory hard limits, plus soft disk-limit monitoring, require the
    privileged local resource agent and compatible host configuration;
-   disk limits are best-effort soft limits checked approximately every five
  seconds by the privileged local resource agent;
-   network counters require nftables cgroup matching support;
-   inherited Wings/Pterodactyl compatibility code remains in the source
    tree;
-   inherited Egg/Nest concepts remain in the database schema;
-   the included `start` command is based on Laravel's built-in server.

These are architectural characteristics, not necessarily bugs.

------------------------------------------------------------------------

# Current Runtime Matrix

  -------------------------------------------------------------------------------------------------
  Runtime                 Required files          Default command
  ----------------------- ----------------------- -------------------------------------------------
  Node.js                 `package.json` or       `npm install && npm start` / `node index.js`
                          `index.js`              

  Next.js                 `package.json`          `npm install && npm run build && npm run start`

  Python                  `requirements.txt`      venv + pip + `main.py`
                          optional, `main.py`     

  Java                    `server.jar`            `java -jar server.jar`

  PHP                     `composer.json`,        Composer + PHP/Laravel server
                          `artisan` or            
                          `index.php`             

  Go                      `go.mod` or `main.go`   `go mod download && go run .` / `go run main.go`

  Custom                  none                    user-defined
  -------------------------------------------------------------------------------------------------

------------------------------------------------------------------------

# Example Node.js Application

``` text
node-app/
├── package.json
└── index.js
```

`package.json`:

``` json
{
  "scripts": {
    "start": "node index.js"
  }
}
```

`index.js`:

``` js
const http = require('http');

const port = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.end('Hello from Pteroless');
}).listen(port);
```

The Node.js preset can then start the project using:

``` bash
npm install
npm start
```

------------------------------------------------------------------------

# Example Python Application

``` text
python-app/
├── main.py
└── requirements.txt
```

The default Python preset prepares:

``` text
.venv/
```

and then executes:

``` bash
.venv/bin/python main.py
```

------------------------------------------------------------------------

# Example Java Application

``` text
java-app/
└── server.jar
```

Startup:

``` bash
java -jar server.jar
```

------------------------------------------------------------------------

# Example Go Application

``` text
go-app/
├── go.mod
└── main.go
```

Startup:

``` bash
go mod download
go run .
```

------------------------------------------------------------------------

# Example PHP Application

Laravel:

``` text
php-app/
├── artisan
├── composer.json
└── ...
```

The PHP preset can run:

``` bash
composer install
php artisan serve --host=0.0.0.0 --port="$PORT"
```

Simple PHP:

``` text
php-app/
├── index.php
└── public/
```

The preset can use PHP's built-in server with the appropriate document
root.

------------------------------------------------------------------------

# Repository Cleanup

Because Pteroless is now centered on the local runner, upstream
deployment files that are not referenced by the current installer can be
removed if they are not used by your own workflow.

Candidates currently identified in the uploaded project are:

``` text
Dockerfile
docker-compose.example.yml
flake.lock
flake.nix
shell.nix
```

The most obvious one is:

``` text
docker-compose.example.yml
```

because its configuration describes:

``` text
MariaDB
Redis
Pterodactyl Docker image
```

while Pteroless's installer describes:

``` text
SQLite
file cache
file sessions
sync queue
local process runner
```

Do not remove `composer.lock` or `yarn.lock` merely because they contain
the word "lock". They lock dependency versions and are useful for
reproducible installs.

------------------------------------------------------------------------

# Project Status

Pteroless is an active rework of the Pterodactyl Panel codebase.

The current implementation already contains:

-   a built-in Local node;
-   local server creation;
-   local runtime presets;
-   Node.js support;
-   Next.js support;
-   Python support;
-   Java/JAR support;
-   PHP support;
-   Go support;
-   custom startup commands;
-   local process management;
-   PID tracking;
-   process start/stop/restart;
-   local console command input;
-   local logs;
-   local resource statistics;
-   per-server filesystem storage;
-   automatic port allocation;
-   SQLite installation;
-   automated administrator setup;
-   a simplified installer.

At the same time, the source still contains inherited Pterodactyl/Wings
compatibility components.

The project should therefore be described as:

> **Pterodactyl Panel reworked with a built-in local process runner, not
> as a complete deletion of every upstream Wings-related class.**

------------------------------------------------------------------------

# Credits

Pteroless is derived from the Pterodactyl Panel project.

Pterodactyl is an open-source game server management panel built with
PHP, React and related technologies.

Original project:

https://github.com/pterodactyl/panel

Please preserve the applicable copyright notices, license information
and attribution from the upstream project.

------------------------------------------------------------------------

# License

Review:

``` text
LICENSE.md
```

before redistributing Pteroless.

Because Pteroless is derived from the Pterodactyl Panel codebase, the
upstream license requirements remain relevant to redistribution and
modification.

Do not remove required upstream copyright or license notices.

------------------------------------------------------------------------

# Summary

Pteroless takes the familiar Pterodactyl Panel foundation and changes
the execution model for local hosting.

Instead of:

``` text
Panel
  |
Wings
  |
Docker
  |
Container
```

Pteroless uses:

``` text
Panel
  |
LocalServerService
  |
LocalProcessManager
  |
Linux process
```

The current built-in runtime presets are:

``` text
Node.js
Next.js
Python
Java/JAR
PHP
Go
Custom
```

Application files live under:

``` text
storage/app/servers/<server-uuid>/
```

The default panel database is:

``` text
database/database.sqlite
```

The included installer prepares:

``` text
PHP 8.2–8.4
Composer
Node.js 26
Python 3 + venv
Java
Go
```

and the panel can be started with:

``` bash
./start
```

The result is a simpler single-machine hosting panel designed around
direct local process execution.

------------------------------------------------------------------------

```{=html}
<p align="center">
```
`<strong>`{=html}Pteroless`</strong>`{=html}`<br>`{=html}
Pterodactyl-inspired panel with built-in local execution.
```{=html}
</p>
```
