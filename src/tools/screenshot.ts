import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { rokuDeploy } from 'roku-deploy';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { resolveConfig, friendlyError } from '../roku-config.js';

/**
 * Resolve where roku-deploy's takeScreenshot will write. It joins outDir + outFile + ext,
 * so an absolute or nested outFile produced paths like ./private/tmp/... ; reject those.
 */
export function resolveScreenshotTarget(params: { outDir?: string; outFile?: string }): { outDir: string; outFile?: string } | { error: string } {
  const outDir = path.resolve(params.outDir?.trim() || os.tmpdir());
  const outFile = params.outFile?.trim() || undefined;
  if (outFile !== undefined) {
    if (path.isAbsolute(outFile) || /[\\/]/.test(outFile)) {
      return { error: `outFile must be a bare filename without a path (put the folder in outDir): ${outFile}` };
    }
    if (outFile === '.' || outFile === '..') {
      return { error: `outFile must be a filename: ${outFile}` };
    }
  }
  return { outDir, outFile };
}

export function registerScreenshotTools(server: McpServer): void {
  server.registerTool(
    'roku_screenshot',
    {
      description: 'Capture a screenshot of the current screen on the Roku device. A sideloaded dev channel must be running. Returns the image as base64-encoded content and the file path where it was saved.',
      inputSchema: {
        host: z.string().optional().describe('IP address or hostname of the Roku device'),
        password: z.string().optional().describe('Developer password for the Roku device'),
        outDir: z.string().optional().describe('Directory to save the screenshot. Defaults to OS temp directory.'),
        outFile: z.string().optional().describe('Base filename (without extension or folder; put the folder in outDir). Defaults to timestamped name.'),
      },
    },
    async (params) => {
      try {
        const target = resolveScreenshotTarget(params);
        if ('error' in target) {
          return {
            content: [{ type: 'text', text: `Screenshot failed: ${target.error}` }],
            isError: true,
          };
        }
        const config = await resolveConfig(params);
        const options: Record<string, unknown> = {
          host: config.host,
          password: config.password,
          outDir: target.outDir,
        };
        if (target.outFile) {
          options.outFile = target.outFile;
        }

        const filePath = await rokuDeploy.takeScreenshot(options as any);
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
        const imageBuffer = await fs.readFile(filePath);
        const base64 = imageBuffer.toString('base64');

        return {
          content: [
            {
              type: 'image' as const,
              data: base64,
              mimeType,
            },
            {
              type: 'text' as const,
              text: `Screenshot saved to: ${filePath}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Screenshot failed: ${friendlyError(error, 'device-web')}` }],
          isError: true,
        };
      }
    }
  );
}
