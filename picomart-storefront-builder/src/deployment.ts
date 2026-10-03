import {readFile} from 'node:fs/promises';
import type {Config} from './config.ts';

// Railway prevents overlapping active deployments on a service with a mounted
// volume. Check the actual mount, not merely a directory or caller-provided flag.
// This is a deployment constraint; durable application data remains on Bunny.
export async function assertDeploymentVolume(config: Config, readMounts = () => readFile('/proc/self/mountinfo', 'utf8')) {
  if (!config.requireDeploymentVolume) return;
  const mounts = await readMounts();
  if (!mounts.split('\n').some(line => line.split(' ')[4] === '/coordinator')) throw new Error('A Railway volume must be mounted at /coordinator before starting this coordinator');
}
