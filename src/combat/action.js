// 战斗动作系统：连接输入缓冲与指令识别
// 不变量：
// - 必杀技优先于普通技：同一输入先判指令，命中则不再产生普通技
// - 角色被击中/硬直(stun)时输入缓冲暂停计时，恢复后继续；
//   硬直期间输入仍被记录，但不产生动作
// - update() 为规范公开接口，handleInput() 为兼容别名
const { InputBuffer, normalizeInput } = require('../input/buffer.js');
const { CommandRecognizer } = require('../input/commandRecognizer.js');

const ATTACK_KEYS = new Set(['punch', 'kick']);

class ActionSystem {
  constructor(options = {}) {
    this.buffer = options.buffer || new InputBuffer(
      options.bufferSize != null ? options.bufferSize : 10,
      options.clock ? { clock: options.clock } : undefined
    );
    this.recognizer = options.recognizer || new CommandRecognizer(
      options.timeWindowMs != null ? { timeWindowMs: options.timeWindowMs } : undefined
    );
    this.state = 'idle';
    this.stunned = false;
    this.lastCommand = null;
  }

  enterStun() {
    if (!this.stunned) {
      this.stunned = true;
      this.state = 'stun';
      this.buffer.pause(); // 硬直期间缓冲计时冻结
    }
  }

  exitStun() {
    if (this.stunned) {
      this.stunned = false;
      this.state = 'idle';
      this.buffer.resume(this.buffer.clock.now()); // 恢复后继续，暂停时长不计入
    }
  }

  // 规范公开接口：喂入一条输入并解析当前应进入的动作
  update(input, meta = {}) {
    if (input != null) this.buffer.recordInput(input, meta);
    if (this.stunned) return null; // 硬直中只记录，不出招

    const inputs = this.buffer.getInputs(meta);
    const command = this.recognizer.recognize(
      inputs,
      meta.timestampMs != null ? meta.timestampMs : this.buffer.clock.now()
    );

    if (command) {
      // 必杀技优先：识别到指令时普通拳被吞掉
      this.lastCommand = command;
      this.state = this._specialState(command);
      return this.state;
    }

    if (input != null) {
      const key = normalizeInput(input).key;
      if (ATTACK_KEYS.has(key)) {
        this.state = key; // 普通技
        return this.state;
      }
    }
    return null;
  }

  handleInput(input, meta) { return this.update(input, meta); }

  _specialState(command) {
    return command === 'hadouken' ? 'special' : 'special';
  }
}

module.exports = { ActionSystem };
