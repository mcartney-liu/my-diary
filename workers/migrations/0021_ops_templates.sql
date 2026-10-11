-- v0.5.11: IT 运维工作支撑 — 新增 4 个内置范本
-- 用 INSERT OR IGNORE 幂等（重跑不会重复）

INSERT OR IGNORE INTO wiki_templates (id, user_id, kb_id, builtin_key, name, extract_hints, page_format, kind, category, created_at, updated_at) VALUES
('tpl_ops_task','system',NULL,'ops_task','运维任务范本','提取任务标题、任务类型(提数/答疑/开发/故障)、优先级、来源、负责人、截止时间、状态(待办/进行中/已办结)、相关人、备注','# {{任务标题}}

## 基本信息
- **类型**：{{任务类型}}（提数/答疑/开发/故障处理）
- **优先级**：{{优先级}}（高/中/低）
- **来源**：{{任务来源}}（哪个系统/哪个同事提的）
- **负责人**：{{负责人}}
- **相关人**：{{相关人}}
- **截止时间**：{{截止时间}}
- **状态**：{{当前状态}}（待办 / 进行中 / 已办结）

## 需求描述
{{需求描述}}

## 处理过程
{{处理过程}}

## 交付结果
{{交付结果}}

## 备注
{{备注}}
','builtin','💻 IT 运维',strftime('%s','now')*1000,strftime('%s','now')*1000);

INSERT OR IGNORE INTO wiki_templates (id, user_id, kb_id, builtin_key, name, extract_hints, page_format, kind, category, created_at, updated_at) VALUES
('tpl_ops_incident','system',NULL,'ops_incident','故障处理SOP范本','提取故障现象、发生时间、影响范围、根因、排查过程、修复方案、临时方案、防止再犯措施、相关日志/截图','# {{故障标题}}

## 基本信息
- **发生时间**：{{发生时间}}
- **影响系统/服务**：{{影响系统}}
- **影响范围**：{{影响范围}}（多少用户 / 多少服务 / 严重程度 P0-P3）
- **处理人**：{{处理人}}
- **状态**：{{当前状态}}（处理中 / 已修复 / 已归档）

## 故障现象
{{故障现象描述}}

## 排查过程
{{排查过程 — 做了什么检查、看了什么日志、试了什么命令}}

## 根因分析
{{根因是什么}}

## 修复方案
{{最终怎么修好的}}

## 临时方案（如有）
{{在修好之前怎么临时顶着的}}

## 防止再犯措施
{{怎么确保下次不会再出}}

## 相关资源
{{相关日志、截图、监控链接、变更记录}}
','builtin','💻 IT 运维',strftime('%s','now')*1000,strftime('%s','now')*1000);

INSERT OR IGNORE INTO wiki_templates (id, user_id, kb_id, builtin_key, name, extract_hints, page_format, kind, category, created_at, updated_at) VALUES
('tpl_ops_script','system',NULL,'ops_script','脚本/导数SQL范本','提取脚本名称、脚本类型(SQL/Shell/Python/PowerShell)、用途、输入参数、输出格式、适用场景、注意事项、示例输出','# {{脚本名称}}

## 基本信息
- **类型**：{{脚本类型}}（SQL / Shell / Python / PowerShell / 其他）
- **用途**：{{脚本用途}}
- **作者/来源**：{{作者或来源}}
- **适用环境**：{{适用环境}}（生产/测试/通用）

## 脚本代码
```{{脚本类型}}
{{脚本完整代码}}
```

## 输入参数
{{需要什么输入参数、怎么传}}

## 输出说明
{{输出格式、怎么解读结果}}

## 使用场景
{{什么时候用这个脚本}}

## 注意事项
{{跑之前要注意什么、有什么风险}}

## 示例
{{跑出来是什么样}}
','builtin','💻 IT 运维',strftime('%s','now')*1000,strftime('%s','now')*1000);

INSERT OR IGNORE INTO wiki_templates (id, user_id, kb_id, builtin_key, name, extract_hints, page_format, kind, category, created_at, updated_at) VALUES
('tpl_ops_qa','system',NULL,'ops_qa','答疑记录范本','提取问题标题、提问人、提问时间、问题背景、问题内容、我的回答、相关链接/文档、后续跟进','# {{问题标题}}

## 基本信息
- **提问人**：{{提问人}}
- **提问时间**：{{提问时间}}
- **问题来源**：{{来源系统或群}}
- **分类**：{{问题分类}}（业务咨询 / 技术问题 / 权限申请 / 其他）

## 问题背景
{{为什么问这个问题}}

## 问题内容
{{具体问题是什么}}

## 我的回答
{{怎么解决的}}

## 相关资源
{{相关文档、截图、链接}}

## 后续跟进
{{有没有后续需要跟进的事}}
','builtin','💻 IT 运维',strftime('%s','now')*1000,strftime('%s','now')*1000);

INSERT OR IGNORE INTO wiki_templates (id, user_id, kb_id, builtin_key, name, extract_hints, page_format, kind, category, created_at, updated_at) VALUES
('tpl_ops_dev','system',NULL,'ops_dev','开发任务范本','提取需求名称、需求来源、需求描述、技术方案、涉及系统、排期、当前进度、风险点、相关人','# {{需求/任务名称}}

## 基本信息
- **来源**：{{需求来源}}（哪个同事/哪个系统提的）
- **类型**：{{需求类型}}（功能开发 / Bug修复 / 重构 / 技术债）
- **涉及系统**：{{涉及哪些系统/模块}}
- **负责人**：{{负责人}}
- **相关人**：{{相关人}}
- **排期**：{{计划时间}}
- **状态**：{{当前状态}}（待开发 / 开发中 / 测试中 / 已上线 / 已取消）

## 需求描述
{{需求详细描述}}

## 技术方案
{{技术方案、架构图、关键设计}}

## 开发记录
{{做了什么、遇到什么坑、怎么解决的}}

## 风险点
{{有什么风险、怎么缓解}}

## 上线记录
{{上线时间、变更号、回滚预案}}

## 后续
{{后续还有什么要跟进的}}
','builtin','💻 IT 运维',strftime('%s','now')*1000,strftime('%s','now')*1000);
