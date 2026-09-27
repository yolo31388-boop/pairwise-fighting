// 指令识别：在输入缓冲上做滑动窗口匹配
// 不变量：
// - 在整个有效窗口内滑动匹配子序列，而不是只看连续三帧
// - 所有匹配输入必须落在指令时间窗口（毫秒）内，超时组合不触发
// - 方向支持 8 方向（含斜向）：斜向等价于其两个分量
// - 触发按键必须是按下（type=down），释放(type=up)不能触发
// - 必杀技优先于普通技（优先级由 ActionSystem 保证）

// 绝对 8 方向 -> 相对分量集合（斜向同时满足两个正交方向）
const DIRECTION_COMPONENTS = {
  up: ['up'], down: ['down'], left: ['left'], right: ['right'],
  upleft: ['up', 'left'], upright: ['up', 'right'],
  downleft: ['down', 'left'], downright: ['down', 'right'],
  neutral: ['neutral'],
  // 相对方向（面向右时的前/后）也支持斜向
  forward: ['forward'], back: ['back'],
  upforward: ['up', 'forward'], upback: ['up', 'back'],
  downforward: ['down', 'forward'], downback: ['down', 'back'],
};

function viewOf(entry) {
  if (entry == null) return null;
  if (typeof entry === 'string') return { key: entry, type: 'down', timestampMs: null, frame: null };
  const key = entry.key != null ? entry.key : entry.input;
  return {
    key,
    type: entry.type || 'down',
    timestampMs: entry.timestampMs != null ? entry.timestampMs : null,
    frame: entry.frame != null ? entry.frame : null,
  };
}

// 一条输入方向是否覆盖目标方向（斜向覆盖其分量）
function directionCovers(inputKey, target) {
  const comps = DIRECTION_COMPONENTS[inputKey];
  return Array.isArray(comps) && comps.includes(target);
}

function matchesKey(inputKey, target) {
  if (inputKey === target) return true;
  return directionCovers(inputKey, target);
}

class CommandRecognizer {
  constructor(options = {}) {
    // 波动拳：下 -> 前 -> 拳，默认 500ms 窗口
    this.timeWindowMs = options.timeWindowMs != null ? options.timeWindowMs : 500;
    this.commands = {};
    this.register('hadouken', ['down', 'forward', 'punch'], { finalIsPress: true });
  }

  register(name, sequence, opts = {}) {
    this.commands[name] = {
      sequence: sequence.slice(),
      finalIsPress: opts.finalIsPress !== false,
      priority: opts.priority != null ? opts.priority : 0,
    };
  }

  // 规范公开接口。nowMs 用于时间窗口判定；缺省取最后一条输入的时间戳。
  recognize(inputs, nowMs) {
    if (!Array.isArray(inputs) || inputs.length === 0) return null;
    const list = inputs.map(viewOf).filter(Boolean);
    if (list.length === 0) return null;

    const refNow = nowMs != null
      ? Number(nowMs)
      : (list[list.length - 1].timestampMs != null ? list[list.length - 1].timestampMs : null);

    const ordered = Object.entries(this.commands)
      .sort((a, b) => b[1].priority - a[1].priority)
      .map(([name, def]) => [name, def]);

    for (const [name, def] of ordered) {
      if (this._match(list, def, refNow)) return name;
    }
    return null;
  }

  _match(list, def, refNow) {
    const seq = def.sequence;
    const last = list[list.length - 1];

    // 锚定最后一条输入：它必须匹配序列末尾（保证快速连续指令各自独立触发）
    if (!matchesKey(last.key, seq[seq.length - 1])) return false;
    if (def.finalIsPress && last.type !== 'down') return false;
    if (!this._withinWindow(last, refNow)) return false;

    // 从末尾向前做贪心子序列匹配，允许中间夹杂无关输入（滑动窗口而非连续三帧）
    let si = seq.length - 2;
    for (let i = list.length - 2; i >= 0 && si >= 0; i--) {
      const e = list[i];
      if (!this._withinWindow(e, refNow)) continue;
      if (matchesKey(e.key, seq[si])) si--;
    }
    return si < 0;
  }

  _withinWindow(entry, refNow) {
    if (entry.timestampMs == null || refNow == null) return true; // 无时间戳信息时不做时间淘汰
    return refNow - entry.timestampMs <= this.timeWindowMs;
  }
}

module.exports = { CommandRecognizer, DIRECTION_COMPONENTS };
