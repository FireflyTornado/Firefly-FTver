import { spawn } from "node:child_process";
import {
	access,
	copyFile,
	mkdir,
	readFile,
	rename,
	rm,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postject from "postject";

const SEA_RESOURCE_NAME = "NODE_SEA_BLOB";
const SEA_SENTINEL_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

const agentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(agentDirectory, "../..");
const releaseDirectory = resolve(repositoryRoot, "release/presence-agent");
const temporaryDirectory = resolve(repositoryRoot, ".temp/presence-agent");
const stagingReleaseDirectory = resolve(temporaryDirectory, "release-staging");
const releaseBackupDirectory = resolve(temporaryDirectory, "release-backup");
const entryPath = resolve(agentDirectory, "index.ts");
const temporaryBundlePath = resolve(temporaryDirectory, "agent.cjs");
const bundleReleasePath = resolve(releaseDirectory, "agent.cjs");
const seaConfigPath = resolve(agentDirectory, "sea-config.json");
const readmePath = resolve(agentDirectory, "README.md");
const exampleConfigPath = resolve(agentDirectory, "config.example.json");
const iconDirectory = resolve(agentDirectory, "assets");
const seaBlobPath = resolve(temporaryDirectory, "sea-prep.blob");
const executablePath = resolve(stagingReleaseDirectory, "NightbugPresence.exe");
const trayProjectPath = resolve(
	agentDirectory,
	"tray-helper/NightbugPresenceTray.csproj",
);
const trayPublishDirectory = resolve(temporaryDirectory, "tray-publish");
const trayBuildPath = resolve(trayPublishDirectory, "NightbugPresenceTray.exe");
const trayExecutablePath = resolve(
	stagingReleaseDirectory,
	"NightbugPresenceTray.exe",
);
const releaseReadmePath = resolve(stagingReleaseDirectory, "README.md");
const releaseExampleConfigPath = resolve(
	stagingReleaseDirectory,
	"config.example.json",
);
const trayBinDirectory = resolve(agentDirectory, "tray-helper/bin");
const trayObjDirectory = resolve(agentDirectory, "tray-helper/obj");
const bundleOnly = process.argv.includes("--bundle-only");
const keepBuildArtifacts = ["1", "true"].includes(
	(process.env.PRESENCE_KEEP_BUILD_ARTIFACTS ?? "").trim().toLowerCase(),
);

function assertBuildPath(targetPath) {
	const pathFromRoot = relative(repositoryRoot, targetPath);
	if (
		!pathFromRoot ||
		pathFromRoot.startsWith("..") ||
		isAbsolute(pathFromRoot)
	) {
		throw new Error(`Unsafe Presence Agent build path: ${targetPath}`);
	}
}

async function removeBuildDirectory(targetPath) {
	assertBuildPath(targetPath);
	await rm(targetPath, {
		recursive: true,
		force: true,
		maxRetries: 5,
		retryDelay: 200,
	});
}

async function removeBuildFile(targetPath) {
	assertBuildPath(targetPath);
	await rm(targetPath, { force: true });
}

async function pathExists(targetPath) {
	try {
		await access(targetPath);
		return true;
	} catch {
		return false;
	}
}

async function cleanupIntermediateArtifacts() {
	if (keepBuildArtifacts) {
		console.log(
			"[Presence Build] Keeping intermediate build artifacts for debugging.",
		);
		return;
	}

	console.log("[Presence Build] Cleaning intermediate build artifacts...");
	const targets = [
		{ path: temporaryDirectory, label: ".temp/presence-agent" },
		{ path: trayBinDirectory, label: "tray-helper/bin" },
		{ path: trayObjDirectory, label: "tray-helper/obj" },
	];
	for (const target of targets) {
		if (!(await pathExists(target.path))) continue;
		try {
			await removeBuildDirectory(target.path);
			console.log(`[Presence Build] Removed ${target.label}`);
		} catch {
			console.warn(
				`[Presence Build] Warning: failed to remove temporary directory: ${target.path}`,
			);
		}
	}
	console.log("[Presence Build] Build cleanup complete.");
}

async function commitStagedRelease() {
	assertBuildPath(releaseDirectory);
	assertBuildPath(stagingReleaseDirectory);
	assertBuildPath(releaseBackupDirectory);
	await mkdir(dirname(releaseDirectory), { recursive: true });
	await removeBuildDirectory(releaseBackupDirectory);

	let oldReleaseMoved = false;
	try {
		if (await pathExists(releaseDirectory)) {
			await rename(releaseDirectory, releaseBackupDirectory);
			oldReleaseMoved = true;
		}
		await rename(stagingReleaseDirectory, releaseDirectory);
	} catch (error) {
		if (oldReleaseMoved && !(await pathExists(releaseDirectory))) {
			try {
				await rename(releaseBackupDirectory, releaseDirectory);
			} catch (rollbackError) {
				throw new AggregateError(
					[error, rollbackError],
					"Presence release commit failed and the previous release could not be restored.",
				);
			}
		}
		throw error;
	}

	if (oldReleaseMoved) {
		try {
			await removeBuildDirectory(releaseBackupDirectory);
		} catch {
			console.warn(
				`[Presence Build] Warning: failed to remove temporary directory: ${releaseBackupDirectory}`,
			);
		}
	}
}

function isValidIcon(data) {
	if (
		data.length < 22 ||
		data.readUInt16LE(0) !== 0 ||
		data.readUInt16LE(2) !== 1
	) {
		return false;
	}

	const imageCount = data.readUInt16LE(4);
	const directoryEnd = 6 + imageCount * 16;
	if (imageCount === 0 || directoryEnd > data.length) return false;

	for (let index = 0; index < imageCount; index++) {
		const entryOffset = 6 + index * 16;
		const imageSize = data.readUInt32LE(entryOffset + 8);
		const imageOffset = data.readUInt32LE(entryOffset + 12);
		if (
			imageSize === 0 ||
			imageOffset < directoryEnd ||
			imageOffset + imageSize > data.length
		) {
			return false;
		}
	}
	return true;
}

async function loadOptionalIcon() {
	const path = resolve(iconDirectory, "icon.ico");
	try {
		const data = await readFile(path);
		if (isValidIcon(data)) {
			console.log(`[Presence Build] Using optional icon: ${path}`);
			return { path };
		}
		console.warn(
			"[Presence Build] Optional icon.ico is invalid, using default icon.",
		);
	} catch (error) {
		if (error?.code === "ENOENT") {
			console.warn(
				"[Presence Build] Optional icon.ico not found, using default icon.",
			);
		} else {
			console.warn(
				"[Presence Build] Optional icon.ico could not be read, using default icon.",
			);
		}
	}
	return null;
}

async function bundleAgent(outputPath) {
	await build({
		entryPoints: [entryPath],
		bundle: true,
		platform: "node",
		format: "cjs",
		target: "node24",
		outfile: outputPath,
		minify: false,
		sourcemap: false,
		logLevel: "info",
	});
}

async function runNode(arguments_) {
	await new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(process.execPath, arguments_, {
			cwd: repositoryRoot,
			stdio: "inherit",
			windowsHide: true,
		});
		child.once("error", rejectPromise);
		child.once("exit", (code, signal) => {
			if (code === 0) {
				resolvePromise();
				return;
			}
			rejectPromise(
				new Error(
					`Node SEA blob generation failed (${signal ?? `exit code ${code}`})`,
				),
			);
		});
	});
}

async function ensureDotnetSdk() {
	const output = await new Promise((resolvePromise, rejectPromise) => {
		const child = spawn("dotnet", ["--list-sdks"], {
			cwd: repositoryRoot,
			windowsHide: true,
			stdio: ["ignore", "pipe", "ignore"],
		});
		let stdout = "";
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.once("error", rejectPromise);
		child.once("exit", (code) => {
			if (code === 0) resolvePromise(stdout.trim());
			else rejectPromise(new Error(`dotnet exited with code ${code}`));
		});
	}).catch(() => "");
	const hasNet8OrNewer = output
		.split(/\r?\n/)
		.some((line) => Number.parseInt(line, 10) >= 8);
	if (!hasNet8OrNewer) {
		throw new Error(".NET SDK is required to build NightbugPresenceTray.exe");
	}
}

async function publishTray(icon) {
	const runPublish = async (useIcon) => {
		const arguments_ = [
			"publish",
			trayProjectPath,
			"--configuration",
			"Release",
			"--runtime",
			"win-x64",
			"--self-contained",
			"true",
			"--output",
			trayPublishDirectory,
			"-p:PublishSingleFile=true",
			`-p:UsePresenceIcon=${useIcon ? "true" : "false"}`,
		];
		await new Promise((resolvePromise, rejectPromise) => {
			const child = spawn("dotnet", arguments_, {
				cwd: agentDirectory,
				stdio: "inherit",
				windowsHide: true,
			});
			child.once("error", rejectPromise);
			child.once("exit", (code, signal) => {
				if (code === 0) resolvePromise();
				else
					rejectPromise(
						new Error(`Tray publish failed (${signal ?? `exit code ${code}`})`),
					);
			});
		});
	};

	if (icon) {
		try {
			await runPublish(true);
		} catch {
			console.warn(
				"[Presence Build] Optional icon.ico could not be applied, using default icon.",
			);
			await removeBuildDirectory(trayPublishDirectory);
			await runPublish(false);
		}
	} else {
		await runPublish(false);
	}
	await copyFile(trayBuildPath, trayExecutablePath);
}

async function buildBundleOnly() {
	await removeBuildFile(bundleReleasePath);
	await removeBuildDirectory(temporaryDirectory);
	await mkdir(releaseDirectory, { recursive: true });
	await loadOptionalIcon();
	await bundleAgent(bundleReleasePath);
	console.log(`[Presence Build] Bundle: ${bundleReleasePath}`);
}

async function buildExecutable() {
	if (process.platform !== "win32" || process.arch !== "x64") {
		throw new Error(
			"NightbugPresence EXE build is currently supported on Windows x64 only.",
		);
	}

	await ensureDotnetSdk();
	await mkdir(temporaryDirectory, { recursive: true });
	await mkdir(stagingReleaseDirectory, { recursive: true });

	const icon = await loadOptionalIcon();
	console.log("[Presence Build] Bundling Agent with esbuild...");
	await bundleAgent(temporaryBundlePath);

	console.log("[Presence Build] Generating Node SEA blob...");
	await runNode(["--experimental-sea-config", seaConfigPath]);

	console.log(`[Presence Build] Copying Node executable: ${process.execPath}`);
	await copyFile(process.execPath, executablePath);

	console.log("[Presence Build] Injecting SEA blob with postject...");
	await postject.inject(
		executablePath,
		SEA_RESOURCE_NAME,
		await readFile(seaBlobPath),
		{ sentinelFuse: SEA_SENTINEL_FUSE },
	);

	console.log("[Presence Build] Publishing native Windows Tray helper...");
	await publishTray(icon);
	await copyFile(readmePath, releaseReadmePath);
	await copyFile(exampleConfigPath, releaseExampleConfigPath);
	await commitStagedRelease();

	console.log(
		`[Presence Build] EXE: ${resolve(releaseDirectory, "NightbugPresence.exe")}`,
	);
	console.log(
		`[Presence Build] Tray: ${resolve(releaseDirectory, "NightbugPresenceTray.exe")}`,
	);
}

if (bundleOnly) {
	await buildBundleOnly();
} else {
	await removeBuildDirectory(temporaryDirectory);
	try {
		await buildExecutable();
	} finally {
		await cleanupIntermediateArtifacts();
	}
}
