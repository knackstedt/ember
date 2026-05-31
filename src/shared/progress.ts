export function shouldClearProgress(
  currentTime: number,
  duration: number,
): boolean {
  if (duration <= 0 || !isFinite(duration) || !isFinite(currentTime))
    return false;
  const startThreshold = Math.max(duration * 0.02, 30); // at least 30 seconds
  const endThreshold = Math.max(duration * 0.02, 120); // at least 2 minutes
  return currentTime < startThreshold || currentTime > duration - endThreshold;
}
