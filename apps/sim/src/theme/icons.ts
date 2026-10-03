/** Tabler icon components per node kind. React-only; kept out of theme/tokens.ts on purpose. */
import type { NodeKind } from '@pomoc/core';
import {
  type Icon,
  IconDeviceMobile,
  IconRouter,
  IconSatellite,
  IconShieldCheck,
} from '@tabler/icons-react';

export const KIND_ICON: Readonly<Record<NodeKind, Icon>> = {
  mobile: IconDeviceMobile,
  router: IconRouter,
  gateway: IconSatellite,
};

export const AUTHORITY_ICON: Icon = IconShieldCheck;
