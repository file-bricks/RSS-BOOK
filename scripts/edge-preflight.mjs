import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildExtensionPackage, isExcludedPackageArtifact } from "./package-extension.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_EXTENSION_NAME_LENGTH = 75;
const MAX_EXTENSION_DESCRIPTION_LENGTH = 132;

function resolveMessage(value, messages) {
  const raw = typeof value === "string" ? value : "";
  const match = /^__MSG_(.+)__$/.exec(raw);
  if (!match) {
    return raw.trim();
  }
  const msg = messages?.[match[1]]?.message;
  return typeof msg === "string" ? msg.replaceAll("$$", "$").trim() : "";
}

function validateSafeReportFileName(fileName) {
  if (
    typeof fileName !== "string" ||
    !fileName.trim() ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName === "." ||
    fileName === ".." ||
    path.basename(fileName) !== fileName
  ) {
    throw new Error(`Invalid reportFile name: ${fileName}`);
  }
  return fileName;
}

async function writeTextAtomic(targetPath, content) {
  try {
    const existing = await fs.stat(targetPath);
    if (existing.isDirectory()) {
      throw new Error(`Report output path is an existing directory: ${targetPath}`);
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  const tempPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempPath, content, "utf8");
    await fs.rename(tempPath, targetPath);
  } catch (err) {
    await fs.unlink(tempPath).catch(() => {});
    throw err;
  }
}

async function readJson(rootDir, relativePath) {
  const text = await fs.readFile(path.join(rootDir, relativePath), "utf8");
  return JSON.parse(text);
}

async function assertReadableFile(rootDir, relativePath) {
  const stat = await fs.stat(path.join(rootDir, relativePath));
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error(`Required Edge preflight file is missing or empty: ${relativePath}`);
  }
  return stat.size;
}

async function pngSize(rootDir, relativePath) {
  const buffer = await fs.readFile(path.join(rootDir, relativePath));
  if (
    buffer.length < 24 ||
    !buffer.subarray(0, 8).equals(PNG_SIGNATURE) ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new Error(`Expected PNG asset: ${relativePath}`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid PNG dimensions in asset: ${relativePath}`);
  }
  return { width, height };
}

async function collectStoreScreenshots(rootDir) {
  const assetNames = await fs.readdir(path.join(rootDir, "assets"));
  const screenshots = assetNames
    .filter((name) => /^screenshot-\d+-.*\.png$/i.test(name) && !isExcludedPackageArtifact(name))
    .sort()
    .map((name) => path.join("assets", name).split(path.sep).join("/"));

  if (screenshots.length < 3) {
    throw new Error("Edge preflight requires at least three store screenshots.");
  }

  const checked = [];
  for (const relativePath of screenshots) {
    const size = await pngSize(rootDir, relativePath);
    if (size.width !== 1280 || size.height !== 800) {
      throw new Error(`Store screenshot must be 1280x800: ${relativePath}`);
    }
    checked.push({ path: relativePath, ...size });
  }
  return checked;
}

async function validateLocales(rootDir, defaultLocale, manifest) {
  if (typeof defaultLocale !== "string" || !defaultLocale.trim()) {
    throw new Error("Manifest default_locale must be a non-empty string.");
  }

  const localesDir = path.join(rootDir, "_locales");
  const entries = await fs.readdir(localesDir, { withFileTypes: true });
  const localeDirs = entries
    .filter((entry) => entry.isDirectory() && !isExcludedPackageArtifact(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (!localeDirs.includes(defaultLocale)) {
    throw new Error(`Default locale "${defaultLocale}" missing from _locales.`);
  }

  const defaultMessages = await readJson(rootDir, `_locales/${defaultLocale}/messages.json`);
  const canonicalKeys = Object.keys(defaultMessages).sort();

  for (const locale of localeDirs) {
    const locMessages = await readJson(rootDir, `_locales/${locale}/messages.json`);
    const locKeys = Object.keys(locMessages).sort();
    if (canonicalKeys.length !== locKeys.length || !canonicalKeys.every((k, i) => k === locKeys[i])) {
      throw new Error(`Locale "${locale}" message keys do not match default locale "${defaultLocale}".`);
    }

    const resolvedName = resolveMessage(manifest.name, locMessages);
    const resolvedDescription = resolveMessage(manifest.description, locMessages);
    if (!resolvedName || !resolvedDescription) {
      throw new Error(`Locale "${locale}" listing name and description must not be empty.`);
    }
    if (resolvedName.length > MAX_EXTENSION_NAME_LENGTH) {
      throw new Error(
        `Locale "${locale}" extName exceeds ${MAX_EXTENSION_NAME_LENGTH} characters (${resolvedName.length}).`
      );
    }
    if (resolvedDescription.length > MAX_EXTENSION_DESCRIPTION_LENGTH) {
      throw new Error(
        `Locale "${locale}" extDescription exceeds ${MAX_EXTENSION_DESCRIPTION_LENGTH} characters (${resolvedDescription.length}).`
      );
    }
  }

  return localeDirs;
}

function renderReport(result) {
  const lines = [
    "# RSS-BOOK Edge Add-ons Preflight",
    "",
    `Status: ${result.status}`,
    `Version: ${result.version}`,
    `Package: ${result.package.relativePath}`,
    `Package files: ${result.package.fileCount}`,
    `Package bytes: ${result.package.bytes}`,
    "",
    "## Listing",
    "",
    `Name: ${result.listing.name}`,
    `Short description: ${result.listing.description}`,
    `Locales: ${result.locales.join(", ")} (${result.locales.length})`,
    `Privacy file: ${result.listing.privacyPolicy}`,
    "",
    "## Store Assets",
    "",
    `Icon: ${result.assets.storeIcon.path} (${result.assets.storeIcon.width}x${result.assets.storeIcon.height})`,
    `Screenshots: ${result.assets.screenshots.length}`,
    ...result.assets.screenshots.map((shot) => `- ${shot.path} (${shot.width}x${shot.height})`),
    "",
    "## Next Manual Steps",
    "",
    "1. Upload the ZIP in Microsoft Partner Center.",
    "2. Paste the listing text and privacy-policy URL from the repository.",
    "3. Run the manual browser smoke on Edge after submission packaging.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export async function runEdgePreflight({
  rootDir = projectRoot,
  outputDir = path.join(rootDir, "dist"),
  reportFile = "EDGE_ADDONS_PREFLIGHT.md",
  writeReport = true,
  quiet = false,
} = {}) {
  const safeReportFile = validateSafeReportFileName(reportFile);
  const manifest = await readJson(rootDir, "manifest.json");
  const packageJson = await readJson(rootDir, "package.json");
  const locales = await validateLocales(rootDir, manifest.default_locale, manifest);
  const messages = await readJson(rootDir, `_locales/${manifest.default_locale}/messages.json`);

  if (manifest.manifest_version !== 3) {
    throw new Error("Edge preflight requires Manifest V3.");
  }
  if (manifest.version !== packageJson.version) {
    throw new Error(`Version mismatch: manifest ${manifest.version} != package ${packageJson.version}`);
  }

  const privacyBytes = await assertReadableFile(rootDir, "PRIVACY_POLICY.md");
  const storeIconSize = await pngSize(rootDir, "icons/300.png");
  if (storeIconSize.width !== 300 || storeIconSize.height !== 300) {
    throw new Error("Edge store icon must be 300x300.");
  }

  const screenshots = await collectStoreScreenshots(rootDir);
  const packageResult = await buildExtensionPackage({ rootDir, outputDir, quiet: true });

  const result = {
    status: "OK",
    version: manifest.version,
    locales,
    package: {
      path: packageResult.outputPath,
      relativePath: path.relative(rootDir, packageResult.outputPath).split(path.sep).join("/"),
      fileCount: packageResult.entries.length,
      bytes: packageResult.archiveSize,
    },
    listing: {
      name: resolveMessage(manifest.name, messages),
      description: resolveMessage(manifest.description, messages),
      privacyPolicy: "PRIVACY_POLICY.md",
      privacyBytes,
    },
    assets: {
      storeIcon: { path: "icons/300.png", ...storeIconSize },
      screenshots,
    },
  };

  if (!result.listing.name || !result.listing.description) {
    throw new Error("Edge listing name and description must resolve from locale messages.");
  }

  if (writeReport) {
    await fs.mkdir(outputDir, { recursive: true });
    await writeTextAtomic(path.join(outputDir, safeReportFile), renderReport(result));
  }

  if (!quiet) {
    console.log(`Edge preflight ${result.status}: ${result.package.relativePath}`);
    if (writeReport) {
      console.log(`Report: ${path.posix.join(path.relative(rootDir, outputDir).split(path.sep).join("/"), safeReportFile)}`);
    }
  }

  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  runEdgePreflight().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
