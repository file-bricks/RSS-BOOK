import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildExtensionPackage } from "./package-extension.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function resolveMessage(value, messages) {
  const match = /^__MSG_(.+)__$/.exec(value || "");
  if (!match) {
    return value || "";
  }
  return messages[match[1]]?.message || "";
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
  if (buffer.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`Expected PNG asset: ${relativePath}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function collectStoreScreenshots(rootDir) {
  const assetNames = await fs.readdir(path.join(rootDir, "assets"));
  const screenshots = assetNames
    .filter((name) => /^screenshot-\d+-.*\.png$/i.test(name))
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
  const manifest = await readJson(rootDir, "manifest.json");
  const packageJson = await readJson(rootDir, "package.json");
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
    await fs.writeFile(path.join(outputDir, reportFile), renderReport(result), "utf8");
  }

  if (!quiet) {
    console.log(`Edge preflight ${result.status}: ${result.package.relativePath}`);
    if (writeReport) {
      console.log(`Report: ${path.posix.join(path.relative(rootDir, outputDir).split(path.sep).join("/"), reportFile)}`);
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
