export async function recordHeartbeat(
  url: string,
  publishableKey: string,
  fetcher: typeof fetch = fetch,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds))
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    let response: Response | undefined;
    try {
      response = await fetcher(url + '/rest/v1/rpc/keepalive', {
        method: 'POST',
        headers: { apikey: publishableKey, 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(30_000)
      });
    } catch {
      /* Retry bounded network failures; never print request headers. */
    }
    if (response?.ok) {
      const timestamp: unknown = await response.json();
      if (
        typeof timestamp !== 'string' ||
        !Number.isFinite(Date.parse(timestamp))
      )
        throw new Error(
          'The keepalive RPC did not return a valid heartbeat timestamp.'
        );
      return timestamp;
    }
    const status = response?.status;
    await response?.body?.cancel();
    if (attempt === 3 || (status && status !== 429 && status < 500))
      throw new Error(
        `Supabase heartbeat failed (${status ? 'HTTP ' + status : 'network unavailable'}). Check project availability and migrations.`
      );
    await wait(2000 * 2 ** attempt);
  }
}
