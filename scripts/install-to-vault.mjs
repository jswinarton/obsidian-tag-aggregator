import { copyFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = "tag-aggregator";
const FILES_TO_COPY = ["manifest.json", "main.js", "styles.css"];

const vaultPath = process.argv[2];

if (!vaultPath) {
	console.error("Usage: npm run install-to-vault -- /path/to/your/vault");
	process.exit(1);
}

const resolvedVault = resolve(vaultPath);
const obsidianDir = join(resolvedVault, ".obsidian");

if (!existsSync(obsidianDir)) {
	console.error(`No .obsidian/ folder found at ${resolvedVault} -- is this an Obsidian vault?`);
	console.error("(Open the folder as a vault in Obsidian at least once first.)");
	process.exit(1);
}

const pluginDir = join(obsidianDir, "plugins", PLUGIN_ID);
mkdirSync(pluginDir, { recursive: true });

for (const file of FILES_TO_COPY) {
	const src = join(REPO_ROOT, file);
	if (!existsSync(src)) {
		console.error(`Missing ${file} in repo root -- run "npm run build" first.`);
		process.exit(1);
	}
	copyFileSync(src, join(pluginDir, file));
}

console.log(`Installed ${PLUGIN_ID} into ${pluginDir}`);
console.log("If Obsidian is already open on this vault, reload the plugin (toggle it off/on in");
console.log("Settings -> Community plugins) or restart Obsidian to pick up the change.");
