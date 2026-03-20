# Frontend: Progreso en tiempo real del envío masivo de DMs (Instagram)

El backend emite eventos Socket.IO durante el envío masivo de DMs para que el frontend muestre progreso en tiempo real, barra de carga y alerta de éxito.

## Requisito: Unirse a la sala del usuario

Para recibir los eventos, el frontend debe unir el socket a la sala del usuario (por `userId`):

```javascript
// Al conectar el socket (con token autenticado)
socket.emit('join-room', userId);  // userId = usuario autenticado (ej. session.user.id)
```

## Eventos emitidos por el backend

### 1. `ig-bulk-send-started`

Se emite al iniciar el envío masivo.

```javascript
{
  total: number,      // Cantidad total de destinatarios
  usernames: string[] // Lista de usernames a los que se enviará
}
```

**Uso en frontend:** Mostrar la lista de usuarios seleccionados (ej. "Enviando a 3 usuarios: @user1, @user2, @user3") y preparar la barra de progreso (0%).

---

### 2. `ig-bulk-send-progress`

Se emite tras cada mensaje enviado (éxito o fallo).

```javascript
{
  index: number,   // Mensaje actual (1, 2, 3...)
  total: number,   // Total de mensajes
  username: string,
  success: boolean,
  error?: string   // Si falló, mensaje de error
}
```

**Uso en frontend:**
- Mostrar contador: `"${index}/${total}"` (ej. "1/3", "2/3")
- Actualizar barra de progreso: `(index / total) * 100`
- Marcar cada usuario como enviado/fallido en la lista

---

### 3. `ig-bulk-send-complete`

Se emite al finalizar (éxito o error general).

```javascript
{
  success: boolean,   // true si el proceso terminó bien
  sent: number,       // Cantidad enviados con éxito
  failed: number,     // Cantidad fallidos
  total: number,     // Total procesados
  usernames: string[], // Solo los usernames a los que SÍ se envió correctamente
  error?: string     // Si success=false, mensaje de error
}
```

**Uso en frontend:**
- Mostrar alerta de éxito: "Envío exitoso. Mensajes enviados a: @user1, @user2, @user3"
- O alerta de error si `success === false`
- Ocultar barra de progreso y desbloquear UI

---

## Ejemplo de integración (React)

```tsx
useEffect(() => {
  if (!socket || !userId) return;
  socket.emit('join-room', userId);
}, [socket, userId]);

useEffect(() => {
  if (!socket) return;
  const onStarted = (data: { total: number; usernames: string[] }) => {
    setProgress({ current: 0, total: data.total, usernames: data.usernames });
    setSending(true);
  };
  const onProgress = (data: { index: number; total: number; username: string; success: boolean }) => {
    setProgress(p => ({ ...p, current: data.index }));
  };
  const onComplete = (data: { success: boolean; usernames: string[]; error?: string }) => {
    setSending(false);
    if (data.success && data.usernames?.length) {
      alert(`Envío exitoso. Mensajes enviados a: ${data.usernames.map(u => '@' + u).join(', ')}`);
    } else if (!data.success) {
      alert(data.error || 'Error en el envío');
    }
  };
  socket.on('ig-bulk-send-started', onStarted);
  socket.on('ig-bulk-send-progress', onProgress);
  socket.on('ig-bulk-send-complete', onComplete);
  return () => {
    socket.off('ig-bulk-send-started', onStarted);
    socket.off('ig-bulk-send-progress', onProgress);
    socket.off('ig-bulk-send-complete', onComplete);
  };
}, [socket]);
```

## API HTTP

El frontend sigue llamando a `POST /api/instagram/private/bulk-send` con:

```json
{
  "recipients": [
    { "username": "user1", "message": "Hola..." },
    { "username": "user2", "message": "Hola..." }
  ],
  "defaultMessage": "Mensaje por defecto (opcional)"
}
```

La respuesta HTTP llega cuando todo termina; los eventos Socket.IO permiten actualizar la UI en tiempo real mientras tanto.
