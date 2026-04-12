import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';

const EVENT_TYPES = {
  coffee_chat: { label: 'Coffee Chat', color: 'bg-amber-100 text-amber-700' },
  conference: { label: 'Conference', color: 'bg-blue-100 text-blue-700' },
  meetup: { label: 'Meetup', color: 'bg-green-100 text-green-700' },
  informational: { label: 'Informational', color: 'bg-purple-100 text-purple-700' },
  interview_prep: { label: 'Interview Prep', color: 'bg-indigo-100 text-indigo-700' },
  networking: { label: 'Networking', color: 'bg-rose-100 text-rose-700' },
  other: { label: 'Other', color: 'bg-gray-100 text-gray-600' },
};

export default function EventsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [view, setView] = useState('calendar'); // 'calendar' | 'list'
  // Week start = Sunday of currently viewed week
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  });
  const [selectedEventId, setSelectedEventId] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['events'],
    queryFn: () => api.get('/networking/events'),
  });

  const addMutation = useMutation({
    mutationFn: (evt) => api.post('/networking/events', evt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast('Event added');
      setShowModal(false);
    },
    onError: (err) => toast(err.message, 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...fields }) => api.patch(`/networking/events/${id}`, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (err) => toast(err.message, 'error'),
  });

  const addStepMutation = useMutation({
    mutationFn: ({ eventId, text }) =>
      api.post(`/networking/events/${eventId}/steps`, { text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (err) => toast(err.message, 'error'),
  });

  const toggleStepMutation = useMutation({
    mutationFn: ({ eventId, stepId, done }) =>
      api.patch(`/networking/events/${eventId}/steps/${stepId}`, { done }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (err) => toast(err.message, 'error'),
  });

  const addContactMutation = useMutation({
    mutationFn: ({ eventId, name, email }) =>
      api.post(`/networking/events/${eventId}/contacts`, { name, email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast('Contact added');
    },
    onError: (err) => toast(err.message, 'error'),
  });

  const syncCalendarMutation = useMutation({
    mutationFn: () => api.post('/google/calendar/sync'),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast(`Synced ${data.added} new, ${data.updated} updated`);
    },
    onError: (err) => {
      if (err.message?.includes('not connected')) {
        toast('Connect Google in Settings first', 'error');
      } else {
        toast(err.message, 'error');
      }
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-[#F97316] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 mb-2">{error.message}</p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['events'] })}
          className="text-sm text-[#F97316] hover:underline cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const eventList = Array.isArray(data) ? data : data?.events || [];
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const getEventDate = (e) => {
    const d = e.start_date || e.date;
    if (!d) return null;
    if (d instanceof Date) return d;
    return new Date(String(d).split('T')[0] + 'T12:00:00');
  };
  const visibleEvents = eventList.filter((e) => !e.hidden);
  const hiddenEvents = eventList.filter((e) => e.hidden);
  const upcoming = visibleEvents.filter((e) => {
    const d = getEventDate(e);
    return d && d >= new Date(todayStr + 'T00:00:00');
  });
  const past = visibleEvents.filter((e) => {
    const d = getEventDate(e);
    return d && d < new Date(todayStr + 'T00:00:00');
  });

  const selectedEvent = selectedEventId ? visibleEvents.find((e) => e.id === selectedEventId) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-[#1F2D3D]">
            {visibleEvents.length} Event{visibleEvents.length !== 1 ? 's' : ''}
          </h2>
          {/* View toggle */}
          <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView('calendar')}
              className={`text-xs font-medium px-3 py-1 rounded cursor-pointer ${view === 'calendar' ? 'bg-white text-[#1F2D3D] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Calendar
            </button>
            <button
              onClick={() => setView('list')}
              className={`text-xs font-medium px-3 py-1 rounded cursor-pointer ${view === 'list' ? 'bg-white text-[#1F2D3D] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              List
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hiddenEvents.length > 0 && view === 'list' && (
            <button
              onClick={() => setShowHidden(!showHidden)}
              className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
            >
              {showHidden ? 'Hide' : 'Show'} {hiddenEvents.length} hidden
            </button>
          )}
          <button
            onClick={() => syncCalendarMutation.mutate()}
            disabled={syncCalendarMutation.isPending}
            className="text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {syncCalendarMutation.isPending ? 'Syncing...' : 'Sync Calendar'}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            + Log Event
          </button>
        </div>
      </div>

      {/* Calendar view */}
      {view === 'calendar' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <WeekView
              weekStart={weekStart}
              events={visibleEvents}
              getEventDate={getEventDate}
              selectedEventId={selectedEventId}
              onSelectEvent={setSelectedEventId}
              onPrevWeek={() => {
                const d = new Date(weekStart);
                d.setDate(d.getDate() - 7);
                setWeekStart(d);
              }}
              onNextWeek={() => {
                const d = new Date(weekStart);
                d.setDate(d.getDate() + 7);
                setWeekStart(d);
              }}
              onToday={() => {
                const d = new Date();
                d.setHours(0, 0, 0, 0);
                d.setDate(d.getDate() - d.getDay());
                setWeekStart(d);
              }}
            />
            <UpcomingList
              weekStart={weekStart}
              events={visibleEvents}
              getEventDate={getEventDate}
              selectedEventId={selectedEventId}
              onSelectEvent={setSelectedEventId}
            />
          </div>
          <div>
            {selectedEvent ? (
              <EventCard
                event={selectedEvent}
                onUpdate={(fields) => updateMutation.mutate({ id: selectedEvent.id, ...fields })}
                onAddStep={(text) => addStepMutation.mutate({ eventId: selectedEvent.id, text })}
                onToggleStep={(stepId, done) =>
                  toggleStepMutation.mutate({ eventId: selectedEvent.id, stepId, done })
                }
                onAddContact={(name, email) =>
                  addContactMutation.mutate({ eventId: selectedEvent.id, name, email })
                }
                forceExpanded
              />
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center sticky top-4">
                <p className="text-sm text-gray-500 mb-1">Select an event</p>
                <p className="text-xs text-gray-400">Click a day or event in the calendar to see details.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* List view begins below — keep the existing sections but only show if in list view */}

      {/* Upcoming */}
      {view === 'list' && upcoming.length > 0 && (
        <Section title="Upcoming">
          {upcoming.map((evt) => (
            <EventCard
              key={evt.id}
              event={evt}
              onUpdate={(fields) => updateMutation.mutate({ id: evt.id, ...fields })}
              onAddStep={(text) => addStepMutation.mutate({ eventId: evt.id, text })}
              onToggleStep={(stepId, done) =>
                toggleStepMutation.mutate({ eventId: evt.id, stepId, done })
              }
              onAddContact={(name, email) =>
                addContactMutation.mutate({ eventId: evt.id, name, email })
              }
            />
          ))}
        </Section>
      )}

      {/* Past */}
      {view === 'list' && past.length > 0 && (
        <Section title="Past">
          {past.map((evt) => (
            <EventCard
              key={evt.id}
              event={evt}
              onUpdate={(fields) => updateMutation.mutate({ id: evt.id, ...fields })}
              onAddStep={(text) => addStepMutation.mutate({ eventId: evt.id, text })}
              onToggleStep={(stepId, done) =>
                toggleStepMutation.mutate({ eventId: evt.id, stepId, done })
              }
              onAddContact={(name, email) =>
                addContactMutation.mutate({ eventId: evt.id, name, email })
              }
            />
          ))}
        </Section>
      )}

      {/* Hidden Events */}
      {view === 'list' && showHidden && hiddenEvents.length > 0 && (
        <Section title="Hidden">
          {hiddenEvents.map((evt) => (
            <EventCard
              key={evt.id}
              event={evt}
              onUpdate={(fields) => updateMutation.mutate({ id: evt.id, ...fields })}
              onAddStep={(text) => addStepMutation.mutate({ eventId: evt.id, text })}
              onToggleStep={(stepId, done) =>
                toggleStepMutation.mutate({ eventId: evt.id, stepId, done })
              }
              onAddContact={(name, email) =>
                addContactMutation.mutate({ eventId: evt.id, name, email })
              }
            />
          ))}
        </Section>
      )}

      {/* Empty state */}
      {view === 'list' && visibleEvents.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-gray-500">No events yet. Log your first networking event.</p>
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <AddEventModal
          onClose={() => setShowModal(false)}
          onSave={(data) => addMutation.mutate(data)}
          saving={addMutation.isPending}
        />
      )}
    </div>
  );
}

function WeekView({ weekStart, events, getEventDate, selectedEventId, onSelectEvent, onPrevWeek, onNextWeek, onToday }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Build 7 days starting from weekStart
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  const weekStartStr = days[0].toISOString().split('T')[0];
  const weekEndStr = days[6].toISOString().split('T')[0];

  // Group events by date for this week only
  const eventsByDay = {};
  events.forEach((e) => {
    const d = getEventDate(e);
    if (!d) return;
    const key = d.toISOString().split('T')[0];
    if (key < weekStartStr || key > weekEndStr) return;
    if (!eventsByDay[key]) eventsByDay[key] = [];
    eventsByDay[key].push(e);
  });
  // Sort within each day
  Object.values(eventsByDay).forEach(arr => arr.sort((a, b) => (a.start_time || '99').localeCompare(b.start_time || '99')));

  // Week label
  const startLabel = days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Week nav */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <button onClick={onPrevWeek} className="w-7 h-7 rounded hover:bg-gray-100 cursor-pointer flex items-center justify-center text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-base font-semibold text-[#1F2D3D]">{startLabel} – {endLabel}</h3>
          <button onClick={onNextWeek} className="w-7 h-7 rounded hover:bg-gray-100 cursor-pointer flex items-center justify-center text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <button onClick={onToday} className="text-xs font-medium text-gray-500 hover:text-[#F97316] cursor-pointer">
          This Week
        </button>
      </div>

      {/* 7-day grid */}
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const dateStr = d.toISOString().split('T')[0];
          const dayEvents = eventsByDay[dateStr] || [];
          const isToday = dateStr === todayStr;
          const isWeekend = i === 0 || i === 6;

          return (
            <div
              key={i}
              className={`min-h-[220px] border-r last:border-r-0 border-gray-100 p-2 ${
                isWeekend ? 'bg-gray-50/30' : 'bg-white'
              } ${isToday ? 'bg-[#F97316]/5' : ''}`}
            >
              {/* Day header */}
              <div className="mb-2 pb-1.5 border-b border-gray-100">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  {weekdays[i]}
                </div>
                <div className={`text-lg font-bold ${isToday ? 'text-[#F97316]' : 'text-[#1F2D3D]'}`}>
                  {d.getDate()}
                </div>
              </div>

              {/* Events for this day */}
              <div className="space-y-1.5">
                {dayEvents.length === 0 ? (
                  <div className="text-[10px] text-gray-300 italic">—</div>
                ) : (
                  dayEvents.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => onSelectEvent(e.id)}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded cursor-pointer transition-colors border-l-2 ${
                        e.id === selectedEventId
                          ? 'bg-[#F97316] text-white border-[#EA580C]'
                          : 'bg-[#F97316]/10 text-[#1F2D3D] border-[#F97316] hover:bg-[#F97316]/20'
                      }`}
                      title={e.title}
                    >
                      {e.start_time && (
                        <div className={`text-[9px] font-mono ${e.id === selectedEventId ? 'text-white/80' : 'text-[#F97316]'}`}>
                          {e.start_time}
                        </div>
                      )}
                      <div className="font-medium leading-tight break-words">
                        {e.title}
                      </div>
                      {e.location && (
                        <div className={`text-[9px] truncate mt-0.5 ${e.id === selectedEventId ? 'text-white/70' : 'text-gray-500'}`}>
                          {e.location}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UpcomingList({ weekStart, events, getEventDate, selectedEventId, onSelectEvent }) {
  // Show events beyond the current week end (next 30 days)
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split('T')[0];
  const horizon = new Date(weekEnd);
  horizon.setDate(horizon.getDate() + 30);
  const horizonStr = horizon.toISOString().split('T')[0];

  const upcoming = events
    .map((e) => ({ e, d: getEventDate(e) }))
    .filter(({ d }) => d)
    .filter(({ d }) => {
      const key = d.toISOString().split('T')[0];
      return key >= weekEndStr && key <= horizonStr;
    })
    .sort((a, b) => a.d - b.d);

  if (upcoming.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-[#1F2D3D] mb-2">Upcoming</h3>
        <p className="text-xs text-gray-400">No events in the next 30 days beyond this week.</p>
      </div>
    );
  }

  // Group by date for better scanability
  const byDate = {};
  upcoming.forEach(({ e, d }) => {
    const key = d.toISOString().split('T')[0];
    if (!byDate[key]) byDate[key] = { date: d, events: [] };
    byDate[key].events.push(e);
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-[#1F2D3D]">Upcoming ({upcoming.length})</h3>
      </div>
      <div className="divide-y divide-gray-50">
        {Object.entries(byDate).map(([dateStr, { date, events: dayEvents }]) => (
          <div key={dateStr} className="p-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
            <div className="space-y-1">
              {dayEvents.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onSelectEvent(e.id)}
                  className={`w-full text-left px-3 py-2 rounded cursor-pointer transition-colors ${
                    e.id === selectedEventId
                      ? 'bg-[#F97316]/10 border-l-2 border-[#F97316]'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {e.start_time && (
                      <span className="text-xs font-mono text-[#F97316] shrink-0">{e.start_time}</span>
                    )}
                    <span className="text-sm text-[#1F2D3D] font-medium truncate flex-1">{e.title}</span>
                  </div>
                  {e.location && (
                    <div className="text-xs text-gray-500 ml-2 truncate">{e.location}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-[#1F2D3D] uppercase tracking-wide mb-3">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function EventCard({ event, onUpdate, onAddStep, onToggleStep, onAddContact, forceExpanded }) {
  const [expandedState, setExpanded] = useState(false);
  const expanded = forceExpanded || expandedState;
  const [notes, setNotes] = useState(event.notes || '');
  const [stepText, setStepText] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const typeInfo = EVENT_TYPES[event.type] || EVENT_TYPES.other;

  const handleNotesBlur = useCallback(() => {
    if (notes !== (event.notes || '')) {
      onUpdate({ notes });
    }
  }, [notes, event.notes, onUpdate]);

  const handleAddStep = (e) => {
    e.preventDefault();
    if (!stepText.trim()) return;
    onAddStep(stepText.trim());
    setStepText('');
  };

  const handleAddContact = (e) => {
    e.preventDefault();
    if (!contactName.trim()) return;
    onAddContact(contactName.trim(), contactEmail.trim());
    setContactName('');
    setContactEmail('');
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-50/50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-[#1F2D3D]">{event.title}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${typeInfo.color}`}>
              {typeInfo.label}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {(() => {
              const dateStr = event.start_date || event.date;
              if (!dateStr) return null;
              const d = dateStr instanceof Date ? dateStr : new Date(String(dateStr).split('T')[0] + 'T12:00:00');
              const opts = { weekday: 'short', month: 'short', day: 'numeric' };
              const formatted = d.toLocaleDateString('en-US', opts);
              return event.start_time ? `${formatted} · ${event.start_time}` : formatted;
            })()}
            {event.location && ` \u00B7 ${event.location}`}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdate({ hidden: !event.hidden });
            }}
            className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            {event.hidden ? 'Unhide' : 'Hide'}
          </button>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316] resize-none"
              placeholder="Event notes..."
            />
          </div>

          {/* Contacts */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Contacts ({event.contacts?.length || 0})
            </label>
            {event.contacts?.length > 0 && (
              <div className="space-y-1 mb-2">
                {event.contacts.map((c, i) => (
                  <div key={c.id || i} className="flex items-center gap-2 text-sm text-gray-700">
                    <div className="w-6 h-6 bg-[#1F2D3D] text-white rounded-full flex items-center justify-center text-[10px] font-medium shrink-0">
                      {(c.name || '?')[0].toUpperCase()}
                    </div>
                    <span>{c.name}</span>
                    {c.email && <span className="text-xs text-gray-400">{c.email}</span>}
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleAddContact} className="flex items-center gap-2">
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                placeholder="Name"
              />
              <input
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                placeholder="Email (optional)"
              />
              <button
                type="submit"
                className="text-xs bg-[#1F2D3D] hover:bg-[#2C3E50] text-white px-3 py-1.5 rounded transition-colors cursor-pointer"
              >
                Add
              </button>
            </form>
          </div>

          {/* Next Steps */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Next Steps
            </label>
            {event.next_steps?.length > 0 && (
              <div className="space-y-1 mb-2">
                {event.next_steps.map((step, i) => (
                  <label
                    key={step.id || i}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={step.done || false}
                      onChange={(e) =>
                        onToggleStep(step.id, e.target.checked)
                      }
                      className="rounded border-gray-300 text-[#F97316] focus:ring-[#F97316] cursor-pointer"
                    />
                    <span className={step.done ? 'line-through text-gray-400' : 'text-gray-700'}>
                      {step.text}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <form onSubmit={handleAddStep} className="flex items-center gap-2">
              <input
                value={stepText}
                onChange={(e) => setStepText(e.target.value)}
                className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                placeholder="Add a step..."
              />
              <button
                type="submit"
                className="text-xs bg-[#1F2D3D] hover:bg-[#2C3E50] text-white px-3 py-1.5 rounded transition-colors cursor-pointer"
              >
                Add
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AddEventModal({ onClose, onSave, saving }) {
  const [form, setForm] = useState({
    title: '',
    date: '',
    type: 'networking',
    location: '',
    notes: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave({
      ...form,
      date: form.date ? new Date(form.date).toISOString() : new Date().toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#1F2D3D]">Log Event</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl cursor-pointer">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
              placeholder="Coffee chat with Jane"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
              <input
                type="datetime-local"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
              >
                {Object.entries(EVENT_TYPES).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
              placeholder="Zoom / Blue Bottle Coffee / etc."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316] resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
