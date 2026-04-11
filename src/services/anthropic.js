const Anthropic = require('@anthropic-ai/sdk');

let _client = null;
function getClient() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

const COVER_LETTER_SYSTEM = `You are writing a cover letter for Everett Steele, a senior executive and veteran.

CRITICAL OUTPUT RULES:
- Begin your response with the FIRST SENTENCE OF THE LETTER. Nothing else before it.
- Do NOT include any preamble, disclaimers, notes, meta-commentary, or explanations of what you are doing.
- Do NOT write things like "The job description didn't load" or "I'll write based on" or "Note:" or any separator like "---".
- Do NOT use markdown bold (**text**) or any other markdown formatting. Plain text only.
- If the job description is incomplete, write the best letter you can from the available context. Do not mention the gap.

VOICE AND STYLE:
- First person. Direct and declarative. No filler phrases. No "I am excited to" openings.
- Start with a strong statement tied specifically to the role.

EVERETT'S BACKGROUND:
Veteran (US Army, Infantry Recon Platoon Leader, Baghdad). 3 successful exits as founder/CEO. SVP Operations at ChartRequest: scaled from $2M to $16M ARR, 40 to 180+ employees across 4 countries in under 3 years. Built full operating infrastructure: EOS, scorecards, OKRs, cross-functional accountability systems. Chief of Staff to Atlanta City Council/Mayor Andre Dickens. UX/Product Director at UpTogether (1.25M members). Forbes Disruptor in Logistics. ABC 40 Under 40. LEAD Atlanta Fellow. Currently building Meridian, an AI-native venture studio.

FORMAT:
3-4 paragraphs. Under 350 words. No sign-off needed. Output the letter text only.`;

const VARIANT_LABELS = {
  operator: 'Integrator/COO — EOS, scaling, building the operational machine',
  partner: 'Chief of Staff — right-hand to CEO, strategic ops, force multiplier',
  builder: 'VP/SVP Operations — multi-function ownership, revenue ops, GTM, cross-functional',
  innovator: 'AI/Special Projects — AI, automation, innovation, special initiatives',
};

function cleanCoverLetterText(raw) {
  if (!raw) return '';
  let text = raw.trim();
  const sepIdx = text.indexOf('---');
  if (sepIdx > -1) {
    const afterSep = text.slice(sepIdx + 3).trim();
    if (afterSep.length > 100) text = afterSep;
  }
  const metaPatterns = [
    /^the job description/i, /^i(?:'m| am) working with/i, /^i(?:'ll| will) write/i,
    /^since the (job|jd|description)/i, /^note:/i, /^based on the/i, /^working from/i,
  ];
  const lines = text.split('\n');
  let startIdx = 0;
  while (startIdx < lines.length && metaPatterns.some(p => p.test(lines[startIdx].trim()))) startIdx++;
  text = lines.slice(startIdx).join('\n').trim();
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
  return text;
}

async function selectResumeVariant(appRecord, jdText) {
  if (!process.env.ANTHROPIC_API_KEY) return 'operator';
  try {
    const client = getClient();
    const prompt = `Based on this job description, pick the single best resume variant for Everett Steele to use.

VARIANTS:
- operator: Integrator/COO role. JD uses EOS, Integrator, or scaling context. Operator brought in to build the machine.
- partner: Chief of Staff role. Right-hand-to-CEO, force multiplier, strategic ops, executive leverage.
- builder: VP/SVP Operations role. Owns multiple functions, revenue ops, CS, GTM alignment, cross-functional accountability.
- innovator: AI/Special Projects role. AI, automation, innovation, or explicit special initiatives scope.

RULES:
- If the JD uses "Integrator" language explicitly, always pick operator.
- If the title says "Chief of Staff", pick partner.
- For roles that fit two categories, default to the one matching the JD title.
- Respond with ONLY the single word: operator, partner, builder, or innovator. Nothing else.

ROLE: ${appRecord.role} at ${appRecord.company}
JOB DESCRIPTION:
${jdText.slice(0, 2000)}`;

    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = (resp.content?.[0]?.text || '').trim().toLowerCase();
    if (['operator', 'partner', 'builder', 'innovator'].includes(raw)) return raw;
    return 'operator';
  } catch (e) {
    console.error('[selectResumeVariant]', e.message);
    return 'operator';
  }
}

async function generateCoverLetter(appRecord, jdText) {
  const client = getClient();
  const prompt = `ROLE: ${appRecord.role} at ${appRecord.company}\n\nJOB DESCRIPTION:\n${jdText.slice(0, 3000)}\n\nNotes about this role: ${appRecord.notes || 'None'}\n\nWrite the cover letter now. Start immediately with the first sentence.`;

  const resp = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 700,
    system: [{ type: 'text', text: COVER_LETTER_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: prompt }],
  });
  const raw = resp.content?.[0]?.text || '';
  return cleanCoverLetterText(raw);
}

async function fetchJobDescription(url) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; hopespot/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) return '';
    const html = await resp.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#039;/g, "'")
      .replace(/\s{2,}/g, ' ').trim().slice(0, 4000);
  } catch (e) { return ''; }
}

module.exports = {
  COVER_LETTER_SYSTEM,
  VARIANT_LABELS,
  cleanCoverLetterText,
  selectResumeVariant,
  generateCoverLetter,
  fetchJobDescription,
};
