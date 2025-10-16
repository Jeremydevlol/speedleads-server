# 🔍 Guía de Diagnóstico - Sistema de Instrucciones de IA

## 📋 Resumen del Problema

Los mensajes de error genéricos como "Lo siento, no pude procesar tu mensaje correctamente" o "Tengo algunos problemas técnicos" indican que el sistema está fallando en algún punto específico del procesamiento de instrucciones.

## 🛠️ Mejoras Implementadas

### 1. **División Automática de Texto**
- Los PDFs e imágenes con texto > 1000 caracteres se dividen automáticamente
- Se crean múltiples instrucciones de máximo 1000 caracteres cada una
- La IA ahora tiene acceso completo a todo el contenido

### 2. **Mejor Manejo de Errores**
- Logging detallado en cada etapa del proceso
- Manejo de fallback cuando fallan los servicios
- Identificación específica de dónde ocurren los errores

### 3. **Sistema de Diagnóstico**
- Nuevo endpoint: `GET /api/personalities/system-diagnostic`
- Script de monitoreo automático
- Verificación de variables de entorno y base de datos

## 🚀 Cómo Diagnosticar Problemas

### Opción 1: Endpoint de Diagnóstico

```bash
# Hacer una petición al endpoint de diagnóstico
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     https://your-api-url.com/api/personalities/system-diagnostic
```

### Opción 2: Script de Monitoreo

1. **Configurar variables de entorno:**
```bash
export BASE_URL="https://your-api-url.com"
export TEST_TOKEN="your_jwt_token_here"
```

2. **Ejecutar el script:**
```bash
node diagnostic-monitor.js
```

## 🔍 Puntos de Verificación

### 1. Variables de Entorno
Verificar que estén presentes:
- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY` 
- `DATABASE_URL`

### 2. Base de Datos
- Conexión funcionando
- Personalidades existentes
- Instrucciones adicionales cargándose correctamente

### 3. Servicios de IA
- OpenAI API respondiendo
- DeepSeek como respaldo funcionando
- Límites de cuota no excedidos

## 🚨 Errores Comunes y Soluciones

### Error: "Variables de entorno no válidas"
**Causa:** Falta OPENAI_API_KEY o DEEPSEEK_API_KEY
**Solución:** Verificar que las keys están configuradas en producción

### Error: "Personalidad no encontrada"
**Causa:** ID de personalidad inválido o permisos de usuario
**Solución:** Verificar que el usuario tiene acceso a la personalidad

### Error: "No se pudieron obtener instrucciones válidas"
**Causa:** Instrucciones vacías en base de datos
**Solución:** El sistema usará instrucciones por defecto automáticamente

### Error: Ambos servicios de IA fallan
**Causa:** Problemas de red, cuota excedida, o APIs down
**Solución:** Verificar estado de las APIs y límites de cuota

## 📊 Logs Importantes a Revisar

```bash
# Buscar estos patrones en los logs:
grep "fetchPersonalityInstructions" your-app.log
grep "Variables de entorno no válidas" your-app.log
grep "Error con OpenAI" your-app.log
grep "Error con DeepSeek" your-app.log
grep "Instrucciones combinadas" your-app.log
```

## 🔧 Acciones Inmediatas

1. **Verificar variables de entorno en producción**
2. **Ejecutar el script de diagnóstico**
3. **Revisar logs de la aplicación**
4. **Probar con una personalidad específica**

## 📈 Monitoreo Continuo

Para evitar problemas futuros:

1. **Ejecutar diagnóstico regularmente:**
```bash
# Crear un cron job para monitoreo
0 */6 * * * cd /path/to/app && node diagnostic-monitor.js >> /var/log/ai-diagnostic.log 2>&1
```

2. **Alertas de logs:**
```bash
# Configurar alertas para errores críticos
tail -f your-app.log | grep -E "(Variables de entorno|Error con OpenAI|Error con DeepSeek)"
```

## 🆘 Si Todo Falla

Como último recurso, el sistema tiene estas medidas de seguridad:

1. **Instrucciones por defecto** basadas en la categoría de personalidad
2. **Respuestas de fallback** cuando fallan ambos servicios de IA
3. **Logging detallado** para identificar el problema exacto

## 📞 Contacto de Soporte

Si el problema persiste después de seguir esta guía:
1. Ejecutar el script de diagnóstico
2. Recopilar los logs relevantes
3. Identificar el error específico usando los logs mejorados
4. Contactar con el equipo técnico con la información detallada

---

**Nota:** Con las mejoras implementadas, el sistema es mucho más robusto y proporcionará información detallada sobre cualquier fallo para facilitar la resolución rápida de problemas. 