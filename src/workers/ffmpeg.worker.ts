type ConvertRequest = {
  type: "convert"
  id: string
  file: File
}

type FfmpegFileData = Uint8Array | string

type FfmpegInstance = {
  on: (event: "progress", callback: (data: { progress: number }) => void) => void
  load: (config: { coreURL: string; wasmURL: string }) => Promise<boolean>
  writeFile: (path: string, data: Uint8Array) => Promise<void>
  exec: (args: string[]) => Promise<number>
  readFile: (path: string) => Promise<FfmpegFileData>
}

let ffmpegPromise: Promise<FfmpegInstance> | null = null
let activeRequestId = ""

self.onmessage = async (event: MessageEvent<ConvertRequest>) => {
  if (event.data.type !== "convert") {
    return
  }

  try {
    activeRequestId = event.data.id
    self.postMessage({
      type: "progress",
      id: event.data.id,
      progress: 0.05,
      message: "Loading ffmpeg.wasm",
      detail: { id: "ffmpeg:load", message: "Loading ffmpeg.wasm", progress: 0.05 },
    })
    const [{ fetchFile }] = await Promise.all([import("@ffmpeg/util")])
    const ffmpeg = await getFfmpeg(event.data.id)

    await ffmpeg.writeFile("input", await fetchFile(event.data.file))
    await ffmpeg.exec([
      "-i",
      "input",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "wav",
      "output.wav",
    ])

    const data = await ffmpeg.readFile("output.wav")
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data)
    const blob = new Blob([bytes.slice()], { type: "audio/wav" })
    self.postMessage({ type: "complete", id: event.data.id, blob })
  } catch (error) {
    self.postMessage({
      type: "error",
      id: event.data.id,
      error: error instanceof Error ? error.message : "ffmpeg conversion failed",
    })
  }
}

function getFfmpeg(requestId: string) {
  if (!ffmpegPromise) {
    ffmpegPromise = loadFfmpeg()
  } else {
    self.postMessage({
      type: "progress",
      id: requestId,
      progress: 0.12,
      message: "Reusing ffmpeg.wasm",
      detail: { id: "ffmpeg:load", message: "Reusing ffmpeg.wasm", progress: 1 },
    })
  }

  return ffmpegPromise
}

async function loadFfmpeg() {
  const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
  ])
  const ffmpeg = new FFmpeg() as unknown as FfmpegInstance
  const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm"

  ffmpeg.on("progress", ({ progress }) => {
    self.postMessage({
      type: "progress",
      id: activeRequestId,
      progress: Math.min(0.95, progress),
      message: "Converting media",
      detail: { id: "ffmpeg:convert", message: "Converting media", progress: Math.min(0.95, progress) },
    })
  })

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  })

  return ffmpeg
}
