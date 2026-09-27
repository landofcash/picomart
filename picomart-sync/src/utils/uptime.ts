export function formatUptime(start: Date) {
  const now = Date.now();
  const uptimeMs = now - start.getTime();
  const uptimeSeconds = Math.floor(uptimeMs / 1000);
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);
  const uptimeDays = Math.floor(uptimeHours / 24);

  let uptimeString = '';
  if (uptimeDays > 0) uptimeString += `${uptimeDays}d `;
  if (uptimeHours % 24 > 0) uptimeString += `${uptimeHours % 24}h `;
  if (uptimeMinutes % 60 > 0) uptimeString += `${uptimeMinutes % 60}m `;
  uptimeString += `${uptimeSeconds % 60}s`;

  return { uptimeMs, uptimeString };
}
