/** Tabler icon components per node kind. React-only; kept out of theme/tokens.ts on purpose. */
import type { NodeKind, TravelMode } from '@pomoc/core';
import {
  type Icon,
  IconBike,
  IconCar,
  IconDeviceMobile,
  IconRouter,
  IconSatellite,
  IconShieldCheck,
  IconWalk,
} from '@tabler/icons-react';

export const KIND_ICON: Readonly<Record<NodeKind, Icon>> = {
  mobile: IconDeviceMobile,
  router: IconRouter,
  gateway: IconSatellite,
};

/** A phone on the move shows how its owner travels instead of the phone icon. */
export const TRAVEL_ICON: Readonly<Record<TravelMode, Icon>> = {
  foot: IconWalk,
  bike: IconBike,
  car: IconCar,
};

export const AUTHORITY_ICON: Icon = IconShieldCheck;
