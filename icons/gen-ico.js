var fs = require('fs');
var size = 32;
var buf = Buffer.alloc(22 + 40 + size * size * 4);

// ICO Header
buf.writeUInt16LE(0, 0);
buf.writeUInt16LE(1, 2);
buf.writeUInt16LE(1, 4);

// ICO Directory Entry
buf.writeUInt8(size, 6);
buf.writeUInt8(size, 7);
buf.writeUInt8(0, 8);
buf.writeUInt8(0, 9);
buf.writeUInt16LE(1, 10);
buf.writeUInt16LE(32, 12);
var imgSize = 40 + size * size * 4;
buf.writeUInt32LE(imgSize, 14);
buf.writeUInt32LE(22, 18);

// BITMAPINFOHEADER
var offset = 22;
buf.writeUInt32LE(40, offset); offset += 4;
buf.writeUInt32LE(size, offset); offset += 4;
buf.writeUInt32LE(size * 2, offset); offset += 4;
buf.writeUInt16LE(1, offset); offset += 2;
buf.writeUInt16LE(32, offset); offset += 2;
buf.writeUInt32LE(0, offset); offset += 4;
buf.writeUInt32LE(size * size * 4, offset); offset += 4;
buf.writeUInt32LE(0, offset); offset += 4;
buf.writeUInt32LE(0, offset); offset += 4;
buf.writeUInt32LE(0, offset); offset += 4;
buf.writeUInt32LE(0, offset); offset += 4;

// Pixel data
for (var y = 0; y < size; y++) {
  for (var x = 0; x < size; x++) {
    var idx = offset + ((size - 1 - y) * size + x) * 4;
    buf[idx] = 0;
    buf[idx + 1] = 100;
    buf[idx + 2] = 200;
    buf[idx + 3] = 255;
  }
}

fs.writeFileSync('src-tauri/icons/icon.ico', buf);
fs.writeFileSync('src-tauri/icons/icon.icns', buf);
console.log('Written:', buf.length, 'bytes');
