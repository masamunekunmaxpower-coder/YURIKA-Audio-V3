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

    // Keep the node in the render graph, but never send measurement audio
    // to the real destination.
    for (const channel of output) channel.fill(0);

    if (!this.active) return true;

    // AudioWorklet normally renders in 128-frame quanta.  The old
    // implementation advanced only while input[0] existed, which meant
    // pre-roll and tail silence around an AudioBufferSource were never
    // counted.  That made the matched-reference capture wait forever.
    //
    // Advance by the current render quantum even when the input is
    // disconnected/silent. Float32Array is zero-initialized, so missing
    // input naturally becomes digital silence in the capture.
    const quantum =
      (input[0] && input[0].length) ||
      (output[0] && output[0].length) ||
      128;

    const n = Math.min(quantum, this.target - this.pos);

    if (n > 0 && input[0]) {
      const l = input[0];
      const r = input[1] || l;

      const ln = Math.min(n, l.length);
      if (ln > 0) this.left.set(l.subarray(0, ln), this.pos);

      const rn = Math.min(n, r.length);
      if (rn > 0) this.right.set(r.subarray(0, rn), this.pos);
    }

    this.pos += n;

    if (this.pos >= this.target) {
      this.active = false;

      const left = this.left;
      const right = this.right;

      this.port.postMessage(
        { type: "done", left, right },
        [left.buffer, right.buffer]
      );
    }

    return true;
  }
}

registerProcessor("yurika-quality-capture", YurikaQualityCapture);
