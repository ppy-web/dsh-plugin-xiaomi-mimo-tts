/** User-uploadable portrait slots for the four top settings cards. */
export const PORTRAIT_SLOTS = ['voice', 'autoplay', 'sound', 'provider'] as const
export type PortraitSlot = typeof PORTRAIT_SLOTS[number]

/** Accepted upload content types mapped to the stored file extension. */
export const PORTRAIT_IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const
export type PortraitImageType = keyof typeof PORTRAIT_IMAGE_TYPES

/** Upper bound for one uploaded portrait image (base64 data URL inflates this on the wire). */
export const PORTRAIT_MAX_BYTES = 8 * 1024 * 1024
/** Accepted zoom range, applied to the uploaded image inside its card. */
export const PORTRAIT_SCALE_MIN = 0.5
export const PORTRAIT_SCALE_MAX = 2
export const PORTRAIT_SCALE_DEFAULT = 1

/** One custom portrait slot: a cache-busting version token plus its zoom factor. */
export interface PortraitSlotState {
  version: string
  scale: number
}

/** Manifest served to the client; null means the slot still uses its default art. */
export interface PortraitManifest {
  slots: Record<PortraitSlot, PortraitSlotState | null>
}

export function isPortraitSlot(value: unknown): value is PortraitSlot {
  return typeof value === 'string' && (PORTRAIT_SLOTS as readonly string[]).includes(value)
}

export function clampPortraitScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return PORTRAIT_SCALE_DEFAULT
  return Math.min(PORTRAIT_SCALE_MAX, Math.max(PORTRAIT_SCALE_MIN, Math.round(value * 100) / 100))
}
