// services/calendarService.ts
import pool from '../config/db.js';

export const insertEvent = async (userId, event) => {
    const { event_date, start_time, end_time, title } = event;
    const result = await pool.query(`INSERT INTO calendar_events
     (user_id, event_date, start_time, end_time, title)
     VALUES ($1::uuid, $2, $3, $4, $5)
     RETURNING *`, [userId, event_date, start_time, end_time, title]);
    return result.rows[0];
};

export const getEventsByUser = async (userId) => {
    const result = await pool.query(`SELECT * FROM calendar_events
     WHERE user_id = $1::uuid
     ORDER BY event_date, start_time`, [userId]);
    return result.rows;
};

export const deleteEventById = async (userId, eventId) => {
    await pool.query(`DELETE FROM calendar_events
     WHERE id = $1 AND user_id = $2::uuid`, [eventId, userId]);
};
//# sourceMappingURL=calendarService.js.map