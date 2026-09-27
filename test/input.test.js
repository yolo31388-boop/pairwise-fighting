
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

describe('引擎边界不变量（新增）', () => {
  test('毫秒级时间戳：timestamp 精确到毫秒且不等于帧序号', () => {
    const buf = new InputBuffer();
    buf.record('down');
    buf.update(16);
    buf.record('forward');
    buf.update(16);
    buf.record('punch');
    const [a, b, c] = buf.getInputs();
    expect(typeof a.timestamp).toBe('number');
    expect(b.timestamp - a.timestamp).toBe(16);
    expect(c.timestamp - a.timestamp).toBe(32);
    // 帧序号只增加 2，时间戳增加 32ms，二者不能混用
    expect(c.frame - a.frame).toBe(2);
    expect(c.timestamp - a.timestamp).not.toBe(c.frame - a.frame);
  });

  test('同帧多次按键：全部保留且顺序不变', () => {
    const buf = new InputBuffer();
    buf.record('down');
    buf.record('forward');
    buf.record('punch');
    const inputs = buf.getInputs();
    expect(inputs.length).toBe(3);
    expect(inputs.map(i => i.input)).toEqual(['down', 'forward', 'punch']);
    expect(inputs[0].timestamp).toBe(inputs[2].timestamp);
  });

  test('滑动窗口匹配：序列前夹杂无关输入仍可识别', () => {
    const rec = new CommandRecognizer();
    const inputs = [
      { input: 'up', timestamp: 0 },
      { input: 'kick', timestamp: 50 },
      { input: 'down', timestamp: 100 },
      { input: 'forward', timestamp: 150 },
      { input: 'punch', timestamp: 200 },
    ];
    expect(rec.recognize(inputs)).toBe('hadouken');
  });

  test('按下与释放分别记录且互不覆盖', () => {
    const buf = new InputBuffer();
    buf.record({ key: 'punch', type: 'down' });
    buf.update(8);
    buf.record({ key: 'punch', type: 'up' });
    const inputs = buf.getInputs();
    expect(inputs.length).toBe(2);
    expect(inputs[0].type).toBe('down');
    expect(inputs[1].type).toBe('up');
    expect(inputs[1].timestamp - inputs[0].timestamp).toBe(8);
  });

  test('8方向输入：斜向可记录且可参与指令', () => {
    const buf = new InputBuffer();
    buf.record('down-forward');
    expect(buf.getInputs()[0].input).toBe('down-forward');
    const rec = new CommandRecognizer();
    const inputs = ['down', 'down-forward', 'forward', 'punch']
      .map((input, i) => ({ input, timestamp: i * 50 }));
    expect(rec.recognize(inputs)).toBe('hadouken');
  });

  test('指令时间窗口：超窗不触发，窗内触发', () => {
    const rec = new CommandRecognizer(undefined, { windowMs: 300 });
    const mk = (input, timestamp) => ({ input, timestamp });
    expect(rec.recognize([mk('down', 0), mk('forward', 100), mk('punch', 250)])).toBe('hadouken');
    expect(rec.recognize([mk('down', 0), mk('forward', 100), mk('punch', 500)])).toBeNull();
  });

  test('必杀技优先级：指令完成的拳触发必杀而非普通拳', () => {
    const action = new ActionSystem();
    action.handleInput('down');
    action.handleInput('forward');
    action.handleInput('punch');
    expect(action.state).toBe('special');
    expect(action.state).not.toBe('punch');
    const solo = new ActionSystem();
    solo.handleInput('punch');
    expect(solo.state).toBe('punch');
  });

  test('硬直时缓冲暂停计时，恢复后继续', () => {
    const action = new ActionSystem();
    action.handleInput('down');
    action.update(16);
    const before = action.buffer.clock;
    action.applyHitStun(40);
    action.update(16);
    action.update(16);
    expect(action.buffer.clock).toBe(before); // 硬直期间不计时
    action.handleInput('forward');
    const inputs = action.buffer.getInputs();
    expect(inputs[inputs.length - 1].timestamp).toBe(before);
    action.update(16); // 硬直剩余 8ms 清零并恢复
    action.update(16);
    expect(action.buffer.clock).toBeGreaterThan(before);
  });

  test('连按同一按键识别为多次输入，不合并', () => {
    const buf = new InputBuffer();
    buf.record('punch');
    buf.update(5);
    buf.record('punch');
    buf.update(5);
    buf.record('punch');
    const inputs = buf.getInputs();
    expect(inputs.length).toBe(3);
    expect(inputs.map(i => i.timestamp)).toEqual([0, 5, 10]);
  });

  test('缓冲区满时覆盖最旧数据且顺序正确', () => {
    const buf = new InputBuffer(4);
    ['a', 'b', 'c', 'd', 'e', 'f'].forEach(i => buf.record(i));
    const inputs = buf.getInputs();
    expect(inputs.length).toBe(4);
    expect(inputs.map(i => i.input)).toEqual(['c', 'd', 'e', 'f']);
    buf.record('g');
    expect(buf.getInputs().map(i => i.input)).toEqual(['d', 'e', 'f', 'g']);
  });

  test('快速连续指令：两次波动拳都能触发', () => {
    const action = new ActionSystem();
    ['down', 'forward', 'punch'].forEach(i => action.handleInput(i));
    expect(action.state).toBe('special');
    action.handleInput('down');
    action.handleInput('forward');
    action.handleInput('punch');
    expect(action.state).toBe('special');
    // 旧指令不会滞留重触发：普通脚仍是普通脚
    action.handleInput('kick');
    expect(action.state).toBe('kick');
  });

  test('输入序列可复现：相同序列相同时间戳结果一致', () => {
    const replay = () => {
      const buf = new InputBuffer();
      [['down', 0], ['forward', 80], ['punch', 160]].forEach(([input, t]) => {
        buf.recordInput(input, { timestamp: t });
      });
      return new CommandRecognizer().recognize(buf.getInputs());
    };
    expect(replay()).toBe('hadouken');
    expect(replay()).toBe(replay());
  });

  test('getInputs 不含空槽且按时间顺序排列', () => {
    const buf = new InputBuffer(3);
    buf.record('a');
    buf.record('b');
    buf.record('c');
    buf.record('d');
    const inputs = buf.getInputs();
    expect(inputs.every(i => i !== null && i !== undefined)).toBe(true);
    expect(inputs.map(i => i.input)).toEqual(['b', 'c', 'd']);
  });
});
