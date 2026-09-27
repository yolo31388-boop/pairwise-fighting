// 输入缓冲：定长环形缓冲区
// 不变量：
// - 每条输入记录精确到毫秒的时间戳（timestampMs），帧号（frame）仅作辅助信息
// - 保留最近 N 条输入（容量以输入条数计），同一帧内的多次按键分别保留
// - 按下(type=down)与释放(type=up)分别记录，绝不合并
// - 虚拟时钟在角色被击中/硬直时暂停计时，恢复后继续（暂停期间墙钟流逝不计入）
class VirtualClock {
  constructor(startMs = Date.now()) {
    this.virtualMs = startMs;
    this.frozenAtMs = null; // 非 null 表示已暂停，记录暂停瞬间的墙钟
  }

  now() {
    if (this.frozenAtMs !== null) return this.virtualMs;
    return this.virtualMs;
  }

  // 引擎推进墙钟（真实运行时由外部周期调用）
  advance(wallNowMs) {
    if (this.frozenAtMs === null && wallNowMs >= this.virtualMs) {
      this.virtualMs = wallNowMs;
    }
  }

  pause(wallNowMs = Date.now()) {
    if (this.frozenAtMs === null) {
      this.advance(wallNowMs);
      this.frozenAtMs = wallNowMs;
    }
  }

  resume(wallNowMs = Date.now()) {
    if (this.frozenAtMs !== null) {
      // 暂停期间流逝的墙钟不计入：冻结点直接平移到现在
      this.frozenAtMs = null;
      this.virtualMs = wallNowMs;
    }
  }
}

const DIRECTIONS = ['up', 'down', 'left', 'right', 'upleft', 'upright', 'downleft', 'downright', 'neutral'];

// 把三种输入形态规范化为 {key,type}：
//   'punch'                       -> {key:'punch', type:'down'}
//   {key,type}                    -> 原样
//   {direction:'down',type:'down'} -> {key:'down', type:'down'}
function normalizeInput(input) {
  if (typeof input === 'string') return { key: input, type: 'down' };
  if (input && typeof input === 'object') {
    const key = input.key != null ? input.key : input.direction;
    const type = input.type != null ? input.type : 'down';
    if (key == null) throw new Error('recordInput: 输入必须包含 key 或 direction');
    return { key: String(key), type: String(type) };
  }
  throw new Error('recordInput: 无效输入');
}

let SEQ = 0;

class InputBuffer {
  constructor(size = 10, options = {}) {
    let opts = options;
    if (size && typeof size === 'object') { opts = size; size = opts.size != null ? opts.size : 10; }
    this.size = size;
    this.buffer = new Array(size).fill(null);
    this.writePtr = 0;
    this.readPtr = 0;
    this.clock = opts.clock || new VirtualClock(opts.startMs != null ? opts.startMs : Date.now());
    this.frame = opts.startFrame || 0;
    this.frameWindow = opts.frameWindow != null ? opts.frameWindow : Infinity;
  }

  // 规范公开接口；record 为兼容别名
  recordInput(input, meta = {}) {
    if (meta.frame != null) this.frame = meta.frame;
    if (meta.timestampMs != null && this.clock.frozenAtMs === null) {
      this.clock.virtualMs = Math.trunc(meta.timestampMs);
    }
    const normalized = normalizeInput(input);
    const timestampMs = meta.timestampMs != null
      ? Math.trunc(meta.timestampMs)
      : Math.trunc(this.clock.now());
    const seq = meta.seq != null ? meta.seq : SEQ++;

    const entry = {
      input: normalized.key, // 兼容旧字段：输入键名
      key: normalized.key,
      type: normalized.type, // down=按下, up=释放，分别记录
      timestampMs,           // 毫秒级时间戳（权威计时）
      frame: this.frame,     // 帧号仅为辅助信息，不作为计时依据
      seq,
    };

    // 环形覆盖：写满后覆盖最旧条目，读写指针同步推进，不会错位或留洞
    if (this.buffer[this.writePtr] !== null) {
      this.readPtr = (this.writePtr + 1) % this.size;
    }
    this.buffer[this.writePtr] = entry;
    this.writePtr = (this.writePtr + 1) % this.size;
    return entry;
  }

  record(input, meta) { return this.recordInput(input, meta); }

  // 按时间顺序返回缓冲内容（最旧 -> 最新），不含被覆盖的槽位/null
  getInputs(nowMeta = {}) {
    const result = [];
    for (let i = 0; i < this.size; i++) {
      const idx = (this.readPtr + i) % this.size;
      const entry = this.buffer[idx];
      if (!entry) break;
      result.push(entry);
    }
    const nowFrame = nowMeta.frame != null ? nowMeta.frame : this.frame;
    return result.filter(e => Number.isFinite(this.frameWindow)
      ? nowFrame - e.frame < this.frameWindow
      : true);
  }

  // 消费最旧的一条（保留旧接口语义）
  consume() {
    const entry = this.buffer[this.readPtr];
    if (entry) {
      this.buffer[this.readPtr] = null;
      this.readPtr = (this.readPtr + 1) % this.size;
    }
    return entry;
  }

  setFrame(frame) { this.frame = frame; }
  beginFrame(frame) { this.frame = frame; }

  pause() { this.clock.pause(this.clock.now()); }
  resume(ms = Date.now()) { this.clock.resume(ms); }

  // 输入序列可复现：导出/回放快照
  exportSnapshot() {
    return this.getInputs().map(e => ({
      key: e.key, type: e.type, timestampMs: e.timestampMs, frame: e.frame, seq: e.seq,
    }));
  }
}

module.exports = { InputBuffer, VirtualClock, normalizeInput, DIRECTIONS };
