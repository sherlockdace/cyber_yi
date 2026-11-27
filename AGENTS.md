# Cyber Yi 仓库协作说明

## 项目与入口

- 应用为纯前端 TypeScript，`npm run dev` 启动开发网页，`npm run build` 生成静态 `dist/`。`src/divination.ts` 提供计算与取辞，浏览器直接调用用户配置的模型服务。Python 和 CLI 已移除。
- 保持 `README.md` 和 `README_CN.md` 对项目状态、功能与使用说明的描述一致。新增或修改行为时同步更新相关设计文档。
- 起卦与取辞规则见 [docs/divination.md](docs/divination.md)。语料格式和来源见 [docs/corpus.md](docs/corpus.md)。接口、配置与界面见 [docs/architecture.md](docs/architecture.md)。

## 实现约定

- 使用 Node.js 24 LTS (24.15+)、npm 和严格 TypeScript。修改代码时参考 [code-writing](.agents/skills/code-writing/SKILL.md)，按任务范围控制依赖和改动。
- 计算、序列化和语料均按初爻至上爻保存。卦画上爻在顶、初爻在底。起卦引擎生成六个爻值，取辞程序按规则选择经文，模型负责结合问题解读。模型出错时沿用原卦和经文。
- 将语料和原始下载集中放在仓库根目录的 `data/`。应用只将 `data/zhouyi.jsonl` 打包为正式语料。更新时验证卦序、卦画、爻位和经传对应关系。底本和固定版本记录在 [docs/corpus.md](docs/corpus.md)。
- 将随机、文件和网络 I/O 放在入口附近并显式传入依赖。用 YAML 管理运行参数和提示模板，通过 `yaml` 解析后校验。API Key 由使用者在页面输入，仅存当前页面内存，不写入源码、配置、构建环境变量或浏览器持久存储；保持 `.env` 受 Git 忽略。
- 默认验证使用固定爻值、离线语料与模拟模型客户端。实际请求只用于已配置端点的集成验证。提交文档时检查本地链接、示例数据和双语 README 的项目状态。
