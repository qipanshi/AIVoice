import type { Ticket } from './store.js';
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function authorizationPage(ticket: Ticket): string {
  const base = `/aivoice/interaction/${encodeURIComponent(ticket.uid)}`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AIVoice MCP 授权</title>
<style nonce="${ticket.csrf}">*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#192339;font:16px/1.6 system-ui,sans-serif}main{max-width:480px;margin:8vh auto;padding:32px;background:white;border:1px solid #e4e9f1;border-radius:18px}h1{font-size:24px;margin:0 0 8px}p{margin:12px 0}.muted{color:#627087;font-size:14px}.application{padding:14px;background:#f5f7fb;border-radius:10px;overflow-wrap:anywhere}img{display:block;width:240px;height:240px;margin:20px auto}#status{min-height:50px;text-align:center}button{background:#245de8;color:white;border:0;padding:12px 20px;border-radius:8px;font:inherit;cursor:pointer}@media(max-width:520px){main{margin:24px 16px;padding:24px}}</style></head><body><main>
<h1>AIVoice MCP</h1><p>使用微信扫一扫，在声掌门小程序中确认授权。</p>
<div class="application"><strong>${escape(ticket.clientName)}</strong><br><span class="muted">应用申报名称；请核对返回地址：${escape(new URL(ticket.redirectUri).origin)}</span></div>
<img src="${base}/qr" alt="声掌门小程序授权码" referrerpolicy="no-referrer"><p id="status" role="status">等待你在小程序中确认…</p>
<p class="muted">仅允许读取本人通过声掌门设备产生的既有会议转写和报告。你可以在小程序中解除授权。</p>
<form id="finish" action="${base}/finish" method="post"><input type="hidden" name="csrf" value="${ticket.csrf}"></form>
<noscript><p>请先完成扫码确认，再点击继续。</p><button type="submit" form="finish">继续连接</button></noscript></main>
<script nonce="${ticket.csrf}">const status=document.getElementById('status');const timer=setInterval(async()=>{try{const r=await fetch('${base}/status',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error();const s=await r.json();if(s.ready){clearInterval(timer);document.getElementById('finish').submit();}}catch{clearInterval(timer);status.textContent='授权已过期或服务暂不可用，请返回原工具重新连接。';}},2000);document.querySelector('img').onerror=()=>{clearInterval(timer);status.textContent='暂时无法加载小程序码，请返回原工具重新连接。';};</script></body></html>`;
}
