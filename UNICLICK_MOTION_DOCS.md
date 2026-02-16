# ECOSISTEMA UNICLICK: Arquitectura, Funcionalidad y Flujo Lógico

## 1. Definición del Sistema
**Uniclick** es un sistema operativo comercial de **Inteligencia Artificial en Tiempo Real**. Funciona como el cerebro central de una empresa, unificando la comunicación, la gestión y la ejecución de tareas en una sola plataforma viva. No es un simple gestor de chats; es una entidad proactiva que **ve, escucha y analiza** para tomar decisiones autónomas o asistir a equipos humanos.

El corazón del sistema es **VIera**, nuestra inteligencia artificial avanzada (potenciada por la tecnología de **Vierai**), que habita en cada proceso, asegurando que la comprensión del contexto sea absoluta e instantánea.

---

## 2. El Factor "Tiempo Real" (La Columna Vertebral)
A diferencia de sistemas tradicionales que funcionan por "peticiones" (esperar a que algo cargue), Uniclick opera sobre un **Stream de Datos Continuo**.
*   **Conexión Viva:** Desde el momento en que se escanea el código QR de WhatsApp, se establece un túnel de datos permanente (Socket).
*   **Sin Latencia:** Cuando un cliente escribe, el sistema lo recibe en el milisegundo exacto. No hay "polling" (verificación periódica), hay **sincronización instantánea**.

---

## 3. Arquitectura Funcional y Conexiones (El Mapa del Sistema)
Aquí se detalla cómo se conecta cada función con la siguiente dentro del "Cerebro" de Uniclick.

### FASE 1: LA ENTRADA (Input Sensorial)
Todo comienza con la **Conexión Directa**.

1.  **Función de Enlace (QR Sync):**
    *   **Qué hace:** Vincula el WhatsApp del negocio con el Núcleo de Uniclick.
    *   **Conecta con:** El **Gestor de Sesiones**.
    *   **Resultado:** Crea una instancia única y segura que mantiene el teléfono "fusionado" con el servidor en la nube.

2.  **Receptor de Señales (Stream Listener):**
    *   **Qué hace:** Escucha pasivamente 24/7.
    *   **Conecta con:** El **Distribuidor de Mensajes**.
    *   **Lógica:** En cuanto entra un dato (mensaje, estado, llamada), este módulo se "ilumina" y lo pasa al siguiente nivel.

### FASE 2: EL PROCESAMIENTO E IDENTIDAD (El Cerebro VIera)
Una vez el dato está dentro, pasa al **Motor de Comprensión** y al **Filtro de Personalidad**.

3.  **Sistema de Personalidades (La Identidad de VIera):**
    *   **Concepto:** VIera no tiene una sola voz; tiene miles. Es un camaleón digital.
    *   **Funcionamiento:** Antes de procesar cualquier respuesta, el núcleo carga el **"Perfil de Personalidad"** asignado al negocio o incluso al chat específico.
    *   **Qué define:**
        *   *Tono:* (Formal, divertido, técnico, empático).
        *   *Conocimiento:* (Base de datos de PDFs y manuales específicos del negocio).
        *   *Reglas:* (Lo que DEBE y NO DEBE decir).
    *   **Conexión:** Este módulo "envuelve" al Núcleo de Decisión. VIera no piensa en vacío, piensa *como* el experto que debe ser (ej: un Doctor, un Vendedor de Coches, o un Asistente Legal).

4.  **Analizador de Medios (Los Sentidos de VIera):**
    *   *Si entra Audio:* Se activa el módulo auditivo. **Conecta con** el transcriptor que convierte ondas sonoras en texto puro en milisegundos.
    *   *Si entra Video:* Se activa **VIera Vision**.
        *   **Cómo funciona:** Descompone el video en frames.
        *   **Conecta con:** El motor de análisis visual de **Vierai**.
        *   **Resultado:** Extrae objetos, contexto, emociones y acciones del video (ej: "Cliente mostrando un motor averiado").

5.  **Núcleo de Decisión (VIera Core):**
    *   **Qué hace:** Recibe el texto, la transcripción del audio o el análisis del video.
    *   **Conecta con:** La **Memoria Contextual** (Base de Datos) para recordar quién es el cliente.
    *   **Proceso:** VIera cruza la información del cliente con las instrucciones de la **Personalidad Activa**.
    *   **Salida:** Genera una **Intención** alineada con la marca (ej: "Agendar cita hablando de usted" vs "Agendar cita hablando de tú").

### FASE 3: LA EJECUCIÓN (Herramientas Conectadas)
VIera no solo piensa, **actúa** conectándose con herramientas externas.

6.  **Conexión con Módulo Temporal (Google Calendar):**
    *   **Función:** Si la intención es "Agendar".
    *   **Flujo:** VIera consulta la disponibilidad en tiempo real ➡ Bloquea el espacio ➡ Genera el link de la reunión.
    *   **Retorno:** Devuelve la confirmación al chat.

7.  **Conexión con Módulo Financiero (Pagos):**
    *   **Función:** Si la intención es "Comprar/Pagar".
    *   **Flujo:** VIera conecta con la pasarela de pagos ➡ Genera un link de cobro único ➡ Lo envía al cliente.

8.  **Conexión con Gestión de Leads (CRM):**
    *   **Función:** Clasificación automática.
    *   **Flujo:** VIera detecta un cliente potencial de alto valor ➡ Lo etiqueta en la base de datos ➡ Notifica al equipo humano si es necesario.

### FASE 4: LA SALIDA (Respuesta)
9.  **Generador de Respuesta:**
    *   **Qué hace:** Redacta el mensaje final aplicando la **Capa de Estilo** de la personalidad.
    *   **Conecta con:** El **Emisor de WhatsApp**.
    *   **Resultado:** El cliente recibe una respuesta tan humana y específica que es indistinguible de la de un experto real.

---

## 4. Capacidades Omnicanal (El Alcance)
Aunque el núcleo principal suele ser WhatsApp, Uniclick es agnóstico al canal. La misma inteligencia **VIera** conecta con:
*   **Instagram Direct:** Para ventas visuales y reacciones a historias.
*   **Sitios Web:** A través de un widget de chat en tiempo real.
*   **Traducción Universal:** Uniclick tiene un módulo intermedio que traduce **cualquier idioma** en tiempo real. Un cliente escribe en francés, Uniclick procesa en español (usando su personalidad definida), y responde en francés.

## 5. Resumen de Tecnologías Implicadas
*   **Motor de Inteligencia:** VIera (basado en modelos avanzados **Vierai**).
*   **Sistema de Identidad:** Módulo de Personalidades Dinámicas.
*   **Protocolo de Comunicación:** Sockets de Alta Velocidad (Tiempo Real Pura).
*   **Infraestructura de Memoria:** Base de datos vectorial (para recordar contextos complejos y documentos de entrenamiento).
*   **Ojos y Oídos:** Procesamiento nativo de archivos multimedia (mp4, ogg, mp3, jpg).

---

## 6. Diagrama Lógico Simplificado (Para visualización)

`[CLIENTE]` 
   ⬇ (Envía Video/Audio/Texto)
`[SISTEMA DE ENTRADA]` (Inmediato/Tiempo Real)
   ⬇
`[CLASIFICADOR DE MEDIOS]` ➡ `[VISION/AUDICIÓN VIERA]`
   ⬇ (Datos extraídos)
`[CARGA DE PERSONALIDAD]` (Tono + Conocimiento del Negocio)
   ⬇ (Moldea al cerebro)
`[CEREBRO VIERA]` ⬅ (Consulta Contexto) ➡ `[MEMORIA HISTÓRICA]`
   ⬇ (Deciden actuar)
   ┣━━ ➡ `[CALENDARIO]` (Agendar)
   ┣━━ ➡ `[CRM]` (Guardar Lead)
   ┗━━ ➡ `[GENERADOR DE RESPUESTA]` (Filtro de Voz de Marca)
          ⬇
      `[CLIENTE]` (Recibe solución personalizada)
