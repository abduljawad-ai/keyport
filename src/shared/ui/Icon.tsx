// Icon primitives: a thin, consistent wrapper around Phosphor icons plus an
// app-wide semantic registry.
//
// Standardizes size and stroke weight so every icon draws with the same
// optical register (the taste baseline's single global strokeWeight). Use
// `AppIcon` with an `IconKind` for app-level glyphs; pass a raw Phosphor icon
// component for one-off needs.

import type { SVGProps } from "react";
import {
  ArrowDown,
  CaretDown,
  CaretUp,
  ChatCircleDots,
  Check,
  Command,
  CompassRose,
  DotsThree,
  GearSix,
  Key,
  List,
  MagnifyingGlass,
  Plus,
  Stop,
  Warning,
  X,
  type Icon as PhosphorIcon,
  type IconWeight,
} from "@phosphor-icons/react";

/** Shared Phosphor stroke register used across the app. */
export const ICON_WEIGHT: IconWeight = "regular";
export const ICON_BOLD_WEIGHT: IconWeight = "bold";

export const DEFAULT_ICON_SIZE = 18;

export function Icon({
  icon: Cmp,
  size = DEFAULT_ICON_SIZE,
  weight = ICON_WEIGHT,
  className,
  ...rest
}: {
  icon?: PhosphorIcon | null;
  size?: number;
  weight?: IconWeight;
  className?: string;
} & SVGProps<SVGSVGElement>) {
  if (!Cmp) return null;
  return <Cmp width={size} height={size} weight={weight} className={className} {...rest} />;
}

/** Semantic app icon registry: a glyph change here updates the whole surface. */
export type IconKind =
  | "brand"
  | "settings"
  | "usage"
  | "search"
  | "provider"
  | "chat"
  | "notFound"
  | "actions"
  | "scrollDown"
  | "plus"
  | "stop"
  | "caretDown"
  | "caretUp"
  | "menu";

const KIND_MAP: Record<IconKind, PhosphorIcon> = {
  brand: Command,
  settings: GearSix,
  usage: CompassRose,
  search: MagnifyingGlass,
  provider: Key,
  chat: ChatCircleDots,
  notFound: CompassRose,
  actions: DotsThree,
  scrollDown: ArrowDown,
  plus: Plus,
  stop: Stop,
  caretDown: CaretDown,
  caretUp: CaretUp,
  menu: List,
};

export function AppIcon({
  kind,
  size = DEFAULT_ICON_SIZE,
  weight = ICON_WEIGHT,
  className,
  ...rest
}: {
  kind: IconKind | PhosphorIcon;
  size?: number;
  weight?: IconWeight;
  className?: string;
} & SVGProps<SVGSVGElement>) {
  const resolved = typeof kind === "string" ? KIND_MAP[kind] : kind;
  return <Icon icon={resolved} size={size} weight={weight} className={className} {...rest} />;
}

// Re-export the glyphs used across the app from one place.
export {
  ArrowDown,
  CaretDown,
  CaretUp,
  ChatCircleDots,
  Check,
  Command,
  CompassRose,
  DotsThree,
  GearSix,
  Key,
  List,
  MagnifyingGlass,
  Plus,
  Stop,
  Warning,
  X,
};
export type { PhosphorIcon, IconWeight };
