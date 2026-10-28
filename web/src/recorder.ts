// REC (design S5): the final canvas + the hub's audio track → MediaRecorder → one file per take, downloaded on stop.
const TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2', // H.264 High + AAC (Q6), the string S1.2 found supported; Chrome sets the level
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]
// Chrome 156/157's MP4 muxer counts bytes in a uint32 and crashes the renderer past 4 GiB, ≈24 min at our ~3 MB/s
// (fixed in M158, research_recording_mp4 §1). A recording splits into 20-min takes, each with a fresh recorder.
const SPLIT_MS = 20 * 60_000

/** The first type MediaRecorder accepts, MP4 first; `isTypeSupported` is injectable for tests. */
export const pickMimeType = (isTypeSupported = (t: string) => MediaRecorder.isTypeSupported(t)) =>
  TYPES.find((t) => isTypeSupported(t))

const isMp4 = (mimeType = '') => mimeType.startsWith('video/mp4')

/** MP4 records in 1 s chunks, so the take leaves the renderer as it grows (S4.3: renderer flat, file valid). WebM
 *  records in one piece: Chrome ≥140 writes a WebM duration only for an unchunked take (design S5). */
export const timeslice = (mimeType: string) => (isMp4(mimeType) ? 1000 : undefined)

/** MP4 asks for a keyframe, and so a new fragment, every 60 s instead of every 100 frames. Chrome's muxer gives each
 *  fragment's last frame 1/30 s, which QuickTime/AVFoundation adds up (+15 ms per fragment at 60 fps): ≈16 s per 30 min
 *  becomes ≈0.5 s (research_recording_mp4 §1, §2). TS's DOM types lack the option; WebM is unaffected. */
export const recorderOptions = (
  mimeType: string | undefined,
  videoBitsPerSecond: number,
): MediaRecorderOptions & { videoKeyFrameIntervalDuration?: number } =>
  isMp4(mimeType) ? { mimeType, videoBitsPerSecond, videoKeyFrameIntervalDuration: 60_000 } : { mimeType, videoBitsPerSecond }

/** `veejay-<stamp>[-partN].<mp4|webm>`: every part of a split recording is numbered, a single take is not. */
export const fileName = (stamp: string, mimeType: string, part: number, parts: number) =>
  `veejay-${stamp}${parts > 1 ? `-part${part}` : ''}.${isMp4(mimeType) ? 'mp4' : 'webm'}`

/** One take: a fresh canvas capture + the shared audio track. stop() resolves once its file is handed to the download;
 *  `name` is asked then, when the part count is known. */
function take(canvas: HTMLCanvasElement, audio: MediaStreamTrack, videoBps: number, name: (mimeType: string) => string) {
  const [video] = canvas.captureStream().getVideoTracks() // no fps argument: one frame per canvas change
  const rec = new MediaRecorder(new MediaStream([video, audio]), recorderOptions(pickMimeType(), videoBps))
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => chunks.push(e.data)
  rec.onerror = (e) => console.error('recorder', e)
  const saved = new Promise<void>((resolve) => {
    // On stop(), or when the recorder stops itself after an error: the take is saved either way.
    rec.onstop = () => {
      video.stop() // the canvas capture only; the audio track is recDest's, shared by every take
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }))
      a.download = name(rec.mimeType)
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 40_000) // once the download holds the blob (FileSaver.js waits 40 s too)
      resolve()
    }
  })
  // ponytail: a WebM take (the fallback) is unchunked, so the renderer holds it until stop: ≈180 MB/min at 60 fps (S4.3).
  rec.start(timeslice(rec.mimeType))
  return () => {
    if (rec.state !== 'inactive') rec.stop()
    return saved
  }
}

/** Starts recording; the returned stop() resolves once every file is handed to the download. The caller keeps the
 *  canvas size frozen until then, across every part: a resize mid-recording corrupts the MP4 (S1.2). Every SPLIT_MS
 *  the next take starts and only then the current one stops, so no frame falls between the parts. */
export function startRecording(finalCanvas: HTMLCanvasElement, audio: MediaStreamTrack, videoBps: number): () => Promise<void> {
  const local = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 19)
  const stamp = local.replace(/:/g, '-') // the recording's start, local time; shared by its parts
  let parts = 0
  const next = () => {
    const part = ++parts
    return take(finalCanvas, audio, videoBps, (t) => fileName(stamp, t, part, parts))
  }
  let stop = next()
  const saved: Promise<void>[] = []
  const timer = setInterval(() => {
    const prev = stop
    stop = next()
    saved.push(prev())
  }, SPLIT_MS)
  return () => {
    clearInterval(timer)
    saved.push(stop())
    return Promise.all(saved).then(() => {})
  }
}
