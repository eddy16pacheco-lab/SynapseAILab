# SynapseAI Lab

> **Plataforma global de entrenamiento de IA y etiquetado de datos**

Aplicación web full stack para el registro y validación de identidad de los
especialistas de datos que etiquetan y evalúan los modelos de IA de SynapseAI Lab.

Incluye formulario de registro con validaciones en el navegador y en el servidor,
verificación criptográfica de la cuenta de Google (Google Identity Services),
persistencia en Aiven MySQL Cloud, y notificación automática por correo al
administrador con cada alta.

---

## 1. Stack tecnológico

| Capa        | Tecnología                                                     |
|-------------|-----------------------------------------------------------------|
| Frontend    | HTML5, CSS3 (sin framework), JavaScript ES6                     |
| Identidad   | Google Identity Services (`accounts.google.com/gsi/client`)      |
| Backend     | Node.js 18+ / Express 4                                          |
| Verificación| `google-auth-library` (OAuth2Client.verifyIdToken)               |
| Base datos | MySQL 8 en Aiven Cloud + driver `mysql2` (prepared statements)   |
| Correo      | `nodemailer` (SMTP: Gmail, Outlook, Mailgun, Aiven SMTP…)        |
| Seguridad   | `helmet`, `express-rate-limit`, `express-session`, `dotenv`      |
| Pruebas     | `node:test` + `node:assert` (sin dependencias externas)          |

---

## 2. Estructura del proyecto

```
SynapseAI Lab/
│
├── package.json              Dependencias y scripts (start, dev, test, db:init…)
├── package-lock.json         Resolvedor de dependencias
├── server.js                  Servidor Express: helmet, sesión, rate limit, API
├── db.js                      Pool de MySQL (Aiven + SSL) y helpers de consulta
│
├── .env.example               Plantilla de variables de entorno
├── .gitignore                 Exclusiones de Git (.env, node_modules, *.crt…)
│
├── shared/
│   └── validators.js          Reglas de validación compartidas (UMD: Node + navegador)
│
├── src/
│   ├── googleAuth.js          Verificación estricta del id_token de Google
│   ├── mailer.js              Envío del aviso al administrador (nodemailer)
│   ├── middleware.js          requireAuth, asyncHandler, 404 y error handler
│   └── routes/
│       ├── auth.js            Rutas de registro, Google y cierre de sesión
│       └── me.js              Rutas del usuario en sesión (perfil y saldo)
│
├── scripts/
│   ├── init-db.js             Crea el esquema (ejecuta sql/schema.sql)
│   ├── db-check.js            Comprueba conexión y estado de la base de datos
│   └── smtp-check.js          Verifica la configuración SMTP
│
├── sql/
│   └── schema.sql             Tablas users, movimientos_saldo y bitacora_registro
│
├── public/                    Frontend estático
│   ├── index.html             Formulario, botón de Google y pantalla de bienvenida
│   ├── css/styles.css         Tema oscuro SaaS, responsive
│   ├── js/app.js              Validación en vivo, registro, Google y render del panel
│   └── img/favicon.svg        Logotipo (sinápsis neuronal)
│
└── tests/
    └── api.test.js            Pruebas de integración con DB / SMTP / Google simulados
```

---

## 3. Puesta en marcha (paso a paso)

### 3.1 Instalar dependencias

```bash
npm install
```

### 3.2 Configurar el entorno

```bash
cp .env.example .env        # Linux / macOS
copy .env.example .env      # Windows CMD
```

> ⚠️ **Detalle importante:** `dotenv` corta el valor en el primer `#` sin comillas.
> Si tu contraseña o tu API Key contienen `#`, escríbelas entre comillas:
> ```ini
> DB_PASSWORD="Synapse#2026"
> ```
> De lo contrario la contraseña se guardaría truncada y la conexión fallaría.

> Este repositorio ya incluye un `.env` local (MariaDB en `127.0.0.1`, sin SMTP)
> para que puedas levantar la app sin credenciales de Aiven. Sustitúyelo por el
> `.env` de Aiven cuando despliegues.

### 3.3 Crear la base de datos en Aiven Cloud

1. Entra en [console.aiven.io](https://console.aiven.io) y crea un servicio **MySQL**.
2. En **Service → Connection** copia:
   - `Service URI` → `DB_HOST`
   - `Port` → `DB_PORT` (por defecto 3306)
   - `User` → `DB_USER`
   - `Password` → `DB_PASSWORD`
   - `Database name` → `DB_NAME`
3. En **Service → Certificates** descarga el **CA certificate** y guárdalo como `certs/ca.crt`;
   apunta `DB_SSL_CA` a esa ruta para validar la cadena completa del TLS.
4. Deja `DB_SSL=true` (Aiven exige cifrado).

### 3.4 Crear las tablas

```bash
npm run db:init      # ejecuta sql/schema.sql
npm run db:check     # verifica conexión, usuarios y movimientos
```

### 3.5 Configurar Google Identity Services

1. [Google Cloud Console](https://console.cloud.google.com/) → crea o elige un proyecto.
2. **APIs y servicios → Biblioteca** → habilita **Google Identity Services** (o *People API*).
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente OAuth 2.0 → Aplicación web**.
4. **Orígenes JavaScript autorizados**: `http://localhost:3000` y `https://tu-dominio.com`.
5. Copia el **ID de cliente** a `GOOGLE_CLIENT_ID` en `.env`.

> El botón que se renderiza es el oficial de Google (`google.accounts.id.renderButton`)
> con la opción `text: 'signup_with'` y la interfaz en español (`?hl=es`),
> por lo que muestra **«Registrarse con Google»**.

### 3.6 Configurar el correo (SMTP)

Ejemplo con **Gmail**:

| Variable    | Valor                    |
|-------------|--------------------------|
| `SMTP_HOST` | `smtp.gmail.com`         |
| `SMTP_PORT` | `587`                    |
| `SMTP_USER` | `tu-cuenta@gmail.com`    |
| `SMTP_PASS` | *contraseña de aplicación* (requiere verificación en 2 pasos) |
| `ADMIN_EMAIL` | `admin@synapseailab.com` |

Comprueba la configuración con:

```bash
npm run smtp:check
```

### 3.7 Arrancar

```bash
npm start      # producción
npm run dev    # desarrollo (recarga automática)
```

Abre <http://localhost:3000>.

> ### 🚀 ¿Quieres publicarlo en Internet sin pagar nada?
> Sigue la guía **[DEPLOY.md](DEPLOY.md)**: Aiven MySQL Free Tier + Render Free +
> Brevo Free + Google OAuth, todo con **$0** y **sin tarjeta de crédito**.

---

## 4. Variables de entorno

| Variable                       | Uso                                                      | Por defecto            |
|--------------------------------|----------------------------------------------------------|------------------------|
| `PORT`                         | Puerto del servidor Express                               | `3000`                 |
| `NODE_ENV`                     | Modo (`development` / `production`)                       | `development`          |
| `SESSION_SECRET`               | Firma de la cookie de sesión                              | aleatorio              |
| `SESSION_STORE`                | `memory` (RAM) \| `mysql` (BD, **obligatorio en hosting gratuito**) | `memory`         |
| `SESSION_POOL_SIZE`            | Conexiones del pool de sesiones                           | `3`                   |
| `DB_HOST` / `HOST`             | Servidor MySQL de Aiven                                   | `localhost`            |
| `DB_PORT`                      | Puerto MySQL                                              | `3306`                 |
| `DB_USER` / `USER`             | Usuario MySQL                                             | `root`                 |
| `DB_PASSWORD` / `PASSWORD`     | Contraseña MySQL                                          | vacío                  |
| `DB_NAME` / `DATABASE`         | Nombre de la base de datos                                | `synapseai_lab`        |
| `DB_SSL`                       | Activa TLS (Aiven)                                        | `false`                |
| `DB_SSL_REJECT_UNAUTHORIZED`   | Valida el certificado del servidor                         | `false`                |
| `DB_SSL_CA`                    | Ruta al certificado CA de Aiven                           | —                      |
| `DB_POOL_SIZE`                 | Conexiones simultáneas del pool                            | `10`                   |
| `GOOGLE_CLIENT_ID`             | ID de cliente OAuth 2.0 de Google                         | —                      |
| `GOOGLE_HOSTED_DOMAIN`         | Restringe el dominio de Google (opcional)                 | —                      |
| `SMTP_HOST` / `SMTP_PORT`      | Servidor SMTP y puerto                                    | — / `587`              |
| `SMTP_SECURE`                  | `true` para SMTPS (465)                                   | `false`                |
| `SMTP_USER` / `SMTP_PASS`      | Credenciales SMTP                                         | —                      |
| `ADMIN_EMAIL`                  | Bandeja que recibe el aviso de cada registro              | —                      |
| `MAIL_FROM_NAME`               | Nombre del remitente                                      | `SynapseAI Lab`        |
| `SMTP_SEND_USER_COPY`          | Envía además correo de bienvenida al usuario              | `false`                |
| `BONUS_USD`                    | Saldo inicial de bienvenida                               | `1.00`                 |

### Base de datos con Aiven

Aiven ya crea la base y el usuario por ti, y el usuario **no** tiene permiso de
`CREATE DATABASE`. Por eso `npm run db:init`:

1. intenta `CREATE DATABASE IF NOT EXISTS` (si falla por permisos, avisa y continúa),
2. aplica `sql/schema.sql` sentencia a sentencia sobre la base configurada,
3. muestra las tablas resultantes y el tipo de la columna `users.saldo`.

> `scripts/init-db.js` incluye un divisor de sentencias SQL propio (respeta
> literales y comentarios), porque la opción `multipleStatements` de `mysql2`
> no se comporta igual en todas las versiones de MySQL/MariaDB.

---

## 5. API

| Método | Ruta                      | Descripción                                        |
|--------|---------------------------|----------------------------------------------------|
| `GET`  | `/api/config`             | Configuración pública (ID de Google, bono)         |
| `GET`  | `/api/health`             | Estado del servidor y de la base de datos           |
| `POST` | `/api/auth/register`      | Registro con formulario + validaciones             |
| `POST` | `/api/auth/google`        | Verificación estricta del `id_token` de Google     |
| `POST` | `/api/auth/logout`        | Cierre de sesión                                   |
| `GET`  | `/api/me`                 | Usuario de la sesión actual                        |
| `PATCH`| `/api/me/profile`         | Completa el perfil de cuentas creadas con Google   |
| `GET`  | `/api/me/movimientos`     | Historial de saldo                                 |

### `POST /api/auth/register`

```json
{
  "nombre": "Ana",
  "apellido": "Pacheco",
  "cedula": "402-1234567-8",
  "telefono": "+1 809 555 0134",
  "ocupacion": "Estudiante de Lingüística",
  "email": "ana.pacheco@example.com",
  "password": "SYN#2026Segura"
}
```

Respuesta `201`:

```json
{
  "ok": true,
  "message": "Registro completado correctamente.",
  "user": { "id": 1, "saldo": 1, "saldoFormateado": "$1.00 USD", "emailVerified": false, "provider": "local" },
  "bonus": 1,
  "adminNotified": true,
  "nuevo": true
}
```

Errores posibles: `422 VALIDATION_ERROR`, `409 DUPLICATE`, `429 RATE_LIMIT`.

### `POST /api/auth/google`

```json
{ "credential": "<id_token devuelto por Google Identity Services>" }
```

El backend verifica el token con `google-auth-library` y comprueba **explícitamente**
`aud`, `iss`, `exp` y `email_verified === true`.

---

## 6. Base de datos

### `users`

| Columna           | Tipo           | Notas                                                     |
|-------------------|----------------|-----------------------------------------------------------|
| `id`              | `INT UNSIGNED` | PK autoincremental                                        |
| `nombre`          | `VARCHAR(80)`  |                                                           |
| `apellido`        | `VARCHAR(80)`  |                                                           |
| `cedula`          | `VARCHAR(32)`  | **UNIQUE**                                                |
| `telefono`        | `VARCHAR(32)`  |                                                           |
| `ocupacion`       | `VARCHAR(120)` |                                                           |
| `email`           | `VARCHAR(190)` | **UNIQUE**                                                |
| `password`        | `TEXT`         | ⚠️ texto plano (ver §7)                                   |
| `email_verified`  | `TINYINT(1)`   | `1` cuando Google confirma la propiedad del correo        |
| `google_sub`      | `VARCHAR(255)` | **UNIQUE**, `sub` de la cuenta de Google                  |
| `provider`        | `ENUM`         | `local` \| `google`                                       |
| `perfil_completo` | `TINYINT(1)`   |                                                           |
| `saldo`           | `DECIMAL(12,2)`| **DEFAULT 1.00** ← bono de bienvenida                     |

### `movimientos_saldo`
Libro de movimientos (`bono`, `deposito`, `retiro`, `ajuste`) con `saldo_final` y `referencia`.

### `bitacora_registro`
Traza cada alta: usuario, origen (`local`/`google`) y si el correo al administrador
se envió correctamente (`correo_enviado`, `correo_error`).

---

## 7. ⚠️ Nota de seguridad sobre las contraseñas

Este proyecto es un **prototipo académico** y, tal y como requiere el enunciado,
almacena la contraseña **en texto plano** en la columna `users.password`.

En producción esto es inaceptable. Para_secure el código basta con sustituir, en
`src/routes/auth.js`, la línea del `INSERT`:

```js
// PROTOTIPO (texto plano)
password,

// PRODUCCIÓN (hash con bcrypt)
const passwordHash = await bcrypt.hash(password, 12);
```

y añadir `bcrypt` a las dependencias. El resto de la lógica (validación de
complejidad, duplicados, transacciones, correo al administrador) no cambia.

---

## 8. Buenas prácticas de seguridad implementadas

> ### ⚠️ Nunca escribas credenciales reales en `.env.example`
> `.env.example` **se sube al repositorio**. Si pones ahí una contraseña real
> (de Aiven, SMTP, etc.), GitHub activa **Push Protection** y **rechaza el
> push** con:
> ```
> remote: error: GH013: Repository rule violations found for refs/heads/main.
> remote:   - GITHUB PUSH PROTECTION
> remote:     - Push cannot contain secrets
> ```
> Las credenciales reales van en **`.env`** (está en `.gitignore`) o directamente
> en el panel de variables de entorno de Render/Koyeb.

- **Prepared statements** en todas las consultas (`pool.execute` / `conn.execute` con `?`).
- **Sanitización** de entradas: recorte, eliminación de caracteres de control y
  normalización del correo a minúsculas.
- **Validación estricta de contraseña**: mínimo 8 caracteres, mayúscula, minúscula,
  número, símbolo y rechazo de contraseñas comunes.
- **Verificación criptográfica** del `id_token` con `google-auth-library`,
  incluyendo comprobación explícita de `email_verified`.
- **Detección de duplicados** por correo y por cédula, con manejo de `ER_DUP_ENTRY`.
- **Transacciones** para la alta del usuario y el crédito del bono.
- **Rate limiting** (global y específico del registro).
- **Cabeceras de seguridad** con Helmet y CSP compatible con Google Identity Services.
- **Cookies de sesión** `httpOnly`, `sameSite=lax` y `secure` en producción.
- **Escape de HTML** en las plantillas de correo para evitar inyección en el mensaje.
- **Rate limiting por IP** y límite de tamaño del cuerpo de la petición (`100kb`).

---

## 9. Pruebas

```bash
npm test
```

La suite (`tests/api.test.js`) simula MySQL, SMTP y Google, y verifica:

- validación de cada campo y de la contraseña,
- alta de usuario, crédito del bono de `1.00 USD` y aviso al administrador,
- duplicados de correo y de cédula,
- creación de cuenta con Google, vinculación con cuentas locales y rechazo de
  tokens no verificados, expirados, con `aud` incorrecto o `iss` no autorizado,
- resistencia a intentos de inyección SQL,
- sesión (`/api/me`), movimientos de saldo y cierre de sesión.

---

## 10. Flujo de usuario

```
┌──────────────┐        ┌──────────────────┐       ┌──────────────────────┐
│  Formulario  │──────▶ │  /api/auth/      │──────▶│ users + movimientos  │
│  (7 campos)  │        │  register        │       │ saldo + bitácora     │
└──────────────┘        └──────────────────┘       └──────────┬───────────┘
                                                               │
                          ┌──────────────────┐                 │
                          │  Correo al       │◀────────────────┘
                          │  administrador   │   (nodemailer)
                          └──────────────────┘

┌──────────────┐        ┌──────────────────┐       ┌──────────────────────┐
│ Botón oficial│──────▶ │  /api/auth/      │──────▶│ verifyIdToken()     │
│ Google (GIS) │        │  google          │       │ aud · iss · exp ·    │
└──────────────┘        └──────────────────┘       │ email_verified       │
                                                    └──────────────────────┘
```

Al completarse cualquiera de los dos caminos, el frontend muestra la pantalla de
bienvenida con el bono de **$1.00 USD** acreditado.

---

## 11. Licencia

MIT — SynapseAI Lab.
#   S y n a p s e A I L a b  
 #   S y n a p s e A I L a b  
 #   S y n a p s e A I L a b  
 #   S y n a p s e A I L a b  
 