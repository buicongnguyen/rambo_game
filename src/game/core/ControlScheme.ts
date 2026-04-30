export interface ControlScheme {
  id: 1 | 2;
  callsign: string;
  accent: string;
  tint: number;
  keys: {
    up: string;
    down: string;
    left: string;
    right: string;
    crouch: string;
    jump: string;
    fire: string;
    special: string;
  };
}

export const CONTROL_SCHEMES: Record<1 | 2, ControlScheme> = {
  1: {
    id: 1,
    callsign: 'P1',
    accent: '#efb648',
    tint: 0xefb648,
    keys: {
      up: 'W',
      down: 'S',
      left: 'A',
      right: 'D',
      crouch: 'Q',
      jump: 'R',
      fire: 'F',
      special: 'G',
    },
  },
  2: {
    id: 2,
    callsign: 'P2',
    accent: '#6dd7d9',
    tint: 0x6dd7d9,
    keys: {
      up: 'UP',
      down: 'DOWN',
      left: 'LEFT',
      right: 'RIGHT',
      crouch: 'J',
      jump: 'I',
      fire: 'L',
      special: 'K',
    },
  },
};

export function describeControls(scheme: ControlScheme): string {
  return `${scheme.keys.up}/${scheme.keys.left}/${scheme.keys.down}/${scheme.keys.right} move, ${scheme.keys.crouch} change gun, ${scheme.keys.jump} jump, ${scheme.keys.fire} fire, ${scheme.keys.special} air strike`;
}
