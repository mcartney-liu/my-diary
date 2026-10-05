import { useState } from "react";
import { patchProfile } from "../api";

/**
 * 新用户问卷：身份 → 兴趣 → 欢迎 + 推荐知识库
 * 流程：首次注册登录 → CalendarPage 检测 onboarding_done === 0 → 弹出
 */

const IDENTITY_OPTIONS = [
  { key: "student", label: "👨‍🎓 学生", desc: "记录学习日常" },
  { key: "worker", label: "💼 职场人", desc: "工作复盘 · 职场心情" },
  { key: "creative", label: "🎨 创作者", desc: "灵感笔记 · 素材整理" },
  { key: "parent", label: "👪 家长", desc: "育儿日常 · 家庭回忆" },
  { key: "freelancer", label: "🏖️ 自由职业", desc: "项目记录 · 生活工作平衡" },
  { key: "other", label: "✨ 其他", desc: "慢慢摸索自己的节奏" },
];

const INTEREST_OPTIONS = [
  { key: "food", label: "🍜 美食", kb: "家常菜谱大全" },
  { key: "reading", label: "📚 读书", kb: "读书笔记" },
  { key: "fitness", label: "💪 健身", kb: "健身日志" },
  { key: "travel", label: "✈️ 旅行", kb: "旅行足迹" },
  { key: "tech", label: "💻 科技", kb: "科技笔记" },
  { key: "emotion", label: "💭 情感", kb: "情感随笔" },
  { key: "career", label: "📈 职场", kb: "职场进阶" },
  { key: "law", label: "⚖️ 法律", kb: "法律常识" },
  { key: "finance", label: "💰 理财", kb: "理财入门" },
  { key: "health", label: "🌿 健康", kb: "健康养生" },
];

interface Props {
  nickname?: string;
  /** 完成后调用（存库 + 标记 done） */
  onComplete: () => void;
  /** 跳过 */
  onSkip: () => void;
}

export default function OnboardingWizard({ nickname, onComplete, onSkip }: Props) {
  const [step, setStep] = useState(0); // 0=身份 1=兴趣 2=欢迎
  const [identity, setIdentity] = useState<string>("");
  const [interests, setInterests] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggleInterest = (k: string) => {
    setInterests(prev =>
      prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      await patchProfile({
        identity,
        interests: JSON.stringify(interests),
        onboarding_done: 1,
      });
      onComplete();
    } catch {
      alert("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const recommendedKBs = INTEREST_OPTIONS.filter(i => interests.includes(i.key));
  void recommendedKBs; // 保留：以后接真实官方预设 API 时恢复

  return (
    <div className="fixed inset-0 z-[100] bg-paper-bg flex flex-col">
      {/* 顶部进度 + 跳过 */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                i <= step ? "w-6 bg-paper-accent" : "w-3 bg-paper-line"
              }`}
            />
          ))}
        </div>
        {step < 2 && (
          <button
            onClick={onSkip}
            className="text-xs text-paper-ink3 hover:text-paper-ink transition"
          >
            跳过 →
          </button>
        )}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto px-6 pt-4 pb-24">
        {step === 0 && (
          <div>
            <h2 className="text-xl font-bold text-paper-ink">
              Hi {nickname || "朋友"} 👋
            </h2>
            <p className="text-sm text-paper-ink2 mt-2">你现在的身份是？</p>
            <div className="grid grid-cols-2 gap-3 mt-5">
              {IDENTITY_OPTIONS.map(o => (
                <button
                  key={o.key}
                  onClick={() => setIdentity(o.key)}
                  className={`p-4 rounded-xl border-2 text-left transition active:scale-[0.98] ${
                    identity === o.key
                      ? "border-paper-accent bg-paper-accent/5"
                      : "border-paper-line/70 hover:border-paper-ink3 bg-white"
                  }`}
                >
                  <div className="text-base font-medium text-paper-ink">{o.label}</div>
                  <div className="text-[11px] text-paper-ink3 mt-0.5">{o.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold text-paper-ink">
              平时对什么感兴趣？
            </h2>
            <p className="text-sm text-paper-ink2 mt-2">多选几项，小麦帮你推荐知识库</p>
            <div className="flex flex-wrap gap-2 mt-5">
              {INTEREST_OPTIONS.map(o => {
                const active = interests.includes(o.key);
                return (
                  <button
                    key={o.key}
                    onClick={() => toggleInterest(o.key)}
                    className={`px-3.5 py-2 rounded-full text-sm border transition active:scale-95 ${
                      active
                        ? "bg-paper-accent text-white border-paper-accent"
                        : "bg-white text-paper-ink2 border-paper-line/70 hover:border-paper-ink3"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="text-center py-6">
              <div className="text-5xl mb-3">🌾</div>
              <h2 className="text-xl font-bold text-paper-ink">
                欢迎加入 MyDiary
              </h2>
              <p className="text-sm text-paper-ink2 mt-2 leading-relaxed">
                好啦，小麦已经记住你的身份和喜好啦～
              </p>
            </div>

            <div className="space-y-3 mt-2">
              <div className="flex gap-3 p-3 rounded-xl bg-white border border-paper-line/70">
                <span className="text-xl">🎯</span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-paper-ink">更懂你的小麦</div>
                  <div className="text-[12px] text-paper-ink3 mt-0.5">
                    知道你是{identity ? IDENTITY_OPTIONS.find(o => o.key === identity)?.label.replace(/^.\s/, '') : "谁"}，
                    以后 AI 总结、记忆提取都会更贴合你的生活
                  </div>
                </div>
              </div>
              {interests.length > 0 && (
                <div className="flex gap-3 p-3 rounded-xl bg-white border border-paper-line/70">
                  <span className="text-xl">💡</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-paper-ink">推荐模板和灵感</div>
                    <div className="text-[12px] text-paper-ink3 mt-0.5">
                      对{interests.slice(0, 3).map(k => INTEREST_OPTIONS.find(o => o.key === k)?.label.replace(/^.\s/, '')).join("、")}感兴趣，
                      写日记时会优先给你相关的模板和建议
                    </div>
                  </div>
                </div>
              )}
            </div>

            <p className="text-[11px] text-paper-ink3 text-center mt-4">
              这些都可以在「我的」页面随时改哦
            </p>
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="absolute bottom-0 left-0 right-0 p-5 bg-paper-bg/95 backdrop-blur border-t border-paper-line/60">
        <button
          disabled={saving || (step === 0 && !identity) || (step === 1 && interests.length === 0)}
          onClick={() => {
            if (step < 2) setStep(step + 1);
            else save();
          }}
          className="w-full py-3 rounded-full bg-paper-ink text-paper-bg font-medium text-sm disabled:opacity-40 active:scale-[0.98] transition"
        >
          {step === 2 ? (saving ? "保存中..." : "开始写日记 ✨") : "下一步"}
        </button>
      </div>
    </div>
  );
}
