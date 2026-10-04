# Pteroless

> **Project status: experimental and unfinished.** Pteroless is a small
> Pterodactyl-derived project, not a mature replacement for Pterodactyl.
> It currently has substantially fewer operational and security guarantees
> than the original project. Do not use it for untrusted workloads or a
> public multi-user production service.

Pteroless keeps parts of the Pterodactyl Panel interface and Laravel backend,
but adds a local process runner that launches applications directly on the
panel's Linux host. It is intended for experimentation and personal use on a
single machine. It is not affiliated with the Pterodactyl project.

## Current Shape

The local execution path is approximately:

```text
Browser -> Laravel panel -> LocalProcessManager -> Linux process
                                      |
                                      +-> optional privileged resource agent
```

The panel data model, client UI, admin UI, and many APIs are inherited from or
adapted from Pterodactyl. Their presence does not mean every Wings feature has
been implemented for the local runner.

Currently implemented local-runner features include:

- Creating local server records and per-server directories.
- Starting, stopping, restarting, and tracking processes.
- Console input through a local FIFO and output logs stored per server.
- A local file manager for listing, editing, uploading, moving, deleting,
  compressing, and extracting files.
- Runtime presets for Node.js, Next.js, Python, Java/JAR, PHP, Go, and custom
  shell commands.
- Optional resource-agent integration using Linux cgroup v2.
- A client/admin panel built on the existing Pterodactyl-derived application.

The runtime commands use software installed on the host. A preset may install
dependencies at every start. This is not container image management and does
not create an isolated runtime environment.

The local runner does not require Wings, Docker, or systemd to start server
applications. It launches host processes directly. The optional privileged
resource agent is separate from the runner and is started at boot with cron
when available.

### Runtime Presets

The current startup templates are defined in
`app/Services/Local/LocalServerService.php`:

| Preset | Default startup behavior |
| --- | --- |
| Node.js | If `package.json` exists, run `npm install && npm start`; otherwise run `node index.js`. |
| Next.js | Require `package.json`, then run `npm install`, `npm run build`, and `npm run start`. |
| Python | If `requirements.txt` exists, create `.venv`, install requirements, and run `main.py`; otherwise run `python3 main.py`. |
| Java/JAR | Run `java -jar server.jar`. |
| PHP | Run Composer when `composer.json` exists, then serve an `artisan` or `index.php` app with PHP's built-in server. |
| Go | Download modules and run the module, or run `main.go` when no module file exists. |
| Custom | Run the administrator-provided startup command. |

These are defaults rather than curated or pinned runtime images. Versions and
installed packages depend on the host. Dependency installation can require
network access, consume disk space, and make startup slow. Review and edit the
startup command for each application instead of assuming a preset fits every
project.

The local runner sets the server directory as the working directory, provides
`PORT` and `SERVER_PORT` from its allocation, and gives each server a `HOME`
directory under local metadata. The command still executes through the host
shell and account.

### Process Lifecycle

`LocalProcessManager` launches startup commands as detached Linux process
groups. It records a PID and writes standard output and errors to:

```text
storage/app/servers/<server-uuid>/.local/logs/output.log
```

Console input is sent through a FIFO under `.local/`; it is not a full
terminal emulator. The panel tracks process state using PID files and Linux
`/proc` data. When the privileged agent is available, the process is paused
briefly while it is attached to a cgroup and then resumed. A failed attach
causes the start request to fail.

Stopping a process first sends a termination signal and may force-kill any
remaining processes. This lifecycle manager is local to one Linux host; it
does not provide Wings' container lifecycle or isolation.

The client console uses an HTTP polling compatibility layer, not a Wings
WebSocket. The `/api/client/servers/{server}/snapshot` endpoint returns
resource statistics and console logs together. The browser polls about every
1.5 seconds while the server page is visible, avoids overlapping requests, and
pauses polling when the tab is hidden. This reduces duplicate requests but can
still show some delay compared with a real-time socket.

### File Manager

Local file endpoints support listing, reading and writing text, uploading and
downloading, renaming, copying, creating and deleting, compression,
extraction, permission changes, and URL-based pulls. The controller resolves
paths under each server directory and rejects symbolic links for file-manager
operations. This path validation is not a host-level security boundary.

File-manager writes check the configured disk limit before some operations.
That pre-check cannot control writes made directly by a running application
and cannot turn a soft disk limit into a hard quota. The file manager also
does not provide SFTP.

## Important Gaps

Pteroless is not equivalent to a normal Pterodactyl deployment:

| Area | Pteroless status |
| --- | --- |
| Isolation | Applications run as host processes under the panel's Unix account. There are no per-server UIDs or Docker container boundaries. A compromised server process may access other data available to that account. |
| Nodes | The supported path is one local host. Multi-node scheduling and remote Wings execution are not provided by the local runner. |
| Wings compatibility | Many inherited controllers and models still call Wings. A visible page or API route does not guarantee that it works for local servers. |
| Backups | Backup services and controllers still use Wings repositories. Local-runner backup support is incomplete and must not be assumed to work. |
| Scheduled tasks | Scheduler code exists, but the installer does not configure Laravel's scheduler. Task execution also uses Wings repositories, so local scheduled power, command, and backup tasks are incomplete. |
| SFTP | The local runner does not provide a per-server SFTP daemon. Pterodactyl-compatible SFTP metadata is not a working local SFTP service. |
| Disk limits | Disk limits are best-effort soft limits. The agent measures directory usage periodically (about every 5 seconds) and stops an over-limit process; usage can exceed the configured value between checks. There is no hard disk quota. |
| Resource limits | CPU and memory enforcement require a privileged agent, cgroup v2, and host controller delegation. Network counters additionally depend on nftables support. Without the agent, enforcement is reduced or unavailable. |
| Networking | Ports and firewall exposure are host-managed. The built-in local allocation defaults to loopback and does not provide container network isolation. |
| Database | The panel uses SQLite by default. Per-server databases require an independently configured MySQL-compatible database host. |
| Production operation | `start.sh` runs Laravel's built-in `artisan serve`. It is a convenience launcher, not a production web-server or process-supervision setup. |
| Testing | This checkout has Playwright smoke and opt-in local-runner E2E tests, but no comprehensive backend suite or CI workflow. Coverage is not sufficient to claim production readiness. |

Because server applications share the panel's Unix identity, only run code you
trust. Do not treat panel permissions, Egg/Nest records, or resource limits as
a security boundary.

## Requirements

The provided installer targets Debian/Ubuntu systems with APT and root access.
It installs system packages and configures the optional local resource agent.
The project requires PHP 8.2-8.4 and Composer; the frontend requires Node.js
22 or newer and Yarn. The installer also provisions host runtimes used by the
presets, including Node.js, Python 3 with `venv`, Java, and Go. Other Linux
distributions may work with manual dependency setup, but are not covered by the
installer.

The resource agent needs Linux cgroup v2 with CPU and memory controllers
delegated to its cgroup tree. The installer cannot enable host-level
delegation in every environment. If the host does not provide it, the agent
may fail to start or resource controls may be unavailable. Disk limits remain
soft even when the agent is available.

The Composer manifest also requires the PHP JSON, mbstring, PDO, SQLite,
POSIX, and ZIP extensions. The installer installs additional extensions for
the inherited panel and its database integrations. Check `composer.json` and
`install.sh` for the exact requirements of the current revision.

Optional host capabilities include cgroup v2 CPU and memory controller
delegation for agent-backed limits, nftables cgroup matching for network
counters, and an independently configured MySQL-compatible host for
per-server databases. Installation does not configure a firewall, provide a
public IP, or expose a service bound to loopback.

## Install And Run

Run the installer from the project directory:

```bash
sudo bash ./install.sh
```

The interactive installer asks for administrator details. It modifies the
host by installing packages, creating accounts/groups and configuring the
resource agent. Review the script before running it on a machine with
important workloads.

Run `sudo bash ./install.sh --help` to review supported modes and prompts. The
interactive installer can optionally configure Gmail SMTP by asking for a
Gmail address and Google App Password; the Gmail host, port, TLS, and sender
fields are filled automatically. Email is off by default. Choosing off leaves
the mailer in `log` mode, which does not deliver email.

Automatic setup accepts either `--automaticsetup` or `--automatic` and never
prompts for mail settings. It keeps email off unless both
`PTEROLESS_EMAIL_ADDRESS` and `PTEROLESS_EMAIL_APP_PASSWORD` are present in its
environment. To avoid putting the App Password in shell history, read it
without echo and pass the environment variables through `sudo`:

```bash
read -r -s -p 'Google App Password: ' PTEROLESS_EMAIL_APP_PASSWORD
printf '\n'
export PTEROLESS_EMAIL_APP_PASSWORD
export PTEROLESS_EMAIL_ADDRESS='you@gmail.com'
sudo --preserve-env=PTEROLESS_EMAIL_ADDRESS,PTEROLESS_EMAIL_APP_PASSWORD ./install.sh --automatic
unset PTEROLESS_EMAIL_APP_PASSWORD
```

The installer targets Debian/Ubuntu with APT, runs database migrations, and
builds frontend assets. Re-running it can update host packages and replace the
installed agent, so back up important data and review its output first.

**Do not use `--automaticsetup` or `--automatic` on an exposed installation
without changing its defaults.** Both modes currently use the predictable
administrator credentials `admin` / `admin123`.

Start the panel as the regular installer user, without `sudo`:

```bash
bash ./start.sh
```

The resource agent is a separate root-owned service installed by the
installer. Check it with:

```bash
sudo /usr/local/sbin/pteroless-resource-agent status
```

The panel launcher uses Laravel's built-in server on port `8080` by default.
In Codespaces it binds to `localhost`; otherwise its default bind address is
`0.0.0.0`. Set `HOST` or `PORT` to override these values. The launcher is not
a service manager, so closing its terminal stops the panel process.

Useful agent diagnostics:

```bash
sudo /usr/local/sbin/pteroless-resource-agent status
cat /sys/fs/cgroup/cgroup.controllers
cat /sys/fs/cgroup/cgroup.subtree_control
sudo tail -n 40 /var/log/pteroless/resource-agent.log
```

The panel user needs access to the `pteroless` group and agent socket.
Existing login sessions may need to be restarted after group membership
changes.

If the agent is unavailable, the panel may still start, but local disk soft
limits and agent-backed resource controls will not be enforced. Do not expose
the development launcher directly to the public internet. A production
deployment would need a supported web server, TLS, supervised services,
firewall configuration, backups, and a security review; this repository does
not provide a complete production deployment recipe.

## Data And Configuration

- Panel configuration: `.env` (contains secrets; never commit it).
- Default panel database: `database/database.sqlite`.
- Local server files: `storage/app/servers/<server-uuid>/`.
- Per-server process metadata and logs: `.local/` inside each server folder.
- Agent state: `/var/lib/pteroless-resource-agent/`.
- Agent socket and log: `/run/pteroless-resource-agent/agent.sock` and
  `/var/log/pteroless/resource-agent.log`.

Back up the database and server files using a method appropriate for your
host. Do not assume the inherited Pterodactyl backup UI creates working local
backups.

The SQLite database contains panel accounts and configuration; server
directories contain application data. Back them up separately. Stop affected
applications before copying their files for a consistent snapshot. Never add
`.env`, the SQLite database, logs, or user server files to a public source
commit.

## Email And CAPTCHA

Outgoing email is optional. The default `log` mailer records messages in the
Laravel log and does not send them. The installer wizard can configure Gmail
SMTP using a Gmail address and App Password; it stores the SMTP settings in
`.env`. For another SMTP provider, configure its mailer, host, port, encryption,
credentials, and sender through `.env` or Admin → Settings → Mail after the
mailer is set to SMTP. Never commit SMTP credentials or paste them into issue
reports.

Email is used for account invitation and initial password setup, subuser
membership notifications, server-install completion, and the admin test-mail
button. The forgot-password email flow is removed. Pteroless does not send
Pterodactyl version-update announcements by email.

Login CAPTCHA is optional and disabled by default in the installer. When
enabled, configure Google reCAPTCHA v2 Invisible site and secret keys. The key
must allow the exact hostname used in `APP_URL`; domain verification is enabled,
so a different forwarded or proxy hostname can cause login verification to
fail. The website key is public configuration, but the secret must stay private.

## Admin And Client Surfaces

The current admin sidebar exposes Overview, Settings, Application API,
Database Hosts, Servers, and Users. Application API keys have per-resource
permissions; account API keys are separate credentials for the Client API.
Additional inherited admin routes and pages for locations, nodes, allocations,
nests/eggs, and mounts remain in the codebase, but a visible page or route does
not guarantee local-runner support. The client interface includes account
settings and server pages for console, files, startup, allocations, subusers,
databases, activity, schedules, and backups.

Some pages are inherited and still call Wings repositories. A rendered page
or registered API route does not prove local-runner support. Backup and
scheduled task workflows are known gaps; see [Important Gaps](#important-gaps).

## Database Behavior

The panel database defaults to SQLite at `database/database.sqlite`. This is
separate from databases created for applications. Per-server database
creation uses configured database hosts and MySQL-compatible management
operations; it does not provide an embedded database server. This feature is
optional and needs a reachable MySQL-compatible host plus PHP's `pdo_mysql`
extension. It does not require Docker, Wings, or systemd.

Configure a reachable database host and credentials in the admin panel before
enabling that feature. Treat database-host credentials as secrets and never
commit them.

## Resource Agent Details

The optional privileged helper is installed from `resources/local/`. It
communicates with the panel over a permission-restricted Unix socket and does
not require Wings or Docker.

When available, it creates per-server cgroups for CPU and memory controls.
The host must already expose and delegate the required cgroup v2 controllers.
Network counters are optional and require compatible nftables cgroup
matching.

Disk usage is measured with directory scans. The agent checks active server
directories approximately every five seconds and stops a running process
when usage reaches its limit. This is best-effort: disk use can exceed the
limit between scans, and repeated scans can cost I/O when directories contain
many files. The agent does not set project quotas or provide hard disk
enforcement.

The installer adds an `@reboot` cron entry for the agent when cron is
available. This starts the helper, not the panel. The panel needs its own
supervised web-server deployment in production.

## Troubleshooting

### Disk limit exceeded

An over-limit server is blocked from starting until files are removed or its
limit is raised. The soft monitor can stop a running server, but displayed
usage may lag and can briefly exceed the configured value.

### Resource-agent socket missing

Check agent status and logs using the commands in [Install And Run](#install-and-run).
A running panel does not prove that the privileged agent is running. Without
the socket, agent-backed limits will not be enforced.

### HTTP 500 after installation

Check `storage/logs/laravel.log` and confirm that the account running PHP can
write to `storage/`, `bootstrap/cache/`, the SQLite database, and its parent
directory. Do not use world-writable permissions such as `chmod 777`; use
the installer-configured `pteroless` group and restart the panel process after
changing group membership.

### Server will not start

Check the startup command, required host runtime, assigned port, and server
output log. Also check whether disk usage is already over its limit. When the
agent is enabled, inspect cgroup delegation and the agent log.

### Port is not reachable

The built-in allocation defaults to `127.0.0.1`. Check the allocation bind
address, the application's own listen address, firewall, reverse proxy, and
hosting environment. Pteroless does not configure these network layers
automatically.

## Source Map

| Path | Responsibility |
| --- | --- |
| `app/Services/Local/LocalServerService.php` | Local node/server records, storage paths, and runtime presets. |
| `app/Services/Local/LocalProcessManager.php` | Process lifecycle, console FIFO, output logs, and local statistics. |
| `app/Services/Local/ResourceAgentClient.php` | Panel requests to the privileged Unix-socket helper. |
| `resources/local/` | Root-owned resource-agent implementation and launcher. |
| `app/Http/Controllers/Api/Client/Servers/LocalFileController.php` | Local server file operations. |
| `routes/` | Web, client API, application API, and remote API routes. |
| `install.sh` / `start.sh` | Debian/Ubuntu installation and local development startup. |
| `app/Services/Backups/` and `app/Jobs/Schedule/` | Inherited backup/task paths; parts still depend on Wings. |

## Updating

There is no mature, tested upgrade or rollback procedure yet. Before updating,
back up `.env`, `database/database.sqlite`, and `storage/app/servers/`. Review
installer changes before applying them to a working host. Test updates on a
disposable copy first; database migrations may not be reversible.

## Development And Checks

Install backend dependencies with Composer and frontend dependencies with
Yarn:

```bash
composer install
yarn install
yarn run build:production
```

The frontend test and typecheck commands are:

```bash
yarn test
yarn tsc
```

Playwright uses `http://localhost:8080` by default; override it with
`E2E_BASE_URL`. Set credentials for a local admin test account before running
the browser tests. The smoke test visits admin/client pages and checks for
browser and server errors. CAPTCHA should be disabled in the test environment
unless the browser can complete its challenge:

```bash
E2E_USERNAME=<local-admin-username> \
E2E_PASSWORD=<local-admin-password> \
yarn test:e2e tests/e2e/smoke.spec.ts
```

The opt-in local-runner test creates two temporary Node.js applications,
checks their HTTP responses, and removes their server records, files, processes,
and allocations when it completes. Run it only against a trusted local test
installation; it creates and deletes test servers and allocations:

```bash
E2E_LOCAL_RUNNER=1 yarn test:e2e tests/e2e/local-runner.spec.ts
```

The E2E TypeScript check is `yarn tsc:e2e`. There is no comprehensive backend
test suite or CI workflow. Passing these checks does not establish that the
application is safe or reliable for production.

## Project Direction

The main gaps to address before this could be considered a mature alternative
include per-server isolation, a complete local backup and scheduling path,
supported SFTP, reliable install/upgrade and service supervision, broader
automated tests, and documented production operations. Until those exist,
Pteroless should be treated as an experimental fork with limited local-host
functionality, not as a drop-in replacement for Pterodactyl.

## Credits And Licensing

Pteroless is derived from the Pterodactyl Panel codebase:

- Project: <https://github.com/pterodactyl/panel>
- Pterodactyl license: <https://github.com/pterodactyl/panel/blob/develop/LICENSE.md>

The Composer metadata declares MIT, but this checkout has no root `LICENSE`
file. Review the upstream license and preserve applicable notices before
redistributing modified code. This README is not legal advice.
