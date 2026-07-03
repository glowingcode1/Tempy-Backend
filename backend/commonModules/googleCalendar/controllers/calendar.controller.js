const { getCalendarClient } = require("../services/googleCalendar.service");

const { getCalendar } = require("../services/googleCalendar.service");

exports.createEvent = async (req, res) => {
  try {
    const { _id: userId } = req.user;
    const { title, description, startTime, endTime } = req.body;

    const calendar = await getCalendar(userId);

    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: title,
        description,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
      },
    });

    res.json({
      success: true,
      eventId: event.data.id,
      link: event.data.htmlLink,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Event creation failed" });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const { userId, eventId } = req.params;

    const { title, description, startTime, endTime } = req.body;

    const calendar = await getCalendarClient(userId);

    const response = await calendar.events.update({
      calendarId: "primary",
      eventId,
      requestBody: {
        summary: title,
        description,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
      },
    });

    res.json({ success: true, data: response.data });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { userId, eventId } = req.params;

    const calendar = await getCalendarClient(userId);

    await calendar.events.delete({
      calendarId: "primary",
      eventId,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
};

