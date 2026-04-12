import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <OverviewSection />
      <UsersSection />
      <UsageSection />
    </div>
  );
}

function OverviewSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api.get('/admin/overview'),
  });

  if (isLoading) return <div className="text-gray-400">Loading...</div>;
  if (!data) return null;

  const usage7 = (data.usage7d || []).reduce((acc, r) => { acc[r.action] = r; return acc; }, {});

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Stat label="Tenants" value={data.tenants} />
      <Stat label="Users" value={data.users} />
      <Stat label="Pro Tenants" value={data.plans?.pro || 0} sub={`${data.plans?.free || 0} free`} />
      <Stat label="Applications" value={data.applications} />
      <Stat label="Job Leads" value={data.leads} />
      <Stat label="Events" value={data.events} />
      <Stat label="AI · 7d" value={usage7.cover_letters?.c || 0} sub={`${usage7.cover_letters?.tokens || 0} tok`} />
      <Stat label="Crawl · 7d" value={usage7.crawl?.c || 0} />
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500 font-medium">{label}</div>
      <div className="text-2xl font-bold text-[#1F2D3D] mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function UsersSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users'),
  });

  const changePlanMutation = useMutation({
    mutationFn: ({ tenantId, plan }) => api.patch(`/admin/tenants/${tenantId}`, { plan }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      toast('Plan updated');
    },
    onError: (err) => toast(err.message, 'error'),
  });

  if (isLoading) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-[#1F2D3D]">Users ({data?.length || 0})</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100 bg-gray-50/50">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium text-right">Apps</th>
              <th className="px-4 py-3 font-medium text-right">AI 30d</th>
              <th className="px-4 py-3 font-medium">Signed Up</th>
              <th className="px-4 py-3 font-medium">Stripe</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((u) => (
              <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-3 text-[#1F2D3D] font-medium">{u.email}</td>
                <td className="px-4 py-3 text-gray-700">{u.full_name || '—'}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.plan}
                    onChange={(e) => changePlanMutation.mutate({ tenantId: u.tenant_id, plan: e.target.value })}
                    className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${
                      u.plan === 'pro' ? 'bg-[#F97316]/10 text-[#F97316]' :
                      u.plan === 'enterprise' ? 'bg-purple-50 text-purple-700' :
                      'bg-gray-100 text-gray-600'
                    }`}
                  >
                    <option value="free">free</option>
                    <option value="pro">pro</option>
                    <option value="enterprise">enterprise</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-right text-gray-700">{u.app_count}</td>
                <td className="px-4 py-3 text-right text-gray-700">{u.usage_30d}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {u.stripe_subscription_id ? (
                    <span className="text-green-600">active</span>
                  ) : u.stripe_customer_id ? (
                    <span className="text-amber-600">customer only</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsageSection() {
  const [days, setDays] = useState(7);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-usage', days],
    queryFn: () => api.get(`/admin/usage?days=${days}`),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1F2D3D]">Recent Usage</h3>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="text-xs border border-gray-200 rounded px-2 py-1"
        >
          <option value={1}>Last 24h</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100 bg-gray-50/50 sticky top-0">
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium text-right">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
            ) : !data?.length ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No usage in this period.</td></tr>
            ) : data.map((u, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="px-4 py-2 text-xs text-gray-500">{new Date(u.created_at).toLocaleString()}</td>
                <td className="px-4 py-2 text-xs text-gray-700">{u.user_email || '—'}</td>
                <td className="px-4 py-2 text-xs text-gray-700">{u.action}</td>
                <td className="px-4 py-2 text-xs text-gray-500 text-right">{u.tokens_used || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
