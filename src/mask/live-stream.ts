/**
 * Live screen stream for the mask window (Claude version).
 *
 * Acquires a native WebRTC stream of the display that contains the CN strip
 * (30–60fps, GPU-decoded) and computes the exact crop rect of the strip inside
 * that stream. The mask window itself is WDA_EXCLUDEFROMCAPTURE, so the stream
 * always shows the clean video *under* the mask — realtime, no flash ever.
 */

export type CaptureInfo = {
  ok: true
  sourceId: string
  sourceName: string
  displayId: string
  displayPhys: { x: number; y: number; width: number; height: number }
  stripPhys: { x: number; y: number; width: number; height: number }
  scaleFactor: number
}

export type CaptureInfoResult = CaptureInfo | { ok: false; reason: string }

export type LiveApi = {
  getCaptureInfo: () => Promise<CaptureInfoResult>
  reportStatus: (s: { active: boolean; mode?: string; fps?: number; error?: string }) => Promise<unknown>
}

export function liveApi(): LiveApi | null {
  const w = window as unknown as { rehearseMaskLive?: LiveApi }
  return w.rehearseMaskLive ?? null
}

export async function acquireScreenStream(info: CaptureInfo): Promise<MediaStream> {
  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: info.sourceId,
        minWidth: info.displayPhys.width,
        maxWidth: info.displayPhys.width,
        minHeight: info.displayPhys.height,
        maxHeight: info.displayPhys.height,
        minFrameRate: 30,
        maxFrameRate: 60,
      },
    },
  } as unknown as MediaStreamConstraints
  return navigator.mediaDevices.getUserMedia(constraints)
}

export type CropRect = { sx: number; sy: number; sw: number; sh: number }

/**
 * Map the CN strip (physical screen px) into the video element's pixel space.
 * If Windows delivered the stream at a different resolution than the display's
 * physical size, scale proportionally.
 */
export function cropForStrip(info: CaptureInfo, videoW: number, videoH: number): CropRect {
  const kx = videoW / Math.max(1, info.displayPhys.width)
  const ky = videoH / Math.max(1, info.displayPhys.height)
  const sx = (info.stripPhys.x - info.displayPhys.x) * kx
  const sy = (info.stripPhys.y - info.displayPhys.y) * ky
  const sw = info.stripPhys.width * kx
  const sh = info.stripPhys.height * ky
  return {
    sx: Math.max(0, Math.round(sx)),
    sy: Math.max(0, Math.round(sy)),
    sw: Math.max(2, Math.round(sw)),
    sh: Math.max(2, Math.round(sh)),
  }
}

/** Attach stream to an offscreen <video> and resolve when frames are flowing. */
export function playStream(stream: MediaStream): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    const fail = (e: unknown) => reject(e instanceof Error ? e : new Error(String(e)))
    video.onloadedmetadata = () => {
      video
        .play()
        .then(() => resolve(video))
        .catch(fail)
    }
    video.onerror = fail
    setTimeout(() => reject(new Error('video metadata timeout')), 8000)
  })
}
