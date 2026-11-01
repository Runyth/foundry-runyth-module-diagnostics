// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { FIXED_MTIME, listFiles } from "./fs.mjs";

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()
  };
}

function uint16(value) {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(value & 0xffff, 0);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

export async function zipDirectory({ source, destination, rootName, timestamp = FIXED_MTIME, filter = () => true }) {
  const files = (await listFiles(source)).filter(filter).sort();
  const localParts = [];
  const centralParts = [];
  const { time, date } = dosDateTime(timestamp);
  let offset = 0;

  for (const relative of files) {
    const name = `${rootName}/${relative}`.replaceAll("\\", "/");
    const nameBuffer = Buffer.from(name, "utf8");
    const data = await readFile(path.join(source, relative));
    const checksum = crc32(data);
    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(time),
      uint16(date),
      uint32(checksum),
      uint32(data.length),
      uint32(data.length),
      uint16(nameBuffer.length),
      uint16(0)
    ]);
    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(time),
      uint16(date),
      uint32(checksum),
      uint32(data.length),
      uint32(data.length),
      uint16(nameBuffer.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset)
    ]);
    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0)
  ]);
  await writeFile(destination, Buffer.concat([...localParts, centralDirectory, end]));
  return files;
}
