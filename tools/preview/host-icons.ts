/**
 * DSH 0.2.1+ renders all UI icons inline as React SVG components, so the
 * standalone preview no longer needs the host's `<use>` icon sprite that
 * `ICON_SYMBOLS` used to describe. A no-op keeps the standalone preview
 * working without depending on the removed primitives export.
 */
export function installPreviewHostIcons(): () => void {
  return () => {}
}
