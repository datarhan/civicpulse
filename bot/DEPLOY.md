# Deploying the bot to Fly.io

The bot runs as a single Fly machine (`shared-cpu-1x`, 256MB) in Madrid
with a 1GB volume for its SQLite database. Expected cost: **~€2/month**
under 2026 Fly pricing, fully within the $5/mo included-usage bucket.

All commands below assume you're already in the repo root.

## Prerequisites

- Fly CLI installed: `curl -fsSL https://fly.io/install.sh | sh`  
  (already done in this workspace)
- Paid Fly account (credit card needed even for included usage)
- `BOT_TOKEN` from @BotFather

## One-off setup (first deploy)

### 1. Authenticate yourself

```bash
flyctl auth login
```

Opens a browser. This is the one step Claude cannot do for you.

### 2. Register the app

```bash
flyctl launch --config bot/fly.toml --name munigraph-ribarroja \
              --copy-config --no-deploy
```

This reads our existing `bot/fly.toml` (with `app = "munigraph-ribarroja"`,
`primary_region = "mad"`, `build.dockerfile = "bot/Dockerfile"`) and
creates the app on Fly's control plane without building anything yet.

If the name is taken you'll see `validation failed: name munigraph-ribarroja
is reserved or already taken`. In that case rename it in `bot/fly.toml`
to `munigraph-riba-<your-initials>` or similar, commit, retry.

### 3. Persistent volume

```bash
flyctl volumes create botdata --size 1 --region mad \
                              --app munigraph-ribarroja
```

1GB is enough for tens of thousands of quejas. Enlarge later via
`flyctl volumes extend`.

### 4. Secrets

Generate the export token once and stash it somewhere safe (you'll need
the same value for the GitHub Action that pulls nightly snapshots):

```bash
EXPORT_TOKEN=$(openssl rand -hex 16)
echo "EXPORT_TOKEN=$EXPORT_TOKEN"   # write this down

> **El token no se escribe en este fichero.** Aquí vivió el token real del bot
> desde el 20-abr-2026 hasta el 3-sep-2026, comiteado y empujado: lo encontró
> `npm run check:secrets`. Cógelo de @BotFather o de `.env` (que está
> gitignorado) y pégalo sólo en la terminal. Un token de bot da control total
> del bot —leer cada mensaje que llega y escribir en su nombre—, y este bot
> recibe quejas de vecinos identificables.

flyctl secrets set --app munigraph-ribarroja \
  BOT_TOKEN=<BOT_TOKEN de @BotFather — NUNCA lo pegues aquí> \
  EXPORT_TOKEN=$EXPORT_TOKEN \
  PUBLIC_BASE_URL=https://civicpulse.es \
  WEBHOOK_URL=https://munigraph-ribarroja.fly.dev \
  MODERATOR_NAME="Tu nombre real"
```

Optional secrets you can set now or later:

- `CHANNEL_ID=-100…` — enables `[NUEVA]/[APOYADA]/[REGISTRADA]` broadcasts.
  The bot must be added as an admin of that channel.
- `ADMIN_USER_IDS=123,456` — Telegram user IDs allowed to run `/batch`,
  `/batch_register`, `/escalar`. Find yours via [@userinfobot](https://t.me/userinfobot).
- `GEMINI_API_KEY` — la clave del análisis que localiza caras y matrículas en las
  fotos (`src/services/photo-anonymize.ts`). Sin ella, la pasada horaria retiene cada
  foto y no se publica ninguna; el arranque lo dice en el log (`[fotos] cron armado`).
- `GITHUB_DISPATCH_TOKEN` — un token de acceso personal **de grano fino**, limitado a
  este repositorio (`datarhan/civicpulse`) y con un único permiso, «Actions: Read and
  write». Con él, al confirmar `/olvidar` el bot lanza `pull-quejas.yml` y la web
  retira la queja en minutos (`src/services/republicar.ts`); sin él, en la
  actualización diaria. Estos tokens caducan: cuando caduque, el log dirá
  `GitHub contestó 401` y la retirada volverá a esperar a la actualización diaria.

Estos dos no se pasan como argumentos, que acabarían en el historial de la shell: se
escriben en un fichero, se importan y se borra el fichero.

```bash
# secret.env: una línea por secreto, GEMINI_API_KEY=… y GITHUB_DISPATCH_TOKEN=…
flyctl secrets import --app munigraph-ribarroja < secret.env && rm secret.env
```

### 5. Deploy

From the **repo root** (important — build context must include `src/`
and `public/data/`), and from a **clean tree** — `GIT_SHA` labels the
deploy with the commit, so uncommitted changes would ship under a
commit that doesn't contain them:

```bash
flyctl deploy --config bot/fly.toml \
              --dockerfile bot/Dockerfile \
              --remote-only \
              --env GIT_SHA=$(git rev-parse HEAD) .
```

Normally you don't: a push to `main` deploys through `bot-deploy.yml`,
after the bot's tests pass.

First build takes ~2-3 min (native better-sqlite3 compile on Linux).
Subsequent deploys are ~30s.

### 6. Verify

```bash
curl https://munigraph-ribarroja.fly.dev/health       # → JSON, "webhookAuthenticated": true,
                                                       #   "version": el commit desplegado
curl "https://munigraph-ribarroja.fly.dev/export/quejas.json" \
     -H "Authorization: Bearer $EXPORT_TOKEN"          # → JSON payload
curl -X POST https://munigraph-ribarroja.fly.dev/ -d '{}' -o /dev/null -w '%{http_code}\n'
                                                       # → 401: sin el secreto no entra nada
```

On Telegram, DM [@munigraph_bot](https://t.me/munigraph_bot) with `/start`
— should respond within 1–2 s.

El webhook sólo atiende a Telegram. Al arrancar, el bot lo registra con un
`secret_token` DERIVADO de `BOT_TOKEN` (`src/services/webhook-telegram.ts`), y Telegram
lo devuelve en cada update en `X-Telegram-Bot-Api-Secret-Token`: lo que no lo trae
recibe 401 antes de leerse, y lo que no es un POST a la ruta del webhook, 404. No hay
secreto que poner. Hasta el 17-09-2026 no lo tenía, y cualquiera podía mandar un update
haciéndose pasar por otra cuenta, administrador incluido. `/health` lo dice con
`webhookAuthenticated`: `false` mientras el alta no ha terminado, `true` después. Si
`/start` deja de contestar justo tras un despliegue, lo primero es mirar ese campo y
`flyctl logs`: un secreto registrado distinto del exigido deja el bot mudo, con cada
update rechazado con 401.

Desde el 27-09-2026 esto lo comprueba solo `bot-deploy.yml`: despliega únicamente si
`bot.yml` (tipos y pruebas) sale en verde, pasa el commit a la máquina con
`--env GIT_SHA=…`, y después pregunta a `/health` hasta que diga ese commit en
`version` con `webhookAuthenticated: true`, o sale en rojo a los tres minutos. Si
despliegas a mano, hazlo desde un árbol limpio y pasa tú también
`--env GIT_SHA=$(git rev-parse HEAD)` (arriba): sin eso, `version` no dice el commit
que corre.

### 7. Wire the nightly cron

Back on your laptop (in the repo root):

```bash
gh variable set BOT_EXPORT_URL \
  --body https://munigraph-ribarroja.fly.dev/export/quejas.json
gh secret set BOT_EXPORT_TOKEN --body "$EXPORT_TOKEN"
```

The GH Action in `.github/workflows/pull-quejas.yml` then runs daily at
04:00 UTC, curls the endpoint, and commits the fresh `quejas.json` to
the repo (which Vercel redeploys automatically). En el mismo paso trae las fotos
anonimizadas que el export enlaza, de `/export/quejas-photos/<id>.jpg` y con el
mismo token, y poda las de las quejas que ya no están. Con `GITHUB_DISPATCH_TOKEN`
en Fly, el bot lanza además esta misma ejecución cada vez que alguien confirma
`/olvidar`.

## Day-two operations

### Redeploy after code changes

Merging to `main` redeploys (`bot-deploy.yml`). By hand, from a clean tree:

```bash
flyctl deploy --config bot/fly.toml \
              --dockerfile bot/Dockerfile \
              --remote-only \
              --env GIT_SHA=$(git rev-parse HEAD) .
```

### Logs

```bash
flyctl logs --app munigraph-ribarroja
```

`telegram.repetido` es un update que Telegram volvió a mandar porque el primero pasó
de los diez segundos del webhook (que antes dejó un `[http] error: … timed out`), y
que no se atendió otra vez; `telegram.update`, uno que falló, con su pila
(`src/services/una-vez-y-en-orden.ts`). Muchos seguidos dicen que la API de Telegram,
o el candado de las tarjetas de una queja, va lento.

### SSH into the machine

```bash
flyctl ssh console --app munigraph-ribarroja
# Inside: /data/bot.db is the SQLite file. Use sqlite3 if needed.
```

### Ensayar una migración antes de desplegarla

La base del volumen es la única copia de los datos, y su esquema cambia por
migraciones (`src/db/migraciones.ts`; `schema.sql` es la base v0, congelada).
El bot aplica las pendientes al arrancar (`openDb`), así que desplegar una
migración es ejecutarla sobre la base de verdad. Antes de fusionar un cambio que
trae una migración que producción aún no tiene, se ensaya contra esa base.

El ensayo corre el código de la imagen desplegada, así que una migración nueva
llega primero **en ensayo** (`MIGRACIONES_EN_ENSAYO`): se despliega sin que el
bot la aplique al arrancar, y la orden de abajo ya la ensaya —lo dice: «en
ensayo, aún sin aplicar en el bot»—. Con el ensayo correcto y la instantánea
hecha, el cambio que la usa la pasa a `MIGRACIONES` y se fusiona. Así llegó la 1
(#132 inerte, #135 activa), y así llega la 2 (#138 en ensayo, #137 la activa). Y
una migración ensayada no se cambia: `tests/migraciones.test.ts` guarda la huella
del SQL de cada una, y si su texto cambia después del ensayo, vuelve a entrar en
ensayo y se ensaya otra vez. La orden:

```bash
flyctl ssh console --app munigraph-ribarroja -C "sh -c 'cd /app/bot && node_modules/.bin/tsx src/db/migrate.ts --dry-run --db /data/bot.db'"
```

`-C` no arranca en el `WORKDIR` de la imagen, así que las rutas relativas no
resuelven sin el `cd`; y `--db` va explícito para no depender de que la sesión
herede el `DB_PATH` de `fly.toml`.

Copia la base a un fichero temporal en el mismo volumen, lo migra, cuenta las
filas de cada tabla antes y después, y borra la copia: los datos no salen de la
máquina y la base no se toca. Lo esperado es `ENSAYO correcto` con las mismas
cuentas en `quejas`, `apoyos` y `events`; con cualquier otra cosa, no se
fusiona. Y antes de fusionar, una instantánea del volumen:

```bash
flyctl volumes list --app munigraph-ribarroja
flyctl volumes snapshots create <volume-id>
```

Al arrancar, antes de migrar, el bot saca además una copia con `VACUUM INTO` en
`/data/backups/`. Lleva datos personales, así que caduca: la borra la pasada
diaria de `src/services/retencion.ts` a los `CONSERVACION_COPIAS_DIAS` de
`src/scraper/plazos-retencion.ts`. La instantánea del volumen es la copia que no
depende del propio bot.

### Volver a una versión anterior: nunca por detrás de la migración 2

Un código viejo arranca sobre la base de hoy: el migrador no toca una base más
nueva que su código —avisa y sigue—, y el código viejo trabaja sin saber de las
columnas que no conoce. Tras la migración 2 (`revision-antes-de-publicar`) eso
es publicar: un código de antes de ella no sabe de `moderacion` y exportaría,
en la siguiente pasada de `pull-quejas.yml`, todo lo pendiente, lo descartado y
lo retirado. Lo mismo vale para revertir el PR en `main`, porque
`bot-deploy.yml` despliega lo que llega a `main`, y para desplegar una imagen
anterior a mano (`flyctl deploy --image …`).

**No se vuelve a un código anterior a la migración 2 sobre la base de hoy.** Lo
que falle después se arregla hacia delante.

Restaurar la copia `VACUUM INTO` de `/data/backups/` tomada al migrar tampoco es
una vuelta atrás limpia. Es de antes de la revisión, así que no publica nada sin
revisar, pero deshace todo lo que pasó después: además de perder las quejas que
entraron, devuelve a la vida lo que se retiró desde entonces —con `/olvidar`, con
`/borrar_mis_datos` o con [Retirar]— con su autor, su ubicación y su foto, y a
quienes borraron sus datos. Eso es deshacer un derecho que ya se ejerció. Antes
de arrancar con esa copia habría que reaplicarle cada retirada y cada borrado
posteriores, y ese procedimiento no está escrito ni ensayado: no es un plan.

### Recalcular los barrios de las quejas guardadas

Desde el 2026-09-27 una ubicación se sitúa contra el término y con un radio por
barrio (`src/scraper/situar-barrio.ts`); las quejas anteriores conservan el
barrio de la regla vieja hasta que alguien decida cambiarlo. En seco primero:

```bash
flyctl ssh console --app munigraph-ribarroja -C "sh -c 'cd /app/bot && node_modules/.bin/tsx scripts/rebarrio.ts --db /data/bot.db'"
```

Lista cada queja que cambiaría, con el antes, el después y por qué. Si es lo
esperado, la misma orden con `--aplicar` los cambia; cada cambio deja un evento
`barrio_corregido`, que `/estado` rotula «📍 Barrio corregido», y la web lo
recoge en la siguiente exportación.

### Rotate the BOT_TOKEN

```bash
# In @BotFather: /revoke → pick @munigraph_bot → copy new token
flyctl secrets set BOT_TOKEN=<new-token> --app munigraph-ribarroja
```

Fly automatically restarts the machine after a secret change. El `secret_token` del
webhook sale de `BOT_TOKEN`, así que rota con él: al arrancar, el bot registra el
webhook con el secreto nuevo y exige ese mismo. No hay nada más que cambiar.

### Scale up if the queja volume spikes

```bash
flyctl scale memory 512 --app munigraph-ribarroja       # 256 → 512 MB
flyctl scale count 1    --app munigraph-ribarroja       # stay at 1 (SQLite)
```

Do **not** scale count beyond 1 — SQLite doesn't tolerate multiple
writers. If we outgrow a single machine, migrate to Postgres first, and move
what lives in the process's memory with it: the conversations, the per-chat
order and seen `update_id`s (`src/services/una-vez-y-en-orden.ts`) and the
card lock (`src/services/avisos-admin.ts`).

### Tear down

```bash
flyctl apps destroy munigraph-ribarroja
```

This removes the machine AND the volume. SQLite data is lost — export
first via `/export/quejas.json` if you want a backup.
