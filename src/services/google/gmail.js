const { google } = require('googleapis');
const { getAuthedClient } = require('./auth');

async function getGmail(userId) {
  const auth = await getAuthedClient(userId);
  if (!auth) throw new Error('Gmail not connected. Connect your Google account in Settings.');
  return google.gmail({ version: 'v1', auth });
}

// Build a raw RFC 2822 email string
function buildRawEmail({ to, from, subject, body, replyToMessageId }) {
  const headers = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
  ];
  if (replyToMessageId) {
    headers.push(`In-Reply-To: ${replyToMessageId}`);
    headers.push(`References: ${replyToMessageId}`);
  }
  const message = headers.join('\r\n') + '\r\n\r\n' + body;
  return Buffer.from(message).toString('base64url');
}

// Create a draft email in the user's Gmail
async function createDraft(userId, { to, subject, body, from }) {
  const gmail = await getGmail(userId);
  const raw = buildRawEmail({ to, from: from || 'me', subject, body });
  const { data } = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { raw } },
  });
  return { draftId: data.id, messageId: data.message?.id };
}

// Create multiple drafts (for batch outreach)
async function createDrafts(userId, emails) {
  const results = [];
  for (const email of emails) {
    try {
      const result = await createDraft(userId, email);
      results.push({ ...result, to: email.to, status: 'created' });
    } catch (e) {
      results.push({ to: email.to, status: 'failed', error: e.message });
    }
    // Rate limit: small delay between drafts
    await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

// Send an email directly
async function sendEmail(userId, { to, subject, body, from, threadId }) {
  const gmail = await getGmail(userId);
  const raw = buildRawEmail({ to, from: from || 'me', subject, body });
  const requestBody = { raw };
  if (threadId) requestBody.threadId = threadId;
  const { data } = await gmail.users.messages.send({
    userId: 'me',
    requestBody,
  });
  return { messageId: data.id, threadId: data.threadId };
}

// List sent emails (for tracking outreach)
async function listSentEmails(userId, { maxResults, after } = {}) {
  const gmail = await getGmail(userId);
  let q = 'in:sent';
  if (after) q += ` after:${after}`;
  const { data } = await gmail.users.messages.list({
    userId: 'me',
    q,
    maxResults: maxResults || 50,
  });
  if (!data.messages?.length) return [];

  const messages = [];
  for (const msg of data.messages.slice(0, 30)) {
    try {
      const { data: full } = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['To', 'Subject', 'Date'],
      });
      const headers = full.payload?.headers || [];
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      messages.push({
        id: full.id,
        threadId: full.threadId,
        to: getHeader('To'),
        subject: getHeader('Subject'),
        date: getHeader('Date'),
        snippet: full.snippet,
      });
    } catch (e) { continue; }
  }
  return messages;
}

// Check for replies to a specific thread
async function getThreadReplies(userId, threadId) {
  const gmail = await getGmail(userId);
  const { data } = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'metadata',
    metadataHeaders: ['From', 'To', 'Subject', 'Date'],
  });
  return (data.messages || []).map(msg => {
    const headers = msg.payload?.headers || [];
    const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
    return {
      id: msg.id,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      snippet: msg.snippet,
      labelIds: msg.labelIds,
    };
  });
}

module.exports = { createDraft, createDrafts, sendEmail, listSentEmails, getThreadReplies };
