import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { rokuDeploy } from 'roku-deploy';
import { resolveConfig, friendlyError } from '../roku-config.js';

export type DeploySource = { kind: 'rootDir'; rootDir: string } | { kind: 'zip'; zipPath: string };

/**
 * Pick the deploy source from the tool params: exactly one of rootDir (package a project
 * folder) or zipPath (upload a prebuilt .zip). Pure: file existence is checked by the caller.
 */
export function validateDeploySource(params: { rootDir?: string; zipPath?: string }): DeploySource | { error: string } {
  const rootDir = params.rootDir?.trim() || undefined;
  const zipPath = params.zipPath?.trim() || undefined;
  if (rootDir && zipPath) {
    return { error: 'Provide either rootDir or zipPath, not both.' };
  }
  if (!rootDir && !zipPath) {
    return { error: 'Provide rootDir (project folder containing the manifest) or zipPath (a prebuilt .zip).' };
  }
  if (zipPath) {
    if (!path.isAbsolute(zipPath)) {
      return { error: `zipPath must be an absolute path: ${zipPath}` };
    }
    if (!zipPath.toLowerCase().endsWith('.zip')) {
      return { error: `zipPath must point to a .zip file: ${zipPath}` };
    }
    return { kind: 'zip', zipPath };
  }
  return { kind: 'rootDir', rootDir: rootDir! };
}

export function registerDeployTools(server: McpServer): void {
  server.registerTool(
    'roku_deploy',
    {
      description: 'Sideload (deploy) a Roku application to the device. Either packages the files in rootDir and uploads them, or uploads a prebuilt .zip given as zipPath (e.g. a project\'s own build output). Give exactly one of rootDir or zipPath. A running dev channel is replaced.',
      inputSchema: {
        host: z.string().optional().describe('IP address or hostname of the Roku device'),
        password: z.string().optional().describe('Developer password for the Roku device'),
        rootDir: z
          .string()
          .optional()
          .describe('Absolute path to the project root directory containing the manifest file. Mutually exclusive with zipPath.'),
        zipPath: z
          .string()
          .optional()
          .describe('Absolute path to a prebuilt .zip to sideload as-is (rootDir, files and stagingDir are ignored). Mutually exclusive with rootDir.'),
        files: z
          .array(z.string())
          .optional()
          .describe('Glob patterns for files to include. Defaults to all files in rootDir (**/*).'),
        stagingDir: z
          .string()
          .optional()
          .describe('Scratch folder roku-deploy empties, fills and deletes. Defaults to a unique temp folder; must not be rootDir.'),
      },
    },
    async (params) => {
      let outDir: string | undefined;
      try {
        const source = validateDeploySource(params);
        if ('error' in source) {
          return {
            content: [{ type: 'text', text: `Deploy failed: ${source.error}` }],
            isError: true,
          };
        }

        if (source.kind === 'zip') {
          try {
            const stat = await fs.stat(source.zipPath);
            if (!stat.isFile()) throw new Error('not a file');
          } catch {
            return {
              content: [{ type: 'text', text: `Deploy failed: No zip file found at ${source.zipPath}.` }],
              isError: true,
            };
          }
          const config = await resolveConfig(params);
          // Same as deploy(): clear the old channel first, ignoring failure (none installed).
          await rokuDeploy.deleteInstalledChannel({ host: config.host, password: config.password }).catch(() => undefined);
          // publish() uploads outDir/outFile; outFile keeps its .zip (getOutputZipFilePath only appends one when missing).
          await rokuDeploy.publish({
            host: config.host,
            password: config.password,
            outDir: path.dirname(source.zipPath),
            outFile: path.basename(source.zipPath),
          });
          return {
            content: [{ type: 'text', text: `Successfully deployed ${source.zipPath} to ${config.host}` }],
          };
        }

        const rootDir = source.rootDir;
        const manifestPath = path.join(rootDir, 'manifest');
        try {
          await fs.access(manifestPath);
        } catch {
          return {
            content: [{ type: 'text', text: `Deploy failed: No manifest file found at ${manifestPath}. The rootDir must point to the Roku project directory that contains the manifest file.` }],
            isError: true,
          };
        }

        // Explicit: otherwise roku-deploy picks stagingDir from a bsconfig.json/rokudeploy.json in cwd,
        // and when that equals rootDir (e.g. "dist") it empties then deletes the build being deployed.
        const stagingDir = path.resolve(params.stagingDir ?? path.join(os.tmpdir(), `roku-mcp-staging-${Date.now()}`));
        if (stagingDir === path.resolve(rootDir)) {
          return {
            content: [{ type: 'text', text: 'Deploy failed: stagingDir must not be the same folder as rootDir (roku-deploy empties and deletes it).' }],
            isError: true,
          };
        }
        const config = await resolveConfig(params);
        // Unique per call (not a fixed shared path in tmp); holds the zip and is removed afterwards.
        outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'roku-mcp-deploy-'));
        const deployOptions: Record<string, unknown> = {
          host: config.host,
          password: config.password,
          rootDir,
          outDir,
          stagingDir,
          files: params.files && params.files.length > 0 ? params.files : ['**/*'],
          retainStagingDir: false,
        };

        await rokuDeploy.deploy(deployOptions);
        return {
          content: [{ type: 'text', text: `Successfully deployed app from ${rootDir} to ${config.host}` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Deploy failed: ${friendlyError(error, 'device-web')}` }],
          isError: true,
        };
      } finally {
        if (outDir) {
          await fs.rm(outDir, { recursive: true, force: true }).catch(() => undefined);
        }
      }
    }
  );

  server.registerTool(
    'roku_delete_dev_channel',
    {
      description: 'Delete the currently sideloaded developer channel from the Roku device.',
      inputSchema: {
        host: z.string().optional().describe('IP address or hostname of the Roku device'),
        password: z.string().optional().describe('Developer password for the Roku device'),
      },
    },
    async (params) => {
      try {
        const config = await resolveConfig(params);
        await rokuDeploy.deleteInstalledChannel({
          host: config.host,
          password: config.password,
        });
        return {
          content: [{ type: 'text', text: `Successfully deleted dev channel from ${config.host}` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Delete dev channel failed: ${friendlyError(error, 'device-web')}` }],
          isError: true,
        };
      }
    }
  );
}
