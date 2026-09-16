import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Bot, Loader2, Sparkles, PenLine } from "lucide-react";
import { detectTemplate, polishTranscript } from "../ai";
import { TEMPLATES } from "../templates";

type Phase = "idle" | "menu" | "recording" | "input" | "processing" | "match";

interface QuickResult {
  templateId: string;
  reason: string;
  transcript: string;
}

function getSpeechRecognition(): any {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function VoiceQuickEntry() {
  const nav = useNavigate();
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [typedText, setTypedText] = useState("");
  const [result, setResult] = useState<QuickResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);
  const finalTextRef = useRef("");

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const startRecording = () => {
    const SR = getSpeechRecognition();
    setError(null);
    if (!SR) { setPhase("input"); return; }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "zh-CN";

    rec.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0].transcript;
        if (r.isFinal) final += t;
        else interim += t;
      }
      if (final) finalTextRef.current += final;
      setTranscript(finalTextRef.current + interim);
    };

    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("浏览器不允许录音，改为手动输入");
      }
    };

    recRef.current = rec;
    finalTextRef.current = "";
    setTranscript("");
    setPhase("recording");
    setElapsed(0);

    const startTs = Date.now();
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTs) / 1000));
    }, 250);

    try { rec.start(); } catch {}
  };

  const runDetect = async (text: string) => {
    setPhase("processing");
    setError(null);
    try {
      const det = await detectTemplate(text);
      setResult({ templateId: det.templateId, reason: det.reason, transcript: text });
      setPhase("match");
    } catch (e) {
      setError((e as Error).message || "AI 分析失败");
      setPhase("input");
    }
  };

  const stopRecording = async () => {
    if (recRef.current) { try { recRef.current.stop(); } catch {} }
    stopTimer();
    const text = (finalTextRef.current || transcript).trim();
    if (!text) {
      setError("没识别到语音，改打字试试");
      setPhase("input");
      return;
    }
    await runDetect(text);
  };

  const submitTyped = async () => {
    const t = typedText.trim();
    if (!t) { setError("写点什么吧～"); return; }
    await runDetect(t);
  };

  const [isAiPolishing, setIsAiPolishing] = useState(false); // 🔑 确认后 AI 润色 loading
  const [showTemplatePicker, setShowTemplatePicker] = useState(false); // 🔑 手动换模板面板

  const confirmAndGo = async () => {
    if (!result) return;
    setIsAiPolishing(true);
    try {
      // 🔑 先在本页面把 AI 跑完（有 loading 遮罩），拿到结果后再跳转
      const polished = await polishTranscript(result.transcript, {
        templateId: result.templateId,
      });
      sessionStorage.setItem("mydiary.quickentry", JSON.stringify({
        transcript: result.transcript,
        templateId: result.templateId,
        ts: Date.now(),
        polished, // 🔑 把 AI 处理好的 blocks/title/tags/mood 一起传过去
      }));
      nav(`/editor?template=${result.templateId}&ai=1&quick=1`);
    } catch (e) {
      // AI 挂了也不怕——存空 polished，EditorPage 有自己的降级逻辑
      sessionStorage.setItem("mydiary.quickentry", JSON.stringify({
        transcript: result.transcript,
        templateId: result.templateId,
        ts: Date.now(),
      }));
      nav(`/editor?template=${result.templateId}&ai=1&quick=1`);
    } finally {
      setIsAiPolishing(false);
    }
  };

  const cancel = () => {
    if (recRef.current) { try { recRef.current.stop(); } catch {} }
    stopTimer();
    finalTextRef.current = "";
    setTranscript("");
    setTypedText("");
    setResult(null);
    setError(null);
    setShowTemplatePicker(false); // 🔑 重置模板选择面板
    setPhase("idle");
    setElapsed(0);
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const matchedTemplate = result ? TEMPLATES.find(t => t.id === result.templateId) : null;

  // 底部按钮样式
  const btnBase = "px-3 py-2 rounded-xl border text-sm transition active:scale-95 select-none flex items-center gap-2";
  const btnClass = phase === "recording"
    ? `${btnBase} bg-paper-accent text-white border-paper-accent animate-pulse`
    : (phase === "processing" || phase === "match")
      ? `${btnBase} bg-paper-surface border-paper-line text-paper-ink/40 cursor-not-allowed`
      : `${btnBase} bg-paper-surface border-paper-line text-paper-ink hover:bg-paper-line/50`;

  const btnLabel = phase === "recording" ? `${fmtTime(elapsed)} · 停止` :
                   phase === "input" ? "AI 快记" :
                   phase === "processing" ? "AI 分析中..." :
                   phase === "match" ? "查看结果" :
                   "AI 快记";

  return (
    <>
      {/* 🔑 AI 润色中全屏遮罩 — 在本页面 loading，完了再跳 */}
      {isAiPolishing && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#faf6ef]/97 backdrop-blur-sm">
          <div className="w-16 h-16 rounded-full border-4 border-paper-line border-t-paper-accent animate-spin" />
          <div className="mt-4 text-paper-ink font-medium flex items-center gap-2">
            <Bot size={18} className="text-paper-ink animate-pulse" />
            AI 正在整理你的日记...
          </div>
          <div className="mt-1 text-sm text-slate-500">稍等几秒，马上好</div>
        </div>
      )}

      {/* 底部导航栏按钮 — 点一下打开菜单（或 toggle 录音中/AI 分析中） */}
      <button
        onClick={() => {
          if (phase === "processing" || phase === "match") return;
          if (phase === "recording") stopRecording();
          else if (phase === "menu" || phase === "input") cancel();
          else setPhase("menu");
        }}
        className={btnClass}
      >
        {phase === "processing" ? <Loader2 size={16} className="animate-spin" /> :
         phase === "match" ? <Bot size={16} /> :
         phase === "recording" ? <Mic size={16} /> :
         <Mic size={16} />}
        <span>{btnLabel}</span>
      </button>

      {/* 底部弹出面板 */}
      {phase !== "idle" && (
        <div className="fixed inset-x-0 bottom-0 z-50 bg-paper-bg border-t border-paper-line shadow-2xl animate-slide-up">
          <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

            {/* ===== 选项菜单：录音 / 文字 ===== */}
            {phase === "menu" && (
              <>
                <div className="flex items-center justify-between">
                  <div className="font-medium text-paper-ink">AI 快记</div>
                  <button onClick={cancel} className="text-paper-ink2 hover:text-paper-ink text-sm">关闭</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={startRecording}
                    className="py-3 rounded-xl bg-paper-surface border border-paper-line hover:bg-paper-line/50 active:scale-95 text-paper-ink text-sm flex flex-col items-center gap-1.5 transition"
                  >
                    <Mic size={20} />
                    <div>语音录音</div>
                    <div className="text-xs text-paper-ink2 text-xs font-normal">说话即记录</div>
                  </button>
                  <button
                    onClick={() => setPhase("input")}
                    className="py-3 rounded-xl bg-paper-surface border border-paper-line hover:bg-paper-line/50 active:scale-95 text-paper-ink text-sm flex flex-col items-center gap-1.5 transition"
                  >
                    <PenLine size={20} />
                    <div>打字输入</div>
                    <div className="text-xs text-paper-ink2 text-xs font-normal">手动写几句话</div>
                  </button>
                </div>
              </>
            )}

            {/* ===== 录音中 ===== */}
            {phase === "recording" && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-paper-line flex items-center justify-center">
                      <span className="w-3 h-3 rounded-full bg-paper-ink animate-pulse" />
                    </div>
                    <div>
                      <div className="font-medium text-paper-ink">正在录音...</div>
                      <div className="text-xs text-paper-ink2">{fmtTime(elapsed)} · 说话中</div>
                    </div>
                  </div>
                  <button onClick={cancel} className="text-paper-ink2 hover:text-paper-ink text-sm">取消</button>
                </div>
                <div className="bg-paper-surface rounded-xl border border-paper-line p-2.5 text-sm text-paper-ink min-h-[40px] max-h-28 overflow-y-auto">
                  {transcript || <span className="text-paper-ink3/60">正在听你说...</span>}
                </div>
                <button
                  onClick={stopRecording}
                  className="w-full py-3 rounded-xl bg-paper-surface border border-paper-line hover:bg-paper-line/50 active:scale-95 text-paper-ink font-medium flex items-center justify-center gap-3"
                >
                  <div className="w-3 h-3 bg-white rounded-sm" />
                  停止录音 · {fmtTime(elapsed)}
                </button>
              </>
            )}

            {/* ===== 手动输入 ===== */}
            {phase === "input" && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PenLine size={18} className="text-paper-ink" />
                    <div className="font-medium text-paper-ink">文字输入</div>
                  </div>
                  <button onClick={cancel} className="text-paper-ink2 hover:text-paper-ink text-sm">取消</button>
                </div>
                <textarea
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value)}
                  placeholder="写一句话，比如：今天花了50块买奶茶"
                  rows={3}
                  className="w-full bg-paper-surface rounded-xl border border-paper-line p-2.5 text-base text-paper-ink resize-none focus:outline-none focus:border-paper-accent min-h-[80px]"
                />
                <button
                  onClick={submitTyped}
                  disabled={!typedText.trim()}
                  className="w-full py-3 rounded-xl bg-paper-surface border border-paper-line text-paper-ink font-medium hover:bg-paper-line/50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ✨ AI 分析这句话
                </button>
              </>
            )}

            {/* ===== AI 处理中 ===== */}
            {phase === "processing" && (
              <div className="flex items-center gap-3 py-4">
                <Loader2 size={22} className="animate-spin text-paper-ink" />
                <div>
                  <div className="font-medium text-paper-ink">AI 正在分析...</div>
                  <div className="text-xs text-paper-ink2">识别意图 → 匹配模板</div>
                </div>
              </div>
            )}

            {/* ===== 匹配结果 ===== */}
            {phase === "match" && result && matchedTemplate && (
              <>
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-paper-ink" />
                  <div className="font-medium text-paper-ink">AI 推荐模板</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-4xl">{matchedTemplate.icon}</div>
                  <div>
                    <div className="font-semibold text-paper-ink text-lg">{matchedTemplate.name}</div>
                    <div className="text-xs text-paper-ink2">{matchedTemplate.description}</div>
                    {/* 🔑 reason: AI 自动推荐时显示，手动换的就不显示 AI 理由 */}
                    {!result.reason.startsWith("你手动") && (
                      <div className="text-xs text-paper-ink mt-1">🤖 {result.reason}</div>
                    )}
                  </div>
                </div>

                {/* 🔑 文字可编辑 —— 改 AI 识别错的地方 */}
                <div className="space-y-1">
                  <div className="text-[11px] text-paper-ink3 flex items-center justify-between">
                    <span>你说（可编辑）</span>
                    {result.transcript.length > 100 && (
                      <span>{result.transcript.length} 字</span>
                    )}
                  </div>
                  <textarea
                    value={result.transcript}
                    onChange={(e) => setResult(prev => prev && { ...prev, transcript: e.target.value })}
                    rows={Math.min(3, Math.max(2, Math.ceil(result.transcript.length / 30)))}
                    className="w-full bg-paper-surface rounded-xl border border-paper-line p-2 text-sm text-paper-ink resize-none focus:outline-none focus:border-paper-accent min-h-[40px] max-h-28"
                  />
                </div>

                {/* 🔑 换模板面板 —— 点击"🔀 换个模板"展开 */}
                {showTemplatePicker && (
                  <div className="bg-paper-surface rounded-xl border border-paper-line p-2">
                    <div className="text-[11px] text-paper-ink3 mb-2 px-1">选择模板</div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {TEMPLATES.map(tpl => {
                        const selected = tpl.id === result.templateId;
                        return (
                          <button
                            key={tpl.id}
                            onClick={() => {
                              setResult(prev => prev && {
                                ...prev,
                                templateId: tpl.id,
                                reason: `你手动选择了 ${tpl.name}`,
                              });
                              setShowTemplatePicker(false);
                            }}
                            className={`py-2 rounded-lg text-center transition active:scale-95 ${
                              selected
                                ? "bg-paper-accent/15 border border-paper-accent text-paper-ink"
                                : "bg-paper-bg border border-paper-line text-paper-ink2 hover:bg-paper-line/30"
                            }`}
                          >
                            <div className="text-xl leading-none">{tpl.icon}</div>
                            <div className="text-[10px] mt-0.5 truncate">{tpl.name}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 按钮区 —— 加了"🔀 换个模板" */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={cancel}
                    className="flex-1 py-2.5 rounded-xl border border-paper-line text-paper-ink2 text-sm hover:bg-paper-surface"
                  >
                    重新输入
                  </button>
                  <button
                    onClick={() => setShowTemplatePicker(v => !v)}
                    className={`flex-1 py-2.5 rounded-xl border text-sm transition ${
                      showTemplatePicker
                        ? "bg-paper-accent/15 border-paper-accent text-paper-ink"
                        : "border-paper-line text-paper-ink2 hover:bg-paper-surface"
                    }`}
                  >
                    🔀 换模板
                  </button>
                  <button
                    onClick={confirmAndGo}
                    className="flex-[2] py-2.5 rounded-xl bg-paper-surface border border-paper-accent text-paper-ink text-sm font-medium hover:bg-paper-accent/10 active:scale-95"
                  >
                    ✨ 用这个模板
                  </button>
                </div>
              </>
            )}

            {/* 错误提示 */}
            {error && (
              <div className="bg-amber-50 text-amber-800 text-sm rounded-lg px-3 py-2 border border-amber-200">
                ⚠️ {error}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
