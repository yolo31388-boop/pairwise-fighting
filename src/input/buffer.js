
// 输入缓冲 - 存在写入指针和时间戳bug
class InputBuffer {
  constructor(size = 10) {
    this.size = size;
    this.buffer = new Array(size).fill(null);
    this.writePtr = 0;
    this.readPtr = 0;
  }
  record(input) {
    // BUG: 覆盖时不检查是否覆盖了未读数据
    this.buffer[this.writePtr] = {input, frame: Date.now()}; // BUG: 用毫秒时间戳但精度不够
    this.writePtr = (this.writePtr + 1) % this.size;
  }
  consume() {
    if (this.buffer[this.readPtr]) {
      const val = this.buffer[this.readPtr];
      this.buffer[this.readPtr] = null;
      this.readPtr = (this.readPtr + 1) % this.size;
      return val;
    }
    return null;
  }
  getInputs() {
    // BUG: 返回数组，包含null
    return this.buffer.filter(x => x !== null);
  }
}

module.exports = { InputBuffer };
