export function formatAgentOrderCountdown(expiresAtSeconds: number, nowMilliseconds: number): string {
  const remainingSeconds = Math.max(0, Math.ceil(expiresAtSeconds - nowMilliseconds / 1000))
  const hours = Math.floor(remainingSeconds / 3_600)
  const minutes = Math.floor((remainingSeconds % 3_600) / 60)
  const seconds = remainingSeconds % 60
  const paddedSeconds = seconds.toString().padStart(2, '0')

  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${paddedSeconds}`
    : `${minutes}:${paddedSeconds}`
}
