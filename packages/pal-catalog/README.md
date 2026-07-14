# @palhatch/pal-catalog

该包负责：

- 共享 Schema 生成目录类型的再导出
- 规范 JSONL 解析、稳定 key/集合排序和 content-hash 输入
- 帕鲁、技能、本地化和配种关系的跨记录校验
- 浏览器侧目录查询 DTO
- 明确标注的最小虚构 fixture

包内禁止放置 `full-catalog.json`、真实全量游戏文本或游戏二进制资产。生产目录以 Agent 不可变制品和数据库关系投影保存，不作为 npm/Git 数据发布。
