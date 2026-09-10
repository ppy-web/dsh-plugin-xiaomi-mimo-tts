/**
 * Ambient type for Vite-style `?raw` text imports used by the style modules
 * (bundler side: rawTextImports plugin in tsdown.config.ts).
 */
declare module '*.css?raw' {
  const css: string
  export default css
}
