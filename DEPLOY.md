# Despliegue gratuito de SynapseAI Lab

Guía paso a paso para poner la aplicación en línea con **$0 de costo**, usando
únicamente planes gratuitos verificados.

---

## 0. Resumen del stack gratuito

| Pieza | Servicio gratuito | Límites verificados (oct. 2026) | Requiere tarjeta |
|-------|-------------------|--------------------------------|-----------------|
| Base de datos | **Aiven MySQL Free Tier** | 1 vCPU · 1 GB RAM · 1 GB disco · nodo único · backups incluidos | **No** |
| Base de datos (alt.) | **TiDB Cloud Starter** | 5 GiB row + 5 GiB columnar + 50 M RUs/mes por instancia (5 instancias por org) | **No** |
| Aplicación | **Render Free** | 512 MB RAM · 0.1 CPU · 750 h/mes · se apaga a los 15 min sin tráfico | No |
| Aplicación (alt.) | **Koyeb Free** | 512 MB RAM · 0.1 vCPU · 2 GB SSD · 1 por organización · escala a 0 tras 1 h | Ver nota ⚠ |
| Correo SMTP | **Brevo Free** | 300 correos/día · SMTP relay incluido | **No** |
| Correo (alt.) | **Gmail SMTP** | ~500/día · requiere verificación en 2 pasos y contraseña de aplicación | No |
| Identidad | **Google Cloud OAuth 2.0** | Cliente web gratuito e ilimitado | No (salvo que pida verificación) |

> ⚠️ **Koyeb**: desde febrero de 2026 algunas cuentas nuevas exigen una tarjeta con
> pre-autorización de $29 aunque el servicio sea gratuito. **Render** no pide tarjeta.

> 💡 **Si no quieres tocar ninguna tarjeta ni registrar nada**: ejecútalo todo en tu
> propio equipo (ver §7). Es 100 % gratuito y ya está verificado.

---

## 1. Requisitos previos

- Node.js 18 o superior (recomendado 24) → `node -v`
- Una cuenta de GitHub (para que Render/Koyeb construyan el proyecto)
- El proyecto en tu máquina: `npm install`

---

## 2. Base de datos — Aiven MySQL Free Tier

1. Entra en <https://console.aiven.io> y crea una cuenta (**sin tarjeta**).
2. **Create service** → tipo **MySQL** → plan **Free**.
3. Cuando el servicio esté en marcha, ve a **Service → Connection** y anota:

   | Dato en Aiven        | Variable en `.env` |
   |----------------------|--------------------|
   | Service URI (host)   | `DB_HOST`          |
   | Port                 | `DB_PORT` (3306)   |
   | User                 | `DB_USER`          |
   | Password             | `DB_PASSWORD`      |
   | Database name        | `DB_NAME`          |

4. **Service → Certificates → Download CA certificate** → guárdalo como `certs/ca.crt`.
5. En `.env`:
   ```ini
   DB_HOST=tu-servicio-xxxx.aivencloud.com
   DB_PORT=3306
   DB_USER=avnuser
   DB_PASSWORD=la-que-te-dijo-aiven
   DB_NAME=synapseai_lab
   DB_SSL=true
   DB_SSL_REJECT_UNAUTHORIZED=false
   DB_SSL_CA=ruta/absoluta/a/ca.crt
   DB_POOL_SIZE=5
   ```

> **Aiven y el puerto**: Aiven enruta el puerto público estándar (3306) desde
> cualquier IP de salida; no hace falta abrir puertos en tu router.

> ⚠️ **Valores con `#`**: `dotenv` corta el valor en el primer `#`. Si tu contraseña
> lo contiene, escríbela entre comillas: `DB_PASSWORD="Clave#2026"`.

### 2.1 Alternativa: TiDB Cloud Starter (MySQL-compatible, sin tarjeta)

1. <https://tidb.cloud> → **Start Free** (sin tarjeta).
2. Crea un cluster **Starter** y un *TiDB Serverless Driver* (endpoint **MySQL**).
3. Descarga el **certificado CA** (necesario para TLS).
4. Rellena las mismas variables: `DB_HOST`, `DB_PORT` (4000), `DB_USER`, `DB_PASSWORD`,
   `DB_NAME`, `DB_SSL=true`, `DB_SSL_CA=<ruta al ca.crt>`.

> TiDB es totalmente compatible con MySQL, por lo que el proyecto funciona sin cambios.

---

## 3. Crear el esquema

Con las variables de base de datos ya en `.env`:

```bash
npm run db:init     # crea users, movimientos_saldo y bitacora_registro
npm run db:check    # confirma la conexión y muestra el estado
```

Salida esperada:

```
[db:init] Base de datos "synapseai_lab" disponible.
[db:init] Aplicando sql/schema.sql ...
   ✔ CREATE TABLE IF NOT EXISTS `users` (
   ✔ CREATE TABLE IF NOT EXISTS `movimientos_saldo` (
   ✔ CREATE TABLE IF NOT EXISTS `bitacora_registro` (
[db:init] Columna users.saldo -> decimal(12,2) (default 1.00)
```

> La tabla `sessions` (almacén de sesiones) la crea sola la librería
> `connect-mysql2` en el primer arranque con `SESSION_STORE=mysql`.

---

## 4. Correo al administrador — Brevo (gratis, 300/día)

1. Crea una cuenta en <https://www.brevo.com> (gratis, sin tarjeta).
2. **SMTP & API → SMTP & RELAY** → genera una nueva clave SMTP.
3. Anota **Login** (el usuario SMTP, no tu email de registro) y **Key**.
4. En `.env`:
   ```ini
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=xxxxxxxxx@smtp-relay.brevo.com
   SMTP_PASS=xsmtp-relay.xxxxxxxx
   ADMIN_EMAIL=admin@synapseailab.com
   MAIL_FROM_NAME=SynapseAI Lab
   ```

Verifica la configuración:

```bash
npm run smtp:check
```

> **Gmail como alternativa**: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`,
> `SMTP_USER=tu@gmail.com`, `SMTP_PASS=<contraseña de aplicación>`.
> Necesitas activar la verificación en 2 pasos y generar una contraseña de aplicación.
> El free tier de Brevo es más estable y sin fricción.

---

## 5. Google Identity Services (botón "Registrarse con Google")

> ⚠️ **Antes de continuar**: asegúrate de que `.env.example` **no** contiene tus
> credenciales reales. Ese archivo se sube al repositorio y GitHub bloquea el
> push con `GH013: Push cannot contain secrets` si detecta una contraseña de
> Aiven, SMTP, etc. Tus valores reales van en `.env` (ignorado por Git) o en el
> panel de variables de Render/Koyeb.

1. <https://console.cloud.google.com/> → crea un proyecto.
2. **APIs y servicios → Biblioteca** → habilita **Google Identity Services**.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente OAuth 2.0**
   → **Aplicación web**.
4. **Orígenes JavaScript autorizados**:
   - `http://localhost:3000` (desarrollo)
   - `https://synapseai-lab.onrender.com` (producción — el dominio exacto que te
     dé Render; también sirve `https://*.onrender.com` para subdominios)
5. Copia el **ID de cliente** a `GOOGLE_CLIENT_ID` en `.env`.
6. Añade **usuarios de prueba** en la pestaña *Audience* para poder entrar con
   cuentas que no verifiques (Google exige verificar la app si publicas en
   pantalla de consentimiento).

---

## 6. Desplegar la aplicación

### Opción A — Render (recomendada, la más sencilla)

**Automático con Blueprint:**

1. Sube el proyecto a GitHub.
2. En Render → **New → Blueprint** → selecciona tu repositorio.
3. Render leerá `render.yaml` y creará el servicio. Rellena las variables
   marcadas `sync: false` (datos de Aiven, Google y SMTP).
4. `SESSION_SECRET` lo genera Render solo (`generateValue: true`).
5. **Deploy** → en 2–3 minutos tendrás `https://synapseai-lab.onrender.com`.

**Manual:**

1. Render → **New → Web Service** → conecta tu repo.
2. Configura:
   | Campo | Valor |
   |-------|-------|
   | Environment | Node |
   | Build Command | `npm ci --omit=dev` |
   | Start Command | `node server.js` |
   | Instance Type | Free |
   | Health Check Path | `/api/health` |
3. Añade las variables de entorno del §2, §4 y §5, más:
   ```ini
   NODE_ENV=production
   SESSION_STORE=mysql      # ← CRÍTICO en plan gratuito
   SESSION_POOL_SIZE=3
   DB_SSL=true
   ```
4. Deploy y listo.

### Opción B — Koyeb

1. <https://koyeb.com> → **Create Web Service** → **GitHub** → tu repositorio.
2. Region: Frankfurt o Washington (los únicos con instancia gratuita).
3. Build: `npm ci --omit=dev` · Run: `node server.js` · Port: `3000`.
4. Variables de entorno idénticas a las de Render (`SESSION_STORE=mysql`).

### Opción C — Docker (cualquier proveedor)

```bash
docker build -t synapseai-lab .
docker run -d -p 3000:3000 --env-file .env synapseai-lab
```

---

## 6.1 Opción D — Aiven Runtime (todo dentro de Aiven)

Aiven Runtime despliega contenedores desde tu repositorio de GitHub, en la misma
región que tu base de datos (tráfico interno, sin coste de egreso).

### Configuración en la consola de Aiven

| Campo | Valor |
|-------|-------|
| Runtime → Deploy application | tu repo `eddy16pacheco-lab/SynapseAILab`, rama `main` |
| Manifest file | `Dockerfile` (Aiven lo detecta solo y toma el puerto de `EXPOSE`) |
| Build path | `./` |
| Containerfile path | `Dockerfile` |
| Public port | `3000` → Aiven publica `https://<uuid>-3000.<region>.aiven.app` |

### Reglas que exige Aiven Runtime

1. **El puerto de `EXPOSE` debe ser el mismo que escucha el proceso.**
   Aiven lee `EXPOSE 3000` para crear el puerto público. Si la app escucha en
   otro puerto, el servicio queda *no saludable* y Aiven muestra su página de
   estado en vez de tu app. Por eso el `Dockerfile` fija `ENV PORT=3000`.
2. **El endpoint público es siempre HTTPS:443** y Aiven reenvía al contenedor
   como HTTP. Por eso la cookie de sesión usa `secure: 'auto'`: si se fijara
   `secure: true` y Aiven no enviara `X-Forwarded-Proto`, el navegador
   descartaría la cookie y parecería que el login no funciona.
3. **El `Dockerfile` no debe tener continuaciones de línea (`\`)** en el
   `HEALTHCHECK`: el parser de manifiestos de Aiven las procesa de forma
   menos fiable. El nuestro va en una sola línea.
4. **No hay que abrir puertos**: Aiven enruta el 443 público al contenedor.

### Variables de entorno en Aiven Runtime

En *Runtime → tu app → Environment variables*:

```ini
NODE_ENV=production
PORT=3000
SESSION_STORE=mysql
SESSION_POOL_SIZE=3
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
DB_POOL_SIZE=5

DB_HOST=<Service URI de tu MySQL de Aiven>
DB_PORT=3306
DB_USER=avnadmin
DB_PASSWORD=<la que aparece en Connection>
DB_NAME=<database name>

GOOGLE_CLIENT_ID=<tu ID de cliente OAuth>
SMTP_HOST=<host del relay SMTP>
SMTP_PORT=<puerto del relay SMTP>
SMTP_USER=<usuario SMTP>
SMTP_PASS=<clave SMTP>
ADMIN_EMAIL=admin@synapseailab.com
```

> ⚠️ **Ports de salida bloqueados en Aiven Runtime**: `23, 25, 119, 135, 137,
> 138, 139, 179, 445, 465, 631`. El puerto **465** (SMTPS implícito) está
> bloqueado: usa **587 con STARTTLS** en lugar de 465.

### Diagnóstico

1. **Aiven → tu app → Runtime logs**: ahí se ve si el contenedor arrancó, en
   qué puerto escucha y si la base de datos conectó.
2. **Aiven → tu app → Build logs**: si el build falló (por ejemplo `npm ci`).
3. El endpoint `/api/health` devuelve el puerto real, el host y el estado de
   la BD, así que sirve de diagnóstico:
   ```bash
   curl https://<uuid>-3000.<region>.aiven.app/api/health
   # {"ok":true,"app":"SynapseAI Lab","db":"up","port":3000,"host":"",
   #  "env":"production","sessionStore":"mysql"}
   ```

### Sobre el mensaje "Domains, protocols and ports must match"

Es un aviso del navegador (no de tu app): la consola de Aiven muestra la
aplicación dentro de un `iframe` con sandbox y, al comprobar el estado del
servicio en `userapi.<region>.aivencloud.net/services/status`, el navegador
bloquea la navegación porque el origen no coincide. **Aparece cuando Aiven
considera el servicio no saludable**, así que el siguiente paso es mirar los
*Runtime logs*, no el frontend.

---

## 7. Alternativa 100 % local y gratuita (sin cuentas de terceros)
Si prefieres no registrarte en nada:

```bash
npm install
npm run db:init     # con un MySQL/MariaDB local
npm start           # http://localhost:3000
```

En Windows, si tienes MariaDB/MySQL instalado, crea el usuario y la base:

```sql
CREATE USER 'synapse'@'localhost' IDENTIFIED BY 'Synapse2026';
GRANT ALL PRIVILEGES ON *.* TO 'synapse'@'localhost' WITH GRANT OPTION;
FLUSH PRIVILEGES;
```

y en `.env`:

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=synapse
DB_PASSWORD=Synapse2026
DB_NAME=synapseai_lab
DB_SSL=false
SESSION_STORE=memory
```

---

## 8. Verificación posterior al despliegue

```bash
# 1. La app responde y la base de datos está conectada
curl https://tu-app.onrender.com/api/health
# {"ok":true,"app":"SynapseAI Lab","uptime":12.3,"db":"up"}

# 2. El frontend carga
curl -I https://tu-app.onrender.com/          # HTTP 200

# 3. Un registro real (debe devolver 201 y el saldo 1.00)
curl -X POST https://tu-app.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Ana","apellido":"Pacheco","cedula":"402-1234567-8",
       "telefono":"+1 809 555 0134","ocupacion":"Data Scientist",
       "email":"ana@example.com","password":"SYN#2026Segura"}'
```

**Checklist manual en el navegador:**

- [ ] El formulario valida en vivo (contraseña débil, correo inválido, etc.).
- [ ] El botón oficial de Google aparece y abre el popup de Google.
- [ ] Tras registrarte aparece la pantalla de bienvenida con **$1.00 USD**.
- [ ] Llega el correo al `ADMIN_EMAIL` con los 6 datos del usuario.
- [ ] Al recargar la página sigues con la sesión iniciada (requiere `SESSION_STORE=mysql`).

---

## 9. Problemas frecuentes

| Síntoma | Causa | Solución |
|---------|-------|----------|
| `401 Debes iniciar sesión` al recargar | Store de sesiones en memoria | `SESSION_STORE=mysql` y reinicia |
| `Server requests authentication using unknown plugin auth_gssapi_client` | MariaDB local con plugin GSSAPI | Crea un usuario `mysql_native_password` (ver §7) |
| `Access denied for user 'x'@'localhost'` | La contraseña se truncó en el `#` | Ponla entre comillas en `.env` |
| `ER_ACCESS_DENIED_ERROR` al crear la base | Aiven no permite `CREATE DATABASE` | `npm run db:init` lo tolera y usa la base existente |
| El primer visitante tarda ~1 min | *Cold start* del plan gratuito (instancia dormida) | Normal; se despierta sola tras la primera petición |
| `getaddrinfo ENOTFOUND` en el log | La BD gratuita de Aiven se apaga por inactividad | El pool de `mysql2` reconecta solo; si persiste, reactiva el servicio desde la consola de Aiven |
| El botón de Google no aparece | `GOOGLE_CLIENT_ID` vacío o sin reiniciar el servicio | Revisa `/api/config` (debe devolver `googleClientId`) y que la variable esté en el panel del proveedor |
| `Too many connections` | Exceso de conexiones a Aiven Free | `DB_POOL_SIZE=5` y `SESSION_POOL_SIZE=2` |

---

## 10. Costos reales y límites que debes conocer

- **$0**, pero con límites: ~750 h/mes de cómputo (Render), 1 GB de disco y un
  número reducido de conexiones simultáneas (Aiven Free).
- La instancia se **apaga a los 15–60 minutos sin tráfico**: la primera visita
  posterior tarda entre 30 y 60 segundos.
- El plan gratuito de Aiven puede **suspender el servicio por inactividad**.
- Brevo: 300 correos/día (de sobra para validar el ejercicio).
- Google Cloud: crear el ID de cliente OAuth no tiene costo.

Para un proyecto real you'd migrar a un plan de pago (Render $7/mes, Aiven Developer)
o usar un VPS gratuito de Oracle Cloud Always Free (4 ARM cores / 24 GB RAM).
