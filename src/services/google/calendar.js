const { google } = require('googleapis');
const { getAuthedClient } = require('./auth');

async function getCalendar(userId) {
  const auth = await getAuthedClient(userId);
  if (!auth) throw new Error('Google Calendar not connected. Connect your Google account in Settings.');
  return google.calendar({ version: 'v3', auth });
}

// List all calendars the user has access to
async function listCalendars(userId) {
  const calendar = await getCalendar(userId);
  const { data } = await calendar.calendarList.list({ minAccessRole: 'reader' });
  return (data.items || []).map(cal => ({
    id: cal.id,
    name: cal.summary,
    description: cal.description || '',
    primary: cal.primary || false,
    accessRole: cal.accessRole,
    backgroundColor: cal.backgroundColor,
  }));
}

// Fetch upcoming events from specified calendars
async function listUpcomingEvents(userId, { calendarIds, daysAhead, daysBehind } = {}) {
  const calendar = await getCalendar(userId);

  // Default: primary calendar only
  const cals = calendarIds?.length ? calendarIds : ['primary'];

  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setDate(timeMin.getDate() - (daysBehind || 14));
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + (daysAhead || 30));

  const allEvents = [];

  for (const calId of cals) {
    try {
      const { data } = await calendar.events.list({
        calendarId: calId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100,
      });

      (data.items || []).forEach(event => {
        // Skip all-day events without a clear meeting purpose
        const start = event.start?.dateTime || event.start?.date;
        const end = event.end?.dateTime || event.end?.date;
        if (!start) return;

        allEvents.push({
          external_id: event.id,
          calendar_id: calId,
          calendar_name: data.summary || calId,
          title: event.summary || '(No title)',
          start_date: start.split('T')[0],
          start_time: event.start?.dateTime ? start.split('T')[1]?.slice(0, 5) : '',
          end_time: event.end?.dateTime ? end.split('T')[1]?.slice(0, 5) : '',
          location: event.location || '',
          description: event.description || '',
          attendees: (event.attendees || []).filter(a => !a.self).map(a => ({
            email: a.email,
            name: a.displayName || '',
            status: a.responseStatus,
          })),
          htmlLink: event.htmlLink,
          status: event.status,
        });
      });
    } catch (e) {
      console.error(`[calendar] Error fetching calendar ${calId}:`, e.message);
    }
  }

  return allEvents.sort((a, b) => b.start_date.localeCompare(a.start_date));
}

// Full sync: fetch events and return them in the format expected by /api/networking/calendar-sync
async function syncEvents(userId, calendarIds) {
  const events = await listUpcomingEvents(userId, { calendarIds, daysAhead: 30, daysBehind: 14 });
  return events;
}

module.exports = { listCalendars, listUpcomingEvents, syncEvents };
