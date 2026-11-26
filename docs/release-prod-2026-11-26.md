# 正式环境上线清单（2026-11-26）

> 分支：`feat/xiaomai-today-2026-11-25` → `main`
> 正式环境：Worker `mydiary-api`（D1 `mydiary-db`），Pages `mydiary-web`（app.callmydiary.online）
> 原则：**每一步做完都要确认再继续**；出问题就按第六节回滚。

## 一、上线前检查
- [ ] 测试环境（分支预览地址）全部功能验收通过（2026-11-26 已通过）
- [ ] 本机和另一台的 `feat/xiaomai-today-2026-11-25` HEAD 一致，`git status` 干净
- [ ] `npm run build`、`npm run lint`、`node --check workers/src/index.js` 都通过
- [ ] **确认 Cloudflare Pages 有没有开「push main 自动部署」**（README 和 DEPLOY.md 说法不一致）。开着的话，合并 main 的那一刻正式前端就会更新，所以**第三步（后端）要排在合并 main 之前**
- [ ] 选一个用户少的时间段（比如晚上 11 点以后，避开 12:00 的演示账号重置定时任务）

## 二、备份正式数据库
```
npx wrangler d1 export mydiary-db --remote --output=backup-prod-2026-11-26.sql
```
- [ ] 备份文件存在、大小正常。**这个文件里是用户数据，不要提交进 git**

## 三、正式数据库补表
测试库这次补过 `chat_sessions`，正式库也要执行，否则小麦对话历史同步会报 500：
```
npx wrangler d1 execute mydiary-db --remote --file=migrations/0022_chat_sessions.sql
```
- `news_daily`（每日新闻快照）在第一次用到时会自动建表，不用手动执行
- [ ] 执行一下 `SELECT name FROM sqlite_master WHERE type='table'`，确认有 `chat_sessions`

## 四、正式环境配置（`workers/wrangler.toml`）
正式环境的服务绑定（`NEWS_60S`、`NEWS_RSSHUB`）和定时任务已经有了，**还缺今日看点的来源**。在顶层 `[vars]` 下加上（和 dev 一样，RSSHub / 60s 两个环境共用）：
```toml
NEWS_SOURCES = "https://mydiary-rsshub.mcartneyliu.workers.dev/chinanews?format=json&limit=20&filterout=娱乐|明星, https://mydiary-rsshub.mcartneyliu.workers.dev/thepaper/featured?format=json&limit=20, https://mydiary-60s.mcartneyliu.workers.dev/v2/60s"
NEWS_60S_URL = "https://mydiary-60s.mcartneyliu.workers.dev/v2/60s"
NEWS_SOURCES_ARTICLE = "https://sspai.com/feed, https://mydiary-rsshub.mcartneyliu.workers.dev/zhihu/daily?format=json"
NEWS_SOURCES_SCIENCE = "https://mydiary-rsshub.mcartneyliu.workers.dev/guokr/scientific?format=json"
NEWS_SOURCES_NATURE = "https://mydiary-rsshub.mcartneyliu.workers.dev/natgeo/dailyphoto?format=json"
NEWS_SOURCES_CULTURE = "https://mydiary-rsshub.mcartneyliu.workers.dev/douban/book/rank?format=json&limit=10, https://mydiary-rsshub.mcartneyliu.workers.dev/douban/movie/coming?format=json&limit=10, https://mydiary-rsshub.mcartneyliu.workers.dev/bangumi.tv/calendar/today?format=json"
```
- [ ] 正式 Worker 的 Secrets 里有 `JWT_SECRET`、`AGNES_ENDPOINT`、`AGNES_API_KEY`、`ADMIN_KEY`（在 Dashboard 里看，和测试环境一样）
- [ ] `npx wrangler deploy --dry-run` 通过，输出里能看到 `NEWS_60S`、`NEWS_RSSHUB` 两个绑定

## 五、上线顺序
1. **部署正式后端**：`npx wrangler deploy`（不带 `--env`）。新后端兼容旧前端，先上后端不会坏
2. 请求 `https://app.callmydiary.online/api/health`，确认正常
3. **合并到 main**：在 GitHub 上把 `feat/xiaomai-today-2026-11-25` 合并到 `main`（建议用 Pull Request，方便以后回看）
4. **部署正式前端**：如果开了自动部署就等它跑完；没开就手动 `npx wrangler pages deploy dist --project-name=mydiary-web`
5. **重建日记向量**：用 `ADMIN_KEY` 跑一次 `workers/scripts/reindex-all.ps1`（目标改成正式地址）。之前修复了「正文从没进检索」，正式库要重建一次小麦问日记才准
6. 强制刷新浏览器（Ctrl+F5），或者清一次缓存再测

## 六、上线后验收（正式环境）
- [ ] 登录、写一篇日记、保存
- [ ] 今天页：小麦问候、On This Day、这一周、补写昨天
- [ ] 今日看点：7 个频道都有内容；频道广场能勾选；换一批；点开详情有重点、和你有关、正文、图片；收进知识库；写写看法
- [ ] 小麦：问日记、问知识库都能回答；历史有来源标签；换设备后历史还在（`chat_sessions`）
- [ ] 回忆：时间线、月历、知识、书柜都正常
- [ ] 手机浏览器上走一遍，重点看输入框有没有被挡住、小麦动画流不流畅
- [ ] 第二天中午看一下：演示账号重置、每小时整理知识库这两个定时任务有没有正常跑

## 七、回滚
- **后端**：Cloudflare Dashboard → Workers → `mydiary-api` → Deployments，回滚到上一个版本
- **前端**：Dashboard → Pages → `mydiary-web` → Deployments，把上一个版本重新设为正式
- **数据库**：这次只新增了表，没改旧表，一般不用回滚；实在需要就用第二步的备份恢复
- 回滚以后，在 GitHub 上 revert 那次合并提交，保持 main 和线上一致

## 八、已知遗留
- Agnes 主模型被限流，AI 会走 Qwen 兜底，偶尔变慢
- 天气在开代理时会定位到国外城市，还没加「手动设置城市」
- DEPLOY.md 第 752 行附近有明文的测试账号密码，建议上线前删掉
- 省钱优化（按来源设置缓存时间、KV 全球共用缓存）还没做
