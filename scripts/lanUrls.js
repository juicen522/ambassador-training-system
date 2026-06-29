import os from 'os';

/** 本机局域网 IPv4 地址（排除 127.0.0.1） */
export function getLanIpv4Addresses() {
  const addrs = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const net of ifaces ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        addrs.push(net.address);
      }
    }
  }
  return [...new Set(addrs)];
}

export function formatLanUrls(port, { path = '/', label = '网站' } = {}) {
  const ips = getLanIpv4Addresses();
  const suffix = path === '/' ? '' : path;
  const lines = [`\n  【局域网 ${label}】同一 WiFi / 网段内其他设备可访问：`];
  if (ips.length === 0) {
    lines.push('  （未检测到局域网 IP，请确认已连接 WiFi 或有线网络）');
  } else {
    for (const ip of ips) {
      lines.push(`  ➜  http://${ip}:${port}${suffix}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}
