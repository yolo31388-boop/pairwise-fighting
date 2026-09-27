
class CommandRecognizer {
  constructor() { this.commands = {hadouken: ['down','forward','punch']}; }
  recognize(inputs) {
    // BUG: 只检查连续三个，不滑动窗口
    if (inputs.length >= 3) {
      const last3 = inputs.slice(-3).map(i => i.input);
      for (const [name, seq] of Object.entries(this.commands)) {
        if (JSON.stringify(last3) === JSON.stringify(seq)) return name;
      }
    }
    return null;
  }
}

module.exports = { CommandRecognizer };
