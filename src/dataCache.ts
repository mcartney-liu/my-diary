// 读取层缓存（stale-while-revalidate 的最小实现）
//
// 解决的问题：路由没有保活，每进一次页面都重新发请求、并且用 loading 遮住整页。
// 这个模块让"已经拿到过的数据"能立刻上屏，网络请求退到后台。
//
// 三个出口：
//   peek(key)      同步读缓存 —— 组件用 useState 初始化，首帧就有数据，不出加载态
//   cachedGet()    带 TTL、并发去重、失败回退旧值
//   invalidate()   写操作后主动失效（下次读会重新请求）
//
// 只缓存"读接口"的结果，不改变任何写路径语义，也不做持久化（内存缓存，刷新即失效）。

type Entry = { data: unknown; at: number };

const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

/** 同步读缓存。没有则返回 undefined。 */
export function peek<T>(key: string): T | undefined {
  return mem.get(key)?.data as T | undefined;
}

export function has(key: string): boolean {
  return mem.has(key);
}

export interface GetOptions {
  /** 缓存有效期（ms）。默认 60s；传 0 表示"只用缓存做先上屏，每次仍去网络"。 */
  ttl?: number;
  /** 强制重新请求（写操作后调用）。 */
  force?: boolean;
}

/**
 * 读接口的统一入口。
 * - 缓存命中且未过期 → 直接返回，不发请求
 * - 同一 key 有请求在飞 → 复用那个 Promise（并发去重）
 * - 请求失败但本地有旧数据 → 返回旧数据，避免把页面打回加载态
 */
export async function cachedGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: GetOptions = {},
): Promise<T> {
  const { ttl = 60_000, force = false } = opts;

  if (!force && ttl > 0) {
    const e = mem.get(key);
    if (e && Date.now() - e.at < ttl) return e.data as T;
  }

  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;

  const p = fetcher()
    .then((data) => {
      mem.set(key, { data, at: Date.now() });
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      const e = mem.get(key);
      if (e) return e.data as T;
      throw err;
    });

  inflight.set(key, p);
  return p;
}

/** 失效所有以 prefix 开头的缓存 key。 */
export function invalidate(prefix: string): void {
  for (const k of [...mem.keys()]) {
    if (k.startsWith(prefix)) mem.delete(k);
  }
}

export function invalidateAll(): void {
  mem.clear();
  inflight.clear();
}
