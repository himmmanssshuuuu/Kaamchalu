/**
 * Utility to send fire-and-forget webhooks to n8n.
 * Does not wait for response to keep the API responsive.
 */
const callWebhook = (event, data) => {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn(`Webhook skipped: N8N_WEBHOOK_URL not defined for event ${event}`);
    return;
  }

  try {
    // Node 18+ has global fetch. Fallback to node-fetch if needed (though not required for Node 24)
    const fetchFn = typeof fetch === 'function' ? fetch : require('node-fetch');

    // Fire and forget: No await, catch errors to prevent crashing
    fetchFn(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data,
      }),
    }).catch((err) => {
      console.error(`[n8n Webhook Error] Event: ${event} -`, err.message);
    });
  } catch (err) {
    console.error(`[n8n Webhook Init Error] Event: ${event} -`, err.message);
  }
};

module.exports = { callWebhook };
