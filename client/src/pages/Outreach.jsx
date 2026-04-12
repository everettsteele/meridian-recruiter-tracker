import { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';

const PILLAR_CONFIG = {
  recruiters: {
    label: 'Recruiter',
    endpoint: '/firms',
    nameKey: 'name',
    statusKey: 'status',
  },
  ceos: {
    label: 'CEO',
    endpoint: '/ceos',
    nameKey: 'company',
    statusKey: 'status',
  },
  vcs: {
    label: 'VC',
    endpoint: '/vcs',
    nameKey: 'firm',
    statusKey: 'status',
  },
};

const STATUSES = ['all', 'draft', 'contacted', 'in_convo', 'replied', 'bounced', 'dead'];

const STATUS_COLORS = {
  draft: 'bg-gray-400',
  contacted: 'bg-blue-500',
  in_convo: 'bg-green-500',
  replied: 'bg-green-500',
  bounced: 'bg-red-500',
  dead: 'bg-gray-300',
};

const TIER_COLORS = {
  '1': 'bg-[#F97316] text-white',
  '2': 'bg-amber-100 text-amber-700',
  '3': 'bg-gray-100 text-gray-600',
  A: 'bg-[#F97316] text-white',
  B: 'bg-amber-100 text-amber-700',
  C: 'bg-gray-100 text-gray-600',
};

export default function OutreachPage() {
  const { pillar } = useParams();
  const config = PILLAR_CONFIG[pillar] || PILLAR_CONFIG.recruiters;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['outreach', pillar],
    queryFn: () => api.get(config.endpoint),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...fields }) => api.patch(`${config.endpoint}/${id}`, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach', pillar] });
      toast('Saved');
    },
    onError: (err) => toast(err.message, 'error'),
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
          onClick={() => queryClient.invalidateQueries({ queryKey: ['outreach', pillar] })}
          className="text-sm text-[#F97316] hover:underline cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const items = Array.isArray(data) ? data : data?.firms || data?.ceos || data?.vcs || data?.items || [];

  // Status counts
  const statusCounts = { all: items.length };
  items.forEach((item) => {
    const s = item[config.statusKey] || 'draft';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  // Sector list (CEOs only)
  const sectors = pillar === 'ceos'
    ? [...new Set(items.map((i) => i.sector).filter(Boolean))].sort()
    : [];

  // Filter
  let filtered = items;
  if (statusFilter !== 'all') {
    filtered = filtered.filter((i) => (i[config.statusKey] || 'draft') === statusFilter);
  }
  if (sectorFilter !== 'all' && pillar === 'ceos') {
    filtered = filtered.filter((i) => i.sector === sectorFilter);
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((i) => {
      const name = (i[config.nameKey] || i.name || '').toLowerCase();
      const contact = (i.contact_name || i.contact_email || '').toLowerCase();
      return name.includes(q) || contact.includes(q);
    });
  }

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="flex flex-wrap gap-3">
        {['all', 'draft', 'contacted', 'in_convo', 'bounced'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors cursor-pointer ${
              statusFilter === s
                ? 'bg-[#F97316] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? 'Total' : s === 'in_convo' ? 'In Convo' : s.charAt(0).toUpperCase() + s.slice(1)}{' '}
            ({statusCounts[s] || 0})
          </button>
        ))}
      </div>

      {/* Search + Sector Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
            placeholder={`Search ${config.label.toLowerCase()}s...`}
          />
        </div>
        {pillar === 'ceos' && sectors.length > 0 && (
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
          >
            <option value="all">All Sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </div>

      {/* Two-column: list + detail pane */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-[calc(100vh-260px)]">
        {/* Left: scannable list */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b border-gray-100 text-xs font-medium text-gray-500">
            {filtered.length} of {items.length}
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No matches</div>
            ) : (
              filtered.map((item) => {
                const name = item[config.nameKey] || item.name || 'Unknown';
                const status = item[config.statusKey] || 'draft';
                const isSelected = expandedId === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setExpandedId(item.id)}
                    className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                      isSelected ? 'bg-[#F97316]/5 border-l-4 border-[#F97316]' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[status] || 'bg-gray-400'}`} />
                      <span className="font-medium text-sm text-[#1F2D3D] truncate flex-1">{name}</span>
                      {item.tier && (
                        <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${TIER_COLORS[String(item.tier)] || 'bg-gray-100 text-gray-600'}`}>
                          T{item.tier}
                        </span>
                      )}
                    </div>
                    {item.contact_name && (
                      <div className="text-xs text-gray-500 truncate">{item.contact_name}</div>
                    )}
                    {item.sector && (
                      <div className="text-[10px] text-purple-700 mt-0.5">{item.sector}</div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: detail + report */}
        <div className="lg:col-span-3">
          {expandedId ? (
            (() => {
              const item = items.find((i) => i.id === expandedId);
              if (!item) return null;
              return (
                <OutreachDetail
                  item={item}
                  config={config}
                  pillar={pillar}
                  onSave={(fields) => updateMutation.mutate({ id: item.id, ...fields })}
                />
              );
            })()
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center h-full flex items-center justify-center">
              <div>
                <p className="text-gray-400 text-sm mb-1">Select {config.label.toLowerCase()} to view details</p>
                <p className="text-xs text-gray-300">{filtered.length} available</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OutreachDetail({ item, config, pillar, onSave }) {
  const { toast } = useToast();
  const name = item[config.nameKey] || item.name || 'Unknown';
  const status = item[config.statusKey] || 'draft';
  const tier = item.tier ? String(item.tier) : null;

  const [notes, setNotes] = useState(item.notes || '');
  const [editStatus, setEditStatus] = useState(status);
  const [followupDate, setFollowupDate] = useState(item.followup_date || item.follow_up_date || '');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);

  // Reset local state when item changes
  const itemKey = item.id;
  useEffect(() => {
    setNotes(item.notes || '');
    setEditStatus(item[config.statusKey] || 'draft');
    setFollowupDate(item.followup_date || item.follow_up_date || '');
  }, [itemKey]);

  const typeMap = { recruiters: 'recruiter', ceos: 'ceo', vcs: 'vc' };

  const extractDraft = () => {
    const marker = '--- AI Draft ---';
    if (notes.includes(marker)) return notes.split(marker).pop().trim();
    return item.email_draft || notes.trim();
  };

  const firstEmail = item.contact_email || (item.contacts?.find((c) => c.email)?.email) || '';

  const handleSave = () => {
    const fields = {};
    if (notes !== (item.notes || '')) fields.notes = notes;
    if (editStatus !== status) fields.status = editStatus;
    if (followupDate !== (item.followup_date || item.follow_up_date || '')) fields.followup_date = followupDate;
    if (Object.keys(fields).length > 0) onSave(fields);
  };

  const handleDraftEmail = async () => {
    const contactName = item.contact_name || item.contacts?.[0]?.name || name;
    const company = item.company_name || item.company || name;
    const contactRole = item.contact_title || item.contacts?.[0]?.title || '';
    setDrafting(true);
    try {
      const data = await api.post('/draft-email', {
        recipientName: contactName,
        company,
        recipientRole: contactRole,
        type: typeMap[pillar] || 'recruiter',
      });
      setNotes((prev) => (prev ? prev + '\n\n--- AI Draft ---\n' + data.draft : data.draft));
      toast('Email draft generated');
    } catch (err) {
      toast(err.message || 'Failed to generate draft', 'error');
    } finally {
      setDrafting(false);
    }
  };

  const handleSendGmail = async () => {
    const body = extractDraft();
    if (!body || body.length < 20) { toast('Write or generate a draft first', 'error'); return; }
    if (!firstEmail) { toast('No recipient email on this contact', 'error'); return; }
    const subject = `Reaching out — ${name}`;
    setSending(true);
    try {
      await api.post('/google/gmail/draft', { to: firstEmail, subject, body });
      toast('Draft created in Gmail');
    } catch (err) {
      toast(err.message || 'Failed to create Gmail draft', 'error');
    } finally {
      setSending(false);
    }
  };

  const currentDraft = item.email_draft || '';

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-lg font-semibold text-[#1F2D3D]">{name}</h2>
          {tier && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${TIER_COLORS[tier] || 'bg-gray-100 text-gray-600'}`}>
              Tier {tier}
            </span>
          )}
        </div>
        {(item.why || item.reason) && (
          <p className="text-sm text-gray-600">{item.why || item.reason}</p>
        )}
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Contacts */}
        {(item.contacts?.length > 0 || item.contact_name) && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Contacts</label>
            {item.contacts ? (
              <div className="space-y-1 bg-gray-50 rounded-lg p-3">
                {item.contacts.map((c, i) => (
                  <div key={i} className="text-sm">
                    <span className="text-[#1F2D3D] font-medium">{c.name}</span>
                    {c.title && <span className="text-xs text-gray-500 ml-1">· {c.title}</span>}
                    {c.email && <div className="text-xs text-gray-500">{c.email}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm bg-gray-50 rounded-lg p-3">
                <span className="font-medium">{item.contact_name}</span>
                {item.contact_email && <span className="text-xs text-gray-500 ml-1">{item.contact_email}</span>}
              </div>
            )}
          </div>
        )}

        {/* Activity */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Last Contacted</label>
            <div className="text-[#1F2D3D]">{item.last_contacted || '—'}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Days Since</label>
            <div className="text-[#1F2D3D]">{item.days_since_contact != null ? `${item.days_since_contact}d` : '—'}</div>
          </div>
        </div>

        {/* AI Email Draft */}
        {currentDraft && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Current AI Draft</label>
            <div className="bg-[#F97316]/5 border border-[#F97316]/20 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap">
              {currentDraft}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316] resize-none"
            placeholder="Notes, draft text, or response context..."
          />
        </div>

        {/* Status + Follow-up */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
            >
              {STATUSES.filter((s) => s !== 'all').map((s) => (
                <option key={s} value={s}>
                  {s === 'in_convo' ? 'In Conversation' : s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Follow-up Date</label>
            <input
              type="date"
              value={followupDate ? followupDate.split('T')[0] : ''}
              onChange={(e) => setFollowupDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
            />
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap gap-2 justify-end bg-gray-50/50">
        <button
          onClick={handleDraftEmail}
          disabled={drafting}
          className="bg-[#1F2D3D] hover:bg-[#2C3E50] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
        >
          {drafting ? 'Drafting...' : (currentDraft ? 'Regenerate AI Draft' : 'Draft Email')}
        </button>
        {firstEmail && (
          <button
            onClick={handleSendGmail}
            disabled={sending}
            className="bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50"
            title={`Create Gmail draft to ${firstEmail}`}
          >
            {sending ? 'Sending...' : 'Gmail Draft'}
          </button>
        )}
        <button
          onClick={handleSave}
          className="bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-medium px-5 py-2 rounded-lg cursor-pointer"
        >
          Save
        </button>
      </div>
    </div>
  );
}

