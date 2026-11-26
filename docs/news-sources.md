# 今日看点 · 频道与内容来源清单

> 最后更新：2026-11-26（根据两轮 RSSHub 实测整理）
> 自建 RSSHub：`https://mydiary-rsshub.mcartneyliu.workers.dev`（下文简写为 `RSSHUB`）
> 60s：`https://mydiary-60s.mcartneyliu.workers.dev`
> 配置位置：`workers/wrangler.toml` 的 `[env.dev.vars]`（正式环境上线时要同步到 `[vars]`）

## 一、已上线的频道

| 频道 | 环境变量 | 当前来源 | 备注 |
|---|---|---|---|
| 📰 新闻 | `NEWS_SOURCES` | `RSSHUB/chinanews?format=json&limit=20&filterout=娱乐\|明星`、`RSSHUB/thepaper/featured?format=json&limit=20`、`60s/v2/60s` | 60s 提供每日微语，也做兜底 |
| 📖 好文 | `NEWS_SOURCES_ARTICLE` | `https://sspai.com/feed`、`RSSHUB/zhihu/daily?format=json` | 少数派走 RSSHub 的 JSON 会超时，所以用源站 RSS |
| 🔭 科普 | `NEWS_SOURCES_SCIENCE` | `RSSHUB/guokr/scientific?format=json` | 10 条全有图 |
| 🧠 心理 | `NEWS_SOURCES_PSY`（不配） | 本地 `PSY_CARDS`（12 张心理小练习） | 中英文都没找到稳定的心理学 RSS |
| 🌙 一句话 | 不需要配置 | 一言 `v1.hitokoto.cn`（诗词 + 文学）+ 本地句库；壁纸来自 `60s/v2/bing` | 一言每天缓存一次 |

## 二、代码已写好、等待接入的频道

| 频道 | 环境变量 | 计划来源 | 前提 |
|---|---|---|---|
| 🏞️ 每日一图 | `NEWS_SOURCES_NATURE` | `RSSHUB/natgeo/dailyphoto?format=json` | 确认 RSSHub Worker 打包了 `natgeo` |
| 🎬 书影 | `NEWS_SOURCES_CULTURE` | `RSSHUB/douban/book/rank?format=json&limit=10`、`RSSHUB/douban/movie/coming?format=json&limit=10`、`RSSHUB/bangumi.tv/calendar/today?format=json` | 确认打包了 `douban`、`bangumi` |

## 三、备用来源（实测能用，暂时不接）

以后要扩充频道或某个来源坏了，可以从这里挑。

| 来源 | 地址 | 条数 | 正文长度 | 有图 | 调性 | 适合的频道 / 暂不接的原因 |
|---|---|---|---|---|---|---|
| 豆瓣·新书速递 | `RSSHUB/douban/book/latest` | 10 | ~200 字 | ✅ | 文化阅读 | 书影频道的备选，和新书榜有重叠 |
| 知乎·盐言每日汇总 | `RSSHUB/zhihu/pin/daily` | 15 | ~2000 字 | ✅ | 职场 / 社会 / 技术 | 可做「职场」频道；和新闻有重叠，调性不太像日记 |
| 知乎·热榜 | `RSSHUB/zhihu/hot` | 30 | ~500 字 | ❌ | 社会热点 | 热点内容不可控，不建议放进日记 |
| 知乎·盐言热榜 | `RSSHUB/zhihu/pin/hotlist` | 15 | ~360 字 | ❌ | 社会短资讯 | 同上 |
| 澎湃·精选（好文用） | `RSSHUB/thepaper/featured` | 5～20 | ~600 字 | 部分 | 严肃新闻 | 已经在新闻频道 |
| 联合早报·实时 | `RSSHUB/zaobao/realtime/china` | 24 | ~1000 字 | 部分 | 实时快讯 | 国际和台湾政治内容较多，需要加 `filterout` |
| 联合早报·中国 | `RSSHUB/zaobao/znews/china` | 24 | 1000～2000 字 | 部分 | 深度报道 | 同上 |
| 少数派（RSSHub） | `RSSHUB/sspai/index` | 10 | 5000～16000 字 | ✅ | 效率 / 生活方式 | 用 XML 格式，JSON 会超时；目前用源站 RSS |

## 四、试过但不可用的来源（不用再试）

| 原因 | 来源 |
|---|---|
| 源站改版 / 路由返回空 | 下厨房 `/xiachufang/popular`、知乎周刊、知乎专栏、知乎热门话题、微博热搜 |
| 需要浏览器渲染（没配 Browser Run） | B 站全部路由、知乎话题 |
| 源站反爬 | 站酷、Behance、Dribbble、36Kr |
| 路由已从 RSSHub 删除 | 马蜂窝、豆瓣小组、一席、单读、Hitokoto（直接调官方接口就行） |
| 没打包进我们的 RSSHub Worker | 美食杰、豆果美食、穷游、携程、中国国家地理、Verywell Mind、Psych Central、Greater Good、Reddit |
| 源站 RSS 本身不可用 | 下厨房、马蜂窝、豆瓣（feed 改版）、Behance（403）、中国国家地理（TLS 失败）、NatGeo 官网（单页应用）、Verywell Mind（402 付费墙）、Psych Central（404）、Greater Good（`/rss` 404）、Psychology Today |
| 没有对应路由 | 人民网 `/people/rmrb`、新华网、虎嗅、界面、简单心理、KnowYourself、壹心理、心理月刊 |
| 公共实例 `rsshub.app` | 国内经常 403，缓存 2 小时，不用 |

## 五、加一个新频道的步骤

1. 后端 `workers/src/index.js`：
   - `NEWS_CHANNELS` 加频道 id
   - `newsSourceList` 加对应的环境变量
   - `CHANNEL_TAGS` 加分类
   - `newsChannelPrompt` 加小麦的挑选提示词
2. 前端 `src/api.ts` 的 `NewsChannel` 类型加 id；`src/components/TodayPage.tsx` 的 `CHANNEL_META` 加图标、名称、介绍，`NEWS_TAG_STYLE` 加分类样式。
3. `wrangler.toml` 配好来源地址并部署。没配来源时，频道广场里会显示「准备中」。
4. 新闻缓存版本号（`news-vN`）加 1。
5. 把来源记到本文档。
