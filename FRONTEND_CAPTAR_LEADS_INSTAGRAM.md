# 📋 Frontend: Botón "Captar Leads" de Instagram

## 🎯 **Objetivo**

Cuando el usuario hace clic en "Captar Leads", debe poder:
1. **Buscar una cuenta de Instagram** por username
2. **Ver información de la cuenta** (seguidores, nombre, etc.)
3. **Extraer los seguidores** de esa cuenta
4. **Guardarlos como leads** para enviarles mensajes

---

## 🔧 **Flujo Completo del Frontend**

### **Paso 1: Botón "Captar Leads"**

```tsx
// Botón que abre el modal de búsqueda
<button onClick={() => setShowCaptarLeadsModal(true)}>
  📥 Captar Leads
</button>
```

---

### **Paso 2: Modal de Búsqueda**

El modal debe tener:

```tsx
const [searchQuery, setSearchQuery] = useState('');
const [searchResults, setSearchResults] = useState(null);
const [loading, setLoading] = useState(false);

// Modal de búsqueda
<Modal show={showCaptarLeadsModal} onClose={() => setShowCaptarLeadsModal(false)}>
  <h2>🔍 Buscar Cuenta de Instagram</h2>
  
  <input
    type="text"
    placeholder="Escribe el username de Instagram..."
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
  />
  
  <button onClick={handleSearchAccount}>
    Buscar Cuenta
  </button>
  
  {searchResults && (
    <AccountCard 
      account={searchResults} 
      onExtractFollowers={handleExtractFollowers}
    />
  )}
</Modal>
```

---

### **Paso 3: Función de Búsqueda**

```tsx
const handleSearchAccount = async () => {
  if (!searchQuery.trim()) {
    toast.error('Escribe un username de Instagram');
    return;
  }
  
  setLoading(true);
  
  try {
    // Endpoint de búsqueda
    const response = await fetch(
      `${API_URL}/api/instagram/search?query=${searchQuery}&limit=1`
    );
    
    const data = await response.json();
    
    if (data.success && data.data && data.data.length > 0) {
      setSearchResults(data.data[0]); // Primer resultado
      toast.success(`Cuenta encontrada: @${data.data[0].username}`);
    } else {
      toast.error('Cuenta no encontrada. Verifica el username.');
      setSearchResults(null);
    }
  } catch (error) {
    toast.error('Error buscando cuenta: ' + error.message);
  } finally {
    setLoading(false);
  }
};
```

---

### **Paso 4: Mostrar Información de la Cuenta**

```tsx
const AccountCard = ({ account, onExtractFollowers }) => {
  return (
    <div className="account-card">
      <img 
        src={account.profile_pic_url} 
        alt={account.username}
        className="profile-pic"
      />
      
      <div className="account-info">
        <h3>@{account.username}</h3>
        <p>{account.full_name}</p>
        
        <div className="stats">
          <span>👥 {account.follower_count || 'N/A'} seguidores</span>
          <span>📸 {account.media_count || 'N/A'} posts</span>
          {account.is_verified && <span>✅ Verificado</span>}
          {account.is_private && <span>🔒 Privada</span>}
        </div>
        
        {account.biography && (
          <p className="bio">{account.biography}</p>
        )}
      </div>
      
      <button 
        onClick={() => onExtractFollowers(account.username)}
        disabled={account.is_private}
        className="btn-extract"
      >
        {account.is_private 
          ? '🔒 Cuenta Privada' 
          : '📥 Extraer Seguidores'}
      </button>
    </div>
  );
};
```

---

### **Paso 5: Extraer Seguidores**

```tsx
const [extracting, setExtracting] = useState(false);
const [extractedLeads, setExtractedLeads] = useState([]);

const handleExtractFollowers = async (username) => {
  setExtracting(true);
  
  try {
    toast.info(`Extrayendo seguidores de @${username}...`);
    
    // Endpoint de extracción de seguidores
    const response = await fetch(
      `${API_URL}/api/instagram/followers?username=${username}&limit=500`
    );
    
    const data = await response.json();
    
    if (data.success && data.followers) {
      setExtractedLeads(data.followers);
      
      toast.success(
        `✅ ${data.count} seguidores extraídos de @${username}`
      );
      
      // Mostrar modal de leads extraídos
      setShowLeadsModal(true);
    } else {
      toast.error(data.error || 'Error extrayendo seguidores');
    }
  } catch (error) {
    toast.error('Error: ' + error.message);
  } finally {
    setExtracting(false);
  }
};
```

---

### **Paso 6: Modal de Leads Extraídos**

```tsx
<Modal show={showLeadsModal} onClose={() => setShowLeadsModal(false)}>
  <h2>📋 Leads Extraídos ({extractedLeads.length})</h2>
  
  <div className="leads-list">
    {extractedLeads.map((lead, index) => (
      <div key={index} className="lead-item">
        <img src={lead.profile_pic_url} alt={lead.username} />
        <div>
          <strong>@{lead.username}</strong>
          <p>{lead.full_name}</p>
        </div>
        <input 
          type="checkbox" 
          checked={selectedLeads.includes(lead.username)}
          onChange={() => toggleLead(lead.username)}
        />
      </div>
    ))}
  </div>
  
  <div className="actions">
    <button onClick={selectAll}>
      Seleccionar Todos
    </button>
    
    <button onClick={handleSendBulkMessages}>
      📤 Enviar Mensaje a Seleccionados ({selectedLeads.length})
    </button>
    
    <button onClick={handleImportLeads}>
      💾 Guardar como Leads
    </button>
  </div>
</Modal>
```

---

### **Paso 7: Enviar Mensajes Masivos**

```tsx
const [message, setMessage] = useState('');
const [selectedLeads, setSelectedLeads] = useState([]);

const handleSendBulkMessages = async () => {
  if (!message.trim()) {
    toast.error('Escribe un mensaje');
    return;
  }
  
  if (selectedLeads.length === 0) {
    toast.error('Selecciona al menos un lead');
    return;
  }
  
  try {
    toast.info(`Enviando mensajes a ${selectedLeads.length} usuarios...`);
    
    const response = await fetch(`${API_URL}/api/instagram/bulk-send-list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernames: selectedLeads,
        message: message,
        delay: 3000 // 3 segundos entre mensajes
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      toast.success(
        `✅ ${data.sent_count} mensajes enviados, ${data.failed_count} fallidos`
      );
    } else {
      toast.error('Error enviando mensajes');
    }
  } catch (error) {
    toast.error('Error: ' + error.message);
  }
};
```

---

### **Paso 8: Guardar Leads**

```tsx
const handleImportLeads = async () => {
  try {
    const response = await fetch(`${API_URL}/api/instagram/import-leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernames: extractedLeads.map(lead => lead.username),
        source: 'instagram_followers'
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      toast.success(`✅ ${data.count} leads guardados`);
    }
  } catch (error) {
    toast.error('Error guardando leads');
  }
};
```

---

## 📡 **Endpoints del Backend**

### **1. Buscar Cuenta**
```
GET /api/instagram/search?query=USERNAME&limit=1
```

**Response:**
```json
{
  "success": true,
  "data": [{
    "username": "alexshowve",
    "full_name": "AlexShow La Demencia",
    "profile_pic_url": "https://...",
    "follower_count": 142000,
    "is_verified": false,
    "is_private": false,
    "biography": "Artista..."
  }]
}
```

### **2. Extraer Seguidores**
```
GET /api/instagram/followers?username=USERNAME&limit=500
```

**Response:**
```json
{
  "success": true,
  "count": 466,
  "followers": [
    {
      "username": "user1",
      "full_name": "User One",
      "profile_pic_url": "https://...",
      "follower_count": 1000,
      "is_verified": false,
      "is_private": false
    }
  ]
}
```

### **3. Enviar Mensajes Masivos**
```
POST /api/instagram/bulk-send-list
```

**Body:**
```json
{
  "usernames": ["user1", "user2", "user3"],
  "message": "Hola! 👋",
  "delay": 3000
}
```

**Response:**
```json
{
  "success": true,
  "sent_count": 2,
  "failed_count": 1,
  "results": [...]
}
```

### **4. Importar Leads**
```
POST /api/instagram/import-leads
```

**Body:**
```json
{
  "usernames": ["user1", "user2"],
  "source": "instagram_followers"
}
```

---

## 🎨 **Estilos Recomendados**

```css
.account-card {
  display: flex;
  gap: 16px;
  padding: 20px;
  border: 1px solid #e1e8ed;
  border-radius: 12px;
  margin-top: 16px;
}

.profile-pic {
  width: 80px;
  height: 80px;
  border-radius: 50%;
}

.account-info {
  flex: 1;
}

.stats {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  color: #657786;
}

.lead-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid #e1e8ed;
}

.lead-item img {
  width: 40px;
  height: 40px;
  border-radius: 50%;
}

.btn-extract {
  background: #1DA1F2;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
}

.btn-extract:disabled {
  background: #ccc;
  cursor: not-allowed;
}
```

---

## ✅ **Checklist de Implementación**

- [ ] Botón "Captar Leads" en la interfaz
- [ ] Modal de búsqueda con input
- [ ] Llamada al endpoint de búsqueda
- [ ] Mostrar información de la cuenta encontrada
- [ ] Botón para extraer seguidores
- [ ] Modal con lista de seguidores extraídos
- [ ] Checkboxes para seleccionar leads
- [ ] Input para escribir mensaje
- [ ] Botón de envío masivo
- [ ] Botón de guardar leads
- [ ] Manejo de errores y loading states
- [ ] Toasts/notificaciones de éxito/error

---

## 🚀 **Ejemplo Completo de Flujo**

1. Usuario hace clic en **"Captar Leads"**
2. Se abre modal con input de búsqueda
3. Usuario escribe **"alexshowve"**
4. Click en **"Buscar"**
5. Se muestra la cuenta con foto, nombre, seguidores
6. Usuario hace clic en **"Extraer Seguidores"**
7. Loading... (puede tardar 1-2 minutos)
8. Se muestra lista de 466 seguidores
9. Usuario selecciona todos o algunos
10. Escribe mensaje: **"Hola! 👋"**
11. Click en **"Enviar Mensajes"**
12. Se envían con delay de 3 segundos entre cada uno
13. Notificación: **"✅ 450 enviados, 16 fallidos"**

---

## 📝 **Notas Importantes**

- **Cuentas privadas**: No se pueden extraer seguidores
- **Límite**: Máximo 500 seguidores por extracción
- **Delay**: Mínimo 2-3 segundos entre mensajes para evitar bloqueos
- **Rate limit**: Instagram puede limitar si envías demasiados mensajes
- **Verificación**: La primera vez que uses una cuenta nueva, puede pedir verificación

---

## 🎯 **Resultado Final**

El usuario podrá:
- ✅ Buscar cualquier cuenta de Instagram
- ✅ Ver información completa de la cuenta
- ✅ Extraer hasta 500 seguidores
- ✅ Seleccionar cuáles contactar
- ✅ Enviar mensajes masivos personalizados
- ✅ Guardar leads para futuras campañas

