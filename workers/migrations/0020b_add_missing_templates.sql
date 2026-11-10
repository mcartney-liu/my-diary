INSERT INTO wiki_templates (id, user_id, kb_id, builtin_key, name, extract_hints, page_format, kind, category, created_at, updated_at) VALUES 
('tpl_bc','system',NULL,'book_character','书籍人物范本','提取人物姓名、身份、与主角关系、关键事件、性格特征、经典语录','# {{人物名}}\n\n## 身份\n{{身份}}\n\n## 与主角关系\n{{关系}}\n\n## 关键事件\n{{关键事件}}\n\n## 性格特征\n{{性格}}\n\n## 经典语录\n> {{经典语录}}','builtin','📚 学习学术',strftime('%s','now')*1000,strftime('%s','now')*1000);

INSERT INTO wiki_templates (id, user_id, kb_id, builtin_key, name, extract_hints, page_format, kind, category, created_at, updated_at) VALUES 
('tpl_fc','system',NULL,'film_character','影视人物范本','提取人物姓名、演员、角色定位、关键情节、经典台词、人物成长弧线','# {{角色名}}\n\n## 演员\n{{演员}}\n\n## 角色定位\n{{定位}}\n\n## 关键情节\n{{关键情节}}\n\n## 经典台词\n> {{台词}}\n\n## 人物成长\n{{成长弧线}}','builtin','🎬 文艺消费',strftime('%s','now')*1000,strftime('%s','now')*1000);

INSERT INTO wiki_templates (id, user_id, kb_id, builtin_key, name, extract_hints, page_format, kind, category, created_at, updated_at) VALUES 
('tpl_fs','system',NULL,'film_scene','经典场景范本','提取场景名称、所在集数、场景描述、情绪氛围、关键对话、我的感受','# {{场景名}}\n\n## 所在集数\n{{集数}}\n\n## 场景描述\n{{场景描述}}\n\n## 情绪氛围\n{{氛围}}\n\n## 关键对话\n{{对话}}\n\n## 我的感受\n{{感受}}','builtin','🎬 文艺消费',strftime('%s','now')*1000,strftime('%s','now')*1000);

INSERT INTO wiki_templates (id, user_id, kb_id, builtin_key, name, extract_hints, page_format, kind, category, created_at, updated_at) VALUES 
('tpl_ft','system',NULL,'film_theme','主题意象范本','提取主题/意象名称、出现集数、象征物、关联情节、深层含义、我的理解','# {{主题名}}\n\n## 出现集数\n{{集数}}\n\n## 象征物\n{{象征物}}\n\n## 关联情节\n{{关联情节}}\n\n## 深层含义\n{{含义}}\n\n## 我的理解\n{{理解}}','builtin','🎬 文艺消费',strftime('%s','now')*1000,strftime('%s','now')*1000);

INSERT INTO wiki_templates (id, user_id, kb_id, builtin_key, name, extract_hints, page_format, kind, category, created_at, updated_at) VALUES 
('tpl_tp','system',NULL,'travel_place','旅行地范本','提取地点名称、位置、到达时间、同行人、景点描述、美食体验、住宿、总体评价','# {{地点名}}\n\n## 位置\n{{位置}}\n\n## 到达时间\n{{时间}}\n\n## 同行人\n{{同行人}}\n\n## 景点描述\n{{景点}}\n\n## 美食体验\n{{美食}}\n\n## 住宿\n{{住宿}}\n\n## 总体评价\n{{评价}}','builtin','✈️ 旅行足迹',strftime('%s','now')*1000,strftime('%s','now')*1000);

INSERT INTO wiki_templates (id, user_id, kb_id, builtin_key, name, extract_hints, page_format, kind, category, created_at, updated_at) VALUES 
('tpl_ep','system',NULL,'episode','单集播客范本','提取节目/主播、集数标题、核心内容、嘉宾、关键观点、金句、我的笔记','# {{集数标题}}\n\n## 节目/主播\n{{节目}}\n\n## 嘉宾\n{{嘉宾}}\n\n## 核心内容\n{{核心内容}}\n\n## 关键观点\n{{观点}}\n\n## 金句\n> {{金句}}\n\n## 我的笔记\n{{笔记}}','builtin','🎙️ 播客视频',strftime('%s','now')*1000,strftime('%s','now')*1000);
