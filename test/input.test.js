const { InputBuffer, VirtualClock, DIRECTIONS } = require('../src/input/buffer.js');
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

describe('引擎边界不变量（新增断言）', () => {
  test('毫秒级时间戳：记录 timestampMs 整数毫秒，而非仅帧序号', () => {
    const buf = new InputBuffer();
    const entry = buf.recordInput('punch', { frame: 7, timestampMs: 123456789 });
    expect(Number.isInteger(entry.timestampMs)).toBe(true);
    expect(entry.timestampMs).toBe(123456789);
    expect(entry.frame).toBe(7);
    const entries = buf.getInputs();
    expect(entries[0]).toHaveProperty('timestampMs');
    // 同帧内相隔数毫秒的两次输入必须可区分
    const e1 = buf.recordInput('punch', { frame: 7, timestampMs: 123456790 });
    const e2 = buf.recordInput('punch', { frame: 7, timestampMs: 123456793 });
    expect(e2.timestampMs - e1.timestampMs).toBe(3);
  });

  test('同帧多次按键：三条输入同帧且全部保留，序号递增', () => {
    const buf = new InputBuffer();
    [100, 105, 111].forEach(ts => buf.recordInput('punch', { frame: 3, timestampMs: ts }));
    const inputs = buf.getInputs();
    expect(inputs).toHaveLength(3);
    expect(inputs.every(i => i.frame === 3)).toBe(true);
    expect(inputs[2].seq).toBeGreaterThan(inputs[1].seq);
    expect(inputs[1].seq).toBeGreaterThan(inputs[0].seq);
  });

  test('滑动窗口匹配：方向之间夹杂无关输入仍可识别波动拳', () => {
    const rec = new CommandRecognizer();
    const inputs = [
      { input: 'down', type: 'down', timestampMs: 0 },
      { input: 'kick', type: 'down', timestampMs: 10 },
      { input: 'forward', type: 'down', timestampMs: 20 },
      { input: 'up', type: 'down', timestampMs: 30 },
      { input: 'punch', type: 'down', timestampMs: 40 },
    ];
    expect(rec.recognize(inputs, 40)).toBe('hadouken');
  });

  test('按下与释放分别记录：释放 punch 不能触发必杀技', () => {
    const rec = new CommandRecognizer();
    const released = [
      { key: 'down', type: 'down', timestampMs: 0 },
      { key: 'forward', type: 'down', timestampMs: 10 },
      { key: 'punch', type: 'up', timestampMs: 20 },
    ];
    expect(rec.recognize(released, 20)).toBeNull();

    const buf = new InputBuffer();
    buf.recordInput({ key: 'punch', type: 'down' }, { timestampMs: 0 });
    buf.recordInput({ key: 'punch', type: 'up' }, { timestampMs: 5 });
    buf.recordInput({ key: 'punch', type: 'down' }, { timestampMs: 10 });
    const inputs = buf.getInputs();
    expect(inputs.map(i => i.type)).toEqual(['down', 'up', 'down']);
  });

  test('8 方向输入：八个方向各自独立，斜向等价于分量', () => {
    expect(DIRECTIONS).toEqual(
      expect.arrayContaining(['upleft', 'upright', 'downleft', 'downright'])
    );
    const buf = new InputBuffer();
    ['up', 'down', 'left', 'right', 'upleft', 'upright', 'downleft', 'downright']
      .forEach(d => buf.recordInput({ direction: d }, { timestampMs: 0 }));
    const keys = new Set(buf.getInputs().map(i => i.key));
    expect(keys.size).toBe(8);

    const rec = new CommandRecognizer();
    const diagonal = [
      { input: 'down', type: 'down', timestampMs: 0 },
      { input: 'downforward', type: 'down', timestampMs: 10 },
      { input: 'punch', type: 'down', timestampMs: 20 },
    ];
    expect(rec.recognize(diagonal, 20)).toBe('hadouken');
  });

  test('指令时间窗口：超过 500ms 的组合不触发，窗口内触发', () => {
    const rec = new CommandRecognizer();
    const stale = [
      { input: 'down', type: 'down', timestampMs: 0 },
      { input: 'forward', type: 'down', timestampMs: 0 },
      { input: 'punch', type: 'down', timestampMs: 600 },
    ];
    expect(rec.recognize(stale, 600)).toBeNull();

    const fresh = [
      { input: 'down', type: 'down', timestampMs: 150 },
      { input: 'forward', type: 'down', timestampMs: 150 },
      { input: 'punch', type: 'down', timestampMs: 450 },
    ];
    expect(rec.recognize(fresh, 450)).toBe('hadouken');
  });

  test('必杀技优先于普通技：完整指令成立时不出普通拳', () => {
    const action = new ActionSystem();
    action.update('punch', { timestampMs: 0 });
    expect(action.state).toBe('punch');
    action.update('down', { timestampMs: 50 });
    action.update('forward', { timestampMs: 100 });
    action.update('punch', { timestampMs: 150 });
    expect(action.state).toBe('special');
    expect(action.lastCommand).toBe('hadouken');
  });

  test('硬直时缓冲暂停计时：硬直期间墙钟流逝不计入，恢复后指令仍成立', () => {
    const clock = new VirtualClock(0);
    const action = new ActionSystem({ clock });
    action.update('down', { timestampMs: 100, frame: 1 });

    action.enterStun();
    expect(action.state).toBe('stun');
    expect(clock.frozenAtMs).not.toBeNull();
    // 硬直中输入仍记录但不出动作
    expect(action.update('forward', { frame: 2 })).toBeNull();
    expect(action.state).toBe('stun');

    // 墙钟过了 1 秒才恢复；暂停期间的时间被跳过，虚拟时间仍停在硬直前
    action.exitStun();
    expect(clock.now()).toBe(100);
    action.update('punch', { timestampMs: 150, frame: 3 });
    expect(action.state).toBe('special');
  });

  test('连按同一按键识别为多次输入，不合并，每次都出普通拳', () => {
    const action = new ActionSystem();
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(action.update('punch', { timestampMs: i * 20, frame: i }));
    }
    expect(action.buffer.getInputs()).toHaveLength(5);
    expect(results).toEqual(['punch', 'punch', 'punch', 'punch', 'punch']);
    const seqs = action.buffer.getInputs().map(i => i.seq);
    expect(new Set(seqs).size).toBe(5);
  });

  test('缓冲区满时正确覆盖：环形指针不留洞、不重复、顺序正确', () => {
    const buf = new InputBuffer(3);
    ['a', 'b', 'c', 'd', 'e', 'f'].forEach(k => buf.recordInput(k, { timestampMs: 0 }));
    const inputs = buf.getInputs();
    expect(inputs).toHaveLength(3);
    expect(inputs.map(i => i.input)).toEqual(['d', 'e', 'f']);
    expect(buf.buffer).toHaveLength(3);
    expect(buf.buffer.every(x => x !== null)).toBe(true);
    expect(buf.readPtr).toBe(buf.writePtr);
  });

  test('快速连续两次波动拳各自独立识别，中间帧无误判', () => {
    const action = new ActionSystem();
    const timeline = [
      ['down', 0], ['forward', 50], ['punch', 60],
      ['down', 70], ['forward', 120], ['punch', 130],
    ];
    const results = timeline.map(([key, ts], idx) => action.update(key, { timestampMs: ts, frame: idx + 1 }));
    expect(results).toEqual([null, null, 'special', null, null, 'special']);
  });

  test('输入序列可复现：导出快照后在全新实例回放得到相同识别结果', () => {
    const clock = new VirtualClock(0);
    const buf = new InputBuffer(10, { clock });
    buf.recordInput('up', { timestampMs: 0, frame: 1 });
    buf.recordInput('down', { timestampMs: 30, frame: 2 });
    buf.recordInput('forward', { timestampMs: 60, frame: 3 });
    buf.recordInput('punch', { timestampMs: 90, frame: 3 });
    const rec = new CommandRecognizer();
    const snapshot = buf.exportSnapshot();
    expect(rec.recognize(buf.getInputs(), 90)).toBe('hadouken');

    const replayBuf = new InputBuffer(10);
    snapshot.forEach(e => replayBuf.recordInput({ key: e.key, type: e.type },
      { timestampMs: e.timestampMs, frame: e.frame, seq: e.seq }));
    const replayRec = new CommandRecognizer();
    expect(replayRec.recognize(replayBuf.getInputs(), 90)).toBe('hadouken');
    expect(replayBuf.exportSnapshot()).toEqual(snapshot);
  });

  test('recordInput/update 为规范公开接口，旧别名 record/handleInput 行为一致', () => {
    const buf = new InputBuffer();
    expect(typeof buf.recordInput).toBe('function');
    expect(typeof buf.record).toBe('function');
    const viaAlias = buf.record('kick', { timestampMs: 1 });
    expect(viaAlias.input).toBe('kick');
    expect(viaAlias.timestampMs).toBe(1);

    const action = new ActionSystem();
    expect(typeof action.update).toBe('function');
    expect(typeof action.handleInput).toBe('function');
    action.handleInput('down');
    action.handleInput('forward');
    action.handleInput('punch');
    expect(action.state).toBe('special');
  });
});
