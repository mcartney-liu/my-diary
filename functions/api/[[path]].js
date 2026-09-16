export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const isDev = request.headers.get('host')?.includes('-dev.pages.dev');
  const workerHost = isDev
    ? 'mydiary-api-dev.mcartneyliu.workers.dev'
    : 'mydiary-api.mcartneyliu.workers.dev';
  const workerUrl = 'https://' + workerHost + url.pathname + url.search;
  const headers = new Headers(request.headers);
  headers.delete('host');
  return fetch(workerUrl, { method: request.method, headers: headers, body: request.body });
}