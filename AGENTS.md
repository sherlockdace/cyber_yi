# Cyber Yi 仓库协作说明

## 项目与入口

- `cyber-yi cast` 提供周易起卦、经文查阅和可选模型解读，`cyber-yi serve` 提供本机网页。两个入口共用 `src/cyber_yi/` 内的计算与取辞逻辑。
- 保持 `README.md` 和 `README_CN.md` 对项目状态、功能与使用说明的描述一致。新增或修改行为时同步更新相关设计文档。
- 起卦与取辞规则见 [docs/divination.md](docs/divination.md)。语料格式和来源见 [docs/corpus.md](docs/corpus.md)。接口、配置与界面见 [docs/architecture.md](docs/architecture.md)。

## 实现约定

- 使用仓库约定的 Python 版本与 `uv`。修改代码时参考 [code-writing](.agents/skills/code-writing/SKILL.md)，按任务范围控制依赖和改动。
- 计算、序列化和语料均按初爻至上爻保存。卦画上爻在顶、初爻在底。起卦引擎生成六个爻值，取辞程序按规则选择经文，模型负责结合问题解读。模型出错时沿用原卦和经文。
- 将语料和原始下载集中放在仓库根目录的 `data/`。应用只读取 `data/zhouyi.jsonl`。更新时验证卦序、卦画、爻位和经传对应关系。底本和固定版本记录在 [docs/corpus.md](docs/corpus.md)。
- 将随机、文件和网络 I/O 放在入口附近并显式传入依赖。用 YAML 管理运行参数和提示模板，通过 `yaml.safe_load` 加载后校验。使用 `python-dotenv` 从指定路径加载密钥，保持 `.env` 受 Git 忽略，示例配置使用占位符。
- 默认验证使用固定爻值、离线语料与模拟模型客户端。实际请求只用于已配置端点的集成验证。提交文档时检查本地链接、示例数据和双语 README 的项目状态。
