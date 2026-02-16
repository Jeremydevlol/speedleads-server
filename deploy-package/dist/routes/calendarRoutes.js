import calendarController from '../controllers/calendarController.js';
import { validateJwt } from '../config/jwt.js';
import { Router } from 'express';
const router = Router();

router.post('/bulk',validateJwt, calendarController.bulkInsertEvents);
router.get('/',validateJwt, calendarController.getEvents);

router.delete('/:eventId',validateJwt, calendarController.deleteEvent);
router.post('/saveCalendarToken', validateJwt, calendarController.saveGoogleCalendarToken);
router.post('/code', validateJwt, calendarController.saveGoogleCalendarCode);
router.get('/check', validateJwt, calendarController.checkGoogleCalendarConnection);
router.get('/token', validateJwt, calendarController.getRefreshedAccessToken);

router.post('/google',  validateJwt, calendarController.postGoogleEvent)
router.get('/google',   validateJwt, calendarController.getGoogleEvents)
export default router;
//# sourceMappingURL=calendarRoutes.js.map