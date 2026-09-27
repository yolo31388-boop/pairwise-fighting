// 指令识别：在输入缓冲内滑动窗口匹配指令序列
// 不变量：
// - 滑动窗口匹配：序列可出现在缓冲区任意位置，允许夹杂其它输入
// - 指令有时间窗口：首末匹配输入的时间戳差超过 windowMs 不触发
// - 支持 8 方向：斜向输入（如 down-forward）可满足其包含的正方向
function inputName(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    return entry.input !== undefined ? entry.input : entry.key;
  }
  return undefined;
}

function matchesInput(actual, required) {
  if (actual === required) return true;
  // 斜向输入可满足其包含的 cardinal 方向（如 down-forward 含 forward）
  if (typeof actual === 'string' && actual.includes('-')) {
    return actual.split('-').includes(required);
  }
  return false;
}

class CommandRecognizer {
  constructor(commands, opts = {}) {
    this.commands = commands || { hadouken: ['down', 'forward', 'punch'] };
    this.windowMs = typeof opts.windowMs === 'number' ? opts.windowMs : 1000;
  }

  // 从最新输入向前滑动匹配序列，返回 { name, endIndex } 或 null
  match(inputs) {
    const entries = (inputs || []).filter(e => e !== null && e !== undefined);
    let best = null;
    for (const [name, seq] of Object.entries(this.commands)) {
      const matched = new Array(seq.length);
      let si = seq.length - 1;
      let endIndex = -1;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (matchesInput(inputName(entries[i]), seq[si])) {
          if (si === seq.length - 1) endIndex = i;
          matched[si] = entries[i];
          si--;
          if (si < 0) break;
        }
      }
      if (si >= 0) continue; // 序列未匹配完整
      const first = matched[0];
      const last = matched[matched.length - 1];
      // 指令时间窗口：超过窗口的组合不触发
      if (first && last && typeof first.timestamp === 'number' && typeof last.timestamp === 'number') {
        if (last.timestamp - first.timestamp > this.windowMs) continue;
      }
      if (!best || endIndex > best.endIndex) best = { name, endIndex };
    }
    return best;
  }

  recognize(inputs) {
    const m = this.match(inputs);
    return m ? m.name : null;
  }
}

module.exports = { CommandRecognizer };
