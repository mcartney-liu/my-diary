-- 红楼梦研究：人物（红楼特色）
UPDATE wiki_categories SET extract_hints='提取姓名、字号、别号、居所、身份等级、与宝玉关系、重要情节、判词、花签、象征意象、结局命运'
WHERE kb_id=(SELECT id FROM wiki_knowledge_bases WHERE slug='hongloumeng' LIMIT 1) AND slug='renwu';

UPDATE wiki_categories SET extract_hints='提取事件名称、回目数、时间、地点、参与人、起因经过结果、在全书结构中的作用、脂砚斋批注要点'
WHERE kb_id=(SELECT id FROM wiki_knowledge_bases WHERE slug='hongloumeng' LIMIT 1) AND slug='shijian';

UPDATE wiki_categories SET extract_hints='提取地点名称（如大观园、荣国府）、位置关系、主要居住者、发生过的事件、环境描写要点、象征意义'
WHERE kb_id=(SELECT id FROM wiki_knowledge_bases WHERE slug='hongloumeng' LIMIT 1) AND slug='didian';

UPDATE wiki_categories SET extract_hints='提取主题名称（如钗黛之争、真假宝玉、末世悲歌）、关联人物与情节、象征物、我的理解与感悟'
WHERE kb_id=(SELECT id FROM wiki_knowledge_bases WHERE slug='hongloumeng' LIMIT 1) AND slug='huati';

-- 我的人物志：加"与我的关系"
UPDATE wiki_categories SET extract_hints='提取姓名、别名、身份、与我的关系类型（家人/朋友/同事/恋人）、关键事件、性格特征、习惯喜好、联系方式（如有）'
WHERE kb_id=(SELECT id FROM wiki_knowledge_bases WHERE slug='renwuzhi' LIMIT 1);
