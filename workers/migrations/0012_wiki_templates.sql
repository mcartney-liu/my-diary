-- v4.1: 新增范本库（独立于分类，可复用）

CREATE TABLE IF NOT EXISTS wiki_templates (
  id            TEXT PRIMARY KEY,
  kb_id         TEXT,                       -- NULL = 官方预设（所有 KB 可见）
  user_id       TEXT,                       -- 'system' = 官方预设
  name          TEXT NOT NULL,
  description   TEXT,
  extract_hints TEXT NOT NULL DEFAULT '',
  page_format   TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT 'user',  -- official | user
  builtin_key   TEXT,                       -- 官方预设的唯一标识（用于 upsert）
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wiki_tpl_kb ON wiki_templates(kb_id);

-- ====== 官方预设范本（user_id='system', kb_id=NULL）======
-- 用 builtin_key 做幂等插入（重跑不会重复）

INSERT OR IGNORE INTO wiki_templates (id, kb_id, user_id, name, description, extract_hints, page_format, kind, builtin_key, created_at, updated_at) VALUES
('builtin-person',   NULL, 'system', '人物范本', '用于整理人物关系、事件、特征', '提取姓名、别名、身份、与我的关系、关键事件、性格特征、习惯喜好',
'# {{name}}

## 基本信息
- **身份**：{{identity}}
- **与我关系**：{{relationship}}
- **别名**：{{aliases}}

## 性格与特征
{{personality}}

## 关键事件
{{key_events}}

## 习惯与喜好
{{habits}}
', 'official', 'person', 0, 0),

('builtin-event',    NULL, 'system', '事件范本', '用于整理一个具体事件的时间、地点、经过、参与人', '提取事件名称、时间、地点、参与人、起因经过结果、意义影响',
'# {{event_name}}

## 时间地点
- **时间**：{{time}}
- **地点**：{{location}}

## 参与人
{{participants}}

## 经过
{{process}}

## 结果与影响
{{result}}

## 我的感受
{{my_feelings}}
', 'official', 'event', 0, 0),

('builtin-place',    NULL, 'system', '地点范本', '用于记录去过的地方、对它的印象', '提取地点名称、位置、去过的次数、每次的经历、整体印象',
'# {{place_name}}

## 位置
{{location_detail}}

## 去过的经历
{{visits}}

## 整体印象
{{impression}}

## 关联人物
{{related_people}}
', 'official', 'place', 0, 0),

('builtin-emotion',  NULL, 'system', '情绪/感受范本', '用于整理某段时间的心情变化和反思', '提取情绪类型、触发原因、持续时间、我的思考、应对方式',
'# {{feeling_summary}}

## 情绪类型
- **类型**：{{emotion_type}}
- **强度**：{{intensity}}

## 触发原因
{{trigger}}

## 我的思考
{{reflection}}

## 应对方式
{{coping}}
', 'official', 'emotion', 0, 0),

('builtin-diary',    NULL, 'system', '日记条目范本', '用于按日期汇总每日日记的要点', '提取日期、当天主要事件、心情、待办/计划、收获或感悟',
'# {{date}}

## 今日概览
{{overview}}

## 心情
{{mood}}

## 主要事件
{{events}}

## 待办与计划
{{todos}}

## 今日感悟
{{reflection}}
', 'official', 'diary', 0, 0),

('builtin-topic',    NULL, 'system', '话题/主题范本', '围绕一个主题（如"读书"、"健身"）汇总相关内容', '提取主题名称、关联人物、关联事件、资料来源、我的观点',
'# {{topic_name}}

## 主题概述
{{summary}}

## 关联人物
{{related_people}}

## 关联事件
{{related_events}}

## 资料来源
{{sources}}

## 我的观点
{{my_view}}
', 'official', 'topic', 0, 0);

