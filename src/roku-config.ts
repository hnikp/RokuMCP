import { discoverFirstHost } from './discovery.js';

export interface RokuDeviceConfig {
  host: string;
  password: string;
}

const NO_HOST_MESSAGE =
  'No Roku device found. Please provide the device IP as a parameter, set ROKU_DEVICE_HOST (or ROKU_DEV_TARGET) in your environment or .env file, or make sure a Roku device is powered on and connected to the same network.';
const NO_PASSWORD_MESSAGE =
  'Roku developer password is required. Please provide the password as a parameter or set ROKU_DEVICE_PASSWORD (or ROKU_DEVPASSWORD) in your environment or .env file.';

/** First value that is set and not blank. An MCP client may expand an unset `${user_config...}` to "". */
function firstSet(...values: (string | undefined)[]): string | undefined {
  for (const v of values) {
    if (v !== undefined && v.trim() !== '') return v.trim();
  }
  return undefined;
}

/**
 * Host from the param, then ROKU_DEVICE_HOST, then ROKU_DEV_TARGET (the roku-deploy /
 * BrighterScript convention). Returns undefined when none is set; callers fall back to SSDP.
 */
export function hostFromParamsOrEnv(params: { host?: string }, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return firstSet(params.host, env.ROKU_DEVICE_HOST, env.ROKU_DEV_TARGET);
}

/** Password from the param, then ROKU_DEVICE_PASSWORD, then ROKU_DEVPASSWORD. */
export function passwordFromParamsOrEnv(params: { password?: string }, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return firstSet(params.password, env.ROKU_DEVICE_PASSWORD, env.ROKU_DEVPASSWORD);
}

export async function resolveConfig(params: { host?: string; password?: string }): Promise<RokuDeviceConfig> {
  const host = hostFromParamsOrEnv(params) || await discoverFirstHost();
  const password = passwordFromParamsOrEnv(params);

  if (!host) {
    throw new Error(NO_HOST_MESSAGE);
  }
  if (!password) {
    throw new Error(NO_PASSWORD_MESSAGE);
  }

  return { host, password };
}

export async function resolveHost(params: { host?: string }): Promise<string> {
  const host = hostFromParamsOrEnv(params) || await discoverFirstHost();
  if (!host) {
    throw new Error(NO_HOST_MESSAGE);
  }
  return host;
}

/**
 * Which Roku service the failed request went to. The same status means different things:
 * a 403 from ECP (port 8060) is the network-access setting, while a 401/403 from the
 * device web server (port 80: deploy, screenshot) is the dev password or dev mode.
 */
export type ErrorContext = 'ecp' | 'device-web' | 'rta' | 'console';

export function friendlyError(error: unknown, context?: ErrorContext): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (context === 'ecp' && /403|forbidden/i.test(raw)) {
    return 'ECP request rejected (403) — the Roku is blocking control commands from the network. On the device open Settings → System → Advanced system settings → Control by mobile apps → Network access and set it to "Permissive" ("Limited" mode returns 403 for keypresses and other ECP commands).';
  }
  if (/401|unauthorized/i.test(raw)) {
    return 'Authentication failed — the Roku developer password is incorrect. Please provide the correct password.';
  }
  if (/403|forbidden/i.test(raw)) {
    return 'Access denied by the Roku device. Make sure Developer Mode is enabled and the password is correct.';
  }
  if (/ECONNREFUSED/i.test(raw)) {
    return `Connection refused — the Roku device is not reachable. Verify the IP address is correct and the device is powered on.`;
  }
  if (/ETIMEDOUT|ESOCKETTIMEDOUT|timeout/i.test(raw)) {
    return 'Connection timed out — the Roku device did not respond. Check that it is on the same network and not blocked by a firewall.';
  }
  if (/ENOTFOUND|getaddrinfo/i.test(raw)) {
    return `Could not resolve the Roku device hostname. Verify the host address is correct.`;
  }
  if (/No screen shot url/i.test(raw)) {
    return 'Screenshot failed — no sideloaded dev channel is currently running on the device. Deploy an app first.';
  }

  return raw;
}
