export const handler = async () => {
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true, service: 'AIJay API', ts: Date.now() }),
  };
};
