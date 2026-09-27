// 输入缓冲：固定容量环形缓冲区
// 不变量：
// - 每条输入记录毫秒级时间戳（timestamp），帧序号（frame）仅作辅助
// - 保留最近 N 条输入，同帧多次按键全部保留，连按不合并
// - 缓冲区满时覆盖最旧数据，读写指针同步推进
// - 暂停（硬直）期间时钟冻结，恢复后继续计时
class InputBuffer {
  constructor(size = 10) {
    this.size = size;
    this.buffer = new Array(size).fill(null);
    this.writePtr = 0;
    this.readPtr = 0;
    this.count = 0;
    this.clock = 0; // 毫秒时钟，由 update(dtMs) 推进
    this.frame = 0; // 帧序号，仅辅助信息
    this.paused = false;
  }

  _normalize(input, opts) {
    const base = typeof input === 'object' && input !== null ? { ...input } : { input };
    if (base.input === undefined) base.input = base.key;
    if (base.key === undefined) base.key = base.input;
    if (base.type === undefined) base.type = 'press';
    return {
      ...base,
      timestamp: typeof base.timestamp === 'number' ? base.timestamp
        : (typeof opts.timestamp === 'number' ? opts.timestamp : this.clock),
      frame: typeof base.frame === 'number' ? base.frame
        : (typeof opts.frame === 'number' ? opts.frame : this.frame),
    };
  }

  record(input, opts = {}) {
    const entry = this._normalize(input, opts);
    if (this.count === this.size) {
      // 缓冲区满：覆盖最旧数据，读指针随写指针前进，丢弃最旧一条
      this.buffer[this.writePtr] = entry;
      this.writePtr = (this.writePtr + 1) % this.size;
      this.readPtr = this.writePtr;
    } else {
      this.buffer[this.writePtr] = entry;
      this.writePtr = (this.writePtr + 1) % this.size;
      this.count++;
    }
    return entry;
  }

  // recordInput 为 record 的公开别名，保持原有用途
  recordInput(input, opts) {
    return this.record(input, opts);
  }

  consume() {
    if (this.count === 0) return null;
    const val = this.buffer[this.readPtr];
    this.buffer[this.readPtr] = null;
    this.readPtr = (this.readPtr + 1) % this.size;
    this.count--;
    return val;
  }

  // 按时间先后（旧->新）返回有效输入，不含空槽
  getInputs() {
    const out = [];
    for (let i = 0; i < this.count; i++) {
      out.push(this.buffer[(this.readPtr + i) % this.size]);
    }
    return out;
  }

  // 推进毫秒时钟；暂停期间（硬直）不计时
  update(dtMs = 0) {
    if (this.paused) return;
    this.clock += dtMs;
    this.frame += 1;
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }
}

module.exports = { InputBuffer };
