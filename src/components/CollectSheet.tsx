import { useEffect, useState } from "react";
import { kbCollect, kbQuickCreate } from "../api";
import { toast } from "../uiFeedback";
import { registerModalClose } from "../uiModalStack";

// 「＋ 收进知识库」：粘贴一段文字 → 小麦自动判断放进哪个知识库 → 后台自动整理
// 都不合适时，给一个建议的新库名，点一下就建好并收进去
export default function CollectSheet({ open, onClose, defaultKbId, onDone, initialText }: {
  open: boolean; onClose: () => void; defaultKbId?: string; onDone?: (kbId: string) => void;
  /** 预填内容（比如从今日看点「收进知识库」带进来的文章） */
  initialText?: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [choose, setChoose] = useState<{ suggest: string; kbs: { id: string; title: string }[] } | null>(null);
  const [newName, setNewName] = useState("");

  useEffect(() => { if (open) return registerModalClose(onClose); }, [open, onClose]);
  useEffect(() => { if (!open) { setText(""); setChoose(null); setNewName(""); } else if (initialText) setText(initialText); }, [open, initialText]);
  if (!open) return null;

  async function submit(kbId?: string) {
    const t = text.trim();
    if (t.length < 2) { toast("先粘贴或写点内容吧"); return; }
    setBusy(true);
    try {
      const r = await kbCollect({ text: t, kb_id: kbId ?? defaultKbId });
      if (r.ok && r.kb) {
        toast(`已收进「${r.kb.title}」，小麦正在整理 🌾`, "ok");
        onDone?.(r.kb.id);
        onClose();
      } else if (r.need_kb) {
        setChoose({ suggest: r.suggest_name || "", kbs: r.kbs || [] });
        setNewName(r.suggest_name || "");
      }
    } catch { toast("没收进去，稍后再试", "error"); }
    finally { setBusy(false); }
  }

  async function createAndCollect() {
    const name = newName.trim();
    if (!name) { toast("给新知识库起个名字"); return; }
    setBusy(true);
    try {
      const r = await kbQuickCreate(name, text.trim().slice(0, 120));
      await submit(r.kb.id);
    } catch (e: any) {
      toast(String(e?.message || "").startsWith("409") ? "已经有同名知识库了" : "建库失败，稍后再试", "error");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative w-full sm:max-w-lg bg-paper-card rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 footer-safe" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-paper-ink">📥 收进知识库</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-paper-surface text-paper-ink2">✕</button>
        </div>
        {!choose ? (
          <>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="粘贴一段文章、菜谱、读书摘抄、链接说明……小麦会帮你放进合适的知识库并整理好"
              className="w-full resize-none rounded-2xl bg-paper-surface border border-paper-line/70 px-3.5 py-3 text-sm text-paper-ink outline-none focus:border-paper-accent"
            />
            <button type="button" disabled={busy} onClick={() => submit()}
              className="mt-3 w-full py-2.5 rounded-2xl bg-paper-accent text-white text-sm font-medium disabled:opacity-60">
              {busy ? "小麦在看放哪儿…" : "交给小麦"}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-paper-ink2">这段内容和现有的知识库都不太搭，放哪儿？</p>
            <div className="flex items-center gap-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="新知识库名字"
                className="flex-1 h-10 rounded-xl bg-paper-surface border border-paper-line/70 px-3 text-sm outline-none focus:border-paper-accent" />
              <button type="button" disabled={busy} onClick={createAndCollect}
                className="shrink-0 h-10 px-4 rounded-xl bg-paper-accent text-white text-sm disabled:opacity-60">新建并收进</button>
            </div>
            {choose.kbs.length > 0 && (
              <>
                <div className="text-xs text-paper-ink3">或者放进已有的：</div>
                <div className="flex flex-wrap gap-2">
                  {choose.kbs.map((k) => (
                    <button key={k.id} type="button" disabled={busy} onClick={() => submit(k.id)}
                      className="text-sm px-3 py-1.5 rounded-full border border-paper-line/70 bg-paper-surface hover:bg-paper-line/40 disabled:opacity-60">
                      {k.title}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
