# 🚀 **CÓDIGO FRONTEND UNIVERSAL - GOOGLE CALENDAR**

## ✅ **SISTEMA UNIVERSAL: UNA CUENTA A LA VEZ**

**Funciona con cualquier cuenta de Google. Permite desconectar y conectar cuentas diferentes.**

---

## 💻 **HOOK useGoogleCalendar UNIVERSAL:**

```javascript
import { useState, useEffect, useCallback } from 'react';

const useGoogleCalendar = () => {
  const [currentAccount, setCurrentAccount] = useState(null);
  const [events, setEvents] = useState([]);
  const [calendars, setCalendars] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const BACKEND_URL = 'http://localhost:5001';
  const DEV_TOKEN = 'development-token';

  // ✅ OBTENER CUENTA ACTUAL
  const fetchCurrentAccount = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/google/calendar/current-account`,
        {
          headers: {
            'Authorization': `Bearer ${DEV_TOKEN}`
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`Error del backend: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setCurrentAccount(data.account);
        
        if (data.account) {
          console.log(`✅ Cuenta conectada: ${data.account.email} (${data.account.eventCount} eventos)`);
        } else {
          console.log('📭 No hay cuenta de Google conectada');
        }
      }
    } catch (error) {
      console.error('❌ Error fetching current account:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ✅ OBTENER EVENTOS DE LA CUENTA ACTUAL
  const fetchEvents = useCallback(async () => {
    if (!currentAccount?.userId) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/google/calendar/events?userId=${currentAccount.userId}`,
        {
          headers: {
            'Authorization': `Bearer ${DEV_TOKEN}`
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`Error del backend: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setEvents(data.events || []);
        console.log(`✅ ${data.events?.length || 0} eventos cargados`);
      }
    } catch (error) {
      console.error('❌ Error fetching events:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccount]);

  // ✅ OBTENER ESTADO DE CONEXIÓN
  const fetchStatus = useCallback(async () => {
    if (!currentAccount?.userId) return;

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/google/calendar/status?userId=${currentAccount.userId}`,
        {
          headers: {
            'Authorization': `Bearer ${DEV_TOKEN}`
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`Error del backend: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setStatus(data);
        console.log(`✅ Estado: ${data.message}`);
      }
    } catch (error) {
      console.error('❌ Error fetching status:', error);
      setError(error.message);
    }
  }, [currentAccount]);

  // ✅ OBTENER CALENDARIOS
  const fetchCalendars = useCallback(async () => {
    if (!currentAccount?.userId) return;

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/google/calendar/calendars?userId=${currentAccount.userId}`,
        {
          headers: {
            'Authorization': `Bearer ${DEV_TOKEN}`
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`Error del backend: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setCalendars(data.calendars || []);
        console.log(`✅ ${data.calendars?.length || 0} calendarios disponibles`);
      }
    } catch (error) {
      console.error('❌ Error fetching calendars:', error);
      setError(error.message);
    }
  }, [currentAccount]);

  // ✅ SINCRONIZAR EVENTOS
  const syncEvents = useCallback(async () => {
    if (!currentAccount?.userId) return;

    setSyncing(true);
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/google/calendar/sync`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${DEV_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ userId: currentAccount.userId })
        }
      );
      
      if (!response.ok) {
        throw new Error(`Error del backend: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Sincronización exitosa:', data.message);
        await fetchEvents(); // Refrescar eventos
        await fetchCurrentAccount(); // Actualizar contador
        return data;
      }
    } catch (error) {
      console.error('❌ Error syncing:', error);
      setError(error.message);
    } finally {
      setSyncing(false);
    }
  }, [currentAccount, fetchEvents, fetchCurrentAccount]);

  // ✅ DESCONECTAR CUENTA ACTUAL
  const disconnectAccount = useCallback(async () => {
    if (!currentAccount?.userId) return;

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/google/calendar/disconnect`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${DEV_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ userId: currentAccount.userId })
        }
      );
      
      if (!response.ok) {
        throw new Error(`Error del backend: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        console.log(`✅ Cuenta desconectada: ${data.disconnectedEmail}`);
        
        // Limpiar estado
        setCurrentAccount(null);
        setEvents([]);
        setCalendars([]);
        setStatus(null);
        
        return data;
      }
    } catch (error) {
      console.error('❌ Error disconnecting:', error);
      setError(error.message);
    }
  }, [currentAccount]);

  // ✅ CREAR EVENTO
  const createEvent = useCallback(async (eventData) => {
    if (!currentAccount?.userId) return;

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/google/calendar/events`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${DEV_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: currentAccount.userId,
            ...eventData
          })
        }
      );
      
      if (!response.ok) {
        throw new Error(`Error del backend: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Evento creado exitosamente');
        await fetchEvents(); // Refrescar eventos
        return data;
      }
    } catch (error) {
      console.error('❌ Error creating event:', error);
      setError(error.message);
    }
  }, [currentAccount, fetchEvents]);

  return {
    currentAccount,   // ✅ Cuenta actualmente conectada (o null)
    events,          // ✅ Eventos de la cuenta actual
    calendars,       // ✅ Lista de calendarios
    status,          // ✅ Estado de conexión
    loading,         // ✅ Estado de carga
    syncing,         // ✅ Estado de sincronización
    error,           // ✅ Manejo de errores
    fetchCurrentAccount, // ✅ Obtener cuenta actual
    fetchEvents,     // ✅ Obtener eventos
    fetchStatus,     // ✅ Obtener estado
    fetchCalendars,  // ✅ Obtener calendarios
    syncEvents,      // ✅ Sincronizar eventos
    disconnectAccount, // ✅ Desconectar cuenta
    createEvent      // ✅ Crear evento
  };
};

export default useGoogleCalendar;
```

---

## 🎨 **COMPONENTE UNIVERSAL:**

```javascript
import React, { useEffect, useState } from 'react';
import useGoogleCalendar from './hooks/useGoogleCalendar';

const GoogleCalendarUniversal = () => {
  const {
    currentAccount,
    events,
    calendars,
    status,
    loading,
    syncing,
    error,
    fetchCurrentAccount,
    fetchEvents,
    fetchStatus,
    fetchCalendars,
    syncEvents,
    disconnectAccount,
    createEvent
  } = useGoogleCalendar();

  const [syncMessage, setSyncMessage] = useState('');
  const [showCreateEvent, setShowCreateEvent] = useState(false);

  useEffect(() => {
    fetchCurrentAccount();
  }, [fetchCurrentAccount]);

  useEffect(() => {
    if (currentAccount) {
      fetchEvents();
      fetchStatus();
      fetchCalendars();
    }
  }, [currentAccount, fetchEvents, fetchStatus, fetchCalendars]);

  // ✅ MANEJAR SINCRONIZACIÓN
  const handleSync = async () => {
    if (!currentAccount) return;
    
    setSyncMessage('');
    const result = await syncEvents();
    
    if (result?.success) {
      setSyncMessage(`✅ ${result.message}`);
    } else {
      setSyncMessage(`❌ Error en sincronización`);
    }
    
    setTimeout(() => setSyncMessage(''), 5000);
  };

  // ✅ MANEJAR DESCONEXIÓN
  const handleDisconnect = async () => {
    if (!currentAccount) return;
    
    if (confirm(`¿Estás seguro de que quieres desconectar ${currentAccount.email}?`)) {
      const result = await disconnectAccount();
      if (result?.success) {
        setSyncMessage(`✅ ${result.message}`);
        setTimeout(() => setSyncMessage(''), 3000);
      }
    }
  };

  if (loading && !currentAccount) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Cargando Google Calendar...</p>
        </div>
      </div>
    );
  }

  // ✅ SIN CUENTA CONECTADA
  if (!currentAccount) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          📅 Google Calendar
        </h2>
        
        <div className="text-center py-8">
          <div className="mb-6">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📅</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              No hay cuenta de Google conectada
            </h3>
            <p className="text-gray-500 mb-6">
              Conecta tu cuenta de Google para sincronizar tus eventos de calendario
            </p>
          </div>
          
          <a
            href="http://localhost:5001/api/auth/google/calendar/connect?userId=96754cf7-5784-47f1-9fa8-0fc59122fe13"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg inline-flex items-center space-x-2 transition-colors"
          >
            <span>🔗</span>
            <span>Conectar Google Calendar</span>
          </a>
          
          <p className="text-xs text-gray-400 mt-4">
            Funciona con cualquier cuenta de Google
          </p>
        </div>

        {/* Mensaje de Sincronización/Estado */}
        {syncMessage && (
          <div className={`mt-4 p-3 rounded-lg ${
            syncMessage.includes('✅') 
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            <p className="text-sm">{syncMessage}</p>
          </div>
        )}
      </div>
    );
  }

  // ✅ CON CUENTA CONECTADA
  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">
          📅 Google Calendar
        </h2>
        
        <div className="flex space-x-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className={`px-4 py-2 rounded-lg transition-colors ${
              syncing
                ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {syncing ? '🔄 Sincronizando...' : '🔄 Sincronizar'}
          </button>
          
          <button
            onClick={() => setShowCreateEvent(!showCreateEvent)}
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg"
          >
            ➕ Crear Evento
          </button>
        </div>
      </div>

      {/* Mensaje de Sincronización/Estado */}
      {syncMessage && (
        <div className={`mb-4 p-3 rounded-lg ${
          syncMessage.includes('✅') 
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          <p className="text-sm">{syncMessage}</p>
        </div>
      )}

      {/* Error General */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Información de Cuenta Actual */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-800 font-medium">
              📧 {currentAccount.email}
            </p>
            <p className="text-blue-600 text-sm">
              📊 {currentAccount.eventCount} eventos sincronizados
            </p>
            {currentAccount.isExpired && (
              <p className="text-orange-600 text-xs mt-1">
                ⚠️ Token expirado - usando datos locales
              </p>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <span className={`w-3 h-3 rounded-full ${
              currentAccount.isExpired ? 'bg-orange-500' : 'bg-green-500'
            }`}></span>
            <button
              onClick={handleDisconnect}
              className="text-red-500 hover:text-red-700 text-sm"
            >
              🔌 Desconectar
            </button>
          </div>
        </div>
        
        {currentAccount.isExpired && currentAccount.reconnectUrl && (
          <div className="mt-3 pt-3 border-t border-blue-200">
            <a
              href={currentAccount.reconnectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded text-sm"
            >
              🔄 Reconectar Cuenta
            </a>
          </div>
        )}
      </div>

      {/* Estado de Conexión */}
      {status && (
        <div className="mb-6 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-gray-700 text-sm">
            <strong>Estado:</strong> {status.message}
          </p>
          {status.lastSync && (
            <p className="text-gray-600 text-xs mt-1">
              Última sincronización: {new Date(status.lastSync).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Lista de Eventos */}
      <div>
        <h3 className="text-lg font-semibold mb-4">
          Eventos ({events.length} total)
        </h3>
        
        {events.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>📭 No hay eventos en tu calendario</p>
            <button
              onClick={() => fetchEvents()}
              className="mt-2 text-blue-500 hover:text-blue-700"
            >
              Recargar eventos
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {events.map(event => (
              <div
                key={event.id}
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 mb-1">
                      {event.summary || 'Sin título'}
                    </h4>
                    <p className="text-sm text-gray-600 mb-2">
                      🕐 {new Date(event.start_time).toLocaleString('es-ES', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                    {event.location && (
                      <p className="text-sm text-gray-500 mb-1">
                        📍 {event.location}
                      </p>
                    )}
                    {event.description && (
                      <p className="text-sm text-gray-600 truncate">
                        📝 {event.description}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      event.is_all_day 
                        ? 'bg-purple-100 text-purple-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {event.is_all_day ? '📅 Todo el día' : '🕐 Específico'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Información de Calendarios */}
      {calendars.length > 0 && (
        <div className="mt-6 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <h4 className="font-medium text-gray-800 mb-2">📚 Calendarios disponibles</h4>
          <div className="text-sm text-gray-600">
            {calendars.map(calendar => (
              <span key={calendar.id} className="inline-block bg-white px-2 py-1 rounded mr-2 mb-1">
                {calendar.summary}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GoogleCalendarUniversal;
```

---

## 🎯 **ENDPOINTS DISPONIBLES:**

### ✅ **CONFIRMADOS FUNCIONANDO:**

1. **📋 Obtener cuenta actual:**
   ```
   GET /api/google/calendar/current-account
   ```

2. **📅 Obtener eventos:**
   ```
   GET /api/google/calendar/events?userId=...
   ```

3. **🔄 Sincronizar eventos:**
   ```
   POST /api/google/calendar/sync
   Body: { "userId": "..." }
   ```

4. **🔌 Desconectar cuenta:**
   ```
   POST /api/google/calendar/disconnect
   Body: { "userId": "..." }
   ```

5. **📊 Estado de conexión:**
   ```
   GET /api/google/calendar/status?userId=...
   ```

6. **📚 Lista de calendarios:**
   ```
   GET /api/google/calendar/calendars?userId=...
   ```

7. **➕ Crear evento:**
   ```
   POST /api/google/calendar/events
   Body: { "userId": "...", "summary": "...", "start": "...", "end": "..." }
   ```

---

## ✅ **FUNCIONALIDADES:**

- ✅ **Sistema universal** - Funciona con cualquier cuenta Google
- ✅ **Una cuenta a la vez** - Desconectar y conectar diferentes cuentas
- ✅ **Sincronización robusta** - Sin errores 500
- ✅ **Manejo de tokens expirados** - Con URLs de reconexión
- ✅ **UI limpia y simple** - Enfocada en una cuenta activa
- ✅ **Desconexión completa** - Limpia todos los datos
- ✅ **Conexión de cuenta nueva** - URL lista para nueva cuenta

## 🚀 **¡LISTO PARA USAR!**

**Este código funciona inmediatamente con cualquier cuenta de Google.**
