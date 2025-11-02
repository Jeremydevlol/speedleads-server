# 💬 Frontend: Sistema de DMs de Instagram

## 🎯 Resumen

Sistema completo para obtener y mostrar mensajes directos de Instagram, con historial completo de conversaciones y respuestas automáticas con IA.

---

## 📋 Endpoints Disponibles

### **1. Obtener lista de conversaciones**

```http
GET /api/instagram/dms
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "thread_id_123",
      "sender_name": "Juan Pérez",
      "username": "juanperez",
      "avatar": "https://instagram.com/...",
      "last_message": "Hola, ¿tienes stock disponible?",
      "timestamp": 1706457600000,
      "unread_count": 0
    }
  ],
  "count": 5
}
```

---

### **2. Obtener historial completo de mensajes**

```http
GET /api/instagram/thread/:threadId/messages?limit=50
```

**Ejemplo:**
```bash
GET /api/instagram/thread/340282366841710300949128289887597593677/messages?limit=50
```

**Respuesta:**
```json
{
  "success": true,
  "thread_id": "340282366841710300949128289887597593677",
  "count": 25,
  "data": [
    {
      "id": "item_id_1",
      "text": "Hola, ¿tienes stock disponible?",
      "sender": {
        "pk": "123456789",
        "username": "juanperez",
        "full_name": "Juan Pérez",
        "is_private": false,
        "is_verified": false
      },
      "timestamp": 1706457600000,
      "is_own": false,
      "item_type": "text",
      "media_type": null,
      "media_url": null
    },
    {
      "id": "item_id_2",
      "text": "Sí, tenemos stock",
      "sender": {
        "pk": "987654321",
        "username": "tucuenta",
        "full_name": "Tu Cuenta",
        "is_private": false,
        "is_verified": false
      },
      "timestamp": 1706457620000,
      "is_own": true,
      "item_type": "text",
      "media_type": null,
      "media_url": null
    }
  ]
}
```

**Tipos de mensajes soportados:**
- ✅ Texto (`text`)
- ✅ Imágenes (`image`)
- ✅ Videos (`video`)
- ✅ Audios (`voice_media`)
- ✅ Me gusta (`like`)
- ✅ Compartir historias (`story_share`)
- ✅ Compartir medios (`media_share`)

---

## 🎨 Ejemplo de Implementación

### **Componente React para mostrar DMs**

```tsx
import { useState, useEffect } from 'react';
import io from 'socket.io-client';

interface DirectMessage {
  id: string;
  sender_name: string;
  username: string;
  avatar: string;
  last_message: string;
  timestamp: number;
  unread_count: number;
}

interface Message {
  id: string;
  text: string;
  sender: {
    pk: string;
    username: string;
    full_name: string;
    is_private: boolean;
    is_verified: boolean;
  };
  timestamp: number;
  is_own: boolean;
  item_type: string;
  media_type?: string;
  media_url?: string;
}

const InstagramDMs = () => {
  const [conversations, setConversations] = useState<DirectMessage[]>([]);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

  // Obtener lista de conversaciones
  const fetchConversations = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/instagram/dms`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setConversations(data.data);
      }
    } catch (error) {
      console.error('Error obteniendo conversaciones:', error);
    } finally {
      setLoading(false);
    }
  };

  // Obtener historial de un thread
  const fetchThreadMessages = async (threadId: string) => {
    setLoading(true);
    setSelectedThread(threadId);
    
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/instagram/thread/${threadId}/messages?limit=50`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );
      
      const data = await response.json();
      
      if (data.success) {
        setMessages(data.data);
      }
    } catch (error) {
      console.error('Error obteniendo mensajes:', error);
    } finally {
      setLoading(false);
    }
  };

  // Escuchar nuevos mensajes en tiempo real vía Socket.IO
  useEffect(() => {
    const socket = io(BACKEND_URL);

    // Escuchar nuevos mensajes
    socket.on('instagram:message', (data: any) => {
      console.log('Nuevo mensaje recibido:', data);
      
      // Si el mensaje es del thread seleccionado, agregarlo
      if (data.thread_id === selectedThread) {
        // Aquí necesitarías parsear el mensaje según la estructura de Instagram
        // setMessages(prev => [...prev, parsedMessage]);
      }
      
      // Refrescar lista de conversaciones
      fetchConversations();
    });

    return () => socket.disconnect();
  }, [selectedThread]);

  // Cargar conversaciones al montar
  useEffect(() => {
    fetchConversations();
  }, []);

  return (
    <div className="flex h-screen">
      {/* Lista de conversaciones */}
      <div className="w-1/3 border-r overflow-y-auto">
        <h2 className="p-4 font-bold text-xl border-b">
          Mensajes Directos ({conversations.length})
        </h2>
        
        <div className="divide-y">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              onClick={() => fetchThreadMessages(conversation.id)}
              className={`p-4 hover:bg-gray-100 cursor-pointer ${
                selectedThread === conversation.id ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <img
                  src={conversation.avatar}
                  alt={conversation.username}
                  className="w-12 h-12 rounded-full"
                  onError={(e) => {
                    e.currentTarget.src = '/default-avatar.png';
                  }}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">
                    {conversation.sender_name}
                  </h3>
                  <p className="text-sm text-gray-600 truncate">
                    {conversation.last_message}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(conversation.timestamp).toLocaleString()}
                  </p>
                </div>
                {conversation.unread_count > 0 && (
                  <span className="bg-blue-500 text-white rounded-full px-2 py-1 text-xs">
                    {conversation.unread_count}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mensajes de la conversación seleccionada */}
      <div className="flex-1 flex flex-col">
        {selectedThread ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.is_own ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-md rounded-lg p-3 ${
                      msg.is_own
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-900'
                    }`}
                  >
                    {/* Mostrar tipo de mensaje especial */}
                    {msg.item_type === 'like' && <span>❤️</span>}
                    {msg.item_type === 'story_share' && (
                      <div className="text-xs italic">📸 {msg.text}</div>
                    )}
                    
                    {/* Mostrar imagen si existe */}
                    {msg.media_type === 'image' && msg.media_url && (
                      <img
                        src={msg.media_url}
                        alt="Imagen"
                        className="rounded mb-2 max-w-full"
                      />
                    )}
                    
                    {/* Mostrar video si existe */}
                    {msg.media_type === 'video' && msg.media_url && (
                      <video
                        src={msg.media_url}
                        controls
                        className="rounded mb-2 max-w-full"
                      />
                    )}
                    
                    {/* Mostrar audio si existe */}
                    {msg.media_type === 'audio' && msg.media_url && (
                      <audio src={msg.media_url} controls className="w-full" />
                    )}
                    
                    {/* Texto del mensaje */}
                    {msg.text && msg.item_type !== 'like' && (
                      <p>{msg.text}</p>
                    )}
                    
                    <span className="text-xs opacity-75 block mt-1">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
              
              {loading && (
                <div className="text-center text-gray-500">
                  Cargando mensajes...
                </div>
              )}
            </div>

            {/* Input para enviar mensaje (opcional) */}
            {/* <MessageInput threadId={selectedThread} /> */}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            Selecciona una conversación
          </div>
        )}
      </div>
    </div>
  );
};

export default InstagramDMs;
```

---

## 🔧 Función Helper para Parsear Tipos de Mensaje

```typescript
const getMessageDisplay = (message: Message) => {
  switch (message.item_type) {
    case 'text':
      return message.text;
    
    case 'like':
      return '❤️ Me gusta';
    
    case 'voice_media':
      return message.media_url ? (
        <audio src={message.media_url} controls />
      ) : '🎤 Audio';
    
    case 'image':
      return message.media_url ? (
        <img src={message.media_url} alt="Imagen" className="max-w-xs rounded" />
      ) : '📷 Imagen';
    
    case 'video':
      return message.media_url ? (
        <video src={message.media_url} controls className="max-w-xs" />
      ) : '🎥 Video';
    
    case 'story_share':
      return `📸 ${message.text || 'Compartió tu historia'}`;
    
    case 'media_share':
      return `📎 ${message.text || 'Compartió una publicación'}`;
    
    default:
      return message.text || '[Tipo de mensaje desconocido]';
  }
};
```

---

## 🔔 Sistema de Alertas con Socket.IO

Las alertas de Instagram se emiten automáticamente cuando:
- Se recibe un mensaje de una cuenta privada
- Hay problemas con la extracción de seguidores

```typescript
const socket = io(BACKEND_URL);

socket.on('instagram:alert', (alert) => {
  console.log('Alerta:', alert);
  
  // Mostrar notificación toast
  toast(alert.message, {
    icon: alert.severity === 'error' ? '🚨' : 
          alert.severity === 'warning' ? '⚠️' : 'ℹ️'
  });
});

socket.on('instagram:message', (data) => {
  console.log('Nuevo mensaje:', data);
  // Refrescar conversaciones
  fetchConversations();
});
```

---

## ✅ Checklist de Implementación

- [ ] Instalar dependencias: `socket.io-client`
- [ ] Crear componente para lista de conversaciones
- [ ] Crear componente para historial de mensajes
- [ ] Implementar actualización en tiempo real con Socket.IO
- [ ] Manejar diferentes tipos de mensajes (texto, imagen, audio, video)
- [ ] Mostrar avatares con fallback a imagen por defecto
- [ ] Mostrar timestamps formateados
- [ ] Indicadores de mensajes no leídos
- [ ] Scroll automático al último mensaje
- [ ] Loading states durante carga de mensajes
- [ ] Manejo de errores

---

## 🎯 Próximos Pasos

El bot automático ya está configurado para:
- ✅ Responder automáticamente a mensajes nuevos
- ✅ Usar la personalidad seleccionada
- ✅ Mantener contexto de la conversación
- ✅ Simular comportamiento humano (delays, escritura, etc.)
- ✅ Analizar imágenes con IA
- ✅ Transcribir audios con Whisper

**Solo necesitas activar el bot desde el frontend y seleccionar una personalidad.**

---

## 📝 Archivos Relacionados

- `FRONTEND_ALERTAS_INSTAGRAM.md` - Sistema de alertas
- `INSTAGRAM_ENDPOINTS_COMPLETE.md` - Documentación completa de endpoints
- `RESUMEN_ALERTAS_FRONTEND.md` - Resumen rápido de alertas

