const express = require("express");
const router = express.Router();

const googleCtrl = require("../controllers/googleCalendar.controller");
const calendarCtrl = require("../controllers/calendar.controller");
const auth = require("../../../middlewares/authMiddleware");
router.use(auth)
// ✅ MOBILE OAUTH CONNECTION
router.post("/connect", googleCtrl.connectGoogleAccount);

// ✅ STATUS
router.get("/status/:userId", googleCtrl.getStatus);

// ✅ DISCONNECT
router.post("/disconnect", googleCtrl.disconnect);

// ----------------------
// CALENDAR OPERATIONS
// ----------------------

router.post("/events", calendarCtrl.createEvent);
router.patch("/events/:userId/:eventId", calendarCtrl.updateEvent);
router.delete("/events/:userId/:eventId", calendarCtrl.deleteEvent);

module.exports = router;