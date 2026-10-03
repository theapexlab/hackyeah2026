import {
  Button,
  Divider,
  Group,
  NumberInput,
  Slider,
  Stack,
  Switch,
  TextInput,
} from '@mantine/core';
import { DEFAULT_WORLD_CONFIG } from '@pomoc/core';
import { IconDice } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import { playback } from '../../sim/playback';
import { useSimStore } from '../../sim/store';
import { useUIStore } from '../../ui/store';

export function ConfigPanel() {
  const [config, setConfig] = useState({
    width: 1000,
    height: 700,
    mobiles: 40,
    routers: 25,
    gateways: 2,
    mobileRange: 60,
    routerRange: 120,
    gatewayRange: 150,
    unregisteredFraction: 0.1,
    batteryBackedRouterFraction: 0.3,
    seed: 42,
    mobility: false,
  });

  const createWorld = useSimStore((s) => s.createWorld);
  const setPlaying = useUIStore((s) => s.setPlaying);

  const handleGenerate = useCallback(() => {
    const worldConfig = {
      seed: config.seed,
      width: config.width,
      height: config.height,
      mobiles: config.mobiles,
      routers: config.routers,
      gateways: config.gateways,
      range: {
        mobile: config.mobileRange,
        router: config.routerRange,
        gateway: config.gatewayRange,
      },
      unregisteredFraction: config.unregisteredFraction,
      batteryBackedRouterFraction: config.batteryBackedRouterFraction,
      gatewayBackhaul: 'satellite' as const,
    };

    createWorld(worldConfig);
    setPlaying(false);
    playback.stop();
  }, [config, createWorld, setPlaying]);

  const handleReset = useCallback(() => {
    const worldConfig = {
      seed: config.seed,
      width: config.width,
      height: config.height,
      mobiles: config.mobiles,
      routers: config.routers,
      gateways: config.gateways,
      range: {
        mobile: config.mobileRange,
        router: config.routerRange,
        gateway: config.gatewayRange,
      },
      unregisteredFraction: config.unregisteredFraction,
      batteryBackedRouterFraction: config.batteryBackedRouterFraction,
      gatewayBackhaul: 'satellite' as const,
    };

    createWorld(worldConfig);
  }, [config, createWorld]);

  const handleRandomSeed = () => {
    setConfig((prev) => ({
      ...prev,
      seed: Math.floor(Math.random() * 1000000),
    }));
  };

  return (
    <Stack gap="md" p="md">
      <div>
        <h3 style={{ margin: '0 0 1rem 0' }}>Configuration</h3>

        <Stack gap="sm">
          <NumberInput
            label="Width"
            value={config.width}
            onChange={(val) => setConfig((prev) => ({ ...prev, width: Number(val) || 1000 }))}
          />
          <NumberInput
            label="Height"
            value={config.height}
            onChange={(val) => setConfig((prev) => ({ ...prev, height: Number(val) || 700 }))}
          />

          <Divider />

          <NumberInput
            label="Mobile nodes"
            value={config.mobiles}
            onChange={(val) => setConfig((prev) => ({ ...prev, mobiles: Number(val) || 40 }))}
          />
          <Slider
            label="Mobile range"
            value={config.mobileRange}
            onChange={(val) => setConfig((prev) => ({ ...prev, mobileRange: val }))}
            min={30}
            max={200}
          />

          <NumberInput
            label="Router nodes"
            value={config.routers}
            onChange={(val) => setConfig((prev) => ({ ...prev, routers: Number(val) || 25 }))}
          />
          <Slider
            label="Router range"
            value={config.routerRange}
            onChange={(val) => setConfig((prev) => ({ ...prev, routerRange: val }))}
            min={50}
            max={300}
          />

          <NumberInput
            label="Gateway nodes"
            value={config.gateways}
            onChange={(val) => setConfig((prev) => ({ ...prev, gateways: Number(val) || 2 }))}
          />
          <Slider
            label="Gateway range"
            value={config.gatewayRange}
            onChange={(val) => setConfig((prev) => ({ ...prev, gatewayRange: val }))}
            min={50}
            max={300}
          />

          <Divider />

          <Slider
            label="Unregistered fraction"
            value={config.unregisteredFraction}
            onChange={(val) => setConfig((prev) => ({ ...prev, unregisteredFraction: val }))}
            min={0}
            max={1}
            step={0.05}
          />

          <Switch
            label="Random walk"
            checked={config.mobility}
            onChange={(e) => setConfig((prev) => ({ ...prev, mobility: e.currentTarget.checked }))}
          />

          <Divider />

          <Group gap="xs">
            <TextInput
              label="Seed"
              value={config.seed.toString()}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, seed: parseInt(e.target.value) || 0 }))
              }
              style={{ flex: 1 }}
            />
            <Button onClick={handleRandomSeed} variant="light" size="xs" style={{ marginTop: 24 }}>
              <IconDice size={16} />
            </Button>
          </Group>

          <Group grow>
            <Button onClick={handleGenerate} fullWidth>
              Generate
            </Button>
            <Button onClick={handleReset} variant="light" fullWidth>
              Reset
            </Button>
          </Group>
        </Stack>
      </div>
    </Stack>
  );
}
