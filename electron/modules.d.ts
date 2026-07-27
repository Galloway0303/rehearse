/** Minimal typings for untyped deps (Claude version — makes `npm run typecheck` actually pass). */
declare module 'screenshot-desktop' {
  interface ScreenshotOptions {
    format?: string
    screen?: number | string
    filename?: string
  }
  function screenshot(options?: ScreenshotOptions): Promise<Buffer>
  namespace screenshot {
    function listDisplays(): Promise<Array<{ id: number | string; name?: string }>>
    function all(): Promise<Buffer[]>
  }
  export default screenshot
}
