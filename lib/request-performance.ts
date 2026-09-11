export const REQUEST_ID_HEADER = 'x-socrates-request-id';
export const PROXY_AUTH_TIMING_HEADER = 'x-socrates-proxy-auth-ms';
export const PROXY_ROLE_TIMING_HEADER = 'x-socrates-proxy-role-ms';
export const PROXY_TOTAL_TIMING_HEADER = 'x-socrates-proxy-total-ms';

export type ServerTimingEntry = {
  name: string;
  durationMs: number;
};

type HeaderReader = {
  get(name: string): string | null;
};

function roundDuration(durationMs: number) {
  return Math.round(Math.max(0, durationMs) * 10) / 10;
}

function readDuration(headers: HeaderReader, name: string) {
  const rawValue = headers.get(name);
  if (rawValue === null || rawValue.trim() === '') return null;

  const value = Number(rawValue);
  return Number.isFinite(value) && value >= 0 ? roundDuration(value) : null;
}

export function formatServerTiming(entries: readonly ServerTimingEntry[]) {
  return entries
    .filter((entry) => Number.isFinite(entry.durationMs) && entry.durationMs >= 0)
    .map(
      (entry) =>
        `${entry.name.replace(/[^a-zA-Z0-9_-]/g, '_')};dur=${roundDuration(entry.durationMs)}`
    )
    .join(', ');
}

export function readProxyTiming(headers: HeaderReader): ServerTimingEntry[] {
  return [
    ['proxy_auth', PROXY_AUTH_TIMING_HEADER],
    ['proxy_role', PROXY_ROLE_TIMING_HEADER],
    ['proxy_total', PROXY_TOTAL_TIMING_HEADER],
  ].flatMap(([name, header]) => {
    const durationMs = readDuration(headers, header);
    return durationMs === null ? [] : [{ name, durationMs }];
  });
}

export type ServerTimingRecorder = ReturnType<typeof createServerTimingRecorder>;

export function createServerTimingRecorder({
  requestId,
  route,
}: {
  requestId: string;
  route: string;
}) {
  const startedAt = performance.now();
  const entries: ServerTimingEntry[] = [];

  return {
    record(name: string, durationMs: number) {
      entries.push({ name, durationMs: roundDuration(durationMs) });
    },
    async measure<T>(name: string, operation: () => PromiseLike<T>) {
      const stageStartedAt = performance.now();

      try {
        return await operation();
      } finally {
        entries.push({
          name,
          durationMs: roundDuration(performance.now() - stageStartedAt),
        });
      }
    },
    measureSync<T>(name: string, operation: () => T) {
      const stageStartedAt = performance.now();

      try {
        return operation();
      } finally {
        entries.push({
          name,
          durationMs: roundDuration(performance.now() - stageStartedAt),
        });
      }
    },
    snapshot() {
      return entries.map((entry) => ({ ...entry }));
    },
    log(inheritedEntries: readonly ServerTimingEntry[] = []) {
      const applicationDurationMs = roundDuration(performance.now() - startedAt);
      const proxyDurationMs =
        inheritedEntries.find((entry) => entry.name === 'proxy_total')
          ?.durationMs || 0;

      console.info(
        JSON.stringify({
          event: 'socrates_server_timing',
          requestId,
          route,
          stages: [
            ...inheritedEntries,
            ...entries,
            { name: 'application_total', durationMs: applicationDurationMs },
          ],
          totalMs: roundDuration(proxyDurationMs + applicationDurationMs),
        })
      );
    },
  };
}
