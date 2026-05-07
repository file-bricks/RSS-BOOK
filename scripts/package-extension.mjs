import { promises as fs } from "node:fs";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const REQUIRED_FILES = [
  "manifest.json",
  "sw.js",
  "LICENSE",
  "PRIVACY_POLICY.md",
  "icons/16.png",
  "icons/48.png",
  "icons/128.png",
];

const REQUIRED_DIRS = ["_locales", "lib", "ui"];

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < CRC_TABLE.length; i += 1) {
  let crc = i;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  CRC_TABLE[i] = crc >>> 0;
}

function toZipPath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

async function assertFile(rootDir, relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`Expected file in package: ${relativePath}`);
  }
  return {
    name: toZipPath(relativePath),
    absolutePath,
    mtime: stat.mtime,
    size: stat.size,
  };
}

async function collectFiles(rootDir, relativeDir) {
  const absoluteDir = path.join(rootDir, relativeDir);
  const dirEntries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of dirEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(rootDir, relativePath)));
    } else if (entry.isFile()) {
      files.push(await assertFile(rootDir, relativePath));
    }
  }

  return files;
}

async function readJson(rootDir, relativePath) {
  const text = await fs.readFile(path.join(rootDir, relativePath), "utf8");
  return JSON.parse(text);
}

function ensureUnique(entries) {
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.name)) {
      throw new Error(`Duplicate package entry: ${entry.name}`);
    }
    seen.add(entry.name);
  }
}

async function validatePackageEntries(rootDir, entries) {
  const manifest = await readJson(rootDir, "manifest.json");
  const packageJson = await readJson(rootDir, "package.json");
  const names = new Set(entries.map((entry) => entry.name));

  if (manifest.version !== packageJson.version) {
    throw new Error(`Version mismatch: manifest ${manifest.version} != package ${packageJson.version}`);
  }

  for (const iconPath of Object.values(manifest.icons || {})) {
    if (!names.has(iconPath)) {
      throw new Error(`Manifest icon is missing from package: ${iconPath}`);
    }
  }

  for (const iconPath of Object.values(manifest.action?.default_icon || {})) {
    if (!names.has(iconPath)) {
      throw new Error(`Action icon is missing from package: ${iconPath}`);
    }
  }

  if (manifest.default_locale && !names.has(`_locales/${manifest.default_locale}/messages.json`)) {
    throw new Error(`Default locale is missing from package: ${manifest.default_locale}`);
  }

  return { manifest, packageJson };
}

export async function collectPackageEntries(rootDir = projectRoot) {
  const entries = [];

  for (const filePath of REQUIRED_FILES) {
    entries.push(await assertFile(rootDir, filePath));
  }

  for (const dirPath of REQUIRED_DIRS) {
    entries.push(...(await collectFiles(rootDir, dirPath)));
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  ensureUnique(entries);
  await validatePackageEntries(rootDir, entries);
  return entries;
}

async function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const fileBuffer = await fs.readFile(entry.absolutePath);
    const compressed = deflateRawSync(fileBuffer, { level: 9 });
    const useStored = compressed.length >= fileBuffer.length;
    const payload = useStored ? fileBuffer : compressed;
    const method = useStored ? 0 : 8;
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const crc = crc32(fileBuffer);
    const { date, time } = dosDateTime(entry.mtime);
    const localOffset = offset;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(fileBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, payload);
    offset += localHeader.length + nameBuffer.length + payload.length;

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(fileBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);

    centralParts.push(centralHeader, nameBuffer);
  }

  const centralOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const centralSize = centralDirectory.length;
  const entryCount = entries.length;

  if (entryCount > 0xffff || centralOffset > 0xffffffff || centralSize > 0xffffffff) {
    throw new Error("ZIP64 is not supported by this lightweight packager.");
  }

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entryCount, 8);
  endRecord.writeUInt16LE(entryCount, 10);
  endRecord.writeUInt32LE(centralSize, 12);
  endRecord.writeUInt32LE(centralOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

export async function buildExtensionPackage({
  rootDir = projectRoot,
  outputDir = path.join(rootDir, "dist"),
  outputFile,
  quiet = false,
} = {}) {
  const entries = await collectPackageEntries(rootDir);
  const { manifest } = await validatePackageEntries(rootDir, entries);
  const archive = await createZip(entries);
  const fileName = outputFile || `RSS-BOOK-v${manifest.version}-edge.zip`;
  const outputPath = path.join(outputDir, fileName);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, archive);

  const result = {
    outputPath,
    version: manifest.version,
    archiveSize: archive.length,
    entries: entries.map(({ name, size }) => ({ name, size })),
  };

  if (!quiet) {
    console.log(`Created ${path.relative(rootDir, outputPath)}`);
    console.log(`${result.entries.length} files, ${result.archiveSize} bytes`);
  }

  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  buildExtensionPackage().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
