// whatsappService.ts
// Define sessionsMap y asegúrate de que se exporte
export const sessionsMap = new Map();
// Lógica para actualizar sesionesMap, etc.
// Ejemplo de cómo podrías modificar las sesiones:
function createSession(userId) {
    sessionsMap.set(userId, { isReady: false });
}
// Puedes tener otras funciones que interactúan con sessionsMap
//# sourceMappingURL=whatsappUtils.js.map