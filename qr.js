(() => {
  const VERSION = 5;
  const SIZE = 37;
  const DATA_CODEWORDS = 108;
  const ECC_CODEWORDS = 26;

  window.drawQr = function drawQr(canvas, text) {
    const modules = makeQr(text);
    const ctx = canvas.getContext("2d");
    const scale = Math.floor(Math.min(canvas.width, canvas.height) / (SIZE + 8));
    const offset = Math.floor((canvas.width - scale * SIZE) / 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#101828";
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (modules[y][x]) ctx.fillRect(offset + x * scale, offset + y * scale, scale, scale);
      }
    }
  };

  function makeQr(text) {
    const data = encodeData(text);
    const ecc = reedSolomon(data, ECC_CODEWORDS);
    const bits = bytesToBits(data.concat(ecc));
    const modules = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
    const reserved = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
    drawFunctionPatterns(modules, reserved);
    drawData(modules, reserved, bits);
    drawFormat(modules, reserved);
    return modules;
  }

  function encodeData(text) {
    const bytes = [...new TextEncoder().encode(text)].slice(0, 90);
    const bits = [];
    appendBits(bits, 0b0100, 4);
    appendBits(bits, bytes.length, 8);
    bytes.forEach((byte) => appendBits(bits, byte, 8));
    appendBits(bits, 0, Math.min(4, DATA_CODEWORDS * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const out = [];
    for (let i = 0; i < bits.length; i += 8) out.push(bitsToByte(bits.slice(i, i + 8)));
    for (let pad = 0; out.length < DATA_CODEWORDS; pad++) out.push(pad % 2 ? 0x11 : 0xec);
    return out;
  }

  function appendBits(bits, value, length) {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  }

  function bitsToByte(bits) {
    return bits.reduce((value, bit) => (value << 1) | bit, 0);
  }

  function bytesToBits(bytes) {
    const bits = [];
    bytes.forEach((byte) => appendBits(bits, byte, 8));
    return bits;
  }

  function reedSolomon(data, degree) {
    const gen = generatorPoly(degree);
    const rem = Array(degree).fill(0);
    for (const byte of data) {
      const factor = byte ^ rem.shift();
      rem.push(0);
      for (let i = 0; i < degree; i++) rem[i] ^= gfMul(gen[i + 1], factor);
    }
    return rem;
  }

  function generatorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], gfPow(2, i));
      }
      poly = next;
    }
    return poly;
  }

  function gfMul(x, y) {
    let value = 0;
    while (y > 0) {
      if (y & 1) value ^= x;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
      y >>>= 1;
    }
    return value & 0xff;
  }

  function gfPow(x, power) {
    let value = 1;
    for (let i = 0; i < power; i++) value = gfMul(value, x);
    return value;
  }

  function drawFunctionPatterns(modules, reserved) {
    drawFinder(modules, reserved, 0, 0);
    drawFinder(modules, reserved, SIZE - 7, 0);
    drawFinder(modules, reserved, 0, SIZE - 7);
    for (let i = 8; i < SIZE - 8; i++) {
      set(modules, reserved, i, 6, i % 2 === 0);
      set(modules, reserved, 6, i, i % 2 === 0);
    }
    drawAlignment(modules, reserved, 30, 30);
    set(modules, reserved, 8, SIZE - 8, true);
    for (let i = 0; i < 9; i++) {
      reserve(reserved, 8, i);
      reserve(reserved, i, 8);
    }
    for (let i = SIZE - 8; i < SIZE; i++) reserve(reserved, 8, i);
    for (let i = SIZE - 7; i < SIZE; i++) reserve(reserved, i, 8);
  }

  function drawFinder(modules, reserved, x, y) {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE) continue;
        const dark = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 &&
          (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        set(modules, reserved, xx, yy, dark);
      }
    }
  }

  function drawAlignment(modules, reserved, cx, cy) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const dark = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
        set(modules, reserved, cx + dx, cy + dy, dark);
      }
    }
  }

  function drawData(modules, reserved, bits) {
    let bitIndex = 0;
    let upward = true;
    for (let x = SIZE - 1; x >= 1; x -= 2) {
      if (x === 6) x--;
      for (let i = 0; i < SIZE; i++) {
        const y = upward ? SIZE - 1 - i : i;
        for (let dx = 0; dx < 2; dx++) {
          const xx = x - dx;
          if (reserved[y][xx]) continue;
          const raw = bitIndex < bits.length ? bits[bitIndex++] === 1 : false;
          modules[y][xx] = raw !== ((xx + y) % 2 === 0);
        }
      }
      upward = !upward;
    }
  }

  function drawFormat(modules) {
    const format = formatBits(0b01, 0);
    for (let i = 0; i <= 5; i++) modules[8][i] = bit(format, i);
    modules[8][7] = bit(format, 6);
    modules[8][8] = bit(format, 7);
    modules[7][8] = bit(format, 8);
    for (let i = 9; i < 15; i++) modules[14 - i][8] = bit(format, i);
    for (let i = 0; i < 8; i++) modules[SIZE - 1 - i][8] = bit(format, i);
    for (let i = 8; i < 15; i++) modules[8][SIZE - 15 + i] = bit(format, i);
  }

  function formatBits(ecLevel, mask) {
    let data = (ecLevel << 3) | mask;
    let value = data << 10;
    const generator = 0b10100110111;
    for (let i = 14; i >= 10; i--) {
      if ((value >>> i) & 1) value ^= generator << (i - 10);
    }
    return ((data << 10) | value) ^ 0b101010000010010;
  }

  function bit(value, index) {
    return ((value >>> index) & 1) === 1;
  }

  function set(modules, reserved, x, y, value) {
    modules[y][x] = value;
    reserved[y][x] = true;
  }

  function reserve(reserved, x, y) {
    reserved[y][x] = true;
  }
})();
