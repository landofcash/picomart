export function privateError(error: unknown) {
  let detail = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown build error';
  for (const [name, value] of Object.entries(process.env)) if (value && value.length > 5 && /KEY|TOKEN|SECRET|PASSWORD/.test(name)) detail = detail.split(value).join('[redacted]');
  return detail.slice(0, 8000);
}
