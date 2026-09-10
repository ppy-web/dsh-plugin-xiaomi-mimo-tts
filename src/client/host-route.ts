export function hostRoute(path: string): string {
  const relative = path.replace(/^\/+/, '')
  return typeof document === 'undefined' ? `/${relative}` : new URL(relative, document.baseURI).pathname
}
