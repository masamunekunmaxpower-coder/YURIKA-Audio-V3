class YurikaQualityCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.armed = false;
    this.port.onmessage = ({ data: d = {} }) => {
      if (d.type !== "start") return;
      const frames = Number(d.frames);
      const startAt = d.startAt === undefined ? currentTime : Number(d.startAt);
      // At most 30 seconds / 64 MiB stereo per tap. Never wrap via bitwise casts.
      if (!Number.isSafeInteger(frames) || frames < 1 ||
          frames > Math.min(sampleRate * 30, 8388608) ||
          !Number.isFinite(startAt) || startAt < 0) {
        this.armed = false;
        this.port.postMessage({ type: "error", message: "Invalid capture request" });
        return;
      }
      this.target = frames;
      this.startFrame = Math.ceil(startAt * sampleRate);
      this.left = new Float32Array(frames);
      this.right = new Float32Array(frames);
      this.armed = true;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    for (const channel of output) channel.fill(0);
    if (!this.armed) return true;
    const quantum = output[0]?.length || input[0]?.length || 128;
    const endFrame = this.startFrame + this.target;
    const from = Math.max(currentFrame, this.startFrame);
    const to = Math.min(currentFrame + quantum, endFrame);
    if (to > from) {
      const offset = from - currentFrame;
      const pos = from - this.startFrame;
      const n = to - from;
      const l = input[0], r = input[1] || l;
      // Absent input is silence in the same timeline, not a recording pause.
      if (l) this.left.set(l.subarray(offset, offset + n), pos);
      if (r) this.right.set(r.subarray(offset, offset + n), pos);
    }
    if (currentFrame + quantum >= endFrame) {
      this.armed = false;
      const left = this.left, right = this.right;
      this.port.postMessage({ type: "done", left, right }, [left.buffer, right.buffer]);
      this.left = this.right = null;
    }
    return true;
  }
}
registerProcessor("yurika-quality-capture", YurikaQualityCapture);
