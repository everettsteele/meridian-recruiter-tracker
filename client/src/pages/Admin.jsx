import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <RevenueSection />
      <CostSection />
      <UsersSection />
    </div>
  );
}

function fmtUSD(n) {
  if (n == null) return '—';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function RevenueSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api.get('/admin/overview'),
  });

  if (isLoading || !data) return <div className="text-gray-400">Loading...</div>;
  const r = data.revenue;

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Revenue</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigMetric label="MRR" value={fmtUSD(r.mrr)} accent="text-[#F97316]" sub={`${r.paidUsers} paid users`} />
        <BigMetric label="ARR" value={fmtUSD(r.arr)} accent="text-[#1F2D3D]" sub="projected 12-month" />
        <BigMetric
          label="Gross Margin"
          value={r.grossMargin == null ? '—' : `${r.grossMargin}%`}
          accent={r.grossMargin != null && r.grossMargin > 80 ? 'text-green-600' : 'text-amber-600'}
          sub="this month (after AI cost)"
        />
        <BigMetric
          label="Churn Rate"
          value={r.churnRate != null ? `${r.churnRate}%` : '—'}
          accent={r.churnRate > 10 ? 'text-red-600' : 'text-gray-700'}
          sub={`${r.churned} cancelled`}
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <SmallMetric label="Total users" value={r.totalUsers} />
        <SmallMetric label="Free" value={r.freeUsers} />
        <SmallMetric label="New paid (30d)" value={r.newPaid30} />
        <SignupsMetric data={data.signups} />
      </div>
    </div>
  );
}

function SignupsMetric({ data }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500 font-medium">Signups</div>
      <div className="text-xl font-bold text-[#1F2D3D] mt-1">{data.last7} <span className="text-xs text-gray-400 font-normal">(7d)</span></div>
      <div className="text-xs text-gray-400">{data.last30} in 30d</div>
    </div>
  );
}

function CostSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api.get('/admin/overview'),
  });

  if (isLoading || !data) return null;
  const c = data.aiCost;
  const prices = data.prices;

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">AI Cost</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
        <BigMetric
          label="This month"
          value={fmtUSD(c.costThisMonth)}
          accent="text-[#1F2D3D]"
          sub="from usage_log"
        />
        <BigMetric
          label="All time"
          value={fmtUSD(c.totalCost)}
          accent="text-[#1F2D3D]"
          sub={`${c.totalTokens.toLocaleString()} tokens logged`}
        />
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-xs text-gray-500 font-medium mb-2">Cost per action</div>
          <div className="space-y-0.5 text-xs">
            {Object.entries(prices.perAction).map(([action, price]) => (
              <div key={action} className="flex justify-between">
                <span className="text-gray-600">{action}</span>
                <span className="font-mono text-gray-700">{fmtUSD(price)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Breakdown by action */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-[#1F2D3D]">AI Spend by Action (all time)</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100 bg-gray-50/50">
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium text-right">Calls</th>
              <th className="px-4 py-2 font-medium text-right">Tokens</th>
              <th className="px-4 py-2 font-medium text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(c.byAction).length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No AI usage yet</td></tr>
            ) : (
              Object.entries(c.byAction)
                .sort(([, a], [, b]) => b.cost - a.cost)
                .map(([action, stats]) => (
                  <tr key={action} className="border-b border-gray-50">
                    <td className="px-4 py-2 text-[#1F2D3D]">{action}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{stats.calls.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{stats.tokens.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-medium text-[#1F2D3D]">{fmtUSD(stats.cost)}</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
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

  // Compute per-user profitability
  const enrichedUsers = (data || []).map((u) => ({
    ...u,
    // Monthly contribution = revenue - (ai_cost_total / months active)
    // Simplified: just show revenue and total AI cost separately
  }));

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Users</h2>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-600">{enrichedUsers.length} total</span>
          <span className="text-xs text-gray-400">sorted by plan, then signup</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium text-right">MRR</th>
                <th className="px-4 py-2 font-medium text-right">AI Cost (total)</th>
                <th className="px-4 py-2 font-medium text-right">AI Calls 30d</th>
                <th className="px-4 py-2 font-medium">Signed Up</th>
                <th className="px-4 py-2 font-medium">Stripe</th>
              </tr>
            </thead>
            <tbody>
              {enrichedUsers.map((u) => {
                const isProfit = u.plan === 'pro' && u.ai_cost_total < 10;
                return (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2">
                      <div className="text-[#1F2D3D] font-medium">{u.email}</div>
                      {u.full_name && <div className="text-[10px] text-gray-500">{u.full_name}</div>}
                    </td>
                    <td className="px-4 py-2">
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
                    <td className="px-4 py-2 text-right font-medium text-green-600">
                      {u.monthly_revenue > 0 ? fmtUSD(u.monthly_revenue) : '—'}
                    </td>
                    <td className={`px-4 py-2 text-right ${u.ai_cost_total > 5 ? 'text-red-600' : 'text-gray-700'}`}>
                      {u.ai_cost_total > 0 ? fmtUSD(u.ai_cost_total) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">{u.ai_calls_30d || 0}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-xs">
                      {u.stripe_subscription_id ? (
                        <span className="text-green-600 font-medium">active</span>
                      ) : u.stripe_customer_id ? (
                        <span className="text-amber-600">cancelled</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BigMetric({ label, value, accent, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="text-xs text-gray-500 font-medium mb-1">{label}</div>
      <div className={`text-3xl font-bold ${accent || 'text-[#1F2D3D]'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function SmallMetric({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500 font-medium">{label}</div>
      <div className="text-xl font-bold text-[#1F2D3D] mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
