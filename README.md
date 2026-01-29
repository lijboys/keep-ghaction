🤖 GitHub Action 保活助手 (Cloudflare Worker 版)

这是一个部署在 Cloudflare Workers 上的脚本，用于防止 GitHub Action 定时任务因 60 天无活动而被自动暂停。

✨ 主要特性

防暂停：通过调用 GitHub API 手动触发 Workflow，模拟活跃状态。

随机间隔：支持设置随机时间区间（如 40-60 天），避免规律性触发被检测，更像真人操作。

TG 通知：支持 Telegram 消息推送，发送运行报告和下一次预计运行时间。

低成本：完全利用 Cloudflare 免费额度（每天 10 万次请求），且不需要服务器。

🛠 第一步：准备 GitHub 信息

在部署之前，你需要获取以下两个核心信息：

1. 获取 GitHub Token (个人访问令牌)

脚本需要权限来触发你的 Workflow。

登录 GitHub，点击头像 -> Settings。

左侧菜单最下方 -> Developer settings。

点击 Personal access tokens -> Tokens (classic)。

点击 Generate new token (classic)。

Note 随便填（例如：CF-KeepAlive）。

Expiration (过期时间) 建议选择 No expiration (永不过期)，否则你以后还得换。

Select scopes (权限选择)：

如果是公开仓库：勾选 public_repo 和 workflow。

如果是私有仓库：勾选 repo (包含所有权限) 和 workflow。

点击 Generate token，复制生成的 ghp_ 开头的字符串。这是你的 TOKEN。

2. 整理需要保活的项目列表

你需要把要保活的项目整理成 JSON 格式。

格式说明：

owner: 你的 GitHub 用户名

repo: 仓库名称

workflow: .github/workflows/ 目录下的 .yml 文件名

ref: 分支名称 (通常是 main 或 master)

JSON 模板 (复制修改)：

[
  {
    "owner": "你的用户名",
    "repo": "仓库A",
    "workflow": "main.yml",
    "ref": "main"
  },
  {
    "owner": "你的用户名",
    "repo": "仓库B",
    "workflow": "schedule.yml",
    "ref": "master"
  }
]


提示：建议先在电脑上的记事本里把这个 JSON 拼好，压缩成一行，方便后面粘贴。

☁️ 第二步：部署 Cloudflare Worker

1. 创建 Worker

登录 Cloudflare Dashboard。

左侧菜单点击 Workers & Pages。

点击 Create Application -> Create Worker -> Deploy。

点击 Edit code。

将提供的 worker.js 代码完全复制并覆盖编辑器中的默认代码。

点击右上角 Deploy 保存。

2. 创建 KV 存储 (用于随机时间记忆)

为了实现“40-60天随机运行”，我们需要一个地方存“下一次运行时间”。

在 Cloudflare 左侧主菜单，找到 Storage & Databases -> KV。

点击 Create Namespace。

起个名字，例如 KEEP_ALIVE_DB，点击 Add。

3. 配置环境变量 (Variables) - 关键步骤！

回到你的 Worker 页面，点击 Settings -> Variables。

A. 绑定 KV (必须做)

找到 KV Namespace Bindings 区域。

点击 Add Binding。

Variable name 必须填：kv (小写，不要改名)。

KV Namespace 选择你刚才创建的 KEEP_ALIVE_DB。

点击 Deploy。

B. 添加环境变量 (Environment Variables)

点击 Add Variable 添加以下变量：

变量名

是否必填

示例值

说明

TOKEN

✅ 必填

ghp_xxxx...

第一步获取的 GitHub Token

REPOS

✅ 必填

[{"owner":"..."...}]

第一步整理的项目 JSON 字符串

TIME

❌ 选填

40-60

随机触发的天数区间，默认 40-60

TG_TOKEN

❌ 选填

123456:ABC...

Telegram Bot Token (若需要通知)

TG_ID

❌ 选填

12345678

Telegram Chat ID (若需要通知)

提示：REPOS 的值必须是合法的 JSON，如果填错会导致脚本运行失败。

⏰ 第三步：设置定时任务 (Triggers)

为了让脚本能每天检查“是不是到日子了”，我们需要设置一个勤快点的闹钟。

在 Worker 页面点击 Triggers 选项卡。

找到 Cron Triggers。

点击 Add Cron Trigger。

Cron Expression 建议设置为每天一次，例如：

0 9 * * * (每天上午 9 点运行)

点击 Add Trigger。

❓ 常见问题

Q: 为什么 Cron 设置每天运行，会不会占用太多配额？
A: 不会。Cloudflare Worker 每天有 10 万次免费请求额度。
脚本每天醒来一次，只是读一下 KV 里的时间戳（极快，耗时几毫秒）。只有当随机生成的日子到了（例如第 50 天），它才会真正去请求 GitHub API。绝大部分时间它都是“醒来看看时间 -> 继续睡”，资源消耗几乎为零。

Q: 如何获取 Telegram Bot Token 和 ID？
A:

Token: 在 Telegram 搜索 @BotFather，发送 /newbot 创建机器人，它会给你 Token。

ID: 在 Telegram 搜索 @userinfobot，点击 Start，它会返回你的 ID。

Q: 第一次部署后怎么没反应？
A:

第一次运行时，因为 KV 里没有记录，脚本会默认立即运行一次保活任务，并生成下一次的随机时间。

你可以点击 Worker 界面右上角的 Deploy 旁边的下拉菜单 -> Triggers -> 手动访问那个 URL 来测试一次。
