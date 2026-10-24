# SynapseAI Lab

> **Plataforma global de entrenamiento de IA y etiquetado de datos**

Aplicación web full stack para el registro y validación de identidad de los
especialistas de datos que etiquetan y evalúan los modelos de IA de SynapseAI Lab.

Incluye formulario de registro con validaciones en el navegador y en el servidor,
persistencia en MySQL (compatible con cualquier proveedor: Aiven, TiDB Cloud, etc.)
y notificación automática por correo al administrador con cada alta.

---

## 1. Stack tecnológico

| Capa        | Tecnología                                                     |
|-------------|-----------------------------------------------------------------|
| Frontend    | HTML5, CSS3 (sin framework), JavaScript ES6                     |
| Backend     | Node.js 18+ / Express 4                                          |
| Base datos | MySQL 8 / compatible + driver `mysql2` (prepared statements)      |
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
├── src/
│   ├── mailer.js              Envío del aviso al administrador (nodemailer)
│   ├── middleware.js          requireAuth, asyncHandler, 404 y error handler
│   └── routes/
│       ├── auth.js            Rutas de registro y cierre de sesión
│       └── me.js              Rutas del usuario en sesión (datos y saldo)
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
│   ├── index.html             Formulario de registro y pantalla de bienvenida
│   ├── css/styles.css         Tema oscuro SaaS, responsive
│   ├── shared/validators.js   Reglas de validación compartidas (UMD: Node + navegador)
│   ├── js/app.js              Validación en vivo, registro y render del panel
│   └── img/favicon.svg        Logotipo (sinápsis neuronal)
│
└── tests/
    └── api.test.js            Pruebas de integración con DB / SMTP simulados
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

### 3.5 Configurar el correo (SMTP)

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

### 3.6 Arrancar

```bash
npm start      # producción
npm run dev    # desarrollo (recarga automática)
```

Abre <http://localhost:3000>.

> ### 🚀 ¿Quieres publicarlo en Internet sin pagar nada?
> Sigue la guía **[DEPLOY.md](DEPLOY.md)**: base MySQL gratuita + hosting gratuito +
> Brevo Free, todo con **$0** y **sin tarjeta de crédito**.

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
| `GET`  | `/api/config`             | Configuración pública (bono de bienvenida)         |
| `GET`  | `/api/health`             | Estado del servidor y de la base de datos           |
| `POST` | `/api/auth/register`      | Registro con formulario + validaciones             |
| `POST` | `/api/auth/logout`        | Cierre de sesión                                   |
| `GET`  | `/api/me`                 | Usuario de la sesión actual                        |
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
  "user": { "id": 1, "saldo": 1, "saldoFormateado": "$1.00 USD" },
  "bonus": 1,
  "adminNotified": true,
  "nuevo": true
}
```

Errores posibles: `422 VALIDATION_ERROR`, `409 DUPLICATE`, `429 RATE_LIMIT`.

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
| `password`        | `TEXT`         | texto plano, tal cual la escribe el usuario (ver §7)      |
| `saldo`           | `DECIMAL(12,2)`| **DEFAULT 1.00** ← bono de bienvenida                     |

### `movimientos_saldo`
Libro de movimientos (`bono`, `deposito`, `retiro`, `ajuste`) con `saldo_final` y `referencia`.

### `bitacora_registro`
Traza cada alta: usuario y si el correo al administrador
se envió correctamente (`correo_enviado`, `correo_error`).

---

## 7. Contraseñas

Por decisión del proyecto, la contraseña se guarda **en texto plano** en la
columna `users.password`: exactamente como la escribe el usuario, sin hash ni
cifrado y sin recortes (`trim`). La lógica está en `src/routes/auth.js` (INSERT
del registro) y `public/shared/validators.js` (el valor de la contraseña no se
transforma).

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
- **Detección de duplicados** por correo y por cédula, con manejo de `ER_DUP_ENTRY`.
- **Transacciones** para la alta del usuario y el crédito del bono.
- **Rate limiting** (global y específico del registro).
- **Cabeceras de seguridad** con Helmet y CSP estricta (solo recursos propios).
- **Cookies de sesión** `httpOnly`, `sameSite=lax` y `secure` en producción.
- **Escape de HTML** en las plantillas de correo para evitar inyección en el mensaje.
- **Rate limiting por IP** y límite de tamaño del cuerpo de la petición (`100kb`).

---

## 9. Pruebas

```bash
npm test
```

La suite (`tests/api.test.js`) simula MySQL y SMTP, y verifica:

- validación de cada campo y de la contraseña,
- alta de usuario, crédito del bono de `1.00 USD` y aviso al administrador,
- duplicados de correo y de cédula,
- que la contraseña se guarda en texto plano, sin modificar,
- que ya no existe ninguna ruta de registro con Google,
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
```

Al completarse el registro, el frontend muestra la pantalla de
bienvenida con el bono de **$1.00 USD** acreditado.

---

## 11. Licencia

MIT — SynapseAI Lab.
