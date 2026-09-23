class YurikaQualityCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.target = 0;
    this.pos = 0;
    this.left = null;
    this.right = null;
    this.port.onmessage = (event) => {
      const d = event.data || {};
      if (d.type !== "start") return;
      this.target = Math.max(1, Number(d.frames) | 0);
      this.pos = 0;
      this.left = new Float32Array(this.target);
      this.right = new Float32Array(this.target);
      this.active = true;
    };
  }
  process(inputs, outputs) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    for (const channel of output) channel.fill(0);
    if (!this.active || !input[0]) return true;
    const l = input[0];
    const r = input[1] || l;
    const n = Math.min(l.length, this.target - this.pos);
    if (n > 0) {
      this.left.set(l.subarray(0, n), this.pos);
      this.right.set(r.subarray(0, n), this.pos);
      this.pos += n;
    }
    if (this.pos >= this.target) {
      this.active = false;
      const left = this.left, right = this.right;
      this.port.postMessage({ type:"done", left, right }, [left.buffer, right.buffer]);
    }
    return true;
  }
}
registerProcessor("yurika-quality-capture", YurikaQualityCapture);
