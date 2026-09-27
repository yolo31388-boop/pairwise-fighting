const { InputBuffer } = require('../input/buffer.js');
const { CommandRecognizer } = require('../input/commandRecognizer.js');

const NORMAL_ATTACKS = { punch: 'punch', kick: 'kick' };

class ActionSystem {
  constructor(opts = {}) {
    this.buffer = new InputBuffer(opts.bufferSize);
    this.recognizer = new CommandRecognizer(opts.commands, opts);
    this.state = 'idle';
    this.hitStunMs = 0;
  }

  handleInput(input, opts) {
    const entry = this.buffer.record(input, opts);
    const inputs = this.buffer.getInputs();
    const m = this.recognizer.match(inputs);
    // 必杀技优先于普通技：仅当最新输入完成指令时触发（支持快速连续指令）
    if (m && m.endIndex === inputs.length - 1) {
      this.state = m.name === 'hadouken' ? 'special' : m.name;
      return this.state;
    }
    const name = entry.input;
    if (NORMAL_ATTACKS[name] && entry.type !== 'up' && entry.type !== 'release') {
      this.state = NORMAL_ATTACKS[name];
    }
    return this.state;
  }

  // 被击中/硬直：暂停输入缓冲计时
  applyHitStun(durationMs) {
    this.hitStunMs = Math.max(0, durationMs);
    this.buffer.pause();
  }

  // 推进游戏时间；硬直结束后恢复缓冲计时
  update(dtMs = 16) {
    if (this.hitStunMs > 0) {
      this.hitStunMs = Math.max(0, this.hitStunMs - dtMs);
      if (this.hitStunMs === 0) this.buffer.resume();
      return;
    }
    this.buffer.update(dtMs);
  }
}

module.exports = { ActionSystem };
