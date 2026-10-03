import test from 'node:test';
import assert from 'node:assert/strict';
import {assertDeploymentVolume} from '../src/deployment.ts';
import {loadConfig} from '../src/config.ts';

test('hosted coordinator requires its actual exclusive-deployment volume; local development does not', async () => {
  const config = loadConfig({BUILDER_REQUIRE_DEPLOYMENT_VOLUME: 'true'});
  await assert.rejects(assertDeploymentVolume(config, async () => '1 2 3 / / rw - overlay overlay rw\n'), /volume must be mounted/);
  await assert.rejects(assertDeploymentVolume(config, async () => '1 2 3 / /coordinator-other rw - ext4 disk rw\n'), /volume must be mounted/);
  await assertDeploymentVolume(config, async () => '1 2 3 / /coordinator rw - ext4 disk rw\n');
  await assertDeploymentVolume(loadConfig(), async () => { throw new Error('Local development must not require Linux mount information'); });
});
