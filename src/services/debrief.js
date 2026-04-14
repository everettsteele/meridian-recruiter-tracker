const db = require('../db/store');
const { diagLog } = require('../utils');

async function buildDebrief({ userId, tenantId, app, transcriptText, resumeText, jdText, coverLetter, contacts, profile }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  if (!transcriptText || transcriptText.length < 500) {
    throw new Error('Transcript too short to summarize');
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const fullName = profile?.full_name || profile?.fullName || 'the candidate';
  const firstInterviewer = (contacts || []).find(c => c.kind === 'interviewer') || (contacts || [])[0];
  const thankYouTo = firstInterviewer ? `${firstInterviewer.name}${firstInterviewer.title ? ` (${firstInterviewer.title})` : ''}` : '(the interviewer)';

  const prompt = `Process this interview transcript or note dump into a structured debrief + a ready-to-send thank-you email. The candidate is ${fullName}, interviewing for the ${app.role} role at ${app.company}.

Output ONLY a JSON object with this exact shape:

{
  "summary": "3-5 sentence narrative of how the interview went overall.",
  "topics_covered": ["up to 10 concise topic labels, each under 60 chars"],
  "strengths": ["up to 5 things the candidate did well, specific to this interview"],
  "watchouts": ["up to 5 concerns to address next round or in follow-up"],
  "follow_ups": ["up to 5 specific next actions for the candidate"],
  "thank_you_draft": "200-350 word thank-you email. Addressed to ${thankYouTo}. Natural, specific to topics discussed, not generic. Sign off with a line break and '${fullName}'."
}

STRICT RULES:
- Ground every claim in what's actually in the transcript. DO NOT invent.
- thank_you_draft should reference 1-2 specific things discussed.
- Keep each list item under 200 chars.
- If transcript is sparse, produce shorter/fewer items rather than padding.

ROLE: ${app.role}
COMPANY: ${app.company}

JOB DESCRIPTION (for context):
${(jdText || '(not available)').slice(0, 2000)}

CANDIDATE RESUME (for context):
${(resumeText || '(not attached)').slice(0, 2000)}

COVER LETTER (for context):
${(coverLetter || '(none)').slice(0, 1500)}

TRANSCRIPT / NOTES:
${transcriptText.slice(0, 12000)}`;

  let raw = '';
  let tokensIn = 0, tokensOut = 0;
  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1800,
      messages: [{ role: 'user', content: prompt }],
    });
    raw = (resp.content?.[0]?.text || '').trim();
    tokensIn = resp.usage?.input_tokens || 0;
    tokensOut = resp.usage?.output_tokens || 0;
  } catch (e) {
    diagLog('debrief model error: ' + e.message);
    throw new Error('Debrief model call failed: ' + e.message);
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    diagLog('debrief: no JSON block in response');
    throw new Error('Could not parse debrief from model output');
  }
  let parsed;
  try { parsed = JSON.parse(match[0]); } catch (e) {
    throw new Error('Could not parse debrief JSON: ' + e.message);
  }

  const clean = (arr, limit) => Array.isArray(arr)
    ? arr.filter(s => typeof s === 'string').slice(0, limit).map(s => s.slice(0, 200))
    : [];

  const row = await db.createApplicationDebrief(tenantId, app.id, {
    input_text: transcriptText.slice(0, 20000),
    summary: String(parsed.summary || '').slice(0, 2000),
    topics_covered: clean(parsed.topics_covered, 10),
    strengths: clean(parsed.strengths, 5),
    watchouts: clean(parsed.watchouts, 5),
    follow_ups: clean(parsed.follow_ups, 5),
    thank_you_draft: String(parsed.thank_you_draft || '').slice(0, 4000),
    generated_by_user_id: userId,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
  });
  return row;
}

module.exports = { buildDebrief };
