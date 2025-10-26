import { startSession } from "../services/whatsappService";
export function configureSocket(io) {
  io.on('connection', (socket) => {
    console.log(`🧩 Socket conectado: ${socket.id}`);
  
    socket.on('join', async ({ userId }) => {
      if (!userId) {
        socket.emit('error-message', '❌ userId requerido');
        return;
      }
  
      console.log(`📡 [${userId}] Socket join`);
      socket.join(userId);
  
      try {
        await startSession(userId);
      } catch (err) {
        console.error(`❌ Error iniciando sesión para ${userId}:`, err.message);
        socket.emit('error-message', 'Error iniciando sesión');
      }
    });
  
    socket.on('disconnect', () => {
      console.log(`🔌 Socket desconectado: ${socket.id}`);
    });
  });
}