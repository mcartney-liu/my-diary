import { useEffect, useRef, useState } from "react";
import { Loader2, Share2, Trash2, Upload } from "lucide-react";
import { listPapers, savePaper, deletePaper, sharePaper, type UserPaper } from "../api";

export default function PaperLibrary() {
  const [mine, setMine] = useState<UserPaper[]>([]);
  const [pub, setPub] = useState<UserPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"mine" | "public">("mine");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([listPapers("mine"), listPapers("public")]);
      setMine(m.papers);
      setPub(p.papers);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const imageData = reader.result as string;
        const name = file.name.replace(/\.[^.]+$/, "");
        await savePaper({ name: name || "未命名信纸", image_data: imageData });
        await load();
        setUploading(false);
      };
      reader.onerror = () => { setUploading(false); alert("读取图片失败"); };
      reader.readAsDataURL(file);
    } catch (e: any) {
      alert("上传失败: " + (e?.message || e));
      setUploading(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`删除信纸"${name}"？`)) return;
    await deletePaper(id);
    await load();
  }

  async function handleShare(p: UserPaper) {
    const newVal = !p.is_public;
    if (newVal && !confirm(`确认共享？共享后所有人都能看到"${p.name}"`)) return;
    await sharePaper(p.id, newVal);
    await load();
  }

  const list = tab === "mine" ? mine : pub;

  return (
    <div className="space-y-4">
      {/* 温暖说明 */}
      <div className="text-[12px] text-paper-ink2 italic leading-relaxed px-1">
        🎨 一张好的信纸，能让文字也变得温柔。建议上传浅色、低对比度的底图，这样写起字来才不费眼睛。
        喜欢的信纸可以共享出去，让大家一起用你发现的美好。
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-paper-surface rounded-xl border border-paper-line">
          <button
            onClick={() => setTab("mine")}
            className={`px-4 py-1.5 rounded-lg text-sm transition ${tab === "mine" ? "bg-white shadow-sm text-paper-ink font-medium" : "text-paper-ink2"}`}
          >👤 我的 ({mine.length})</button>
          <button
            onClick={() => setTab("public")}
            className={`px-4 py-1.5 rounded-lg text-sm transition ${tab === "public" ? "bg-white shadow-sm text-paper-ink font-medium" : "text-paper-ink2"}`}
          >🌐 共享 ({pub.length})</button>
        </div>
        {tab === "mine" && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition disabled:opacity-50"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              上传
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-paper-ink3"><Loader2 className="animate-spin inline" /> 加载中...</div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 text-paper-ink3 text-sm">
          {tab === "mine" ? "还没有自定义信纸，点右上角「上传」开始吧" : "暂时还没有人共享信纸"}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {list.map((p) => (
            <div key={p.id} className="relative group">
              <div
                className="aspect-[3/4] rounded-xl border-2 border-paper-line overflow-hidden cursor-pointer bg-white"
                style={{
                  backgroundImage: `url(${p.thumbnail || p.image_data})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
                title={p.name}
              >
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                  <div className="text-[10px] text-white truncate font-medium">{p.name}</div>
                </div>
                {p.is_public && (
                  <span className="absolute top-1 left-1 text-[9px] px-1 py-0.5 rounded bg-emerald-500 text-white">🌐</span>
                )}
              </div>
              {p.is_owner && (
                <div className="absolute -top-1 -right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    title={p.is_public ? "取消共享" : "共享"}
                    onClick={() => handleShare(p)}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-white shadow ${p.is_public ? "bg-emerald-500" : "bg-paper-ink2 hover:bg-emerald-500"}`}
                  ><Share2 size={10} /></button>
                  <button
                    title="删除"
                    onClick={() => handleDelete(p.id, p.name)}
                    className="w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow"
                  ><Trash2 size={10} /></button>
                </div>
              )}
              {!p.is_owner && p.author_name && (
                <div className="text-[9px] text-paper-ink3 mt-1 truncate text-center">by {p.author_name}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
