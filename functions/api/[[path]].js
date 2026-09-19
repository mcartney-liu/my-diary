export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const host = request.headers.get('host') || '';
  // dev 判断覆盖三种情况：
  //   1. mydiary-web-dev.pages.dev      （独立 dev 项目，手册规定的）
  //   2. dev.mydiary-web.pages.dev      （prod 项目的 Preview 分支别名）
  //   3. hash-dev.pages.dev             （Preview 分支的 hash 部署）
  const isDev = host.includes('mydiary-web-dev.pages.dev')
             || host.includes('dev.mydiary-web.pages.dev')
             || host.includes('-dev.pages.dev');
  const workerHost = isDev
    ? 'mydiary-api-dev.mcartneyliu.workers.dev'
    : 'mydiary-api.mcartneyliu.workers.dev';
  const workerUrl = 'https://' + workerHost + url.pathname + url.search;
  const headers = new Headers(request.headers);
  headers.delete('host');
  return fetch(workerUrl, { method: request.method, headers: headers, body: request.body });
}
