export function resolveFunnelClickBase(
  hasClickStage: boolean,
  clickCount: number,
  visitorCount: number | undefined,
): number {
  if (hasClickStage) {
    return clickCount;
  }

  return visitorCount ?? clickCount;
}
