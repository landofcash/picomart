const PETRA_SCHEME_BASE = 'petra://api/v1';

function buildUrl(path: string, params: Record<string, string | number | undefined | null>) {
  const url = new URL(PETRA_SCHEME_BASE + '/' + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    url.searchParams.set(k, String(v));
  });
  return url.toString();
}

// M2M deep links only use the custom scheme and a single base64(JSON) `data` param
export function buildConnectLink(dataB64: string) {
  return buildUrl('connect', { data: dataB64 });
}

export function buildSignMessageLink(dataB64: string) {
  // Endpoint name must be camelCase per spec
  return buildUrl('signMessage', { data: dataB64 });
}

export function buildSignAndSubmitLink(dataB64: string) {
  // Endpoint name must be camelCase per spec
  return buildUrl('signAndSubmit', { data: dataB64 });
}

export function buildDisconnectLink(dataB64?: string) {
  return buildUrl('disconnect', dataB64 ? { data: dataB64 } : {});
}
