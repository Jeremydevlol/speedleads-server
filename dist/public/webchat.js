(async function () {
  const currentScript = document.currentScript;
  const projectId = currentScript.getAttribute('data-project-id');
  const backendUrl = currentScript.getAttribute('data-backend-url') || window.location.origin;

  if (!projectId) {
    console.error('⚠️ webchat.js: falta el atributo data-project-id');
    return;
  }

  let cfg = {};
  try {
    const res = await fetch(`${backendUrl}/api/webchat-config/${projectId}`);
    if (!res.ok) throw new Error(`No se pudo cargar la configuración del chat para projectId: ${projectId}`);
    cfg = await res.json();
    console.log('Webchat config cargada desde BD:', cfg);
  } catch (err) {
    console.error('❌ Error al cargar configuración del chat:', err);
    return;
  }

  // Generar un ID aleatorio y guardarlo en sessionStorage
  function generateRandomId() {
    return 'xxxxxx'.replace(/[x]/g, function () {
      return (Math.random() * 16 | 0).toString(16);
    });
  }

  function setRandomId() {
    let sessionId = sessionStorage.getItem('chat-session-id');
    if (!sessionId) {
      sessionId = generateRandomId();
      sessionStorage.setItem('chat-session-id', sessionId);
    } else {
      sessionId = generateRandomId();
      sessionStorage.setItem('chat-session-id', sessionId);
    }
    console.log("Session ID:", sessionId);
  }

  setRandomId();

  // Detectar dispositivo móvil
  function esDispositivoMovil() {
    const userAgent = navigator.userAgent.toLowerCase();
    return /iphone|ipod|ipad|android|blackberry|windows phone/.test(userAgent);
  }

  // Renderizar avatar
  function renderAvatar(author) {
    if (author === cfg.bot_name && cfg.avatar_url) {
      return `<img src="${cfg.avatar_url}" alt="Avatar"
                   class="webchat-avatar" 
                   style="width:48px;height:48px;border-radius:50%;
                          margin-right:8px;vertical-align:middle;
                          object-fit:cover;border: 2px solid #ffffff;
                          box-shadow: 0 2px 4px rgba(0,0,0,0.1);">`;
    }
    return '';
  }

  // ================ ELEMENTOS PRINCIPALES ================ //

  // Botón toggle flotante
  const toggleButton = document.createElement('button');
  toggleButton.id = 'webchat-toggle';
  toggleButton.className = 'webchat-floating-btn';
  Object.assign(toggleButton.style, {
    backgroundImage: cfg.avatar_url ? `url(${cfg.avatar_url})` : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    border: 'none',
    borderRadius: '50%',
    width: '70px',
    height: '70px',
    cursor: 'pointer',
    zIndex: '9998',
    position: 'fixed',
    bottom: '25px',
    right: '25px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    transition: 'all 0.3s ease',
    transform: 'scale(1)'
  });

  toggleButton.addEventListener('mouseenter', () => {
    toggleButton.style.transform = 'scale(1.1)';
    toggleButton.style.boxShadow = '0 6px 25px rgba(0,0,0,0.2)';
  });

  toggleButton.addEventListener('mouseleave', () => {
    toggleButton.style.transform = 'scale(1)';
    toggleButton.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
  });

  document.body.appendChild(toggleButton);

  // Botón de cerrar
  const closeButton = document.createElement('button');
  closeButton.className = 'webchat-close-btn';
  closeButton.innerHTML = '&times;';
  Object.assign(closeButton.style, {
    position: 'absolute',
    top: '15px',
    right: '15px',
    background: 'rgba(255,255,255,0.2)',
    border: 'none',
    color: '#fff',
    fontSize: '24px',
    cursor: 'pointer',
    zIndex: '10000',
    display: 'none',
    padding: '5px 10px',
    borderRadius: '50%',
    lineHeight: '1',
    fontWeight: 'bold',
    transition: 'all 0.2s ease'
  });

  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.background = 'rgba(255,255,255,0.3)';
    closeButton.style.transform = 'rotate(90deg)';
  });

  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.background = 'rgba(255,255,255,0.2)';
    closeButton.style.transform = 'rotate(0deg)';
  });

  // Contenedor principal del chat
  const chatContainer = document.createElement('div');
  chatContainer.id = 'webchat-container';
  chatContainer.className = 'webchat-main-container';
  Object.assign(chatContainer.style, {
    position: 'fixed',
    bottom: '120px',
    right: '25px',
    width: '420px', // Ajusté el ancho a 420px, un poco más ancho
    height: '70vh', // Mantenemos la altura al 70% de la pantalla
    fontFamily: cfg.font_family || "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    color: '#333',
    backgroundColor: '#ffffff',
    boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
    display: 'none',
    flexDirection: 'column',
    zIndex: '9999',
    overflow: 'hidden',
    border: 'none',
    boxSizing: 'border-box',
    borderRadius: '16px',
    transition: 'all 0.3s ease-out'
  });

  // Función para deshabilitar zoom en móviles
  function disableZoomOnMobile() {
    if (!document.querySelector('meta[name="viewport"]')) {
      const meta = document.createElement('meta');
      meta.name = "viewport";
      meta.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
      document.head.appendChild(meta);
    } else {
      const meta = document.querySelector('meta[name="viewport"]');
      meta.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
    }
  }

  if (esDispositivoMovil()) {
    disableZoomOnMobile();
  }

  // Aplicar estilo responsivo
  function applyContainerStyle() {
    if (esDispositivoMovil()) {
      Object.assign(chatContainer.style, {
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        width: '100vw', // En dispositivos móviles, el chat ocupa el 100% del ancho
        height: '100vh', // En dispositivos móviles, ocupa el 100% de la altura
        borderRadius: '0',
        position: 'fixed',
        zIndex: '9999'
      });

      if (chatContainer.style.display === 'flex') {
        toggleButton.style.display = 'none';
        closeButton.style.display = 'block';
      } else {
        toggleButton.style.display = 'block';
        closeButton.style.display = 'none';
      }
    } else {
      Object.assign(chatContainer.style, {
        bottom: '120px',
        right: '25px',
        width: '420px', // Ancho ajustado a 420px
        height: '70vh', // Mantiene la altura al 70% en pantallas grandes
        borderRadius: cfg.message_style === 'bubble' ? '25px' : '16px'
      });
    }
  }

  applyContainerStyle();
  window.addEventListener('resize', applyContainerStyle);

  document.body.appendChild(chatContainer);
  chatContainer.appendChild(closeButton);

  // Cabecera del chat
  const header = document.createElement('div');
  header.className = 'webchat-header';
  Object.assign(header.style, {
    backgroundColor: cfg.theme_color || '#4f46e5',
    padding: '16px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    color: '#fff',
    borderTopLeftRadius: '16px',
    borderTopRightRadius: '16px',
    position: 'relative',
    zIndex: '2',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
  });

  header.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      ${cfg.avatar_url ? `
        <div style="position:relative;">
          <img src="${cfg.avatar_url}" 
               style="width:48px;height:48px;border-radius:50%;
                      object-fit:cover;border: 2px solid rgba(255,255,255,0.3);
                      box-shadow: 0 2px 8px rgba(0,0,0,0.1);"/>
          <span style="position:absolute;bottom:-2px;right:-2px;
                      width:12px;height:12px;border-radius:50%;
                      background:#10b981;border:2px solid #fff;"></span>
        </div>
      ` : ''}  
      <div style="display:flex;flex-direction:column;line-height:1.2">
        <span style="font-weight:600;font-size:18px;letter-spacing:0.5px;">${cfg.bot_name || 'Asistente'}</span>
        <span style="display:flex;align-items:center;font-size:13px;opacity:0.9;">
          <span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;margin-right:6px;"></span>
          En línea
        </span>
      </div>
    </div>
  `;
  chatContainer.appendChild(header);

  // Área de mensajes
  const messagesDiv = document.createElement('div');
  messagesDiv.id = 'webchat-messages';
  messagesDiv.className = 'webchat-messages-container';
  Object.assign(messagesDiv.style, {
    flex: '1',
    padding: '20px',
    overflowY: 'auto',
    background: '#f9fafb',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxSizing: 'border-box',
    position: 'relative',
    zIndex: '1',
    overflowX: 'hidden',
    wordWrap: 'break-word',
    whiteSpace: 'normal',
    maxHeight: 'none',
    scrollbarWidth: 'thin',
    scrollbarColor: `${cfg.theme_color || '#4f46e5'} #f1f1f1`,
    paddingTop: '-100px', // Margen superior de 100px
    paddingBottom: '100px', // Margen inferior de 100px
  });

  // Estilo personalizado para scrollbar
  const scrollbarStyle = document.createElement('style');
  scrollbarStyle.innerHTML = `
    #webchat-messages::-webkit-scrollbar {
      width: 6px;
    }
    #webchat-messages::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 10px;
    }
    #webchat-messages::-webkit-scrollbar-thumb {
      background: ${cfg.theme_color || '#4f46e5'};
      border-radius: 10px;
    }
    #webchat-messages::-webkit-scrollbar-thumb:hover {
      background: ${cfg.theme_color ? `${cfg.theme_color}cc` : '#3f38b5'};
    }
  `;
  document.head.appendChild(scrollbarStyle);

  chatContainer.appendChild(messagesDiv);

  // Barra de entrada
  const inputBar = document.createElement('div');
  inputBar.className = 'webchat-input-container';
  Object.assign(inputBar.style, {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    margin: '0px',
    marginBottom: '30px',
    gap: '10px',
    border: `1px solid ${cfg.theme_color ? `${cfg.theme_color}40` : '#e5e7eb'}`,
    borderRadius: '30px',
    backgroundColor: '#fff',
    position: 'absolute',
    bottom: '15px',
    left: '15px',
    right: '15px',
    zIndex: '10',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    transition: 'all 0.2s ease'
  });

  inputBar.addEventListener('mouseenter', () => {
    inputBar.style.boxShadow = `0 2px 12px ${cfg.theme_color ? `${cfg.theme_color}20` : 'rgba(79, 70, 229, 0.1)'}`;
    inputBar.style.borderColor = cfg.theme_color ? `${cfg.theme_color}80` : '#d1d5db';
  });

  inputBar.addEventListener('mouseleave', () => {
    inputBar.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
    inputBar.style.borderColor = cfg.theme_color ? `${cfg.theme_color}40` : '#e5e7eb';
  });

  let inputHtml = `
    <input id="webchat-input" type="text" placeholder="${cfg.placeholder || 'Escribe tu mensaje...'}"
           class="webchat-input-field"
           style="flex:1;border:none;outline:none;background:transparent;
                  padding:10px;font-size:15px;color:#333;margin:0px;
                  font-family:inherit;"/>
    <button id="webchat-send" class="webchat-send-btn"
            style="width:40px;height:40px;border:none;border-radius:50%;
                   background:${cfg.theme_color || '#4f46e5'};display:flex;
                   align-items:center;justify-content:center;cursor:pointer;
                   transition:all 0.2s ease;">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
    </button>
  `;

  if (cfg.file_upload) {
    inputHtml = `
      <button id="webchat-attach" class="webchat-attach-btn"
              style="width:40px;height:40px;border:none;border-radius:50%;
                     background:transparent;display:flex;align-items:center;
                     justify-content:center;cursor:pointer;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${cfg.theme_color || '#4f46e5'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
        </svg>
      </button>
      ${inputHtml}
    `;
  }

  inputBar.innerHTML = inputHtml;
  chatContainer.appendChild(inputBar);

  // Footer (Powered by Uniclick)
  const footer = document.createElement('div');
  footer.className = 'webchat-footer';
  Object.assign(footer.style, {
    textAlign: 'center',
    fontSize: '12px',
    color: '#9ca3af',
    padding: '8px',
    fontFamily: 'inherit',
    position: 'absolute',
    bottom: '0',
    left: '0',
    right: '0',
    zIndex: '2',
    background: 'rgba(255,255,255,0.7)',
    backdropFilter: 'blur(5px)'
  });
  footer.innerHTML = `
    <span>Powered by </span>
    <a href="https://uniclick.io" target="_blank" 
       style="color:${cfg.theme_color || '#4f46e5'};text-decoration:none;font-weight:500;">
       uniclick.io
    </a>
  `;
  chatContainer.appendChild(footer);

  // Evento para cerrar el chat
  closeButton.addEventListener('click', () => {
    window.UniclickWebchat.close();
    toggleButton.style.display = 'block';
  });

  // ================ FUNCIONALIDADES DEL CHAT ================ //

  // Obtener hora actual formateada
  function getCurrentTime() {
    const date = new Date();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // Añadir mensaje al chat
  function appendMessage(author, text) {
    const bubble = document.createElement('div');
    const isBot = author === (cfg.bot_name || 'Bot');
    const userBg = cfg.theme_color || '#4f46e5';

    const commonStyles = {
      marginBottom: '12px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '10px',
      padding: '12px 16px',
      color: isBot ? '#111827' : '#fff',
      borderRadius: '18px',
      wordWrap: 'break-word',
      whiteSpace: 'pre-wrap',
      maxWidth: '85%',
      minWidth: '120px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
      lineHeight: '1.4',
      fontSize: '15px'
    };

    let bubbleStyle = {};
    if (isBot) {
      const botBg = cfg.message_style === 'minimal' ? '#fff' : '#f3f4f6';
      bubbleStyle = {
        background: botBg,
        border: cfg.message_style === 'minimal' ? '1px solid #e5e7eb' : 'none',
        alignSelf: 'flex-start',
        marginRight: 'auto'
      };
    } else {
      bubbleStyle = {
        background: userBg,
        alignSelf: 'flex-end',
        marginLeft: 'auto',
        color: '#fff'
      };
    }

    // Ajustar bordes según el estilo
    if (cfg.message_style === 'minimal') {
      bubbleStyle.borderRadius = '8px';
    } else if (cfg.message_style === 'bubble') {
      bubbleStyle.borderRadius = '24px';
    } else if (cfg.message_style === 'flat') {
      bubbleStyle.borderRadius = '12px';
    }

    Object.assign(bubble.style, commonStyles, bubbleStyle);
    bubble.innerHTML = `${renderAvatar(author)}<span style="flex:1;">${text}</span>`;

    // Añadir hora del mensaje
    const timeElem = document.createElement('div');
    timeElem.style.fontSize = '11px',
      timeElem.style.color = isBot ? '#6b7280' : 'rgba(255,255,255,0.7)',
      timeElem.style.marginTop = '6px',
      timeElem.style.textAlign = isBot ? 'left' : 'right',
      timeElem.style.paddingLeft = isBot ? '0' : '10px',
      timeElem.style.paddingRight = isBot ? '10px' : '0',
      timeElem.innerText = getCurrentTime();

    bubble.appendChild(timeElem);
    messagesDiv.appendChild(bubble);

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // Mostrar mensaje de bienvenida
  let welcomeMessageSent = false;
  function showWelcomeMessage() {
    if (cfg.welcome_message && !welcomeMessageSent) {
      appendMessage(cfg.bot_name || 'ChatBot', cfg.welcome_message);
      welcomeMessageSent = true;
    }
  }

  // Enviar mensaje al backend
  async function sendMessage() {
    const inputEl = document.querySelector('#webchat-input');
    const text = inputEl.value.trim();
    if (!text) return;

    appendMessage('Tú', text);
    inputEl.value = '';

    const currentLang = localStorage.getItem("i18nextLng") || "es";
    const isEnglish = currentLang === "en";

    const keywordsEs = [
      "llévame a", "llevame a", "llévale a", "llevanos a",
      "navega a", "ir a", "quiero ir a", "vamos a",
      "accede a", "redirige a", "muéstrame", "abre",
      "cámbiame a", "guiame a", "dirígeme a", "ver",
      "mostrar", "mostrarme", "enséñame", "llevar a",
      "entrar a", "ver sección", "ver la sección", "ver página",
      "página de", "sección de", "me gustaría ver", "puedo ver",
      "deseo ir a", "veré", "mándame a", "diríjeme a",
      "reenvíame a", "cambiar a", "quiero acceder a", "acceder a"
    ];

    const keywordsEn = [
      "take me to", "go to", "navigate to", "i want to go to",
      "show me", "bring me to", "let me see", "redirect to",
      "open", "access", "lead me to", "send me to",
      "guide me to", "switch to", "move to", "take us to",
      "can i go to", "please go to", "open the", "open section",
      "i’d like to go to", "show section", "jump to", "forward to",
      "let’s go to", "navigate me to", "bring up", "i’d like to see",
      "can you show me", "visit", "go visit", "access the"
    ];

    const routes = [
      { keyword: "integraciones", target: "/integraciones" },
      { keyword: "integrations", target: "/integraciones" },
      { keyword: "estadisticas", target: "/estadisticas" },
      { keyword: "statistics", target: "/estadisticas" },
      { keyword: "analytics", target: "/estadisticas" },
      { keyword: "ajustes", target: "/profile-settings" },
      { keyword: "configuración", target: "/profile-settings" },
      { keyword: "settings", target: "/profile-settings" },
      { keyword: "preferences", target: "/profile-settings" },
      { keyword: "leads", target: "/leads" },
      { keyword: "clientes potenciales", target: "/leads" },
      { keyword: "prospects", target: "/leads" },
      { keyword: "chats", target: "/chats" },
      { keyword: "mensajes", target: "/chats" },
      { keyword: "messages", target: "/chats" },
      { keyword: "conversations", target: "/chats" },
      { keyword: "calendario", target: "/calls" },
      { keyword: "calendar", target: "/calls" },
      { keyword: "calls", target: "/calls" },
      { keyword: "meetings", target: "/calls" },
      { keyword: "afiliados", target: "/afiliados" },
      { keyword: "affiliates", target: "/afiliados" },
      { keyword: "affiliate program", target: "/afiliados" },
      { keyword: "personalidades", target: "/personality" },
      { keyword: "personality", target: "/personality" },
      { keyword: "voice", target: "/personality" },
      { keyword: "ai voice", target: "/personality" },
      { keyword: "tutoriales", target: "/tutorials" },
      { keyword: "tutorials", target: "/tutorials" },
      { keyword: "help", target: "/tutorials" },
      { keyword: "guides", target: "/tutorials" }
    ];

    const keywords = isEnglish ? keywordsEn : keywordsEs;
    const lowered = text.toLowerCase();

    const triggerMatch = keywords.some(k => lowered.includes(k));
    if (triggerMatch) {
      const routeMatch = routes.find(r => {
        return keywords.some(k => lowered.includes(k) && lowered.includes(r.keyword));
      });
      if (routeMatch) {
        const feedbackMessage = isEnglish
          ? `Great, taking you to ${routeMatch.keyword}.`
          : `Perfecto, llevándote a ${routeMatch.keyword}.`;

        appendMessage(cfg.bot_name || 'Bot', feedbackMessage);

        setTimeout(() => {
          window.postMessage({
            type: "navigate",
            target: routeMatch.target
          }, "*");
        }, 1200);

        return;
      }
    }

    let typingElem;
    if (cfg.typing_indicator) {
      typingElem = document.createElement('div');
      typingElem.className = 'typing-indicator';
      typingElem.style.alignSelf = 'flex-start';
      typingElem.style.marginBottom = '12px';
      typingElem.innerHTML = `
      <div style="display:flex;gap:4px;background:#f3f4f6;
                  padding:12px 16px;border-radius:18px;">
        <span class="dot" style="background:#9ca3af;"></span>
        <span class="dot" style="background:#9ca3af;"></span>
        <span class="dot" style="background:#9ca3af;"></span>
      </div>
    `;
      messagesDiv.appendChild(typingElem);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    const chatSessionId = sessionStorage.getItem('chat-session-id');

    try {
      const resp = await fetch(`${backendUrl}/api/webchat-config/chat-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          message: text,
          chatSessionId
        })
      });

      const data = await resp.json();
      if (typingElem) typingElem.remove();

      if (data.type === 'navigate' && data.target) {
        appendMessage(cfg.bot_name || 'Bot', data.message || cfg.offline_message || '');
        setTimeout(() => {
          window.postMessage({
            type: 'navigate',
            target: data.target
          }, '*');
        }, 1200);
        return;
      }

      appendMessage(cfg.bot_name || 'Bot', data.message || cfg.offline_message || '');

    } catch (err) {
      console.error('Error envío mensaje:', err);
      if (typingElem) typingElem.remove();
      appendMessage('Sistema', cfg.offline_message || 'Error al enviar tu mensaje.');
    }
  }

  // API pública para abrir/cerrar el chat
  window.UniclickWebchat = {
    open: () => {
      chatContainer.style.display = 'flex';
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
      showWelcomeMessage();
      applyContainerStyle();
      document.querySelector('#webchat-input').focus();

      // Animación de entrada
      chatContainer.style.opacity = '0';
      chatContainer.style.transform = 'translateY(20px)';
      setTimeout(() => {
        chatContainer.style.opacity = '1';
        chatContainer.style.transform = 'translateY(0)';
      }, 10);
    },
    close: () => {
      // Animación de salida
      chatContainer.style.opacity = '0';
      chatContainer.style.transform = 'translateY(20px)';
      setTimeout(() => {
        chatContainer.style.display = 'none';
      }, 200);
    }
  };

  // Eventos del botón toggle
  toggleButton.addEventListener('click', () => {
    if (chatContainer.style.display === 'none' || !chatContainer.style.display) {
      window.UniclickWebchat.open();
    } else {
      window.UniclickWebchat.close();
    }
  });

  // Eventos para enviar mensaje
  const inputEl = document.querySelector('#webchat-input');
  const sendBtn = document.querySelector('#webchat-send');

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
  });

  sendBtn.addEventListener('click', sendMessage);

  // Efecto hover para el botón de enviar
  sendBtn.addEventListener('mouseenter', () => {
    sendBtn.style.transform = 'scale(1.1)';
    sendBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
  });

  sendBtn.addEventListener('mouseleave', () => {
    sendBtn.style.transform = 'scale(1)';
    sendBtn.style.boxShadow = 'none';
  });

  // Estilos para el indicador de "typing"
  const style = document.createElement('style');
  style.innerHTML = `
    .typing-indicator {
      display: flex;
      gap: 5px;
      align-items: center;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      opacity: 0.6;
      animation: bounce 1.2s infinite ease-in-out;
    }

    .dot:nth-child(1) {
      animation-delay: 0.1s;
    }

    .dot:nth-child(2) {
      animation-delay: 0.2s;
    }

    .dot:nth-child(3) {
      animation-delay: 0.3s;
    }

    @keyframes bounce {
      0%, 100% {
        transform: translateY(0);
        opacity: 0.6;
      }
      50% {
        transform: translateY(-5px);
        opacity: 1;
      }
    }

    .webchat-input-field:focus {
      outline: none;
    }

    .webchat-send-btn:hover {
      transform: scale(1.1) !important;
    }

    .webchat-send-btn svg {
      stroke: white;
      transition: all 0.2s ease;
    }

    .webchat-send-btn:hover svg {
      transform: translateX(2px);
    }
  `;
  document.head.appendChild(style);

  // Manejo del teclado en móviles
  let initialViewportHeight = window.innerHeight;
  window.addEventListener('resize', () => {
    if (!esDispositivoMovil()) return;

    const currentViewportHeight = window.innerHeight;
    const keyboardVisible = currentViewportHeight < initialViewportHeight;

    if (keyboardVisible) {
      messagesDiv.style.maxHeight = `calc(100vh - ${initialViewportHeight - currentViewportHeight + 200}px)`;
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } else {
      messagesDiv.style.maxHeight = 'none';
    }
  });
})();
