const db = require('../db/store');
const { diagLog } = require('../utils');
const { extractCompanyFromUrl } = require('./anthropic');

const TTL_DAYS = 30;

// Compute a stable per-company cache key from user-typed company + optional source URL.
// Prefers the URL-derived slug (more deterministic than freeform names).
function companyKey(company, sourceUrl) {
  const fromUrl = extractCompanyFromUrl(sourceUrl || '');
  const base = (fromUrl || company || '').toLowerCase().trim();
  return base
    .replace(/[.,]/g, '')
    .replace(/\b(inc|llc|corp|co|company|ltd|limited)\b/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function isFresh(dossier) {
  if (!dossier?.updated_at) return false;
  const ageMs = Date.now() - new Date(dossier.updated_at).getTime();
  return ageMs < TTL_DAYS * 86400000;
}

function ageDays(dossier) {
  if (!dossier?.updated_at) return null;
  return Math.floor((Date.now() - new Date(dossier.updated_at).getTime()) / 86400000);
}

// Read-through cache helper: just looks up by key, no generation.
async function getCachedDossier(key) {
  if (!key) return null;
  return await db.getCompanyDossier(key);
}

// Build a dossier via one Sonnet call, persist it, return it.
// Throws on validation failure or API error — callers decide how to surface.
async function buildDossier({ userId, company, sourceUrl, jdText }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  const key = companyKey(company, sourceUrl);
  if (!key) throw new Error('Cannot derive company_key — company and source_url both empty');
  if (!jdText || jdText.length < 200) throw new Error('Not enough context');

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Extract a short factual dossier about the EMPLOYER company from the job posting below. Output ONLY a JSON object with this exact shape, no preamble or explanation:

{
  "summary": "2-4 sentence paragraph about what the company does, who they serve, and any notable stage/funding/size signal you can infer. Plain prose.",
  "facts": ["Label: value", "Label: value", ...],
  "links": {"website": "url", "linkedin": "url"}
}

STRICT RULES:
- If something is not inferable from the text, DO NOT invent it. Say "unknown" in the relevant fact or omit.
- facts: 3-6 items. Each is "Label: value" (e.g. "Industry: Healthcare AI", "Stage: Series B", "Size signal: ~100-250 employees", "HQ: Palo Alto, remote-friendly", "Notable products: X, Y").
- links: only include URLs that appear verbatim in the posting text. Never guess.
- NEVER invent funding amounts, employee counts, or product names.

COMPANY NAME: ${company || '(unknown)'}
POSTING URL: ${sourceUrl || '(unknown)'}

POSTING TEXT:
${jdText.slice(0, 8000)}`;

  const resp = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = (resp.content?.[0]?.text || '').trim();
  const jsonStr = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(jsonStr); } catch (e) {
    diagLog('dossier parse failed: ' + e.message);
    throw new Error('Could not parse dossier from model output');
  }

  const summary = String(parsed.summary || '').slice(0, 2000);
  const facts = Array.isArray(parsed.facts)
    ? parsed.facts.filter(f => typeof f === 'string').slice(0, 8).map(f => f.slice(0, 300))
    : [];
  const links = (parsed.links && typeof parsed.links === 'object')
    ? Object.fromEntries(
        Object.entries(parsed.links)
          .filter(([, v]) => typeof v === 'string' && /^https?:\/\//.test(v))
          .slice(0, 5)
          .map(([k, v]) => [String(k).slice(0, 30), String(v).slice(0, 500)])
      )
    : {};

  if (!summary) throw new Error('Model returned empty summary');

  let sourceDomain = '';
  try { sourceDomain = new URL(sourceUrl).hostname.toLowerCase(); } catch (_) {}

  const row = await db.upsertCompanyDossier({
    company_key: key,
    display_name: company || key,
    source_domain: sourceDomain,
    summary,
    facts,
    links,
    generated_by_user_id: userId,
    tokens_in: resp.usage?.input_tokens || 0,
    tokens_out: resp.usage?.output_tokens || 0,
  });
  return row;
}

module.exports = {
  companyKey,
  isFresh,
  ageDays,
  getCachedDossier,
  buildDossier,
  TTL_DAYS,
};
