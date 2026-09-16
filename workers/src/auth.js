// Cloudflare Workers — 纯前端加密工具（Web Crypto API）
// PBKDF2 密码哈希 + JWT (HS256) 签名

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** PBKDF2-SHA256 密码哈希（Cloudflare Workers 支持） */
export async function hashPassword(password, salt) {
  const saltBytes = typeof salt === "string" ? hexToBytes(salt) : salt;
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" },
    key, 32 * 8
  );
  return bytesToHex(new Uint8Array(hash));
}

/** 验证密码：比较 hash */
export async function verifyPassword(password, hash, salt) {
  const actual = await hashPassword(password, salt);
  return actual === hash;
}

/** 生成 16 字节随机盐（hex） */
export function genSalt() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
}

/** JWT HS256 签名 */
export async function signJWT(payload, secret, expSec = 7 * 24 * 3600) {
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expSec };
  const h = btoa(JSON.stringify(header)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const p = btoa(JSON.stringify(body)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${h}.${p}`));
  const s = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${h}.${p}.${s}`;
}

/** 验证 JWT 并返回 payload */
export async function verifyJWT(token, secret) {
  try {
    const [h, p, s] = token.split(".");
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const ok = await crypto.subtle.verify("HMAC", key, base64UrlDecode(s), encoder.encode(`${h}.${p}`));
    if (!ok) return null;
    const payload = JSON.parse(decoder.decode(base64UrlDecode(p)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

/** 从 Authorization header 提取用户（中间件） */
export async function authUser(request, secret) {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return verifyJWT(auth.slice(7), secret);
}

// ===== helpers =====
function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function base64UrlDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
