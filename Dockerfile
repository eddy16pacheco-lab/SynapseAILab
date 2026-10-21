# =====================================================================
#  SynapseAI Lab — Imagen de producción
#  Compatible con: Aiven Runtime, Render, Koyeb, Fly.io, Railway, Docker
# =====================================================================
FROM node:24-alpine

# --- Variables de entorno ---
# NODE_ENV=production  -> activa helmet en modo estricto y los avisos de producción
# PORT=3000            -> debe COINCIDIR con EXPOSE. Aiven Runtime detecta el
#                          puerto público leyendo la instrucción EXPOSE, y si
#                          el proceso escucha en otro puerto el servicio queda
#                          "no saludable" y Aiven muestra su página de estado.
#                          Fijarlo aquí evita que un PORT heredado del entorno
#                          desplace la escucha.
# HOST=0.0.0.0         -> el contenedor debe aceptar conexiones de la red externa
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    SERVER_HOST=0.0.0.0 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

# 1) Dependencias (capa cacheable)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 2) Código
COPY . .

# 3) Usuario sin privilegios
RUN addgroup -S synapse && adduser -S synapse -G synapse && chown -R synapse:synapse /app
USER synapse

# 4) Puerto publicado (Aiven Runtime lo lee de aquí)
EXPOSE 3000

# 5) Health check en UNA SOLA LÍNEA: el parser de manifiestos de Aiven
#    procesa mejor las instrucciones sin continuaciones con "\".
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
