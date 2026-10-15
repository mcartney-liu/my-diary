# App 侧待办清单（交Web 团队）

>📅 2026-10-14 整理
> 📍这些条目由App 侧（安卓）测试发现或产品侧判断产生，**需要 Web 团队在共享 `src/` 中实现**
> ✅ 已完成的会划掉并标注日期

---

## 一、小麦问答（Agent 能力增强）

### ⭐ TODO-001：创建知识库后，主动提议下一步 ⭐（建议优先做）

**背景**：核实代码后确认——现在小麦问答已经是**真 Agent**（不是只聊天）：

```tsx
// AiChatView.tsx:358-370
const newKb = await wikiAddKb(kbName, kbDesc);              // 真建库（写数据库）
const r = await wikiAIDesignCategories(...);                // AI 自己设计分类结构
for (const c of r.categories) {
  await wikiAddCategory(newKb.id, {...});                    // 逐个真创建分类
}
```

三个 Agent 判断标准全部满足：**有自主决策**（分类结构是它自己设计的）+ **有工具调用**（6-7 个工具会挑着用）+ **有多步执行**（建库→建分类→绑定会话→汇报）。

**问题**：汇报完就结束了，**用户得自己想到"下一步该干嘛"**。

**现状文案**（`AiChatView.tsx:383-393`）：
```
🎉 搞定！已为你创建「XXX」知识库
📂 分类 3 个：...
💡 去「我的 → 知识库」看详情，或者直接在这里开始提问～
```

**建议**：末尾加一句**主动提议 + 可直接点击的动作**：

```
💡 接下来可以：
   · 📥 往里面放资料（我帮你自动整理）
   · 📝 写一篇日记试试
   · ⬅ 去「我的 → 知识库」看详情
```

**为什么值得做**（成本极低，收益明显）：
- 「主动提议下一步」是 Agent 感最强的信号 —— 相比之下"我建好了你说下一步"更像工具
- 引导用户走完价值链（建库 → 汇入资料 → 真正用起来），**建库只是中间态**
- 少改几十字文案，无架构风险

**验收**：新建库后，回复里出现可点击的下一步建议，点击能直接进入汇入流程。

---

## 二、语音功能（WebView 兼容性）

### TODO-002：`VoiceQuickEntry` 补"开场检测"

**现状**：Web 团队已在 `VoiceQuickEntry.tsx` 加了 5 种错误细分提示（`not-allowed` / `no-speech` / `network` / `aborted` / `audio-capture`）+ 自动降级 `setPhase("input")`，**这部分改得很好**。

**还缺一步**：**检测发生在 `rec.start()` 之后**，所以 App 里的用户仍会经历：

```
点麦克风 → 界面显示「录音中... 00:01 00:02」（计时器在跑）
         → 等几秒 → 才弹错误
```

**最糟的是第 2 步**：界面假装在录音，用户会对着手机说话说半天。

**建议**：在 `startRecording()` 开头就判断，不满足条件直接不进"录音中"。

```tsx
const startRecording = () => {
  if (!platform.capabilities.speechRecognition) {
    setError("当前环境不支持语音识别，请用打字");
    setPhase("input");
    return;
  }
  // ...原有逻辑
};
```

**为什么放 `platform.ts` 而不是本地判断**：`platform.ts` 已有 `capabilities.speechRecognition`，业务组件直接问它即可，**不要写 `window.Capacitor` 判断**（见 `docs/APP-SYNC-RULES.md` 第三节）。

⚠️ **注意**：如果未来接了云端 STT（`/api/transcribe`），这个入口应该改成"录音 → 上传 → 拿文字"，而不是简单隐藏。目前后端**还没有** `/api/transcribe` 端点。

---

## 三、文档合并（避免两份说法不一致）

### TODO-003：合并两份 AI 文档

**现状**：`docs/` 下有两份内容可能重叠的文档：
- `AI-MODELS.md` —— App 侧整理的模型归属清单（DeepSeek / Agnes / 智源 bge 系列 + 各功能对应哪个模型）
- `ai-capabilities-and-models.md` —— Web 侧的 AI 能力文档

**风险**：同类问题已经发生过一次 —— `.env.production` 两份副本共用导致 App 出包失效。**文档也会分叉。**

**建议**：合并为一份，或明确分工（一份写"模型是什么"、一份写"能力有哪些"）并在开头互相链接。

---

## 四、对外口径（已落地，勿回退）

### ✅ DONE-001：AI 文案统一为小麦

`2ce5ff6` 已完成「全局 AI 文案统一为小麦」。

**已完成核对**：原用户可见的「🤖 AI 每日总结」（`workers/src/index.js:253`）已改。

**⚠️ 后续注意**：新增 UI 文案时，别再引入 "AI" 字样。产品能力统一称**「小麦」**🌾，视觉标识用麦穗不用机器人 🤖（2026-09-23 拍板，见 `docs/APP-SYNC-RULES.md`）。

---

## 五、已知但暂不需要动的

### 📌 INFO-001：知识库强依赖 DeepSeek Key

`workers/src/wiki.js:39` 读`env.DEEPSEEK_API_KEY`。未配或额度耗尽会降级到 `@cf/meta/llama-3.1-8b-instruct-fp8`，**中文能力明显下降**，知识库质量会掉。

排查用埋点：查 D1 里 `LLM_NO_SECRETS` / `LLM_DEEPSEEK_*` 系列（说明见 `DEPLOY.md:499-506`）。

### 📌 INFO-002：前端 10 个 AI 功能依赖用户自填 API

`src/ai.ts` 有 10 个 `async` 函数走 `getAiProvider()` 读用户设置页填的 endpoint/model/apiKey。**用户不填 Key，这 10 个功能全部失效**（含润色、纠错、荐书、读书笔记开场、模板识别、纪念日推断等）。

后端 5 个场景（每日总结、知识库问答、记忆提取）是开箱即用的，不受此影响。

---

## 优先级建议

| 优先级 | 条目 | 理由 |
|---|---|---|
| **P0** | TODO-001 创建后主动提议 | 成本最低（文案级），Agent 感提升最明显 |
| **P1** | TODO-003 合并两份 AI 文档 | 防止文档分叉，几十行整理工作 |
| **P2** | TODO-002 语音开场检测 | 过渡期改善，可等云端 STT 方案定了再一并处理 |