-- Sync builtin templates from dev
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-person','system','人物范本','用于整理人物关系、事件、特征','提取姓名、别名、身份、与我的关系、关键事件、性格特征、习惯喜好','
## 基本信息
- **身份**：{{身份}}
- **与我关系**：{{与我的关系}}
- **别名**：{{别名}}

## 性格与特征
{{性格与特征}}

## 关键事件
{{关键事件}}

## 习惯与喜好
{{习惯与喜好}}
','official','person',0,0,'📦 通用基础');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-event','system','事件范本','用于整理一个具体事件的时间、地点、经过、参与人','提取事件名称、时间、地点、参与人、起因经过结果、意义影响','
## 时间地点
- **时间**：{{时间}}
- **地点**：{{地点}}

## 参与人
{{参与人}}

## 经过
{{经过}}

## 结果与影响
{{结果与影响}}

## 我的感受
{{我的感受}}
','official','event',0,0,'📦 通用基础');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-place','system','地点范本','用于记录去过的地方、对它的印象','提取地点名称、位置、去过的次数、每次的经历、整体印象','
## 位置
{{详细位置}}

## 去过的经历
{{去过的经历}}

## 整体印象
{{整体印象}}

## 关联人物
{{关联人物}}
','official','place',0,0,'✈️ 旅行足迹');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-emotion','system','情绪/感受范本','用于整理某段时间的心情变化和反思','提取情绪类型、触发原因、持续时间、我的思考、应对方式','
## 情绪类型
- **类型**：{{情绪类型}}
- **强度**：{{情绪强度}}

## 触发原因
{{触发原因}}

## 我的思考
{{我的思考}}

## 应对方式
{{应对方式}}
','official','emotion',0,0,'🌱 个人成长');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-diary','system','日记条目范本','用于按日期汇总每日日记的要点','提取日期、当天主要事件、心情、待办/计划、收获或感悟','
## 今日概览
{{今日概览}}

## 心情
{{今日心情}}

## 主要事件
{{主要事件}}

## 待办与计划
{{待办与计划}}

## 今日感悟
{{今日感悟}}
','official','diary',0,0,'🌱 个人成长');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-topic','system','话题/主题范本','围绕一个主题（如"读书"、"健身"）汇总相关内容','提取主题名称、关联人物、关联事件、资料来源、我的观点','
## 主题概述
{{主题概述}}

## 关联人物
{{关联人物}}

## 关联事件
{{关联事件}}

## 资料来源
{{资料来源}}

## 我的观点
{{我的观点}}
','official','topic',0,0,'📦 通用基础');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-book','system','书籍分析范本','读完一本书的结构化笔记','提取书名、作者、阅读时间、核心观点、金句、人物、我的评价','# 《{{书名}}》

## 基本信息
- **作者**：{{作者}}
- **读完时间**：{{读完时间}}

## 核心观点
{{核心观点}}

## 金句摘录
{{金句}}

## 人物印象
{{人物}}

## 我的评价与收获
{{我的评价}}
','official','book',0,0,'🎬 文艺消费');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-film','system','电影分析范本','一部电影的观影笔记','提取片名、导演、上映年份、剧情概要、主题思想、人物、观影感受','# 《{{片名}}》

## 基本信息
- **导演**：{{导演}}
- **年份**：{{年份}}

## 剧情概要
{{剧情概要}}

## 主题与思想
{{主题思想}}

## 人物分析
{{人物分析}}

## 观影感受
{{观影感受}}
','official','film',0,0,'🎬 文艺消费');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-tv','system','电视剧分析范本','一部剧的追更笔记','提取剧名、主演、集数、喜欢的角色、印象最深的情节、整体评价','# 《{{剧名}}》

## 基本信息
- **主演**：{{主演}}
- **集数**：{{集数}}

## 印象最深的情节
{{印象最深的情节}}

## 喜欢的角色
{{喜欢的角色}}

## 整体评价
{{整体评价}}
','official','tv_show',0,0,'🎬 文艺消费');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-podcast','system','播客分析范本','一期播客的要点记录','提取节目名、期数、嘉宾、核心话题、精彩观点、我的收获','# 《{{节目名}}》第{{期数}}期

## 嘉宾
{{嘉宾}}

## 核心话题
{{核心话题}}

## 精彩观点
{{精彩观点}}

## 我的收获
{{我的收获}}
','official','podcast',0,0,'🎬 文艺消费');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-game','system','游戏记录范本','游戏通关或感想','提取游戏名、类型、平台、通关时间、亮点、槽点、总体感受','# 《{{游戏名}}》

## 基本信息
- **类型**：{{游戏类型}}
- **平台**：{{平台}}

## 通关/游玩时长
{{时长}}

## 亮点与槽点
{{亮点}}

## 总体感受
{{总体感受}}
','official','game',0,0,'🎬 文艺消费');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-album','system','专辑范本','一张音乐专辑的感受','提取专辑名、艺人、发行年份、最喜欢的曲目、整体风格、评价','# 《{{专辑名}}》

## 基本信息
- **艺人**：{{艺人}}
- **发行年份**：{{发行年份}}

## 最喜欢的曲目
{{最喜欢的曲目}}

## 整体风格
{{整体风格}}

## 评价
{{评价}}
','official','album',0,0,'🎬 文艺消费');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-song','system','歌曲范本','一首歌的感想或歌词片段','提取歌曲名、歌手、所属专辑、歌词片段、为什么喜欢、关联回忆','# 《{{歌曲名}}》

## 基本信息
- **歌手**：{{歌手}}
- **专辑**：{{专辑}}

## 歌词摘录
{{歌词摘录}}

## 为什么喜欢
{{为什么喜欢}}

## 关联回忆
{{关联回忆}}
','official','song',0,0,'🎬 文艺消费');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-course','system','课程范本','一门网课或课程的学习记录','提取课程名、老师、平台、核心知识点、我的笔记、待复习内容','# 《{{课程名}}》

## 基本信息
- **老师**：{{老师}}
- **平台**：{{平台}}

## 核心知识点
{{核心知识点}}

## 我的笔记
{{我的笔记}}

## 待复习
{{待复习}}
','official','course',0,0,'📚 学习学术');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-concept','system','概念/定理论范本','一个学术概念或定理的整理','提取概念名称、定义、起源、核心要点、例子、我的理解','# {{概念名称}}

## 定义
{{定义}}

## 起源背景
{{起源}}

## 核心要点
{{核心要点}}

## 举例说明
{{举例}}

## 我的理解
{{我的理解}}
','official','concept',0,0,'📚 学习学术');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-medicine','system','药品范本','一款药品的信息和用药记录','提取药品名称、成分、适应症、用法用量、副作用、我的反应','# {{药品名称}}

## 基本信息
- **成分**：{{成分}}
- **适应症**：{{适应症}}

## 用法用量
{{用法用量}}

## 副作用
{{副作用}}

## 我的用药记录
{{我的用药记录}}
','official','medicine',0,0,'💊 健康医疗');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-symptom','system','症状范本','一次身体不适的记录','提取症状名称、出现时间、持续时长、可能原因、采取的措施、恢复情况','# {{症状描述}}

## 出现时间
{{出现时间}}

## 持续时长
{{持续时长}}

## 可能原因
{{可能原因}}

## 采取的措施
{{采取的措施}}

## 恢复情况
{{恢复情况}}
','official','symptom',0,0,'💊 健康医疗');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-health-check','system','体检/检查记录范本','一次体检或医疗检查的结果','提取检查名称、时间、机构、关键指标、异常项、医生建议','# {{检查名称}}

## 基本信息
- **时间**：{{检查时间}}
- **机构**：{{机构}}

## 关键指标
{{关键指标}}

## 异常项
{{异常项}}

## 医生建议
{{医生建议}}
','official','health_record',0,0,'💊 健康医疗');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-recipe','system','食谱范本','一道菜的做法','提取菜名、难度、食材、步骤、小贴士、成品图备注','# {{菜名}}

## 难度与耗时
- **难度**：{{难度}}
- **耗时**：{{耗时}}

## 食材
{{食材清单}}

## 步骤
{{步骤}}

## 小贴士
{{小贴士}}
','official','recipe',0,0,'🍳 美食烹饪');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-ingredient','system','食材范本','一种食材的了解和储存','提取食材名称、产地、季节、营养价值、选购技巧、储存方法、烹饪建议','# {{食材名称}}

## 基本信息
- **产地**：{{产地}}
- **最佳季节**：{{季节}}

## 营养价值
{{营养价值}}

## 选购与储存
{{选购储存}}

## 烹饪建议
{{烹饪建议}}
','official','ingredient',0,0,'🍳 美食烹饪');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-restaurant','system','餐厅范本','一家餐厅的探店笔记','提取店名、地址、菜系、推荐菜品、人均、环境氛围、整体评价','# {{店名}}

## 基本信息
- **地址**：{{地址}}
- **菜系**：{{菜系}}
- **人均**：{{人均}}

## 推荐菜品
{{推荐菜品}}

## 环境与氛围
{{环境氛围}}

## 整体评价
{{整体评价}}
','official','restaurant',0,0,'🍳 美食烹饪');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-stock','system','股票/基金范本','一只股票或基金的跟踪','提取名称、代码、买入价、持仓量、关注理由、关键事件、操作记录','# {{名称}}

## 基本信息
- **代码**：{{代码}}
- **类型**：{{股票/基金}}

## 买入信息
- **买入价**：{{买入价}}
- **持仓量**：{{持仓量}}

## 关注理由
{{关注理由}}

## 关键事件
{{关键事件}}

## 操作记录
{{操作记录}}
','official','stock',0,0,'💰 财务投资');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-transaction','system','交易记录范本','一次买卖操作的备忘','提取标的、方向（买/卖）、价格、数量、时间、理由、后续计划','# {{标的}} {{方向}}

## 交易详情
- **价格**：{{价格}}
- **数量**：{{数量}}
- **时间**：{{时间}}

## 交易理由
{{交易理由}}

## 后续计划
{{后续计划}}
','official','transaction',0,0,'💰 财务投资');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-crypto','system','加密货币范本','一个加密货币的研究和跟踪','提取币种、概念、团队、流通量、我的持仓、关键事件、观察笔记','# {{币种名称}}

## 基本信息
- **概念**：{{概念}}
- **团队**：{{团队}}
- **流通量**：{{流通量}}

## 我的持仓
{{我的持仓}}

## 关键事件
{{关键事件}}

## 观察笔记
{{观察笔记}}
','official','crypto',0,0,'💰 财务投资');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-project','system','项目范本','一个工作项目的整体管理','提取项目名称、目标、负责人、参与人、里程碑、风险、当前进展','# {{项目名称}}

## 目标与范围
{{项目目标}}

## 参与人
{{参与人}}

## 里程碑
{{里程碑}}

## 风险与问题
{{风险}}

## 当前进展
{{当前进展}}
','official','project',0,0,'💼 工作项目');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-task','system','任务范本','一个具体任务的拆解和执行','提取任务名、来源、截止日期、优先级、步骤、阻塞点、完成情况','# {{任务名称}}

## 基本信息
- **来源**：{{来源}}
- **截止日期**：{{截止日期}}
- **优先级**：{{优先级}}

## 步骤拆解
{{步骤}}

## 阻塞点
{{阻塞点}}

## 完成情况
{{完成情况}}
','official','task',0,0,'💼 工作项目');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-meeting','system','会议记录范本','一次会议的记录和待办','提取会议主题、时间、地点、参会人、讨论要点、决议、待办事项','# {{会议主题}}

## 基本信息
- **时间**：{{时间}}
- **地点**：{{地点}}
- **参会人**：{{参会人}}

## 讨论要点
{{讨论要点}}

## 决议
{{决议}}

## 待办事项
{{待办事项}}
','official','meeting',0,0,'💼 工作项目');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-decision','system','重要决策范本','一个重要决策的思考过程','提取决策议题、背景、选项、利弊分析、最终选择、理由、后续跟踪','# {{决策议题}}

## 背景
{{背景}}

## 可选方案
{{选项}}

## 利弊分析
{{利弊分析}}

## 最终选择
{{最终选择}}

## 后续跟踪
{{后续跟踪}}
','official','decision',0,0,'💼 工作项目');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-contact','system','联系人/关系范本','一个重要联系人的备忘','提取姓名、认识时间、关系、联系方式、重要事件、近况','# {{姓名}}

## 基本信息
- **认识时间**：{{认识时间}}
- **关系**：{{关系}}
- **联系方式**：{{联系方式}}

## 重要事件
{{重要事件}}

## 近况
{{近况}}

## 我能帮什么
{{我能帮的}}
','official','contact',0,0,'🤝 人际社交');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-gathering','system','聚会/活动范本','一次聚会或活动的记录','提取活动名称、时间、地点、参与人、亮点、照片备注、下次计划','# {{活动名称}}

## 基本信息
- **时间**：{{时间}}
- **地点**：{{地点}}
- **参与人**：{{参与人}}

## 活动亮点
{{活动亮点}}

## 照片备注
{{照片备注}}

## 下次计划
{{下次计划}}
','official','gathering',0,0,'🤝 人际社交');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-goal','system','目标/OKR范本','一个长期目标的规划和跟踪','提取目标名称、愿景、关键结果、当前进度、行动计划、障碍','# {{目标名称}}

## 愿景
{{愿景}}

## 关键结果
{{关键结果}}

## 当前进度
{{当前进度}}

## 行动计划
{{行动计划}}

## 障碍与对策
{{障碍}}
','official','goal',0,0,'🌱 个人成长');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-habit','system','习惯养成范本','一个习惯的坚持记录','提取习惯名称、开始日期、目标频率、打卡记录、感受、奖励机制','# {{习惯名称}}

## 基本信息
- **开始日期**：{{开始日期}}
- **目标频率**：{{目标频率}}

## 打卡记录
{{打卡记录}}

## 感受与反思
{{感受}}

## 奖励机制
{{奖励}}
','official','habit',0,0,'🌱 个人成长');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-inspiration','system','灵感/摘抄范本','一闪而过的想法或摘抄','提取灵感来源、核心内容、可落地的方向、相关素材、后续跟进','# {{灵感标题}}

## 来源
{{灵感来源}}

## 核心内容
{{核心内容}}

## 可落地的方向
{{落地方向}}

## 后续跟进
{{后续跟进}}
','official','inspiration',0,0,'🌱 个人成长');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('builtin-skill','system','技能学习范本','一项技能的学习路径','提取技能名称、当前水平、目标水平、学习计划、练习记录、资源推荐','# {{技能名称}}

## 水平评估
- **当前**：{{当前水平}}
- **目标**：{{目标水平}}

## 学习计划
{{学习计划}}

## 练习记录
{{练习记录}}

## 资源推荐
{{资源推荐}}
','official','skill',0,0,'🌱 个人成长');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('tpl_bc','system','书籍人物范本','','提取人物姓名、身份、与主角关系、关键事件、性格特征、经典语录','# {{人物名}}\n\n## 身份\n{{身份}}\n\n## 与主角关系\n{{关系}}\n\n## 关键事件\n{{关键事件}}\n\n## 性格特征\n{{性格}}\n\n## 经典语录\n> {{经典语录}}','builtin','book_character',1790643472000,1790643472000,'📚 学习学术');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('tpl_fc','system','影视人物范本','','提取人物姓名、演员、角色定位、关键情节、经典台词、人物成长弧线','# {{角色名}}\n\n## 演员\n{{演员}}\n\n## 角色定位\n{{定位}}\n\n## 关键情节\n{{关键情节}}\n\n## 经典台词\n> {{台词}}\n\n## 人物成长\n{{成长弧线}}','builtin','film_character',1790643472000,1790643472000,'🎬 文艺消费');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('tpl_fs','system','经典场景范本','','提取场景名称、所在集数、场景描述、情绪氛围、关键对话、我的感受','# {{场景名}}\n\n## 所在集数\n{{集数}}\n\n## 场景描述\n{{场景描述}}\n\n## 情绪氛围\n{{氛围}}\n\n## 关键对话\n{{对话}}\n\n## 我的感受\n{{感受}}','builtin','film_scene',1790643472000,1790643472000,'🎬 文艺消费');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('tpl_ft','system','主题意象范本','','提取主题/意象名称、出现集数、象征物、关联情节、深层含义、我的理解','# {{主题名}}\n\n## 出现集数\n{{集数}}\n\n## 象征物\n{{象征物}}\n\n## 关联情节\n{{关联情节}}\n\n## 深层含义\n{{含义}}\n\n## 我的理解\n{{理解}}','builtin','film_theme',1790643472000,1790643472000,'🎬 文艺消费');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('tpl_tp','system','旅行地范本','','提取地点名称、位置、到达时间、同行人、景点描述、美食体验、住宿、总体评价','# {{地点名}}\n\n## 位置\n{{位置}}\n\n## 到达时间\n{{时间}}\n\n## 同行人\n{{同行人}}\n\n## 景点描述\n{{景点}}\n\n## 美食体验\n{{美食}}\n\n## 住宿\n{{住宿}}\n\n## 总体评价\n{{评价}}','builtin','travel_place',1790643472000,1790643472000,'✈️ 旅行足迹');
INSERT OR IGNORE INTO wiki_templates (id,user_id,name,description,extract_hints,page_format,kind,builtin_key,created_at,updated_at,category) VALUES ('tpl_ep','system','单集播客范本','','提取节目/主播、集数标题、核心内容、嘉宾、关键观点、金句、我的笔记','# {{集数标题}}\n\n## 节目/主播\n{{节目}}\n\n## 嘉宾\n{{嘉宾}}\n\n## 核心内容\n{{核心内容}}\n\n## 关键观点\n{{观点}}\n\n## 金句\n> {{金句}}\n\n## 我的笔记\n{{笔记}}','builtin','episode',1790643472000,1790643472000,'🎙️ 播客视频');
