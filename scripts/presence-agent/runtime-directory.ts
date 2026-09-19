import { dirname, resolve } from "node:path";
import { isSea } from "node:sea";

/**
 * SEA 始终以真实 EXE 路径为准，避免快捷方式、任务计划程序或其他 cwd
 * 将配置文件写到错误目录。tsx 开发模式则使用入口脚本所在目录。
 */
export function getRuntimeDirectory(): string {
	if (isSea()) return dirname(process.execPath);

	const entryPath = process.argv[1];
	return entryPath ? dirname(resolve(entryPath)) : process.cwd();
}
