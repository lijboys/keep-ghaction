/**
 * GitHub Action Keep Alive Worker (Pro版)
 * * 功能：手动触发 GitHub Workflow 保活
 * * 特性：
 * 1. 支持随机时间区间 (如 40-60 天)
 * 2. 支持 Telegram 消息推送 (美化版)
 * 3. 极低资源占用
 */

export default {
  async scheduled(event, env, ctx) {
    console.log(`[Start] 唤醒 Worker...`);

    // ================= 配置解析 =================
    // 1. 获取 GitHub Token
    const ghToken = env.TOKEN || "";
    
    // 2. 获取 Telegram 配置
    const tgToken = env.TG_TOKEN || "";
    const tgChatId = env.TG_ID || "";

    // 3. 解析时间区间 (默认 40-60 天)
    let minDays = 40;
    let maxDays = 60;
    if (env.TIME) {
      const parts = env.TIME.split('-');
      if (parts.length === 2) {
        minDays = parseInt(parts[0]) || 40;
        maxDays = parseInt(parts[1]) || 60;
      }
    }

    // 4. 获取仓库列表
    let targets = [];
    if (env.REPOS) {
      try {
        targets = JSON.parse(env.REPOS);
      } catch (e) {
        console.error("❌ REPOS JSON 格式错误");
      }
    }
    // 默认兜底
    if (targets.length === 0) {
      targets = [{ owner: "你的用户名", repo: "仓库名", workflow: "main.yml", ref: "main" }];
    }

    // ================= 核心逻辑：时间检查 =================
    // 检查 KV 绑定 (变量名改为 kv)
    if (env.kv) {
      const lastRun = await env.kv.get("next_run_timestamp");
      const now = Date.now();

      // 如果有记录，且当前时间 < 计划运行时间，则跳过
      if (lastRun && now < parseInt(lastRun)) {
        const waitMs = parseInt(lastRun) - now;
        const waitDays = (waitMs / (1000 * 60 * 60 * 24)).toFixed(1);
        console.log(`⏳ 还没到时间。计划: ${new Date(parseInt(lastRun)).toLocaleString()} (余 ${waitDays} 天)`);
        return; // 直接结束
      }
      
      console.log("⏰ 时间已到 (或首次运行)，开始干活！");
    } else {
      console.log("⚠️ 未绑定 KV (变量名: kv)，本次将直接运行，无法实现随机间隔。");
    }

    // ================= 执行 GitHub 保活 =================
    if (!ghToken || ghToken.includes("在此处")) {
      console.error("❌ 缺少 GitHub TOKEN");
      return;
    }

    const report = [];
    let successCount = 0;

    for (const target of targets) {
      try {
        const url = `https://api.github.com/repos/${target.owner}/${target.repo}/actions/workflows/${target.workflow}/dispatches`;
        // const url = `https://api.github.com/repos/${target.owner}/${target.repo}/dispatches`; // 如果是触发 repository_dispatch 事件用这个，通常用上面那个
        
        console.log(`触发: ${target.repo}`);
        
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${ghToken}`,
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "CF-Worker-KeepAlive"
          },
          body: JSON.stringify({ ref: target.ref })
        });

        if (response.status === 204) {
          successCount++;
          report.push(`✅ <b>${target.repo}</b>: 成功`);
        } else {
          report.push(`❌ <b>${target.repo}</b>: 失败 (${response.status})`);
        }
      } catch (err) {
        report.push(`❌ <b>${target.repo}</b>: 错误 - ${err.message}`);
      }
    }

    // ================= 收尾：计算下次时间 & 发通知 =================
    
    // 1. 计算并存储下一次运行时间
    let nextRunDateStr = "未启用随机 (无KV)";
    if (env.kv) {
      const randomDays = Math.floor(Math.random() * (maxDays - minDays + 1)) + minDays;
      // const randomDays = (Math.random() * (maxDays - minDays) + minDays).toFixed(2); // 如果想要非整数天
      const nextRunTime = Date.now() + (randomDays * 24 * 60 * 60 * 1000);
      
      await env.kv.put("next_run_timestamp", nextRunTime.toString());
      nextRunDateStr = new Date(nextRunTime).toLocaleString("zh-CN", {timeZone: "Asia/Shanghai"});
      console.log(`📅 下次运行预约: ${nextRunDateStr} (${randomDays}天后)`);
    }

    // 2. 发送 Telegram 通知 (如果有配置)
    if (tgToken && tgChatId) {
      const message = [
        `🤖 <b>GitHub 保活任务报告</b>`,
        `-----------------------------`,
        ...report,
        `-----------------------------`,
        `📊 <b>统计:</b> 成功 ${successCount} / 总计 ${targets.length}`,
        `📅 <b>下一次:</b> ${nextRunDateStr}`,
        `🎲 <b>区间:</b> ${minDays}-${maxDays} 天`
      ].join("\n");

      await sendTelegramMessage(tgToken, tgChatId, message);
    }
  },

  // 浏览器手动触发测试
  async fetch(request, env, ctx) {
    await this.scheduled(null, env, ctx);
    return new Response("手动运行完成，请检查 KV 时间戳或 TG 消息。", { status: 200 });
  }
};

/**
 * 发送 Telegram 消息 (HTML 模式)
 */
async function sendTelegramMessage(token, chatId, text) {
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML", // 启用 HTML 格式以支持加粗
        disable_web_page_preview: true
      })
    });
  } catch (e) {
    console.error("TG 发送失败:", e);
  }
}
