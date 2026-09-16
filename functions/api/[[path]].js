// Pages Function: catch-all /api/* -> forward to Worker
export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const workerUrl = 'https://mydiary-api.mcartneyliu.workers.dev' + url.pathname + url.search;
  const newRequest = new Request(workerUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
  try {
    const response = await fetch(newRequest);
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(response.body, { status: response.status, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'upstream: ' + e.message }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    });
  }
}
