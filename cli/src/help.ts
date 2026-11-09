export function commandHelp(command?: string) {
  const common = '\n通用参数：\n  --server <URL>       MCP 地址，默认 https://open.qipanshi.com/mcp\n  --profile <名称>     个人配置，默认 default；1–64 位字母/数字/_/-\n  --help, -h           显示帮助\n';
  const commands: Record<string, string> = {
    login: 'aivoice login [选项]\n首次个人扫码授权，或授权失效后重新登录。\n\n  --no-browser             不自动打开浏览器，仍输出授权链接\n  --callback-port <整数>   本机回调端口，0–65535；默认 0 自动选择\n\n示例：aivoice login --profile work\n服务器通过 SSH 转发回调时使用固定端口和 --no-browser。',
    status: 'aivoice status [通用选项]\n实际连接服务并列出工具名，不显示令牌。\n示例：aivoice status --profile work',
    logout: 'aivoice logout [选项]\n默认撤销远端令牌后删除本地凭证；网络失败保留凭证供重试。\n\n  --local   只删除本地文件，不撤销远端授权\n\n示例：aivoice logout --profile work',
    meetings: 'aivoice meetings [选项]\n查询本人已有设备会议，输出 JSON。日期按 Asia/Shanghai，包含首尾。\n\n  --start <YYYY-MM-DD>  开始日期，可选\n  --end <YYYY-MM-DD>    结束日期，可选，不能早于 start\n  --keyword <文字>     标题关键词，可选，最多 100 字符\n  --offset <整数>      列表偏移，0–100000，默认 0\n  --limit <整数>       每页条数，1–50，默认 20\n\n示例：aivoice meetings --start 2026-11-01 --end 2026-11-06 --limit 20\nnextOffset 非空时，使用 --offset <nextOffset> 读取下一页。',
    transcript: 'aivoice transcript <会议ID> [选项]\n会议ID必填，使用 meetings 返回的完整正整数 ID；只读取既有转写。\n\n  --offset <整数>   文字偏移，0–10000000，默认 0\n  --limit <整数>    每段字符数，100–24000，默认 12000\n\n示例：aivoice transcript 1001 --offset 0 --limit 12000\nnextOffset 非空时继续读取，不代表当前段就是全文。',
    report: 'aivoice report <会议ID> [选项]\n会议ID必填，只读取已保存的报告，不触发生成。\n\n  --kind <类型>     standard 普通报告 / industry 行业报告，默认 standard\n  --offset <整数>   文字偏移，0–10000000，默认 0\n  --limit <整数>    每段字符数，100–24000，默认 12000\n\n示例：aivoice report 1001 --kind industry\nnextOffset 非空时继续读取，未生成返回 not_ready。',
    mcp: 'aivoice mcp [通用选项]\n提供本地 stdio 桥接，stdout 只输出 MCP 协议。\n先在相同系统用户、server 和 profile 中执行 login。\n示例：aivoice mcp --profile work\n不在工作台进程中启动交互登录；失效时回终端重新 login。',
  };
  if (command && commands[command]) return commands[command] + '\n' + common;
  return 'AIVoice CLI 0.3.1 — 读取本人的已有设备会议结果\n\n命令：\n  login       个人扫码授权\n  status      验证连接\n  logout      撤销并退出\n  meetings    查询会议\n  transcript  读取已有转写\n  report      读取已有报告\n  mcp         stdio 桥接\n\n卸载程序（保留授权和本地凭证）：\n  Windows PowerShell: & "$env:LOCALAPPDATA\\AIVoice\\uninstall.ps1"\n  macOS/Linux: sh "$HOME/.local/share/aivoice/uninstall.sh"\n\n使用 aivoice <命令> --help 查看该命令参数。\n  --version, -v  显示版本\n' + common + '\n查询 stdout 为 JSON；诊断写 stderr；失败退出码为 1。\n';
}
