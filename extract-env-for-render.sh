#!/bin/bash

# Script para extraer variables de entorno del .env y formatearlas para Render
# Uso: ./extract-env-for-render.sh

echo "🔍 Extrayendo variables de entorno para Render..."
echo ""
echo "📋 Copia estas variables en el Dashboard de Render:"
echo "   https://dashboard.render.com/web/srv-d3occ13e5dus73aki5m0/env"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Variables críticas a extraer
VARS=(
  "SUPABASE_URL"
  "SUPABASE_ANON_KEY"
  "SUPABASE_SERVICE_ROLE_KEY"
  "DATABASE_URL"
  "AUTH0_DOMAIN"
  "AUTH0_CLIENT_ID"
  "AUTH0_CLIENT_SECRET"
  "GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET"
  "GOOGLE_VISION_API_KEY"
  "GOOGLE_TRANSLATE_API_KEY"
  "SENDGRID_API_KEY"
  "SENDGRID_INVITE_TEMPLATE_ID"
  "STRIPE_SECRET_KEY"
  "STRIPE_PUBLISHABLE_KEY"
  "JWT_SECRET"
  "SESSION_SECRET"
  "OPENAI_API_KEY"
)

# Leer .env
if [ ! -f ".env" ]; then
  echo "❌ Error: No se encontró el archivo .env"
  exit 1
fi

# Extraer y mostrar cada variable
for VAR in "${VARS[@]}"; do
  VALUE=$(grep "^${VAR}=" .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")
  
  if [ -n "$VALUE" ]; then
    echo "${VAR}=${VALUE}"
  else
    echo "# ${VAR}=<NO_ENCONTRADO>"
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Variables extraídas exitosamente"
echo ""
echo "📝 Notas:"
echo "   - Las variables marcadas con <NO_ENCONTRADO> necesitan ser configuradas manualmente"
echo "   - NO compartas este output públicamente (contiene secretos)"
echo "   - Copia y pega cada variable en el dashboard de Render"
echo ""
