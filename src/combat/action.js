

class ActionSystem {
  constructor() { this.buffer = new InputBuffer(); this.recognizer = new CommandRecognizer(); this.state = 'idle'; }
  handleInput(input) {
    this.buffer.record(input);
    const cmd = this.recognizer.recognize(this.buffer.getInputs());
    if (cmd === 'hadouken') this.state = 'special';
    else if (input === 'punch') this.state = 'punch';
  }
}

module.exports = { ActionSystem };
