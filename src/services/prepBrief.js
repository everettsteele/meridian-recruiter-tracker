const db = require('../db/store');
const { diagLog } = require('../utils');
const { getCachedDossier } = require('./dossier');

async function buildPrepBrief({ userId, tenantId, app, jdText, resumeText, contacts, profile }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  if (!app) throw new Error('app required');

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Pull dossier if one exists, to enrich the company_research block.
  let dossierBlock = '(no dossier available)';
  try {
    const { companyKey } = require('./dossier');
    const key = companyKey(app.company, app.source_url);
    const dossier = key ? await getCachedDossier(key) : null;
    if (dossier) {
      const facts = Array.isArray(dossier.facts) ? dossier.facts.join('\n- ') : '';
      dossierBlock = `Summary: ${dossier.summary || '(none)'}\nFacts:\n- ${facts}`;
    }
  } catch (_) {}

  const fullName = profile?.full_name || profile?.fullName || 'the candidate';
  const background = profile?.background_text || profile?.backgroundText || '';
  const targetRoles = Array.isArray(profile?.target_roles) ? profile.target_roles.join(', ') : '';
  const contactsBlock = (contacts || []).length
    ? (contacts || []).map(c =>
        `- ${c.name}${c.title ? ` (${c.title})` : ''} — ${c.kind}`
      ).join('\n')
    : '(none recorded)';

  const prompt = `Generate a structured interview prep brief for ${fullName}, interviewing for the ${app.role} role at ${app.company}. Output ONLY a JSON object with this exact shape, no preamble:

{
  "likely_questions": ["10 specific interview questions grounded in the JD + role. Behavioral, technical, situational mix."],
  "company_research": "Compact 3-5 sentence narrative about the company, incorporating the dossier below if useful.",
  "resume_highlights": ["5-8 specific bullets of what to emphasize given this role. Reference actual resume facts."],
  "questions_to_ask": ["5-8 thoughtful questions for the interviewer that signal real interest and research."]
}

STRICT RULES:
- Ground every item in the JD, resume, or dossier text provided. DO NOT invent company facts, resume bullets, or role requirements.
- likely_questions: each under 200 chars.
- company_research: plain prose paragraph, under 2000 chars.
- resume_highlights + questions_to_ask: each bullet under 200 chars.
- If any category is not inferable, return a short generic-but-useful fallback rather than inventing.

ROLE: ${app.role}
COMPANY: ${app.company}

JOB DESCRIPTION:
${(jdText || '(not available)').slice(0, 4000)}

CANDIDATE:
Name: ${fullName}
Background: ${background}
Target roles: ${targetRoles}

CANDIDATE RESUME:
${(resumeText || '(no resume attached)').slice(0, 4000)}

COMPANY DOSSIER:
${dossierBlock}

PEOPLE ON THIS APPLICATION:
${contactsBlock}`;

  let raw = '';
  let tokensIn = 0;
  let tokensOut = 0;
  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });
    raw = (resp.content?.[0]?.text || '').trim();
    tokensIn = resp.usage?.input_tokens || 0;
    tokensOut = resp.usage?.output_tokens || 0;
  } catch (e) {
    diagLog('prep brief model error: ' + e.message);
    throw new Error('Prep brief model call failed: ' + e.message);
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    diagLog('prep brief: no JSON block in response');
    throw new Error('Could not parse prep brief from model output');
  }
  let parsed;
  try { parsed = JSON.parse(match[0]); } catch (e) {
    throw new Error('Could not parse prep brief JSON: ' + e.message);
  }

  const clean = (arr, limit) => Array.isArray(arr)
    ? arr.filter(s => typeof s === 'string').slice(0, limit || 15).map(s => s.slice(0, 200))
    : [];

  const brief = await db.upsertApplicationPrepBrief(tenantId, app.id, {
    likely_questions: clean(parsed.likely_questions, 15),
    company_research: String(parsed.company_research || '').slice(0, 2000),
    resume_highlights: clean(parsed.resume_highlights, 12),
    questions_to_ask: clean(parsed.questions_to_ask, 12),
    generated_by_user_id: userId,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
  });
  return brief;
}

module.exports = { buildPrepBrief };
