# Production runtime and connection resets

The AWS SDK NodeVersionSupportWarning is a compatibility warning, not evidence
that it caused an ECONNRESET. This repository and the storefront now specify
Node 22 in `.nvmrc`. Changing that file does not change running PM2 processes.

## Upgrade an Ubuntu deployment using nvm

Perform this during a deployment window: restarting a process interrupts its
in-flight requests. Start from the normal `ubuntu` account that owns PM2.

```sh
nvm install 22
nvm use 22
npm install --global pm2
```

In each backend/storefront checkout, run `npm ci` with Node 22. In the storefront
checkout also run `npm run build` before restarting it. Keep existing environment
configuration and PM2 working directories intact.

```sh
pm2 restart api --interpreter "$(command -v node)" --update-env
pm2 restart elexify.online --interpreter "$(command -v node)" --update-env
pm2 save
pm2 describe api
pm2 describe elexify.online
```

Check the Node version shown for both processes. If PM2 is started by systemd,
regenerate its startup service after changing the nvm Node path: run `pm2 startup`
and follow the command it prints for this account, then run `pm2 save` again.

## Optional internal API connection

When both services run on the same host, the storefront's server-side requests
can use `INTERNAL_API_URL`, with the API's actual listening port and base path.
For example, if the API listens on port 3001:

```dotenv
INTERNAL_API_URL=http://127.0.0.1:3001/api/v1/
```

Use the actual API port, not the storefront port. Do not change the browser's
`NEXT_PUBLIC_API_URL` to localhost. Configure the server environment before
building/restarting the storefront. This avoids the public proxy path for SSR
requests but does not fix an unhealthy API process.

Server GETs now retry transient network errors and HTTP 502/503/504 once. Writes
are never automatically replayed. Public footer settings cache successful reads
for 60 seconds and can serve a last successful value for up to 15 minutes during
an outage. This cache is per process and does not survive a restart.

If resets persist, correlate timestamps in API logs, Nginx error logs, PM2 restart
counts, and system logs for OOM kills. A settings fallback alone cannot identify
which component closed the connection.

## Shiprocket correlation

The webhook now checks both `order_id` and `channel_order_id`. Packages can match
their Shiprocket order ID, reference ID, AWB, or shipment ID; historical orders
can match their local order ID, Shiprocket order ID, or AWB.

An event still reported as unmatched must be compared with the stored order and
package identifiers. Do not infer ownership by stripping prefixes or guessing
from an order number. Existing webhook logs remain available for investigation;
the code change does not replay past events automatically.
