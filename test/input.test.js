
const { InputBuffer } = require('../src/input/buffer.js');
const { CommandRecognizer } = require('../src/input/commandRecognizer.js');
const { ActionSystem } = require('../src/combat/action.js');

describe('格斗输入缓冲', () => {
  test('同帧多次按键应记录', () => {
    const buf = new InputBuffer();
    buf.record('punch');
    buf.record('kick');
    expect(buf.getInputs().length).toBe(2);
  });

  test('滑动窗口指令匹配', () => {
    const rec = new CommandRecognizer();
    const inputs = [{input:'up'},{input:'down'},{input:'forward'},{input:'punch'}];
    expect(rec.recognize(inputs)).toBe('hadouken');
  });

  test('按下释放分别记录', () => {
    const buf = new InputBuffer();
    buf.record({key:'punch', type:'down'});
    buf.record({key:'punch', type:'up'});
    const inputs = buf.getInputs();
    expect(inputs[0].type).toBe('down');
    expect(inputs[1].type).toBe('up');
  });

  test('指令时间窗口', () => {
    const buf = new InputBuffer();
    buf.record('down');
    buf.record('forward');
    // 模拟超时
    buf.buffer.forEach(b => { if (b) b.frame = 0; });
    buf.record('punch');
    const rec = new CommandRecognizer();
    // 应该能识别，因为punch是新的
    expect(rec.recognize(buf.getInputs())).toBe('hadouken');
  });

  test('必杀技优先级高于普通技', () => {
    const action = new ActionSystem();
    action.handleInput('down');
    action.handleInput('forward');
    action.handleInput('punch');
    expect(action.state).toBe('special');
  });

  test('连按不合并', () => {
    const buf = new InputBuffer();
    buf.record('punch');
    buf.record('punch');
    expect(buf.getInputs().length).toBe(2);
  });

  test('缓冲区满时正确覆盖', () => {
    const buf = new InputBuffer(3);
    buf.record('a'); buf.record('b'); buf.record('c');
    buf.record('d'); // 覆盖a
    const inputs = buf.getInputs();
    expect(inputs.length).toBe(3);
    expect(inputs[0].input).toBe('b');
  });
});
