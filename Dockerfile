# =====================================================================
#  SynapseAI Lab — Imagen de producción
#  Útil para Render/Koyeb/Fly.io/Railway cuando el deploy es por Docker.
# =====================================================================
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

# 1) Dependencias (capa cacheable)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 2) Código
COPY . .

# 3) Usuario sin privilegios
RUN addgroup -S synapse && adduser -S synapse -G synapse && chown -R synapse:synapse /app
USER synapse

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
